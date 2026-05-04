/**
 * Mongoose connect shim for real-E2E test backend.
 *
 * The production database.js connects with options (`compressors: ['zstd','snappy']`,
 * `w:'majority'`, `minPoolSize: 20`) that don't work with mongodb-memory-server.
 * This module monkey-patches mongoose.connect to strip those options when
 * MONGO_TEST_MODE=true is set, so the test backend can connect cleanly.
 *
 * Loaded via: node --import ./mongoose-shim.mjs server.js
 */

import mongoose from 'mongoose';

if (process.env.MONGO_TEST_MODE === 'true') {
  const origConnect = mongoose.connect.bind(mongoose);
  mongoose.connect = (uri, opts = {}, ...rest) => {
    // Strip options that fight with memory-server / single-node replSet
    const cleaned = { ...opts };
    delete cleaned.compressors;
    delete cleaned.minPoolSize;
    delete cleaned.maxPoolSize;
    delete cleaned.maxIdleTimeMS;
    delete cleaned.w;
    cleaned.serverSelectionTimeoutMS = 30000;
    cleaned.socketTimeoutMS = 90000;
    cleaned.heartbeatFrequencyMS = 30000;
    return origConnect(uri, cleaned, ...rest);
  };
  process.stdout.write('[test-shim] mongoose.connect patched for memory-server\n');
}
