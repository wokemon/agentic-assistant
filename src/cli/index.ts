import readline from "readline";
import { runAgent } from "../agent/loop";

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
  console.log("Agent ready. Type 'exit' to quit.\n");

  while (true) {
    const input = await ask("> ");

    if (input.trim().toLowerCase() === "exit") {
      break;
    }

    await runAgent(input);
  }

  rl.close();
}

main();
