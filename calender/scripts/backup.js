/**
 * Backup script for JSON data files.
 * Run: node scripts/backup.js   or  npm run backup
 * Copies database.json, events.json, reports.json, announcements.json, password_reset_tokens.json
 * into a timestamped folder under BACKUP_DIR (default: backups).
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const backupDir = process.env.BACKUP_DIR || 'backups';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const targetDir = path.join(projectRoot, backupDir, timestamp);

const files = [
    'database.json',
    'events.json',
    'reports.json',
    'announcements.json',
    'password_reset_tokens.json'
];

if (!fs.existsSync(path.join(projectRoot, backupDir))) {
    fs.mkdirSync(path.join(projectRoot, backupDir), { recursive: true });
}
fs.mkdirSync(targetDir, { recursive: true });

let copied = 0;
files.forEach(file => {
    const src = path.join(projectRoot, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(targetDir, file));
        copied++;
        console.log('Backed up:', file);
    }
});

console.log(`Backup complete: ${copied} file(s) -> ${targetDir}`);
