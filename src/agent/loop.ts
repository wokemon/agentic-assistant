import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";
import { tools } from "../tools/registy";

const MAX_ITERATIONS = 5;

export async function runAgent(userPrompt: string) {
  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await generateResponse(messages);

    console.log("\nMODEL RESPONSE:\n");
    console.log(response);

    messages.push({
      role: "assistant",
      content: response,
    });

    const parsed = parseAgentResponse(response);

    // FINAL ANSWER
    if (parsed.finalAnswer) {
      console.log("\nFINAL ANSWER:\n");
      console.log(parsed.finalAnswer);

      return;
    }

    // TOOL CALL
    if (parsed.toolCall) {
      const { tool, args } = parsed.toolCall;

      const selectedTool = tools[tool];

      if (!selectedTool) {
        messages.push({
          role: "user",
          content: `TOOL ERROR: Tool "${tool}" not found.`,
        });

        continue;
      }

      try {
        const result = await selectedTool(...Object.values(args));

        console.log("\nTOOL RESULT:\n");
        console.log(result);

        messages.push({
          role: "user",
          content: `
TOOL RESULT:
Tool: ${tool}

Output:
${result}
`,
        });
      } catch (err: any) {
        messages.push({
          role: "user",
          content: `
TOOL ERROR:
${err.message}
`,
        });
      }

      continue;
    }

    // INVALID OUTPUT
    console.log("\nInvalid model response.");
    return;
  }

  console.log("\nMax iterations reached.");
}
