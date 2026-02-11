
const n8nApi = require("../services/n8nApi");
const { escapeHtml, statusEmoji, executionStatusEmoji } = require("../utils/format");
const { buildPagedKeyboard } = require("../utils/pagination");
const { Markup } = require("telegraf");

module.exports = (bot) => {

    // ─── /retry — Retry a failed execution ─────────────

    bot.command("retry", async (ctx) => {
        try {
            const execData = await n8nApi.getExecutions({ status: "error", limit: 15 });
            const failed = (execData.data || []).filter(e => e.status === "error" || e.finished === false);

            if (failed.length === 0) {
                return ctx.reply("✅ No failed executions to retry.");
            }

            const items = failed.map(exec => {
                const name = exec.workflowData?.name || `Workflow ${exec.workflowId || "?"}`;
                const time = exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "?";
                return {
                    label: `❌ ${name} (${time})`,
                    callbackData: `ops_retry_${exec.id}`
                };
            });

            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "retry_pg");

            await ctx.reply(
                `🔄 <b>Retry Failed Execution</b>${pageInfo}\n\nSelect execution to retry:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^retry_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const execData = await n8nApi.getExecutions({ status: "error", limit: 15 });
            const failed = (execData.data || []).filter(e => e.status === "error" || e.finished === false);
            const items = failed.map(exec => ({
                label: `❌ ${exec.workflowData?.name || "?"} (${exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "?"})`,
                callbackData: `ops_retry_${exec.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "retry_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🔄 <b>Retry Failed Execution</b>${pageInfo}\n\nSelect execution to retry:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch { await ctx.answerCbQuery("Error"); }
    });
    bot.action("retry_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^ops_retry_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery("Retrying...");

            const result = await n8nApi.retryExecution(id);

            await ctx.reply(
                `✅ <b>Execution #${escapeHtml(id)} retried!</b>\n\n└ New execution started.`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Retry failed: ${err.message}\n\n<i>Tip: Only recent failed executions with saved data can be retried.</i>`, { parse_mode: "HTML" });
        }
    });

    // ─── /execution — View execution details ───────────

    bot.command("execution", async (ctx) => {
        try {
            const execId = ctx.message.text.replace(/^\/execution\s*/i, "").trim();

            if (!execId) {
                // Show recent executions to pick from
                const execData = await n8nApi.getExecutions({ limit: 10 });
                const execs = execData.data || [];

                if (execs.length === 0) return ctx.reply("📭 No executions found.");

                const items = execs.map(exec => {
                    const name = exec.workflowData?.name || `WF ${exec.workflowId || "?"}`;
                    const emoji = executionStatusEmoji(exec.status);
                    return {
                        label: `${emoji} ${name} (#${exec.id})`,
                        callbackData: `ops_execdetail_${exec.id}`
                    };
                });

                const { keyboard } = buildPagedKeyboard(items, 0, "execd_pg");
                return ctx.reply(
                    `📋 <b>Execution Details</b>\n\nSelect or use: <code>/execution ID</code>`,
                    { parse_mode: "HTML", ...keyboard }
                );
            }

            await sendExecutionDetail(ctx, execId);
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^execd_pg_(\d+)$/, (ctx) => ctx.answerCbQuery());
    bot.action("execd_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^ops_execdetail_(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            await sendExecutionDetail(ctx, ctx.match[1]);
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    async function sendExecutionDetail(ctx, id) {
        const exec = await n8nApi.getExecution(id);

        const emoji = executionStatusEmoji(exec.status);
        const wfName = exec.workflowData?.name || "Unknown";
        const startedAt = exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "N/A";
        const stoppedAt = exec.stoppedAt ? new Date(exec.stoppedAt).toLocaleString() : "N/A";

        let duration = "N/A";
        if (exec.startedAt && exec.stoppedAt) {
            const ms = new Date(exec.stoppedAt) - new Date(exec.startedAt);
            duration = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
        }

        // Extract error message
        let errorMsg = "None";
        if (exec.data?.resultData?.error) {
            const e = exec.data.resultData.error;
            errorMsg = e.message || e.description || JSON.stringify(e).slice(0, 300);
        } else if (exec.status === "error") {
            errorMsg = "Error details not available";
        }

        // Count nodes executed
        const nodesExecuted = exec.data?.resultData?.runData
            ? Object.keys(exec.data.resultData.runData).length
            : "N/A";

        const lines = [
            `${emoji} <b>Execution #${escapeHtml(String(id))}</b>`,
            ``,
            `├ Workflow: <b>${escapeHtml(wfName)}</b>`,
            `├ Status: <b>${exec.status || "unknown"}</b>`,
            `├ Started: ${startedAt}`,
            `├ Stopped: ${stoppedAt}`,
            `├ Duration: <b>${duration}</b>`,
            `├ Nodes ran: <b>${nodesExecuted}</b>`,
            `├ Mode: ${exec.mode || "N/A"}`,
        ];

        if (exec.status === "error") {
            lines.push(`└ ❌ <b>Error:</b>`);
            lines.push(`<pre>${escapeHtml(errorMsg.slice(0, 500))}</pre>`);
        } else {
            lines.push(`└ Retries: ${exec.retryOf || "none"}`);
        }

        await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    }

    // ─── /active — List only active workflows ──────────

    bot.command("active", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            const active = workflows.filter(wf => wf.active);

            if (active.length === 0) {
                return ctx.reply("🔴 No active workflows.");
            }

            const list = active.map((wf, i) =>
                `  ${i + 1}. 🟢 <b>${escapeHtml(wf.name)}</b> (<code>${wf.id}</code>)`
            ).join("\n");

            await ctx.reply(
                `🟢 <b>Active Workflows</b> (${active.length}/${workflows.length})\n\n${list}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /inactive — List only inactive workflows ──────

    bot.command("inactive", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            const inactive = workflows.filter(wf => !wf.active);

            if (inactive.length === 0) {
                return ctx.reply("✅ All workflows are active!");
            }

            const list = inactive.map((wf, i) =>
                `  ${i + 1}. 🔴 <b>${escapeHtml(wf.name)}</b> (<code>${wf.id}</code>)`
            ).join("\n");

            await ctx.reply(
                `🔴 <b>Inactive Workflows</b> (${inactive.length}/${workflows.length})\n\n${list}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /rename — Rename a workflow ───────────────────

    bot.command("rename", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            if (!workflows.length) return ctx.reply("📭 No workflows found.");

            const items = workflows.map(wf => ({
                label: `✏️ ${wf.name}`,
                callbackData: `ops_rename_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "ren_pg");

            await ctx.reply(
                `✏️ <b>Rename Workflow</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^ren_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflows.map(wf => ({
                label: `✏️ ${wf.name}`,
                callbackData: `ops_rename_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "ren_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `✏️ <b>Rename Workflow</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch { await ctx.answerCbQuery("Error"); }
    });
    bot.action("ren_pg_noop", (ctx) => ctx.answerCbQuery());

    // Store pending renames
    const pendingRenames = new Map();

    bot.action(/^ops_rename_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            const wf = await n8nApi.getWorkflow(id);
            await ctx.answerCbQuery();

            pendingRenames.set(String(ctx.from.id), { workflowId: id, oldName: wf.name });

            await ctx.reply(
                `✏️ Current name: <b>${escapeHtml(wf.name)}</b>\n\n📝 Send the new name:`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // Listen for text messages (rename handler)
    bot.on("text", async (ctx, next) => {
        const userId = String(ctx.from?.id);
        const pending = pendingRenames.get(userId);

        if (!pending) return next();

        const newName = ctx.message.text.trim();
        if (!newName || newName.startsWith("/")) {
            pendingRenames.delete(userId);
            return next();
        }

        try {
            pendingRenames.delete(userId);
            await n8nApi.updateWorkflow(pending.workflowId, { name: newName });

            await ctx.reply(
                [
                    `✅ <b>Workflow Renamed!</b>`,
                    ``,
                    `├ Before: ${escapeHtml(pending.oldName)}`,
                    `└ After: <b>${escapeHtml(newName)}</b>`,
                ].join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Rename failed: ${err.message}`);
        }
    });

    // ─── /webhook_url — Show webhook URLs ──────────────

    bot.command("webhook_url", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            if (!workflows.length) return ctx.reply("📭 No workflows found.");

            const items = workflows.map(wf => ({
                label: `🔗 ${wf.name}`,
                callbackData: `ops_webhook_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "whurl_pg");

            await ctx.reply(
                `🔗 <b>Webhook URLs</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^whurl_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflows.map(wf => ({
                label: `🔗 ${wf.name}`,
                callbackData: `ops_webhook_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "whurl_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🔗 <b>Webhook URLs</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch { await ctx.answerCbQuery("Error"); }
    });
    bot.action("whurl_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^ops_webhook_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery();

            const wf = await n8nApi.getWorkflow(id);
            const nodes = wf.nodes || [];

            const webhookNodes = nodes.filter(n => {
                const type = (n.type || "").toLowerCase();
                return type.includes("webhook");
            });

            if (webhookNodes.length === 0) {
                return ctx.reply(
                    `🔗 <b>${escapeHtml(wf.name)}</b>\n\n└ No webhook nodes found in this workflow.`,
                    { parse_mode: "HTML" }
                );
            }

            const baseUrl = process.env.N8N_BASE_URL || process.env.WEBHOOK_URL || "https://your-domain.com";

            const lines = webhookNodes.map((n, i) => {
                const path = n.parameters?.path || n.parameters?.webhookId || "unknown";
                const method = (n.parameters?.httpMethod || "GET").toUpperCase();
                const prodUrl = `${baseUrl}/webhook/${path}`;
                const testUrl = `${baseUrl}/webhook-test/${path}`;

                return [
                    `  ${i + 1}. <b>${escapeHtml(n.name || "Webhook")}</b>`,
                    `     ├ Method: ${method}`,
                    `     ├ Production: <code>${escapeHtml(prodUrl)}</code>`,
                    `     └ Test: <code>${escapeHtml(testUrl)}</code>`,
                ].join("\n");
            });

            await ctx.reply(
                `🔗 <b>${escapeHtml(wf.name)}</b>\n\n${lines.join("\n\n")}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /enable_all — Bulk enable all workflows ───────

    bot.command("enable_all", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            const inactive = workflows.filter(wf => !wf.active);

            if (inactive.length === 0) {
                return ctx.reply("✅ All workflows are already active!");
            }

            await ctx.reply(
                `⚡ <b>Enable All Workflows?</b>\n\n${inactive.length} inactive workflow(s) will be activated.`,
                {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(`✅ Enable ${inactive.length}`, "ops_enable_all_yes"),
                            Markup.button.callback("❌ Cancel", "ops_enable_all_no"),
                        ],
                    ]),
                }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action("ops_enable_all_yes", async (ctx) => {
        try {
            await ctx.answerCbQuery("Enabling...");
            await ctx.editMessageText("⏳ Enabling all workflows...");

            const workflows = await n8nApi.getAllWorkflows();
            const inactive = workflows.filter(wf => !wf.active);
            let success = 0, failed = 0;

            for (const wf of inactive) {
                try {
                    await n8nApi.activateWorkflow(wf.id);
                    success++;
                } catch {
                    failed++;
                }
            }

            await ctx.reply(
                `✅ <b>Bulk Enable Complete</b>\n\n├ Enabled: <b>${success}</b>\n└ Failed: <b>${failed}</b>`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action("ops_enable_all_no", async (ctx) => {
        await ctx.answerCbQuery("Cancelled");
        await ctx.editMessageText("❌ Bulk enable cancelled.");
    });

    // ─── /disable_all — Bulk disable all workflows ─────

    bot.command("disable_all", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();
            const active = workflows.filter(wf => wf.active);

            if (active.length === 0) {
                return ctx.reply("🔴 All workflows are already inactive.");
            }

            await ctx.reply(
                `⚠️ <b>Disable ALL Workflows?</b>\n\n${active.length} active workflow(s) will be deactivated.\n\n<i>⚠️ This will stop all automations!</i>`,
                {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(`🔴 Disable ${active.length}`, "ops_disable_all_yes"),
                            Markup.button.callback("❌ Cancel", "ops_disable_all_no"),
                        ],
                    ]),
                }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action("ops_disable_all_yes", async (ctx) => {
        try {
            await ctx.answerCbQuery("Disabling...");
            await ctx.editMessageText("⏳ Disabling all workflows...");

            const workflows = await n8nApi.getAllWorkflows();
            const active = workflows.filter(wf => wf.active);
            let success = 0, failed = 0;

            for (const wf of active) {
                try {
                    await n8nApi.deactivateWorkflow(wf.id);
                    success++;
                } catch {
                    failed++;
                }
            }

            await ctx.reply(
                `🔴 <b>Bulk Disable Complete</b>\n\n├ Disabled: <b>${success}</b>\n└ Failed: <b>${failed}</b>`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action("ops_disable_all_no", async (ctx) => {
        await ctx.answerCbQuery("Cancelled");
        await ctx.editMessageText("❌ Bulk disable cancelled.");
    });

};
