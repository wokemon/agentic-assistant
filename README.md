# Agentic Assistant

A TypeScript-based AI coding agent that autonomously investigates, modifies, and validates codebases through a structured tool-execution architecture.

## Features

- 🤖 LLM-powered agent with multi-step reasoning loop
- 🔧 Structured tool-calling system
- 📁 File system operations
  - List files
  - Read files
  - Write files

- 🧠 Working memory and conversation history management
- ⚙️ Execution middleware for validation, logging, and tool orchestration
- 🛡️ Built-in safety mechanisms
  - Loop detection
  - Timeout protection (caps agent waiting; underlying process not cancelled)
  - Path validation
  - Malformed response handling

- 📊 Structured diagnostics and observability
- 🧪 Automated testing with Vitest
- 📝 Comprehensive logging with Pino
- ⚡ TypeScript-first architecture

---

## Project Status

Current MVP supports:

- Autonomous tool usage
- Multi-step reasoning
- Repository investigation workflows
- Safe file modification
- Structured agent execution

Planned next capabilities:

- Git integration
  - git status
  - git diff

- Test execution
- Build execution
- Context summarization
- Web UI

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
pnpm install
```

### Configuration

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-5.4-nano-2026-03-17
MAX_CONTEXT_TOKENS=100000
```

### Environment Variables

| Variable        | Required | Description                       |
| --------------- | -------- | --------------------------------- |
| OPENAI_API_KEY  | Yes      | API key for model provider        |
| OPENAI_BASE_URL | No       | Custom OpenAI-compatible endpoint |
| LLM_MODEL       | No       | Model identifier                  |
| MAX_CONTEXT_TOKENS | No    | Max context token budget (estimate) |

---

## Running the Agent

Development mode:

```bash
pnpm dev
```

Example tasks:

```text
List all TypeScript files in src

Analyze this repository structure

Find potential dead code

Read package.json and summarize the project

Investigate why the build is failing
```

---

## Building

```bash
pnpm build
```

Output:

```text
dist/
```

---

## Running Tests

Run all tests:

```bash
pnpm test
```

Watch mode:

```bash
pnpm test -- --watch
```

Coverage:

```bash
pnpm test -- --coverage
```

---

## Typecheck

```bash
pnpm typecheck
```

---

## Available Tools

### list_files

Lists files and directories.

Example:

```json
{
  "tool": "list_files",
  "args": {
    "path": "./src"
  }
}
```

---

### read_files

Reads one or more files.

Example:

```json
{
  "tool": "read_files",
  "args": {
    "paths": ["src/index.ts", "package.json"],
    "preview": false
  }
}
```

---

### write_files

Writes content to files.

Example:

```json
{
  "tool": "write_files",
  "args": {
    "files": [
      {
        "path": "output.txt",
        "content": "Hello World"
      }
    ]
  }
}
```

---

### read_file_lines

Reads a line range from a file.

Example:

```json
{
  "tool": "read_file_lines",
  "args": {
    "filePath": "src/agent/loop.ts",
    "startLine": 1,
    "endLine": 20
  }
}
```

---

### search_files

Searches the workspace for text and returns matching file paths.

Example:

```json
{
  "tool": "search_files",
  "args": {
    "query": "ToolDefinition",
    "directory": "."
  }
}
```

---

### find_files

Recursively searches for file names (substring/pattern) and returns matching file paths.

Example:

```json
{
  "tool": "find_files",
  "args": {
    "pattern": "loop",
    "directory": "."
  }
}
```

---

### terminal_execute

Executes a shell command.

Example:

```json
{
  "tool": "terminal_execute",
  "args": {
    "command": "pnpm test",
    "timeoutMs": 30000
  }
}
```

---

### git_status

Returns current git status.

Example:

```json
{
  "tool": "git_status",
  "args": {
    "includeUntracked": true
  }
}
```

---

### git_diff

Returns a git diff.

Example:

```json
{
  "tool": "git_diff",
  "args": {
    "staged": false,
    "file": "src/agent/executor.ts"
  }
}
```

---

### run_tests

Runs the test suite (Vitest).

Example:

```json
{
  "tool": "run_tests",
  "args": {
    "target": "all",
    "testFile": "tests/agent/loop.test.ts"
  }
}
```

---

### build_project

Builds the project.

Example:

```json
{
  "tool": "build_project",
  "args": {}
}
```

---

## Architecture

```text
src/
├── agent/
│   ├── loop.ts
│   ├── executor.ts
│   ├── parser.ts
│   ├── history.ts
│   └── state.ts
│
├── tools/
 │   ├── filesystem/
 │   ├── git/
 │   ├── project/
 │   ├── testing/
 │   └── registry.ts
│
├── context/
│   └── workingMemory.ts
│
├── llm/
│   └── client.ts
│
├── safety/
│   ├── loopGuards.ts
│   └── pathValidation.ts
│
├── shared/
│   ├── logger.ts
│   └── types.ts
│
└── cli/
```

---

## How It Works

### Agent Loop

```text
User Request
      ↓
Generate Response
      ↓
Parse Tool Call
      ↓
Validate Request
      ↓
Execute Tool
      ↓
Observe Result
      ↓
Repeat
      ↓
Final Answer
```

The agent follows a reasoning-action-observation cycle until:

- A final answer is produced
- Maximum iterations are reached
- A safety guard terminates execution

---

## Safety Features

### Loop Guard

Prevents repetitive tool-call cycles.

### Timeout Protection

Tool execution is capped by a timeout on the agent’s waiting period (the underlying process is not cancelled by default).

### Structured Parsing

All model responses pass through schema validation.

### Tool Validation

Tool inputs are validated before execution.

### Execution Boundary

All tool execution flows through a centralized executor responsible for:

- Validation
- Logging
- Error normalization
- Safety enforcement

---

## Diagnostics

Agent runs return structured metadata including:

- Iteration count
- Tool call count
- Tool failures
- Parsing failures

This improves debugging, testing, and future observability.

---

## Development Roadmap

### Phase 1 (Completed)

- Agent loop
- Tool calling
- File operations
- Safety guards

### Phase 2 (Current)

- Executor abstraction
- Structured agent results
- Context management
- Test coverage

### Phase 3

- Git tools
- Build execution
- Test execution
- Repository analysis improvements

### Phase 4

- Web UI
- Streaming updates
- Session persistence

---

## License

ISC
