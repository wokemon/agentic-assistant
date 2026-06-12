import readline from "readline";
import { WorkingMemory } from "../context/workingMemory";
import { runAgentTask } from "../agent/runner";
import { logger } from "../shared/logger";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log("🤖 Agent ready. Type 'exit' to quit.\n");

  while (true) {
      const input = await ask("> ");

    if (input.trim().toLowerCase() === "exit") {
      console.log("Goodbye!");
      break;
    }

    if (!input.trim()) {
      continue;
    }

    try {
      console.log("\n⏳ Running agent...\n");
      const result = await runAgentTask(input, new WorkingMemory(), (event) => {
        // Keep existing CLI summary output; add lightweight observability.
        switch (event.type) {
          case "iteration_start":
            console.log(`🔁 Iteration ${event.iteration}`);
            return;
          case "tool_call":
            console.log(`🛠️  Tool call: ${event.tool}`);
            return;
          case "tool_result":
            console.log(
              `✅ Tool result: ${event.tool} (success=${String(event.success)})`,
            );
            return;
          case "error":
            console.log(`❌ Agent error: ${event.message}`);
            return;
          case "safety_stop":
            console.log(`🛑 Safety stop: ${event.reason}`);
            return;
          default:
            return;
        }
      });

      console.log("📝 Agent response:\n");

      switch (result.status) {
        case "completed":
          console.log(result.finalAnswer);
          break;

        default:
          console.log(`Agent stopped: ${result.status}`);
      }

      console.log("\nDiagnostics:");
      console.table(result.diagnostics);
      console.log("\n");
    } catch (error) {
      logger.error({ error }, "Agent execution failed");
      console.error(
        "❌ Error:",
        error instanceof Error ? error.message : "Unknown error",
      );
      console.log("\n");
    }
  }

  rl.close();
}

main().catch((error) => {
  logger.error({ error }, "Fatal error in CLI");
  process.exit(1);
});
