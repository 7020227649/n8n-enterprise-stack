
const { Markup } = require("telegraf");

const PAGE_SIZE = 8;

/**
 * Build a paginated inline keyboard from a list of items.
 *
 * @param {Array} items - Array of { label: string, callbackData: string }
 * @param {number} page - Current page (0-indexed)
 * @param {string} navPrefix - Callback prefix for page navigation (e.g. "wf_page")
 * @returns {{ keyboard: object, pageInfo: string }} Markup + "Page X/Y" text
 */
function buildPagedKeyboard(items, page, navPrefix) {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));

    const start = safePage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, items.length);
    const pageItems = items.slice(start, end);

    // Item buttons (one per row)
    const buttons = pageItems.map(item => [
        Markup.button.callback(item.label, item.callbackData)
    ]);

    // Navigation row (only if more than one page)
    if (totalPages > 1) {
        const navRow = [];

        if (safePage > 0) {
            navRow.push(Markup.button.callback("◀️ Prev", `${navPrefix}_${safePage - 1}`));
        }

        navRow.push(Markup.button.callback(`${safePage + 1}/${totalPages}`, `${navPrefix}_noop`));

        if (safePage < totalPages - 1) {
            navRow.push(Markup.button.callback("Next ▶️", `${navPrefix}_${safePage + 1}`));
        }

        buttons.push(navRow);
    }

    return {
        keyboard: Markup.inlineKeyboard(buttons),
        pageInfo: items.length > PAGE_SIZE ? ` (page ${safePage + 1}/${totalPages})` : "",
        totalPages,
        currentPage: safePage,
    };
}

/**
 * Extract page number from a navigation callback.
 * Returns -1 for noop/invalid.
 */
function extractPage(callbackData, navPrefix) {
    const match = callbackData.match(new RegExp(`^${navPrefix}_(\\d+)$`));
    return match ? parseInt(match[1], 10) : -1;
}

module.exports = { buildPagedKeyboard, extractPage, PAGE_SIZE };
