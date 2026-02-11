
// Mock n8nApi before requiring analyticsService
jest.mock("../services/n8nApi", () => ({
    getExecutions: jest.fn(),
}));

const n8nApi = require("../services/n8nApi");
const analyticsService = require("../services/analyticsService");

describe("analyticsService", () => {

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getWorkflowStats", () => {
        test("computes stats from executions", async () => {
            n8nApi.getExecutions.mockResolvedValue({
                data: [
                    { id: "1", status: "success", startedAt: "2024-01-01T00:00:00Z", stoppedAt: "2024-01-01T00:00:02Z" },
                    { id: "2", status: "success", startedAt: "2024-01-01T00:00:00Z", stoppedAt: "2024-01-01T00:00:03Z" },
                    { id: "3", status: "error", startedAt: "2024-01-01T00:00:00Z", stoppedAt: "2024-01-01T00:00:01Z" },
                ],
            });

            const stats = await analyticsService.getWorkflowStats("wf1");
            expect(stats.total).toBe(3);
            expect(stats.success).toBe(2);
            expect(stats.failed).toBe(1);
            expect(stats.successRate).toBe("66.7");
            expect(stats.avgDuration).toBeGreaterThan(0);
        });

        test("handles empty executions", async () => {
            n8nApi.getExecutions.mockResolvedValue({ data: [] });

            const stats = await analyticsService.getWorkflowStats("wf1");
            expect(stats.total).toBe(0);
            expect(stats.success).toBe(0);
            expect(stats.failed).toBe(0);
            expect(stats.successRate).toBe("0");
        });
    });

    describe("getGlobalStats", () => {
        test("fetches global stats", async () => {
            n8nApi.getExecutions.mockResolvedValue({
                data: [
                    { id: "1", status: "success" },
                    { id: "2", status: "error" },
                ],
            });

            const stats = await analyticsService.getGlobalStats();
            expect(stats.total).toBe(2);
            expect(stats.success).toBe(1);
            expect(stats.failed).toBe(1);
        });
    });

    describe("getTopWorkflows", () => {
        test("ranks workflows by execution count", async () => {
            n8nApi.getExecutions.mockResolvedValue({
                data: [
                    { id: "1", workflowId: "wf1", workflowData: { name: "Wf One" }, status: "success" },
                    { id: "2", workflowId: "wf1", workflowData: { name: "Wf One" }, status: "success" },
                    { id: "3", workflowId: "wf2", workflowData: { name: "Wf Two" }, status: "error" },
                ],
            });

            const top = await analyticsService.getTopWorkflows(10);
            expect(top).toHaveLength(2);
            expect(top[0].name).toBe("Wf One");
            expect(top[0].count).toBe(2);
            expect(top[1].name).toBe("Wf Two");
            expect(top[1].count).toBe(1);
        });
    });

    describe("getRecentFailures", () => {
        test("returns failure executions", async () => {
            n8nApi.getExecutions.mockResolvedValue({
                data: [
                    { id: "1", status: "error", workflowId: "wf1" },
                ],
            });

            const failures = await analyticsService.getRecentFailures(5);
            expect(failures).toHaveLength(1);
            expect(failures[0].status).toBe("error");
        });
    });

    describe("getRecentExecutions", () => {
        test("returns recent executions", async () => {
            n8nApi.getExecutions.mockResolvedValue({
                data: [
                    { id: "1", status: "success" },
                    { id: "2", status: "error" },
                ],
            });

            const recent = await analyticsService.getRecentExecutions(10);
            expect(recent).toHaveLength(2);
        });
    });
});
