import { z } from "zod";
import { logger } from "../shared/logger";

// 1. Define the strict dual-mode schema using a Zod Union
export const AgentResponseSchema = z.union([
  z.object({
    toolCall: z.object({
      tool: z.string(),
      args: z.record(z.string(), z.any()),
    }),
  }),
  z.object({
    finalAnswer: z.string().min(1),
  }),
]);

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

type ParseResult =
  | { success: true; data: AgentResponse }
  | { success: false; error: string };

// --------------------------------------------------
// Balanced JSON extraction fallback
// --------------------------------------------------
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAgentResponse(response: string): ParseResult {
  logger.debug({ rawResponse: response }, "Parsing agent response");

  response = response.trim();

  // --------------------------------------------------
  // MODE 2: Tool Call Mode (JSON Extraction)
  // --------------------------------------------------
  const jsonText = extractJsonObject(response);

  if (!jsonText) {
    logger.warn({ response }, "No JSON object found in response");
    return {
      success: false,
      error: "No JSON object found. You must return valid JSON.",
    };
  }

  try {
    const parsedJson = JSON.parse(jsonText);
    logger.debug({ parsedJson }, "Parsed extracted JSON object");

    // Validate against the strict Union Schema
    const validated = AgentResponseSchema.safeParse(parsedJson);

    if (!validated.success) {
      logger.warn(
        { parsedJson, issues: validated.error.issues },
        "Agent response schema validation failed",
      );

      // Return exact Zod errors so the LLM knows what to fix in the next iteration
      return {
        success: false,
        error: `Invalid JSON structure: ${JSON.stringify(validated.error.issues)}`,
      };
    }

    logger.info("Agent tool call parsed successfully");
    return { success: true, data: validated.data };
  } catch (error) {
    logger.error({ error, response }, "Agent response parsing failed");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}
