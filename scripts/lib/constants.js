/**
 * SetupMint Backup Pipeline — Canonical Constants
 *
 * Defines the complete registry of MongoDB collections from apps/api/src/db/models/index.ts
 * and explicit exclusion rules.
 */

export const CANONICAL_COLLECTIONS = [
  'users',
  'tradingaccounts',
  'accounttransactions',
  'instruments',
  'strategies',
  'trades',
  'dailyjournals',
  'attachments',
  'auditlogs',
  'brokerintegrations',
  'brokerfundssnapshots',
  'brokerimportmappings',
  'tradetemplates',
  'tradecandlesnapshots',
  'marketdataintegrations',
  'angeloneinstruments',
  'holidaycalendars',
  'commoditymasters',
  'weeklyreviews',
];

/**
 * Collections explicitly excluded from backup archives:
 * - 'sessions': Ephemeral user login sessions (30-day sliding cookies), pointless to restore
 *   and containing hashed session tokens.
 */
export const EXCLUDED_COLLECTIONS = ['sessions'];

/**
 * Critical collections monitored for anomaly detection (suspicious drop checks).
 */
export const ANOMALY_CHECKED_COLLECTIONS = [
  'trades',
  'attachments',
  'accounttransactions',
  'tradingaccounts',
];

export const BACKUP_FORMAT_VERSION = 1;
export const MAGIC_BYTES = 'SMENC'; // 5 bytes magic header
