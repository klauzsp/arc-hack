"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
async function main() {
    const config = (0, config_1.loadConfig)();
    const { app, services } = (0, app_1.buildApp)(config);
    let interval = null;
    if (config.jobsEnabled) {
        interval = setInterval(() => {
            void services.jobService.runScheduledTasks();
        }, 15 * 60 * 1000);
    }
    const close = async () => {
        if (interval)
            clearInterval(interval);
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
