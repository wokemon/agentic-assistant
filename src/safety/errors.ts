export class SafetyBlockedError extends Error {
  constructor(
    public readonly category: string,
    public readonly reason: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(`[${category}] ${reason}`);
    this.name = "SafetyBlockedError";
  }
}

export class CommandBlockedError extends SafetyBlockedError {
  constructor(command: string, reason: string, blockedPatterns?: string[]) {
    super("CommandBlocked", reason, { command, blockedPatterns });
    this.name = "CommandBlockedError";
  }
}

export class PathValidationError extends SafetyBlockedError {
  constructor(path: string, reason: string) {
    super("PathValidation", reason, { path });
    this.name = "PathValidationError";
  }
}

export class LoopGuardError extends SafetyBlockedError {
  constructor(reason: string, metadata?: Record<string, unknown>) {
    super("LoopGuard", reason, metadata);
    this.name = "LoopGuardError";
  }
}
