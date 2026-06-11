import { tools } from "../tools/registry";
import { logger } from "../shared/logger";
import { CommandPolicy } from "../safety/commandPolicy";
import { PathValidation } from "../safety/pathValidation";
import { SafetyBlockedError } from "../safety/errors";
import type { FailureType } from "../shared/types";
import type { ToolResult } from "../shared/types";

const TOOL_TIMEOUT_MS = 10_000;

// Phase 4: Defensive Context Management Thresholds
// Note: Keeping as characters for the MVP to avoid tokenizer overhead.
// was 2000 now 8000
const MAX_OUTPUT_LENGTH = 8000;

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

function classifyError(error: unknown): FailureType {
  if (!(error instanceof Error)) {
    return "unknown";
  }

  const message = error.message.toLowerCase();

  if (message.includes("enoent")) {
    return "not_found";
  }

  if (message.includes("eacces") || message.includes("permission denied")) {
    return "permission";
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return "timeout";
  }

  return "execution";
}

function buildValidationError(
  toolName: string,
  rawArgs: unknown,
  issues: { path: PropertyKey[]; message: string }[],
): string {
  // Describe each field problem in plain terms the model can act on
  const fieldErrors = issues
    .map((issue) => {
      const field =
        issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
      return `  - ${field}: ${issue.message}`;
    })
    .join("\n");

  // Pull the expected shape from the tool's schema so the model sees
  // exactly what to send next, without having to guess.
  const tool = tools[toolName];
  let expectedShape = "(schema unavailable)";
  try {
    // Zod schemas expose _def.shape() on ZodObject — best-effort only.
    const shape = (tool.schema as any)._def?.shape?.();
    if (shape) {
      expectedShape = Object.entries(shape)
        .map(([key, val]: [string, any]) => {
          const typeName: string = val?._def?.typeName ?? "unknown";
          const optional: boolean = typeName === "ZodOptional";
          const innerType: string = optional
            ? (val._def?.innerType?._def?.typeName ?? "unknown")
            : typeName;
          return `  ${key}${optional ? "?" : ""}: ${innerType.replace("Zod", "").toLowerCase()}`;
        })
        .join("\n");
    }
  } catch {
    // Silently fall back — schema introspection is best-effort
  }

  return `Invalid arguments for tool '${toolName}'.

Field errors:
${fieldErrors}

Expected schema:
${expectedShape}

You sent:
${JSON.stringify(rawArgs, null, 2)}

Fix the arguments and call '${toolName}' again.`;
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
      failureType: "validation",
    };
  }

  const parsed = tool.schema.safeParse(rawArgs);

  if (!parsed.success) {
    const error = buildValidationError(toolName, rawArgs, parsed.error.issues);

    logger.warn(
      { tool: toolName, issues: parsed.error.issues },
      "Tool argument validation failed",
    );

    return {
      success: false,
      output: "",
      error,
      failureType: "validation",
    };
  }

    try {
      // Safety validation for command-based tools
      if (toolName === "terminal_execute") {
        const termArgs = parsed.data as { command: string };
        CommandPolicy.validateOrThrow(termArgs.command);
      }

      // Safety validation for write_files specifically
      if (toolName === "write_files") {
        const writeArgs = parsed.data as {
          files?: Array<{ path: string }>;
        };
        const filePaths = writeArgs.files?.map((f) => f.path) ?? [];
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
        const fsArgs = parsed.data as {
          path?: string;
          paths?: string[];
          directory?: string;
          filePath?: string;
        };

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
        failureType: "safety",
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
      failureType: result.failureType,
      metadata: result.metadata,
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
      failureType: classifyError(error),
    };
  }
}
