import { describe, it, expect } from "vitest";
import path from "path";
import { PathValidation } from "../../src/safety/pathValidation";
import { PathValidationError } from "../../src/safety/errors";

describe("PathValidation", () => {
  const workspaceRoot = path.resolve("/workspace");

  it("should allow paths within workspace", () => {
    const result = PathValidation.validate("src/index.ts", workspaceRoot);

    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toBe(path.join(workspaceRoot, "src/index.ts"));
  });

  it("should allow relative paths with ./", () => {
    const result = PathValidation.validate("./src/index.ts", workspaceRoot);

    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toBe(path.join(workspaceRoot, "src/index.ts"));
  });

  it("should block path traversal with ../", () => {
    const result = PathValidation.validate("../etc/passwd", workspaceRoot);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Path traversal detected");
  });

  it("should block deep path traversal", () => {
    const result = PathValidation.validate("../../../../etc/passwd", workspaceRoot);

    expect(result.allowed).toBe(false);
  });

  it("should block absolute paths outside workspace", () => {
    const result = PathValidation.validate("/etc/passwd", workspaceRoot);

    expect(result.allowed).toBe(false);
  });

  it("should allow absolute paths inside workspace", () => {
    const abs = path.join(workspaceRoot, "src/index.ts");
    const result = PathValidation.validate(abs, workspaceRoot);

    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toBe(path.join(workspaceRoot, "src/index.ts"));
  });

  it("should allow valid nested paths", () => {
    const result = PathValidation.validate(
      "src/context/contextBuilder.ts",
      workspaceRoot,
    );

    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toBe(
      path.join(workspaceRoot, "src/context/contextBuilder.ts"),
    );
  });

  it("should reject empty paths", () => {
    const result1 = PathValidation.validate("", workspaceRoot);
    const result2 = PathValidation.validate("   ", workspaceRoot);

    expect(result1.allowed).toBe(false);
    expect(result1.reason).toBe("Path cannot be empty");
    expect(result2.allowed).toBe(false);
  });

  it("should throw PathValidationError on validateOrThrow for invalid paths", () => {
    expect(() => {
      PathValidation.validateOrThrow("../etc/passwd", workspaceRoot);
    }).toThrow(PathValidationError);
  });

  it("should return resolved path on validateOrThrow for valid paths", () => {
    const result = PathValidation.validateOrThrow("src/index.ts", workspaceRoot);

    expect(result).toBe(path.join(workspaceRoot, "src/index.ts"));
  });

  it("should validate multiple paths", () => {
    const result = PathValidation.validateMultiple(
      ["src/index.ts", "src/utils.ts"],
      workspaceRoot,
    );

    expect(result.allowed).toBe(true);
  });

  it("should fail fast on first invalid path in validateMultiple", () => {
    const result = PathValidation.validateMultiple(
      ["src/index.ts", "../etc/passwd", "src/utils.ts"],
      workspaceRoot,
    );

    expect(result.allowed).toBe(false);
  });

  it("should validate multiple paths with validateOrThrowMultiple", () => {
    const result = PathValidation.validateOrThrowMultiple(
      ["src/index.ts", "src/utils.ts"],
      workspaceRoot,
    );

    expect(result.length).toBe(2);
    expect(result[0]).toBe(path.join(workspaceRoot, "src/index.ts"));
  });

  it("should throw on invalid path in validateOrThrowMultiple", () => {
    expect(() => {
      PathValidation.validateOrThrowMultiple(
        ["src/index.ts", "../etc/passwd"],
        workspaceRoot,
      );
    }).toThrow(PathValidationError);
  });
});
