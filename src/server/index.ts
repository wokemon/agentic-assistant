import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { registerSessionsRoutes } from "./routes/sessions";
import type { AgentEvent, AgentResult } from "../shared/types";
import type { SessionState } from "../agent/runner";
import { createSessionStore, type FileSessionStore } from "./store";
import path from "node:path";

export type AgentTaskFn = (
  task: string,
  session: SessionState,
  onEvent: (event: AgentEvent) => void,
  opts?: {
    signal?: AbortSignal;
    saveMemory?: (sessionId: string, memory: { facts: string[] }) => Promise<void>;
  },
) => Promise<AgentResult>;

function getMockRunAgentTask(): AgentTaskFn {
  return async (_task, _session, onEvent) => {
    onEvent({ type: "iteration_start", iteration: 1 });
    onEvent({ type: "tool_call", tool: "list_files", args: { path: "src" } });
    onEvent({
      type: "tool_result",
      tool: "list_files",
      success: true,
      result: { output: "a.ts\nb.ts" },
    });
    onEvent({ type: "final_answer", text: "mock answer" });
      return {
        status: "completed",
        finalAnswer: "mock answer",
        diagnostics: {
          sessionId: "mock",
        iterations: 1,
        toolCalls: 0,
        toolFailures: 0,
        malformedResponses: 0,
      },
    };
  };
}

export function buildServer(opts?: { agentTask?: AgentTaskFn; sessionStoreDir?: string }) {
  const fastify = Fastify({ logger: false });

  fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests without Origin header (e.g. curl, inject())
      if (!origin) return cb(null, true);
      const allowed =
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1");
      cb(null, allowed);
    },
  });

  fastify.get("/health", async () => {
    return { ok: true };
  });

  const sessionStore: FileSessionStore = createSessionStore({
    directory: opts?.sessionStoreDir,
  });

  const useMock =
    process.env.USE_MOCK_LLM === "true" ||
    process.env.AGENT_MOCK === "1" ||
    !process.env.OPENAI_API_KEY;

  const agentTask: AgentTaskFn = useMock
    ? getMockRunAgentTask()
    : (opts?.agentTask ??
      (async (task, session, onEvent, callOpts) => {
        const mod = await import("../agent/runner.js");
        return mod.runAgentTask(task, session, onEvent, callOpts);
      }));

  registerSessionsRoutes(fastify, {
    sessionStore,
    agentTask,
  });

  const frontendDist = path.resolve(process.cwd(), "frontend/dist");
  fastify.register(fastifyStatic, {
    root: frontendDist,
    wildcard: true,
    index: ["index.html"],
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.method !== "GET") {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });

  return fastify;
}

async function main() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const app = buildServer();
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info({ port }, "Server listening");
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
