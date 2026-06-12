type AgentEvent =
  | { type: "iteration_start"; iteration: number }
  | { type: "tool_call"; tool: string; args: unknown }
  | {
      type: "tool_result";
      tool: string;
      result: unknown;
      success: boolean;
    }
  | { type: "reasoning"; text: string }
  | { type: "final_answer"; text: string }
  | { type: "error"; message: string }
  | { type: "safety_stop"; reason: string };

async function readSseEvents(res: Response) {
  const events: AgentEvent[] = [];
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = res.body?.getReader();
  if (!reader) throw new Error("SSE response has no body");

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const trimmed = frame.trim();
      if (!trimmed) continue;

      // Extract event name if present.
      const eventLine = frame.match(/^event:\s*(.*)$/m);
      const eventName = eventLine?.[1]?.trim();

      const dataLine = frame.match(/^data:\s*(.*)$/m);
      const dataRaw = dataLine?.[1];

      if (eventName === "done") {
        console.log("[event] done");
        return { done: true, events };
      }

      if (dataRaw) {
        const parsed = JSON.parse(dataRaw) as AgentEvent;
        console.log("[event]", parsed);
        events.push(parsed);
      }
    }
  }

  return { done: false, events };
}

async function main() {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";
  const timeoutMs = (process.env.TIMEOUT_MS
    ? Number(process.env.TIMEOUT_MS)
    : 10_000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Wait for server readiness
    const start = Date.now();
    while (Date.now() - start < 10_000) {
      try {
        const healthRes = await fetch(`${baseUrl}/health`, {
          method: "GET",
          signal: controller.signal,
        });
        if (healthRes.ok) break;
      } catch {
        // ignore until timeout
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // If still not healthy, fail loudly.
    const finalHealth = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!finalHealth.ok) {
      throw new Error(`Server not ready (GET /health -> ${finalHealth.status})`);
    }

    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({}),
    });
    if (!createRes.ok) {
      throw new Error(`Failed to create session: ${createRes.status}`);
    }
    const { sessionId } = (await createRes.json()) as { sessionId: string };
    console.log(`sessionId=${sessionId}`);

    const messagesRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ task: "list files" }),
      },
    );

    if (!messagesRes.ok) {
      const text = await messagesRes.text();
      throw new Error(
        `SSE request failed: ${messagesRes.status}. Body: ${text}`,
      );
    }

    const result = await readSseEvents(messagesRes);
    if (!result.done) {
      throw new Error("Did not receive SSE done event before stream ended");
    }
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
