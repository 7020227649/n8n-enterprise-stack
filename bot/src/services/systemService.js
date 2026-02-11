
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const archiver = require("archiver");
const config = require("../config");
const backupService = require("./backupService");
const restoreService = require("./restoreService");

// Path mapped from host to container, writable
const PROJECT_ROOT = "/opt/n8n-enterprise-stack";
const BACKUP_DIR = path.join(PROJECT_ROOT, "system-backups");

// Helper to run shell commands
function run(cmd, timeout = 600000) { // 10 minutes timeout
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout.trim());
        });
    });
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── BACKUP ──────────────────────────────────────────

async function backupSystem() {
    ensureDir(BACKUP_DIR);
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const tempDir = path.join(BACKUP_DIR, `temp_${date}`);
    const archiveName = `n8n-system-backup-${date}.tar.gz`;
    const archivePath = path.join(BACKUP_DIR, archiveName);

    ensureDir(tempDir);
    ensureDir(path.join(tempDir, "volumes"));

    try {
        // 1. Stop Containers (except bot/redis) to ensure consistency
        // We stop n8n and postgres
        await run("docker stop n8n-enterprise-stack-n8n-main-1 n8n-enterprise-stack-n8n-worker-1 n8n-enterprise-stack-postgres-1 2>/dev/null || true");

        // 2. Backup Config Files
        // Copy from PROJECT_ROOT (mounted) to tempDir
        if (fs.existsSync(path.join(PROJECT_ROOT, ".env"))) {
            fs.copyFileSync(path.join(PROJECT_ROOT, ".env"), path.join(tempDir, ".env"));
        }
        if (fs.existsSync(path.join(PROJECT_ROOT, "docker-compose.yml"))) {
            fs.copyFileSync(path.join(PROJECT_ROOT, "docker-compose.yml"), path.join(tempDir, "docker-compose.yml"));
        }

        // 3. Backup Volumes using temporary alpine container
        // We mount the tempDir (host path) to /backup in alpine
        const hostTempDir = path.join(PROJECT_ROOT, "system-backups", `temp_${date}`, "volumes");

        // Helper to return docker run command
        const backupVol = (volName, fileName) => {
            return `docker run --rm -v "${volName}":/volume -v "${hostTempDir}":/backup alpine tar czf /backup/${fileName} -C /volume .`;
        };

        // Detect project prefix (usually n8n-enterprise-stack)
        const projectPrefix = "n8n-enterprise-stack";

        // Run backup commands
        await run(backupVol(`${projectPrefix}_postgres_data`, "postgres_data.tar.gz"));
        await run(backupVol(`${projectPrefix}_n8n_data`, "n8n_data.tar.gz"));
        await run(backupVol(`${projectPrefix}_bot_data`, "bot_data.tar.gz"));

        // 4. Create Final Archive
        // Tar the tempDir content into archivePath
        await createTar(archivePath, tempDir);

        // 5. Restart Containers
        await run("docker start n8n-enterprise-stack-postgres-1");
        // Wait a bit for DB
        await new Promise(r => setTimeout(r, 5000));
        await run("docker start n8n-enterprise-stack-n8n-main-1 n8n-enterprise-stack-n8n-worker-1");

        // 6. Split into chunks (using backupService logic)
        // Set chunk size to 45MB (Telegram limit is 50MB)
        const chunks = splitFile(archivePath, 45 * 1024 * 1024);

        // Cleanup temp dir
        fs.rmSync(tempDir, { recursive: true, force: true });

        return { archivePath, chunks, name: archiveName };

    } catch (err) {
        // Try to restart if failed
        await run("docker start n8n-enterprise-stack-postgres-1 n8n-enterprise-stack-n8n-main-1 n8n-enterprise-stack-n8n-worker-1 2>/dev/null || true");
        throw err;
    }
}

// ─── RESTORE ──────────────────────────────────────────

