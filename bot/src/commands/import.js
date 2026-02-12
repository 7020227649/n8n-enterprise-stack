
const axios = require("axios");
const unzipper = require("unzipper");
const n8nApi = require("../services/n8nApi");
const { escapeHtml } = require("../utils/format");

// ─── Helpers ────────────────────────────────────────

/**
 * Download a file from Telegram and return it as a Buffer.
 */
async function downloadTelegramFile(ctx, fileId) {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    console.log("[Import] Downloading file from:", fileLink.href);
    const res = await axios.get(fileLink.href, { responseType: "arraybuffer", timeout: 60000 });
    return Buffer.from(res.data);
}

/**
 * Validate that an object looks like an n8n workflow.
 * Returns a cleaned workflow object or null.
 */
function parseWorkflowJson(data) {
    if (!data || typeof data !== "object") return null;

    // n8n exports sometimes wrap in an array
    if (Array.isArray(data)) {
        return data.length === 1 ? parseWorkflowJson(data[0]) : null;
    }

    // Must have nodes (array) to be a valid workflow
    if (!Array.isArray(data.nodes)) return null;

    // Strip fields that would cause conflicts on import
    const cleaned = { ...data };
    delete cleaned.id;
    delete cleaned.createdAt;
    delete cleaned.updatedAt;
    cleaned.active = false; // Safety: always import as inactive

    if (!cleaned.name) {
        cleaned.name = "Imported Workflow";
    }

    return cleaned;
}

/**
 * Import a single workflow JSON buffer and return a result object.
 */
async function importSingleWorkflow(buffer, filename) {
    try {
        const text = buffer.toString("utf-8");
        const data = JSON.parse(text);
        const workflow = parseWorkflowJson(data);

        if (!workflow) {
            return { success: false, name: filename, error: "Not a valid n8n workflow JSON" };
        }

        console.log(`[Import] Creating workflow: ${workflow.name}`);
        const created = await n8nApi.createWorkflow(workflow);
        console.log(`[Import] Workflow created with ID: ${created.id}`);
        return {
            success: true,
            name: workflow.name,
            id: created.id || "N/A",
        };
    } catch (err) {
        console.error(`[Import] Failed to import ${filename}:`, err.message);
        return { success: false, name: filename, error: err.message };
    }
}

/**
 * Extract all .json files from a ZIP buffer and import each as a workflow.
 */
async function importZipWorkflows(buffer) {
    const results = [];
    const directory = await unzipper.Open.buffer(buffer);

    // Filter for .json files, skip macOS resource forks and hidden files
    const jsonFiles = directory.files.filter(f => {
        const name = f.path.toLowerCase();
        return (
            name.endsWith(".json") &&
            !name.startsWith("__macosx") &&
            !name.includes("/.")
        );
    });

    console.log(`[Import] ZIP contains ${directory.files.length} files, ${jsonFiles.length} are .json`);

    if (jsonFiles.length === 0) {
        return [{ success: false, name: "archive", error: "No .json files found in ZIP" }];
    }

    for (const file of jsonFiles) {
        const content = await file.buffer();
        const filename = file.path.split("/").pop();
        console.log(`[Import] Processing ZIP entry: ${filename}`);
        const result = await importSingleWorkflow(content, filename);
        results.push(result);
    }

    return results;
}

// ─── Module ─────────────────────────────────────────

module.exports = (bot) => {

    // ─── /import — Instructions ──────────────────────────

    bot.command("import", async (ctx) => {
        await ctx.reply(
            [
                `📥 <b>Import Workflows</b>`,
                ``,
                `Send me a file to import:`,
                ``,
                `├ <b>.json</b> — Single workflow`,
                `└ <b>.zip</b>  — Multiple workflows (each as a .json inside)`,
                ``,
                `<i>Imported workflows are always set to</i> 🔴 <i>Inactive for safety.</i>`,
                `<i>Use /enable to activate them after review.</i>`,
            ].join("\n"),
            { parse_mode: "HTML" }
        );
    });

    // ─── Document Handler — .json and .zip ───────────────
    // Use bot.on with message type and check for document

    bot.on("message", async (ctx, next) => {
        // Only handle messages that contain a document
        if (!ctx.message || !ctx.message.document) {
            return next();
        }

        const doc = ctx.message.document;
        const fileName = (doc.file_name || "").toLowerCase();
        const isJson = fileName.endsWith(".json");
        const isZip = fileName.endsWith(".zip");

        // Not a workflow file — pass to next handler
        if (!isJson && !isZip) {
            return next();
        }

        console.log(`[Import] Received file: ${doc.file_name} (${doc.file_size} bytes, mime: ${doc.mime_type})`);

        // Size check (Telegram bot API limit is ~20 MB for downloads)
        if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
            return ctx.reply("❌ File too large. Telegram limits bot downloads to ~20 MB.");
        }

        try {
            await ctx.reply(`⏳ Downloading and processing <b>${escapeHtml(doc.file_name)}</b>...`, { parse_mode: "HTML" });
        } catch (replyErr) {
            console.error("[Import] Failed to send processing message:", replyErr.message);
        }

        try {
            const buffer = await downloadTelegramFile(ctx, doc.file_id);
            console.log(`[Import] Downloaded ${buffer.length} bytes`);

            if (isJson) {
                // ── Single JSON import ──
                const result = await importSingleWorkflow(buffer, doc.file_name);

                if (result.success) {
                    await ctx.reply(
                        [
                            `✅ <b>Workflow Imported!</b>`,
                            ``,
                            `├ Name: <b>${escapeHtml(result.name)}</b>`,
                            `├ ID: <code>${escapeHtml(String(result.id))}</code>`,
                            `└ Status: 🔴 Inactive`,
                            ``,
                            `<i>Use /enable to activate it.</i>`,
                        ].join("\n"),
                        { parse_mode: "HTML" }
                    );
                } else {
                    await ctx.reply(
                        [
                            `❌ <b>Import Failed</b>`,
                            ``,
                            `├ File: ${escapeHtml(doc.file_name)}`,
                            `└ Error: ${escapeHtml(result.error)}`,
                        ].join("\n"),
                        { parse_mode: "HTML" }
                    );
                }
            } else {
                // ── ZIP import ──
                const results = await importZipWorkflows(buffer);

                const succeeded = results.filter(r => r.success);
                const failed = results.filter(r => !r.success);

                const lines = [
                    `📥 <b>ZIP Import Complete</b>`,
                    ``,
                    `├ Total files: <b>${results.length}</b>`,
                    `├ ✅ Imported: <b>${succeeded.length}</b>`,
                    `└ ❌ Failed: <b>${failed.length}</b>`,
                ];

                if (succeeded.length > 0) {
                    lines.push(``, `<b>Imported Workflows:</b>`);
                    succeeded.forEach((r, i) => {
                        lines.push(`  ${i + 1}. <b>${escapeHtml(r.name)}</b> (ID: <code>${escapeHtml(String(r.id))}</code>)`);
                    });
                }

                if (failed.length > 0) {
                    lines.push(``, `<b>Failed:</b>`);
                    failed.forEach((r, i) => {
                        lines.push(`  ${i + 1}. ${escapeHtml(r.name)} — ${escapeHtml(r.error)}`);
                    });
                }

                lines.push(``, `<i>All imported workflows are 🔴 Inactive. Use /enable to activate.</i>`);

                await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
            }
        } catch (err) {
            console.error("[Import] Error:", err);
            try {
                await ctx.reply(`❌ Import error: ${escapeHtml(err.message)}`);
            } catch (_) { }
        }
    });
};
