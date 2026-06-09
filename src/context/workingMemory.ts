export interface OpenFile {
  path: string;
  reason?: string;
  truncated?: boolean;
}

export class WorkingMemory {
  // Memory self-governs its own caps to prevent infinite context growth
  private readonly MAX_FACTS = 20;
  private readonly MAX_OPEN_FILES = 20;
  private readonly MAX_SUMMARIES = 10;

  private facts: Set<string> = new Set();
  // Converted to structured objects to explicitly support intent-tracking
  private openedFiles: OpenFile[] = [];
  private summaries: string[] = [];

  // Store persistent knowledge, dropping the oldest if capacity is reached
  addFact(fact: string) {
    if (this.facts.has(fact)) {
      this.facts.delete(fact);
    }

    this.facts.add(fact);

    if (this.facts.size > this.MAX_FACTS) {
      const oldestFact = this.facts.values().next().value;

      if (oldestFact) {
        this.facts.delete(oldestFact);
      }
    }
  }

  // Track file context defensively, prioritizing the most recent files
  addOpenedFile(path?: string, reason?: string, truncated = false) {
    if (!path) return;

    // Deduplicate: If we already opened it, remove it so we can re-add it to the end (most recent)
    // This also updates its reason and truncation status to the latest read
    const existingIndex = this.openedFiles.findIndex((f) => f.path === path);
    if (existingIndex !== -1) {
      this.openedFiles.splice(existingIndex, 1);
    }

    this.openedFiles.push({ path, reason, truncated });

    // Prune the oldest opened file if we exceed the budget
    if (this.openedFiles.length > this.MAX_OPEN_FILES) {
      this.openedFiles.shift();
    }
  }

  // Store loop iteration summaries, retaining only the most recent N summaries
  addSummary(summary: string) {
    this.summaries.push(summary);
    if (this.summaries.length > this.MAX_SUMMARIES) {
      this.summaries.shift();
    }
  }

  // Export the current memory state for the Context Builder
  getState() {
    return {
      facts: Array.from(this.facts),
      // Spread into new arrays to prevent external mutation by reference
      openedFiles: [...this.openedFiles],
      summaries: [...this.summaries],
    };
  }

  // Reset memory state completely
  clear() {
    this.facts.clear();
    this.openedFiles = [];
    this.summaries = [];
  }

  hasOpenedFile(path: string): boolean {
    return this.openedFiles.some((f) => f.path === path);
  }

  wasReadTruncated(path: string | undefined): boolean {
    if (!path) return false;
    return this.openedFiles.some(
      (f) => f.path === path && f.truncated === true,
    );
  }

  getOpenedFiles(): OpenFile[] {
    return [...this.openedFiles];
  }
}
