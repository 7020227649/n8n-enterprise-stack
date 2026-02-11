const n8nApi = require("../services/n8nApi");
const { escapeHtml, statusEmoji, formatWorkflowCard } = require("../utils/format");
const { buildPagedKeyboard } = require("../utils/pagination");
const { Markup } = require("telegraf");

// ─── Helper: build workflow items for pagination ────

function workflowItems(workflows, prefix, emojiOverride) {
    return workflows.map(wf => ({
        label: `${emojiOverride || statusEmoji(wf.active)} ${wf.name}`,
        callbackData: `${prefix}_${wf.id}`
    }));
}

// ─── Handler: List Workflows ────────────────────────

async function listWorkflows(ctx) {
    try {
        const workflows = await n8nApi.getAllWorkflows();

        if (!workflows || workflows.length === 0) {
            return ctx.reply("📭 No workflows found.");
        }

        const items = workflowItems(workflows, "wf_detail");
        const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "wflist_pg");

        await ctx.reply(
            `📋 <b>Workflows</b> (${workflows.length} total)${pageInfo}\n\nTap to see details:`,
            { parse_mode: "HTML", ...keyboard }
        );
    } catch (err) {
        console.error("Error in listWorkflows:", err);
        await ctx.reply(`❌ Error fetching workflows: ${err.message}`);
    }
}

// ─── Module Initialization ──────────────────────────

