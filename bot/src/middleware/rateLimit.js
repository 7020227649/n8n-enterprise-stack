
const config = require("../config");

const { maxRequests, windowMs } = config.limits.rateLimit;
const requests = new Map();

/**
 * Simple in-memory sliding-window rate limiter.
 * Caps commands per user per window.
 */
function rateLimit(ctx, next) {
    const userId = String(ctx.from?.id);
    const now = Date.now();

    if (!requests.has(userId)) {
        requests.set(userId, []);
    }

    const timestamps = requests.get(userId).filter(t => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
        return ctx.reply("⏳ Rate limit exceeded. Please wait a moment.");
    }

    timestamps.push(now);
    requests.set(userId, timestamps);

    return next();
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamps] of requests.entries()) {
        const active = timestamps.filter(t => now - t < windowMs);
        if (active.length === 0) {
            requests.delete(userId);
        } else {
            requests.set(userId, active);
        }
    }
}, 5 * 60 * 1000);

module.exports = rateLimit;
