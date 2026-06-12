import crypto from "crypto";
import { MessageHistory } from "./history";
import { WorkingMemory } from "../context/workingMemory";
import { LoopGuard } from "../safety/loopGuards";
import { AgentState, createInitialAgentState } from "./state";
import type { AgentDiagnostics } from "../shared/types";

// ─── Agent Runtime ────────────────────────────────────────────────────────────
// Bundles every per-run object into one place so processors and the loop
// never need to thread six separate arguments through every call.

export class AgentRuntime {
  readonly sessionId: string;

  readonly history: MessageHistory;

  readonly memory: WorkingMemory;

  readonly loopGuard: LoopGuard;

  readonly state: AgentState;

  readonly diagnostics: AgentDiagnostics;

  constructor(
    options?: Partial<{
      sessionId: string;
      history: MessageHistory;
      memory: WorkingMemory;
      loopGuard: LoopGuard;
      state: AgentState;
      diagnostics: AgentDiagnostics;
    }>,
  ) {
    this.sessionId = options?.sessionId ?? crypto.randomUUID();
    this.history = options?.history ?? new MessageHistory();
    this.memory = options?.memory ?? new WorkingMemory();
    this.loopGuard = options?.loopGuard ?? new LoopGuard();
    this.state = options?.state ?? createInitialAgentState();
    this.diagnostics =
      options?.diagnostics ??
      {
        sessionId: this.sessionId,
        iterations: 0,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 0,
      };
  }
}
