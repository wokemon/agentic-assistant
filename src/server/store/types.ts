import type { AgentDiagnostics } from "../../shared/types";
import type { AgentState } from "../../agent/state";
import type { Message } from "../../shared/types";
import type { LoopGuard } from "../../safety/loopGuards";
import type { WorkingMemory } from "../../context/workingMemory";

export type AgentStatus = "active" | "completed" | "interrupted";

export type CreateSessionOptions = {
  sessionId?: string;
};

export type WorkingMemoryState = ReturnType<WorkingMemory["getState"]>;

export type MessageHistoryState = {
  maxRetained: number;
  messages: Message[];
};

export type LoopGuardState = ReturnType<LoopGuard["toState"]>;

export type PersistedSessionDiagnostics = AgentDiagnostics;

export type PersistedAgentState = AgentState;
