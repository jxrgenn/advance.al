/**
 * Test Database Utilities
 *
 * Manages MongoDB Memory Server for isolated testing
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer;

/**
 * Connect to in-memory MongoDB for testing.
 *
 * Phase 28 fix (B-016): if a previous mongoServer is still alive (e.g.,
 * a test file forgot afterAll(closeTestDB)), explicitly stop it first
 * before creating a new one. Otherwise the previous server becomes
 * orphaned in memory, and after enough test files we either OOM or get
 * cross-suite Mongoose connection state leaks (B-017/B-018 symptoms).
 */
export async function connectTestDB() {
  try {
    // Close any existing Mongoose connection
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (e) {
        console.warn('Mongoose disconnect (pre-connect) warning:', e.message);
      }
    }

    // Stop any previous MongoMemoryServer instance before overwriting the ref.
    // Without this, prior instances accumulate in memory and their state can
    // leak across test files when run with --runInBand.
    if (mongoServer) {
      try {
        await mongoServer.stop({ doCleanup: true, force: true });
      } catch (e) {
        console.warn('Previous mongoServer stop warning:', e.message);
      }
      mongoServer = null;
    }

    // Create new MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create({
      binary: {
        version: '6.0.0',
      },
    });

    const uri = mongoServer.getUri();

    // Connect to the in-memory database (deprecated options removed)
    await mongoose.connect(uri);

    console.log('✅ Test database connected:', uri);

    return uri;
  } catch (error) {
    console.error('❌ Test database connection error:', error);
    throw error;
  }
}

/**
 * Close test database connection and stop server
 */
export async function closeTestDB() {
  try {
    // Drop database
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
    }

    // Disconnect mongoose
    await mongoose.disconnect();

    // Stop MongoDB Memory Server
    if (mongoServer) {
      await mongoServer.stop();
    }

    console.log('🗑️  Test database closed');
  } catch (error) {
    console.error('❌ Error closing test database:', error);
    throw error;
  }
}

/**
 * Clear all collections in test database
 */
export async function clearTestDB() {
  try {
    const collections = mongoose.connection.collections;

    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }

    console.log('🧹 Test database cleared');
  } catch (error) {
    console.error('❌ Error clearing test database:', error);
    throw error;
  }
}

/**
 * Drop test database entirely
 */
export async function dropTestDB() {
  try {
    await mongoose.connection.dropDatabase();
    console.log('💥 Test database dropped');
  } catch (error) {
    console.error('❌ Error dropping test database:', error);
    throw error;
  }
}

/**
 * Get connection state
 */
export function getConnectionState() {
  return mongoose.connection.readyState;
}

/**
 * Check if connected
 */
export function isConnected() {
  return mongoose.connection.readyState === 1;
}

export default {
  connectTestDB,
  closeTestDB,
  clearTestDB,
  dropTestDB,
  getConnectionState,
  isConnected,
};
