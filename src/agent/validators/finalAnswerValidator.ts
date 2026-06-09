import { WorkingMemory } from "../context/workingMemory";
import { AgentState } from "./state";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinalAnswerValidationInput {
  userInput: string;
  state: AgentState;
  memory: WorkingMemory;
  toolCalls: number;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

// ─── Helpers (private) ────────────────────────────────────────────────────────

function requiresVerification(userInput: string): boolean {
  const text = userInput.toLowerCase();
  return [
    "regression",
    "regressions",
    "no regressions",
    "run tests",
    "run the tests",
    "verify tests",
    "check tests",
    "run build",
    "run the build",
    "verify build",
    "still compiles",
    "still works",
    "doesn't break",
    "does not break",
  ].some((keyword) => text.includes(keyword));
}

function requiresRepositoryInspection(userInput: string): boolean {
  return [
    /\.tsx?/i,
    /\.jsx?/i,
    /\.json/i,
    /\bthis file\b/i,
    /\brepository\b/i,
    /\brepo\b/i,
    /\binspect\b/i,
    /\banalyze\b.*\bcode\b/i,
    /\breview\b.*\bimplementation\b/i,
  ].some((pattern) => pattern.test(userInput));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function extractRequestedFile(userInput: string): string | null {
  const match = userInput.match(/\b[\w.-]+\.(ts|tsx|js|jsx|json|md)\b/i);
  return match?.[0] ?? null;
}

export function validateFinalAnswer(
  input: FinalAnswerValidationInput,
): ValidationResult {
  const { userInput, state, memory, toolCalls } = input;

  const needsRepoInspection = requiresRepositoryInspection(userInput);
  const needsVerification = requiresVerification(userInput);
  const requestedFile = extractRequestedFile(userInput);

  if (needsRepoInspection && toolCalls === 0) {
    return {
      valid: false,
      message: `Your answer requires repository evidence.

You have not used any tools yet.

Before returning FINAL:

1. Use tools to inspect the repository.
2. Gather evidence.
3. Then answer.

Do not answer from assumptions.`,
    };
  }

  if (needsVerification && !state.verificationEvidence) {
    return {
      valid: false,
      message: `Your answer requires verification evidence.

You have not yet executed any verification tools.

Use available tools such as:

- run_tests
- build_project

Gather evidence before returning FINAL.`,
    };
  }

  if (needsRepoInspection && !state.repositoryInspected) {
    return {
      valid: false,
      message: `Your answer requires inspecting repository source files.

You have used tools, but have not read any source files yet.

Read the relevant source files before returning FINAL.

Do not answer from assumptions about file contents.`,
    };
  }

  if (requestedFile && !memory.hasOpenedFile(requestedFile)) {
    return {
      valid: false,
      message: `The user explicitly requested analysis of:

${requestedFile}

You have not read that file yet.

Locate and read the file before answering.`,
    };
  }

  return { valid: true };
}
