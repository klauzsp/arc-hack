import { existsSync } from "node:fs";
import path from "node:path";
import { buildApp } from "./app";
import { loadConfig } from "./config";

function loadLocalEnvFiles() {
  const envFiles = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "backend", ".env"),
    path.resolve(process.cwd(), "backend", ".env.local"),
  ];

  for (const envFile of envFiles) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
    }
  }
}

async function main() {
  loadLocalEnvFiles();
  const config = loadConfig();
  const { app, services } = buildApp(config);

  await app.ready();
  console.log("Registered routes:\n" + app.printRoutes());

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
