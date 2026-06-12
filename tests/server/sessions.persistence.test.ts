import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { buildServer } from "../../src/server";
import { createSessionStore } from "../../src/server/store";
import type { AgentEvent, AgentResult } from "../../src/shared/types";

describe("session persistence", () => {
  let sessionStoreDir: string;
  let app: ReturnType<typeof buildServer>;

  afterEach(async () => {
    await app?.close();
    await fs.rm(sessionStoreDir, { recursive: true, force: true });
  });

  it("round-trips history after a restart", async () => {
    sessionStoreDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentic-assistant-sessions-persist-"),
    );

    const agentTask = vi.fn(async (task, session, onEvent) => {
      // Simulate runner mutations.
      session.history.add("user", task);
      session.memory.addFact("fact-from-turn");
      session.history.add("assistant", "assistant-response");

      const events: AgentEvent[] = [
        { type: "iteration_start", iteration: 1 },
        { type: "final_answer", text: "assistant-response" },
      ];
      for (const e of events) onEvent(e);

      const result: AgentResult = {
        status: "completed",
        finalAnswer: "assistant-response",
        diagnostics: {
          sessionId: session.sessionId,
          iterations: 1,
          toolCalls: 0,
          toolFailures: 0,
          malformedResponses: 0,
        },
      };
      return result;
    });

    app = buildServer({ agentTask: agentTask as any, sessionStoreDir });
    await app.ready();

    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
    });
    const { sessionId } = createRes.json() as { sessionId: string };

    const task = "My first user task: find files in src";
    const msgRes = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/messages`,
      payload: { task },
    });
    expect(msgRes.statusCode).toBe(200);
    expect(String(msgRes.payload)).toContain("event: done");

    // Simulate server restart by re-reading the store.
    const store = createSessionStore({ directory: sessionStoreDir });
    const record = await store.getSession(sessionId);

    expect(record.status).toBe("completed");
    expect(record.title).toBe(task.trim().slice(0, 60));

    expect(record.session.history.getAll()).toEqual([
      { role: "user", content: task },
      { role: "assistant", content: "assistant-response" },
    ]);
    expect(record.session.memory.getState().facts).toContain(
      "fact-from-turn",
    );
  });

  it("marks sessions as interrupted if inProgress after restart", async () => {
    sessionStoreDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentic-assistant-sessions-interrupted-"),
    );

    app = buildServer({ agentTask: vi.fn() as any, sessionStoreDir });
    await app.ready();

    const createRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
    });
    const { sessionId } = createRes.json() as { sessionId: string };

    const store = createSessionStore({ directory: sessionStoreDir });
    await store.markInProgress(sessionId, "run-1");

    // A new server process would load from disk; we simulate that by doing
    // a GET using a new app instance.
    await app.close();

    const app2 = buildServer({ agentTask: vi.fn() as any, sessionStoreDir });
    await app2.ready();
    app = app2;

    const res = await app2.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}`,
    });

    const body = res.json() as { status: string };
    expect(body.status).toBe("interrupted");
  });
});
