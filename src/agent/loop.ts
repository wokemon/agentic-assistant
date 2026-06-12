import type { AgentResult } from "../shared/types";
import { WorkingMemory } from "../context/workingMemory";
import { runAgentTask } from "./runner";

export async function runAgent(userInput: string): Promise<AgentResult> {
  return runAgentTask(userInput, new WorkingMemory(), () => {
    // noop: legacy runAgent has no observability hooks
  });
}
