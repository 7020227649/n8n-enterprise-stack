
const { Telegraf } = require("telegraf");
const config = require("./config");
const { validateEnv } = require("./utils/validators");

// ─── Startup Validation ─────────────────────────────
const { errors, warnings } = validateEnv();

if (errors.length > 0) {
    console.error("❌ FATAL: Missing required environment variables:");
    errors.forEach(e => console.error(`   • ${e}`));
    console.error("\nBot cannot start. Set the required variables and try again.");
    process.exit(1);
}

if (warnings.length > 0) {
    console.warn("⚠️  Warnings:");
    warnings.forEach(w => console.warn(`   • ${w}`));
}

// ─── Initialize Bot ──────────────────────────────────
const bot = new Telegraf(config.botToken);

// ─── Middleware ──────────────────────────────────────
const adminOnly = require("./middleware/admin");
const rateLimit = require("./middleware/rateLimit");

bot.use(adminOnly);
bot.use(rateLimit);

// ─── Start Command ──────────────────────────────────
bot.start((ctx) => {
    ctx.reply(
        [
            "🚀 <b>n8n Enterprise Control Bot</b>",
            "",
            "📋 <b>Workflow Control</b>",
            "/workflows — List all workflows",
            "/workflow_status — Status & last execution",
            "/run — Trigger a workflow",
            "/enable — Activate a workflow",
            "/disable — Deactivate a workflow",
            "/delete — Remove a workflow",
            "",
            "💾 <b>Backup</b>",
            "/backup_all — Full backup",
            "/backup_workflow — Single workflow backup",
            "/daily_backup_on — Enable daily backup",
            "/daily_backup_off — Disable daily backup",
            "/daily_backup_status — Daily backup status",
            "",
            "♻️ <b>Restore</b>",
            "/restore_workflow — Restore from file",
            "/restore_status — Restore history",
            "",
            "📊 <b>Analytics</b>",
            "/stats — Workflow stats",
            "/stats_all — Global summary",
            "/top — Top workflows",
            "/failures — Recent failures",
            "/recent — Recent executions",
            "",
            "🔔 <b>Alerts</b>",
            "/alerts_on — Enable alerts",
            "/alerts_off — Disable alerts",
            "/alerts_status — Alert config",
            "/mute — Mute workflow alerts",
            "/unmute — Unmute workflow alerts",
            "",
            "⚙️ <b>System</b>",
            "/health — n8n health check",
            "/update_n8n — Update n8n to latest",
        ].join("\n"),
        { parse_mode: "HTML" }
    );
});

// ─── Register Command Modules ────────────────────────
require("./commands/workflows")(bot);
require("./commands/backups")(bot);
require("./commands/restore")(bot);
require("./commands/analytics")(bot);
require("./commands/alerts")(bot);
require("./commands/health")(bot);
require("./commands/update")(bot);

// ─── Initialize Server (failure webhook + alerts) ────
require("./server")(bot);

// ─── Restore daily backup cron if it was enabled ─────
const state = require("./utils/state");
const backupService = require("./services/backupService");
const dailyStatus = state.get("dailyBackup");
if (dailyStatus && dailyStatus.enabled && dailyStatus.chatId) {
    backupService.setupDailyCron(bot, dailyStatus.chatId);
    console.log("Daily backup cron restored from state.");
}

// ─── Start Health Monitoring ─────────────────────────
const healthService = require("./services/healthService");
healthService.startMonitoring(bot);

// ─── Global Error Handler ────────────────────────────
bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}:`, err);
    try {
        ctx.reply("⚠️ An unexpected error occurred. Please try again.");
    } catch (_) { }
});

// ─── Graceful Shutdown ───────────────────────────────
const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down...`);
    healthService.stopMonitoring();
    bot.stop(signal);
    process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── Launch ──────────────────────────────────────────
bot.launch();
console.log("🚀 n8n Enterprise Control Bot started.");
