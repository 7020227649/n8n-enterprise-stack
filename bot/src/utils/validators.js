
/**
 * Input validation and sanitization for API responses.
 * Ensures the bot never crashes on malformed n8n data.
 */

/**
 * Validate and sanitize a single workflow object.
 * Returns a safe object or null if invalid.
 */
function validateWorkflow(obj) {
    if (!obj || typeof obj !== "object") return null;

    return {
        id: obj.id != null ? String(obj.id) : null,
        name: typeof obj.name === "string" ? obj.name : `Workflow ${obj.id || "Unknown"}`,
        active: obj.active === true || String(obj.active).toLowerCase() === "true" || obj.active === 1,
        nodes: Array.isArray(obj.nodes) ? obj.nodes : [],
        connections: obj.connections && typeof obj.connections === "object" ? obj.connections : {},
        updatedAt: obj.updatedAt || null,
        createdAt: obj.createdAt || null,
        tags: Array.isArray(obj.tags) ? obj.tags : [],
    };
}

/**
 * Validate an array of workflows from API response.
 * Filters out any malformed entries.
 */
function validateWorkflows(data) {
    if (!data) return [];
    const arr = Array.isArray(data) ? data : [];
    return arr.map(validateWorkflow).filter(Boolean).filter(wf => wf.id !== null);
}

/**
 * Validate a single execution object.
 */
function validateExecution(obj) {
    if (!obj || typeof obj !== "object") return null;

    return {
        id: obj.id != null ? String(obj.id) : null,
        workflowId: obj.workflowId != null ? String(obj.workflowId) : null,
        workflowData: obj.workflowData && typeof obj.workflowData === "object"
            ? { id: obj.workflowData.id, name: obj.workflowData.name || "Unknown" }
            : null,
        status: typeof obj.status === "string" ? obj.status : (obj.finished ? "success" : "error"),
        finished: Boolean(obj.finished),
        startedAt: obj.startedAt || null,
        stoppedAt: obj.stoppedAt || null,
        mode: obj.mode || null,
        retryOf: obj.retryOf || null,
        data: obj.data || null,
    };
}

/**
 * Validate execution list response from API.
 * Handles both { data: [...] } and direct array formats.
 */
function validateExecutions(response) {
    if (!response) return { data: [], nextCursor: null };

    const rawData = response.data || response;
    const arr = Array.isArray(rawData) ? rawData : [];

    return {
        data: arr.map(validateExecution).filter(Boolean).filter(e => e.id !== null),
        nextCursor: response.nextCursor || null,
    };
}

/**
 * Validate required environment variables on startup.
 * Returns an array of error messages (empty = all good).
 */
function validateEnv() {
    const errors = [];
    const required = [
        { key: "BOT_TOKEN", label: "Telegram Bot Token" },
        { key: "ADMIN_ID", label: "Admin Telegram ID" },
    ];

    for (const { key, label } of required) {
        if (!process.env[key] || process.env[key].trim() === "") {
            errors.push(`Missing ${key} (${label})`);
        }
    }

    // Warn (not error) for optional but important vars
    const warnings = [];
    if (!process.env.N8N_USER) warnings.push("N8N_USER not set — n8n API auth may fail");
    if (!process.env.N8N_PASS) warnings.push("N8N_PASS not set — n8n API auth may fail");

    return { errors, warnings };
}

module.exports = {
    validateWorkflow,
    validateWorkflows,
    validateExecution,
    validateExecutions,
    validateEnv,
};
