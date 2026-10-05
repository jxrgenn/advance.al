import logger from '../config/logger.js';

// Indexes that were removed from the schemas but still exist on deployed
// databases: Mongoose autoIndex creates missing indexes, it never drops them.
export const LEGACY_INDEXES = [
  // TTL index created by `expires: 604800` on refreshTokens[].createdAt.
  // MongoDB TTL deletes the WHOLE users document once the oldest date in the
  // array is 7 days old, so any account with one stale refresh token vanished.
  { collection: 'users', name: 'refreshTokens.createdAt_1' },
];

const ALREADY_GONE = new Set(['IndexNotFound', 'NamespaceNotFound']);

export async function dropLegacyIndexes(connection) {
  const db = connection?.db;
  if (!db) return [];

  const dropped = [];
  for (const { collection, name } of LEGACY_INDEXES) {
    try {
      await db.collection(collection).dropIndex(name);
      dropped.push(`${collection}.${name}`);
      logger.warn(`Dropped legacy index ${collection}.${name}`);
    } catch (error) {
      if (ALREADY_GONE.has(error.codeName)) continue;
      logger.error(`Failed to drop legacy index ${collection}.${name}: ${error.message}`);
    }
  }
  return dropped;
}
