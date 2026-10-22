/**
 * Wave-2 W2-1 / 131 — User pre('deleteOne') cascade inside a transaction.
 *
 * accountCleanup deletes a user's applications inside session.withTransaction
 * and then calls User.deleteOne({ _id }, { session }). The cascade hook used to
 * run its queries WITHOUT that session; they blocked on the documents the open
 * transaction had write-locked until the server aborted the transaction
 * (transactionLifetimeLimitSeconds, 60s on Atlas) and withTransaction retried.
 *
 * Needs a replica set (transactions), so this file runs its own in-memory
 * replica set instead of tests/setup/testDb.js. The transaction lifetime is
 * lowered to 5s so a regression shows up as attempts=2 / >5s, not a hang.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import User from '../../src/models/User.js';
import Application from '../../src/models/Application.js';
import Job from '../../src/models/Job.js';

let rs;

describe('User delete cascade runs inside the caller transaction (131)', () => {
  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(rs.getUri('cascade_txn'));
    await mongoose.connection.db.admin().command({ setParameter: 1, transactionLifetimeLimitSeconds: 5 });
    await User.init(); await Application.init(); await Job.init();
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (rs) await rs.stop();
  });

  const insertUser = async (userType) => {
    const _id = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
      _id, email: `${_id}@example.com`, password: 'h', userType, status: 'deleted', isDeleted: true,
      profile: { firstName: 'A', lastName: 'B', location: { city: 'Tiranë' }, jobSeekerProfile: {}, employerProfile: { companyName: 'C', companySize: '1-10', industry: 'X' } },
    });
    return _id;
  };

  it('jobseeker purge with applications commits on the first attempt', async () => {
    const uid = await insertUser('jobseeker');
    await Application.collection.insertOne({ jobSeekerId: uid, jobId: new mongoose.Types.ObjectId(), employerId: new mongoose.Types.ObjectId(), status: 'pending', withdrawn: false });
    const session = await mongoose.startSession();
    let attempts = 0;
    const t0 = Date.now();
    try {
      await session.withTransaction(async () => {
        attempts++;
        await Application.deleteMany({ jobSeekerId: uid }, { session });
        await User.deleteOne({ _id: uid }, { session });
      });
    } finally {
      await session.endSession();
    }
    expect(attempts).toBe(1);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(await User.collection.countDocuments({ _id: uid })).toBe(0);
    expect(await Application.collection.countDocuments({ jobSeekerId: uid })).toBe(0);
  }, 60000);

  it('employer purge removes its jobs and the applications to them in the same transaction', async () => {
    const eid = await insertUser('employer');
    const jobId = new mongoose.Types.ObjectId();
    await Job.collection.insertOne({ _id: jobId, employerId: eid, title: 'T', status: 'active', isDeleted: false });
    await Application.collection.insertOne({ jobSeekerId: new mongoose.Types.ObjectId(), jobId, employerId: eid, status: 'pending', withdrawn: false });
    const session = await mongoose.startSession();
    let attempts = 0;
    try {
      await session.withTransaction(async () => {
        attempts++;
        await Job.updateOne({ _id: jobId }, { $set: { status: 'closed' } }, { session }); // lock the job inside the txn
        await User.deleteOne({ _id: eid }, { session });
      });
    } finally {
      await session.endSession();
    }
    expect(attempts).toBe(1);
    expect(await Job.collection.countDocuments({ employerId: eid })).toBe(0);
    expect(await Application.collection.countDocuments({ jobId })).toBe(0);
  }, 60000);

  it('without a session the cascade still runs (scripts / test teardown)', async () => {
    const uid = await insertUser('jobseeker');
    await Application.collection.insertOne({ jobSeekerId: uid, jobId: new mongoose.Types.ObjectId(), employerId: new mongoose.Types.ObjectId(), status: 'pending', withdrawn: false });
    await User.deleteOne({ _id: uid });
    expect(await Application.collection.countDocuments({ jobSeekerId: uid })).toBe(0);
  });
});
