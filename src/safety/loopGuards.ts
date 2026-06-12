import { stableStringify } from "./stableStringtify";

export type ToolSignature = {
  tool: string;
  args: string;
};

export interface ExecutionMetrics {
  totalCalls: number;
  failedCalls: number;
  parseFailures: number;
}

export class LoopGuard {
  private recentActions: ToolSignature[] = [];
  private failedActions: ToolSignature[] = [];
  private parseFailureCount = 0;
  private totalExecutions = 0;

  addAction(tool: string, args: unknown) {
    this.recentActions.push({
      tool,
      args: stableStringify(args),
    });

    if (this.recentActions.length > 5) {
      this.recentActions.shift();
    }

    this.totalExecutions++;
  }

  trackFailure(tool: string, args: unknown) {
    this.failedActions.push({
      tool,
      args: stableStringify(args),
    });

    if (this.failedActions.length > 5) {
      this.failedActions.shift();
    }
  }

  trackParseFailure() {
    this.parseFailureCount++;
  }

  isRepeating(tool: string, args: unknown): boolean {
    const signature = {
      tool,
      args: stableStringify(args),
    };

    return this.recentActions.some(
      (action) =>
        action.tool === signature.tool && action.args === signature.args,
    );
  }

  isRepeatedlyFailing(tool: string, args: unknown): boolean {
    if (this.failedActions.length < 2) return false;

    const signature = {
      tool,
      args: stableStringify(args),
    };

    const failureCount = this.failedActions.filter(
      (action) =>
        action.tool === signature.tool && action.args === signature.args,
    ).length;

    return failureCount >= 2;
  }

  isRunaway(): boolean {
    if (this.parseFailureCount >= 3) return true;

    if (
      this.recentActions.length >= 3 &&
      this.failedActions.length >= 3 &&
      this.recentActions.length === this.failedActions.length
    ) {
      return true;
    }

    return false;
  }

  getMetrics(): ExecutionMetrics {
    return {
      totalCalls: this.totalExecutions,
      failedCalls: this.failedActions.length,
      parseFailures: this.parseFailureCount,
    };
  }

  toState(): {
    recentActions: ToolSignature[];
    failedActions: ToolSignature[];
    parseFailureCount: number;
    totalExecutions: number;
  } {
    return {
      recentActions: [...this.recentActions],
      failedActions: [...this.failedActions],
      parseFailureCount: this.parseFailureCount,
      totalExecutions: this.totalExecutions,
    };
  }

  static fromState(state: {
    recentActions: ToolSignature[];
    failedActions: ToolSignature[];
    parseFailureCount: number;
    totalExecutions: number;
  }): LoopGuard {
    const guard = new LoopGuard();
    guard.recentActions = [...state.recentActions];
    guard.failedActions = [...state.failedActions];
    guard.parseFailureCount = state.parseFailureCount;
    guard.totalExecutions = state.totalExecutions;
    return guard;
  }
}
