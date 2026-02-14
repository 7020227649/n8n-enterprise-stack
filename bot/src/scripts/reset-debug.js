
const fs = require('fs');
const path = require('path');
const config = require('../config');

console.log("🔍 DIAGNOSTIC RESET TOOL");
console.log("────────────────────────");

// 1. Check Env Var
const envKey = process.env.N8N_API_KEY;
if (envKey) {
    console.log(`❌ FOUND BAD ENV VAR: N8N_API_KEY (Length: ${envKey.length})`);
    console.log("   -> You must remove this from .env and recreate the container.");
} else {
    console.log("✅ N8N_API_KEY env var is empty (Good).");
}

// 2. Check State File
const statePath = config.paths.state;
console.log(`📂 Checking State File: ${statePath}`);

try {
    if (fs.existsSync(statePath)) {
        const content = fs.readFileSync(statePath, 'utf8');
        console.log("   Found state file.");
        const data = JSON.parse(content);

        if (data.n8nApiKey) {
            console.log("❌ FOUND BAD KEY IN STATE FILE!");
            console.log("   -> Deleting state file...");
            fs.unlinkSync(statePath);
            console.log("✅ State file deleted.");
        } else {
            console.log("✅ State file exists but has no API Key.");
        }
    } else {
        console.log("✅ No state file found (Good).");
    }
} catch (err) {
    console.error("   Error validating state:", err.message);
}

console.log("────────────────────────");
console.log("Please restart the bot now: docker compose restart bot");
