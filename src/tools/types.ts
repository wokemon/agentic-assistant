import { z } from "zod";

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

  execute(args: TArgs): Promise<ToolResult>;
}
