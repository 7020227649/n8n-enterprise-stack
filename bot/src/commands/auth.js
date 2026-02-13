const state = require("../utils/state");
const { Markup } = require("telegraf");

module.exports = (bot) => {

    bot.command("setkey", async (ctx) => {
        const message = ctx.message.text.trim();
        const parts = message.split(" ");

        if (parts.length < 2) {
            return ctx.reply(
                "🔑 <b>API Key Setup</b>\n\nTo connect to n8n v1+, you need an API Key.\n\n<b>Usage:</b>\n<code>/setkey n8n_api_...</code>\n\n<i>You can generate a key in n8n Settings > Developer.</i>",
                { parse_mode: "HTML" }
            );
        }

        const key = parts[1].trim();

        // Basic validation
        if (key.length < 10) {
            return ctx.reply("❌ Invalid key format. Please copy the full key.");
        }

        try {
            state.set("n8nApiKey", key);
            await ctx.reply("✅ <b>API Key Saved!</b>\n\nThe bot is now fully connected to n8n.\n\nRun /system to check the connection status, or /workflows to start managing your workflows.", { parse_mode: "HTML" });
        } catch (err) {
            console.error(err);
            await ctx.reply("❌ Failed to save API Key.");
        }
    });

    // Helper to check key status
    bot.command("auth_status", (ctx) => {
        const key = state.get("n8nApiKey");
        if (key) {
            const hidden = key.substring(0, 8) + "...";
            ctx.reply(`✅ API Key Configured: <code>${hidden}</code>`, { parse_mode: "HTML" });
        } else {
            ctx.reply("⚠️ No API Key configured. Using Basic Auth (Legacy).");
        }
    });

};
