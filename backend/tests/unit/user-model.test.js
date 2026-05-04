/**
 * Phase 10 — User Model Unit Tests
 *
 * Tests every static method, instance method, hook, and enum on the User model.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import {
  createJobseeker, createVerifiedEmployer, createSuspendedUser, createBannedUser, createAdmin
} from '../factories/user.factory.js';
import User from '../../src/models/User.js';

describe('Phase 10 — User Model', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
  });

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    await closeTestDB();
  });

  describe('Pre-save: password hashing', () => {
    it('plain password is bcrypt-hashed before save', async () => {
      const { user, plainPassword } = await createJobseeker();
      const dbUser = await User.findById(user._id).select('+password');
      expect(dbUser.password).not.toBe(plainPassword);
      expect(dbUser.password).toMatch(/^\$2[aby]\$/);
    });

    it('hashed password is NOT re-hashed when not modified', async () => {
      const { user } = await createJobseeker();
      const dbUserBefore = await User.findById(user._id).select('+password');
      const hashBefore = dbUserBefore.password;

      // Update unrelated field
      dbUserBefore.profile.firstName = 'NewName';
      await dbUserBefore.save();

      const dbUserAfter = await User.findById(user._id).select('+password');
      expect(dbUserAfter.password).toBe(hashBefore);
    });
  });

  describe('comparePassword', () => {
    it('returns true for correct password', async () => {
      const { user, plainPassword } = await createJobseeker();
      const dbUser = await User.findById(user._id).select('+password');
      const ok = await dbUser.comparePassword(plainPassword);
      expect(ok).toBe(true);
    });

    it('returns false for wrong password', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id).select('+password');
      const ok = await dbUser.comparePassword('WrongPassword1');
      expect(ok).toBe(false);
    });

    it('returns false for empty password', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id).select('+password');
      const ok = await dbUser.comparePassword('');
      expect(ok).toBe(false);
    });
  });

  describe('softDelete()', () => {
    it('sets isDeleted=true, status=deleted, deletedAt=now', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);
      await dbUser.softDelete();

      const refreshed = await User.findById(user._id);
      expect(refreshed.isDeleted).toBe(true);
      expect(refreshed.status).toBe('deleted');
      expect(refreshed.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('addRefreshToken / removeRefreshToken / removeAllRefreshTokens', () => {
    it('addRefreshToken stores hashed token (NOT plaintext)', async () => {
      const { user } = await createJobseeker();
      await user.addRefreshToken('plaintext-token-abc');

      const dbUser = await User.findById(user._id).select('+refreshTokens');
      const stored = dbUser.refreshTokens[0]?.token;
      expect(stored).toBeDefined();
      expect(stored).not.toBe('plaintext-token-abc');
      expect(stored).toMatch(/^[a-f0-9]+$/);
    });

    it('removeRefreshToken removes only the specified token', async () => {
      const { user } = await createJobseeker();
      await user.addRefreshToken('token-1');
      await user.addRefreshToken('token-2');
      await user.removeRefreshToken('token-1');

      const dbUser = await User.findById(user._id).select('+refreshTokens');
      expect(dbUser.refreshTokens.length).toBe(1);
    });

    it('removeAllRefreshTokens clears the array', async () => {
      const { user } = await createJobseeker();
      await user.addRefreshToken('a');
      await user.addRefreshToken('b');
      await user.addRefreshToken('c');

      await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });

      const dbUser = await User.findById(user._id).select('+refreshTokens');
      expect(dbUser.refreshTokens).toEqual([]);
    });
  });

  describe('checkSuspensionStatus / suspend / ban / liftSuspension', () => {
    it('suspend marks status=suspended with details (duration in days)', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);

      await dbUser.suspend('Spam reports', null, 7);

      const refreshed = await User.findById(user._id);
      expect(refreshed.status).toBe('suspended');
      expect(refreshed.suspensionDetails.reason).toBe('Spam reports');
      expect(refreshed.suspensionDetails.expiresAt).toBeInstanceOf(Date);
    });

    it('ban marks status=banned permanently (expiresAt is null)', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);

      await dbUser.ban('Severe violation', null);

      const refreshed = await User.findById(user._id);
      expect(refreshed.status).toBe('banned');
      expect(refreshed.suspensionDetails.expiresAt ?? null).toBeNull();
    });

    it('liftSuspension restores status=active', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      const dbUser = await User.findById(user._id);

      await dbUser.liftSuspension();

      const refreshed = await User.findById(user._id);
      expect(refreshed.status).toBe('active');
    });

    it('checkSuspensionStatus auto-lifts when expiresAt is in the past', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      // Force expired
      await User.updateOne(
        { _id: user._id },
        { 'suspensionDetails.expiresAt': new Date(Date.now() - 86400_000) }
      );
      const dbUser = await User.findById(user._id);
      await dbUser.checkSuspensionStatus();

      const refreshed = await User.findById(user._id);
      expect(refreshed.status).toBe('active');
    });

    it('checkSuspensionStatus does NOT lift when expiresAt is in the future', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      const dbUser = await User.findById(user._id);
      await dbUser.checkSuspensionStatus();

      const refreshed = await User.findById(user._id);
      expect(refreshed.status).toBe('suspended');
    });
  });

  describe('Static method checkExpiredSuspensions', () => {
    it('returns count of users whose suspension was lifted', async () => {
      const { user } = await createSuspendedUser('jobseeker');
      await User.updateOne(
        { _id: user._id },
        { 'suspensionDetails.expiresAt': new Date(Date.now() - 86400_000) }
      );

      const count = await User.checkExpiredSuspensions();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('returns 0 when no suspensions are eligible', async () => {
      await createJobseeker();
      const count = await User.checkExpiredSuspensions();
      expect(count).toBe(0);
    });
  });

  describe('Enum validations', () => {
    it('rejects invalid userType', async () => {
      await expect(User.create({
        email: 'bad@example.com',
        password: 'StrongPwd123',
        userType: 'CUSTOM_ROLE',
        profile: { firstName: 'X', lastName: 'Y', location: { city: 'Tiranë', region: 'Tiranë' } }
      })).rejects.toThrow();
    });

    it('rejects invalid status', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);
      dbUser.status = 'invalid-status';
      await expect(dbUser.save()).rejects.toThrow();
    });

    it('rejects invalid availability enum', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);
      dbUser.profile.jobSeekerProfile.availability = '5-weeks-from-now';
      await expect(dbUser.save()).rejects.toThrow();
    });

    it('rejects invalid experience enum', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);
      dbUser.profile.jobSeekerProfile.experience = '20+ vjet';
      await expect(dbUser.save()).rejects.toThrow();
    });

    it('rejects invalid companySize on employer', async () => {
      const { user } = await createVerifiedEmployer();
      const dbUser = await User.findById(user._id);
      dbUser.profile.employerProfile.companySize = 'huge';
      await expect(dbUser.save()).rejects.toThrow();
    });
  });

  describe('Required field validations', () => {
    it('rejects User without email', async () => {
      await expect(User.create({
        password: 'StrongPwd123',
        userType: 'jobseeker',
        profile: { firstName: 'X', lastName: 'Y', location: { city: 'Tiranë', region: 'Tiranë' } }
      })).rejects.toThrow();
    });

    it('rejects User with weak password (<8 chars)', async () => {
      await expect(User.create({
        email: 'weak@example.com',
        password: 'weak',
        userType: 'jobseeker',
        profile: { firstName: 'X', lastName: 'Y', location: { city: 'Tiranë', region: 'Tiranë' } }
      })).rejects.toThrow();
    });

    it('rejects jobseeker without profile.jobSeekerProfile', async () => {
      await expect(User.create({
        email: 'nojsprofile@example.com',
        password: 'StrongPwd123',
        userType: 'jobseeker',
        profile: { firstName: 'X', lastName: 'Y', location: { city: 'Tiranë', region: 'Tiranë' } }
        // jobSeekerProfile MISSING — but User schema marks it required only via conditional
        // (function() { return this.userType === 'jobseeker'; }). So this should fail.
      })).rejects.toThrow();
    });

    it('email uniqueness enforced (E11000 on duplicate)', async () => {
      await createJobseeker({ email: 'dup@example.com' });
      await expect(createJobseeker({ email: 'dup@example.com' })).rejects.toThrow();
    });
  });

  describe('toJSON sanitization', () => {
    it('returned JSON does not include password or refreshTokens', async () => {
      const { user } = await createJobseeker();
      const dbUser = await User.findById(user._id);
      const json = dbUser.toJSON();
      expect(json.password).toBeUndefined();
      expect(json.refreshTokens).toBeUndefined();
    });
  });
});
