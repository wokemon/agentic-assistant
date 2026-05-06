import { MessageHistory } from "./history";
import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";
import { tools } from "../tools/registy";

const MAX_ITERATIONS = 10;

export async function runAgent(userPrompt: string) {
  const history = new MessageHistory();

  history.add("system", SYSTEM_PROMPT);
  history.add("user", userPrompt);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    console.log(`\n--- ITERATION ${i + 1} ---`);

    const response = await generateResponse(history.getAll());

    console.log("\nMODEL RESPONSE:\n");
    console.log(response);

    history.add("assistant", response);

    const parsed = parseAgentResponse(response);

    // final answer
    if (parsed.finalAnswer) {
      console.log("\nFINAL ANSWER:\n");
      console.log(parsed.finalAnswer);

      return;
    }

    // tool call
    if (parsed.toolCall) {
      const { tool, args } = parsed.toolCall;

      const selectedTool = tools[tool];

      if (!selectedTool) {
        const error = `Tool not found: ${tool}`;

        history.add("tool", error);

        continue;
      }

      try {
        const result = await selectedTool(...Object.values(args));

        const observation = `Tool Result:\n${result}`;

        console.log("\nTOOL RESULT:\n");
        console.log(observation);

        history.add("tool", observation);
      } catch (err: any) {
        const errorMessage = `Tool Error: ${err.message}`;

        console.log(errorMessage);

        history.add("tool", errorMessage);
      }
    }
  }

  console.log("Agent stopped: max iterations reached.");
}
