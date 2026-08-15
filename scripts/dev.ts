const server = Bun.spawn(["bun", "run", "dev:server"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

const client = Bun.spawn(["bun", "run", "dev:client"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

async function shutdown() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.all([server.exited, client.exited]);
