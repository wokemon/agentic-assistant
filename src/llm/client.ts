import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
  },
});

export async function generateResponse(messages: any[]) {
  const response = await client.chat.completions.create({
    model: process.env.MODEL || "qwen/qwen3-coder:free",
    messages,
    temperature: 0,
  });

  return response.choices[0].message.content || "";
}
