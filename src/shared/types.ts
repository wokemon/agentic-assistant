import { z } from "zod";

/* =========================
   Chat / Agent Types
========================= */

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
}

/* =========================
   Agent Response Types
========================= */

export interface ToolCall {
  tool: string;
  args: unknown;
}

export interface AgentResponse {
  thought?: string;
  toolCall?: ToolCall;
  finalAnswer?: string;
}

/* =========================
   Agent Runtime Types
========================= */

export type AgentStatus =
  | "completed"
  | "max_iterations"
  | "parse_failure"
  | "context_budget_exceeded"
  | "malformed_response"
  | "too_many_tool_failures"
  | "server_timeout"
  | "user_cancelled"
  | "client_disconnected";

export interface AgentDiagnostics {
  sessionId: string;
  iterations: number;
  toolCalls: number;
  toolFailures: number;
  malformedResponses: number;
}

export interface AgentResult {
  status: AgentStatus;
  finalAnswer?: string;
  diagnostics: AgentDiagnostics;
}

/* =========================
   Tool Runtime Types
========================= */

export type FailureType =
  | "not_found"
  | "validation"
  | "permission"
  | "timeout"
  | "execution"
  | "safety"
  | "unknown";

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  failureType?: FailureType;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;

  description: string;

  schema: z.ZodType<TArgs>;

  execute(args: TArgs): Promise<ToolResult>;
}

/* =========================
   Agent Observability
   ========================= */

export type AgentEvent =
  | { type: "iteration_start"; iteration: number }
  | { type: "tool_call"; tool: string; args: unknown }
  | {
      type: "tool_result";
      tool: string;
      result: unknown;
      success: boolean;
    }
  | { type: "reasoning"; text: string }
  | { type: "final_answer"; text: string }
  | { type: "error"; message: string }
  | { type: "safety_stop"; reason: string };
