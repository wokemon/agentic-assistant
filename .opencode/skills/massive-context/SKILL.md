---
name: massive-context
description: Leverages the 1M token window to perform comprehensive, repo-wide audits.
compatibility: opencode
---

## What I do

I ingest and cross-reference massive amounts of project files to ensure complete consistency.

## When to use me

Use this when refactoring core utilities, updating dependencies, or writing features that touch multiple domains.

## Instructions for the Agent

You are operating with a 1-Million token context window. Do not artificially limit your reading.

1. Aggressively search and ingest all related files, utilities, and documentation.
2. Cross-reference variable names, types, and database schemas across the entire project before writing code.
3. Never truncate your code output (e.g., never write `// ... rest of code here`). Provide the complete, fully written file replacements.
