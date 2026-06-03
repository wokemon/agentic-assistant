import { z } from "zod";
import { logger } from "../shared/logger";

const toolCallSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.any()),
});

const agentResponseSchema = z.object({
  toolCall: toolCallSchema.optional(),
  finalAnswer: z.string().min(1).optional(),
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

type ParseResult =
  | {
      success: true;
      data: AgentResponse;
    }
  | {
      success: false;
      error: string;
    };

// --------------------------------------------------
// Balanced JSON extraction fallback
// --------------------------------------------------
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");

  if (start === -1) {
    return null;
  }

  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;

      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function parseAgentResponse(response: string): ParseResult {
  logger.debug(
    {
      rawResponse: response,
    },
    "Parsing agent response",
  );

  response = response.trim();

  // ----------------------------
  // FINAL ANSWER MODE
  // ----------------------------

  const finalMatch = response.match(/^FINAL:\s*([\s\S]*)/m);

  if (finalMatch) {
    logger.debug("Detected final answer response");

    const finalAnswer = finalMatch[1]?.trim();

    const validated = agentResponseSchema.safeParse({
      finalAnswer,
    });

    if (!validated.success) {
      logger.warn(
        {
          issues: validated.error.issues,
        },
        "Final answer validation failed",
      );

      return {
        success: false,
        error: validated.error.message,
      };
    }

    logger.info("Final answer parsed successfully");

    return {
      success: true,
      data: validated.data,
    };
  }

  // ----------------------------
  // TOOL CALL MODE
  // ----------------------------

  try {
    logger.debug("Attempting tool call parsing");

    let parsed: unknown;

    // ------------------------------------
    // Primary Path: Strict JSON Response
    // ------------------------------------

    try {
      parsed = JSON.parse(response);

      logger.debug(
        {
          parsed,
        },
        "Parsed response as strict JSON",
      );
    } catch {
      // ------------------------------------
      // Fallback: Extract JSON from text
      // ------------------------------------

      const jsonText = extractJsonObject(response);

      if (!jsonText) {
        logger.warn(
          {
            response,
          },
          "No JSON object found in response",
        );

        return {
          success: false,
          error: "No JSON object found.",
        };
      }

      parsed = JSON.parse(jsonText);

      logger.debug(
        {
          parsed,
        },
        "Parsed extracted JSON object",
      );
    }

    const validated = toolCallSchema.safeParse(parsed);

    if (!validated.success) {
      logger.warn(
        {
          parsed,
          issues: validated.error.issues,
        },
        "Tool call validation failed",
      );

      return {
        success: false,
        error: validated.error.message,
      };
    }

    logger.info(
      {
        tool: validated.data.tool,
      },
      "Tool call parsed successfully",
    );

    return {
      success: true,
      data: {
        toolCall: validated.data,
      },
    };
  } catch (error) {
    logger.error(
      {
        error,
        response,
      },
      "Agent response parsing failed",
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}
