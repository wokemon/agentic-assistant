import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import type { AgentDiagnostics, AgentEvent } from "../../shared/types";
import { createInitialAgentState, type AgentState } from "../../agent/state";
import type { SessionState } from "../../agent/runner";
import { LoopGuard } from "../../safety/loopGuards";
import { MessageHistory } from "../../agent/history";
import { WorkingMemory } from "../../context/workingMemory";
import type { AgentStatus } from "./types";
import type {
  LoopGuardState,
  MessageHistoryState,
  WorkingMemoryState,
} from "./types";

const SESSION_FILE_VERSION = 1;

export type FileSessionStoreOptions = {
  directory: string;
};

type PersistedSessionFileV1 = {
  version: typeof SESSION_FILE_VERSION;
  id: string;
  metadata: {
    createdAt: string;
    lastActiveAt: string;
    title?: string;
    inProgress: boolean;
    agentRunId?: string;
    status: "active" | "completed" | "interrupted";
  };
  conversation: {
    userTasks: string[];
    events: AgentEvent[];
  };
  session: {
    memory: WorkingMemoryState;
    history: MessageHistoryState;
    loopGuard: LoopGuardState;
    state: AgentState;
    diagnostics: AgentDiagnostics;
  };
  persistedMemory?: { facts: string[] };
};

function isoNow() {
  return new Date().toISOString();
}

export class FileSessionStore {
  readonly directory: string;
  private hasRecoveredInterrupted = false;

