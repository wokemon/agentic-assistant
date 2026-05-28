import { Message } from "../shared/types";
import { logger } from "../shared/logger";

export class MessageHistory {
  private messages: Message[] = [];
  private maxRetained: number;

  /**
   * @param systemPrompt - The core instruction set, permanently pinned at index 0.
   * @param maxRetained - The maximum number of recent messages to keep (default: 10).
   */
  constructor(systemPrompt: string, maxRetained: number = 10) {
    this.maxRetained = maxRetained;
    // 1. Pin the SYSTEM_PROMPT at index 0 immediately upon instantiation
    this.messages.push({ role: "system", content: systemPrompt });
  }

  /**
   * Adds a new message and enforces the sliding window constraint.
   */
  add(role: Message["role"], content: string): void {
    this.messages.push({ role, content });
    this.enforceSlidingWindow();
  }

  /**
   * Safely prunes the array while protecting the system prompt.
   */
  private enforceSlidingWindow(): void {
    // Maximum allowed = 1 (System Prompt) + maxRetained (Recent Context)
    const maxTotal = this.maxRetained + 1;

    if (this.messages.length > maxTotal) {
      const excess = this.messages.length - maxTotal;

      // Remove elements starting from index 1 (preserving index 0)
      this.messages.splice(1, excess);

      logger.debug(
        {
          prunedCount: excess,
          currentLength: this.messages.length,
        },
        "Sliding window enforced, older messages pruned",
      );
    }
  }

  /**
   * Returns the entire current context window for the LLM.
   */
  getAll(): Message[] {
    return this.messages;
  }

  /**
   * Clears the history but strictly retains the system prompt.
   */
  clear(newSystemPrompt?: string): void {
    const promptToKeep = newSystemPrompt || this.messages[0]?.content || "";
    this.messages = [{ role: "system", content: promptToKeep }];

    logger.debug("Message history cleared (System prompt retained)");
  }
}
