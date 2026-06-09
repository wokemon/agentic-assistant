import crypto from "crypto";
import type { AgentResult } from "../shared/types";
import { parseAgentResponse } from "./parser";
import { generateResponse } from "../llm/client";
import { LoopGuard } from "../safety/loopGuards";
import { logger } from "../shared/logger";
import { executeToolCall } from "./executor";
import { MessageHistory } from "./history";
import { WorkingMemory } from "../context/workingMemory";
import { buildContext } from "../context/contextBuilder";

const MAX_ITERATIONS = 10;

function requiresVerification(userInput: string): boolean {
  const text = userInput.toLowerCase();

  return [
    "regression",
    "regressions",
    "break",
    "broken",
    "verify",
    "verification",
    "test",
    "tests",
    "build",
    "compile",
    "compiled",
    "working",
    "still work",
  ].some((keyword) => text.includes(keyword));
}

function requiresRepositoryInspection(userInput: string): boolean {
  const text = userInput.toLowerCase();

  return [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    "file",
    "class",
    "function",
    "method",
    "implementation",
    "code",
    "repository",
    "repo",
    "review",
    "analyze",
    "inspect",
    "locate",
    "find",
  ].some((keyword) => text.includes(keyword));
}

function claimsExecution(text: string): boolean {
  return /\b(ran|executed|tested|built|compiled|verified)\b/i.test(text);
}

function extractRequestedFile(userInput: string): string | null {
  const match = userInput.match(/\b[\w.-]+\.(ts|tsx|js|jsx|json|md)\b/i);

  return match?.[0] ?? null;
}

const VERIFICATION_TOOLS = new Set(["run_tests", "build_project"]);

