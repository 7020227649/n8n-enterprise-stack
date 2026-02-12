
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const n8nApi = require("../services/n8nApi");
const { escapeHtml } = require("../utils/format");

// Temp directory for credential files
const TEMP_DIR = "/tmp/cred-backup";

// ─── Helpers ────────────────────────────────────────

/**
 * Find the n8n container name dynamically.
 */
function findN8nContainer() {
    return new Promise((resolve, reject) => {
        exec(
            'docker ps --filter "name=n8n-main" --format "{{.Names}}" | head -1',
            { timeout: 10000 },
            (err, stdout) => {
                if (err) return reject(new Error("Could not find n8n container"));
                const name = (stdout || "").trim();
                if (!name) return reject(new Error("n8n container not running"));
                resolve(name);
            }
        );
    });
}

/**
 * Run a command inside the n8n container.
 */
function dockerExec(container, command, timeout = 30000) {
    return new Promise((resolve, reject) => {
        exec(
            `docker exec "${container}" ${command}`,
            { timeout, maxBuffer: 10 * 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                resolve(stdout);
            }
        );
    });
}

/**
 * Copy a file from/to the n8n container.
 */
function dockerCp(source, dest, timeout = 30000) {
    return new Promise((resolve, reject) => {
        exec(`docker cp "${source}" "${dest}"`, { timeout }, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

// ─── Module ─────────────────────────────────────────

module.exports = (bot) => {

    // ─── /backup_credentials — Export all credentials ────

    bot.command("backup_credentials", async (ctx) => {
        try {
            await ctx.reply("⏳ Exporting credentials from n8n...");

            const container = await findN8nContainer();
            console.log(`[Credentials] Found container: ${container}`);

            // Export credentials inside the n8n container
            const containerFile = "/tmp/n8n-creds-export.json";
            await dockerExec(container, `n8n export:credentials --all --decrypted --output=${containerFile}`);
            console.log("[Credentials] Export command completed");

            // Create temp dir on bot side
            if (!fs.existsSync(TEMP_DIR)) {
                fs.mkdirSync(TEMP_DIR, { recursive: true });
            }

            // Copy the file from n8n container to bot container
            const localFile = path.join(TEMP_DIR, "credentials-backup.json");
            await dockerCp(`${container}:${containerFile}`, localFile);
            console.log("[Credentials] File copied to bot container");

            // Read and send to Telegram
            const fileBuffer = fs.readFileSync(localFile);

            // Parse to count credentials
            let credCount = 0;
            try {
                const parsed = JSON.parse(fileBuffer.toString("utf-8"));
                credCount = Array.isArray(parsed) ? parsed.length : 1;
            } catch { credCount = 0; }

            const date = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

            await ctx.replyWithDocument(
                { source: fileBuffer, filename: `credentials-backup-${date}.json` },
                {
                    caption: [
                        `🔐 <b>Credentials Backup Complete</b>`,
                        ``,
                        `├ Credentials: <b>${credCount}</b>`,
                        `├ Format: Decrypted JSON`,
                        `└ Time: ${new Date().toLocaleString()}`,
                        ``,
                        `⚠️ <i>This file contains sensitive secrets. Store securely!</i>`,
                    ].join("\n"),
                    parse_mode: "HTML"
                }
            );

            // Cleanup temp files
            try {
                fs.unlinkSync(localFile);
                await dockerExec(container, `rm -f ${containerFile}`);
            } catch { }

            console.log(`[Credentials] Backup complete: ${credCount} credentials`);
        } catch (err) {
            console.error("[Credentials] Backup error:", err);
            await ctx.reply(`❌ Credential backup failed: ${escapeHtml(err.message)}`);
        }
    });

    // ─── /restore_credentials — Import credentials ───────

    const pendingCredRestore = new Map();

    bot.command("restore_credentials", async (ctx) => {
        pendingCredRestore.set(ctx.chat.id, { state: "awaiting_file" });

        await ctx.reply(
            [
                `🔐 <b>Restore Credentials</b>`,
                ``,
                `Send me the credentials backup <b>.json</b> file.`,
                ``,
                `Rules:`,
                `├ Must be a file exported by <code>/backup_credentials</code>`,
                `├ Existing credentials with the same ID will be <b>skipped</b>`,
                `└ New credentials will be <b>added</b>`,
                ``,
                `<i>Waiting for file...</i>`,
            ].join("\n"),
            { parse_mode: "HTML" }
        );
    });

    // Document handler for credential restore
    bot.on("document", async (ctx, next) => {
        const session = pendingCredRestore.get(ctx.chat.id);
        if (!session || session.state !== "awaiting_file") return next();

        const doc = ctx.message.document;
        const fileName = (doc.file_name || "").toLowerCase();

        if (!fileName.endsWith(".json")) {
            return ctx.reply("⚠️ Please send a <b>.json</b> credentials backup file.", { parse_mode: "HTML" });
        }

        pendingCredRestore.delete(ctx.chat.id);

        try {
            await ctx.reply(`⏳ Downloading and importing credentials...`);

            // Download file from Telegram
            const fileLink = await ctx.telegram.getFileLink(doc.file_id);
            const res = await axios.get(fileLink.href, { responseType: "arraybuffer", timeout: 60000 });
            const buffer = Buffer.from(res.data);

            // Validate it's valid JSON with credentials
            let credCount = 0;
            try {
                const parsed = JSON.parse(buffer.toString("utf-8"));
                credCount = Array.isArray(parsed) ? parsed.length : 1;
            } catch {
                return ctx.reply("❌ Invalid JSON file. Please send a valid credentials backup.");
            }

            console.log(`[Credentials] Restoring ${credCount} credentials from ${doc.file_name}`);

            // Find n8n container
            const container = await findN8nContainer();

            // Create temp dir on bot side
            if (!fs.existsSync(TEMP_DIR)) {
                fs.mkdirSync(TEMP_DIR, { recursive: true });
            }

            // Save file locally
            const localFile = path.join(TEMP_DIR, "credentials-restore.json");
            fs.writeFileSync(localFile, buffer);

            // Copy file into n8n container
            const containerFile = "/tmp/n8n-creds-restore.json";
            await dockerCp(localFile, `${container}:${containerFile}`);

            // Import credentials via n8n CLI
            const output = await dockerExec(
                container,
                `n8n import:credentials --input=${containerFile}`,
                60000
            );

            console.log("[Credentials] Import output:", output);

            await ctx.reply(
                [
                    `✅ <b>Credentials Restored!</b>`,
                    ``,
                    `├ File: <b>${escapeHtml(doc.file_name)}</b>`,
                    `├ Credentials in file: <b>${credCount}</b>`,
                    `└ Status: Imported successfully`,
                    ``,
                    `<i>Verify in n8n UI → Settings → Credentials</i>`,
                ].join("\n"),
                { parse_mode: "HTML" }
            );

            // Cleanup
            try {
                fs.unlinkSync(localFile);
                await dockerExec(container, `rm -f ${containerFile}`);
            } catch { }

        } catch (err) {
            console.error("[Credentials] Restore error:", err);
            await ctx.reply(`❌ Credential restore failed: ${escapeHtml(err.message)}`);
        }
    });
};
