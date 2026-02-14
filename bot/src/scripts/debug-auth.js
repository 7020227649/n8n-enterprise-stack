const axios = require("axios");
const config = require("../config");
const state = require("../utils/state");

const BASE_URL = config.n8n.baseURL;
const N8N_USER = config.n8n.user;
const N8N_PASS = config.n8n.pass;
const N8N_API_KEY = config.n8n.apiKey;
const STATE_KEY = state.get("n8nApiKey");

console.log("🕵️  Starting Deep Auth Debug...");
console.log(`📍 Target: ${BASE_URL}`);
console.log(`👤 User: ${N8N_USER}`);

async function test(name, headers, auth) {
    try {
        console.log(`\n👉 Testing: ${name}`);
        const res = await axios.get(`${BASE_URL}/rest/workflows`, {
            headers,
            auth,
            timeout: 5000,
            validateStatus: () => true
        });

        if (res.status === 200) {
            console.log(`   ✅ SUCCESS! (Status: 200)`);
            return true;
        } else {
            console.log(`   ❌ Failed (Status: ${res.status})`);
            if (res.status === 401) console.log("      Reason: Unauthorized");
            return false;
        }
    } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
        return false;
    }
}

(async () => {
    // 1. Test Environment API Key
    if (N8N_API_KEY) {
        const key = N8N_API_KEY.trim();
        if (key.length < 60) {
            await test("Env API Key (X-N8N-API-KEY)", { "X-N8N-API-KEY": key });
        } else {
            console.log("\n👉 Testing: Env API Key");
            console.log("   ⚠️  Skipped: Key is corrupt (>60 chars)");
        }
    } else {
        console.log("\n👉 Testing: Env API Key");
        console.log("   ℹ️  Skipped: Not set");
    }

    // 2. Test State API Key
    if (STATE_KEY) {
        let key = STATE_KEY;
        if (key.startsWith("enc:")) {
            const { decrypt } = require("../utils/security");
            key = decrypt(key);
        }
        key = key ? key.trim() : "";

        if (key && key.length < 60) {
            await test("State API Key (X-N8N-API-KEY)", { "X-N8N-API-KEY": key });
        } else {
            console.log("\n👉 Testing: State API Key");
            console.log("   ⚠️  Skipped: Key is corrupt or empty");
        }
    }

    // 3. Test Basic Auth
    if (N8N_USER && N8N_PASS) {
        await test("Basic Auth (Internal API)", {}, { username: N8N_USER, password: N8N_PASS });
    } else {
        console.log("\n👉 Testing: Basic Auth");
        console.log("   ℹ️  Skipped: User/Pass not set");
    }

    // 4. Test Session Auth (New)
    if (N8N_USER && N8N_PASS) {
        console.log("\n👉 Testing: Session Auth (Internal API)");
        try {
            const loginRes = await axios.post(`${BASE_URL}/rest/login`, {
                emailOrLdapLoginId: N8N_USER,
                password: N8N_PASS,
            }, { timeout: 5000 });

            const cookies = loginRes.headers["set-cookie"];
            if (cookies) {
                const cookieStr = cookies.map(c => c.split(";")[0]).join("; ");
                console.log("   🔑 Login Successful. Got Cookie.");

                const res = await axios.get(`${BASE_URL}/rest/workflows`, {
                    headers: { Cookie: cookieStr },
                    timeout: 5000,
                    validateStatus: () => true
                });

                if (res.status === 200) console.log(`   ✅ SUCCESS! (Status: 200)`);
                else console.log(`   ❌ Failed (Status: ${res.status})`);

            } else {
                console.log("   ❌ Login Failed: No cookies received.");
            }
        } catch (err) {
            console.log(`   ❌ Login Failed: ${err.message}`);
            if (err.response && err.response.data) {
                console.log(`      Error Data: ${JSON.stringify(err.response.data)}`);
            }
        }
    } else {
        console.log("\n👉 Testing: Session Auth");
        console.log("   ℹ️  Skipped: User/Pass not set");
    }

    // 5. Test Public API Endpoint (v1) with Env Key
    if (N8N_API_KEY && N8N_API_KEY.length < 60) {
        try {
            console.log(`\n👉 Testing: Public API v1 (GET /api/v1/workflows)`);
            // Rewrite URL context
            const url = BASE_URL.replace("/rest", "/api/v1") + "/workflows";
            const res = await axios.get(url, {
                headers: { "X-N8N-API-KEY": N8N_API_KEY.trim() },
                timeout: 5000,
                validateStatus: () => true
            });
            if (res.status === 200) console.log(`   ✅ SUCCESS!`);
            else console.log(`   ❌ Failed (Status: ${res.status})`);
        } catch (err) {
            console.log(`   ❌ Error: ${err.message}`);
        }
    }

    console.log("\n🏁 Debug Complete.");
})();