  constructor(opts: FileSessionStoreOptions) {
    this.directory = opts.directory;
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });

    // On process restart, convert any previously in-progress sessions into
    // interrupted sessions so the UI can reflect the interrupted state.
    //
    // This runs only once per FileSessionStore instance to avoid flipping
    // sessions that are legitimately in-progress while the current server is
    // running.
    if (this.hasRecoveredInterrupted) return;
    this.hasRecoveredInterrupted = true;

    await this.recoverInterruptedSessions();
  }

  private async recoverInterruptedSessions() {
    try {
      const entries = await fs.readdir(this.directory, {
        withFileTypes: true,
      });

      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith(".json")) continue;
        const id = e.name.slice(0, -5);

        let file: PersistedSessionFileV1;
        try {
          file = await this.readFile(id);
        } catch {
          continue;
        }

        if (!file.metadata.inProgress) continue;

        file.metadata.inProgress = false;
        file.metadata.agentRunId = undefined;
        file.metadata.status = "interrupted";
        file.metadata.lastActiveAt = isoNow();

        await this.writeFileAtomic(this.getFilePath(id), file);
      }
    } catch {
      return;
    }
  }

  private getFilePath(id: string) {
    return path.join(this.directory, `${id}.json`);
  }

  private async writeFileAtomic(filePath: string, data: unknown) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = path.join(
      dir,
      `.tmp-${path.basename(filePath)}.${process.pid}.${Date.now()}`,
    );
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");

    // Windows rename semantics are tricky; delete destination first.
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
    await fs.rename(tmpPath, filePath);
  }

  async createSession(): Promise<{
    sessionId: string;
    session: SessionState;
  }> {
    await this.init();

    const sessionId = crypto.randomUUID();
    const now = isoNow();

    // The agent runner expects these fields on non-WorkingMemory session.
    const memory = new WorkingMemory();
    const history = new MessageHistory();
    const loopGuard = new LoopGuard();
    const state = createInitialAgentState() satisfies AgentState;
    const diagnostics: AgentDiagnostics = {
      sessionId,
      iterations: 0,
      toolCalls: 0,
      toolFailures: 0,
      malformedResponses: 0,
    };

    const session: SessionState = {
      sessionId,
      history,
      memory,
      loopGuard,
      state,
      diagnostics,
    };

    const file: PersistedSessionFileV1 = {
      version: SESSION_FILE_VERSION,
      id: sessionId,
      metadata: {
        createdAt: now,
        lastActiveAt: now,
        inProgress: false,
        status: "active",
      },
      conversation: {
        userTasks: [],
        events: [],
      },
      session: {
        memory: memory.toState(),
        history: history.toState(),
        loopGuard: loopGuard.toState(),
        state,
        diagnostics,
      },
    };

    await this.writeFileAtomic(this.getFilePath(sessionId), file);
    return { sessionId, session };
  }

  private async readFile(id: string): Promise<PersistedSessionFileV1> {
    const filePath = this.getFilePath(id);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as PersistedSessionFileV1;
    if (!parsed || parsed.version !== SESSION_FILE_VERSION) {
      throw new Error(`Unsupported session file version for ${id}`);
    }
    return parsed;
  }

  private toStatus(file: PersistedSessionFileV1): AgentStatus {
    return file.metadata.inProgress ? "active" : file.metadata.status;
  }

  private reconstructSession(file: PersistedSessionFileV1): SessionState {
    const memory = WorkingMemory.fromState(file.session.memory);
    const history = MessageHistory.fromState(file.session.history);
    const loopGuard = LoopGuard.fromState(file.session.loopGuard);
    return {
      sessionId: file.id,
      history,
      memory,
      loopGuard,
      state: file.session.state,
      diagnostics: file.session.diagnostics,
    };
  }

  async getSession(id: string): Promise<{
    sessionId: string;
    status: AgentStatus;
    title?: string;
    createdAt: string;
    lastActiveAt: string;
    session: SessionState;
    userTasks: string[];
    events: AgentEvent[];
    diagnostics: AgentDiagnostics;
  }> {
    await this.init();
    try {
      const file = await this.readFile(id);
      return {
        sessionId: file.id,
        status: this.toStatus(file),
        title: file.metadata.title,
        createdAt: file.metadata.createdAt,
        lastActiveAt: file.metadata.lastActiveAt,
        session: this.reconstructSession(file),
        userTasks: file.conversation.userTasks,
        events: file.conversation.events,
        diagnostics: file.session.diagnostics,
      };
    } catch (err) {
      // Normalize missing session into a consistent error.
      throw err;
    }
  }

  async listSessions(): Promise<Array<{
    id: string;
    title?: string;
    lastActiveAt: string;
    status: AgentStatus;
  }>> {
    await this.init();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));

    const sessions: Array<{
      id: string;
      title?: string;
      lastActiveAt: string;
      status: AgentStatus;
    }> = [];

    for (const f of files) {
      const id = f.name.slice(0, -5);
      try {
        const file = await this.readFile(id);
        sessions.push({
          id: file.id,
          title: file.metadata.title,
          lastActiveAt: file.metadata.lastActiveAt,
          status: this.toStatus(file),
        });
      } catch {
        // ignore invalid files
      }
    }

    // newest first
    sessions.sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    );
    return sessions;
  }

  async markInProgress(id: string, agentRunId: string, title?: string) {
    await this.init();
    const file = await this.readFile(id);
    file.metadata.inProgress = true;
    file.metadata.agentRunId = agentRunId;
    file.metadata.status = "active";
    file.metadata.lastActiveAt = isoNow();

    if (!file.metadata.title && title) {
      file.metadata.title = title;
    }
    await this.writeFileAtomic(this.getFilePath(id), file);
  }

  async markCompleted(opts: {
    id: string;
    title?: string;
    session: SessionState;
    userTask: string;
    events: AgentEvent[];
  }) {
    await this.init();
    const file = await this.readFile(opts.id);

    file.conversation.userTasks.push(opts.userTask);
    file.conversation.events.push(...opts.events);

    // Update persisted session state.
    file.session.memory = opts.session.memory.toState();
    file.session.history = opts.session.history.toState();
    file.session.loopGuard = opts.session.loopGuard.toState();
    file.session.state = opts.session.state;
    file.session.diagnostics = opts.session.diagnostics;

    // Only set title if it isn't already present.
    if (!file.metadata.title && opts.title) {
      file.metadata.title = opts.title;
    }

    file.metadata.inProgress = false;
    file.metadata.agentRunId = undefined;
    file.metadata.status = "completed";
    file.metadata.lastActiveAt = isoNow();

    await this.writeFileAtomic(this.getFilePath(opts.id), file);
  }

  async markInterrupted(opts: {
    id: string;
    title?: string;
    session: SessionState;
    userTask: string;
    events: AgentEvent[];
  }) {
    await this.init();
    const file = await this.readFile(opts.id);

    file.conversation.userTasks.push(opts.userTask);
    file.conversation.events.push(...opts.events);

    file.session.memory = opts.session.memory.toState();
    file.session.history = opts.session.history.toState();
    file.session.loopGuard = opts.session.loopGuard.toState();
    file.session.state = opts.session.state;
    file.session.diagnostics = opts.session.diagnostics;

    if (!file.metadata.title && opts.title) {
      file.metadata.title = opts.title;
    }

    file.metadata.inProgress = false;
    file.metadata.agentRunId = undefined;
    file.metadata.status = "interrupted";
    file.metadata.lastActiveAt = isoNow();

    await this.writeFileAtomic(this.getFilePath(opts.id), file);
  }

  async saveMemory(sessionId: string, persistedState: { facts: string[] }) {
    await this.init();
    const file = await this.readFile(sessionId);
    file.persistedMemory = persistedState;
    await this.writeFileAtomic(this.getFilePath(sessionId), file);
  }

  async loadMemory(sessionId: string): Promise<{ facts: string[] } | null> {
    await this.init();
    try {
      const file = await this.readFile(sessionId);
      return file.persistedMemory ?? null;
    } catch {
      return null;
    }
  }
}
