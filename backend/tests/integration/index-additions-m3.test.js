/**
 * Lock-in tests for Round M3 Mongoose index additions.
 * Asserts the schema-level index DECLARATIONS exist — Mongo builds them
 * in the background at startup. We don't assert collection.indexes() here
 * because the in-memory test DB is rebuilt every suite.
 *
 * Each finding maps to one declared index per the audit doc
 * INDEX_AUDIT_ROUND_M.md.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { connectTestDB, closeTestDB } from '../setup/testDb.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';
import Notification from '../../src/models/Notification.js';

function hasIndex(schema, predicate) {
  return schema.indexes().some(([key, options]) => predicate(key, options || {}));
}

describe('M3 — Mongoose index additions are declared', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  it('User: emailVerificationToken sparse index', () => {
    expect(hasIndex(User.schema, (key, opts) =>
      key.emailVerificationToken === 1 && opts.sparse === true
    )).toBe(true);
  });

  it('User: passwordResetToken sparse index', () => {
    expect(hasIndex(User.schema, (key, opts) =>
      key.passwordResetToken === 1 && opts.sparse === true
    )).toBe(true);
  });

  it('Job: { paymentStatus, paymentInitiatedAt } compound for payment workers', () => {
    expect(hasIndex(Job.schema, (key) =>
      key.paymentStatus === 1 && key.paymentInitiatedAt === 1
    )).toBe(true);
  });

  it('Application: { jobSeekerId, withdrawn, appliedAt:-1 } compound for My Applications hot path', () => {
    expect(hasIndex(Application.schema, (key) =>
      key.jobSeekerId === 1 && key.withdrawn === 1 && key.appliedAt === -1
    )).toBe(true);
  });

  it('Notification: { userId, read, createdAt:-1 } compound for unread polling', () => {
    expect(hasIndex(Notification.schema, (key) =>
      key.userId === 1 && key.read === 1 && key.createdAt === -1
    )).toBe(true);
  });
});
