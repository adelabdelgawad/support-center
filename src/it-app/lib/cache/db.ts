/**
 * IndexedDB Wrapper - Schema Versioning & Connection Management
 *
 * Handles database opening, schema upgrades, and connection lifecycle
 * for the WhatsApp-style local cache system.
 *
 * @module cache/db
 * @version 3.0.0
 */

import { openDB, IDBPDatabase } from 'idb';
import { DB_NAME_PREFIX, DB_VERSION, STORE_NAMES } from './schemas';
import type { DBSchema } from './schemas';

// Re-export types for use in other modules
export type { IDBPDatabase };
export type { DBSchema };

let dbInstance: IDBPDatabase<DBSchema> | null = null;

/**
 * Get the database name for the current user
 * @param userId - User ID to scope the database
 * @returns Database name in format: `${DB_NAME_PREFIX}-${userId}`
 */
export function getDBName(userId: string): string {
  return `${DB_NAME_PREFIX}-${userId}`;
}

/**
 * Open the IndexedDB database with schema versioning
 *
 * Creates all required object stores with indexes and handles
 * schema upgrades from version 1 → 3.
 *
 * @param userId - User ID to scope the database
 * @returns Promise resolving to the database instance
 */
export async function openCacheDB(userId: string): Promise<IDBPDatabase<DBSchema>> {
  const dbName = getDBName(userId);

  // Return existing instance if already open for this user
  if (dbInstance && dbInstance.name === dbName) {
    return dbInstance;
  }

  dbInstance = await openDB<DBSchema>(dbName, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`[Cache] Upgrading database from version ${oldVersion} to ${newVersion}`);

      // Version 1-2 stores (already exist in some apps)
      if (!db.objectStoreNames.contains(STORE_NAMES.MESSAGES)) {
        const messagesStore = db.createObjectStore(STORE_NAMES.MESSAGES, { keyPath: 'id' });
        messagesStore.createIndex('by_request', 'requestId');
        messagesStore.createIndex('by_request_sequence', ['requestId', 'sequenceNumber'], { unique: true });
        messagesStore.createIndex('by_cached_at', '_cachedAt');
        console.log(`[Cache] Created object store: ${STORE_NAMES.MESSAGES}`);
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.CHAT_META)) {
        const chatMetaStore = db.createObjectStore(STORE_NAMES.CHAT_META, { keyPath: 'requestId' });
        chatMetaStore.createIndex('by_last_accessed', 'lastAccessedAt');
        console.log(`[Cache] Created object store: ${STORE_NAMES.CHAT_META}`);
      }

      // Version 3 stores (new for cache feature)
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORE_NAMES.MEDIA_META)) {
          const mediaMeta = db.createObjectStore(STORE_NAMES.MEDIA_META, { keyPath: 'id' });
          mediaMeta.createIndex('by_request', 'requestId');
          mediaMeta.createIndex('by_last_accessed', 'lastAccessedAt');
          mediaMeta.createIndex('by_status', 'downloadStatus');
          console.log(`[Cache] Created object store: ${STORE_NAMES.MEDIA_META}`);
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.MEDIA_BLOBS)) {
          const mediaBlobs = db.createObjectStore(STORE_NAMES.MEDIA_BLOBS, { keyPath: 'key' });
          mediaBlobs.createIndex('by_last_accessed', 'lastAccessedAt');
          console.log(`[Cache] Created object store: ${STORE_NAMES.MEDIA_BLOBS}`);
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.OFFLINE_QUEUE)) {
          const offlineQueue = db.createObjectStore(STORE_NAMES.OFFLINE_QUEUE, { keyPath: 'id' });
          offlineQueue.createIndex('by_status', 'status');
          offlineQueue.createIndex('by_created', 'createdAt');
          offlineQueue.createIndex('by_next_retry', 'nextRetryAt');
          console.log(`[Cache] Created object store: ${STORE_NAMES.OFFLINE_QUEUE}`);
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.CACHE_STATS)) {
          db.createObjectStore(STORE_NAMES.CACHE_STATS, { keyPath: 'key' });
          console.log(`[Cache] Created object store: ${STORE_NAMES.CACHE_STATS}`);
        }
      }
    },
    blocked() {
      console.warn('[Cache] Database opening blocked - another tab is using it');
    },
    blocking() {
      console.warn('[Cache] Database blocking - this tab is closing the connection');
    },
  });

  console.log(`[Cache] Database opened: ${dbName} (version ${DB_VERSION})`);
  return dbInstance;
}

