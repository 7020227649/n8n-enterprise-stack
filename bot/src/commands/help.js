
const { Markup } = require("telegraf");

module.exports = (bot) => {

    // ─── /help — Interactive categorized help menu ─────

    bot.command("help", async (ctx) => {
        await ctx.reply(
            `📖 <b>Help — Choose a Category</b>`,
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("📋 Workflow Control", "help_workflows")],
                    [Markup.button.callback("💾 Backup & Restore", "help_backup")],
                    [Markup.button.callback("📊 Analytics", "help_analytics")],
                    [Markup.button.callback("🔔 Alerts & Monitoring", "help_alerts")],
                    [Markup.button.callback("🔧 Tools", "help_tools")],
                    [Markup.button.callback("⚙️ System", "help_system")],
                ]),
            }
        );
    });

    bot.action("help_workflows", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            [
                `📋 <b>Workflow Control</b>`,
                ``,
                `/workflows — List all workflows`,
                `/workflow_status — Status + last execution`,
                `/run — Trigger a workflow manually`,
                `/enable — Activate an inactive workflow`,
                `/disable — Deactivate a running workflow`,
                `/delete — Delete with confirmation`,
                `/search &lt;name&gt; — Search by name`,
                `/clone — Duplicate a workflow`,
                `/export — Download as JSON file`,
                `/nodes — View node breakdown`,
                `/schedule — List scheduled/cron workflows`,
                `/stop — Stop a running execution`,
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Back", "help_back")]]),
            }
        );
    });

    bot.action("help_backup", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            [
                `💾 <b>Backup & Restore</b>`,
                ``,
                `/backup_all — Full backup of all workflows`,
                `/backup_workflow — Backup a single workflow`,
                `/daily_backup_on — Enable daily auto-backup (3 AM)`,
                `/daily_backup_off — Disable daily auto-backup`,
                `/daily_backup_status — Check backup status`,
                ``,
                `/restore_workflow — Upload & restore a backup`,
                `/restore_status — View restore history`,
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Back", "help_back")]]),
            }
        );
    });

    bot.action("help_analytics", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            [
                `📊 <b>Analytics</b>`,
                ``,
                `/stats — Single workflow statistics`,
                `/stats_all — Global execution summary`,
                `/top — Top workflows by run count`,
                `/failures — Recent failed executions`,
                `/recent — Last 10 executions`,
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Back", "help_back")]]),
            }
        );
    });

    bot.action("help_alerts", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            [
                `🔔 <b>Alerts & Monitoring</b>`,
                ``,
                `/alerts_on — Enable failure notifications`,
                `/alerts_off — Disable failure notifications`,
                `/alerts_status — View alert config`,
                `/mute — Silence alerts for a workflow`,
                `/unmute — Re-enable alerts`,
                `/credentials — List n8n credentials`,
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Back", "help_back")]]),
            }
        );
    });

    bot.action("help_tools", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            [
                `🔧 <b>Tools</b>`,
                ``,
                `/search &lt;name&gt; — Search workflows by name`,
                `/clone — Duplicate a workflow`,
                `/export — Download workflow as JSON`,
                `/nodes — View workflow node details`,
                `/schedule — Show scheduled workflows`,
                `/stop — Stop a running execution`,
                `/credentials — List credential names`,
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Back", "help_back")]]),
            }
        );
    });

    bot.action("help_system", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            [
                `⚙️ <b>System</b>`,
                ``,
                `/health — n8n health check + uptime`,
                `/system — Server CPU, RAM, disk usage`,
                `/logs — View last 25 n8n log lines`,
                `/disk — Docker disk usage`,
                `/restart_n8n — Quick restart (no update)`,
                `/update_n8n — Pull latest image + restart`,
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([[Markup.button.callback("◀️ Back", "help_back")]]),
            }
        );
    });

    bot.action("help_back", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `📖 <b>Help — Choose a Category</b>`,
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("📋 Workflow Control", "help_workflows")],
                    [Markup.button.callback("💾 Backup & Restore", "help_backup")],
                    [Markup.button.callback("📊 Analytics", "help_analytics")],
                    [Markup.button.callback("🔔 Alerts & Monitoring", "help_alerts")],
                    [Markup.button.callback("🔧 Tools", "help_tools")],
                    [Markup.button.callback("⚙️ System", "help_system")],
                ]),
            }
        );
    });

};
