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

export type AgentStatus =
  | "completed"
  | "max_iterations"
  | "parse_failure"
  | "context_budget_exceeded"
  | "malformed_response"
  | "too_many_tool_failures"
  | "server_timeout"
  | "user_cancelled"
  | "client_disconnected"
  | "active"
  | "interrupted";

export type SessionListItem = {
  id: string;
  title?: string;
  lastActiveAt: string;
};

export type SessionDetailsResponse = {
  sessionId: string;
  status: AgentStatus | string;
  interruptedReason?: string;
  title?: string;
  lastActiveAt: string;
  createdAt: string;
  history: Array<{ role: string; content: string }>;
  userTasks?: string[];
  events?: AgentEvent[];
  diagnostics?: {
    sessionId: string;
    iterations: number;
    toolCalls: number;
    toolFailures: number;
    malformedResponses: number;
  };
};
