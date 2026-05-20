import readline from "readline";
import { runAgent } from "../agent/loop";
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
      const result = await runAgent(input);
      console.log("📝 Agent response:\n");
      console.log(result);
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
