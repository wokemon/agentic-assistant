import { AgentRuntime } from "../runtime";
import { extractRequestedFile } from "../validators/finalAnswerValidator";
import type { AgentResult } from "../../shared/types";

// ─── Malformed Response Processor ────────────────────────────────────────────

export type MalformedProcessorOutcome =
  | { kind: "continue" }
  | { kind: "abort"; result: AgentResult };

export function processMalformedResponse(
  parseError: string,
  userInput: string,
  runtime: AgentRuntime,
): MalformedProcessorOutcome {
  const { state, history, memory, loopGuard, diagnostics } = runtime;

  state.malformedCount++;
  diagnostics.malformedResponses++;

  // If the agent is producing garbage but has already called tools, nudge it
  // toward the file it was asked about rather than firing the generic error.
  const requestedFile = extractRequestedFile(userInput);
  if (
    requestedFile &&
    diagnostics.toolCalls > 0 &&
    !memory.hasOpenedFile(requestedFile)
  ) {
    history.add(
      "system",
      `
The user explicitly requested analysis of:

${requestedFile}

You have not read that file yet.

Locate and read the file before answering.
`,
    );
    return { kind: "continue" };
  }

  loopGuard.trackParseFailure();

  history.add(
    "system",
    `Your previous response was invalid (${parseError}). Return valid JSON only.`,
  );

  if (state.malformedCount >= 3 || loopGuard.isRunaway()) {
    return {
      kind: "abort",
      result: {
        status: "parse_failure",
        diagnostics,
      },
    };
  }

  return { kind: "continue" };
}
