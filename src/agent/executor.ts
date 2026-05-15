import { tools } from "../tools/registry";
import { logger } from "../shared/logger";

const TOOL_TIMEOUT_MS = 10_000;

export async function executeToolCall(toolName: string, rawArgs: unknown) {
  const tool = tools[toolName];

  logger.info(
    {
      tool: toolName,
      args: rawArgs,
    },
    "Tool execution requested",
  );

  if (!tool) {
    logger.warn(
      {
        tool: toolName,
      },
      "Unknown tool requested",
    );

    return {
      success: false,
      output: "",
      error: `Unknown tool: ${toolName}`,
    };
  }

  const parsed = tool.schema.safeParse(rawArgs);

  if (!parsed.success) {
    logger.warn(
      {
        tool: toolName,
        issues: parsed.error.issues,
      },
      "Tool argument validation failed",
    );

    return {
      success: false,
      output: "",
      error: parsed.error.message,
    };
  }

  const startTime = Date.now();

  try {
    logger.info(
      {
        tool: toolName,
      },
      "Executing tool",
    );

    const result = await Promise.race([
      tool.execute(parsed.data),

      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("Tool execution timed out"));
        }, TOOL_TIMEOUT_MS),
      ),
    ]);

    const duration = Date.now() - startTime;

    logger.info(
      {
        tool: toolName,
        durationMs: duration,
        success: result.success,
      },
      "Tool execution completed",
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        tool: toolName,
        durationMs: duration,
        error,
      },
      "Tool execution failed",
    );

    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}
