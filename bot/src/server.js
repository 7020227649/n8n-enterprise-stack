
const express = require("express");
const alertService = require("./services/alertService");

const app = express();
app.use(express.json());

/**
 * Initialize the internal webhook server.
 * Accepts bot instance to forward alerts.
 */
module.exports = (bot) => {

  // ─── Health Check ───────────────────────────────────
  app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // ─── Failure Webhook (n8n error trigger → Telegram) ──
  app.post("/internal/failure", async (req, res) => {
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

  // ─── Start Server ──────────────────────────────────
  app.listen(3001, () => {
    console.log("📡 Internal webhook server running on port 3001");
  });
};
