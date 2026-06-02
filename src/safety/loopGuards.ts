import { stableStringify } from "./stableStringtify";

export type ToolSignature = {
  tool: string;
  args: string;
};

export class LoopGuard {
  private recentActions: ToolSignature[] = [];

  addAction(tool: string, args: unknown) {
    this.recentActions.push({
      tool,
      args: stableStringify(args),
    });

    if (this.recentActions.length > 5) {
      this.recentActions.shift();
    }
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
}
