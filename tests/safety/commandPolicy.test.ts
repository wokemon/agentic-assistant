import { describe, it, expect } from "vitest";
import { CommandPolicy } from "../../src/safety/commandPolicy";
import { CommandBlockedError } from "../../src/safety/errors";

describe("CommandPolicy", () => {
  it("should reject non-allowlisted commands (rm)", () => {
    const result = CommandPolicy.validate("rm -rf /tmp");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(
      "Command not permitted: only build, test, and git commands are allowed",
    );
  });

  it("should reject sudo commands", () => {
    const result = CommandPolicy.validate("sudo apt-get install");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(
      "Command not permitted: only build, test, and git commands are allowed",
    );
  });

  it("should allow git commands", () => {
    const result = CommandPolicy.validate("git status");
    expect(result.allowed).toBe(true);
  });

  it("should allow npm/pnpm/node commands", () => {
    expect(CommandPolicy.validate("pnpm vitest run").allowed).toBe(true);
    expect(CommandPolicy.validate("npm run build").allowed).toBe(true);
    expect(CommandPolicy.validate("node -e \"console.log(1)\"").allowed).toBe(true);
  });

  it("should allow commands with leading/trailing whitespace", () => {
    expect(CommandPolicy.validate("  git status  ").allowed).toBe(true);
  });

  it("should reject empty commands", () => {
    const result1 = CommandPolicy.validate("");
    const result2 = CommandPolicy.validate("   ");

    expect(result1.allowed).toBe(false);
    expect(result1.reason).toBe("Command cannot be empty");
    expect(result2.allowed).toBe(false);
  });

  it("should throw CommandBlockedError on validateOrThrow", () => {
    expect(() => {
      CommandPolicy.validateOrThrow("rm -rf /");
    }).toThrow(CommandBlockedError);
  });

  it("should not throw on validateOrThrow for safe commands", () => {
    expect(() => {
      CommandPolicy.validateOrThrow("git status");
    }).not.toThrow();
  });
});