export async function runAgent(userInput: string): Promise<AgentResult> {
  const sessionId = crypto.randomUUID();
  const agentLogger = logger.child({ component: "agent_loop", sessionId });

  agentLogger.info({ userInput }, "Starting agent run");

  const loopGuard = new LoopGuard();

  // 1. Initialize the new architecture correctly
  const history = new MessageHistory();
  const memory = new WorkingMemory();

  let malformedCount = 0;
  let verificationPerformed = false;

  const diagnostics = {
    iterations: 0,
    toolCalls: 0,
    toolFailures: 0,
    malformedResponses: 0,
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    diagnostics.iterations = iteration + 1;
    // 2. Build the context dynamically BEFORE passing to the LLM
    const context = buildContext(history, memory, userInput);

    agentLogger.info(
      { iteration, contextLength: context.length },
      "Starting loop iteration",
    );

    let rawResponse: string;

    // 3. P0-2: Context Budget Enforcement
    try {
      rawResponse = await generateResponse(context);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ContextBudgetExceededError"
      ) {
        agentLogger.error("Agent stopped: Context budget exceeded.");
        return {
          status: "context_budget_exceeded",
          diagnostics,
        };
      }
      throw error; // Re-throw unknown errors
    }

    const parsed = parseAgentResponse(rawResponse);

    if (!parsed.success) {
      malformedCount++;
      diagnostics.malformedResponses++;

      const requestedFile = extractRequestedFile(userInput);

      if (
        requestedFile &&
        diagnostics.toolCalls > 0 &&
        !memory.hasOpenedFile(requestedFile)
      ) {
        agentLogger.warn(
          {
            requestedFile,
          },
          "Requested file was never read",
        );

        history.add(
          "system",
          `
The user explicitly requested analysis of:

${requestedFile}

You have not read that file yet.

Locate and read the file before answering.
`,
        );

        continue;
      }

      loopGuard.trackParseFailure();
      agentLogger.warn(
        { malformedCount, error: parsed.error },
        "Malformed response",
      );

      history.add(
        "system",
        `Your previous response was invalid (${parsed.error}). Return valid JSON only.`,
      );

      if (malformedCount >= 3) {
        agentLogger.error("Agent stopped due to repeated malformed responses.");
        return {
          status: "parse_failure",
          diagnostics,
        };
      }

      if (loopGuard.isRunaway()) {
        agentLogger.error("Agent detected runaway pattern");
        return {
          status: "parse_failure",
          diagnostics,
        };
      }

      continue;
    }

    // Architectural Fix: Only store valid responses in history
    history.add("assistant", rawResponse);

    const response = parsed.data;

    if (response.finalAnswer) {
      const needsVerification = requiresVerification(userInput);

      if (
        requiresRepositoryInspection(userInput) &&
        diagnostics.toolCalls === 0
      ) {
        agentLogger.warn(
          {
            finalAnswer: response.finalAnswer,
          },
          "Repository answer rejected due to lack of evidence",
        );

        history.add(
          "system",
          `
Your answer requires repository evidence.

You have not inspected the repository.

Before returning FINAL:

1. Use tools to inspect the repository.
2. Gather evidence.
3. Then answer.

Do not answer from assumptions.
`,
        );

        continue;
      }

      if (needsVerification && !verificationPerformed) {
        agentLogger.warn(
          {
            finalAnswer: response.finalAnswer,
          },
          "Verification claim rejected due to lack of evidence",
        );

        history.add(
          "system",
          `
Your answer requires repository verification.

You have not yet executed any verification tools.

Use available tools such as:

- run_tests
- build_project

Gather evidence before returning FINAL.
`,
        );

        continue;
      }

      if (
        claimsExecution(response.finalAnswer) &&
        diagnostics.toolCalls === 0
      ) {
        agentLogger.warn(
          {
            finalAnswer: response.finalAnswer,
          },
          "Execution claim rejected because no tools were used",
        );

        history.add(
          "system",
          `
You claimed to execute an action.

No tools have been executed.

Do not claim:
- tests were run
- builds succeeded
- commands executed

unless tool output confirms it.
`,
        );

        continue;
      }

      agentLogger.info(
        {
          iterations: iteration + 1,
          finalAnswer: response.finalAnswer,
        },
        "Agent completed successfully",
      );

      return {
        status: "completed",
        finalAnswer: response.finalAnswer,
        diagnostics,
      };
    }

    if (response.toolCall) {
      const { tool: toolName, args } = response.toolCall;
      if (VERIFICATION_TOOLS.has(toolName)) {
        verificationPerformed = true;
      }

      if (loopGuard.isRepeating(toolName, args)) {
        history.add(
          "system",
          `You already executed:

        Tool: ${toolName}

        with identical arguments.

        Do not repeat the same action.

        Use the information already gathered and choose a different action.`,
        );

        continue;
      }
      loopGuard.addAction(toolName, args);

      // Populate Working Memory passively:
      if (toolName === "read_files") {
        for (const path of args.paths ?? []) {
          memory.addOpenedFile(path);
        }
      }

      if (toolName === "read_file_lines") {
        memory.addOpenedFile(args.path);
      }

      diagnostics.toolCalls++;

      const result = await executeToolCall(toolName, args);

      if (!result.success) {
        diagnostics.toolFailures++;
        loopGuard.trackFailure(toolName, args);

        if (loopGuard.isRepeatedlyFailing(toolName, args)) {
          agentLogger.warn({ tool: toolName }, "Tool repeatedly failing");
        }
      }

      if (result.success) {
        // 1. Route the actual data to Working Memory instead of History
        if (toolName === "read_files" || toolName === "read_file_lines") {
          const pathInfo =
            args.path || (args.paths ? args.paths.join(", ") : "files");
          memory.addFact(`Content of ${pathInfo}:\n${result.output}`);
        } else if (
          toolName === "search_files" ||
          toolName === "terminal_execute" ||
          toolName === "git_status" ||
          toolName === "git_diff"
        ) {
          memory.addFact(`Tool ${toolName} discovered:\n${result.output}`);
        } else if (VERIFICATION_TOOLS.has(toolName)) {
          memory.addFact(
            `Verification (${toolName}) output:\n${result.output}`,
          );
        } else {
          memory.addSummary(`Executed ${toolName} successfully.`);
        }
      } else {
        // Add errors as facts so the agent knows what to fix
        memory.addFact(`Tool ${toolName} failed with error:\n${result.error}`);
      }

      // 2. Put a LIGHTWEIGHT observation in the actual history log
      history.add(
        "system",
        `Observation: Tool '${toolName}' completed ${result.success ? "successfully" : "with errors"}. Results added to working memory.`,
      );

      // ==========================================
    }
  }

  // P1-3: Missing Final Logging
  agentLogger.info(
    { iterations: MAX_ITERATIONS },
    "Agent stopped due to max iterations",
  );
  return {
    status: "max_iterations",
    diagnostics,
  };
}
