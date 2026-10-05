/**
 * Hotfix 2026-10-05:
 *  1. The `expires` TTL on User.refreshTokens[].createdAt made MongoDB delete
 *     whole user documents 7 days after their oldest refresh token. The schema
 *     no longer declares it and dropLegacyIndexes() removes the index from
 *     databases that already have it.
 *  2. The QuickUser/Job email regex backtracked exponentially (ReDoS). All
 *     email schemas now share lib/emailFormat.js.
 *
 * Uses its own mongod with ttlMonitorSleepSecs=1 so the TTL monitor actually
 * runs during the test (default is every 60 s).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import QuickUser from '../../src/models/QuickUser.js';
import Job from '../../src/models/Job.js';
import { isEmailFormat, emailFormatValidator, MAX_EMAIL_LENGTH } from '../../src/lib/emailFormat.js';
import { dropLegacyIndexes } from '../../src/lib/dropLegacyIndexes.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('isEmailFormat / emailFormatValidator', () => {
  it('accepts ordinary addresses, including plus-tags and subdomains', () => {
    expect(isEmailFormat('ana.kola@company.al')).toBe(true);
    expect(isEmailFormat('ana+jobs@mail.company.co.uk')).toBe(true);
    expect(isEmailFormat('a-b_c@x.io')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isEmailFormat('no-at-sign.al')).toBe(false);
    expect(isEmailFormat('a@b')).toBe(false);
    expect(isEmailFormat('a b@x.al')).toBe(false);
    expect(isEmailFormat('a@x.c')).toBe(false);
    expect(isEmailFormat('a@@x.al')).toBe(false);
    expect(isEmailFormat(42)).toBe(false);
    expect(isEmailFormat(null)).toBe(false);
  });

  it('enforces the 254-character RFC 5321 cap', () => {
    const domain = '@company.al';
    const atLimit = 'a'.repeat(MAX_EMAIL_LENGTH - domain.length) + domain;
    expect(atLimit.length).toBe(254);
    expect(isEmailFormat(atLimit)).toBe(true);
    expect(isEmailFormat('a' + atLimit)).toBe(false);
  });

  it('validator lets empty values through like Mongoose `match` (required is separate)', () => {
    expect(emailFormatValidator(undefined)).toBe(true);
    expect(emailFormatValidator(null)).toBe(true);
    expect(emailFormatValidator('')).toBe(true);
    expect(emailFormatValidator('bad')).toBe(false);
  });

  it('former ReDoS payload validates in bounded time on every email schema', () => {
    // 'a'x60 + '+x' took minutes with the old /^\w+([\.-]?\w+)*@.../ pattern
    // (≈4x slower per 2 extra chars; 26 chars already took ~1 s).
    const payload = 'a'.repeat(60) + '+x@company.al';

    let started = Date.now();
    const quick = new QuickUser({
      firstName: 'Ana', lastName: 'Kola', email: payload, location: 'Tiranë', interests: ['Teknologji'],
    });
    expect(quick.validateSync()?.errors?.email).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(200);

    started = Date.now();
    const job = new Job({ contactOverrides: { email: payload } });
    expect(job.validateSync()?.errors?.['contactOverrides.email']).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(200);

    started = Date.now();
    const user = new User({ email: payload, password: 'QaPass!2345', userType: 'jobseeker' });
    expect(user.validateSync()?.errors?.email).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('schemas still reject invalid emails with their Albanian messages', () => {
    const quick = new QuickUser({ firstName: 'A', lastName: 'B', email: 'not-an-email', location: 'Tiranë' });
    expect(quick.validateSync().errors.email.message).toBe('Email i pavlefshëm');

    const job = new Job({ contactOverrides: { email: 'not-an-email' } });
    expect(job.validateSync().errors['contactOverrides.email'].message).toBe('Email i pavlefshëm');

    const user = new User({ email: 'not-an-email', password: 'QaPass!2345', userType: 'jobseeker' });
    expect(user.validateSync().errors.email.message).toBe('Ju lutemi vendosni një email të vlefshëm');
  });
});

describe('legacy refreshTokens TTL index', () => {
  let mongod;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    mongod = await MongoMemoryServer.create({
      binary: { version: '6.0.0' },
      instance: { args: ['--setParameter', 'ttlMonitorSleepSecs=1'] },
    });
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop({ doCleanup: true, force: true });
  });

  it('schema no longer creates a TTL index on users', async () => {
    await User.init();
    const ttl = (await User.collection.indexes()).filter((i) => i.expireAfterSeconds !== undefined);
    expect(ttl).toEqual([]);
  });

  it('drops the index from a database created by the old schema, idempotently, and users survive', async () => {
    // Production state: the index the old schema created.
    await User.collection.createIndex(
      { 'refreshTokens.createdAt': 1 },
      { name: 'refreshTokens.createdAt_1', expireAfterSeconds: 604800 },
    );
    expect((await User.collection.indexes()).map((i) => i.name)).toContain('refreshTokens.createdAt_1');

    expect(await dropLegacyIndexes(mongoose.connection)).toEqual(['users.refreshTokens.createdAt_1']);
    expect((await User.collection.indexes()).map((i) => i.name)).not.toContain('refreshTokens.createdAt_1');
    expect(await dropLegacyIndexes(mongoose.connection)).toEqual([]);

    // A user whose only refresh token is 8 days old (logged in once, then idle).
    const idle = await User.create({
      email: 'idle@example.com', password: 'QaPass!2345', userType: 'jobseeker',
      profile: { firstName: 'Ana', lastName: 'Kola', location: { city: 'Tiranë' }, jobSeekerProfile: {} },
    });
    await idle.addRefreshToken('tok-idle');
    await User.collection.updateOne(
      { _id: idle._id },
      { $set: { 'refreshTokens.0.createdAt': new Date(Date.now() - 8 * DAY_MS) } },
    );

    // Positive control: prove the TTL monitor really runs in this window.
    const control = mongoose.connection.db.collection('ttl_control');
    await control.createIndex({ at: 1 }, { expireAfterSeconds: 1 });
    await control.insertOne({ at: new Date(Date.now() - DAY_MS) });

    for (let i = 0; i < 20 && (await control.countDocuments()) > 0; i++) await sleep(500);
    expect(await control.countDocuments()).toBe(0);
    await sleep(2500); // at least two more monitor passes

    const survivor = await User.collection.findOne({ _id: idle._id });
    expect(survivor.email).toBe('idle@example.com');
    expect(survivor.refreshTokens).toHaveLength(1);
  });

  it('does nothing without a connected database', async () => {
    expect(await dropLegacyIndexes(undefined)).toEqual([]);
    expect(await dropLegacyIndexes({ db: undefined })).toEqual([]);
  });
});
