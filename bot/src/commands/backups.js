
const n8nApi = require("../services/n8nApi");
const backupService = require("../services/backupService");
const { escapeHtml, statusEmoji } = require("../utils/format");
const { buildPagedKeyboard } = require("../utils/pagination");
const { Markup } = require("telegraf");

module.exports = (bot) => {

  // ─── /backup_all — Full backup of all workflows ─────

  bot.command("backup_all", async (ctx) => {
    try {
      await ctx.reply("📦 Generating full workflow backup...");

      const { chunks, count } = await backupService.exportAll();

      for (let i = 0; i < chunks.length; i++) {
        const label = chunks.length > 1 ? ` (part ${i + 1}/${chunks.length})` : "";
        await ctx.replyWithDocument(
          { source: chunks[i], filename: `workflows_backup${label}.zip` }
        );
      }

      backupService.rotateBackups();
      await ctx.reply(
        `✅ <b>Backup Complete</b>\n├ Workflows: ${count}\n├ Parts: ${chunks.length}\n└ Time: ${new Date().toLocaleString()}`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await ctx.reply(`❌ Backup failed: ${err.message}`);
    }
  });

  // ─── /backup_workflow — Single workflow backup ──────

  bot.command("backup_workflow", async (ctx) => {
    try {
      const workflows = await n8nApi.getAllWorkflows();

      if (!workflows || workflows.length === 0) {
        return ctx.reply("📭 No workflows found.");
      }

      const items = workflows.map(wf => ({
        label: `${statusEmoji(wf.active)} ${wf.name}`,
        callbackData: `bk_single_${wf.id}`
      }));
      const { keyboard, pageInfo } = buildPagedKeyboard(items, 0, "bkwf_pg");

      await ctx.reply(
        `💾 <b>Backup Single Workflow</b>${pageInfo}\n\nSelect workflow:`,
        { parse_mode: "HTML", ...keyboard }
      );
    } catch (err) {
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  bot.action(/^bkwf_pg_(\d+)$/, async (ctx) => {
    try {
      const page = parseInt(ctx.match[1], 10);
      const workflows = await n8nApi.getAllWorkflows();
      const items = workflows.map(wf => ({
        label: `${statusEmoji(wf.active)} ${wf.name}`,
        callbackData: `bk_single_${wf.id}`
      }));
      const { keyboard, pageInfo } = buildPagedKeyboard(items, page, "bkwf_pg");
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `💾 <b>Backup Single Workflow</b>${pageInfo}\n\nSelect workflow:`,
        { parse_mode: "HTML", ...keyboard }
      );
    } catch (err) { await ctx.answerCbQuery("Error"); }
  });
  bot.action("bkwf_pg_noop", (ctx) => ctx.answerCbQuery());

  bot.action(/^bk_single_(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await ctx.answerCbQuery("Backing up...");
      await ctx.reply("📦 Exporting workflow...");

      const { chunks, workflow } = await backupService.exportSingleWorkflow(id);

      for (let i = 0; i < chunks.length; i++) {
        const label = chunks.length > 1 ? ` (part ${i + 1}/${chunks.length})` : "";
        await ctx.replyWithDocument(
          { source: chunks[i], filename: `${workflow.name}_backup${label}.zip` }
        );
      }

      await ctx.reply(
        `✅ <b>Workflow Backup Complete</b>\n├ Name: ${escapeHtml(workflow.name)}\n└ Time: ${new Date().toLocaleString()}`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await ctx.reply(`❌ Backup failed: ${err.message}`);
    }
  });

  // ─── /daily_backup_on — Enable daily auto backup ────

  bot.command("daily_backup_on", async (ctx) => {
    try {
      backupService.setupDailyCron(bot, ctx.chat.id);
      await ctx.reply(
        `✅ <b>Daily Backup Enabled</b>\n├ Schedule: Every day at 03:00\n├ Chat: This chat\n└ Status: Active`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  // ─── /daily_backup_off — Disable daily auto backup ──

  bot.command("daily_backup_off", async (ctx) => {
    try {
      backupService.cancelDailyCron();
      await ctx.reply(
        `⏸ <b>Daily Backup Disabled</b>\n└ Auto-backups are now off.`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  });

  // ─── /daily_backup_status — Show daily backup state ──

  bot.command("daily_backup_status", async (ctx) => {
    try {
      const status = backupService.getDailyBackupStatus();
      const enabledText = status.enabled ? "🟢 Enabled" : "🔴 Disabled";
      const lastRun = status.lastRun
        ? new Date(status.lastRun).toLocaleString()
        : "Never";

      await ctx.reply(
        `📅 <b>Daily Backup Status</b>\n├ Status: ${enabledText}\n├ Schedule: 03:00 daily\n└ Last Run: ${lastRun}`,
        { parse_mode: "HTML" }
      );
    } catch (err) {
      await ctx.reply(`❌ Error: ${err.message}`);
    }
  });



  // ─── /backup_system — Full system backup ─────────────

  bot.command("backup_system", async (ctx) => {
    // Only admin
    if (ctx.from.id.toString() !== config.adminId) {
      return ctx.reply("⛔ Admin only.");
    }

    try {
      await ctx.reply("📦 <b>Starting Full System Backup...</b>\n\n1. Stopping n8n & Database...\n2. Compressing volumes...\n3. Bundling config files...", { parse_mode: "HTML" });

      const systemService = require("../services/systemService");
      const { chunks, name } = await systemService.backupSystem();

      await ctx.reply(`✅ Backup created: <code>${name}</code>\n📦 Sending ${chunks.length} part(s)...`, { parse_mode: "HTML" });

      for (let i = 0; i < chunks.length; i++) {
        const label = chunks.length > 1 ? ` (Part ${i + 1}/${chunks.length})` : "";
        await ctx.replyWithDocument(
          { source: chunks[i], filename: `${name}${chunks.length > 1 ? `.part${i + 1}` : ''}` }
        );
      }

      await ctx.reply("✅ <b>System Backup Complete!</b>\n\n⚠️ Keep these files safe. To restore, use /restore_system.", { parse_mode: "HTML" });

    } catch (err) {
      await ctx.reply(`❌ System backup failed: ${err.message}`);
    }
  });

};
