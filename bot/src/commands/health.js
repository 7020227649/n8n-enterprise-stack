
const healthService = require("../services/healthService");

module.exports = (bot) => {

    // ─── /health — On-demand n8n health check ───────────

    bot.command("health", async (ctx) => {
        try {
            await ctx.reply("🏥 Checking n8n health...");

            const result = await healthService.checkNow();

            const statusEmoji = result.alive ? "🟢" : "🔴";
            const statusText = result.alive ? "Online" : "Unreachable";
            const uptime = result.upSince
                ? healthService.formatUptime(Date.now() - new Date(result.upSince).getTime())
                : "N/A";
            const downtime = result.downSince
                ? healthService.formatUptime(Date.now() - new Date(result.downSince).getTime())
                : "N/A";

            const lines = [
                `🏥 <b>n8n Health Check</b>`,
                ``,
                `├ Status: ${statusEmoji} <b>${statusText}</b>`,
                `├ Response: <b>${result.responseTime}ms</b>`,
            ];

            if (result.alive) {
                lines.push(`├ Uptime: <b>${uptime}</b>`);
            } else {
                lines.push(`├ Down Since: <b>${downtime}</b>`);
            }

            lines.push(`└ Checked: ${new Date().toLocaleString()}`);

            await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
        } catch (err) {
            await ctx.reply(`❌ Health check failed: ${err.message}`);
        }
    });

};
