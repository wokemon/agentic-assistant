import crypto from "crypto";

import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";
import { tools } from "../tools/registry";
import { Message } from "../shared/types";
import { LoopGuard } from "../safety/loopGuards";
import { logger } from "../shared/logger";
import { executeToolCall } from "./executor";

const MAX_ITERATIONS = 10;

export async function runAgent(userInput: string) {
  const sessionId = crypto.randomUUID();

  const agentLogger = logger.child({
    component: "agent_loop",
    sessionId,
  });

  agentLogger.info(
    {
      userInput,
    },
    "Starting agent run",
  );

  const loopGuard = new LoopGuard();

  const history: Message[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: userInput,
    },
  ];

  let malformedCount = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    agentLogger.info(
      {
        iteration,
        historyLength: history.length,
      },
      "Starting loop iteration",
    );

    // ----------------------------
    // 1. GENERATE MODEL RESPONSE
    // ----------------------------

    const rawResponse = await generateResponse(history);

    agentLogger.debug(
      {
        rawResponse,
      },
      "Received model response",
    );

    history.push({
      role: "assistant",
      content: rawResponse,
    });

    // ----------------------------
    // 2. PARSE RESPONSE
    // ----------------------------

    const parsed = parseAgentResponse(rawResponse);

    // ----------------------------
    // 3. HANDLE PARSE FAILURES
    // ----------------------------

    if (!parsed.success) {
      malformedCount++;

      agentLogger.warn(
        {
          malformedCount,
          error: parsed.error,
        },
        "Failed to parse model response",
      );

      history.push({
        role: "system",
        content: "Your previous response was invalid. Return valid JSON only.",
      });

      if (malformedCount >= 3) {
        agentLogger.error(
          {
            malformedCount,
          },
          "Agent stopped due to repeated malformed responses",
        );

        return "Agent stopped: too many malformed responses.";
      }

      continue;
    }

    const response = parsed.data;

    // ----------------------------
    // 4. FINAL ANSWER
    // ----------------------------

    if (response.finalAnswer) {
      agentLogger.info(
        {
          finalAnswer: response.finalAnswer,
        },
        "Agent produced final answer",
      );

      return response.finalAnswer;
    }

    // ----------------------------
    // 5. TOOL EXECUTION
    // ----------------------------

    if (response.toolCall) {
      const { tool: toolName, args } = response.toolCall;

      agentLogger.info(
        {
          tool: toolName,
          args,
        },
        "Model requested tool execution",
      );

      // ----------------------------
      // TOOL EXISTS?
      // ----------------------------

      if (!tools[toolName]) {
        agentLogger.warn(
          {
            tool: toolName,
          },
          "Model requested unknown tool",
        );

        history.push({
          role: "system",
          content: `Tool "${toolName}" does not exist.`,
        });

        continue;
      }

      // ----------------------------
      // DUPLICATE DETECTION
      // ----------------------------

      if (loopGuard.isRepeating(toolName, args)) {
        agentLogger.warn(
          {
            tool: toolName,
            args,
          },
          "Loop guard triggered due to repeated tool call",
        );

        return `Agent stopped: repeating tool call detected (${toolName}).`;
      }

      loopGuard.addAction(toolName, args);

      // ----------------------------
      // EXECUTE TOOL
      // ----------------------------

      const result = await executeToolCall(toolName, args);

      history.push({
        role: "system",
        content: `Tool result:\n${JSON.stringify(result)}`,
      });
    }
  }

  agentLogger.warn(
    {
      maxIterations: MAX_ITERATIONS,
    },
    "Agent stopped due to max iterations",
  );

  return "Agent stopped: max iterations reached.";
}
