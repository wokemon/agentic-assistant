export class WorkingMemory {
  private facts: Set<string> = new Set();
  private openedFiles: Set<string> = new Set();
  private summaries: string[] = [];

  // Store persistent knowledge
  addFact(fact: string) {
    this.facts.add(fact);
  }

  // Track file context
  addOpenedFile(filePath: string) {
    this.openedFiles.add(filePath);
  }

  // Store loop iteration summaries
  addSummary(summary: string) {
    this.summaries.push(summary);
  }

  // Export the current memory state for the Context Builder
  getState() {
    return {
      facts: Array.from(this.facts),
      openedFiles: Array.from(this.openedFiles),
      summaries: this.summaries,
    };
  }
}
