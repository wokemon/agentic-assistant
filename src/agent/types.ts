export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

export interface AgentResponse {
  thought?: string;
  toolCall?: ToolCall;
  finalAnswer?: string;
}
