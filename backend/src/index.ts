import { buildApp } from "./app";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  const { app, services } = buildApp(config);

  let interval: NodeJS.Timeout | null = null;
  if (config.jobsEnabled) {
    interval = setInterval(() => {
      void services.jobService.runScheduledTasks();
    }, 15 * 60 * 1000);
  }

  const close = async () => {
    if (interval) clearInterval(interval);
    await app.close();
  };

  process.on("SIGINT", () => {
    void close().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void close().finally(() => process.exit(0));
  });

  await app.listen({ host: config.host, port: config.port });
}

void main();
