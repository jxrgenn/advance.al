/**
 * Wave-2 W2-2 — 72 + ownership follow-up from W2-1.
 *
 *  - accountCleanup.deleteUserAsset / lib/resumeStorage.deleteStoredResume
 *    destroy a Cloudinary asset only when it is the owner's own upload
 *    (isOwnedCloudinaryAsset) and report 'not found' instead of logging it
 *    as deleted.
 *  - purgeDeletedAccounts keeps dependent data consistent: active applications
 *    of a purged jobseeker leave Job.applicationCount; an employer purge drops
 *    the CandidateMatch rows of its jobs and notifications about its jobs /
 *    the deleted applications.
 *
 * Runs its own in-memory replica set (the purge uses transactions).
 * Cloudinary is stubbed at the SDK boundary (uploader.destroy).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import cloudinary from '../../src/config/cloudinary.js';
import User from '../../src/models/User.js';
import Job from '../../src/models/Job.js';
import Application from '../../src/models/Application.js';
import Notification from '../../src/models/Notification.js';
import CandidateMatch from '../../src/models/CandidateMatch.js';
import { purgeDeletedAccounts, deleteUserAsset } from '../../src/services/accountCleanup.js';
import { deleteStoredResume } from '../../src/lib/resumeStorage.js';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const oid = () => new mongoose.Types.ObjectId();
const resumeUrl = (ownerId, n = 1) => `https://res.cloudinary.com/${CLOUD}/raw/authenticated/v1/advance-al/cvs/resume-${ownerId}-${n}`;
const longAgo = () => new Date(Date.now() - 40 * 86400000);
let rs;

async function insertDeletedUser(userType, extraProfile = {}) {
  const _id = oid();
  await User.collection.insertOne({
    _id, email: `${_id}@example.com`, password: 'h', userType, status: 'deleted', isDeleted: true, deletedAt: longAgo(),
    profile: {
      firstName: 'A', lastName: 'B', location: { city: 'Tiranë' },
      jobSeekerProfile: {}, employerProfile: { companyName: 'C', companySize: '1-10', industry: 'X' },
      ...extraProfile,
    },
  });
  return _id;
}

describe('W2-2 purge consistency + file ownership', () => {
  beforeAll(async () => {
    rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(rs.getUri('w22_purge'));
    await User.init(); await Job.init(); await Application.init(); await Notification.init(); await CandidateMatch.init();
    expect(CLOUD).toMatch(/\S/);
  }, 120000);

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const M of [User, Job, Application, Notification, CandidateMatch]) await M.collection.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (rs) await rs.stop();
  });

  describe('deleteStoredResume (lib/resumeStorage)', () => {
    it("destroys the owner's CV and reports 'deleted'", async () => {
      const spy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const owner = oid();
      expect(await deleteStoredResume(resumeUrl(owner, 5), owner)).toBe('deleted');
      expect(spy).toHaveBeenCalledWith(`advance-al/cvs/resume-${owner}-5`, { resource_type: 'raw', type: 'authenticated', invalidate: true });
    });

    it("refuses another user's CV, a foreign cloud, and a call without owner", async () => {
      const spy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const owner = oid();
      expect(await deleteStoredResume(resumeUrl(oid(), 5), owner)).toBe('refused');
      expect(await deleteStoredResume(`https://res.cloudinary.com/evil-cloud/raw/authenticated/v1/advance-al/cvs/resume-${owner}-5`, owner)).toBe('refused');
      expect(await deleteStoredResume(resumeUrl(owner, 5))).toBe('refused');
      expect(spy).not.toHaveBeenCalled();
    });

    it("reports Cloudinary's {result:'not found'} as 'not_found', not as deleted", async () => {
      jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'not found' });
      const owner = oid();
      expect(await deleteStoredResume(resumeUrl(owner, 5), owner)).toBe('not_found');
    });
  });

  describe('deleteUserAsset (services/accountCleanup) — 72', () => {
    it("'not found' from Cloudinary → 'not_found' (was logged as deleted)", async () => {
      jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'not found' });
      const owner = oid();
      expect(await deleteUserAsset(resumeUrl(owner), 'raw', { ownerId: owner, kind: 'resume' })).toBe('not_found');
    });

    it("an asset of another kind/owner is refused without a destroy call", async () => {
      const spy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const owner = oid();
      // a CV URL passed as the user's "logo"
      expect(await deleteUserAsset(resumeUrl(owner), 'image', { ownerId: owner, kind: 'logo' })).toBe('refused');
      expect(spy).not.toHaveBeenCalled();
    });

    it('a transport error is reported as failed (no throw)', async () => {
      jest.spyOn(cloudinary.uploader, 'destroy').mockRejectedValue(new Error('ECONNRESET'));
      const owner = oid();
      expect(await deleteUserAsset(resumeUrl(owner), 'raw', { ownerId: owner, kind: 'resume' })).toBe('failed');
    });
  });

  describe('purgeDeletedAccounts — dependent data (72)', () => {
    it("a purged jobseeker's ACTIVE applications leave Job.applicationCount; withdrawn ones don't count twice", async () => {
      jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const seeker = await insertDeletedUser('jobseeker');
      const employer = oid();
      const jobA = oid();
      const jobB = oid();
      await Job.collection.insertMany([
        { _id: jobA, slug: `a-${jobA}`, employerId: employer, title: 'A', applicationCount: 3 },
        { _id: jobB, slug: `b-${jobB}`, employerId: employer, title: 'B', applicationCount: 1 },
      ]);
      const appActive = oid();
      await Application.collection.insertMany([
        { _id: appActive, jobId: jobA, jobSeekerId: seeker, employerId: employer, status: 'pending', withdrawn: false },
        { jobId: jobB, jobSeekerId: seeker, employerId: employer, status: 'pending', withdrawn: true },
      ]);
      await Notification.collection.insertOne({ userId: employer, type: 'application_received', title: 'Aplikim i ri', message: 'A B aplikoi', relatedApplication: appActive, relatedJob: jobA });

      expect(await purgeDeletedAccounts()).toBe(1);

      expect((await Job.collection.findOne({ _id: jobA })).applicationCount).toBe(2);
      expect((await Job.collection.findOne({ _id: jobB })).applicationCount).toBe(1);
      expect(await Application.collection.countDocuments({ jobSeekerId: seeker })).toBe(0);
      // the employer's "<name> applied" notification goes with the application
      expect(await Notification.collection.countDocuments({ userId: employer })).toBe(0);
    }, 60000);

    it("an employer purge drops its jobs' CandidateMatch rows and other users' notifications about those jobs", async () => {
      jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const employer = await insertDeletedUser('employer');
      const job = oid();
      const otherJob = oid();
      const seeker = oid();
      await Job.collection.insertMany([
        { _id: job, slug: `j-${job}`, employerId: employer, title: 'J', applicationCount: 0 },
        { _id: otherJob, slug: `o-${otherJob}`, employerId: oid(), title: 'Other', applicationCount: 0 },
      ]);
      const expiresAt = new Date(Date.now() + 86400000);
      await CandidateMatch.collection.insertMany([
        { jobId: job, candidateId: seeker, matchScore: 80, expiresAt },
        { jobId: otherJob, candidateId: seeker, matchScore: 70, expiresAt },
      ]);
      await Notification.collection.insertMany([
        { userId: seeker, type: 'application_status_changed', title: 't', message: 'm', relatedJob: job },
        { userId: seeker, type: 'general', title: 't', message: 'm', relatedJob: otherJob },
      ]);

      expect(await purgeDeletedAccounts()).toBe(1);

      expect(await Job.collection.countDocuments({ _id: job })).toBe(0);
      expect(await CandidateMatch.collection.countDocuments({ jobId: job })).toBe(0);
      expect(await CandidateMatch.collection.countDocuments({ jobId: otherJob })).toBe(1);
      expect(await Notification.collection.countDocuments({ relatedJob: job })).toBe(0);
      expect(await Notification.collection.countDocuments({ relatedJob: otherJob })).toBe(1);
    }, 60000);

    it("purge destroys only the user's own assets; a poisoned logo URL survives", async () => {
      const spy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
      const victim = oid();
      const employer = oid();
      await User.collection.insertOne({
        _id: employer, email: `${employer}@example.com`, password: 'h', userType: 'employer', status: 'deleted', isDeleted: true, deletedAt: longAgo(),
        profile: { firstName: 'A', lastName: 'B', location: { city: 'Tiranë' }, employerProfile: {
          companyName: 'C', companySize: '1-10', industry: 'X',
          logo: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/advance-al/logos/logo-${victim}-1.png`,
        } },
      });
      expect(await purgeDeletedAccounts()).toBe(1);
      expect(spy).not.toHaveBeenCalled();
      expect(await User.collection.countDocuments({ _id: employer })).toBe(0);
    }, 60000);
  });
});
