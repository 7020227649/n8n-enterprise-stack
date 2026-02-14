const n8nApi = require("../services/n8nApi");
const config = require("../config");

async function diagnose() {
    console.log("🩺 Starting n8n Connection Doctor...");
    console.log("──────────────────────────────────────────");
    console.log(`Configured Email: ${config.n8n.user}`);
    console.log(`API Base URL:     ${config.n8n.baseURL}`);
    console.log(`Has API Key:      ${config.n8n.apiKey ? "YES (Env)" : "NO"}`);
    console.log("──────────────────────────────────────────");

    try {
        console.log("1️⃣  Testing Workflow Fetch...");
        const start = Date.now();
        const workflows = await n8nApi.getAllWorkflows();
        const duration = Date.now() - start;

        console.log(`✅ Success! Found ${workflows.length} workflows.`);
        console.log(`   ⏱  Latency: ${duration}ms`);
        console.log("");
        console.log("🎉 The bot is FULLY FUNCTIONAL.");
    } catch (err) {
        console.error("❌ FAILED to fetch workflows.");
        console.error(`   Error: ${err.message}`);
        if (err.response) {
            console.error(`   Status: ${err.response.status}`);
            console.error(`   Data: ${JSON.stringify(err.response.data)}`);
        }

        console.log("");
        console.log("💡 DIAGNOSIS:");
        if (err.message.includes("401")) {
            console.log("   Authentication is failing.");
            if (config.n8n.apiKey) {
                console.log("   -> Your API Key might be invalid.");
            }
            console.log("   -> Your Email/Password might be incorrect.");
        } else if (err.message.includes("ECONNREFUSED")) {
            console.log("   The bot cannot reach n8n. Is the n8n container running?");
        }
    }
}

diagnose();
