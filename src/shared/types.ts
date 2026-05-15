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
   Tool Runtime Types
========================= */

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;

  description: string;

  schema: z.ZodType<TArgs>;

  execute: (args: TArgs) => Promise<ToolResult>;
}
