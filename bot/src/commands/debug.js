const axios = require("axios");
const config = require("../config");
const state = require("../utils/state");
const n8nApi = require("../services/n8nApi");

module.exports = (bot) => {
    bot.command("debug", async (ctx) => {
        const lines = ["🕵️ <b>Debug Report</b>", ""];

        // 1. Auth Configuration
        let apiKey = config.n8n.apiKey; // Env first
        let source = "Env";

        if (!apiKey) {
            const stored = state.get("n8nApiKey");
            if (stored) {
                apiKey = stored;
                source = "State (DB)";
                if (stored.startsWith("enc:")) {
                    source = "State (Encrypted ⚠️)"; // Should have been decrypted by getter
                }
            }
        }

        if (apiKey) apiKey = apiKey.trim();

        const basicUser = config.n8n.user;
        const hasKey = !!(apiKey && apiKey.length > 0);
        const hasBasic = !!(basicUser && config.n8n.pass);

        lines.push(`<b>Auth Mode:</b> ${hasKey ? "API Key 🔑" : (hasBasic ? "Basic Auth 🔐" : "None ❌")}`);

        if (hasKey) {
            const mask = apiKey.length > 8
                ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
                : "***";
            lines.push(`Key Source: ${source}`);
            lines.push(`Key (Masked): <code>${mask}</code>`);
            lines.push(`Key Length: ${apiKey.length} chars`);

            if (apiKey.length > 60) {
                lines.push("⚠️ <b>Warning:</b> Key includes possible JWT or encryption artifacts (too long).");
            }
        }

        // 2. Connectivity Check
        const baseURL = config.n8n.baseURL;
        lines.push(`<b>Configured Base URL:</b> ${baseURL}`);

        try {
            // Hostname resolution check
            const dns = require("dns").promises;
            const hostname = new URL(baseURL).hostname;
            try {
                await dns.lookup(hostname);
                lines.push(`DNS: ✅ Resolved <code>${hostname}</code>`);
            } catch (e) {
                lines.push(`DNS: ❌ Failed to resolve <code>${hostname}</code>`);
            }

            // Ping
            const res = await axios.get(baseURL, { timeout: 2000, validateStatus: () => true });
            lines.push(`<b>Connection:</b> ✅ Reachable (Status: ${res.status})`);
        } catch (err) {
            lines.push(`<b>Connection:</b> ❌ Unreachable (${err.code || err.message})`);
        }

        // 3. API Test (using service)
        lines.push("");
        lines.push("<b>API Test:</b>");
        try {
            // Try fetching workflows
            const workflows = await n8nApi.getAllWorkflows();
            lines.push(`✅ Success! Found ${workflows.length} workflows.`);
        } catch (err) {
            lines.push(`❌ Failed: ${err.message}`);
            if (err.response) {
                lines.push(`Status: <code>${err.response.status}</code>`);
                lines.push(`URL: <code>${err.config.url}</code>`);
                if (err.response.data) {
                    const d = JSON.stringify(err.response.data);
                    lines.push(`Data: <code>${d.substring(0, 100)}${d.length > 100 ? "..." : ""}</code>`);
                }
            }
        }

        await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    });
};
