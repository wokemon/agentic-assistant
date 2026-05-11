import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";

import { tools } from "../tools/registry";

import { Message, ToolResult } from "./types";

const MAX_ITERATIONS = 5;

// Main agent loop
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

  // Iterative agent loop
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

      // ----------------------------
      // 5. UNKNOWN TOOL HANDLING
      // ----------------------------
      if (!selectedTool) {
        const errorMessage = `
TOOL ERROR:
Unknown tool "${tool}"

Available tools:
${Object.keys(tools)
  .map((toolName) => `- ${toolName}`)
  .join("\n")}
`;

        console.log(errorMessage);

        messages.push({
          role: "tool",
          content: errorMessage,
        });

        continue;
      }

      try {
        // ----------------------------
        // 6. VALIDATE TOOL INPUT
        // ----------------------------
        const parsedArgs = selectedTool.schema.safeParse(args);

        if (!parsedArgs.success) {
          const validationError = parsedArgs.error.message;

          throw new Error(
            `Invalid arguments for "${tool}":\n${validationError}`,
          );
        }

        // ----------------------------
        // 7. EXECUTE TOOL
        // ----------------------------
        const result: ToolResult = await selectedTool.execute(parsedArgs.data);

        console.log("\nTOOL RESULT:\n");
        console.log(result);

        // ----------------------------
        // 8. OBSERVATION HANDLING
        // ----------------------------
        messages.push({
          role: "tool",
          content: `
OBSERVATION:
Tool: ${tool}

Success:
${result.success}

Output:
${result.output}

${result.error ? `Error:\n${result.error}` : ""}
`,
        });

        continue;
      } catch (err) {
        const errorMessage = `
TOOL ERROR:
Tool: ${tool}

Message:
${err instanceof Error ? err.message : "Unknown error"}
`;

        console.log(errorMessage);

        messages.push({
          role: "tool",
          content: errorMessage,
        });

        continue;
      }
    }

    // ----------------------------
    // 9. INVALID FORMAT RECOVERY
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
      role: "system",
      content: invalidFormatMessage,
    });
  }

  console.log("\nAgent stopped: max iterations reached.");
}
