#!/usr/bin/env node
/**
 * Restore data/*.json from a snapshot in data/backups/<timestamp>/.
 *
 * Usage:
 *   node scripts/restore-backup.js            # list available backups (read-only)
 *   node scripts/restore-backup.js --list      # same
 *   node scripts/restore-backup.js latest      # restore the newest backup
 *   node scripts/restore-backup.js <timestamp> # restore a specific one
 *
 * Before overwriting anything, the CURRENT data/*.json files are themselves
 * snapshotted into data/backups/pre-restore-<now>/ — so a bad restore is
 * itself undoable. Never restarts the app; do that manually afterward.
 */
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(d => { try { return fs.statSync(path.join(BACKUP_DIR, d)).isDirectory(); } catch { return false; } })
    .sort();
}

function copyJsonFiles(srcDir, destDir) {
  let count = 0;
  for (const f of fs.readdirSync(srcDir)) {
    if (!f.endsWith('.json')) continue;
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
    count++;
  }
  return count;
}

function main() {
  const arg = process.argv[2];
  const backups = listBackups();

  if (!arg || arg === '--list') {
    console.log(`${backups.length} backup(s) available in data/backups/:\n`);
    backups.forEach(b => console.log('  ' + b));
    console.log('\nUsage: node scripts/restore-backup.js <timestamp>|latest');
    return;
  }

  if (backups.length === 0) {
    console.error('No backups found in data/backups/.');
    process.exit(1);
  }

  const target = arg === 'latest' ? backups[backups.length - 1] : arg;
  if (!backups.includes(target)) {
    console.error(`Backup "${target}" not found. Run with --list to see available backups.`);
    process.exit(1);
  }

  const srcDir = path.join(BACKUP_DIR, target);

  // Safety net: snapshot current state before overwriting, so this is never destructive.
  const preStamp = 'pre-restore-' + new Date().toISOString().replace(/[:.]/g, '-');
  const preDir   = path.join(BACKUP_DIR, preStamp);
  fs.mkdirSync(preDir, { recursive: true });
  const preCount = copyJsonFiles(DATA_DIR, preDir);
  console.log(`💾 Safety snapshot of current data saved → data/backups/${preStamp} (${preCount} files)`);

  const restoredCount = copyJsonFiles(srcDir, DATA_DIR);
  console.log(`✅ Restored ${restoredCount} file(s) from data/backups/${target}`);
  console.log(`⚠️  Restart the app to pick up the restored data: pm2 restart jayden-barbershop`);
}

main();
