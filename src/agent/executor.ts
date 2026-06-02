import { tools } from "../tools/registry";
import { logger } from "../shared/logger";

const TOOL_TIMEOUT_MS = 10_000;

// Phase 4: Defensive Context Management Thresholds
// Note: Keeping as characters for the MVP to avoid tokenizer overhead,
// but structured for an easy swap to MAX_OUTPUT_TOKENS later.
const MAX_OUTPUT_LENGTH = 2000;

// 1. Standard Head-and-Tail Truncation (Fallback)
function truncateOutput(text: string | undefined, toolName: string): string {
  if (!text || text.length <= MAX_OUTPUT_LENGTH) {
    return text || "";
  }

  const half = Math.floor(MAX_OUTPUT_LENGTH / 2);
  const topHalf = text.substring(0, half);
  const bottomHalf = text.substring(text.length - half);
  const omittedLength = text.length - MAX_OUTPUT_LENGTH;

  logger.warn(
    {
      tool: toolName,
      originalLength: text.length,
      omittedLength,
    },
    "Tool output exceeded limit, truncating context",
  );

  return `${topHalf}\n\n... [OUTPUT TRUNCATED: ${omittedLength} characters omitted] ...\n\n${bottomHalf}`;
}

// 2. Tool-Specific Summarization Layer
function summarizeFileList(text: string | undefined): string {
  if (!text) return "";

  const files = text
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  if (files.length <= 20) return text;

  const sample = files
    .slice(0, 10)
    .map((f) => `- ${f}`)
    .join("\n");
  const omitted = files.length - 10;

  return `Found ${files.length} items.\n\nExamples:\n${sample}\n\n... [${omitted} more items omitted]`;
}

// 3. Normalization Router
function normalizeOutput(text: string | undefined, toolName: string): string {
  if (!text) return "";

  if (toolName === "list_files" || toolName === "search_files") {
    return summarizeFileList(text);
  }

  return truncateOutput(text, toolName);
}

export async function executeToolCall(toolName: string, rawArgs: unknown) {
  const tool = tools[toolName];

  logger.info({ tool: toolName, args: rawArgs }, "Tool execution requested");

  if (!tool) {
    logger.warn({ tool: toolName }, "Unknown tool requested");
    return { success: false, output: "", error: `Unknown tool: ${toolName}` };
  }

  const parsed = tool.schema.safeParse(rawArgs);

  if (!parsed.success) {
    logger.warn(
      { tool: toolName, issues: parsed.error.issues },
      "Tool argument validation failed",
    );
    return { success: false, output: "", error: parsed.error.message };
  }

  const startTime = Date.now();

  try {
    logger.info({ tool: toolName }, "Executing tool");

    const result = await Promise.race([
      tool.execute(parsed.data),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("Tool execution timed out"));
        }, TOOL_TIMEOUT_MS),
      ),
    ]);

    const duration = Date.now() - startTime;

    // APPLY IMMUTABLE NORMALIZATION
    const normalizedResult = {
      ...result,
      output: normalizeOutput(result.output, toolName),
      error: truncateOutput(result.error, toolName),
    };

    logger.info(
      {
        tool: toolName,
        durationMs: duration,
        success: normalizedResult.success,
      },
      "Tool execution completed",
    );

    return normalizedResult;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      { tool: toolName, durationMs: duration, error },
      "Tool execution failed",
    );

    // Apply truncation to unexpected catch block errors as well
    const rawErrorMessage =
      error instanceof Error ? error.message : "Unknown execution error";

    return {
      success: false,
      output: "",
      error: truncateOutput(rawErrorMessage, toolName),
    };
  }
}
