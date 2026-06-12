import { Message } from "../shared/types";
import { logger } from "../shared/logger";

export class MessageHistory {
  private messages: Message[] = [];
  private maxRetained: number;

  // Defaults to retaining the last 10 messages to keep the context window light
  constructor(maxRetained: number = 10) {
    this.maxRetained = maxRetained;
  }

  add(role: Message["role"], content: string) {
    this.messages.push({ role, content });
    this.enforceSlidingWindow();
  }

  getAll(): Message[] {
    return [...this.messages];
  }

  toState(): { maxRetained: number; messages: Message[] } {
    return { maxRetained: this.maxRetained, messages: [...this.messages] };
  }

  static fromState(state: {
    maxRetained: number;
    messages: Message[];
  }): MessageHistory {
    const history = new MessageHistory(state.maxRetained);
    history.messages = [...state.messages];
    history.enforceSlidingWindow();
    return history;
  }

  clear() {
    this.messages = [];
  }

  private enforceSlidingWindow() {
    // If the history exceeds our maximum retained messages, prune the oldest ones.
    // Since ContextBuilder injects the system prompt dynamically, we can safely prune from index 0.
    if (this.messages.length > this.maxRetained) {
      const excess = this.messages.length - this.maxRetained;

      // Remove the oldest 'excess' messages
      this.messages.splice(0, excess);

      logger.debug(
        { prunedCount: excess, currentLength: this.messages.length },
        "Sliding window triggered: older messages pruned from history",
      );
    }
  }
}
