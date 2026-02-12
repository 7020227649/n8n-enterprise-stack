
const axios = require("axios");
const config = require("../config");
const state = require("../utils/state");

const CHECK_INTERVAL = 60000; // 60 seconds
const REQUEST_TIMEOUT = 10000;

let currentState = "UNKNOWN"; // UP, DOWN, UNKNOWN
let lastCheck = null;
let lastResponseTime = null;
let upSince = null;
let downSince = null;
let checkInterval = null;

/**
 * Ping n8n's health endpoint.
 * Returns { alive: boolean, responseTime: number }
 */
async function ping() {
    const start = Date.now();
    try {
        await axios.get(`${config.n8n.baseURL}/healthz`, {
            timeout: REQUEST_TIMEOUT,
        });
        return { alive: true, responseTime: Date.now() - start };
    } catch {
        // Try alternate endpoint
        try {
            await axios.get(`${config.n8n.baseURL}/rest/settings`, {
                auth: { username: config.n8n.user, password: config.n8n.pass },
                timeout: REQUEST_TIMEOUT,
            });
            return { alive: true, responseTime: Date.now() - start };
        } catch {
            return { alive: false, responseTime: Date.now() - start };
        }
    }
}

/**
 * Start periodic health monitoring.
 * Sends alerts to admin on state transitions.
 */
function startMonitoring(bot) {
    if (checkInterval) return; // Already running

    console.log("🏥 Health monitoring started (every 60s)");

    checkInterval = setInterval(async () => {
        const result = await ping();
        const previousState = currentState;
        lastCheck = new Date().toISOString();
        lastResponseTime = result.responseTime;

        if (result.alive) {
            if (currentState !== "UP") {
                upSince = new Date().toISOString();
                downSince = null;
            }
            currentState = "UP";
        } else {
            if (currentState !== "DOWN") {
                downSince = new Date().toISOString();
                upSince = null;
            }
            currentState = "DOWN";
        }

        // Alert on state transitions
        if (previousState !== currentState && previousState !== "UNKNOWN") {
            const adminId = config.adminId;
            if (!adminId) return;

            try {
                if (currentState === "DOWN") {
                    await bot.telegram.sendMessage(
                        adminId,
                        [
                            `🔴 <b>n8n DOWN ALERT</b>`,
                            ``,
                            `├ Status: Unreachable`,
                            `├ Since: ${new Date().toLocaleString()}`,
                            `├ Response: ${lastResponseTime}ms (timeout)`,
                            `└ Action: Check server immediately`,
                        ].join("\n"),
                        { parse_mode: "HTML" }
                    );
                } else if (currentState === "UP") {
                    const downDuration = downSince
                        ? formatUptime(Date.now() - new Date(downSince).getTime())
                        : "unknown";
                    await bot.telegram.sendMessage(
                        adminId,
                        [
                            `🟢 <b>n8n RECOVERY</b>`,
                            ``,
                            `├ Status: Back online`,
                            `├ Downtime: ${downDuration}`,
                            `├ Response: ${lastResponseTime}ms`,
                            `└ Time: ${new Date().toLocaleString()}`,
                        ].join("\n"),
                        { parse_mode: "HTML" }
                    );
                }
            } catch (err) {
                console.error("Health alert send failed:", err.message);
            }
        }

        // Persist state
        state.set("health", {
            state: currentState,
            lastCheck,
            lastResponseTime,
            upSince,
            downSince,
        });
    }, CHECK_INTERVAL);

    // Run first check immediately
    setTimeout(async () => {
        const result = await ping();
        lastCheck = new Date().toISOString();
        lastResponseTime = result.responseTime;
        currentState = result.alive ? "UP" : "DOWN";
        if (result.alive) upSince = lastCheck;
        else downSince = lastCheck;

        state.set("health", {
            state: currentState,
            lastCheck,
            lastResponseTime,
            upSince,
            downSince,
        });
    }, 5000);
}

/**
 * Stop health monitoring.
 */
function stopMonitoring() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

/**
 * Get current health status.
 */
function getStatus() {
    return {
        state: currentState,
        lastCheck,
        lastResponseTime,
        upSince,
        downSince,
    };
}

/**
 * Run an on-demand health check (for /health command).
 */
async function checkNow() {
    const result = await ping();
    lastCheck = new Date().toISOString();
    lastResponseTime = result.responseTime;

    if (result.alive && currentState !== "UP") {
        upSince = lastCheck;
        downSince = null;
    } else if (!result.alive && currentState !== "DOWN") {
        downSince = lastCheck;
        upSince = null;
    }

    currentState = result.alive ? "UP" : "DOWN";

    return {
        alive: result.alive,
        responseTime: result.responseTime,
        state: currentState,
        status: result.alive ? "ok" : "down",
        dbConnection: result.alive, // If n8n responds, DB must be connected
        upSince,
        downSince,
    };
}

/**
 * Format milliseconds into human-readable uptime.
 */
function formatUptime(ms) {
    if (!ms || ms < 0) return "N/A";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
}

module.exports = {
    startMonitoring,
    stopMonitoring,
    getStatus,
    checkNow,
    checkHealth: checkNow, // Alias for backward compatibility
    ping,
    formatUptime,
};
