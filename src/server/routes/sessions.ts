import type { FastifyInstance, FastifyReply } from "fastify";
import crypto from "crypto";
import type { AgentEvent, AgentResult } from "../../shared/types";
import type { SessionState } from "../../agent/runner";
import type { FileSessionStore } from "../store/fileSessionStore";

type AgentTaskFn = (
  task: string,
  session: SessionState,
  onEvent: (event: AgentEvent) => void,
) => Promise<AgentResult>;

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
  app.post("/api/sessions", async () => {
    const { sessionId } = await sessionStore.createSession();
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

    // Mark this session as running so a restart can flag it as interrupted.
    const runId = crypto.randomUUID();
    await sessionStore.markInProgress(id, runId);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    // Prevent Fastify from setting its own content-type.
    reply.raw.flushHeaders?.();

    const timeoutSeconds = process.env.AGENT_SERVER_TIMEOUT_SECONDS
      ? Number(process.env.AGENT_SERVER_TIMEOUT_SECONDS)
      : 60;
    const timeoutMs = Number.isFinite(timeoutSeconds)
      ? timeoutSeconds * 1000
      : 60_000;

    let finished = false;
    let ended = false;
    let timer: NodeJS.Timeout | undefined;

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

    const onEvent = (event: AgentEvent) => {
      if (finished) return;
      sseWriteData(reply, event);
    };

    try {
      const agentPromise = agentTask(task, session, onEvent);

      const timeoutPromise = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          onEvent({
            type: "safety_stop",
            reason: "server_timeout",
          });
          finishStream();
          resolve();
        }, timeoutMs);
      });

      await Promise.race([agentPromise, timeoutPromise]);
    } catch {
      // `onEvent` should already have emitted an `error` event from the runner.
    } finally {
      if (timer) clearTimeout(timer);

      // Emit the final SSE frame before persisting the session.
      finishStream();

      const shouldSetTitle = !sessionRecord.title;
      const normalizedTaskTitle = shouldSetTitle
        ? task.replace(/\s+/g, " ").trim().slice(0, 60)
        : undefined;

      // Persist the in-memory mutations from this run.
      await sessionStore.markCompleted({
        id,
        title: normalizedTaskTitle,
        session,
      });

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
      };
    } catch {
      return { error: "Unknown session", status: "unknown" };
    }
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
