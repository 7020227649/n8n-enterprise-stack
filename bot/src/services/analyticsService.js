
const n8nApi = require("./n8nApi");
const { formatDuration } = require("../utils/format");
const config = require("../config");

const FETCH_LIMIT = config.limits.executionFetchLimit;

/**
 * Get execution stats for a single workflow.
 */
async function getWorkflowStats(workflowId) {
    const execData = await n8nApi.getExecutions({
        workflowId,
        limit: FETCH_LIMIT
    });

    const executions = execData.data || [];
    return computeStats(executions);
}

/**
 * Get global execution stats across all workflows.
 */
async function getGlobalStats() {
    const execData = await n8nApi.getExecutions({ limit: FETCH_LIMIT });
    const executions = execData.data || [];
    return computeStats(executions);
}

/**
 * Compute stats from an array of executions.
 */
function computeStats(executions) {
    const total = executions.length;

    if (total === 0) {
        return {
            total: 0,
            success: 0,
            failed: 0,
            successRate: "0",
            failRate: "0",
            avgDuration: 0,
            period: `last ${FETCH_LIMIT} executions`
        };
    }

    let success = 0;
    let failed = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const exec of executions) {
        const status = exec.status || (exec.finished ? "success" : "error");
        if (status === "success") {
            success++;
        } else {
            failed++;
        }

        if (exec.startedAt && exec.stoppedAt) {
            const duration = new Date(exec.stoppedAt) - new Date(exec.startedAt);
            if (duration > 0) {
                totalDuration += duration;
                durationCount++;
            }
        }
    }

    return {
        total,
        success,
        failed,
        successRate: ((success / total) * 100).toFixed(1),
        failRate: ((failed / total) * 100).toFixed(1),
        avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        period: `last ${total} executions`
    };
}

/**
 * Get top workflows by execution count.
 */
async function getTopWorkflows(limit = 10) {
    const execData = await n8nApi.getExecutions({ limit: FETCH_LIMIT });
    const executions = execData.data || [];

    // Count executions per workflow
    const counts = {};
    for (const exec of executions) {
        const wfId = exec.workflowId || exec.workflowData?.id || "unknown";
        const wfName = exec.workflowData?.name || wfId;

        if (!counts[wfId]) {
            counts[wfId] = { id: wfId, name: wfName, count: 0, success: 0, failed: 0 };
        }
        counts[wfId].count++;

        const status = exec.status || (exec.finished ? "success" : "error");
        if (status === "success") {
            counts[wfId].success++;
        } else {
            counts[wfId].failed++;
        }
    }

    return Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

/**
 * Get recent failed executions.
 */
async function getRecentFailures(limit = 10) {
    const execData = await n8nApi.getExecutions({ status: "error", limit });
    return execData.data || [];
}

/**
 * Get recent executions (all statuses).
 */
async function getRecentExecutions(limit = 10) {
    const execData = await n8nApi.getExecutions({ limit });
    return execData.data || [];
}

module.exports = {
    getWorkflowStats,
    getGlobalStats,
    getTopWorkflows,
    getRecentFailures,
    getRecentExecutions
};
