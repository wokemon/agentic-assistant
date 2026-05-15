import { Message } from "../shared/types";

export class MessageHistory {
  private messages: Message[] = [];

  add(role: Message["role"], content: string) {
    this.messages.push({ role, content });
  }

  getAll() {
    return this.messages;
  }

  clear() {
    this.messages = [];
  }
}
