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

  // Defensive Engineering: Strict regex anchored to the start of a line (^).
  // The 'm' flag ensures it checks the start of every line, not just the very first character.
  // [\s\S]* safely captures all remaining characters, including multi-line outputs.
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

    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
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

    const parsed = JSON.parse(jsonMatch[0]);

    logger.debug(
      {
        parsed,
      },
      "Tool call JSON parsed",
    );

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
