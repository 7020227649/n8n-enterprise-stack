
const fs = require("fs");
const path = require("path");
const n8nApi = require("./n8nApi");
const state = require("../utils/state");
const config = require("../config");

const RESTORE_DIR = path.join(config.paths.backups, "_restores");

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Parse a workflow file buffer (JSON or ZIP containing JSON).
 * Returns an array of workflow objects.
 */
async function parseWorkflowFile(buffer, filename) {
    if (filename.endsWith(".json")) {
        const text = buffer.toString("utf-8");
        const parsed = JSON.parse(text);
        // Handle both single workflow and array of workflows
        return Array.isArray(parsed) ? parsed : [parsed];
    }

    if (filename.endsWith(".zip")) {
        const unzipper = require("unzipper");

        const workflows = [];
        const directory = await unzipper.Open.buffer(buffer);

        for (const file of directory.files) {
            if (file.path.endsWith(".json")) {
                const content = await file.buffer();
                const parsed = JSON.parse(content.toString("utf-8"));
                if (Array.isArray(parsed)) {
                    workflows.push(...parsed);
                } else {
                    workflows.push(parsed);
                }
            }
        }

        return workflows;
    }

    throw new Error("Unsupported file format. Send a .json or .zip file.");
}

/**
 * Format a preview message for a workflow before import.
 */
function previewWorkflow(wf) {
    const { escapeHtml } = require("../utils/format");
    const name = escapeHtml(wf.name || "Unnamed");
    const nodes = wf.nodes?.length || 0;
    const connections = Object.keys(wf.connections || {}).length;

    return [
        `📋 <b>Restore Preview</b>`,
        ``,
        `├ Name: <b>${name}</b>`,
        `├ Nodes: ${nodes}`,
        `├ Connections: ${connections}`,
        `├ Import as: <b>INACTIVE</b>`,
        `└ Mode: <b>NEW COPY</b> (never overwrites)`,
    ].join("\n");
}

/**
 * Import a workflow as a new, inactive copy.
 * Never overwrites existing workflows.
 */
async function importWorkflow(wfData) {
    // Strip ID to force creation as new
    const cleanData = { ...wfData };
    delete cleanData.id;
    cleanData.active = false;
    cleanData.name = `[Restored] ${cleanData.name || "Unnamed"}`;

    const result = await n8nApi.createWorkflow(cleanData);

    // Log to restore history
    const history = state.get("restoreHistory") || [];
    history.unshift({
        workflowName: cleanData.name,
        newId: result.id,
        restoredAt: new Date().toISOString(),
        status: "success"
    });

    // Keep only last 20 entries
    if (history.length > 20) history.length = 20;
    state.set("restoreHistory", history);

    return result;
}

/**
 * Reassemble multi-part chunks into a single buffer.
 */
function reassembleChunks(chunkBuffers) {
    return Buffer.concat(chunkBuffers);
}

/**
 * Save an uploaded file to the restore directory.
 */
function saveUploadedFile(buffer, filename) {
    ensureDir(RESTORE_DIR);
    const filePath = path.join(RESTORE_DIR, `${Date.now()}_${filename}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

/**
 * Get restore history.
 */
function getRestoreHistory(limit = 10) {
    const history = state.get("restoreHistory") || [];
    return history.slice(0, limit);
}

module.exports = {
    parseWorkflowFile,
    previewWorkflow,
    importWorkflow,
    reassembleChunks,
    saveUploadedFile,
    getRestoreHistory
};
