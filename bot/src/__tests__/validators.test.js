
const {
    validateWorkflow,
    validateWorkflows,
    validateExecution,
    validateExecutions,
    validateEnv,
} = require("../utils/validators");

// ─── validateWorkflow ────────────────────────────────

describe("validateWorkflow", () => {
    test("validates a well-formed workflow", () => {
        const wf = { id: "abc", name: "Test", active: true, nodes: [{}, {}], connections: { a: [] } };
        const result = validateWorkflow(wf);
        expect(result.id).toBe("abc");
        expect(result.name).toBe("Test");
        expect(result.active).toBe(true);
        expect(result.nodes).toHaveLength(2);
    });

    test("returns null for null/undefined input", () => {
        expect(validateWorkflow(null)).toBeNull();
        expect(validateWorkflow(undefined)).toBeNull();
        expect(validateWorkflow("string")).toBeNull();
    });

    test("sanitizes missing fields with defaults", () => {
        const wf = { id: 42 };
        const result = validateWorkflow(wf);
        expect(result.id).toBe("42");
        expect(result.name).toBe("Workflow 42");
        expect(result.active).toBe(false);
        expect(result.nodes).toEqual([]);
        expect(result.connections).toEqual({});
    });

    test("filters workflow with null id", () => {
        const result = validateWorkflow({ name: "No ID" });
        expect(result.id).toBeNull();
    });
});

// ─── validateWorkflows ───────────────────────────────

describe("validateWorkflows", () => {
    test("validates an array of workflows", () => {
        const data = [
            { id: "1", name: "WF1", active: true },
            { id: "2", name: "WF2", active: false },
        ];
        const result = validateWorkflows(data);
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe("WF1");
    });

    test("filters out invalid entries", () => {
        const data = [
            { id: "1", name: "Valid" },
            null,
            "not an object",
            { name: "No ID" }, // id is null → filtered
        ];
        const result = validateWorkflows(data);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Valid");
    });

    test("returns empty array for null/undefined", () => {
        expect(validateWorkflows(null)).toEqual([]);
        expect(validateWorkflows(undefined)).toEqual([]);
    });
});

// ─── validateExecution ───────────────────────────────

describe("validateExecution", () => {
    test("validates a well-formed execution", () => {
        const exec = {
            id: "exec1",
            workflowId: "wf1",
            status: "success",
            finished: true,
            startedAt: "2024-01-01",
            stoppedAt: "2024-01-02",
        };
        const result = validateExecution(exec);
        expect(result.id).toBe("exec1");
        expect(result.status).toBe("success");
    });

    test("infers status from finished field", () => {
        const exec = { id: "1", finished: true };
        expect(validateExecution(exec).status).toBe("success");

        const exec2 = { id: "2", finished: false };
        expect(validateExecution(exec2).status).toBe("error");
    });

    test("returns null for invalid input", () => {
        expect(validateExecution(null)).toBeNull();
        expect(validateExecution("string")).toBeNull();
    });
});

// ─── validateExecutions ──────────────────────────────

describe("validateExecutions", () => {
    test("handles { data: [...] } format", () => {
        const response = {
            data: [
                { id: "1", status: "success" },
                { id: "2", status: "error" },
            ],
        };
        const result = validateExecutions(response);
        expect(result.data).toHaveLength(2);
    });

    test("filters malformed entries", () => {
        const response = {
            data: [{ id: "1", status: "success" }, null, { name: "no id" }],
        };
        const result = validateExecutions(response);
        expect(result.data).toHaveLength(1);
    });

    test("handles null input", () => {
        const result = validateExecutions(null);
        expect(result.data).toEqual([]);
        expect(result.nextCursor).toBeNull();
    });
});

// ─── validateEnv ─────────────────────────────────────

describe("validateEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test("reports missing BOT_TOKEN and ADMIN_ID", () => {
        delete process.env.BOT_TOKEN;
        delete process.env.ADMIN_ID;
        const { errors } = validateEnv();
        expect(errors).toHaveLength(2);
        expect(errors[0]).toContain("BOT_TOKEN");
    });

    test("reports no errors when vars are set", () => {
        process.env.BOT_TOKEN = "test-token";
        process.env.ADMIN_ID = "12345";
        const { errors } = validateEnv();
        expect(errors).toHaveLength(0);
    });

    test("warns about missing N8N_USER/N8N_PASS", () => {
        process.env.BOT_TOKEN = "test-token";
        process.env.ADMIN_ID = "12345";
        delete process.env.N8N_USER;
        delete process.env.N8N_PASS;
        const { warnings } = validateEnv();
        expect(warnings).toHaveLength(2);
    });
});
