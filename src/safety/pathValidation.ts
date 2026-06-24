import path from "path";
import { PathValidationError } from "./errors";

export interface PathValidationResult {
  allowed: boolean;
  resolvedPath?: string;
  reason?: string;
}

export class PathValidation {
  static validate(
    inputPath: string,
    workspaceRoot: string = process.cwd(),
  ): PathValidationResult {
    if (!inputPath || inputPath.trim().length === 0) {
      return { allowed: false, reason: "Path cannot be empty" };
    }

    try {
      const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
      const resolvedPath = path.resolve(resolvedWorkspaceRoot, inputPath);
      const relative = path.relative(resolvedWorkspaceRoot, resolvedPath);

      // Reject absolute input paths that escape the workspace.
      if (path.isAbsolute(inputPath) && !resolvedPath.startsWith(resolvedWorkspaceRoot)) {
        return {
          allowed: false,
          reason: `Path traversal detected: ${inputPath} resolves outside workspace`,
        };
      }

      // Traversal check: resolvedPath must remain within workspace.
      if (!resolvedPath.startsWith(resolvedWorkspaceRoot) || relative.startsWith("..")) {
        return {
          allowed: false,
          reason: `Path traversal detected: ${inputPath} resolves outside workspace`,
        };
      }

      return {
        allowed: true,
        resolvedPath,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: `Path validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  static validateOrThrow(
    inputPath: string,
    workspaceRoot: string = process.cwd(),
  ): string {
    const result = PathValidation.validate(inputPath, workspaceRoot);
    if (!result.allowed) {
      throw new PathValidationError(inputPath, result.reason || "Invalid path");
    }
    return result.resolvedPath!;
  }

  static validateMultiple(
    inputPaths: string[],
    workspaceRoot: string = process.cwd(),
  ): PathValidationResult {
    for (const inputPath of inputPaths) {
      const result = PathValidation.validate(inputPath, workspaceRoot);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true };
  }

  static validateOrThrowMultiple(
    inputPaths: string[],
    workspaceRoot: string = process.cwd(),
  ): string[] {
    const result = PathValidation.validateMultiple(inputPaths, workspaceRoot);
    if (!result.allowed) {
      throw new PathValidationError(
        inputPaths[0],
        result.reason || "Invalid path",
      );
    }
    return inputPaths.map((p) =>
      PathValidation.validateOrThrow(p, workspaceRoot),
    );
  }
}
