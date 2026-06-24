import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { buildServer } from "../../src/server";

describe("static file serving", () => {
  let app: ReturnType<typeof buildServer>;
  let sessionStoreDir: string | undefined;

  afterEach(async () => {
    await app?.close();
    if (sessionStoreDir) {
      await fs.rm(sessionStoreDir, { recursive: true, force: true });
    }
  });

  async function newApp() {
    sessionStoreDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "agentic-assistant-sessions-"),
    );
    app = buildServer({ sessionStoreDir });
    await app.ready();
  }

  it("serves index.html at GET /", async () => {
    await newApp();
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("serves index.html for SPA catch-all GET /*", async () => {
    await newApp();
    const res = await app.inject({ method: "GET", url: "/some/deep/route" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("serves /api/sessions correctly (API route priority)", async () => {
    await newApp();
    const res = await app.inject({ method: "POST", url: "/api/sessions" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { sessionId: string };
    expect(body.sessionId).toBeTypeOf("string");
  });

  it("returns 404 for non-GET unmatched requests", async () => {
    await newApp();
    const res = await app.inject({ method: "POST", url: "/some/dead/route" });
    expect(res.statusCode).toBe(404);
  });

  it("serves /health correctly", async () => {
    await newApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
