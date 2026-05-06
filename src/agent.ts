import { askLLM } from "./llm.js";

export async function runAgent(userInput: string) {
  const response = await askLLM(userInput);

  return response;
}