async function restoreSystem(chunkPaths) {
    ensureDir(BACKUP_DIR);
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    const restoreDir = path.join(BACKUP_DIR, `restore_${date}`);
    const archivePath = path.join(restoreDir, "full_backup.tar.gz");

    ensureDir(restoreDir);

    try {
        // 1. Reassemble chunks
        const buffer = restoreService.reassembleChunks(chunkPaths.map(p => fs.readFileSync(p)));
        fs.writeFileSync(archivePath, buffer);

        // 2. Extract Archive
        await run(`tar xzf "${archivePath}" -C "${restoreDir}"`);

        // 3. Stop Everything (except bot/redis)
        await run("docker stop n8n-enterprise-stack-n8n-main-1 n8n-enterprise-stack-n8n-worker-1 n8n-enterprise-stack-postgres-1 2>/dev/null || true");

        // 4. Restore Config
        if (fs.existsSync(path.join(restoreDir, ".env"))) {
            fs.copyFileSync(path.join(restoreDir, ".env"), path.join(PROJECT_ROOT, ".env"));
        }
        if (fs.existsSync(path.join(restoreDir, "docker-compose.yml"))) {
            fs.copyFileSync(path.join(restoreDir, "docker-compose.yml"), path.join(PROJECT_ROOT, "docker-compose.yml"));
        }

        // 5. Restore Volumes
        const hostRestoreDir = path.join(PROJECT_ROOT, "system-backups", `restore_${date}`, "volumes");
        const projectPrefix = "n8n-enterprise-stack";

        const restoreVol = (volName, fileName) => {
            // Check if file exists
            if (!fs.existsSync(path.join(restoreDir, "volumes", fileName))) return Promise.resolve();

            // Recreate volume (wipes it effectively if we overwrite?) No, tar overwrite.
            // But to be safe we should maybe empty it?
            // "docker run ... alpine sh -c 'rm -rf /volume/* && tar ...'"
            return run(`docker run --rm -v "${volName}":/volume -v "${hostRestoreDir}":/backup alpine sh -c "rm -rf /volume/* && tar xzf /backup/${fileName} -C /volume"`);
        };

        await restoreVol(`${projectPrefix}_postgres_data`, "postgres_data.tar.gz");
        await restoreVol(`${projectPrefix}_n8n_data`, "n8n_data.tar.gz");
        await restoreVol(`${projectPrefix}_bot_data`, "bot_data.tar.gz");

        // 6. Restart
        await run("docker start n8n-enterprise-stack-postgres-1");
        await new Promise(r => setTimeout(r, 5000));
        await run("docker start n8n-enterprise-stack-n8n-main-1 n8n-enterprise-stack-n8n-worker-1");

        // Cleanup
        fs.rmSync(restoreDir, { recursive: true, force: true });

        return true;

    } catch (err) {
        // Try to restart
        await run("docker start n8n-enterprise-stack-postgres-1 n8n-enterprise-stack-n8n-main-1 n8n-enterprise-stack-n8n-worker-1 2>/dev/null || true");
        throw err;
    }
}

// ─── HELPERS ──────────────────────────────────────────

function createTar(archivePath, sourceDir) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archivePath);
        const archive = archiver("tar", { gzip: true });

        output.on("close", resolve);
        archive.on("error", reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

function splitFile(filePath, chunkSize) {
    const stats = fs.statSync(filePath);
    if (stats.size <= chunkSize) return [filePath];

    const chunks = [];
    const buffer = fs.readFileSync(filePath);
    let offset = 0;
    let part = 1;

    while (offset < buffer.length) {
        const end = Math.min(offset + chunkSize, buffer.length);
        const chunkPath = `${filePath}.part${part}`;
        fs.writeFileSync(chunkPath, buffer.slice(offset, end));
        chunks.push(chunkPath);
        offset = end;
        part++;
    }
    return chunks;
}

module.exports = {
    backupSystem,
    restoreSystem
};
