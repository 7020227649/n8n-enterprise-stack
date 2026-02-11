
const n8nApi = require("../services/n8nApi");
const alertService = require("../services/alertService");
const { escapeHtml, statusEmoji } = require("../utils/format");
const { buildPagedKeyboard } = require("../utils/pagination");
const { Markup } = require("telegraf");

module.exports = (bot) => {

    // ─── /alerts_on — Enable global alerts ──────────────

    bot.command("alerts_on", async (ctx) => {
        alertService.enable();
        await ctx.reply(
            `🔔 <b>Alerts Enabled</b>\n└ You will receive real-time failure notifications.`,
            { parse_mode: "HTML" }
        );
    });

    // ─── /alerts_off — Disable global alerts ────────────

    bot.command("alerts_off", async (ctx) => {
        alertService.disable();
        await ctx.reply(
            `🔕 <b>Alerts Disabled</b>\n└ Failure notifications are now off.`,
            { parse_mode: "HTML" }
        );
    });

    // ─── /alerts_status — Show alert configuration ──────

    bot.command("alerts_status", async (ctx) => {
        try {
            const status = alertService.getStatus();
            const enabledText = status.enabled ? "🟢 Enabled" : "🔴 Disabled";
            const mutedCount = (status.mutedWorkflows || []).length;

            let mutedList = "None";
            if (mutedCount > 0) {
                try {
                    const workflows = await n8nApi.getAllWorkflows();
                    const mutedNames = status.mutedWorkflows.map(id => {
                        const wf = workflows.find(w => String(w.id) === String(id));
                        return wf ? `🔇 ${escapeHtml(wf.name)}` : `🔇 ID: ${id}`;
                    });
                    mutedList = mutedNames.join("\n");
                } catch {
                    mutedList = status.mutedWorkflows.map(id => `🔇 ID: ${id}`).join("\n");
                }
            }

            await ctx.reply(
                [
                    `🔔 <b>Alert Configuration</b>`,
                    ``,
                    `├ Status: ${enabledText}`,
                    `├ Muted: ${mutedCount} workflow(s)`,
                    `└ Webhook: /internal/failure`,
                    ``,
                    mutedCount > 0 ? `<b>Muted Workflows:</b>\n${mutedList}` : ""
                ].filter(Boolean).join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /mute — Silence alerts for a workflow ──────────

    bot.command("mute", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            // Filter out already muted workflows
            const mutedIds = alertService.getMutedList();
            const unmuted = workflows.filter(wf => !mutedIds.includes(String(wf.id)));

            if (unmuted.length === 0) {
                return ctx.reply("🔇 All workflows are already muted.");
            }

            const items = unmuted.map(wf => ({
                label: `${statusEmoji(wf.active)} ${wf.name}`,
                callbackData: `alert_mute_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "mute_pg");

            await ctx.reply(
                `🔇 <b>Mute Workflow Alerts</b>${pageInfo}\n\nSelect workflow to mute:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^mute_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const mutedIds = alertService.getMutedList();
            const unmuted = workflows.filter(wf => !mutedIds.includes(String(wf.id)));
            const items = unmuted.map(wf => ({
                label: `${statusEmoji(wf.active)} ${wf.name}`,
                callbackData: `alert_mute_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "mute_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🔇 <b>Mute Workflow Alerts</b>${pageInfo}\n\nSelect workflow to mute:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("mute_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^alert_mute_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            alertService.mute(id);

            let name = id;
            try {
                const wf = await n8nApi.getWorkflow(id);
                name = wf.name;
            } catch { }

            await ctx.answerCbQuery("Muted!");
            await ctx.reply(
                `🔇 <b>${escapeHtml(name)}</b> alerts muted.\n└ Use /unmute to re-enable.`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /unmute — Re-enable alerts for a workflow ──────

    bot.command("unmute", async (ctx) => {
        try {
            const mutedIds = alertService.getMutedList();

            if (mutedIds.length === 0) {
                return ctx.reply("🔊 No muted workflows.");
            }

            // Try to resolve names for muted IDs
            let workflows = [];
            try {
                workflows = await n8nApi.getAllWorkflows();
            } catch { }

            const items = mutedIds.map(id => {
                const wf = workflows.find(w => String(w.id) === String(id));
                const label = wf ? `🔇 ${wf.name}` : `🔇 ID: ${id}`;
                return { label, callbackData: `alert_unmute_${id}` };
            });
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "unmute_pg");

            await ctx.reply(
                `🔊 <b>Unmute Workflow Alerts</b>${pageInfo}\n\nSelect workflow to unmute:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^unmute_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const mutedIds = alertService.getMutedList();
            let workflows = [];
            try { workflows = await n8nApi.getAllWorkflows(); } catch { }
            const items = mutedIds.map(id => {
                const wf = workflows.find(w => String(w.id) === String(id));
                const label = wf ? `🔇 ${wf.name}` : `🔇 ID: ${id}`;
                return { label, callbackData: `alert_unmute_${id}` };
            });
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "unmute_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🔊 <b>Unmute Workflow Alerts</b>${pageInfo}\n\nSelect workflow to unmute:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("unmute_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^alert_unmute_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            alertService.unmute(id);

            let name = id;
            try {
                const wf = await n8nApi.getWorkflow(id);
                name = wf.name;
            } catch { }

            await ctx.answerCbQuery("Unmuted!");
            await ctx.reply(
                `🔊 <b>${escapeHtml(name)}</b> alerts re-enabled.`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

};
