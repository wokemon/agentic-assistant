# AGENT.md

This file provides guidance for AI agents (Claude Code, GitHub Copilot, etc.) working in the `agentic-assistant` codebase.

---

## Project Overview

`agentic-assistant` is a TypeScript AI coding agent that autonomously investigates, modifies, and validates codebases through a structured tool-execution architecture. It uses an LLM-powered reasoning loop with file system, git, terminal, and test execution tools.

**Stack:** TypeScript · Node.js 18+ · pnpm · tsx (dev) · Vitest · Pino · Zod · OpenAI SDK

---

## Repository Structure

```
src/
├── agent/
│   ├── loop.ts          # Main agent reasoning loop
│   ├── executor.ts      # Centralized tool execution + safety enforcement
│   ├── parser.ts        # LLM response parsing and schema validation
│   ├── history.ts       # Conversation history management
│   └── state.ts         # Agent state
├── tools/
│   ├── filesystem/      # list_files, read_files, write_files, read_file_lines, search_files, find_files
│   ├── git/             # git_status, git_diff
│   ├── project/         # build_project, terminal_execute
│   ├── testing/         # run_tests
│   └── registry.ts      # Tool registry
├── context/
│   └── workingMemory.ts # Working memory / context window management
├── llm/
│   └── client.ts        # OpenAI-compatible LLM client
├── safety/
│   ├── loopGuards.ts    # Repetitive tool-call detection
│   └── pathValidation.ts
├── shared/
│   ├── logger.ts        # Pino logger
│   └── types.ts         # Shared TypeScript types
└── cli/                 # CLI entry point
tests/                   # Vitest tests mirroring src/ structure
.opencode/skills/        # OpenCode skill definitions
```

---

## Common Commands

```bash
# Install dependencies
pnpm install

# Run in development mode (tsx, no build step needed)
pnpm dev

# Build to dist/
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests with coverage
pnpm test -- --coverage

# Type-check without emitting
pnpm typecheck
```

---

## Environment Setup

Create a `.env` file in the project root before running:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1   # optional; override for compatible providers
LLM_MODEL=gpt-4o                             # optional; defaults may vary
MAX_CONTEXT_TOKENS=100000                    # optional; controls context budget
```

`OPENAI_BASE_URL` accepts any OpenAI-compatible endpoint, so this project works with Anthropic, Azure OpenAI, Ollama, etc. by pointing the base URL accordingly.

---

## Architecture Notes

### Agent Loop (`src/agent/loop.ts`)

The core loop follows a **reasoning → tool call → observation** cycle:

```
User Request → Generate Response → Parse Tool Call → Validate → Execute → Observe → Repeat → Final Answer
```

Termination conditions: final answer produced · max iterations reached · safety guard triggered.

### Executor (`src/agent/executor.ts`)

All tool calls flow through a single executor responsible for validation, logging, error normalization, and safety enforcement. **Do not bypass the executor** when adding new tools — route everything through it.

### Tool Registry (`src/tools/registry.ts`)

Tools are registered here. When adding a new tool: (1) implement it in the appropriate `src/tools/<category>/` directory, (2) define its Zod input schema, (3) register it in `registry.ts`.

### Parser (`src/agent/parser.ts`)

All LLM responses pass through schema validation before execution. If you change the tool call format, update the parser and its tests.

### Safety (`src/safety/`)

- **Loop guard** — detects and breaks repetitive tool-call cycles.
- **Path validation** — blocks path traversal and out-of-workspace writes.
- **Timeout** — caps the agent's wait on tool execution (the underlying process is not forcefully killed).

Do not weaken these guards without explicit discussion.

---

## Coding Conventions

- **TypeScript strict mode** — all new code must typecheck cleanly (`pnpm typecheck`).
- **Zod for runtime validation** — use Zod schemas for tool inputs and LLM response parsing; avoid ad-hoc `JSON.parse` without validation.
- **Pino for logging** — use the shared logger from `src/shared/logger.ts`; do not use `console.log` in production paths.
- **No side effects at import** — modules must not execute work on require/import.
- **Tests alongside source** — new tools and agent changes should have corresponding Vitest tests in `tests/`.

---

## Adding a New Tool

1. Create `src/tools/<category>/<toolName>.ts` with the tool implementation.
2. Define a Zod schema for the tool's arguments in the same file.
3. Export a `ToolDefinition` object (see existing tools for the shape).
4. Register the tool in `src/tools/registry.ts`.
5. Add a test in `tests/tools/<category>/<toolName>.test.ts`.
6. Run `pnpm typecheck && pnpm test` to confirm everything passes.

---

## Testing

Tests use **Vitest**. Run `pnpm test` before committing any changes. The test suite covers the agent loop, executor, parser, safety guards, and individual tools. When modifying agent or executor logic, ensure existing tests still pass and add regression tests for any bugs fixed.

---

## Current Phase (Phase 4)

Active work is on: Web UI · Streaming updates · Session persistence. The agent core (loop, executor, parser, safety) is considered stable. Prefer incremental, well-tested changes to core components.

---

## Out of Scope / Known Limitations

- Timeout cancels the agent's wait period only; the underlying shell process (e.g. from `terminal_execute`) is not forcefully terminated.
- No authentication or multi-user support yet.
- Context summarization is planned but not yet implemented — long sessions may hit token limits.
