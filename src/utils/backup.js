/**
 * Periodic snapshot backups of the JSON database.
 *
 * Copies every data/*.json into data/backups/<timestamp>/ on startup and then
 * once a day. Keeps the most recent MAX_BACKUPS folders. Because each run makes
 * a NEW timestamped folder, a restart after a bad wipe adds one empty snapshot
 * but never destroys the earlier good ones — there is always a restore point.
 */
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 60;

function runBackup() {
  try {
    if (!fs.existsSync(DATA_DIR)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest  = path.join(BACKUP_DIR, stamp);
    fs.mkdirSync(dest, { recursive: true });

    let count = 0;
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.endsWith('.json')) continue;          // skips .bak/.tmp and the backups dir
      fs.copyFileSync(path.join(DATA_DIR, f), path.join(dest, f));
      count++;
    }
    prune();
    console.log(`💾 Backup saved → data/backups/${stamp} (${count} files)`);
  } catch (e) {
    console.error('⚠️  Backup failed:', e.message);
  }
}

function prune() {
  try {
    const dirs = fs.readdirSync(BACKUP_DIR)
      .map(d => path.join(BACKUP_DIR, d))
      .filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
      .sort();                                     // ISO timestamps sort chronologically
    while (dirs.length > MAX_BACKUPS) {
      const old = dirs.shift();
      fs.rmSync(old, { recursive: true, force: true });
    }
  } catch (_) { /* best-effort */ }
}

/** Run a backup now, then every 24h. */
function startBackupScheduler() {
  runBackup();
  setInterval(runBackup, 24 * 60 * 60 * 1000);
}

module.exports = { runBackup, startBackupScheduler };
