
const n8nApi = require("../services/n8nApi");
const { escapeHtml, statusEmoji } = require("../utils/format");
const { exec } = require("child_process");

module.exports = (bot) => {

    // ─── /summary — Quick dashboard overview ───────────

    bot.command("summary", async (ctx) => {
        try {
            await ctx.reply("📊 Generating dashboard...");

            const [workflows, execData] = await Promise.all([
                n8nApi.getAllWorkflows(),
                n8nApi.getExecutions({ limit: 100 }),
            ]);

            const executions = execData.data || [];
            const active = workflows.filter(wf => wf.active).length;
            const inactive = workflows.length - active;

            const success = executions.filter(e => e.status === "success").length;
            const failed = executions.filter(e => e.status === "error").length;
            const running = executions.filter(e => e.status === "running").length;
            const waiting = executions.filter(e => e.status === "waiting").length;

            const successRate = executions.length > 0
                ? ((success / executions.length) * 100).toFixed(1)
                : "0";

            // Find most active workflow
            const wfCounts = {};
            executions.forEach(e => {
                const name = e.workflowData?.name || e.workflowId || "Unknown";
                wfCounts[name] = (wfCounts[name] || 0) + 1;
            });
            const sorted = Object.entries(wfCounts).sort((a, b) => b[1] - a[1]);
            const topWorkflow = sorted[0] ? `${sorted[0][0]} (${sorted[0][1]} runs)` : "N/A";

            // Last failure
            const lastFail = executions.find(e => e.status === "error");
            const lastFailInfo = lastFail
                ? `${lastFail.workflowData?.name || "?"} — ${new Date(lastFail.startedAt).toLocaleString()}`
                : "None 🎉";

            // Visual bars
            const activeBar = progressBar(workflows.length > 0 ? (active / workflows.length) * 100 : 0);
            const successBar = progressBar(parseFloat(successRate));

            await ctx.reply(
                [
                    `📊 <b>n8n Dashboard Summary</b>`,
                    ``,
                    `<b>Workflows</b> ${activeBar}`,
                    `├ Total: <b>${workflows.length}</b>`,
                    `├ 🟢 Active: <b>${active}</b>`,
                    `└ 🔴 Inactive: <b>${inactive}</b>`,
                    ``,
                    `<b>Executions</b> (last 100) ${successBar}`,
                    `├ ✅ Success: <b>${success}</b>`,
                    `├ ❌ Failed: <b>${failed}</b>`,
                    `├ ⏳ Running: <b>${running}</b>`,
                    `├ ⏸ Waiting: <b>${waiting}</b>`,
                    `└ 📈 Success Rate: <b>${successRate}%</b>`,
                    ``,
                    `<b>Highlights</b>`,
                    `├ 🏆 Most Active: ${escapeHtml(topWorkflow)}`,
                    `└ 💥 Last Failure: ${escapeHtml(lastFailInfo)}`,
                ].join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });

    // ─── /version — Show n8n + bot version ─────────────

    bot.command("version", async (ctx) => {
        try {
            let n8nVersion = "Unknown";
            let n8nEdition = "Unknown";

            // Attempt 1: Get version from n8n REST API settings
            try {
                const settings = await n8nApi.getSettings();
                if (settings.versionCli || settings.n8nVersion) {
                    n8nVersion = settings.versionCli || settings.n8nVersion;
                }
                if (settings.license?.planName) {
                    n8nEdition = settings.license.planName;
                } else if (settings.enterprise) {
                    n8nEdition = "Enterprise";
                } else if (n8nVersion !== "Unknown") {
                    n8nEdition = "Community";
                }
            } catch { }

            // Attempt 2: If API didn't return version, try Docker exec
            if (n8nVersion === "Unknown") {
                try {
                    n8nVersion = await new Promise((resolve, reject) => {
                        exec("docker exec n8n-main n8n --version 2>/dev/null || docker exec n8n n8n --version 2>/dev/null", {
                            timeout: 10000
                        }, (err, stdout) => {
                            if (err) return reject(err);
                            const ver = (stdout || "").trim();
                            if (ver) resolve(ver);
                            else reject(new Error("Empty output"));
                        });
                    });
                    if (n8nEdition === "Unknown") n8nEdition = "Community";
                } catch { }
            }

            // Attempt 3: Check Docker image tag as last resort
            if (n8nVersion === "Unknown") {
                try {
                    n8nVersion = await new Promise((resolve, reject) => {
                        exec("docker inspect --format='{{.Config.Image}}' n8n-main 2>/dev/null || docker inspect --format='{{.Config.Image}}' n8n 2>/dev/null", {
                            timeout: 10000
                        }, (err, stdout) => {
                            if (err) return reject(err);
                            const image = (stdout || "").trim().replace(/'/g, "");
                            // Extract tag, e.g. "n8nio/n8n:1.70.2" → "1.70.2"
                            const tag = image.split(":").pop();
                            if (tag && tag !== image && tag !== "latest") resolve(tag);
                            else reject(new Error("No useful tag"));
                        });
                    });
                    if (n8nEdition === "Unknown") n8nEdition = "Community";
                } catch { }
            }

            const nodeVersion = process.version;
            const uptime = formatUptime(process.uptime() * 1000);
            const memUsage = process.memoryUsage();
            const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);

            await ctx.reply(
                [
                    `ℹ️ <b>Version Info</b>`,
                    ``,
                    `<b>n8n</b>`,
                    `├ Version: <b>${escapeHtml(n8nVersion)}</b>`,
                    `└ Edition: ${escapeHtml(n8nEdition)}`,
                    ``,
                    `<b>Bot</b>`,
                    `├ Version: <b>3.0.0</b>`,
                    `├ Node.js: ${nodeVersion}`,
                    `├ Memory: ${heapMB} MB`,
                    `├ Uptime: ${uptime}`,
                    `└ Commands: <b>49</b>`,
                ].join("\n"),
                { parse_mode: "HTML" }
            );
        } catch (err) {
            await ctx.reply(`❌ Error: ${err.message}`);
        }
    });
};

// ─── Helpers ─────────────────────────────────────────

function progressBar(percent) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
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
