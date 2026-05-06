import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";
import { tools } from "../tools/registy";

export async function runAgent(userPrompt: string) {
  const messages: any[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  while (true) {
    const response = await generateResponse(messages);

    // console.log("\nMODEL RESPONSE:\n");
    // console.log(response);

    messages.push({
      role: "assistant",
      content: response,
    });

    const parsed = parseAgentResponse(response);

    // Final answer
    if (parsed.finalAnswer) {
      console.log("\nFINAL ANSWER:\n");
      console.log(parsed.finalAnswer);

      break;
    }

    // Tool call
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
    }
  }
}
