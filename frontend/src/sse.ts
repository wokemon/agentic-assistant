import type { AgentEvent } from "./types";

function parseEventFrame(frame: string):
  | { kind: "done" }
  | { kind: "data"; event: AgentEvent }
  | null {
  const lines = frame
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) return null;

  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (eventName === "done") return { kind: "done" };

  const data = dataLines.join("\n");
  if (!data) return null;
  try {
    return { kind: "data", event: JSON.parse(data) as AgentEvent };
  } catch {
    return null;
  }
}

export async function postSseStream(opts: {
  url: string;
  body: unknown;
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}): Promise<void> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts.body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    opts.onError?.(`HTTP ${res.status}: ${txt}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    opts.onError?.("Missing response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    while (true) {
      const sepIndex = buffer.indexOf("\n\n");
      if (sepIndex === -1) break;

      const frame = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + 2);

      if (!frame) continue;
      const parsed = parseEventFrame(frame);
      if (!parsed) continue;
      if (parsed.kind === "done") {
        opts.onDone?.();
        return;
      }
      if (parsed.kind === "data") {
        opts.onEvent(parsed.event);
      }
    }
  }

  opts.onDone?.();
}
