import { describe, it, expect } from "vitest";
import { RiskClassifier, RiskLevel } from "../../src/safety/riskClassifier";

describe("RiskClassifier", () => {
  it("should classify write_files with few files as MEDIUM", () => {
    const classification = RiskClassifier.classify("write_files", {
      files: [{ path: "file1.ts", content: "content" }],
    });

    expect(classification.level).toBe(RiskLevel.MEDIUM);
    expect(classification.requiresApproval).toBe(false);
    expect(classification.metadata?.fileCount).toBe(1);
  });

  it("should classify write_files with many files as HIGH", () => {
    const files = Array.from({ length: 15 }, (_, i) => ({
      path: `file${i}.ts`,
      content: "content",
    }));

    const classification = RiskClassifier.classify("write_files", {
      files,
    });

    expect(classification.level).toBe(RiskLevel.HIGH);
    expect(classification.metadata?.fileCount).toBe(15);
  });

  it("should classify terminal_execute without pipes as MEDIUM", () => {
    const classification = RiskClassifier.classify("terminal_execute", {
      command: "ls -la",
    });

    expect(classification.level).toBe(RiskLevel.MEDIUM);
  });

  it("should classify terminal_execute with pipes as HIGH", () => {
    const classification = RiskClassifier.classify("terminal_execute", {
      command: "cat file.txt | grep test",
    });

    expect(classification.level).toBe(RiskLevel.HIGH);
  });

  it("should classify terminal_execute with command chaining as HIGH", () => {
    const classification1 = RiskClassifier.classify("terminal_execute", {
      command: "npm test && npm build",
    });
    const classification2 = RiskClassifier.classify("terminal_execute", {
      command: "echo test; ls",
    });

    expect(classification1.level).toBe(RiskLevel.HIGH);
    expect(classification2.level).toBe(RiskLevel.HIGH);
  });

  it("should classify unknown tools as LOW", () => {
    const classification = RiskClassifier.classify("unknown_tool", {});

    expect(classification.level).toBe(RiskLevel.LOW);
    expect(classification.requiresApproval).toBe(false);
  });

  it("should return false for requiresApproval in all cases", () => {
    const result1 = RiskClassifier.requiresApproval("write_files", {
      files: Array.from({ length: 20 }, (_, i) => ({
        path: `file${i}.ts`,
        content: "content",
      })),
    });
    const result2 = RiskClassifier.requiresApproval("terminal_execute", {
      command: "cat file.txt | grep test",
    });

    expect(result1).toBe(false);
    expect(result2).toBe(false);
  });
});
