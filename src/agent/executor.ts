import { tools } from "../tools/registry";

const TOOL_TIMEOUT_MS = 10_000;

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

  try {
    const result = await Promise.race([
      tool.execute(parsed.data),

      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("Tool execution timed out"));
        }, TOOL_TIMEOUT_MS),
      ),
    ]);

    return result;
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}
