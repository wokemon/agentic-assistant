import { describe, it, expect } from "vitest";
import { CommandPolicy } from "../../src/safety/commandPolicy";
import { CommandBlockedError } from "../../src/safety/errors";

describe("CommandPolicy", () => {
  it("should block rm -rf", () => {
    const result = CommandPolicy.validate("rm -rf /tmp");
    expect(result.allowed).toBe(false);
    expect(result.blockedPatterns?.length).toBeGreaterThan(0);
  });

  it("should block rm -r variations", () => {
    const result1 = CommandPolicy.validate("rm -r /tmp");
    const result2 = CommandPolicy.validate("rm -R /tmp");
    expect(result1.allowed).toBe(false);
    expect(result2.allowed).toBe(false);
  });

  it("should block sudo commands", () => {
    const result = CommandPolicy.validate("sudo apt-get install");
    expect(result.allowed).toBe(false);
  });

  it("should block shutdown and reboot", () => {
    const result1 = CommandPolicy.validate("shutdown -h now");
    const result2 = CommandPolicy.validate("reboot");
    expect(result1.allowed).toBe(false);
    expect(result2.allowed).toBe(false);
  });

  it("should block dangerous patterns with different spacing", () => {
    const result = CommandPolicy.validate("rm    -rf    /tmp");
    expect(result.allowed).toBe(false);
  });

  it("should block dangerous patterns in lowercase", () => {
    const result = CommandPolicy.validate("RM -RF /TMP");
    expect(result.allowed).toBe(false);
  });

  it("should allow safe commands", () => {
    const result1 = CommandPolicy.validate("ls -la");
    const result2 = CommandPolicy.validate("cat file.txt");
    const result3 = CommandPolicy.validate("echo hello");
    const result4 = CommandPolicy.validate("git status");

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(true);
    expect(result4.allowed).toBe(true);
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
      CommandPolicy.validateOrThrow("ls -la");
    }).not.toThrow();
  });
});
