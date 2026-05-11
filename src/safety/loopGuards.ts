export type ToolSignature = {
  tool: string;
  args: string;
};

export class LoopGuard {
  private recentActions: ToolSignature[] = [];

  addAction(tool: string, args: unknown) {
    this.recentActions.push({
      tool,
      args: JSON.stringify(args),
    });

    // keep recent history small
    if (this.recentActions.length > 5) {
      this.recentActions.shift();
    }
  }

  isRepeating(tool: string, args: unknown): boolean {
    const signature = {
      tool,
      args: JSON.stringify(args),
    };

    return this.recentActions.some(
      (action) =>
        action.tool === signature.tool && action.args === signature.args,
    );
  }
}
