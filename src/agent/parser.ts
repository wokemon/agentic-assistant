import { AgentResponse, ToolCall } from "./types";

export function parseAgentResponse(content: string): AgentResponse {
  try {
    const parsed: ToolCall = JSON.parse(content);

    if (parsed.tool) {
      return {
        toolCall: parsed,
      };
    }
  } catch {
    // not JSON
  }

  return {
    finalAnswer: content,
  };
}
