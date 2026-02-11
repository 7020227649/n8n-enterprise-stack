const { Telegraf } = require("telegraf");
const config = require("../config");

async function debug() {
    console.log("🔍 Starting Bot Diagnostics...");
    console.log(`🔑 Using Token: ${config.botToken ? "Yes (length " + config.botToken.length + ")" : "NO"}`);

    if (!config.botToken) {
        console.error("❌ CRTICAL: No BOT_TOKEN found in environment!");
        process.exit(1);
    }

    const bot = new Telegraf(config.botToken);

    try {
        console.log("📡 Connecting to Telegram...");
        const me = await bot.telegram.getMe();
        console.log(`✅ Success! Connected as: @${me.username} (ID: ${me.id})`);

        console.log("----------------------------------------");
        console.log("📋 CHECKING WEBHOOK STATUS:");
        const webhookInfo = await bot.telegram.getWebhookInfo();
        console.log(`   URL: ${webhookInfo.url || "None (Using Polling)"}`);
        console.log(`   Pending Updates: ${webhookInfo.pending_update_count}`);
        console.log(`   Last Error: ${webhookInfo.last_error_message || "None"}`);

        if (webhookInfo.url) {
            console.warn("⚠️ WARNING: A Webhook is SET! This prevents Polling.");
            console.log("   Attempting to delete webhook...");
            await bot.telegram.deleteWebhook();
            console.log("✅ Webhook deleted. Polling should work now.");
        } else {
            console.log("✅ No Webhook set. Polling is active.");
        }

        console.log("----------------------------------------");
        console.log("🏁 Diagnostics Complete.");

    } catch (err) {
        console.error("❌ CONNECTION FAILED:");
        console.error(err.message);
        if (err.response) {
            console.error("Response:", err.response.description);
        }
    }
}

debug();
