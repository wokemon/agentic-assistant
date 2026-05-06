import readline from "readline";
import { runAgent } from "../agent/loop";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Prompt: ", async (input) => {
  await runAgent(input);

  rl.close();
});
