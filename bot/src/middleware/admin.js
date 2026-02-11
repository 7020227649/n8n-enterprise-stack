
const config = require("../config");

/**
 * Admin-only middleware.
 * Rejects any message not from the configured ADMIN_ID.
 */
function adminOnly(ctx, next) {
    const userId = ctx.from?.id;
    const adminId = config.adminId;

    if (!userId || !adminId || String(userId) !== String(adminId)) {
        return ctx.reply("⛔ Unauthorized. This bot is admin-only.");
    }

    return next();
}

module.exports = adminOnly;
