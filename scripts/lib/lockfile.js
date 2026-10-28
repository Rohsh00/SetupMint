import fs from 'fs';
import path from 'path';

export const DEFAULT_MAX_LOCK_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Acquires an exclusive file lock, reclaiming stale locks older than maxAgeMs.
 *
 * @param {string} lockFilePath - Absolute path to lock file
 * @param {number} [maxAgeMs=10800000] - Max age before reclaiming stale lock (3 hours default)
 * @returns {{ acquired: boolean, lockPath: string, pid: number }}
 */
export function acquireLock(lockFilePath, maxAgeMs = DEFAULT_MAX_LOCK_AGE_MS) {
  const dir = path.dirname(lockFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(lockFilePath)) {
    let stat;
    try {
      stat = fs.statSync(lockFilePath);
    } catch {
      // race condition or unreadable
    }

    const now = Date.now();
    const lockAge = stat ? now - stat.mtimeMs : 0;

    let lockContent = null;
    try {
      lockContent = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'));
    } catch {
      // Ignored
    }

    if (lockAge > maxAgeMs) {
      console.warn(
        `[Lock Warning] Reclaiming stale lock file at "${lockFilePath}" (age: ${Math.round(
          lockAge / 60000
        )} mins > ${Math.round(maxAgeMs / 60000)} mins max).`
      );
      try {
        fs.unlinkSync(lockFilePath);
      } catch {
        // Ignored
      }
    } else {
      const pidInfo = lockContent?.pid ? ` (PID ${lockContent.pid})` : '';
      const acquiredAt = lockContent?.acquiredAt ? ` at ${lockContent.acquiredAt}` : '';
      throw new Error(
        `Concurrent backup operation in progress${pidInfo}${acquiredAt}. Lock file exists at "${lockFilePath}". Exiting to prevent corruption.`
      );
    }
  }

  const payload = {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
  };

  fs.writeFileSync(lockFilePath, JSON.stringify(payload, null, 2), {
    mode: 0o600,
    flag: 'wx', // Exclusive create
  });

  return {
    acquired: true,
    lockPath: lockFilePath,
    pid: process.pid,
  };
}

/**
 * Releases the file lock safely.
 */
export function releaseLock(lockFilePath) {
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
      return true;
    }
  } catch (err) {
    console.warn(`[Lock Warning] Failed to delete lock file "${lockFilePath}": ${err.message}`);
  }
  return false;
}
