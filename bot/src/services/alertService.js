
const state = require("../utils/state");
const { formatAlertMessage } = require("../utils/format");
const config = require("../config");

/**
 * Check if alerts are enabled globally.
 */
function isEnabled() {
    const alerts = state.get("alerts") || { enabled: true, mutedWorkflows: [] };
    return alerts.enabled;
}

/**
 * Enable global alerts.
 */
function enable() {
    state.update("alerts", (a) => ({ ...a, enabled: true }));
}

/**
 * Disable global alerts.
 */
function disable() {
    state.update("alerts", (a) => ({ ...a, enabled: false }));
}

/**
 * Check if a specific workflow is muted.
 */
function isMuted(workflowId) {
    const alerts = state.get("alerts") || { enabled: true, mutedWorkflows: [] };
    return alerts.mutedWorkflows.includes(String(workflowId));
}

/**
 * Mute alerts for a specific workflow.
 */
function mute(workflowId) {
    state.update("alerts", (a) => {
        const muted = a.mutedWorkflows || [];
        if (!muted.includes(String(workflowId))) {
            muted.push(String(workflowId));
        }
        return { ...a, mutedWorkflows: muted };
    });
}

/**
 * Unmute alerts for a specific workflow.
 */
function unmute(workflowId) {
    state.update("alerts", (a) => {
        const muted = (a.mutedWorkflows || []).filter(id => id !== String(workflowId));
        return { ...a, mutedWorkflows: muted };
    });
}

/**
 * Get current alert configuration.
 */
function getStatus() {
    return state.get("alerts") || { enabled: true, mutedWorkflows: [] };
}

/**
 * Get list of muted workflow IDs.
 */
function getMutedList() {
    const alerts = state.get("alerts") || { enabled: true, mutedWorkflows: [] };
    return alerts.mutedWorkflows || [];
}

/**
 * Process an incoming failure webhook and send alert to Telegram if enabled.
 */
async function sendAlert(bot, payload) {
    if (!isEnabled()) return false;

    const workflowId = payload.workflow?.id;
    if (workflowId && isMuted(workflowId)) return false;

    const adminId = config.adminId;
    if (!adminId) return false;

    try {
        const message = formatAlertMessage(payload);
        await bot.telegram.sendMessage(adminId, message, { parse_mode: "HTML" });
        return true;
    } catch (err) {
        console.error("Failed to send alert:", err.message);
        return false;
    }
}

module.exports = {
    isEnabled,
    enable,
    disable,
    isMuted,
    mute,
    unmute,
    getStatus,
    getMutedList,
    sendAlert
};
