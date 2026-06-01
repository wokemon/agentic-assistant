import { Message } from "../shared/types";
import { WorkingMemory } from "./workingMemory";
import { MessageHistory } from "../agent/history";
import { SYSTEM_PROMPT } from "../agent/prompt";

export function buildContext(
  history: MessageHistory,
  memory: WorkingMemory,
  currentTask: string,
): Message[] {
  const state = memory.getState();

  // Dynamically inject memory into the system instructions
  const dynamicSystemContent = `
${SYSTEM_PROMPT}

=== CURRENT WORKING MEMORY ===
Facts Discovered: ${state.facts.length > 0 ? state.facts.join(" | ") : "None"}
Files Opened: ${state.openedFiles.length > 0 ? state.openedFiles.join(", ") : "None"}
Task Progress Summaries: ${state.summaries.length > 0 ? state.summaries.join("\n- ") : "None"}

=== CURRENT TASK ===
${currentTask}
`;

  // Assemble the final context payload
  const context: Message[] = [
    { role: "system", content: dynamicSystemContent.trim() },
    ...history.getAll(), // This now only contains the safe, pruned sliding window
  ];

  return context;
}
