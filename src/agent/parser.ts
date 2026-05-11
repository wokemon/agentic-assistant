import { z } from "zod";

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
  response = response.trim();

  // ----------------------------
  // FINAL ANSWER MODE
  // ----------------------------

  if (response.includes("FINAL:")) {
    const finalAnswer = response.split("FINAL:")[1]?.trim();

    const validated = agentResponseSchema.safeParse({
      finalAnswer,
    });

    if (!validated.success) {
      return {
        success: false,
        error: validated.error.message,
      };
    }

    return {
      success: true,
      data: validated.data,
    };
  }

  // ----------------------------
  // TOOL CALL MODE
  // ----------------------------

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        success: false,
        error: "No JSON object found.",
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const validated = toolCallSchema.safeParse(parsed);

    if (!validated.success) {
      return {
        success: false,
        error: validated.error.message,
      };
    }

    return {
      success: true,
      data: {
        toolCall: validated.data,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}
