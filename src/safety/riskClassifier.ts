export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export interface RiskClassification {
  level: RiskLevel;
  reason: string;
  requiresApproval: boolean;
  metadata?: Record<string, unknown>;
}

export class RiskClassifier {
  static classify(toolName: string, args: unknown): RiskClassification {
    // Phase 6: Interactive approval workflows will use requiresApproval
    // Phase 5: All actions proceed but are classified for audit logging

    if (toolName === "write_files") {
      const writeArgs = args as any;
      const fileCount = writeArgs.files?.length || 0;

      if (fileCount > 10) {
        return {
          level: RiskLevel.HIGH,
          reason: `Writing ${fileCount} files - mass write operation`,
          requiresApproval: false,
          metadata: { fileCount },
        };
      }

      return {
        level: RiskLevel.MEDIUM,
        reason: `Writing ${fileCount} file(s)`,
        requiresApproval: false,
        metadata: { fileCount },
      };
    }

    if (toolName === "terminal_execute") {
      const termArgs = args as any;
      const command = termArgs.command || "";

      if (
        command.includes("&&") ||
        command.includes(";") ||
        command.includes("|")
      ) {
        return {
          level: RiskLevel.HIGH,
          reason: "Command contains piping/chaining - complex operation",
          requiresApproval: false,
          metadata: { command },
        };
      }

      return {
        level: RiskLevel.MEDIUM,
        reason: "Executing terminal command",
        requiresApproval: false,
        metadata: { command },
      };
    }

    return {
      level: RiskLevel.LOW,
      reason: `Tool: ${toolName}`,
      requiresApproval: false,
    };
  }

  static requiresApproval(toolName: string, args: unknown): boolean {
    return RiskClassifier.classify(toolName, args).requiresApproval;
  }
}
