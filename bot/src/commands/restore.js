
const restoreService = require("../services/restoreService");
const { escapeHtml } = require("../utils/format");
const { Markup } = require("telegraf");

// In-memory session for pending restores (keyed by chat ID)
const pendingRestores = new Map();

module.exports = (bot) => {


    // ─── /restore_workflow — Prompt user to send file ───

    bot.command("restore_workflow", async (ctx) => {
        pendingRestores.set(ctx.chat.id, { type: "workflow", state: "awaiting_file", workflows: [] });

        await ctx.reply(
            [
                "♻️ <b>Restore Workflow</b>",
                "",
                "Send me a <b>.json</b> or <b>.zip</b> file containing workflow data.",
                "",
                "Rules:",
                "├ Always creates a <b>NEW COPY</b>",
                "├ Imported as <b>INACTIVE</b>",
                "└ Original workflows are <b>never overwritten</b>",
                "",
                "<i>Waiting for file...</i>"
            ].join("\n"),
            { parse_mode: "HTML" }
        );
    });

    // ─── /restore_system — Full system restore ──────────

    bot.command("restore_system", async (ctx) => {
        // Only admin
        if (ctx.from.id.toString() !== config.adminId) {
            return ctx.reply("⛔ Admin only.");
        }

        pendingRestores.set(ctx.chat.id, { type: "system", state: "awaiting_files", files: [] });

        await ctx.reply(
            [
                "⚠️ <b>System Restore Mode</b>",
                "",
                "Send me the backup file(s) (e.g. <code>.tar.gz</code> or <code>.part1</code>).",
                "",
                "👉 <b>Instructions:</b>",
                "1. Send files one by one (order doesn't matter).",
                "2. When finished sending ALL parts, click <b>Start Restore</b> below.",
                "",
                "🛑 <b>WARNING:</b> This will OVERWRITE all data and restart the system.",
            ].join("\n"),
            {
                parse_mode: "HTML",
                ...Markup.keyboard([["✅ Start Restore"], ["❌ Cancel"]]).resize()
            }
        );
    });

    // ─── File handler — catch uploaded documents ────────

    bot.on("document", async (ctx, next) => {
        const session = pendingRestores.get(ctx.chat.id);
        if (!session) return next();

        const doc = ctx.message.document;
        const filename = doc.file_name || "upload";

        // ─── WORKFLOW RESTORE (Single JSON/ZIP) ───
        if (session.type === "workflow") {
            if (session.state !== "awaiting_file") return;

            if (!filename.endsWith(".json") && !filename.endsWith(".zip")) {
                return ctx.reply("⚠️ Please send a <b>.json</b> or <b>.zip</b> file.", { parse_mode: "HTML" });
            }

            try {
                await ctx.reply("📥 Downloading file...");

                // Download from Telegram
                const fileLink = await ctx.telegram.getFileLink(doc.file_id);
                const axios = require("axios");
                const response = await axios.get(fileLink.href, { responseType: "arraybuffer" });
                const buffer = Buffer.from(response.data);

                // Save to disk
                restoreService.saveUploadedFile(buffer, filename);

                // Parse workflows
                const workflows = await restoreService.parseWorkflowFile(buffer, filename);

                if (workflows.length === 0) {
                    pendingRestores.delete(ctx.chat.id);
                    return ctx.reply("⚠️ No workflow data found in the file.");
                }

                // Store parsed workflows in session
                session.state = "preview";
                session.workflows = workflows;
                pendingRestores.set(ctx.chat.id, session);

                // Show preview for each workflow
                for (let i = 0; i < workflows.length; i++) {
                    const preview = restoreService.previewWorkflow(workflows[i]);
                    const num = workflows.length > 1 ? ` (${i + 1}/${workflows.length})` : "";
                    await ctx.reply(preview + num, { parse_mode: "HTML" });
                }

                // Show confirm/cancel buttons
                await ctx.reply(
                    `🔄 <b>Import ${workflows.length} workflow(s)?</b>`,
                    {
                        parse_mode: "HTML",
                        ...Markup.inlineKeyboard([
                            [
                                Markup.button.callback("✅ CONFIRM Import", "restore_confirm"),
                                Markup.button.callback("❌ Cancel", "restore_cancel")
                            ]
                        ])
                    }
                );
            } catch (err) {
                pendingRestores.delete(ctx.chat.id);
                await ctx.reply(`❌ Parse error: ${err.message}`);
            }
            return;
        }

        // ─── SYSTEM RESTORE (Multi-part) ───
        if (session.type === "system") {
            if (session.state !== "awaiting_files") return;

            try {
                await ctx.reply(`📥 Receiving <code>${escapeHtml(filename)}</code>...`, { parse_mode: "HTML" });

                const fileLink = await ctx.telegram.getFileLink(doc.file_id);
                const axios = require("axios");
                const response = await axios.get(fileLink.href, { responseType: "arraybuffer" });
                const buffer = Buffer.from(response.data);

                // Save to temp file
                const filePath = restoreService.saveUploadedFile(buffer, filename);
                session.files.push({ path: filePath, name: filename });
                pendingRestores.set(ctx.chat.id, session);

                await ctx.reply(
                    `✅ Received <b>${session.files.length}</b> file(s).\nSend more or click <b>Start Restore</b>.`,
                    { parse_mode: "HTML" }
                );

            } catch (err) {
                await ctx.reply(`❌ Upload failed: ${err.message}`);
            }
        }
    });

    // ─── CONFIRM — Execute the restore ──────────────────

    // Handle "Start Restore" button click (Text message)
    bot.hears("✅ Start Restore", async (ctx) => {
        const session = pendingRestores.get(ctx.chat.id);
        if (!session || session.type !== "system") return;

        if (session.files.length === 0) {
            return ctx.reply("⚠️ No files received yet.");
        }

        // Confirm
        await ctx.reply(
            `⚠️ <b>FINAL WARNING</b>\n\nRestoring system from ${session.files.length} parts.\nThis will STOP n8n, OVERWRITE data, and RESTART.\n\nAre you sure?`,
            {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([
                    [Markup.button.callback("🚀 YES, DO IT", "sys_restore_go")],
                    [Markup.button.callback("❌ Cancel", "restore_cancel")]
                ])
            }
        );
    });

    // Handle "Cancel" button click (Text message)
    bot.hears("❌ Cancel", async (ctx) => {
        const session = pendingRestores.get(ctx.chat.id);
        if (session) {
            pendingRestores.delete(ctx.chat.id);
            await ctx.reply("❌ Restore cancelled.", Markup.removeKeyboard());
        }
    });

    // Action: System Restore Execute
    bot.action("sys_restore_go", async (ctx) => {
        const session = pendingRestores.get(ctx.chat.id);
        if (!session || session.type !== "system") return;

        try {
            await ctx.answerCbQuery("Starting Restore...");
            await ctx.editMessageText("⏳ <b>System Restore in Progress...</b>\n\n1. Examining files...\n2. Stopping services...\n3. Restoring volumes...\n\n<i>This may take a minute. Bot might simulate a restart.</i>", { parse_mode: "HTML" });

            // Sort files by name to ensure order (part1, part2...)
            session.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            const filePaths = session.files.map(f => f.path);

            const systemService = require("../services/systemService");
            await systemService.restoreSystem(filePaths);

            await ctx.reply(
                `✅ <b>System Restore SUCCESS!</b>\n\nSystem restarted. Check /health to confirm status.`,
                { parse_mode: "HTML", ...Markup.removeKeyboard() }
            );
            pendingRestores.delete(ctx.chat.id);

        } catch (err) {
            await ctx.reply(`❌ System Restore FAILED: ${err.message}\n\nCheck logs with /logs.`, Markup.removeKeyboard());
            pendingRestores.delete(ctx.chat.id);
        }
    });

    bot.action("restore_confirm", async (ctx) => {
        const session = pendingRestores.get(ctx.chat.id);

        if (!session || session.type !== "workflow" || session.state !== "preview" || !session.workflows.length) {
            await ctx.answerCbQuery("No pending restore");
            return ctx.reply("⚠️ No pending restore. Use /restore_workflow first.");
        }

        await ctx.answerCbQuery("Importing...");
        await ctx.editMessageText("⏳ Importing workflows...");

        const results = [];
        for (const wf of session.workflows) {
            try {
                const result = await restoreService.importWorkflow(wf);
                results.push(`✅ <b>${escapeHtml(result.name || wf.name)}</b> → ID: <code>${result.id}</code>`);
            } catch (err) {
                results.push(`❌ <b>${escapeHtml(wf.name || "Unknown")}</b> → ${err.message}`);
            }
        }

        pendingRestores.delete(ctx.chat.id);

        await ctx.reply(
            [
                `♻️ <b>Restore Complete</b>`,
                ``,
                ...results,
                ``,
                `<i>All imported as inactive. Enable via /enable</i>`
            ].join("\n"),
            { parse_mode: "HTML" }
        );
    });

    // ─── Cancel restore ─────────────────────────────────

    bot.action("restore_cancel", async (ctx) => {
        pendingRestores.delete(ctx.chat.id);
        await ctx.answerCbQuery("Cancelled");
        await ctx.editMessageText("❌ Restore cancelled.");
        // If system restore, remove keyboard
        await ctx.reply("Cancelled.", Markup.removeKeyboard());
    });

    // ─── /restore_status — Show recent restore history ──

    bot.command("restore_status", async (ctx) => {
        try {
            const history = restoreService.getRestoreHistory(5);

            if (history.length === 0) {
                return ctx.reply("📭 No restore operations yet.");
            }

            const lines = history.map((entry, i) => {
                const time = new Date(entry.restoredAt).toLocaleString();
                return [
                    `${i + 1}. <b>${escapeHtml(entry.workflowName)}</b>`,
                    `   ├ New ID: <code>${entry.newId}</code>`,
                    `   ├ Status: ${entry.status === "success" ? "✅" : "❌"} ${entry.status}`,
                    `   └ Time: ${time}`
                ].join("\n");
            });

            await ctx.reply(
                `♻️ <b>Restore History</b> (last ${history.length})\n\n${lines.join("\n\n")}`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

};
