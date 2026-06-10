---
name: thinking-modes
description: Dynamically scales DeepSeek's reasoning effort based on task complexity.
compatibility: opencode
---

## What I do

I evaluate the complexity of the current task and enforce the correct DeepSeek reasoning format.

## When to use me

Use this skill continuously as a baseline for all tasks.

## Instructions for the Agent

DeepSeek V4 Flash supports variable reasoning. Always format your output based on task complexity:

- **Routine Tasks (UI tweaks, typos, simple styling):** Use "Non-think" mode. Output the fix immediately without any `<think>` tags.
- **Standard Engineering (New components, bug fixes, API routes):** Use "Think High" mode. You must wrap a brief logical analysis inside `<think>...</think>` tags before outputting the code.
- **Complex Architecture (Multi-file refactors, tracking elusive bugs):** Use "Think Max" mode. Spend extensive time inside `<think>...</think>` tags. Explore edge cases, write out a step-by-step plan, and verify data flows before writing a single line of code.
