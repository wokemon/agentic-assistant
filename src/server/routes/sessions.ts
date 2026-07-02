import type { FastifyInstance, FastifyReply } from "fastify";
import crypto from "crypto";
import type { AgentEvent, AgentResult } from "../../shared/types";
import type { SessionState } from "../../agent/runner";
import type { FileSessionStore } from "../store/fileSessionStore";
import { WorkingMemory } from "../../context/workingMemory";

type AgentTaskFn = (
  task: string,
  session: SessionState,
  onEvent: (event: AgentEvent) => void,
  opts?: {
    signal?: AbortSignal;
    saveMemory?: (sessionId: string, memory: { facts: string[] }) => Promise<void>;
  },
) => Promise<AgentResult>;

type ActiveRun = {
  controller: AbortController;
  runId: string;
};

const activeRuns = new Map<string, ActiveRun>();

function sseWriteData(reply: FastifyReply, event: AgentEvent) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sseWriteDone(reply: FastifyReply) {
  reply.raw.write(`event: done\ndata: {}\n\n`);
}

type SessionsStore = {
  sessionStore: FileSessionStore;
  agentTask: AgentTaskFn;
};

type MessagesBody = {
  task: string;
};

export function registerSessionsRoutes(
  app: FastifyInstance,
  { sessionStore, agentTask }: SessionsStore,
) {
  app.post<{ Body: { sessionId?: string } }>("/api/sessions", async (request) => {
    const requestedSessionId = request.body?.sessionId;

    if (requestedSessionId) {
      try {
        await sessionStore.getSession(requestedSessionId);
        return { sessionId: requestedSessionId };
      } catch {
        // Create a new session with the provided ID.
      }
    }

    const { sessionId } = await sessionStore.createSession({
      sessionId: requestedSessionId,
    });
    return { sessionId };
  });

  app.post<{
    Params: { id: string };
    Body: MessagesBody;
  }>("/api/sessions/:id/messages", async (request, reply) => {
    const { id } = request.params;
    const { task } = request.body;

    let sessionRecord: Awaited<ReturnType<FileSessionStore["getSession"]>>;
    try {
      sessionRecord = await sessionStore.getSession(id);
    } catch {
      reply.code(404);
      return { error: "Unknown session" };
    }

    const session = sessionRecord.session;

    // Hydrate cross-session memory (facts only) if previously persisted.
    const persistedMemory = await sessionStore.loadMemory(id);
    if (persistedMemory) {
      const hydrated = WorkingMemory.fromPersistedState(persistedMemory);
      for (const fact of hydrated.getState().facts) {
        session.memory.addFact(fact);
      }
    }

    // Mark this session as running so a restart can flag it as interrupted.
    const runId = crypto.randomUUID();
    const shouldSetTitle = !sessionRecord.title;
    const normalizedTaskTitle = shouldSetTitle
      ? task.replace(/\s+/g, " ").trim().slice(0, 60)
      : undefined;
    await sessionStore.markInProgress(id, runId, normalizedTaskTitle);

    const controller = new AbortController();
    activeRuns.set(id, { controller, runId });

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    // Prevent Fastify from setting its own content-type.
    reply.raw.flushHeaders?.();

    let finished = false;
    let ended = false;
    let timer: NodeJS.Timeout | undefined;

    const onClose = () => {
      if (!finished && !controller.signal.aborted) {
        controller.abort("client_disconnected");
      }
    };

    reply.raw.once("close", onClose);

    const finishStream = () => {
      if (finished) return;
      finished = true;
      sseWriteDone(reply);
    };

    const endStream = () => {
      if (ended) return;
      ended = true;
      reply.raw.end();
    };

    const runEvents: AgentEvent[] = [];
    let agentResult: AgentResult | undefined;

    const onEvent = (event: AgentEvent) => {
      if (finished) return;
      runEvents.push(event);
      sseWriteData(reply, event);
    };

    try {
      const timeoutSeconds = process.env.AGENT_SERVER_TIMEOUT_SECONDS
        ? Number(process.env.AGENT_SERVER_TIMEOUT_SECONDS)
        : 60;
      const timeoutMs = Number.isFinite(timeoutSeconds)
        ? timeoutSeconds * 1000
        : 60_000;

      timer = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort("server_timeout");
        }
      }, timeoutMs);

      agentResult = await agentTask(task, session, onEvent, {
        signal: controller.signal,
        saveMemory: sessionStore.saveMemory.bind(sessionStore),
      });
    } catch {
      // `onEvent` should already have emitted an `error` event from the runner.
    } finally {
      if (timer) clearTimeout(timer);
      reply.raw.off("close", onClose);
      activeRuns.delete(id);

      if (agentResult?.diagnostics) {
        session.diagnostics = agentResult.diagnostics;
      }

      const runnerStatus = agentResult?.status;
      const interruptedStatuses = new Set<AgentResult["status"]>([
        "max_iterations",
        "context_budget_exceeded",
        "parse_failure",
        "malformed_response",
        "too_many_tool_failures",
      ]);

      // Persist the in-memory mutations from this run.
      if (runnerStatus === "completed") {
        await sessionStore.markCompleted({
          id,
          title: normalizedTaskTitle,
          session,
          userTask: task,
          events: runEvents,
        });
      } else if (controller.signal.aborted) {
        await sessionStore.markInterrupted({
          id,
          title: normalizedTaskTitle,
          session,
          userTask: task,
          events: runEvents,
          reason: runnerStatus,
        });
      } else if (runnerStatus && interruptedStatuses.has(runnerStatus)) {
        await sessionStore.markInterrupted({
          id,
          title: normalizedTaskTitle,
          session,
          userTask: task,
          events: runEvents,
          reason: runnerStatus,
        });
      } else {
        // Unknown stop reason: treat as interrupted so the user sees a non-success outcome.
        await sessionStore.markInterrupted({
          id,
          title: normalizedTaskTitle,
          session,
          userTask: task,
          events: runEvents,
          reason: runnerStatus ?? "unknown",
        });
      }

      // Emit the final SSE frame only after persisting the session.
      finishStream();

      endStream();
    }

    return reply;
  });

  app.get<{
    Params: { id: string };
  }>("/api/sessions/:id", async (request) => {
    const { id } = request.params;
    try {
      const record = await sessionStore.getSession(id);
      return {
        sessionId: id,
        status: record.status,
        title: record.title,
        lastActiveAt: record.lastActiveAt,
        createdAt: record.createdAt,
        history: record.session.history.getAll(),
        userTasks: record.userTasks,
        events: record.events,
        diagnostics: record.session.diagnostics,
        interruptedReason: record.interruptedReason,
      };
    } catch {
      return { error: "Unknown session", status: "unknown" };
    }
  });

  app.post<{
    Params: { id: string };
  }>("/api/sessions/:id/stop", async (request) => {
    const { id } = request.params;
    const active = activeRuns.get(id);
    if (!active) {
      return { stopped: false, reason: "no_active_run" };
    }

    active.controller.abort("user_cancelled");
    return { stopped: true };
  });

  app.delete<{
    Params: { id: string };
  }>("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    try {
      await sessionStore.getSession(id);
    } catch {
      reply.code(404);
      return { error: "Unknown session" };
    }
    await sessionStore.deleteSession(id);
    reply.code(204);
    return;
  });

  app.get("/api/sessions", async () => {
    const sessionsList = await sessionStore.listSessions();
    return sessionsList.map((s) => ({
      id: s.id,
      title: s.title,
      lastActiveAt: s.lastActiveAt,
    }));
  });
}
