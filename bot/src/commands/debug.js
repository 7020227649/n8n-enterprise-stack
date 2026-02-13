const axios = require("axios");
const config = require("../config");
const state = require("../utils/state");
const n8nApi = require("../services/n8nApi");

module.exports = (bot) => {
    bot.command("debug", async (ctx) => {
        const lines = ["🕵️ <b>Debug Report</b>", ""];

        // 1. Auth Configuration
        const apiKey = state.get("n8nApiKey") || config.n8n.apiKey;
        const basicUser = config.n8n.user;
        const hasKey = !!apiKey;
        const hasBasic = !!(basicUser && config.n8n.pass);

        lines.push(`<b>Auth Mode:</b> ${hasKey ? "API Key 🔑" : (hasBasic ? "Basic Auth 🔐" : "None ❌")}`);

        if (hasKey) {
            const mask = apiKey.length > 8
                ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
                : "***";
            lines.push(`Key: <code>${mask}</code>`);
        }

        // 2. Connectivity Check
        const baseURL = config.n8n.baseURL;
        lines.push(`<b>Target:</b> ${baseURL}`);

        try {
            // Try a simple public endpoint or just root to check network
            const res = await axios.get(baseURL, { timeout: 2000, validateStatus: () => true });
            lines.push(`<b>Connection:</b> ✅ Reachable (Status: ${res.status})`);
        } catch (err) {
            lines.push(`<b>Connection:</b> ❌ Unreachable (${err.code || err.message})`);
        }

        // 3. API Test (using service)
        lines.push("");
        lines.push("<b>API Test:</b>");
        try {
            // Try fetching workflows (limited info)
            const workflows = await n8nApi.getAllWorkflows();
            lines.push(`✅ Success! Found ${workflows.length} workflows.`);
        } catch (err) {
            lines.push(`❌ Failed: ${err.message}`);
            if (err.response) {
                lines.push(`Status: ${err.response.status}`);
                if (err.response.data) {
                    const d = JSON.stringify(err.response.data);
                    lines.push(`Data: ${d.substring(0, 100)}${d.length > 100 ? "..." : ""}`);
                }
            }
        }

        await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    });
};
