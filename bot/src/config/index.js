
const crypto = require("crypto");

const config = {
    botToken: process.env.BOT_TOKEN,
    adminId: process.env.ADMIN_ID,
    webhookSecret: process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString("hex"),
    n8n: {
        baseURL: process.env.N8N_BASE_URL || "http://n8n-main:5678",
        user: process.env.N8N_USER,
        pass: process.env.N8N_PASS,
        apiKey: process.env.N8N_API_KEY
    },
    paths: {
        state: "/data/bot-state.json",
        backups: "/data/workflow-backups"
    },
    limits: {
        maxBackups: 3,
        maxChunkSizeMB: 40,
        maxBodySize: "1mb",
        rateLimit: { maxRequests: 30, windowMs: 60000 },
        executionFetchLimit: 100,
        dailyBackupCron: "0 3 * * *"
    }
};

module.exports = config;
