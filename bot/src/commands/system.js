
const { exec } = require("child_process");
const os = require("os");
const { escapeHtml } = require("../utils/format");
const { Markup } = require("telegraf");

function run(cmd, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout.trim());
        });
    });
}

module.exports = (bot) => {

    // ─── /logs — View recent n8n log lines ────────────

    bot.command("logs", async (ctx) => {
        try {
            await ctx.reply("📜 Fetching n8n logs...");

            let logs = "";
            try {
                // Find n8n container dynamically using image name
                const cmd = `docker ps --filter "ancestor=n8nio/n8n" --format "{{.ID}}" | head -n 1`;
                const containerId = await run(cmd, 5000);

                if (containerId) {
                    logs = await run(`docker logs ${containerId} --tail 25 2>&1`, 10000);
                }
            } catch (err) {
                console.warn("Failed to find n8n container:", err.message);
            }

            if (!logs) {
                return ctx.reply("❌ Could not fetch logs. Container not found.");
            }

            // Truncate to Telegram message limit
            if (logs.length > 3800) {
                logs = logs.slice(-3800);
            }

            await ctx.reply(
                `📜 <b>n8n Logs</b> (last 25 lines)\n\n<pre>${escapeHtml(logs)}</pre>`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /system — Server resource usage ───────────────

    bot.command("system", async (ctx) => {
        try {
            const cpus = os.cpus();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
            const uptime = formatUptime(os.uptime() * 1000);

            // CPU usage (average load)
            const loadAvg = os.loadavg();
            const cpuCount = cpus.length;
            const cpuPercent = ((loadAvg[0] / cpuCount) * 100).toFixed(1);

            // Disk usage
            let diskInfo = "N/A";
            try {
                const df = await run("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\" used)\"}'");
                diskInfo = df;
            } catch { }

            const memBar = progressBar(parseFloat(memPercent));
            const cpuBar = progressBar(Math.min(parseFloat(cpuPercent), 100));

            await ctx.reply(
                [
                    `🖥 <b>System Resources</b>`,
                    ``,
                    `<b>CPU</b> ${cpuBar} ${cpuPercent}%`,
                    `├ Cores: ${cpuCount}`,
                    `├ Model: ${cpus[0]?.model || "N/A"}`,
                    `└ Load: ${loadAvg.map(l => l.toFixed(2)).join(" / ")}`,
                    ``,
                    `<b>Memory</b> ${memBar} ${memPercent}%`,
                    `├ Used: ${formatBytes(usedMem)}`,
                    `├ Free: ${formatBytes(freeMem)}`,
                    `└ Total: ${formatBytes(totalMem)}`,
                    ``,
                    `<b>Disk:</b> ${diskInfo}`,
                    `<b>Uptime:</b> ${uptime}`,
                    `<b>Platform:</b> ${os.platform()} ${os.arch()}`,
                ].join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /disk — Docker disk usage ─────────────────────

    bot.command("disk", async (ctx) => {
        try {
            await ctx.reply("💽 Checking Docker disk usage...");

            const output = await run("docker system df 2>&1", 10000);

            await ctx.reply(
                `💽 <b>Docker Disk Usage</b>\n\n<pre>${escapeHtml(output)}</pre>`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /restart_n8n — Quick restart ──────────────────

    bot.command("restart_n8n", async (ctx) => {
        try {
            await ctx.reply(
                `🔄 <b>Restart n8n?</b>\n\n├ Downtime: ~15-30 seconds\n└ Active executions will be interrupted.\n\n<i>This will NOT pull a new image.</i>`,
                {
                    parse_mode: "HTML",
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback("✅ Restart", "sys_restart_confirm"),
                            Markup.button.callback("❌ Cancel", "sys_restart_cancel"),
                        ],
                    ]),
                }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    bot.action("sys_restart_confirm", async (ctx) => {
        try {
            await ctx.answerCbQuery("Restarting...");
            await ctx.editMessageText("⏳ Restarting n8n containers...");

            // Find all n8n containers (main and worker)
            const findCmd = `docker ps --filter "ancestor=n8nio/n8n" --format "{{.ID}}"`;
            let containerIds = "";
            try {
                containerIds = await run(findCmd, 5000);
            } catch (e) {
                return ctx.reply("❌ Could not find any n8n containers to restart.");
            }

            if (!containerIds.trim()) {
                return ctx.reply("❌ No active n8n containers found.");
            }

            // Restart them
            const ids = containerIds.split("\n").join(" ");
            await run(`docker restart ${ids}`, 60000);

            await ctx.reply(
                `✅ <b>n8n Restarted</b>\n└ Containers should be back online in ~15s.`,
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Restart failed: ${err.message}`);
        }
    });

    bot.action("sys_restart_cancel", async (ctx) => {
        await ctx.answerCbQuery("Cancelled");
        await ctx.editMessageText("❌ Restart cancelled.");
    });

};

// ─── Helpers ─────────────────────────────────────────

function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${s % 60}s`;
}

function progressBar(percent) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}
