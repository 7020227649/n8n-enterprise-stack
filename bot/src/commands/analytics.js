
const n8nApi = require("../services/n8nApi");
const analyticsService = require("../services/analyticsService");
const { escapeHtml, statusEmoji, formatStatsTable, formatExecutionCard, executionStatusEmoji } = require("../utils/format");
const { buildPagedKeyboard } = require("../utils/pagination");
const { Markup } = require("telegraf");

module.exports = (bot) => {

    // ─── /stats — Single workflow stats (interactive) ───

    bot.command("stats", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflows.map(wf => ({
                label: `${statusEmoji(wf.active)} ${wf.name}`,
                callbackData: `stats_wf_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "statwf_pg");

            await ctx.reply(
                `📊 <b>Workflow Stats</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^statwf_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflows.map(wf => ({
                label: `${statusEmoji(wf.active)} ${wf.name}`,
                callbackData: `stats_wf_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "statwf_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📊 <b>Workflow Stats</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("statwf_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^stats_wf_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery("Loading stats...");

            const wf = await n8nApi.getWorkflow(id);
            const stats = await analyticsService.getWorkflowStats(id);

            const msg = [
                `📊 <b>Stats: ${escapeHtml(wf.name)}</b>`,
                ``,
                formatStatsTable(stats)
            ].join("\n");

            await ctx.reply(msg, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /stats_all — Global execution summary ──────────

    bot.command("stats_all", async (ctx) => {
        try {
            await ctx.reply("⏳ Fetching global stats...");

            const stats = await analyticsService.getGlobalStats();
            const workflows = await n8nApi.getAllWorkflows();

            const msg = [
                `📊 <b>Global Execution Summary</b>`,
                ``,
                `├ Total Workflows: <b>${workflows.length}</b>`,
                `├ Active: <b>${workflows.filter(w => w.active).length}</b>`,
                `├ Inactive: <b>${workflows.filter(w => !w.active).length}</b>`,
                ``,
                formatStatsTable(stats)
            ].join("\n");

            await ctx.reply(msg, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /top — Top workflows by execution count ────────

    bot.command("top", async (ctx) => {
        try {
            await ctx.reply("⏳ Calculating top workflows...");

            const top = await analyticsService.getTopWorkflows(10);

            if (top.length === 0) {
                return ctx.reply("📭 No execution data found.");
            }

            const lines = top.map((wf, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                const rate = wf.count > 0 ? ((wf.success / wf.count) * 100).toFixed(0) : "0";
                return `${medal} <b>${escapeHtml(wf.name)}</b>\n   ├ Runs: ${wf.count} | ✅ ${wf.success} | ❌ ${wf.failed}\n   └ Success Rate: ${rate}%`;
            });

            await ctx.reply(
                `🏆 <b>Top Workflows</b>\n\n${lines.join("\n\n")}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /failures — Recent failed executions ───────────

    bot.command("failures", async (ctx) => {
        try {
            await ctx.reply("⏳ Fetching recent failures...");

            const failures = await analyticsService.getRecentFailures(10);

            if (failures.length === 0) {
                return ctx.reply("✅ No recent failures. Everything is running smoothly!");
            }

            const lines = failures.map(exec => formatExecutionCard(exec));

            await ctx.reply(
                `❌ <b>Recent Failures</b> (${failures.length})\n\n${lines.join("\n\n")}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /recent — Last N executions ────────────────────

    bot.command("recent", async (ctx) => {
        try {
            await ctx.reply("⏳ Fetching recent executions...");

            const executions = await analyticsService.getRecentExecutions(10);

            if (executions.length === 0) {
                return ctx.reply("📭 No recent executions found.");
            }

            const lines = executions.map(exec => formatExecutionCard(exec));

            await ctx.reply(
                `📋 <b>Recent Executions</b> (${executions.length})\n\n${lines.join("\n\n")}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

};
