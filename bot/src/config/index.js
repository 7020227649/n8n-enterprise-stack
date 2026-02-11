
const config = {
  botToken: process.env.BOT_TOKEN,
  adminId: process.env.ADMIN_ID,
  n8n: {
    baseURL: process.env.N8N_BASE_URL || "http://n8n-main:5678",
    user: process.env.N8N_USER,
    pass: process.env.N8N_PASS
  },
  paths: {
    state: "/data/bot-state.json",
    backups: "/data/workflow-backups"
  },
  limits: {
    maxBackups: 3,
    maxChunkSizeMB: 40,
    rateLimit: { maxRequests: 30, windowMs: 60000 },
    executionFetchLimit: 100,
    dailyBackupCron: "0 3 * * *"
  }
};

module.exports = config;
