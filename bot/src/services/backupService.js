
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const cron = require("node-cron");
const n8nApi = require("./n8nApi");
const config = require("../config");
const state = require("../utils/state");

const BASE_DIR = config.paths.backups;
const MAX_BACKUPS = config.limits.maxBackups;
const MAX_CHUNK_SIZE = config.limits.maxChunkSizeMB * 1024 * 1024;

let cronJob = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function rotateBackups() {
  if (!fs.existsSync(BASE_DIR)) return;

  const dirs = fs.readdirSync(BASE_DIR)
    .filter(name => fs.statSync(path.join(BASE_DIR, name)).isDirectory())
    .map(name => ({
      name,
      time: fs.statSync(path.join(BASE_DIR, name)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (dirs.length <= MAX_BACKUPS) return;

  dirs.slice(MAX_BACKUPS).forEach(dir => {
    fs.rmSync(path.join(BASE_DIR, dir.name), { recursive: true, force: true });
  });
}

async function exportAll() {
  ensureDir(BASE_DIR);
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(BASE_DIR, date);
  ensureDir(dir);

  const workflows = await n8nApi.getAllWorkflows();
  const jsonPath = path.join(dir, "workflows.json");

  fs.writeFileSync(jsonPath, JSON.stringify(workflows, null, 2));

  const zipPath = path.join(dir, "workflows.zip");
  await createZip(zipPath, [{ filePath: jsonPath, name: "workflows.json" }]);

  const chunks = splitIntoChunks(zipPath);

  return { zipPath, chunks, count: workflows.length };
}

async function exportSingleWorkflow(id) {
  ensureDir(BASE_DIR);
  const wf = await n8nApi.getWorkflow(id);
  const date = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = wf.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(BASE_DIR, `${safeName}_${date}`);
  ensureDir(dir);

  const jsonPath = path.join(dir, `${safeName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(wf, null, 2));

  const zipPath = path.join(dir, `${safeName}.zip`);
  await createZip(zipPath, [{ filePath: jsonPath, name: `${safeName}.json` }]);

  const chunks = splitIntoChunks(zipPath);

  return { zipPath, chunks, workflow: wf };
}

function createZip(zipPath, files) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    files.forEach(f => archive.file(f.filePath, { name: f.name }));
    archive.finalize();
  });
}

function splitIntoChunks(zipPath) {
  const stats = fs.statSync(zipPath);

  if (stats.size <= MAX_CHUNK_SIZE) {
    return [zipPath];
  }

  const chunks = [];
  const buffer = fs.readFileSync(zipPath);
  let offset = 0;
  let part = 1;

  while (offset < buffer.length) {
    const end = Math.min(offset + MAX_CHUNK_SIZE, buffer.length);
    const chunkPath = `${zipPath}.part${part}`;
    fs.writeFileSync(chunkPath, buffer.slice(offset, end));
    chunks.push(chunkPath);
    offset = end;
    part++;
  }

  return chunks;
}

// ─── Daily Backup Cron ────────────────────────────────

function setupDailyCron(bot, chatId) {
  cancelDailyCron();

  cronJob = cron.schedule(config.limits.dailyBackupCron, async () => {
    try {
      const { zipPath, chunks, count } = await exportAll();

      for (const chunk of chunks) {
        await bot.telegram.sendDocument(chatId, { source: chunk });
      }

      await bot.telegram.sendMessage(
        chatId,
        `📦 <b>Daily Backup Complete</b>\n├ Workflows: ${count}\n└ Time: ${new Date().toLocaleString()}`,
        { parse_mode: "HTML" }
      );

      rotateBackups();

      // Update state with last run time
      state.update("dailyBackup", (db) => ({
        ...db,
        lastRun: new Date().toISOString()
      }));
    } catch (err) {
      console.error("Daily backup failed:", err.message);
      try {
        await bot.telegram.sendMessage(chatId, `❌ Daily backup failed: ${err.message}`);
      } catch (_) { }
    }
  });

  state.set("dailyBackup", { enabled: true, chatId, lastRun: state.get("dailyBackup")?.lastRun || null });
}

function cancelDailyCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  const current = state.get("dailyBackup") || {};
  state.set("dailyBackup", { ...current, enabled: false });
}

function getDailyBackupStatus() {
  return state.get("dailyBackup") || { enabled: false, chatId: null, lastRun: null };
}

module.exports = {
  exportAll,
  exportSingleWorkflow,
  rotateBackups,
  splitIntoChunks,
  setupDailyCron,
  cancelDailyCron,
  getDailyBackupStatus
};
