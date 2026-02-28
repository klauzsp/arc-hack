"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const app_1 = require("./app");
const config_1 = require("./config");
function loadLocalEnvFiles() {
    const envFiles = [
        node_path_1.default.resolve(process.cwd(), ".env"),
        node_path_1.default.resolve(process.cwd(), ".env.local"),
        node_path_1.default.resolve(process.cwd(), "backend", ".env"),
        node_path_1.default.resolve(process.cwd(), "backend", ".env.local"),
    ];
    for (const envFile of envFiles) {
        if ((0, node_fs_1.existsSync)(envFile)) {
            process.loadEnvFile(envFile);
        }
    }
}
async function main() {
    loadLocalEnvFiles();
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
