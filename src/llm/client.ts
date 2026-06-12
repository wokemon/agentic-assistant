import OpenAI from "openai";
import dotenv from "dotenv";

import { logger } from "../shared/logger";
import { Message } from "../shared/types";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
// Upgraded to your desired production model target
const model = process.env.LLM_MODEL || "gpt-5.4-nano-2026-03-17";

// Defaulting to 100k to leave a 28k buffer for the LLM's output response
const MAX_CONTEXT_TOKENS = parseInt(
  process.env.MAX_CONTEXT_TOKENS || "100000",
  10,
);

if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

if (!baseURL) {
  logger.warn("OPENAI_BASE_URL not set, using default OpenAI endpoint");
}

const client = new OpenAI({
  apiKey,
  baseURL: baseURL || undefined,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
  },
});

export function estimateTokenCount(messages: Message[]): number {
  // A standard, fast heuristic: ~4 characters per token
  const totalCharacters = messages.reduce(
    (sum, msg) => sum + msg.content.length,
    0,
  );
  return Math.ceil(totalCharacters / 4);
}

// Custom error to allow the loop to handle context breaches gracefully
export class ContextBudgetExceededError extends Error {
  constructor(
    public estimatedTokens: number,
    public maxTokens: number,
  ) {
    super(`Context budget exceeded: ${estimatedTokens} > ${maxTokens} tokens.`);
    this.name = "ContextBudgetExceededError";
  }
}

// -------------------------------------------------------------
// TYPE BOUNDARY MANAGEMENT: Internal logic vs External SDK types
// -------------------------------------------------------------

// 1. Define a strict internal type for what YOUR system considers a valid chat message
type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 2. Keep the type guard tied to YOUR internal type, not the massive external SDK type
function isOpenAIMessage(message: Message): message is OpenAIMessage {
  return message.role !== "tool";
}

// 3. Map to the SDK, casting only at the final boundary
function toOpenAIMessages(
  messages: Message[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.filter(isOpenAIMessage).map((message) => {
    return {
      role: message.role,
      content: message.content,
    } as OpenAI.Chat.ChatCompletionMessageParam; // Safe cast at the external boundary
  });
}

// -------------------------------------------------------------
// EXECUTION LOGIC
// -------------------------------------------------------------

export async function generateResponse(
  messages: Message[],
  signal?: AbortSignal,
): Promise<string> {
  const startTime = Date.now();

  // ----------------------------------------------------
  // CIRCUIT BREAKER: Check budget before hitting the API
  // ----------------------------------------------------
  const estimatedTokens = estimateTokenCount(messages);

  if (estimatedTokens > MAX_CONTEXT_TOKENS) {
    logger.error(
      { estimatedTokens, maxTokens: MAX_CONTEXT_TOKENS },
      "Context budget breached. Halting LLM request.",
    );
    throw new ContextBudgetExceededError(estimatedTokens, MAX_CONTEXT_TOKENS);
  }

  logger.info(
    {
      model,
      messageCount: messages.length,
      estimatedTokens, // Log the estimate for observability
    },
    "Generating LLM response",
  );

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: toOpenAIMessages(messages),
        temperature: 0, // Deterministic generation
      },
      signal ? { signal } : undefined,
    );

    const content = response.choices[0]?.message?.content;

    if (!content) {
      logger.warn({ response }, "LLM returned empty response");
      return "";
    }

    const duration = Date.now() - startTime;

    logger.info(
      {
        model,
        durationMs: duration,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
      "LLM response generated",
    );

    return content;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({ model, durationMs: duration, error }, "LLM request failed");
    throw error;
  }
}
