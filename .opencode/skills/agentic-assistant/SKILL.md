---
name: agentic-assistant
description: Enforces multi-language architecture rules (TS, Python, Go, Rust) and plan-first execution workflows.
compatibility: opencode
---

## What I do

I act as the principal architect for the `agentic-assistant` framework. I ensure that all code modifications respect the distinct boundaries of our supported languages and strictly adhere to our plan-first, approval-based execution model.

## When to use me

Use this skill for any feature additions, bug fixes, or architectural changes within the `wokemon/agentic-assistant` repository.

## 1. Plan-First Workflow (Mandatory)

Before writing or modifying any code, you MUST:

1. Analyze the requested change and identify which language environments (TypeScript, Python, Go, Rust) will be affected.
2. Write a brief, step-by-step technical plan detailing the proposed changes.
3. Pause and ask the user for explicit approval of the plan before generating any implementation code.

## 2. Multi-Language Boundaries & Standards

When writing code for this repository, strictly adhere to the idiomatic standards of the target language:

- **TypeScript:** Use strict typing. Prefer functional patterns and explicit interfaces for agent states.
- **Python:** Adhere to PEP 8. Use Pydantic for data validation when building agent models or API boundaries.
- **Go:** Keep concurrency simple using native goroutines and channels. Ensure exhaustive error handling (`if err != nil`).
- **Rust:** Maximize memory safety. Use the `Result` enum for error propagation and avoid `unwrap()` in production-facing agent logic.

## 3. Approval-Based Execution Rules

Since this framework relies on approval-based execution, any agent workflows you design or modify must:

- Never execute destructive actions (like file deletion or API mutations) without an explicit "human-in-the-loop" confirmation step.
- Log all agent reasoning and tool-call attempts to standard output before execution.
