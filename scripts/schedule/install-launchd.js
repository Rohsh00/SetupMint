import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

async function installLaunchd() {
  console.log('\n======================================================');
  console.log('⏰ SetupMint macOS LaunchAgent Scheduler Installer');
  console.log('======================================================\n');

  if (process.platform !== 'darwin') {
    console.error('❌ LaunchAgents are only supported on macOS.');
    console.log('For Linux, see docs/BACKUP_AND_RESTORE.md for standard systemd / cron examples.');
    process.exit(1);
  }

  const templatePath = path.join(__dirname, 'com.setupmint.backup.plist');
  const targetDir = path.join(os.homedir(), 'Library/LaunchAgents');
  const targetPlist = path.join(targetDir, 'com.setupmint.backup.plist');
  const nodePath = process.execPath;

  console.log(`- Node Executable: ${nodePath}`);
  console.log(`- Repo Working Dir: ${REPO_ROOT}`);
  console.log(`- Target Agent Plist: ${targetPlist}`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Create log directory
  const logDir = path.join(REPO_ROOT, 'backups/logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  }

  let content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replaceAll('{{NODE_PATH}}', nodePath);
  content = content.replaceAll('{{REPO_ROOT}}', REPO_ROOT);

  // Unload previous agent if currently active
  try {
    execSync(`launchctl unload "${targetPlist}" 2>/dev/null`);
  } catch {
    // Ignored
  }

  fs.writeFileSync(targetPlist, content, 'utf-8');
  console.log('✓ Plist written to ~/Library/LaunchAgents/com.setupmint.backup.plist');

  // Load new agent
  try {
    execSync(`launchctl load "${targetPlist}"`);
    console.log('✓ LaunchAgent loaded successfully with launchctl.');
  } catch (err) {
    console.error(`❌ Failed to load LaunchAgent: ${err.message}`);
    process.exit(1);
  }

  // Verify registration
  try {
    const listOutput = execSync(`launchctl list | grep setupmint || true`).toString();
    console.log(`\nActive status:\n${listOutput || '(com.setupmint.backup registered, awaiting scheduled trigger)'}`);
  } catch {
    // Ignored
  }

  console.log(`\n======================================================`);
  console.log('✅ Automated nightly backups scheduled successfully!');
  console.log('Trigger: Nightly at 02:30 AM (local time)');
  console.log('Logs: backups/logs/backup.log');
  console.log('Uninstall anytime with: npm run backup:schedule:uninstall');
  console.log('======================================================\n');
}

installLaunchd().catch((err) => {
  console.error('Installation error:', err.message);
  process.exit(1);
});
