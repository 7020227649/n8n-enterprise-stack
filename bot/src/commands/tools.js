
const n8nApi = require("../services/n8nApi");
const { escapeHtml, statusEmoji } = require("../utils/format");
const { buildPagedKeyboard } = require("../utils/pagination");
const { Markup } = require("telegraf");

module.exports = (bot) => {

    // ─── /search — Search workflows by name ────────────

    bot.command("search", async (ctx) => {
        try {
            const query = ctx.message.text.replace(/^\/search\s*/i, "").trim();

            if (!query) {
                return ctx.reply("🔍 Usage: <code>/search keyword</code>\n\nExample: /search invoice", { parse_mode: "HTML" });
            }

            const workflows = await n8nApi.getAllWorkflows();
            const matches = workflows.filter(wf =>
                wf.name.toLowerCase().includes(query.toLowerCase())
            );

            if (matches.length === 0) {
                return ctx.reply(`🔍 No workflows matching "<b>${escapeHtml(query)}</b>"`, { parse_mode: "HTML" });
            }

            const items = matches.map(wf => ({
                label: `${statusEmoji(wf.active)} ${wf.name}`,
                callbackData: `wf_detail_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "srch_pg");

            await ctx.reply(
                `🔍 <b>Search: "${escapeHtml(query)}"</b> — ${matches.length} result(s)${pageInfo}`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^srch_pg_(\d+)$/, async (ctx) => {
        try {
            // We can't re-fetch the original query, so just acknowledge
            await ctx.answerCbQuery("Use /search again for new results");
        } catch { }
    });
    bot.action("srch_pg_noop", (ctx) => ctx.answerCbQuery());

    // ─── /clone — Duplicate a workflow ─────────────────

    bot.command("clone", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflows.map(wf => ({
                label: `📋 ${wf.name}`,
                callbackData: `tool_clone_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "clone_pg");

            await ctx.reply(
                `📋 <b>Clone Workflow</b>${pageInfo}\n\nSelect workflow to duplicate:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^clone_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflows.map(wf => ({
                label: `📋 ${wf.name}`,
                callbackData: `tool_clone_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "clone_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📋 <b>Clone Workflow</b>${pageInfo}\n\nSelect workflow to duplicate:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("clone_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^tool_clone_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery("Cloning...");

            const wf = await n8nApi.getWorkflow(id);

            const cloneData = {
                name: `${wf.name} (Copy)`,
                nodes: wf.nodes,
                connections: wf.connections,
                settings: wf.settings || {},
            };

            const newWf = await n8nApi.createWorkflow(cloneData);

            await ctx.reply(
                [
                    `✅ <b>Workflow Cloned!</b>`,
                    ``,
                    `├ Original: ${escapeHtml(wf.name)}`,
                    `├ Clone: ${escapeHtml(cloneData.name)}`,
                    `├ New ID: <code>${newWf.id || "N/A"}</code>`,
                    `└ Status: 🔴 Inactive (activate with /enable)`,
                ].join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Clone failed: ${err.message}`);
        }
    });

    // ─── /export — Export workflow as JSON ──────────────

    bot.command("export", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflows.map(wf => ({
                label: `📄 ${wf.name}`,
                callbackData: `tool_export_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "exp_pg");

            await ctx.reply(
                `📄 <b>Export Workflow (JSON)</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^exp_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflows.map(wf => ({
                label: `📄 ${wf.name}`,
                callbackData: `tool_export_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "exp_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `📄 <b>Export Workflow (JSON)</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("exp_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^tool_export_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery("Exporting...");

            const wf = await n8nApi.getWorkflow(id);
            const json = JSON.stringify(wf, null, 2);
            const buffer = Buffer.from(json, "utf-8");
            const safeName = wf.name.replace(/[^a-zA-Z0-9_-]/g, "_");

            await ctx.replyWithDocument({
                source: buffer,
                filename: `${safeName}.json`,
            });
        } catch (err) {
            await ctx.reply(`❌ Export failed: ${err.message}`);
        }
    });

    // ─── /nodes — Show workflow node breakdown ─────────

    bot.command("nodes", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            if (!workflows || workflows.length === 0) {
                return ctx.reply("📭 No workflows found.");
            }

            const items = workflows.map(wf => ({
                label: `🔧 ${wf.name} (${(wf.nodes || []).length} nodes)`,
                callbackData: `tool_nodes_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "nodes_pg");

            await ctx.reply(
                `🔧 <b>Workflow Nodes</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^nodes_pg_(\d+)$/, async (ctx) => {
        try {
            const page = parseInt(ctx.match[1], 10);
            const workflows = await n8nApi.getAllWorkflows();
            const items = workflows.map(wf => ({
                label: `🔧 ${wf.name} (${(wf.nodes || []).length} nodes)`,
                callbackData: `tool_nodes_${wf.id}`
            }));
            const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "nodes_pg");
            await ctx.answerCbQuery();
            await ctx.editMessageText(
                `🔧 <b>Workflow Nodes</b>${pageInfo}\n\nSelect workflow:`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) { await ctx.answerCbQuery("Error"); }
    });
    bot.action("nodes_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^tool_nodes_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery();

            const wf = await n8nApi.getWorkflow(id);
            const nodes = wf.nodes || [];

            if (nodes.length === 0) {
                return ctx.reply(`🔧 <b>${escapeHtml(wf.name)}</b>\n\n└ No nodes found.`, { parse_mode: "HTML" });
            }

            // Group nodes by type
            const typeCount = {};
            nodes.forEach(n => {
                const type = n.type || "Unknown";
                const shortType = type.split(".").pop();
                typeCount[shortType] = (typeCount[shortType] || 0) + 1;
            });

            const nodeList = nodes.map((n, i) => {
                const type = (n.type || "Unknown").split(".").pop();
                return `  ${i + 1}. <b>${escapeHtml(n.name || "Unnamed")}</b> (${escapeHtml(type)})`;
            }).join("\n");

            const typeSummary = Object.entries(typeCount)
                .sort((a, b) => b[1] - a[1])
                .map(([t, c]) => `  • ${escapeHtml(t)}: ${c}`)
                .join("\n");

            await ctx.reply(
                [
                    `🔧 <b>${escapeHtml(wf.name)}</b>`,
                    `├ Total Nodes: <b>${nodes.length}</b>`,
                    `└ Connections: <b>${Object.keys(wf.connections || {}).length}</b>`,
                    ``,
                    `<b>Node Types:</b>`,
                    typeSummary,
                    ``,
                    `<b>All Nodes:</b>`,
                    nodeList
                ].join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /schedule — List scheduled workflows ──────────

    bot.command("schedule", async (ctx) => {
        try {
            const workflows = await n8nApi.getAllWorkflows();

            // Find workflows that have Schedule/Cron trigger nodes
            const scheduled = workflows.filter(wf => {
                return (wf.nodes || []).some(n => {
                    const type = (n.type || "").toLowerCase();
                    return (
                        type.includes("schedule") ||
                        type.includes("cron") ||
                        type.includes("interval")
                    );
                });
            });

            if (scheduled.length === 0) {
                return ctx.reply("⏰ No scheduled workflows found.");
            }

            const lines = scheduled.map(wf => {
                const triggerNode = wf.nodes.find(n => {
                    const t = (n.type || "").toLowerCase();
                    return t.includes("schedule") || t.includes("cron") || t.includes("interval");
                });

                const triggerType = triggerNode
                    ? (triggerNode.type || "").split(".").pop()
                    : "Unknown";

                const params = triggerNode?.parameters || {};
                let scheduleInfo = "";
                if (params.rule) scheduleInfo = `Cron: ${params.rule.expression || "custom"}`;
                else if (params.interval) scheduleInfo = `Every ${params.interval} ${params.unit || ""}`;
                else scheduleInfo = JSON.stringify(params).slice(0, 60);

                return [
                    `${statusEmoji(wf.active)} <b>${escapeHtml(wf.name)}</b>`,
                    `  ├ Trigger: ${escapeHtml(triggerType)}`,
                    `  └ ${escapeHtml(scheduleInfo) || "Schedule configured"}`,
                ].join("\n");
            });

            await ctx.reply(
                `⏰ <b>Scheduled Workflows</b> (${scheduled.length})\n\n${lines.join("\n\n")}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /stop — Stop a running execution ──────────────

    bot.command("stop", async (ctx) => {
        try {
            // Fetch running executions
            const execData = await n8nApi.getExecutions({ status: "running", limit: 20 });
            const running = execData.data || [];

            if (running.length === 0) {
                return ctx.reply("✅ No running executions to stop.");
            }

            const items = running.map(exec => {
                const name = exec.workflowData?.name || `Workflow ${exec.workflowId || "?"}`;
                return {
                    label: `⏳ ${name} (#${exec.id})`,
                    callbackData: `tool_stop_${exec.id}`
                };
            });

            const { keyboard } = buildPagedKeyboard(items, 0, "stop_pg");

            await ctx.reply(
                `🛑 <b>Stop Execution</b>\n\n${running.length} running execution(s):`,
                { parse_mode: "HTML", ...keyboard }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action(/^stop_pg_(\d+)$/, (ctx) => ctx.answerCbQuery());
    bot.action("stop_pg_noop", (ctx) => ctx.answerCbQuery());

    bot.action(/^tool_stop_(.+)$/, async (ctx) => {
        try {
            const id = ctx.match[1];
            await ctx.answerCbQuery("Stopping...");

            await n8nApi.stopExecution(id);

            await ctx.reply(
                `🛑 Execution <code>#${escapeHtml(id)}</code> stopped.`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Failed to stop: ${err.message}`);
        }
    });

    // ─── /credentials — List n8n credentials ───────────

    bot.command("credentials", async (ctx) => {
        try {
            const creds = await n8nApi.getCredentials();

            if (creds.length === 0) {
                return ctx.reply("🔐 No credentials configured.");
            }

            const lines = creds.map((c, i) => {
                const name = escapeHtml(c.name || "Unnamed");
                const type = escapeHtml(c.type || "Unknown");
                const created = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "N/A";
                return `  ${i + 1}. 🔑 <b>${name}</b>\n     ├ Type: ${type}\n     └ Created: ${created}`;
            });

            await ctx.reply(
                `🔐 <b>Credentials</b> (${creds.length})\n\n${lines.join("\n\n")}\n\n<i>Names shown only — secrets are never exposed.</i>`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

};
