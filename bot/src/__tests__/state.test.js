
const fs = require("fs");
const path = require("path");
const os = require("os");

// Create a temp directory for state tests
let tempDir;
let statePath;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-state-test-"));
    statePath = path.join(tempDir, "test-state.json");

    // Override config to use temp path
    jest.resetModules();
    jest.mock("../config", () => ({
        paths: { state: statePath, backups: "/tmp/backups" },
        limits: { maxBackups: 3, maxChunkSizeMB: 40, rateLimit: { maxRequests: 30, windowMs: 60000 }, executionFetchLimit: 100, dailyBackupCron: "0 3 * * *" },
        botToken: "test",
        adminId: "123",
        n8n: { baseURL: "http://localhost:5678", user: "test", pass: "test" },
    }));
});

afterEach(() => {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

describe("state manager", () => {
    test("returns default state when file doesn't exist", () => {
        const state = require("../utils/state");
        const result = state.get();
        expect(result).toHaveProperty("dailyBackup");
        expect(result).toHaveProperty("alerts");
        expect(result).toHaveProperty("restoreHistory");
        expect(result.dailyBackup.enabled).toBe(false);
        expect(result.alerts.enabled).toBe(true);
    });

    test("saves and retrieves a key", () => {
        const state = require("../utils/state");
        state.set("dailyBackup", { enabled: true, chatId: "999", lastRun: null });
        const result = state.get("dailyBackup");
        expect(result.enabled).toBe(true);
        expect(result.chatId).toBe("999");
    });

    test("update function modifies existing state", () => {
        const state = require("../utils/state");
        state.set("alerts", { enabled: true, mutedWorkflows: [] });
        state.update("alerts", (a) => ({ ...a, mutedWorkflows: ["wf1"] }));
        const result = state.get("alerts");
        expect(result.mutedWorkflows).toEqual(["wf1"]);
    });

    test("persists state to file", () => {
        const state = require("../utils/state");
        state.set("customKey", { test: true });

        // Read file directly
        const raw = fs.readFileSync(statePath, "utf-8");
        const parsed = JSON.parse(raw);
        expect(parsed.customKey).toEqual({ test: true });
    });

    test("handles corrupted file gracefully", () => {
        fs.writeFileSync(statePath, "not valid json!!!");
        const state = require("../utils/state");
        const result = state.get();
        // Should fall back to defaults
        expect(result).toHaveProperty("dailyBackup");
    });
});
