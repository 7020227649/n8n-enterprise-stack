
const config = require("../config");

/**
 * Admin-only middleware.
 * Rejects any message not from the configured ADMIN_ID.
 */
module.exports = (ctx, next) => {
    try {
        const userId = String(ctx.from?.id);
        const adminId = String(config.adminId);

        if (userId !== adminId) {
            console.warn(`[Admin Middleware] blocked access from user ID: ${userId} (expected: ${adminId})`);
            // Reply so the user knows they are blocked
            if (ctx.message && ctx.message.text && ctx.message.text.startsWith("/")) {
                ctx.reply(`⛔ <b>Access Denied</b>\n\nYour Telegram ID <code>${userId}</code> is not authorized.\nPlease update <code>ADMIN_ID</code> in your .env file.`, { parse_mode: "HTML" });
            }
            return;
        }

        return next();
    } catch (err) {
        console.error("Admin middleware error:", err);
        return next();
    }
};
