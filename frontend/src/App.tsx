import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { AgentEvent, SessionDetailsResponse } from "./types";
import type { SessionListItem } from "./types";
import { postSseStream } from "./sse";

type ChatItem = { id: string; role: "user" | "assistant"; content: string };

type TimelineToolItem = {
  kind: "tool";
  id: string;
  tool: string;
  args: unknown;
  reasoningNotes: string[];
  status: "pending" | "success" | "failure";
  result?: {
    success: boolean;
    result: unknown;
  };
};

type TimelineBannerItem = {
  kind: "banner";
  id: string;
  tone: "info" | "warn" | "danger" | "muted";
  title: string;
  message: string;
};

type TimelineItem = TimelineToolItem | TimelineBannerItem;

const api = {
  listSessions: async (): Promise<SessionListItem[]> => {
    const res = await fetch("/api/sessions");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  createSession: async (): Promise<{ sessionId: string }> => {
    const res = await fetch("/api/sessions", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  getSession: async (sessionId: string): Promise<SessionDetailsResponse> => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusBannerText(status: string, lastReason?: string) {
  if (status === "interrupted") return "Agent stopped: interrupted";
  if (lastReason) return `Agent stopped: ${lastReason}`;
  return "";
}

function safetyBanner(reason: string): TimelineBannerItem {
  if (reason === "parse_failure") {
    return {
      kind: "banner",
      id: crypto.randomUUID(),
      tone: "warn",
      title: "Parsing failure",
      message: "The agent produced malformed output and stopped.",
    };
  }

  if (reason === "server_timeout") {
    return {
      kind: "banner",
      id: crypto.randomUUID(),
      tone: "warn",
      title: "Timeout",
      message: "The run exceeded the server timeout.",
    };
  }

  if (reason === "user_cancelled") {
    return {
      kind: "banner",
      id: crypto.randomUUID(),
      tone: "muted",
      title: "Stopped by user",
      message: "The current run was cancelled.",
    };
  }

  if (reason === "client_disconnected") {
    return {
      kind: "banner",
      id: crypto.randomUUID(),
      tone: "muted",
      title: "Connection lost",
      message: "The stream ended before the run completed.",
    };
  }

  if (reason === "max_iterations" || reason === "too_many_tool_failures") {
    return {
      kind: "banner",
      id: crypto.randomUUID(),
      tone: "danger",
      title: "Loop guard stop",
      message: reason === "max_iterations"
        ? "The agent hit its iteration limit."
        : "The agent stopped after repeated tool failures.",
    };
  }

  if (reason === "context_budget_exceeded") {
    return {
      kind: "banner",
      id: crypto.randomUUID(),
      tone: "danger",
      title: "Context budget exceeded",
      message: "The session ran out of context space.",
    };
  }

  return {
    kind: "banner",
    id: crypto.randomUUID(),
    tone: "danger",
    title: "Safety stop",
    message: reason,
  };
}

function buildTimelineFromEvents(events: AgentEvent[]): TimelineItem[] {
  const cards: TimelineItem[] = [];
  const pendingReasoning: string[] = [];

  for (const ev of events) {
    if (ev.type === "reasoning") {
      pendingReasoning.push(ev.text);
      continue;
    }

    if (ev.type === "tool_call") {
      const card: TimelineToolItem = {
        kind: "tool",
        id: crypto.randomUUID(),
        tool: ev.tool,
        args: ev.args,
        reasoningNotes: pendingReasoning.splice(0, pendingReasoning.length),
        status: "pending",
      };
      cards.push(card);
      continue;
    }

    if (ev.type === "tool_result") {
      const idx = [...cards]
        .reverse()
        .findIndex((c) => c.kind === "tool" && c.tool === ev.tool && c.status === "pending");
      if (idx === -1) continue;
      const realIdx = cards.length - 1 - idx;
      const existing = cards[realIdx];
      if (existing.kind !== "tool") continue;
      cards[realIdx] = {
        ...existing,
        status: ev.success ? "success" : "failure",
        result: { success: ev.success, result: ev.result },
      };
      continue;
    }

    if (ev.type === "safety_stop") {
      cards.push(safetyBanner(ev.reason));
      continue;
    }

    if (ev.type === "error") {
      cards.push({
        kind: "banner",
        id: crypto.randomUUID(),
        tone: "danger",
        title: "Agent error",
        message: ev.message,
      });
    }
  }

  return cards;
}

function buildChatFromSession(details: SessionDetailsResponse): ChatItem[] {
  const userTasks = details.userTasks ?? [];
  const finalAnswers = (details.events ?? []).filter(
    (e): e is Extract<AgentEvent, { type: "final_answer" }> =>
      e.type === "final_answer",
  );

  const items: ChatItem[] = [];
  const pairCount = Math.min(userTasks.length, finalAnswers.length);
  for (let i = 0; i < pairCount; i++) {
    items.push({
      id: crypto.randomUUID(),
      role: "user",
      content: userTasks[i],
    });
    items.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: finalAnswers[i].text,
    });
  }

  for (let i = pairCount; i < userTasks.length; i++) {
    items.push({
      id: crypto.randomUUID(),
      role: "user",
      content: userTasks[i],
    });
  }

  return items;
}

export default function App() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [details, setDetails] = useState<SessionDetailsResponse | null>(null);

  const [chat, setChat] = useState<ChatItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const [task, setTask] = useState("");
  const [sending, setSending] = useState(false);
  const lastTaskRef = useRef<string>("");
  const pendingReasoningRef = useRef<string[]>([]);

  useEffect(() => {
    api
      .listSessions()
      .then((list) => {
        setSessions(list);
        if (list.length > 0) setActiveSessionId(list[0].id);
      })
      .catch((err) => {
        setBanner(`Failed to load sessions: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    let cancelled = false;
    api
      .getSession(activeSessionId)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        setChat(buildChatFromSession(d));
        setTimeline(buildTimelineFromEvents(d.events ?? []));
        setShowDiagnostics(true);
        if (d.status === "interrupted") {
          setBanner(statusBannerText(d.status));
        } else {
          setBanner(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setBanner(`Failed to load session: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const activeSession = useMemo(() => {
    if (!activeSessionId) return undefined;
    return sessions.find((s) => s.id === activeSessionId);
  }, [activeSessionId, sessions]);

  async function refreshSessions() {
    const list = await api.listSessions();
    setSessions(list);
    if (activeSessionId && list.some((s) => s.id === activeSessionId)) {
      // keep current selection
    } else if (list.length > 0) {
      setActiveSessionId(list[0].id);
    } else {
      setActiveSessionId(null);
      setDetails(null);
      setChat([]);
      setTimeline([]);
    }
  }

  async function createNewSession() {
    setSending(false);
    try {
      const created = await api.createSession();
      await refreshSessions();
      setActiveSessionId(created.sessionId);
    } catch (err) {
      setBanner(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function pushChat(role: ChatItem["role"], content: string) {
    setChat((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content },
    ]);
  }

  function updateTimelineToolResult(tool: string, success: boolean, result: unknown) {
    setTimeline((prev) => {
      const idx = [...prev]
        .reverse()
        .findIndex((c) => c.kind === "tool" && c.tool === tool && c.status === "pending");
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      const current = prev[realIdx];
      if (current.kind !== "tool") return prev;
      const updated: TimelineToolItem = {
        ...current,
        status: success ? "success" : "failure",
        result: { success, result },
      };
      const next = [...prev];
      next[realIdx] = updated;
      return next;
    });
  }

  async function sendTask(explicitTask?: string) {
    if (!activeSessionId || sending) return;
    const trimmed = (explicitTask ?? task).replace(/\s+/g, " ").trim();
    if (!trimmed) return;

    setSending(true);
    setBanner(null);
    pendingReasoningRef.current = [];
    lastTaskRef.current = trimmed;

    // Local optimistic UI for the user message.
    pushChat("user", trimmed);

    try {
      await postSseStream({
        url: `/api/sessions/${activeSessionId}/messages`,
        body: { task: trimmed },
        onEvent: (ev) => {
          if (ev.type === "reasoning") {
            pendingReasoningRef.current.push(ev.text);
            return;
          }

          if (ev.type === "tool_call") {
            const reasoningNotes = pendingReasoningRef.current.splice(
              0,
              pendingReasoningRef.current.length,
            );

            setTimeline((prev) => [
              ...prev,
              {
                kind: "tool",
                id: crypto.randomUUID(),
                tool: ev.tool,
                args: ev.args,
                reasoningNotes,
                status: "pending",
              },
            ]);
            return;
          }

          if (ev.type === "tool_result") {
            updateTimelineToolResult(ev.tool, ev.success, ev.result);
            return;
          }

          if (ev.type === "final_answer") {
            pushChat("assistant", ev.text);
            return;
          }

          if (ev.type === "error") {
            setTimeline((prev) => [
              ...prev,
              {
                kind: "banner",
                id: crypto.randomUUID(),
                tone: "danger",
                title: "Agent error",
                message: ev.message,
              },
            ]);
            setBanner(`Agent error: ${ev.message}`);
            return;
          }

          if (ev.type === "safety_stop") {
            setTimeline((prev) => [...prev, safetyBanner(ev.reason)]);
            return;
          }
        },
        onError: (msg) => {
          setBanner(msg);
        },
        onDone: () => {
          // Backend marks session completion; next reload will reflect persisted state.
        },
      });
    } finally {
      setSending(false);
      await refreshSessions().catch(() => {});
      // Rehydrate from disk so the UI is consistent after tool history is persisted.
      if (activeSessionId) {
        try {
          const d = await api.getSession(activeSessionId);
          setDetails(d);
          setChat(buildChatFromSession(d));
          setTimeline(buildTimelineFromEvents(d.events ?? []));
          setShowDiagnostics(true);
        } catch {
          // keep current optimistic UI
        }
      }
    }
  }

  async function stopTask() {
    if (!activeSessionId) return;
    await fetch(`/api/sessions/${activeSessionId}/stop`, { method: "POST" });
  }

  async function retryLastTask() {
    const last = details?.userTasks?.at(-1) ?? lastTaskRef.current;
    if (!last) return;
    setTask(last);
    await sendTask(last);
  }

  const empty = sessions.length === 0;
  const diagnostics = details?.diagnostics;

  return (
    <div className="container">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800 }}>Sessions</div>
            <div className="muted">{sessions.length}</div>
          </div>

          <button className="btn secondary" onClick={createNewSession}>
            New session
          </button>
        </div>

        <div className="sidebarContent">
          <div className="sessionList">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={
                  "sessionItem" + (s.id === activeSessionId ? " active" : "")
                }
                onClick={() => setActiveSessionId(s.id)}
              >
                <div className="sessionTitle">{s.title ?? "Untitled"}</div>
                <div className="sessionMeta">{formatTime(s.lastActiveAt)}</div>
              </div>
            ))}
            {empty ? <div className="muted">No sessions yet.</div> : null}
          </div>
        </div>
      </aside>

      <main className="main">
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 900 }}>
              {activeSession?.title ?? "Untitled"}
            </div>
            <div className="muted">
              {details ? `Status: ${details.status}` : ""}
            </div>
          </div>
          <div className="row">
            {details?.status === "interrupted" && !sending ? (
              <button className="btn secondary" onClick={() => void retryLastTask()}>
                Retry last task
              </button>
            ) : null}
            {sending ? (
              <button className="btn secondary" onClick={() => void stopTask()}>
                Stop
              </button>
            ) : null}
          </div>
        </div>

        {banner ? (
          <div style={{ padding: 12 }}>
            <div className="banner">{banner}</div>
          </div>
        ) : null}

        <details
          className="diagnosticsPanel"
          open={showDiagnostics}
          onToggle={(e) => setShowDiagnostics((e.target as HTMLDetailsElement).open)}
        >
          <summary>Diagnostics</summary>
          <div className="diagnosticsGrid">
            <div>
              <div className="muted">Iterations</div>
              <div>{diagnostics?.iterations ?? 0}</div>
            </div>
            <div>
              <div className="muted">Tool calls</div>
              <div>{diagnostics?.toolCalls ?? 0}</div>
            </div>
            <div>
              <div className="muted">Tool failures</div>
              <div>{diagnostics?.toolFailures ?? 0}</div>
            </div>
            <div>
              <div className="muted">Parsing failures</div>
              <div>{diagnostics?.malformedResponses ?? 0}</div>
            </div>
          </div>
        </details>

        <section className="columns">
          <div className="panel">
            <div className="panelHeader">
              <div style={{ fontWeight: 900 }}>Conversation</div>
            </div>

            <div className="panelBody">
              <div className="chat">
                {chat.length === 0 ? (
                  <div className="muted">
                    {activeSessionId
                      ? "Send a message to start the session."
                      : "Create a session first."}
                  </div>
                ) : null}
                {chat.map((m) => (
                  <div
                    key={m.id}
                    className={"bubble " + (m.role === "user" ? "user" : "assistant")}
                  >
                    {m.role === "user" ? (
                      <div>{m.content}</div>
                    ) : (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 900 }}>Live activity</div>
                {timeline.length > 0 ? (
                  <div className="muted">{timeline.length} cards</div>
                ) : (
                  <div className="muted">No activity</div>
                )}
              </div>
            </div>

            <div className="panelBody">
              <div className="timeline">
                {timeline.map((c) => (
                  c.kind === "tool" ? (
                    <div key={c.id} className="card">
                      {c.reasoningNotes.length > 0 ? (
                        <div className="reasoning">
                          {c.reasoningNotes.map((r, idx) => (
                            <div key={idx}>{r}</div>
                          ))}
                        </div>
                      ) : null}

                      <div className="cardHeader">
                        <div style={{ fontWeight: 900 }}>{c.tool}</div>
                        <div
                          className={
                            "pill " +
                            (c.status === "success"
                              ? "ok"
                              : c.status === "failure"
                                ? "bad"
                                : "")
                          }
                        >
                          {c.status}
                        </div>
                      </div>

                      <div className="muted" style={{ marginTop: 8 }}>
                        args:
                      </div>
                      <details open={c.status !== "pending"}>
                        <summary className="muted">
                          {c.status === "pending" ? "View" : "Args"}
                        </summary>
                        <pre style={{ whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(c.args, null, 2)}
                        </pre>
                      </details>

                      {c.status === "pending" ? null : (
                        <details style={{ marginTop: 10 }} open>
                          <summary className="muted">Result</summary>
                          <pre style={{ whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(c.result?.result, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div
                      key={c.id}
                      className={`timelineBanner ${c.tone}`}
                    >
                      <div style={{ fontWeight: 900 }}>{c.title}</div>
                      <div className="muted">{c.message}</div>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="composer">
          <input
            className="input"
            value={task}
            disabled={!activeSessionId || sending}
            onChange={(e) => setTask(e.target.value)}
            placeholder={activeSessionId ? "Enter a task" : "Create a session to begin"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void sendTask();
              }
            }}
          />
          <button className="btn" disabled={!activeSessionId || sending} onClick={() => void sendTask()}>
            {sending ? "Running..." : "Send"}
          </button>
        </div>
      </main>
    </div>
  );
}
