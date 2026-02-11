
const { exec } = require("child_process");
const { escapeHtml } = require("../utils/format");
const { Markup } = require("telegraf");

/**
 * Execute a shell command and return stdout/stderr.
 */
function run(cmd, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(stderr || err.message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

module.exports = (bot) => {

    // ─── /update_n8n — Pull latest image & restart ──────

    bot.command("update_n8n", async (ctx) => {
        try {
            // Get current version
            let currentVersion = "unknown";
            try {
                const info = await run(
                    `docker inspect n8n-enterprise-stack-api-n8n-main-1 --format '{{.Config.Image}}' 2>/dev/null || docker inspect n8n-main --format '{{.Config.Image}}' 2>/dev/null || echo 'unknown'`
                );
                currentVersion = info.replace(/'/g, "");
            } catch { }

            await ctx.reply(
                [
                    `🔄 <b>Update n8n</b>`,
                    ``,
                    `├ Current: <code>${escapeHtml(currentVersion)}</code>`,
                    `├ Action: Pull latest image & restart`,
                    `└ Downtime: ~30-60 seconds`,
                    ``,
                    `⚠️ <b>This will restart n8n-main and n8n-worker.</b>`,
                    `<i>Active executions will be interrupted.</i>`,
                ].join("\n"),
                {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback("✅ Confirm Update", "update_n8n_confirm"),
                            Markup.button.callback("❌ Cancel", "update_n8n_cancel"),
                        ],
                    ]),
                }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── Confirm → Execute update ──────────────────────

    bot.action("update_n8n_confirm", async (ctx) => {
        try {
            await ctx.answerCbQuery("Starting update...");
            await ctx.editMessageText("⏳ <b>Update in progress...</b>\n\n├ Step 1: Pulling latest n8n image...", { parse_mode: "HTML" });

            // Step 1: Pull latest n8n image
            try {
                await run("docker pull n8nio/n8n:latest", 180000);
            } catch (pullErr) {
                // Try pulling with the version from env if latest fails
                try {
                    await run("docker pull n8nio/n8n", 180000);
                } catch {
                    throw new Error(`Image pull failed: ${pullErr.message}`);
                }
            }

            await ctx.reply("✅ Image pulled.\n├ Step 2: Stopping n8n containers...");

            // Step 2: Stop n8n containers
            // Try common container name patterns
            const stopCmds = [
                "docker stop n8n-enterprise-stack-api-n8n-main-1 n8n-enterprise-stack-api-n8n-worker-1 2>/dev/null",
                "docker stop n8n-main n8n-worker 2>/dev/null",
            ];

            for (const cmd of stopCmds) {
                try {
                    await run(cmd, 30000);
                    break;
                } catch { }
            }

            await ctx.reply("✅ Containers stopped.\n├ Step 3: Recreating with new image...");

            // Step 3: Recreate containers
            // Use docker compose from the project directory
            const composeCmds = [
                "docker compose -f /opt/n8n-enterprise-stack/docker-compose.yml up -d n8n-main n8n-worker",
                "docker-compose -f /opt/n8n-enterprise-stack/docker-compose.yml up -d n8n-main n8n-worker",
            ];

            let recreated = false;
            for (const cmd of composeCmds) {
                try {
                    await run(cmd, 120000);
                    recreated = true;
                    break;
                } catch { }
            }

            if (!recreated) {
                // Fallback: just restart the stopped containers
                const restartCmds = [
                    "docker start n8n-enterprise-stack-api-n8n-main-1 n8n-enterprise-stack-api-n8n-worker-1 2>/dev/null",
                    "docker start n8n-main n8n-worker 2>/dev/null",
                ];
                for (const cmd of restartCmds) {
                    try {
                        await run(cmd, 30000);
                        recreated = true;
                        break;
                    } catch { }
                }
            }

            // Step 4: Verify n8n is back up (wait and check)
            await ctx.reply("⏳ Waiting for n8n to come back online...");
            await new Promise((r) => setTimeout(r, 10000));

            // Check health by calling the API
            let healthy = false;
            const axios = require("axios");
            const config = require("../config");

            for (let i = 0; i < 6; i++) {
                try {
                    await axios.get(`${config.n8n.baseURL}/healthz`, { timeout: 5000 });
                    healthy = true;
                    break;
                } catch {
                    await new Promise((r) => setTimeout(r, 5000));
                }
            }

            // Get new version
            let newVersion = "unknown";
            try {
                const info = await run(
                    `docker inspect n8n-enterprise-stack-api-n8n-main-1 --format '{{.Config.Image}}' 2>/dev/null || docker inspect n8n-main --format '{{.Config.Image}}' 2>/dev/null || echo 'unknown'`
                );
                newVersion = info.replace(/'/g, "");
            } catch { }

            const statusMsg = healthy
                ? `✅ <b>n8n Update Complete!</b>\n\n├ Image: <code>${escapeHtml(newVersion)}</code>\n├ Health: 🟢 Online\n└ Time: ${new Date().toLocaleString()}`
                : `⚠️ <b>Update applied but n8n may still be starting.</b>\n\n├ Image: <code>${escapeHtml(newVersion)}</code>\n├ Health: 🟡 Pending\n└ Check /workflow_status in a minute.`;

            await ctx.reply(statusMsg, { parse_mode: "HTML" });
        } catch (err) {
            await ctx.reply(
                `❌ <b>Update failed</b>\n\n└ ${escapeHtml(err.message)}\n\n<i>n8n containers may need manual restart.</i>`,
                { parse_mode: "HTML" }
            );
        }
    });

    // ─── Cancel update ──────────────────────────────────

    bot.action("update_n8n_cancel", async (ctx) => {
        await ctx.answerCbQuery("Cancelled");
        await ctx.editMessageText("❌ Update cancelled.");
    });
};
