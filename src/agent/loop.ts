import crypto from "crypto";
import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { tools } from "../tools/registry";
import { LoopGuard } from "../safety/loopGuards";
import { logger } from "../shared/logger";
import { executeToolCall } from "./executor";
import { MessageHistory } from "./history";
import { WorkingMemory } from "../context/workingMemory";
import { buildContext } from "../context/contextBuilder";

const MAX_ITERATIONS = 10;

export async function runAgent(userInput: string) {
  const sessionId = crypto.randomUUID();
  const agentLogger = logger.child({ component: "agent_loop", sessionId });

  agentLogger.info({ userInput }, "Starting agent run");

  const loopGuard = new LoopGuard();

  // 1. Initialize the new architecture correctly
  const history = new MessageHistory();
  const memory = new WorkingMemory();

  let malformedCount = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // 2. Build the context dynamically BEFORE passing to the LLM
    const context = buildContext(history, memory, userInput);

    agentLogger.info(
      { iteration, contextLength: context.length },
      "Starting loop iteration",
    );

    let rawResponse: string;

    // 3. P0-2: Context Budget Enforcement
    try {
      rawResponse = await generateResponse(context);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ContextBudgetExceededError"
      ) {
        agentLogger.error("Agent stopped: Context budget exceeded.");
        return "Agent stopped: Context budget exceeded. Please refine your request or clear memory.";
      }
      throw error; // Re-throw unknown errors
    }

    const parsed = parseAgentResponse(rawResponse);

    if (!parsed.success) {
      malformedCount++;
      loopGuard.trackParseFailure();
      agentLogger.warn(
        { malformedCount, error: parsed.error },
        "Malformed response",
      );

      history.add(
        "system",
        `Your previous response was invalid (${parsed.error}). Return valid JSON only.`,
      );

      if (malformedCount >= 3) {
        agentLogger.error("Agent stopped due to repeated malformed responses.");
        return "Agent stopped: too many malformed responses.";
      }

      if (loopGuard.isRunaway()) {
        agentLogger.error("Agent detected runaway pattern");
        return "Agent stopped: runaway execution detected (repeated failures or parse errors).";
      }

      continue;
    }

    // Architectural Fix: Only store valid responses in history
    history.add("assistant", rawResponse);

    const response = parsed.data;

    if (response.finalAnswer) {
      // P1-3: Missing Final Logging
      agentLogger.info(
        { iterations: iteration + 1, finalAnswer: response.finalAnswer },
        "Agent completed successfully",
      );
      return response.finalAnswer;
    }

    if (response.toolCall) {
      const { tool: toolName, args } = response.toolCall;

      if (loopGuard.isRepeating(toolName, args)) {
        agentLogger.warn({ tool: toolName, args }, "Loop guard triggered");
        return `Agent stopped: repeating tool call detected (${toolName}).`;
      }
      loopGuard.addAction(toolName, args);

      // Populate Working Memory passively:
      if (toolName === "read_file_lines" || toolName === "read_files") {
        memory.addOpenedFile(args.path || args.paths?.[0]);
      }

      const result = await executeToolCall(toolName, args);

      if (!result.success) {
        loopGuard.trackFailure(toolName, args);

        if (loopGuard.isRepeatedlyFailing(toolName, args)) {
          agentLogger.warn({ tool: toolName }, "Tool repeatedly failing");
        }
      }

      // P0-1: Explicitly structure the output to avoid arbitrary object JSON bloat.
      // We rely entirely on the executor's truncation logic here.
      const formattedResult = result.success
        ? `Success:\n${result.output}`
        : `Error:\n${result.error}`;

      history.add("system", `Tool result:\n${formattedResult}`);
    }
  }

  // P1-3: Missing Final Logging
  agentLogger.info(
    { iterations: MAX_ITERATIONS },
    "Agent stopped due to max iterations",
  );
  return "Agent stopped: max iterations reached.";
}
