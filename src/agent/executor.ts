import { tools } from "../tools/registry";
import { logger } from "../shared/logger";
import { CommandPolicy } from "../safety/commandPolicy";
import { PathValidation } from "../safety/pathValidation";
import { SafetyBlockedError } from "../safety/errors";

const TOOL_TIMEOUT_MS = 10_000;

// Phase 4: Defensive Context Management Thresholds
// Note: Keeping as characters for the MVP to avoid tokenizer overhead.
const MAX_OUTPUT_LENGTH = 2000;

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

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

// 2. Specialized Summarization Layer
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

// 3. Centralized Normalization Router
function normalizeOutput(text: string | undefined, toolName: string): string {
  if (!text) return "";

  // Hardcoded routing is perfectly acceptable for the MVP toolset
  if (toolName === "list_files" || toolName === "search_files") {
    return summarizeFileList(text);
  }

  return truncateOutput(text, toolName);
}

export async function executeToolCall(
  toolName: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const tool = tools[toolName];

  logger.info({ tool: toolName, args: rawArgs }, "Tool execution requested");

  if (!tool) {
    const availableTools = Object.keys(tools).join(", ");

    return {
      success: false,
      output: "",
      error: `Unknown tool: ${toolName}

Available tools:
${availableTools}

Choose one of the available tools.`,
    };
  }

  const parsed = tool.schema.safeParse(rawArgs);

  if (!parsed.success) {
    logger.warn(
      { tool: toolName, issues: parsed.error.issues },
      "Tool argument validation failed",
    );
    return { success: false, output: "", error: parsed.error.message };
  }

  try {
    // Safety validation for command-based tools
    if (toolName === "terminal_execute") {
      const termArgs = parsed.data as any;
      CommandPolicy.validateOrThrow(termArgs.command);
    }

    // Safety validation for write_files specifically
    if (toolName === "write_files") {
      const writeArgs = parsed.data as any;
      const filePaths = writeArgs.files?.map((f: any) => f.path) || [];
      if (filePaths.length > 0) {
        PathValidation.validateOrThrowMultiple(filePaths);
      }
    }

    // Safety validation for other filesystem tools
    const otherFilesystemTools = [
      "read_files",
      "list_files",
      "read_file_lines",
      "search_files",
    ];
    if (otherFilesystemTools.includes(toolName)) {
      const fsArgs = parsed.data as any;

      if (fsArgs.path) {
        PathValidation.validateOrThrow(fsArgs.path);
      }
      if (fsArgs.paths) {
        PathValidation.validateOrThrowMultiple(fsArgs.paths);
      }
      if (fsArgs.directory) {
        PathValidation.validateOrThrow(fsArgs.directory);
      }
    }
  } catch (error) {
    if (error instanceof SafetyBlockedError) {
      logger.warn(
        { tool: toolName, error: error.name, category: error.category },
        "Tool execution blocked by safety policy",
      );
      return {
        success: false,
        output: "",
        error: error.message,
      };
    }
    throw error;
  }

  const startTime = Date.now();

  try {
    logger.info({ tool: toolName }, "Executing tool");

    // NOTE: This timeout only affects the agent's waiting period.
    // It does NOT cancel the underlying process (e.g., child processes, network requests).
    const result = (await Promise.race([
      tool.execute(parsed.data),
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error("Tool execution timed out"));
        }, TOOL_TIMEOUT_MS),
      ),
    ])) as ToolResult;

    const duration = Date.now() - startTime;

    // Apply centralized, immutable normalization
    const normalizedResult: ToolResult = {
      success: result.success,
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
