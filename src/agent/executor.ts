import { tools } from "../tools/registry";

export async function executeToolCall(toolName: string, rawArgs: unknown) {
  const tool = tools[toolName];

  if (!tool) {
    return {
      success: false,
      output: "",
      error: `Unknown tool: ${toolName}`,
    };
  }

  const parsed = tool.schema.safeParse(rawArgs);

  if (!parsed.success) {
    return {
      success: false,
      output: "",
      error: parsed.error.message,
    };
  }

  return tool.execute(parsed.data);
}
