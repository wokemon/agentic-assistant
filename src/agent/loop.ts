import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { SYSTEM_PROMPT } from "./prompt";
import { tools } from "../tools/registry";
import { Message } from "./types";

const MAX_ITERATIONS = 5;

export async function runAgent(userInput: string) {
  const history: Message[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: userInput,
    },
  ];

  let malformedCount = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // ----------------------------
    // 1. GENERATE MODEL RESPONSE
    // ----------------------------

    const rawResponse = await generateResponse(history);

    history.push({
      role: "assistant",
      content: rawResponse,
    });

    // ----------------------------
    // 2. PARSE RESPONSE
    // ----------------------------

    const parsed = parseAgentResponse(rawResponse);

    // ----------------------------
    // 3. HANDLE PARSE FAILURES
    // ----------------------------

    if (!parsed.success) {
      malformedCount++;

      console.error("Parse error:", parsed.error);

      history.push({
        role: "system",
        content: "Your previous response was invalid. Return valid JSON only.",
      });

      if (malformedCount >= 3) {
        return "Agent stopped: too many malformed responses.";
      }

      continue;
    }

    const response = parsed.data;

    // ----------------------------
    // 4. FINAL ANSWER
    // ----------------------------

    if (response.finalAnswer) {
      return response.finalAnswer;
    }

    // ----------------------------
    // 5. TOOL EXECUTION
    // ----------------------------

    if (response.toolCall) {
      const tool = tools[response.toolCall.tool];

      if (!tool) {
        history.push({
          role: "system",
          content: `Tool "${response.toolCall.tool}" does not exist.`,
        });

        continue;
      }

      try {
        const result = await tool.execute(response.toolCall.args);

        history.push({
          role: "system",
          content: `Tool result:\n${JSON.stringify(result)}`,
        });
      } catch (error) {
        history.push({
          role: "system",
          content:
            error instanceof Error ? error.message : "Unknown tool error",
        });
      }
    }
  }

  return "Agent stopped: max iterations reached.";
}
