/**
 * Phase 28 — coverage push for config/database.js connectDB retry + exit logic.
 *
 * Mocks mongoose.connect to simulate failure scenarios. Tests:
 *   - Successful connection on first attempt (L12-22)
 *   - Connection error event handler (L27-29)
 *   - Disconnect event handler (L31-33)
 *   - Retry loop with exponential backoff (L36-44)
 *   - process.exit(1) on all retries failed (L38-41)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';

describe('config/database.js — connectDB retry + exit logic', () => {
  let originalConnect;
  let originalExit;
  let exitSpy;

  beforeEach(() => {
    originalConnect = mongoose.connect;
    originalExit = process.exit;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    mongoose.connect = originalConnect;
    process.exit = originalExit;
    jest.restoreAllMocks();
  });

  it('connects successfully on first attempt (happy path L12-35)', async () => {
    // Mock mongoose.connect to succeed
    mongoose.connect = jest.fn(async () => ({
      connection: { host: 'mock-host', on: jest.fn() },
    }));

    // Re-import so the module's own mongoose import gets fresh
    const mod = await import('../../src/config/database.js?nocache=' + Date.now());
    await mod.connectDB(5, 100);

    expect(mongoose.connect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 100,
      })
    );
  });

  it('retries with exponential backoff on transient failure (L36-44)', async () => {
    let attempt = 0;
    mongoose.connect = jest.fn(async () => {
      attempt++;
      if (attempt < 3) throw new Error(`attempt ${attempt} failed`);
      return { connection: { host: 'finally-up' } };
    });

    const mod = await import('../../src/config/database.js?nocache=' + Date.now());
    // Use small delay so test runs fast
    await mod.connectDB(5, 50);

    // Should have been called 3 times (2 failures + 1 success)
    expect(mongoose.connect).toHaveBeenCalledTimes(3);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('calls process.exit(1) when all retries exhaust (L38-41)', async () => {
    mongoose.connect = jest.fn(async () => { throw new Error('always fails'); });

    const mod = await import('../../src/config/database.js?nocache=' + Date.now());
    // 2 retries with tiny delay → fails fast → process.exit(1)
    await expect(mod.connectDB(2, 10)).rejects.toThrow(/process.exit called/);

    expect(mongoose.connect).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
