import { Message } from "../shared/types";
import { WorkingMemory } from "./workingMemory";
import { MessageHistory } from "../agent/history";
import { SYSTEM_PROMPT } from "../agent/prompt";
import { MAX_CONTEXT_TOKENS } from "../shared/config";

// Fast zero-dependency heuristic: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

export class ContextBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextBudgetExceededError";
  }
}

export function buildContext(
  history: MessageHistory,
  memory: WorkingMemory,
  currentTask: string,
): Message[] {
  const state = memory.getState();

  // 1. Structural Memory Layout (P1)
  // Formatted cleanly with Markdown lists for optimal LLM parsing
  // Now explicitly exposes the intent/reason behind file inspections
  const memoryContent = `
=== CURRENT WORKING MEMORY ===

OPEN FILES
${state.openedFiles.length > 0 ? state.openedFiles.map((f) => `- ${f.path}\n  Reason: ${f.reason || "General inspection"}`).join("\n") : "- None"}

FACTS
${state.facts.length > 0 ? state.facts.map((f) => `- ${f}`).join("\n") : "- None"}

PROGRESS
${state.summaries.length > 0 ? state.summaries.map((s) => `- ${s}`).join("\n") : "- None"}
`.trim();

  // 2. Priority-Based Context Assembly (P2)
  // System Prompt ↓ Working Memory ↓ Current Task
  const dynamicSystemContent = `
${SYSTEM_PROMPT}

${memoryContent}

=== CURRENT TASK ===
${currentTask}
`.trim();

  const baseContext: Message[] = [
    { role: "system", content: dynamicSystemContent },
  ];

  // 3. Token Budget Enforcement (P0)
  const baseChars = dynamicSystemContent.length;
  const baseTokens = Math.ceil(baseChars / CHARS_PER_TOKEN);

  // If the immutable core instructions are too large, the agent cannot function safely.
  if (baseTokens > MAX_CONTEXT_TOKENS) {
    throw new ContextBudgetExceededError(
      `Base context (${baseTokens} tokens) exceeds maximum budget of ${MAX_CONTEXT_TOKENS} tokens. Clear working memory or reduce task scope.`,
    );
  }

  // 4. Safe History Pruning
  let remainingTokens = MAX_CONTEXT_TOKENS - baseTokens;
  const safeHistory: Message[] = [];
  const rawHistory = history.getAll();

  // Iterate backwards to prioritize keeping the most recent actions, dropping the oldest.
  for (let i = rawHistory.length - 1; i >= 0; i--) {
    const msg = rawHistory[i];
    const msgTokens = Math.ceil((msg.content.length || 0) / CHARS_PER_TOKEN);

    if (remainingTokens - msgTokens > 0) {
      safeHistory.unshift(msg); // Add to the front to maintain chronological order
      remainingTokens -= msgTokens;
    } else {
      // The budget is exhausted. We stop ingesting older history.
      break;
    }
  }

  // Return the final prioritized payload
  return [...baseContext, ...safeHistory];
}
