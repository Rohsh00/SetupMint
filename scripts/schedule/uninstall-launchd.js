import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

async function uninstallLaunchd() {
  console.log('\n======================================================');
  console.log('⏰ SetupMint macOS LaunchAgent Scheduler Uninstaller');
  console.log('======================================================\n');

  if (process.platform !== 'darwin') {
    console.error('LaunchAgents are only supported on macOS.');
    process.exit(1);
  }

  const targetPlist = path.join(os.homedir(), 'Library/LaunchAgents/com.setupmint.backup.plist');

  if (fs.existsSync(targetPlist)) {
    try {
      execSync(`launchctl unload "${targetPlist}" 2>/dev/null`);
      console.log('✓ LaunchAgent unloaded from launchctl.');
    } catch {
      // Ignored
    }

    try {
      fs.unlinkSync(targetPlist);
      console.log('✓ Removed ~/Library/LaunchAgents/com.setupmint.backup.plist');
    } catch (err) {
      console.warn(`Warning: Could not remove plist: ${err.message}`);
    }
  } else {
    console.log('LaunchAgent plist not found. Nothing to uninstall.');
  }

  console.log('\n✅ LaunchAgent uninstalled successfully.\n');
}

uninstallLaunchd().catch((err) => {
  console.error('Uninstall error:', err.message);
  process.exit(1);
});
