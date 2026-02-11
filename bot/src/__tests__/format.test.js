
const {
    escapeHtml,
    statusEmoji,
    executionStatusEmoji,
    formatDuration,
    truncate,
    formatWorkflowCard,
    formatExecutionCard,
    formatStatsTable,
    formatAlertMessage,
} = require("../utils/format");

// ─── escapeHtml ──────────────────────────────────────

describe("escapeHtml", () => {
    test("escapes & < >", () => {
        expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    });

    test("returns empty string for null/undefined", () => {
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
    });

    test("converts numbers to string", () => {
        expect(escapeHtml(42)).toBe("42");
    });

    test("leaves safe text unchanged", () => {
        expect(escapeHtml("hello world")).toBe("hello world");
    });
});

// ─── statusEmoji ─────────────────────────────────────

describe("statusEmoji", () => {
    test("returns green for active", () => {
        expect(statusEmoji(true)).toBe("🟢");
    });

    test("returns red for inactive", () => {
        expect(statusEmoji(false)).toBe("🔴");
    });

    test("returns red for falsy", () => {
        expect(statusEmoji(null)).toBe("🔴");
        expect(statusEmoji(0)).toBe("🔴");
    });
});

// ─── executionStatusEmoji ────────────────────────────

describe("executionStatusEmoji", () => {
    test("maps known statuses", () => {
        expect(executionStatusEmoji("success")).toBe("✅");
        expect(executionStatusEmoji("error")).toBe("❌");
        expect(executionStatusEmoji("running")).toBe("⏳");
        expect(executionStatusEmoji("waiting")).toBe("⏸");
    });

    test("returns ❓ for unknown", () => {
        expect(executionStatusEmoji("xyz")).toBe("❓");
        expect(executionStatusEmoji(undefined)).toBe("❓");
    });
});

// ─── formatDuration ──────────────────────────────────

describe("formatDuration", () => {
    test("returns N/A for invalid input", () => {
        expect(formatDuration(null)).toBe("N/A");
        expect(formatDuration(-1)).toBe("N/A");
        expect(formatDuration(0)).toBe("N/A");
    });

    test("formats milliseconds", () => {
        expect(formatDuration(500)).toBe("500ms");
    });

    test("formats seconds", () => {
        expect(formatDuration(2500)).toBe("2.5s");
    });

    test("formats minutes", () => {
        expect(formatDuration(120000)).toBe("2.0m");
    });
});

// ─── truncate ────────────────────────────────────────

describe("truncate", () => {
    test("returns text under limit unchanged", () => {
        expect(truncate("short", 100)).toBe("short");
    });

    test("truncates long text with ellipsis", () => {
        const long = "a".repeat(200);
        const result = truncate(long, 50);
        expect(result.length).toBe(50);
        expect(result.endsWith("...")).toBe(true);
    });

    test("handles null/undefined", () => {
        expect(truncate(null)).toBe("");
        expect(truncate(undefined)).toBe("");
    });
});

// ─── formatWorkflowCard ──────────────────────────────

describe("formatWorkflowCard", () => {
    test("formats a workflow with all fields", () => {
        const wf = {
            id: "abc123",
            name: "Test Workflow",
            active: true,
            nodes: [{}, {}, {}],
            updatedAt: "2024-01-01T00:00:00Z",
        };
        const card = formatWorkflowCard(wf);
        expect(card).toContain("🟢");
        expect(card).toContain("Test Workflow");
        expect(card).toContain("abc123");
        expect(card).toContain("Nodes: 3");
    });

    test("handles workflow with HTML in name", () => {
        const wf = { id: "1", name: "<script>alert</script>", active: false, nodes: [] };
        const card = formatWorkflowCard(wf);
        expect(card).toContain("&lt;script&gt;");
        expect(card).not.toContain("<script>");
    });
});

// ─── formatStatsTable ────────────────────────────────

describe("formatStatsTable", () => {
    test("formats stats correctly", () => {
        const stats = {
            total: 100,
            success: 90,
            failed: 10,
            successRate: "90.0",
            failRate: "10.0",
            avgDuration: 5000,
            period: "last 100 executions",
        };
        const table = formatStatsTable(stats);
        expect(table).toContain("Total: <b>100</b>");
        expect(table).toContain("Success: <b>90</b>");
        expect(table).toContain("Failed: <b>10</b>");
    });
});

// ─── formatAlertMessage ──────────────────────────────

describe("formatAlertMessage", () => {
    test("formats a failure alert", () => {
        const payload = {
            workflow: { id: "wf1", name: "My Workflow" },
            error: { message: "Connection timeout" },
        };
        const msg = formatAlertMessage(payload);
        expect(msg).toContain("WORKFLOW FAILURE ALERT");
        expect(msg).toContain("My Workflow");
        expect(msg).toContain("Connection timeout");
    });

    test("handles missing workflow data", () => {
        const payload = { message: "Something failed" };
        const msg = formatAlertMessage(payload);
        expect(msg).toContain("Unknown");
        expect(msg).toContain("Something failed");
    });
});
