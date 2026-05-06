import "dotenv/config";
import { runAgent } from "./agent.js";

async function main() {
  const input = process.argv.slice(2).join(" ");

  if (!input) {
    console.log("Please provide a prompt.");
    return;
  }

  const response = await runAgent(input);

  console.log("\nAgent Response:\n");
  console.log(response);
}

main();
