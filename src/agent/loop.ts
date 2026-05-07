import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";
import { tools } from "../tools/registry";

const MAX_ITERATIONS = 5;

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function runAgent(userPrompt: string) {
  const messages: Message[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    console.log(`\n========== ITERATION ${iteration + 1} ==========\n`);

    // ----------------------------
    // 1. GENERATE MODEL RESPONSE
    // ----------------------------
    const response = await generateResponse(messages);

    console.log("\nMODEL RESPONSE:\n");
    console.log(response);

    messages.push({
      role: "assistant",
      content: response,
    });

    // ----------------------------
    // 2. PARSE RESPONSE
    // ----------------------------
    const parsed = parseAgentResponse(response);

    // ----------------------------
    // 3. FINAL ANSWER
    // ----------------------------
    if (parsed.finalAnswer) {
      console.log("\nFINAL ANSWER:\n");
      console.log(parsed.finalAnswer);

      return;
    }

    // ----------------------------
    // 4. TOOL CALL
    // ----------------------------
    if (parsed.toolCall) {
      const { tool, args } = parsed.toolCall;

      console.log("\nTOOL REQUEST:");
      console.log(`Tool: ${tool}`);
      console.log("Args:", args);

      const selectedTool = tools[tool];

      // Unknown tool handling
      if (!selectedTool) {
        const errorMessage = `
TOOL ERROR:
Unknown tool "${tool}"

Available tools:
- list_files
- read_files
`;

        console.log(errorMessage);

        messages.push({
          role: "assistant",
          content: errorMessage,
        });

        continue;
      }

      try {
        // ----------------------------
        // 5. EXECUTE TOOL
        // ----------------------------
        const result = await selectedTool(args);

        console.log("\nTOOL RESULT:\n");
        console.log(result);

        // ----------------------------
        // 6. OBSERVATION HANDLING
        // ----------------------------
        messages.push({
          role: "assistant",
          content: `
OBSERVATION:
Tool: ${tool}

Result:
${JSON.stringify(result, null, 2)}
`,
        });
      } catch (err: any) {
        const errorMessage = `
TOOL ERROR:
Tool: ${tool}

Message:
${err instanceof Error ? err.message : "Unknown error"}
`;

        console.log(errorMessage);

        messages.push({
          role: "assistant",
          content: errorMessage,
        });
      }

      continue;
    }

    // ----------------------------
    // 7. INVALID FORMAT RECOVERY
    // ----------------------------
    const invalidFormatMessage = `
INVALID RESPONSE FORMAT.

You must respond in EXACTLY ONE of these formats.

Tool call format:

{
  "tool": "tool_name",
  "args": {
    "key": "value"
  }
}

Final answer format:

FINAL: your answer
`;

    console.log(invalidFormatMessage);

    messages.push({
      role: "assistant",
      content: invalidFormatMessage,
    });
  }

  console.log("\nAgent stopped: max iterations reached.");
}
