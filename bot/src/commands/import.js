
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

        const created = await n8nApi.createWorkflow(workflow);
        return {
            success: true,
            name: workflow.name,
            id: created.id || "N/A",
        };
    } catch (err) {
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

    if (jsonFiles.length === 0) {
        return [{ success: false, name: "archive", error: "No .json files found in ZIP" }];
    }

    for (const file of jsonFiles) {
        const content = await file.buffer();
        const filename = file.path.split("/").pop();
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

    bot.on("document", async (ctx) => {
        const doc = ctx.message.document;
        if (!doc) return;

        const fileName = (doc.file_name || "").toLowerCase();
        const isJson = fileName.endsWith(".json");
        const isZip = fileName.endsWith(".zip");

        if (!isJson && !isZip) return; // Ignore non-workflow files

        // Size check (50 MB limit)
        if (doc.file_size && doc.file_size > 50 * 1024 * 1024) {
            return ctx.reply("❌ File too large. Maximum size is 50 MB.");
        }

        await ctx.reply(`⏳ Downloading and processing <b>${escapeHtml(doc.file_name)}</b>...`, { parse_mode: "HTML" });

        try {
            const buffer = await downloadTelegramFile(ctx, doc.file_id);

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
                        `❌ <b>Import Failed</b>\n\n├ File: ${escapeHtml(doc.file_name)}\n└ Error: ${escapeHtml(result.error)}`,
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
            await ctx.reply(`❌ Import error: ${err.message}`);
        }
    });
};
