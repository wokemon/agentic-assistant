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

    const messages = history.getAll();

    // Debug visibility
    console.log("\nMESSAGE HISTORY:\n");
    console.dir(messages, { depth: null });

    const response = await generateResponse(messages);

    console.log("\nMODEL RESPONSE:\n");
    console.log(response);

    // Save assistant response
    history.add("assistant", response);

    const parsed = parseAgentResponse(response);

    console.log("\nPARSED RESPONSE:\n");
    console.dir(parsed, { depth: null });

    // FINAL ANSWER
    if (parsed.finalAnswer) {
      console.log("\nFINAL ANSWER:\n");
      console.log(parsed.finalAnswer);

      return;
    }

    // TOOL CALL
    if (parsed.toolCall) {
      const { tool, args } = parsed.toolCall;

      console.log(`\nTOOL REQUESTED: ${tool}`);
      console.log("ARGS:", args);

      const selectedTool = tools[tool];

      // Tool does not exist
      if (!selectedTool) {
        const errorObservation = `
TOOL ERROR:
Tool "${tool}" does not exist.
`;

        console.log(errorObservation);

        // IMPORTANT:
        // DO NOT use role: "tool"
        history.add("user", errorObservation);

        continue;
      }

      try {
        const result = await selectedTool(...Object.values(args));

        const observation = `
TOOL RESULT:
Tool: ${tool}

Output:
${result}
`;

        console.log("\nTOOL RESULT:\n");
        console.log(observation);

        // IMPORTANT:
        // ReAct-style loops feed observations back as user/system context
        history.add("user", observation);
      } catch (err: any) {
        const errorObservation = `
TOOL ERROR:
Tool: ${tool}

Message:
${err.message}
`;

        console.log("\nTOOL ERROR:\n");
        console.log(errorObservation);

        history.add("user", errorObservation);
      }

      continue;
    }

    // INVALID OUTPUT
    console.log("\nAgent produced invalid response format.");
    break;
  }

  console.log("\nAgent stopped: max iterations reached.");
}
