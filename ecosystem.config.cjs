/**
 * Produção neste host: Postgres/Redis no Docker, processo Node no PM2.
 * Sessões MCP são in-memory — fork com 1 instância (não usar cluster).
 *
 *   nvm use
 *   npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
const fs = require("node:fs");
const path = require("node:path");

const cwd = __dirname;
const nvmrcVersion = fs.readFileSync(path.join(cwd, ".nvmrc"), "utf8").trim();
const nvmNode = path.join(
  process.env.HOME || "/root",
  ".nvm/versions/node",
  `v${nvmrcVersion}`,
  "bin/node",
);

module.exports = {
  apps: [
    {
      name: "se7e-mcp",
      cwd,
      script: "dist/main.js",
      interpreter: fs.existsSync(nvmNode) ? nvmNode : "node",
      interpreter_args: "--env-file-if-exists=.env",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3333",
      },
      max_memory_restart: "1G",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "10s",
      restart_delay: 4000,
      kill_timeout: 12_000,
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      time: true,
      merge_logs: true,
    },
  ],
};
