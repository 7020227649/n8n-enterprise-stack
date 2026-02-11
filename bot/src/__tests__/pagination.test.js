
const { buildPagedKeyboard, extractPage, PAGE_SIZE } = require("../utils/pagination");

describe("buildPagedKeyboard", () => {
    function makeItems(n) {
        return Array.from({ length: n }, (_, i) => ({
            label: `Item ${i + 1}`,
            callbackData: `item_${i}`,
        }));
    }

    test("returns all items when under PAGE_SIZE", () => {
        const items = makeItems(5);
        const result = buildPagedKeyboard(items, 0, "test_pg");
        expect(result.totalPages).toBe(1);
        expect(result.currentPage).toBe(0);
        expect(result.pageInfo).toBe(""); // No page info for single page
    });

    test("paginates items exceeding PAGE_SIZE", () => {
        const items = makeItems(20);
        const result = buildPagedKeyboard(items, 0, "test_pg");
        expect(result.totalPages).toBe(Math.ceil(20 / PAGE_SIZE));
        expect(result.currentPage).toBe(0);
        expect(result.pageInfo).toContain("page 1");
    });

    test("shows correct page info on page 2", () => {
        const items = makeItems(20);
        const result = buildPagedKeyboard(items, 1, "test_pg");
        expect(result.currentPage).toBe(1);
        expect(result.pageInfo).toContain("page 2");
    });

    test("clamps out-of-range page numbers", () => {
        const items = makeItems(5);
        const result = buildPagedKeyboard(items, 999, "test_pg");
        expect(result.currentPage).toBe(0); // Only 1 page, clamped to 0
    });

    test("handles negative page numbers", () => {
        const items = makeItems(5);
        const result = buildPagedKeyboard(items, -5, "test_pg");
        expect(result.currentPage).toBe(0);
    });

    test("handles empty items array", () => {
        const result = buildPagedKeyboard([], 0, "test_pg");
        expect(result.totalPages).toBe(1);
        expect(result.currentPage).toBe(0);
    });

    test("PAGE_SIZE is 8", () => {
        expect(PAGE_SIZE).toBe(8);
    });
});

describe("extractPage", () => {
    test("extracts page number from callback data", () => {
        expect(extractPage("test_pg_3", "test_pg")).toBe(3);
        expect(extractPage("test_pg_0", "test_pg")).toBe(0);
    });

    test("returns -1 for noop", () => {
        expect(extractPage("test_pg_noop", "test_pg")).toBe(-1);
    });

    test("returns -1 for invalid format", () => {
        expect(extractPage("unrelated_data", "test_pg")).toBe(-1);
        expect(extractPage("test_pg_abc", "test_pg")).toBe(-1);
    });
});
