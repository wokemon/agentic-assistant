import { logger } from "../shared/logger";
import { generateResponse } from "../llm/client";
import { parseAgentResponse } from "./parser";
import { buildContext } from "../context/contextBuilder";
import { AgentRuntime } from "./runtime";
import { processToolCall } from "./processors/toolProcessor";
import { processMalformedResponse } from "./processors/malformedResponseProcessor";
import { validateFinalAnswer } from "./validators/finalAnswerValidator";
import type {
  AgentDiagnostics,
  AgentEvent,
  AgentResult,
} from "../shared/types";
import type { WorkingMemory } from "../context/workingMemory";
import { WorkingMemory as WorkingMemoryClass } from "../context/workingMemory";
import type { AgentState } from "./state";
import type { MessageHistory } from "./history";
import type { LoopGuard } from "../safety/loopGuards";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 15;

// ─── Session Types ───────────────────────────────────────────────────────────

export type SessionState = {
  sessionId?: string;
  history: MessageHistory;
  memory: WorkingMemory;
  loopGuard: LoopGuard;
  state: AgentState;
  diagnostics: AgentDiagnostics;
};

function isWorkingMemory(
  session: WorkingMemory | SessionState,
): session is WorkingMemory {
  const anySession = session as any;
  return (
    anySession instanceof WorkingMemoryClass ||
    (typeof anySession?.getState === "function" &&
      typeof anySession?.addFact === "function")
  );
}

function safetyReason(status: AgentResult["status"]): string {
  return status;
}

// ─── Public Runner ──────────────────────────────────────────────────────────

export async function runAgentTask(
  task: string,
  session: WorkingMemory | SessionState,
  onEvent: (event: AgentEvent) => void,
  opts?: {
    signal?: AbortSignal;
    saveMemory?: (sessionId: string, memory: { facts: string[] }) => Promise<void>;
  },
): Promise<AgentResult> {
  const runtime = isWorkingMemory(session)
    ? new AgentRuntime({ memory: session })
    : new AgentRuntime({
        sessionId: session.sessionId,
        history: session.history,
        memory: session.memory,
        loopGuard: session.loopGuard,
        state: session.state,
        diagnostics: session.diagnostics,
      });

  const agentLogger = logger.child({
    component: "agent_loop",
    sessionId: runtime.sessionId,
  });

  agentLogger.info({ task }, "Starting agent run");

  function abortReason(): AgentResult["status"] {
    const reason = opts?.signal?.reason;
    return typeof reason === "string"
      ? (reason as AgentResult["status"])
      : "user_cancelled";
  }

  async function abortResult(): Promise<AgentResult> {
    const status = abortReason();
    onEvent({ type: "safety_stop", reason: status });
    await opts?.saveMemory?.(runtime.sessionId, runtime.memory.toPersistedState());
    return { status, diagnostics: runtime.diagnostics };
  }

  if (opts?.signal?.aborted) {
    return abortResult();
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (opts?.signal?.aborted) {
      return abortResult();
    }

    runtime.diagnostics.iterations = iteration + 1;

    onEvent({ type: "iteration_start", iteration: iteration + 1 });

    const context = buildContext(runtime.history, runtime.memory, task);

    agentLogger.info(
      { iteration, contextLength: context.length },
      "Starting loop iteration",
    );

    // ── Call model ───────────────────────────────────────────────────────────
    let rawResponse: string;

    try {
      rawResponse = await generateResponse(context, opts?.signal);
    } catch (error) {
      if (opts?.signal?.aborted) {
        agentLogger.warn(
          { reason: opts.signal.reason },
          "Agent aborted during LLM request",
        );
        return abortResult();
      }

      if (
        error instanceof Error &&
        error.name === "ContextBudgetExceededError"
      ) {
        agentLogger.error("Agent stopped: Context budget exceeded.");
        onEvent({
          type: "safety_stop",
          reason: safetyReason("context_budget_exceeded"),
        });
        await opts?.saveMemory?.(runtime.sessionId, runtime.memory.toPersistedState());
        return {
          status: "context_budget_exceeded",
          diagnostics: runtime.diagnostics,
        };
      }

      onEvent({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }

    if (opts?.signal?.aborted) {
      return abortResult();
    }

    // ── Parse response ───────────────────────────────────────────────────────
    const parsed = parseAgentResponse(rawResponse);

    if (!parsed.success) {
      agentLogger.warn({ error: parsed.error }, "Malformed response");

      const outcome = processMalformedResponse(parsed.error, task, runtime);

      if (outcome.kind === "abort") {
        onEvent({
          type: "safety_stop",
          reason: safetyReason(outcome.result.status),
        });
        agentLogger.error("Agent stopped due to repeated malformed responses.");
        await opts?.saveMemory?.(runtime.sessionId, runtime.memory.toPersistedState());
        return outcome.result;
      }

      continue;
    }

    const response = parsed.data;
    runtime.history.add("assistant", rawResponse);

    // Some agent implementations may include intermediate reasoning/thoughts.
    const maybeThought = (response as any).thought;
    if (typeof maybeThought === "string" && maybeThought.trim().length > 0) {
      onEvent({ type: "reasoning", text: maybeThought });
    }

    // ── Dispatch: final answer ───────────────────────────────────────────────
    if ("finalAnswer" in response) {
      const validation = validateFinalAnswer({
        userInput: task,
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

      onEvent({ type: "final_answer", text: response.finalAnswer });

      await opts?.saveMemory?.(runtime.sessionId, runtime.memory.toPersistedState());
      return {
        status: "completed",
        finalAnswer: response.finalAnswer,
        diagnostics: runtime.diagnostics,
      };
    }

    // ── Dispatch: tool call ──────────────────────────────────────────────────
    if ("toolCall" in response) {
      const { tool: toolName, args } = response.toolCall;

      onEvent({ type: "tool_call", tool: toolName, args });

      agentLogger.info({ tool: toolName }, "Executing tool call");

      const outcome = await processToolCall(
        toolName,
        args,
        runtime,
        onEvent,
        opts?.signal,
      );

      if (outcome.kind === "abort") {
        onEvent({
          type: "safety_stop",
          reason: safetyReason(outcome.result.status),
        });
        agentLogger.error(
          { toolFailures: runtime.diagnostics.toolFailures },
          "Agent stopped: too many tool failures",
        );
        await opts?.saveMemory?.(runtime.sessionId, runtime.memory.toPersistedState());
        return outcome.result;
      }

      // When a tool call is skipped (repeat guard, storm guard, etc.) the
      // model receives no observation and silently retries or gives up.
      // Nudge it toward using the data it already has.
      if (outcome.kind === "skip") {
        onEvent({
          type: "tool_result",
          tool: toolName,
          result: { kind: "skip" },
          success: false,
        });

        runtime.history.add(
          "system",
          `Your tool call was not executed. The data you need is already in your working memory. Review your FACTS and answer the user.`,
        );
      }
    }
  }

  agentLogger.info(
    { iterations: MAX_ITERATIONS },
    "Agent stopped due to max iterations",
  );

  const result: AgentResult = {
    status: "max_iterations",
    diagnostics: runtime.diagnostics,
  };

  onEvent({ type: "safety_stop", reason: safetyReason(result.status) });

  await opts?.saveMemory?.(runtime.sessionId, runtime.memory.toPersistedState());
  return result;
}
