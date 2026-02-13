const fs = require("fs");
const config = require("../config");
const { encrypt, decrypt } = require("./security");

const STATE_PATH = config.paths.state;

const DEFAULT_STATE = {
    dailyBackup: {
        enabled: false,
        chatId: null,
        lastRun: null
    },
    alerts: {
        enabled: true,
        mutedWorkflows: []
    },
    restoreHistory: []
};

function load() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            const raw = fs.readFileSync(STATE_PATH, "utf-8");
            const parsed = JSON.parse(raw);
            // Merge with defaults to ensure all keys exist
            return { ...DEFAULT_STATE, ...parsed };
        }
    } catch (err) {
        console.error("Failed to load state, using defaults:", err.message);
    }
    return { ...DEFAULT_STATE };
}

function save(state) {
    try {
        const dir = require("path").dirname(STATE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (err) {
        console.error("Failed to save state:", err.message);
    }
}

function get(key) {
    const state = load();
    let value = key ? state[key] : state;

    // Decrypt API Key if requested
    if (key === "n8nApiKey" && value) {
        return decrypt(value);
    }

    return value;
}

function set(key, value) {
    const state = load();

    // Encrypt API Key before saving
    if (key === "n8nApiKey" && value) {
        state[key] = encrypt(value.trim());
    } else {
        state[key] = value;
    }

    save(state);
    return state;
}

function update(key, updater) {
    const state = load();
    state[key] = updater(state[key] || {});
    save(state);
    return state;
}

module.exports = { load, save, get, set, update, DEFAULT_STATE };
