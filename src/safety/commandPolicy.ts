import { CommandBlockedError } from "./errors";

export interface CommandValidationResult {
  allowed: boolean;
  reason?: string;
  blockedPatterns?: string[];
}

export class CommandPolicy {
  // Dangerous command patterns that should always be blocked
  private static readonly DANGEROUS_PATTERNS = [
    /\brm\s+(?:-[fvR]*r|-R)/, // rm -rf, rm -R, rm -r
    /\brm\s+-.*R/, // rm -R variations
    /\bsudo\b/, // sudo anything
    /\bshutdown\b/, // shutdown
    /\breboot\b/, // reboot
    /\bkill\s+-9/, // kill -9
    /\bmkfs/, // format filesystem
    /\bdd\s+.*of=/, // dd write operations
    /\bformat\s+[A-Z]/, // Windows format command
    /\bdel\s+\/[sfqr]/, // Windows del with destructive flags
    /\bclear\s+CMOS/, // BIOS wipe
    /\bfdisk\b/, // partition table edit
    /\bparted\b/, // partition editor (dangerous in scripts)
    /\bsetfacl\s+-[x]/, // ACL removal
    /\bchmod\s+-R\s+777/, // Overly permissive recursive chmod
  ];

  static validate(command: string): CommandValidationResult {
    if (!command || command.trim().length === 0) {
      return { allowed: false, reason: "Command cannot be empty" };
    }

    // Normalize: collapse whitespace, lowercase, trim
    const normalized = command.replace(/\s+/g, " ").trim().toLowerCase();

    const blockedPatterns: string[] = [];

    for (const pattern of CommandPolicy.DANGEROUS_PATTERNS) {
      if (pattern.test(normalized)) {
        blockedPatterns.push(pattern.source);
      }
    }

    if (blockedPatterns.length > 0) {
      return {
        allowed: false,
        reason: `Command contains dangerous patterns: ${blockedPatterns.join(", ")}`,
        blockedPatterns,
      };
    }

    return { allowed: true };
  }

  static validateOrThrow(command: string): void {
    const result = CommandPolicy.validate(command);
    if (!result.allowed) {
      throw new CommandBlockedError(
        command,
        result.reason || "Unknown safety violation",
        result.blockedPatterns,
      );
    }
  }
}
