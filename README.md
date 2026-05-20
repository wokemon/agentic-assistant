# Agentic Assistant

A TypeScript AI coding agent MVP that leverages LLMs to autonomously execute file system operations through a tool-based architecture.

## Features

- 🤖 LLM-powered autonomous agent with structured tool calling
- 📁 File system tools: list, read, and write files
- 🔒 Built-in safety features (loop guard, timeout protection)
- 📊 Comprehensive logging with Pino
- 🧪 Full test coverage with Vitest
- ⚡ Fast development with Tsx

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 11.0.9+

### Installation

```bash
pnpm install
```

### Configuration

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL=gpt-4-turbo
```

**Environment Variables:**

- `OPENAI_API_KEY` (required): Your OpenAI/OpenRouter API key
- `OPENAI_BASE_URL` (optional): Custom API endpoint (defaults to OpenAI)
- `MODEL` (optional): Model to use (defaults to `qwen/qwen3-coder:free`)

### Running the Agent

Start the interactive CLI:

```bash
pnpm dev
```

Then enter your task:

```
> List all TypeScript files in the src directory
```

### Building for Production

```bash
pnpm build
```

Output will be in the `dist/` directory.

## Available Tools

The agent can use the following tools:

### list_files

List files in a directory.

```json
{
  "tool": "list_files",
  "args": { "path": "./src" }
}
```

### read_files

Read one or multiple files with optional preview mode.

```json
{
  "tool": "read_files",
  "args": {
    "paths": ["src/index.ts", "package.json"],
    "preview": false
  }
}
```

### write_files

Write content to one or multiple files.

```json
{
  "tool": "write_files",
  "args": {
    "files": [
      {
        "path": "output.txt",
        "content": "Hello, World!"
      }
    ]
  }
}
```

## Architecture

```
src/
├── agent/          # Agent loop, parsing, execution logic
├── cli/            # Command-line interface
├── llm/            # LLM client configuration
├── shared/         # Types and logger
├── tools/          # Tool implementations and registry
└── safety/         # Safety guards (loop detection, timeouts)
```

## Running Tests

```bash
pnpm test
```

Run tests in watch mode:

```bash
pnpm test -- --watch
```

## Development

```bash
pnpm dev
```

Runs the agent in development mode with Tsx (no compilation needed).

## How It Works

1. **User Input**: User provides a task via the CLI
2. **Agent Loop**: The agent iterates up to 5 times:
   - Generates a response using the LLM
   - Parses tool calls or final answers
   - Executes requested tools
   - Feeds results back to the LLM
3. **Final Answer**: Agent returns result or stops if max iterations exceeded

### Safety Features

- **Loop Guard**: Detects and prevents repeated tool calls
- **Timeout Protection**: Tools have a 10-second execution timeout
- **Malformed Response Handling**: Retries up to 3 times if response parsing fails
- **Max Iterations**: Agent stops after 5 iterations to prevent infinite loops

## License

ISC
