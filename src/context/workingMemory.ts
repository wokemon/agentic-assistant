export class WorkingMemory {
  // Memory self-governs its own caps to prevent infinite context growth
  private readonly MAX_FACTS = 20;
  private readonly MAX_OPEN_FILES = 20;
  private readonly MAX_SUMMARIES = 10;

  private facts: Set<string> = new Set();
  // Converted to an Array to explicitly support 'bounded recency'
  private openedFiles: string[] = [];
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
  addOpenedFile(filePath?: string) {
    if (!filePath) return;

    // Deduplicate: If we already opened it, remove it so we can re-add it to the end (most recent)
    const existingIndex = this.openedFiles.indexOf(filePath);
    if (existingIndex !== -1) {
      this.openedFiles.splice(existingIndex, 1);
    }

    this.openedFiles.push(filePath);

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
}
