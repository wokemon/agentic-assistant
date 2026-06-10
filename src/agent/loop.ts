import { logger } from "../shared/logger";
import { generateResponse } from "../llm/client";
import { parseAgentResponse } from "./parser";
import { buildContext } from "../context/contextBuilder";
import { AgentRuntime } from "./runtime";
import { processToolCall } from "./processors/toolProcessor";
import { processMalformedResponse } from "./processors/malformedResponseProcessor";
import { validateFinalAnswer } from "./validators/finalAnswerValidator";
import type { AgentResult } from "../shared/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 10;

// ─── Agent Loop ───────────────────────────────────────────────────────────────

export async function runAgent(userInput: string): Promise<AgentResult> {
  const runtime = new AgentRuntime();
  const agentLogger = logger.child({
    component: "agent_loop",
    sessionId: runtime.sessionId,
  });

  agentLogger.info({ userInput }, "Starting agent run");

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    runtime.diagnostics.iterations = iteration + 1;

    const context = buildContext(runtime.history, runtime.memory, userInput);

    agentLogger.info(
      { iteration, contextLength: context.length },
      "Starting loop iteration",
    );

    // ── Call model ───────────────────────────────────────────────────────────

    let rawResponse: string;

    try {
      rawResponse = await generateResponse(context);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ContextBudgetExceededError"
      ) {
        agentLogger.error("Agent stopped: Context budget exceeded.");
        return {
          status: "context_budget_exceeded",
          diagnostics: runtime.diagnostics,
        };
      }
      throw error;
    }

    // ── Parse response ───────────────────────────────────────────────────────

    const parsed = parseAgentResponse(rawResponse);

    if (!parsed.success) {
      agentLogger.warn({ error: parsed.error }, "Malformed response");

      const outcome = processMalformedResponse(
        parsed.error,
        userInput,
        runtime,
      );

      if (outcome.kind === "abort") {
        agentLogger.error("Agent stopped due to repeated malformed responses.");
        return outcome.result;
      }

      continue;
    }

    const response = parsed.data;
    runtime.history.add("assistant", rawResponse);

    // ── Dispatch: final answer ───────────────────────────────────────────────

    if ("finalAnswer" in response) {
      const validation = validateFinalAnswer({
        userInput,
        finalAnswer: response.finalAnswer,
        state: runtime.state,
        memory: runtime.memory,
        toolCalls: runtime.diagnostics.toolCalls,
      });

      if (!validation.valid) {
        agentLogger.warn(
          { finalAnswer: response.finalAnswer },
          "Final answer rejected by validator",
        );
        runtime.history.add("system", validation.message!);
        continue;
      }

      agentLogger.info(
        { iterations: iteration + 1, finalAnswer: response.finalAnswer },
        "Agent completed successfully",
      );

      return {
        status: "completed",
        finalAnswer: response.finalAnswer,
        diagnostics: runtime.diagnostics,
      };
    }

    // ── Dispatch: tool call ──────────────────────────────────────────────────

    if ("toolCall" in response) {
      const { tool: toolName, args } = response.toolCall;

      agentLogger.info({ tool: toolName }, "Executing tool call");

      const outcome = await processToolCall(toolName, args, runtime);

      if (outcome.kind === "abort") {
        agentLogger.error(
          { toolFailures: runtime.diagnostics.toolFailures },
          "Agent stopped: too many tool failures",
        );
        return outcome.result;
      }
    }
  }

  agentLogger.info(
    { iterations: MAX_ITERATIONS },
    "Agent stopped due to max iterations",
  );

  return {
    status: "max_iterations",
    diagnostics: runtime.diagnostics,
  };
}
