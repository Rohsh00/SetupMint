/**
 * SetupMint Backup Pipeline — Retention Policy Calculator
 *
 * Pure function to calculate which backup keys should be deleted and kept according to
 * the 30-daily + 12-monthly retention rule with a minimum keep safety invariant.
 */

const TIMESTAMP_REGEX = /setupmint-backup-(\d{4}-\d{2}-\d{2}T\d{2}[-_]\d{2}[-_]\d{2}(?:[-_]\d{3})?Z)/;

/**
 * Parses timestamp from a backup file key.
 * Returns null for unparseable keys.
 */
export function parseKeyTimestamp(key) {
  if (!key || typeof key !== 'string') return null;
  const match = key.match(TIMESTAMP_REGEX);
  if (!match || !match[1]) return null;

  // Reconstruct standard ISO-8601 string: 2026-10-28T02-30-00-000Z -> 2026-10-28T02:30:00.000Z
  const raw = match[1];
  const parts = raw.split('T');
  if (parts.length !== 2) return null;

  const datePart = parts[0];
  const timeWithZ = parts[1].replace(/Z$/, '');
  const timeTokens = timeWithZ.split(/[-_]/);

  if (timeTokens.length < 3) return null;
  const hours = timeTokens[0];
  const minutes = timeTokens[1];
  const seconds = timeTokens[2];
  const millis = timeTokens[3] || '000';

  const iso = `${datePart}T${hours}:${minutes}:${seconds}.${millis}Z`;
  const time = Date.parse(iso);
  if (isNaN(time)) return null;
  return new Date(time);
}

/**
 * Pure function: calculates which keys to delete from off-site storage.
 *
 * @param {Object} options
 * @param {string[]} [options.dailyKeys] - List of S3 keys in the daily/ prefix
 * @param {string[]} [options.monthlyKeys] - List of S3 keys in the monthly/ prefix
 * @param {number} [options.retainDaily=30] - Number of daily backups to preserve
 * @param {number} [options.retainMonthly=12] - Number of monthly backups to preserve
 * @param {number} [options.minKeep=3] - Minimum total backups to always preserve regardless of settings
 * @param {Date} [options.now=new Date()]
 * @returns {{ deleteDailyKeys: string[], deleteMonthlyKeys: string[], allDeleteKeys: string[], keepDailyKeys: string[], keepMonthlyKeys: string[] }}
 */
export function calculateRetentionDeletions(options = {}) {
  const {
    dailyKeys = [],
    monthlyKeys = [],
    retainDaily = 30,
    retainMonthly = 12,
    minKeep = 3,
  } = options;

  function processKeys(keys, retainLimit) {
    const parseable = [];
    const unparseable = [];

    for (const key of keys) {
      const dt = parseKeyTimestamp(key);
      if (dt) {
        parseable.push({ key, time: dt.getTime() });
      } else {
        unparseable.push(key);
      }
    }

    // Sort newest first
    parseable.sort((a, b) => b.time - a.time);

    const keep = parseable.slice(0, retainLimit).map((p) => p.key).concat(unparseable);
    const toDelete = parseable.slice(retainLimit).map((p) => p.key);

    return { keep, toDelete };
  }

  const dailyResult = processKeys(dailyKeys, retainDaily);
  const monthlyResult = processKeys(monthlyKeys, retainMonthly);

  let keepDaily = [...dailyResult.keep];
  let deleteDaily = [...dailyResult.toDelete];
  let keepMonthly = [...monthlyResult.keep];
  let deleteMonthly = [...monthlyResult.toDelete];

  // Invariant safety guard: Never let total backups drop below minKeep
  let totalKept = keepDaily.length + keepMonthly.length;

  while (totalKept < minKeep && (deleteDaily.length > 0 || deleteMonthly.length > 0)) {
    // Rescue most recent deleted items
    if (deleteDaily.length > 0) {
      const rescued = deleteDaily.shift();
      keepDaily.push(rescued);
      totalKept++;
    } else if (deleteMonthly.length > 0) {
      const rescued = deleteMonthly.shift();
      keepMonthly.push(rescued);
      totalKept++;
    }
  }

  return {
    deleteDailyKeys: deleteDaily,
    deleteMonthlyKeys: deleteMonthly,
    allDeleteKeys: [...deleteDaily, ...deleteMonthly],
    keepDailyKeys: keepDaily,
    keepMonthlyKeys: keepMonthly,
  };
}