module.exports = (bot) => {

    // ─── /workflows — Interactive workflow list ─────────
    bot.command("workflows", listWorkflows);

    // Page navigation for /workflows
    bot.action(/^wflist_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflowItems(workflows, "wf_detail");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "wflist_pg");

            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📋 <b>Workflows</b> (${workflows.length} total)${pageInfo}\n\nTap to see details:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            console.error(err);
            await ctx.answerCbQuery("Error");
        }
    });
    bot.action("wflist_pg_noop", (ctx) => ctx.answerCbQuery());

    // Callback: Show workflow detail card
    bot.action(/^wf_detail_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            const wf = await n8nApi.getWorkflow(id);
            await ctx.answerCbQuery();
            await ctx.reply(formatWorkflowCard(wf), { parse_mode: "HTML" });
        } catch (err) {
            console.error(err);
            await ctx.answerCbQuery("Error loading workflow");
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /workflow_status — Status + last execution ─────

    bot.command("workflow_status", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflowItems(workflows, "wf_status");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "wfstat_pg");

            await ctx.reply(
                `📊 <b>Workflow Status</b>${pageInfo}\n\nTap to see status & last execution:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^wfstat_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflowItems(workflows, "wf_status");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "wfstat_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📊 <b>Workflow Status</b>${pageInfo}\n\nTap to see status & last execution:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("wfstat_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^wf_status_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            const wf = await n8nApi.getWorkflow(id);
            const execData = await n8nApi.getExecutions({ workflowId: id, limit: 1 });
            const lastExec = execData.data?.[0];

            let msg = formatWorkflowCard(wf);

            if (lastExec) {
                const status = lastExec.status || (lastExec.finished ? "success" : "error");
                const time = lastExec.startedAt ? new Date(lastExec.startedAt).toLocaleString() : "N/A";
                msg += `\n\n<b>Last Execution:</b>\n├ Status: ${status}\n└ Time: ${time}`;
            } else {
                msg += "\n\n<b>Last Execution:</b> None";
            }

            await ctx.answerCbQuery();
            await ctx.reply(msg, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /run — Trigger a workflow ──────────────────────

    bot.command("run", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflowItems(workflows, "wf_run", "▶️");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "wfrun_pg");

            await ctx.reply(
                `🚀 <b>Run Workflow</b>${pageInfo}\n\nTap to trigger:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^wfrun_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflowItems(workflows, "wf_run", "▶️");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "wfrun_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🚀 <b>Run Workflow</b>${pageInfo}\n\nTap to trigger:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("wfrun_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^wf_run_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery("Running...");
            await ctx.reply("⏳ Triggering workflow...");

            const result = await n8nApi.executeWorkflow(id);
            await ctx.reply(
                `✅ <b>Workflow executed</b>\n├ Execution ID: <code>${escapeHtml(String(result?.id || "N/A"))}</code>\n└ Status: Started`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Execution failed: ${err.message}`);
        }
    });

    // ─── /enable — Activate a workflow ──────────────────

    bot.command("enable", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            const inactive = workflows.filter(wf => !wf.active);

            if (inactive.length === 0) {
                return ctx.reply("✅ All workflows are already active.");
            }

            const items = workflowItems(inactive, "wf_enable", "🔴");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "wfen_pg");

            await ctx.reply(
                `⚡ <b>Enable Workflow</b>${pageInfo}\n\nTap to activate:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^wfen_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const inactive = workflows.filter(wf => !wf.active);
            const items = workflowItems(inactive, "wf_enable", "🔴");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "wfen_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `⚡ <b>Enable Workflow</b>${pageInfo}\n\nTap to activate:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("wfen_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^wf_enable_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await n8nApi.activateWorkflow(id);
            await ctx.answerCbQuery("Activated!");
            await ctx.reply(`✅ Workflow <b>activated</b> successfully.`, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Failed to activate: ${err.message}`);
        }
    });

    // ─── /disable — Deactivate a workflow ───────────────

    bot.command("disable", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            const active = workflows.filter(wf => wf.active);

            if (active.length === 0) {
                return ctx.reply("⏸ No active workflows to disable.");
            }

            const items = workflowItems(active, "wf_disable", "🟢");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "wfdis_pg");

            await ctx.reply(
                `⏸ <b>Disable Workflow</b>${pageInfo}\n\nTap to deactivate:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^wfdis_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const active = workflows.filter(wf => wf.active);
            const items = workflowItems(active, "wf_disable", "🟢");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "wfdis_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `⏸ <b>Disable Workflow</b>${pageInfo}\n\nTap to deactivate:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("wfdis_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^wf_disable_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await n8nApi.deactivateWorkflow(id);
            await ctx.answerCbQuery("Deactivated!");
            await ctx.reply(`⏸ Workflow <b>deactivated</b> successfully.`, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Failed to deactivate: ${err.message}`);
        }
    });

    // ─── /delete — Remove workflow with confirmation ────

    bot.command("delete", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflowItems(workflows, "wf_delask", "🗑");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "wfdel_pg");

            await ctx.reply(
                `🗑 <b>Delete Workflow</b>${pageInfo}\n\n⚠️ Select workflow to delete:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^wfdel_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflowItems(workflows, "wf_delask", "🗑");
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "wfdel_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🗑 <b>Delete Workflow</b>${pageInfo}\n\n⚠️ Select workflow to delete:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("wfdel_pg_noop", (ctx) => ctx.answerCbQuery());

    // Step 1: Confirm deletion
    bot.action(/^wf_delask_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            const wf = await n8nApi.getWorkflow(id);
            await ctx.answerCbQuery();

            await ctx.reply(
                `⚠️ <b>Are you sure you want to delete:</b>\n\n<b>${escapeHtml(wf.name)}</b> (ID: <code>${escapeHtml(id)}</code>)\n\n<i>This action cannot be undone.</i>`,
                {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback("✅ Yes, Delete", `wf_delconfirm_${id}`),
                            Markup.button.callback("❌ Cancel", "wf_delcancel")
                        ]
                    ])
                }
            );
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // Step 2: Execute deletion
    bot.action(/^wf_delconfirm_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await n8nApi.deleteWorkflow(id);
            await ctx.answerCbQuery("Deleted!");
            await ctx.editMessageText(`🗑 Workflow <b>deleted</b> successfully.`, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.answerCbQuery("Error");
            await ctx.reply(`❌ Failed to delete: ${err.message}`);
        }
    });

    bot.action("wf_delcancel", async (ctx) => {
        await ctx.answerCbQuery("Cancelled");
        await ctx.editMessageText("❌ Deletion cancelled.");
    });
};

module.exports.listWorkflows = listWorkflows;
