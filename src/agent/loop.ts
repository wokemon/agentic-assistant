import crypto from "crypto";
import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { tools } from "../tools/registry";
import { LoopGuard } from "../safety/loopGuards";
import { logger } from "../shared/logger";
import { executeToolCall } from "./executor";
import { MessageHistory } from "./history";
import { WorkingMemory } from "../context/workingMemory";
import { buildContext } from "../context/contextBuilder";

const MAX_ITERATIONS = 10;

export async function runAgent(userInput: string) {
  const sessionId = crypto.randomUUID();
  const agentLogger = logger.child({ component: "agent_loop", sessionId });

  agentLogger.info({ userInput }, "Starting agent run");

  const loopGuard = new LoopGuard();

  // 1. Initialize the new architecture correctly
  const history = new MessageHistory();
  const memory = new WorkingMemory();

  let malformedCount = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // 2. Build the context dynamically BEFORE passing to the LLM
    const context = buildContext(history, memory, userInput);

    agentLogger.info(
      { iteration, contextLength: context.length },
      "Starting loop iteration",
    );

    // 3. Pass the managed context, NOT the raw history array
    const rawResponse = await generateResponse(context);

    // Add the assistant's response to the sliding window
    history.add("assistant", rawResponse);

    const parsed = parseAgentResponse(rawResponse);

    if (!parsed.success) {
      malformedCount++;
      history.add(
        "system",
        "Your previous response was invalid. Return valid JSON only.",
      );
      if (malformedCount >= 3)
        return "Agent stopped: too many malformed responses.";
      continue;
    }

    const response = parsed.data;

    if (response.finalAnswer) {
      return response.finalAnswer;
    }

    if (response.toolCall) {
      const { tool: toolName, args } = response.toolCall;

      if (!tools[toolName]) {
        history.add("system", `Tool "${toolName}" does not exist.`);
        continue;
      }

      if (loopGuard.isRepeating(toolName, args)) {
        return `Agent stopped: repeating tool call detected (${toolName}).`;
      }
      loopGuard.addAction(toolName, args);

      // Example of populating Working Memory passively:
      // If the agent opens a file, track it automatically so it doesn't have to guess later.
      if (toolName === "read_file_lines" || toolName === "read_files") {
        memory.addOpenedFile(args.path || args.paths?.[0]);
      }

      const result = await executeToolCall(toolName, args);

      // 4. Add the raw result to the sliding window (which will prune old ones)
      history.add("system", `Tool result:\n${JSON.stringify(result)}`);
    }
  }

  return "Agent stopped: max iterations reached.";
}
