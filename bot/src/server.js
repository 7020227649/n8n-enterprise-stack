
const express = require("express");
const crypto = require("crypto");
const config = require("./config");
const alertService = require("./services/alertService");

const app = express();

// ─── Security: Body size limit ──────────────────────
app.use(express.json({ limit: config.limits.maxBodySize || "1mb" }));

// ─── Security: Disable server fingerprinting ────────
app.disable("x-powered-by");

// ─── Security: Security headers ─────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Cache-Control", "no-store");
  next();
});

// ─── Security: Webhook HMAC verification ────────────
function verifyWebhookSecret(req, res, next) {
  const secret = config.webhookSecret;

  // If WEBHOOK_SECRET is not set, allow internal docker-network requests only
  if (!process.env.WEBHOOK_SECRET) {
    // Only allow connections from internal Docker network (172.x.x.x, 10.x.x.x)
    const ip = req.ip || req.connection?.remoteAddress || "";
    const isInternal =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("172.") ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.includes("::ffff:172.") ||
      ip.includes("::ffff:10.") ||
      ip.includes("::ffff:192.168.") ||
      ip.includes("::ffff:127.0.0.1");

    if (!isInternal) {
      console.warn(`🚫 Webhook blocked from external IP: ${ip}`);
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  }

  // HMAC signature verification
  const signature = req.headers["x-webhook-signature"];
  if (!signature) {
    console.warn("🚫 Webhook rejected: Missing signature header");
    return res.status(401).json({ error: "Missing signature" });
  }

  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "utf-8");
  const expBuf = Buffer.from(expected, "utf-8");

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn("🚫 Webhook rejected: Invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}

/**
 * Initialize the internal webhook server.
 * Accepts bot instance to forward alerts.
 */
module.exports = (bot) => {

  // ─── Health Check (no auth needed) ─────────────────
  app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // ─── Failure Webhook (secured) ─────────────────────
  app.post("/internal/failure", verifyWebhookSecret, async (req, res) => {
    const payload = req.body;

    console.log("Failure webhook received:", payload.workflow?.name || "unknown");

    // Validate payload
    if (!payload || (!payload.workflow && !payload.message)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    try {
      const sent = await alertService.sendAlert(bot, payload);
      res.json({ received: true, alertSent: sent });
    } catch (err) {
      console.error("Alert processing error:", err.message);
      res.status(500).json({ error: "Alert processing failed" });
    }
  });

  // ─── Catch-all: reject unknown routes ──────────────
  app.all("*", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // ─── Start Server (bind to 0.0.0.0 inside container,
  //      but Docker network isolates it) ──────────────
  app.listen(3001, "0.0.0.0", () => {
    console.log("📡 Internal webhook server running on port 3001 (secured)");
    if (process.env.WEBHOOK_SECRET) {
      console.log("🔒 Webhook HMAC signature verification enabled");
    } else {
      console.log("🔒 Webhook IP-based filtering enabled (internal network only)");
    }
  });
};
