import { AgentResponse, ToolCall } from "./types";

export function parseAgentResponse(content: string): AgentResponse {
  const trimmed = content.trim();

  // TOOL CALL
  try {
    const parsed: ToolCall = JSON.parse(trimmed);

    if (parsed.tool) {
      return {
        toolCall: parsed,
      };
    }
  } catch {
    // not json
  }

  // FINAL ANSWER
  if (trimmed.startsWith("FINAL:")) {
    return {
      finalAnswer: trimmed.replace("FINAL:", "").trim(),
    };
  }

  // INVALID RESPONSE
  return {};
}
