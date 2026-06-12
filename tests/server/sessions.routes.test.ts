import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { buildServer } from "../../src/server";

import type { AgentEvent, AgentResult } from "../../src/shared/types";

describe("sessions routes", () => {
  let app: ReturnType<typeof buildServer>;
  let sessionStoreDir: string | undefined;

  afterEach(async () => {
    await app?.close();
    if (sessionStoreDir) {
      await fs.rm(sessionStoreDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function newApp(agentTask: any) {
    sessionStoreDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentic-assistant-sessions-"),
    );
    app = buildServer({
      agentTask,
      sessionStoreDir,
    });
    await app.ready();
  }

  it("POST /api/sessions returns a sessionId", async () => {
    const agentTask = vi.fn();
    await newApp(agentTask as any);

    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { sessionId: string };
    expect(body.sessionId).toBeTypeOf("string");
    expect(body.sessionId.length).toBeGreaterThan(0);
  });

  it("POST /api/sessions/:id/messages returns SSE stream", async () => {
    const agentTask = vi.fn(async (_task, _session, onEvent) => {
      const events: AgentEvent[] = [
        { type: "iteration_start", iteration: 1 },
        {
          type: "tool_call",
          tool: "list_files",
          args: { path: "src" },
        },
        {
          type: "tool_result",
          tool: "list_files",
          success: true,
          result: { output: "a.ts" },
        },
        { type: "final_answer", text: "done" },
      ];

      for (const e of events) onEvent(e);

      const result: AgentResult = {
        status: "completed",
        finalAnswer: "done",
        diagnostics: {
          sessionId: "s",
          iterations: 1,
          toolCalls: 0,
          toolFailures: 0,
          malformedResponses: 0,
        },
      };
      return result;
    });

    await newApp(agentTask as any);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
    });
    const { sessionId } = createRes.json() as { sessionId: string };

    const res = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/messages`,
      payload: { task: "list files" },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"] ?? "")).toContain(
      "text/event-stream",
    );

    const payload = res.payload;
    expect(payload).toContain('"type":"iteration_start"');
    expect(payload).toContain('"type":"tool_call"');
    expect(payload).toContain('"type":"tool_result"');
    expect(payload).toContain('"type":"final_answer"');
    expect(payload).toContain("event: done");
  });
});
