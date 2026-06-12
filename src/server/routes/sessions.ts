import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import type { AgentEvent, AgentResult } from "../../shared/types";
import { WorkingMemory } from "../../context/workingMemory";

type AgentTaskFn = (
  task: string,
  session: WorkingMemory,
  onEvent: (event: AgentEvent) => void,
) => Promise<AgentResult>;

function sseWriteData(reply: FastifyReply, event: AgentEvent) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sseWriteDone(reply: FastifyReply) {
  reply.raw.write(`event: done\ndata: {}\n\n`);
}

type SessionsStore = {
  sessions: Map<string, WorkingMemory>;
  agentTask: AgentTaskFn;
};

type MessagesBody = {
  task: string;
};

export function registerSessionsRoutes(
  app: FastifyInstance,
  { sessions, agentTask }: SessionsStore,
) {
  app.post("/api/sessions", async () => {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, new WorkingMemory());
    return { sessionId };
  });

  app.post<{
    Params: { id: string };
    Body: MessagesBody;
  }>("/api/sessions/:id/messages", async (request, reply) => {
    const { id } = request.params;
    const { task } = request.body;

    const session = sessions.get(id);
    if (!session) {
      reply.code(404);
      return { error: "Unknown session" };
    }

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
    let timer: NodeJS.Timeout | undefined;

    const finishStream = () => {
      if (finished) return;
      finished = true;
      sseWriteDone(reply);
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
      finishStream();
    }

    return reply;
  });

  app.get<{
    Params: { id: string };
  }>("/api/sessions/:id", async (request) => {
    const { id } = request.params;
    if (!sessions.has(id)) {
      return { error: "Unknown session", status: "unknown" };
    }

    // Phase 2 will add persistence for history/status.
    return {
      sessionId: id,
      status: "unknown",
      history: [],
    };
  });
}
