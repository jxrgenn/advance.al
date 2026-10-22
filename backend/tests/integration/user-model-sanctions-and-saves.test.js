/**
 * Wave-2 W2-1 — User model:
 *   129  suspend/ban record the previous status; lifting restores it, so a
 *        pending-verification employer does not end up active-but-unverified.
 *   137  unsaveJob is an atomic $pull — it never wipes a save that landed
 *        after the document was loaded.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createVerifiedEmployer, createUnverifiedEmployer, createAdmin } from '../factories/user.factory.js';
import User from '../../src/models/User.js';

describe('User model — sanctions restore status (129), atomic unsave (137)', () => {
  beforeAll(async () => { await connectTestDB(); await seedLocations(); });
  afterEach(async () => { await clearTestDB(); await seedLocations(); });
  afterAll(async () => { await closeTestDB(); });

  it('suspension of a pending employer records and restores pending_verification on expiry', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createUnverifiedEmployer({ email: 's1@example.com' });
    await emp.suspend('test', admin._id, 1);
    let fresh = await User.findById(emp._id);
    expect(fresh.status).toBe('suspended');
    expect(fresh.suspensionDetails.previousStatus).toBe('pending_verification');
    await User.updateOne({ _id: emp._id }, { $set: { 'suspensionDetails.expiresAt': new Date(Date.now() - 1000) } });
    expect(await User.checkExpiredSuspensions()).toBe(1);
    fresh = await User.findById(emp._id).lean();
    expect(fresh.status).toBe('pending_verification');
    expect(fresh.profile.employerProfile.verified).toBe(false);
  });

  it('liftSuspension restores pending_verification for an unverified employer suspended before previousStatus existed', async () => {
    const { user: emp } = await createUnverifiedEmployer({ email: 's2@example.com' });
    await User.updateOne({ _id: emp._id }, { $set: { status: 'suspended', suspensionDetails: { reason: 'old' } } });
    const loaded = await User.findById(emp._id);
    await loaded.liftSuspension();
    expect((await User.findById(emp._id).lean()).status).toBe('pending_verification');
  });

  it('a verified employer and a jobseeker go back to active', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createVerifiedEmployer({ email: 's3@example.com' });
    const { user: seeker } = await createJobseeker({ email: 's4@example.com' });
    await emp.ban('x', admin._id);
    expect((await User.findById(emp._id).lean()).suspensionDetails.previousStatus).toBe('active');
    await (await User.findById(emp._id)).liftSuspension();
    await seeker.suspend('x', admin._id, 2);
    await (await User.findById(seeker._id)).liftSuspension();
    expect((await User.findById(emp._id).lean()).status).toBe('active');
    expect((await User.findById(seeker._id).lean()).status).toBe('active');
  });

  it('re-suspending keeps the status recorded the first time', async () => {
    const { user: admin } = await createAdmin();
    const { user: emp } = await createUnverifiedEmployer({ email: 's5@example.com' });
    await emp.suspend('first', admin._id, 1);
    const again = await User.findById(emp._id);
    await again.suspend('second', admin._id, 3);
    expect((await User.findById(emp._id).lean()).suspensionDetails.previousStatus).toBe('pending_verification');
  });

  it('unsaveJob on a stale document keeps a save made in between', async () => {
    const A = new mongoose.Types.ObjectId();
    const B = new mongoose.Types.ObjectId();
    const { user } = await createJobseeker({ email: 'u1@example.com' });
    await User.updateOne({ _id: user._id }, { $set: { savedJobs: [A] } });
    const stale = await User.findById(user._id);
    await (await User.findById(user._id)).saveJob(B);
    await stale.unsaveJob(A);
    const fresh = await User.findById(user._id).lean();
    expect(fresh.savedJobs.map(String)).toEqual([String(B)]);
    expect(stale.savedJobs.map(String)).toEqual([]);
  });

  it('unsaveJob accepts a string id and throws for non-jobseekers', async () => {
    const A = new mongoose.Types.ObjectId();
    const { user } = await createJobseeker({ email: 'u2@example.com' });
    await User.updateOne({ _id: user._id }, { $set: { savedJobs: [A] } });
    await (await User.findById(user._id)).unsaveJob(String(A));
    expect((await User.findById(user._id).lean()).savedJobs).toEqual([]);
    const { user: emp } = await createVerifiedEmployer({ email: 'u3@example.com' });
    await expect(emp.unsaveJob(A)).rejects.toThrow('Only job seekers can unsave jobs');
  });
});
