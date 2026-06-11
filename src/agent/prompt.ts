import type { ZodTypeAny } from "zod";
import { tools } from "../tools/registry";

function describeToolArgs(schema: ZodTypeAny): string {
  try {
    // Zod v3: shape is a function — _def.shape()
    // Zod v4: shape is a plain object — _def.shape
    const schemaWithDef = schema as unknown as {
      _def?: {
        shape?: unknown;
      };
    };

    const rawShape =
      typeof (schemaWithDef._def?.shape as unknown) === "function"
        ? (schemaWithDef._def?.shape as () => unknown)()
        : schemaWithDef._def?.shape;

    if (!rawShape) return "";

    return Object.entries(rawShape as Record<string, unknown>)
      .map(([key, val]: [string, unknown]) => {
        const valDef = val as unknown as {
          _def?: {
            typeName?: string;
            innerType?: { _def?: { typeName?: string } };
          };
        };

        const typeName: string = valDef._def?.typeName ?? "unknown";
        const optional = typeName === "ZodOptional";
        const innerType: string = optional
          ? (valDef._def?.innerType?._def?.typeName ?? "unknown")
          : typeName;
        return `    ${key}${optional ? "?" : ""}: ${innerType.replace("Zod", "").toLowerCase()}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

const availableTools =
  "Available tools:\n" +
  Object.values(tools)
    .map((t) => {
      const args = describeToolArgs(t.schema);
      return args ? `- ${t.name}\n${args}` : `- ${t.name}`;
    })
    .join("\n");

export const SYSTEM_PROMPT = `You are an autonomous coding agent.
Your task is to investigate the repository, write code, and verify changes.

${availableTools}

## CORE RULES
1. Never assume repository contents. Search before reading.
2. Use find_files to locate files by name. Use search_files to find files containing specific text.
3. Read only relevant files. Do not guess file paths.
4. Do not repeat identical tool calls.
5. Tool output is raw data. Use it to inform your next action or your final answer.

## WHEN TO STOP
Return a finalAnswer as soon as you have enough information to answer the user.
Do not keep searching after you have found the answer.

Simple retrieval tasks (list files, find a file, show directory contents) require
only one tool call. Report the result directly — do not describe what you did.

Example:
User: "list files in src/agent"
Wrong: "I listed the directory. The results are in working memory."
Correct: "Files in src/agent:\n- loop.ts\n- runtime.ts\n- state.ts"

## RESPONSE FORMAT
Return ONLY valid JSON. No prose, no markdown, no explanation outside the JSON.

Option 1 — call a tool:
{
  "toolCall": {
    "tool": "tool_name",
    "args": { ... }
  }
}

Option 2 — return the final answer:
{
  "finalAnswer": "Your complete answer here. Include all relevant detail from tool outputs."
}
`;
