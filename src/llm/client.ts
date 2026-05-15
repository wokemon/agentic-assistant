import OpenAI from "openai";
import dotenv from "dotenv";

import { logger } from "../shared/logger";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;
const model = process.env.MODEL || "qwen/qwen3-coder:free";

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing");
}

const client = new OpenAI({
  apiKey,
  baseURL,

  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
  },
});

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateResponse(messages: Message[]): Promise<string> {
  const startTime = Date.now();

  logger.info(
    {
      model,
      messageCount: messages.length,
    },
    "Generating LLM response",
  );

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      logger.warn(
        {
          response,
        },
        "LLM returned empty response",
      );

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

    logger.error(
      {
        model,
        durationMs: duration,
        error,
      },
      "LLM request failed",
    );

    throw error;
  }
}
