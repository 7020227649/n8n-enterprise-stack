const { Telegraf, Markup } = require("telegraf");
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

// ... (imports)

// ─── Start Command ──────────────────────────────────
bot.start((ctx) => {
    // Check if API Key is configured
    const state = require("./utils/state");
    const hasApiKey = config.n8n.apiKey || state.get("n8nApiKey");

    const welcomeMsg = [
        "🚀 <b>Welcome to n8n Enterprise Control!</b>",
        "",
        "Your robust automation infrastructure is ready.",
        "I am your personal assistant for managing this server.",
        "",
        "<b>🏁 First Go Guide:</b>",
        "1️⃣ <b>Login:</b> Open your domain/IP in browser.",
        "2️⃣ <b>Build:</b> Create your first workflow.",
        "3️⃣ <b>Secure:</b> Run /daily_backup_on to auto-protect data.",
    ];

    const keyboard = [
        [Markup.button.callback("🛠 My Workflows", "op_list_workflows"), Markup.button.callback("🛡 System Status", "sys_health")],
        [Markup.button.callback("📖 Command Menu", "help_menu"), Markup.button.callback("📦 Backup Now", "quick_backup")]
    ];

    if (!hasApiKey) {
        welcomeMsg.push("");
        welcomeMsg.push("⚠️ <b>Action Required:</b> n8n API Key not configured.");
        welcomeMsg.push("Run <code>/setkey &lt;your_key&gt;</code> to enable full functionality.");
        // Add a highlight button for setup
        keyboard.unshift([Markup.button.callback("🔑 Setup API Key", "help_auth_setup")]);
    }

    welcomeMsg.push("");
    welcomeMsg.push("<b>👇 What would you like to do?</b>");

    ctx.reply(welcomeMsg.join("\n"), {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(keyboard)
    });
});

// Action handlers for these buttons need to be routed or existing commands used.
// "help_menu" -> triggers /help logic
// "op_list_workflows" -> triggers /workflows
// "sys_health" -> triggers /health
// "quick_backup" -> triggers /backup_all

// We need to ensure these actions exist or alias them.
// "help.js" handles "help".
// "workflows.js" handles "/workflows".
// I should add listeners for these callbacks if they don't exist, or just use text commands if I use reply keyboard.
// But Inline is better.
// I'll add simple action handlers here or in the respective files?
// Better: Check if `help.js` listens to "help_menu".
// If not, I'll add the actions here for simplicity to redirect to commands.

// ─── Action Handlers ─────────────────────────────────

bot.action("help_menu", (ctx) => ctx.reply("📖 Access the full command list by sending /help"));

bot.action("help_auth_setup", (ctx) => {
    ctx.reply(
        "🔑 <b>API Key Setup</b>\n\n1. Go to your n8n dashboard (Settings > Developer > API Keys).\n2. Create a new API Key.\n3. Copy it and send it here like this:\n\n<code>/setkey <your_api_key></code>",
        { parse_mode: "HTML" }
    );
});

bot.action("op_list_workflows", require("./commands/workflows").listWorkflows);

bot.action("sys_health", async (ctx) => {
    await ctx.answerCbQuery("Checking health...");
    const healthService = require("./services/healthService");
    try {
        const health = await healthService.checkNow();
        const status = health.alive ? "✅ Operational" : "⚠️ Issues Detected";
        // Simple response, user can run /health for details
        await ctx.reply(`<b>System Status:</b> ${status}\nDatabase: ${health.dbConnection ? "Connected" : "Disconnected"}`, { parse_mode: "HTML" });
    } catch (err) {
        await ctx.reply("❌ Error checking health.");
    }
});

bot.action("quick_backup", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("📦 To start a full backup, send /backup_all");
});


// ─── Register Command Modules ────────────────────────
require("./commands/auth")(bot);
require("./commands/workflows")(bot);
require("./commands/backups")(bot);
require("./commands/restore")(bot);
require("./commands/analytics")(bot);
require("./commands/alerts")(bot);
require("./commands/health")(bot);
require("./commands/update")(bot);
require("./commands/system")(bot);
require("./commands/tools")(bot);
require("./commands/credentials")(bot);
require("./commands/import")(bot);
require("./commands/operations")(bot);
require("./commands/dashboard")(bot);
require("./commands/help")(bot);

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