/**
 * Close the database connection
 *
 * Closes the current database instance. Use this when switching users
 * or cleaning up resources.
 */
export async function closeCacheDB(): Promise<void> {
  if (dbInstance) {
    const dbName = dbInstance.name;
    await dbInstance.close();
    dbInstance = null;
    console.log(`[Cache] Database closed: ${dbName}`);
  }
}

/**
 * Delete the database
 *
 * Permanently deletes the database for the specified user.
 * Use this for testing or schema migration scenarios.
 *
 * @param userId - User ID whose database should be deleted
 */
export async function deleteCacheDB(userId: string): Promise<void> {
  const dbName = getDBName(userId);
  await closeCacheDB();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);

    request.onsuccess = () => {
      console.log(`[Cache] Database deleted: ${dbName}`);
      resolve();
    };

    request.onerror = () => {
      console.error(`[Cache] Failed to delete database: ${dbName}`);
      reject(new Error(`Failed to delete database: ${dbName}`));
    };

    request.onblocked = () => {
      console.warn(`[Cache] Database deletion blocked - close other tabs first: ${dbName}`);
    };
  });
}

/**
 * Check if a database exists for the given user
 * @param userId - User ID to check
 * @returns Promise resolving to true if database exists
 */
export async function databaseExists(userId: string): Promise<boolean> {
  const dbName = getDBName(userId);

  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);

    request.onsuccess = () => {
      request.result.close();
      resolve(true);
    };

    request.onerror = () => {
      resolve(false);
    };

    request.onupgradeneeded = () => {
      // Database doesn't exist yet, but will be created
      request.result.close();
      // Delete the newly created database
      indexedDB.deleteDatabase(dbName);
      resolve(false);
    };
  });
}

/**
 * Get the current database instance
 * @returns The current database instance or null if not open
 */
export function getDBInstance(): IDBPDatabase<DBSchema> | null {
  return dbInstance;
}

/**
 * Check if the database is open
 * @returns True if database instance exists
 */
export function isDBOpen(): boolean {
  return dbInstance !== null;
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  return 'indexedDB' in window;
}

/**
 * T057: Check if the database schema version matches the expected version
 *
 * Compares the stored schema version (if any) with the current DB_VERSION constant.
 * If they don't match, the cache should be cleared and rebuilt.
 *
 * This should be called on app startup to ensure compatibility.
 *
 * @param userId - User ID to check the database for
 * @returns Promise resolving to true if schema version matches, false otherwise
 */
export async function checkSchemaVersion(userId: string): Promise<boolean> {
  const dbName = getDBName(userId);

  return new Promise<boolean>((resolve) => {
    const request = indexedDB.open(dbName);

    request.onsuccess = () => {
      const db = request.result;
      const currentVersion = db.version;
      db.close();

      const isCompatible = currentVersion === DB_VERSION;

      if (!isCompatible) {
        console.warn(
          `[Cache] Schema version mismatch: expected ${DB_VERSION}, got ${currentVersion}. ` +
          `Cache will be cleared and rebuilt.`
        );
      } else {
        console.log(`[Cache] Schema version check passed: ${DB_VERSION}`);
      }

      resolve(isCompatible);
    };

    request.onerror = () => {
      console.error(`[Cache] Failed to open database for version check: ${dbName}`);
      // If we can't open it, treat as incompatible (will trigger rebuild)
      resolve(false);
    };

    request.onupgradeneeded = () => {
      // Database doesn't exist or needs upgrade
      request.result.close();
      // Delete the newly created database since we were just checking
      indexedDB.deleteDatabase(dbName);
      resolve(false);
    };
  });
}

/**
 * T057: Rebuild the cache if schema version is incompatible
 *
 * This is a convenience function that combines version check and cleanup.
 * If the version doesn't match, it will delete the database and return true.
 * The caller should then reinitialize the cache.
 *
 * @param userId - User ID whose database should be checked/rebuilt
 * @returns Promise resolving to true if database was rebuilt, false if it was compatible
 */
export async function rebuildCacheIfIncompatible(userId: string): Promise<boolean> {
  const isCompatible = await checkSchemaVersion(userId);

  if (!isCompatible) {
    console.log(`[Cache] Rebuilding cache for user: ${userId}`);
    await deleteCacheDB(userId);
    return true;
  }

  return false;
}
