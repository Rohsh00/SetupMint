import fs from 'fs';
import path from 'path';
import https from 'https';

/**
 * Appends a structured Pino-style line to the backup log files and rotates old logs (> 30 days).
 */
export function logStructured(logDir, level, message, metadata = {}) {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const logLine = JSON.stringify({
      level,
      time: now.toISOString(),
      msg: message,
      ...metadata,
    }) + '\n';

    // Append to cumulative backup.log and daily log
    const mainLog = path.join(logDir, 'backup.log');
    const dailyLog = path.join(logDir, `backup-${dateStr}.log`);

    fs.appendFileSync(mainLog, logLine, 'utf-8');
    fs.appendFileSync(dailyLog, logLine, 'utf-8');

    // Rotate daily logs: keep last 30 files
    rotateLogs(logDir, 30);
  } catch (err) {
    console.warn(`[Logger Warning] Failed to write to backup log file: ${err.message}`);
  }
}

/**
 * Rotates daily log files keeping at most maxFiles.
 */
function rotateLogs(logDir, maxFiles = 30) {
  try {
    const files = fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.log'))
      .sort();

    if (files.length > maxFiles) {
      const toDelete = files.slice(0, files.length - maxFiles);
      for (const f of toDelete) {
        try {
          fs.unlinkSync(path.join(logDir, f));
        } catch {
          // Ignored
        }
      }
    }
  } catch {
    // Ignored
  }
}

/**
 * Sends a Telegram alert notification if configured.
 * Transmits ONLY status, timestamp, uploaded key, and error message (zero user trading data).
 */
export async function sendTelegramAlert(botToken, chatId, text) {
  if (!botToken || !chatId) return false;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
    });

    req.on('error', (err) => {
      console.warn(`[Telegram Alert Warning] Notification failed: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Pluggable notification dispatcher for the backup pipeline.
 */
export async function notifyBackupEvent(options = {}) {
  const {
    logDir,
    result = 'OK', // 'OK' | 'FAILED' | 'SUSPICIOUS'
    uploadedKey,
    error,
    durationMs,
    counts = {},
    telegram = {},
  } = options;

  if (logDir) {
    const level = result === 'OK' ? 'info' : result === 'SUSPICIOUS' ? 'warn' : 'error';
    logStructured(logDir, level, `Backup completed with result: ${result}`, {
      result,
      uploadedKey,
      error,
      durationMs,
      counts,
    });
  }

  // Only send Telegram on FAILURE or SUSPICIOUS (or when specifically requested)
  if (telegram.enabled && (result === 'FAILED' || result === 'SUSPICIOUS')) {
    const icon = result === 'SUSPICIOUS' ? '⚠️' : '🚨';
    const message =
      `${icon} <b>SetupMint Backup Alert</b>\n` +
      `<b>Result:</b> ${result}\n` +
      `<b>Time:</b> ${new Date().toISOString()}\n` +
      (uploadedKey ? `<b>Uploaded Key:</b> <code>${uploadedKey}</code>\n` : '') +
      (durationMs ? `<b>Duration:</b> ${(durationMs / 1000).toFixed(1)}s\n` : '') +
      (error ? `<b>Details:</b> <i>${error}</i>\n` : '');

    await sendTelegramAlert(telegram.botToken, telegram.chatId, message);
  }
}
