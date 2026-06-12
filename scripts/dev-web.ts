import { spawn } from "child_process";

function run(cmd: string, args: string[], name: string) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    // eslint-disable-next-line no-console
    console.log(`[dev-web] ${name} exited with code ${code}`);
  });

  return child;
}

const server = run("pnpm", ["dev:server"], "backend");
const web = run("pnpm", ["--dir", "frontend", "dev"], "frontend");

const shutdown = () => {
  server.kill();
  web.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
