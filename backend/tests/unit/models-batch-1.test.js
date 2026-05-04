/**
 * Phase 19 Tier A.1 — Models Batch 1
 *
 * Unit tests for: Notification, Location, File, ConfigurationAudit, ReportAction.
 * Each model: schema validation (required, enum, unique), statics, methods.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import { createJobseeker, createAdmin } from '../factories/user.factory.js';
import {
  Notification, Location, ConfigurationAudit, ReportAction
} from '../../src/models/index.js';
import File from '../../src/models/File.js';

describe('Phase 19.A.1 — Models Batch 1', () => {
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

  describe('Notification', () => {
    it('rejects missing userId', async () => {
      await expect(Notification.create({
        type: 'general', title: 't', message: 'm'
      })).rejects.toThrow();
    });

    it('rejects invalid type enum', async () => {
      const { user } = await createJobseeker();
      await expect(Notification.create({
        userId: user._id, type: 'NOT_A_TYPE', title: 't', message: 'm'
      })).rejects.toThrow();
    });

    it('markAsRead instance method sets read=true', async () => {
      const { user } = await createJobseeker();
      const n = await Notification.create({
        userId: user._id, type: 'general', title: 't', message: 'm'
      });
      await n.markAsRead();
      const fresh = await Notification.findById(n._id);
      expect(fresh.read).toBe(true);
    });

    it('getUnreadCount static returns count for a user', async () => {
      const { user } = await createJobseeker();
      await Notification.create({ userId: user._id, type: 'general', title: 'a', message: 'a', read: false });
      await Notification.create({ userId: user._id, type: 'general', title: 'b', message: 'b', read: false });
      await Notification.create({ userId: user._id, type: 'general', title: 'c', message: 'c', read: true });
      const count = await Notification.getUnreadCount(user._id);
      expect(count).toBe(2);
    });

    it('markAllAsReadForUser flips all unread → read', async () => {
      const { user } = await createJobseeker();
      await Notification.create({ userId: user._id, type: 'general', title: 'a', message: 'a', read: false });
      await Notification.create({ userId: user._id, type: 'general', title: 'b', message: 'b', read: false });
      const result = await Notification.markAllAsReadForUser(user._id);
      expect(result.modifiedCount).toBe(2);
      expect(await Notification.getUnreadCount(user._id)).toBe(0);
    });
  });

  describe('Location', () => {
    it('city is unique (E11000 on duplicate insert)', async () => {
      // 'Tiranë' is seeded; try to insert another
      let err = null;
      try {
        await Location.create({ city: 'Tiranë', region: 'Tiranë', country: 'Albania' });
      } catch (e) { err = e; }
      expect(err).toBeTruthy();
      expect(err.code).toBe(11000);
    });

    it('rejects missing required city', async () => {
      await expect(Location.create({ region: 'X', country: 'Albania' })).rejects.toThrow();
    });

    it('isActive defaults to true', async () => {
      await Location.deleteOne({ city: 'TestCity' });
      const loc = await Location.create({ city: 'TestCity', region: 'X', country: 'Albania' });
      expect(loc.isActive).toBe(true);
    });

    it('getActiveLocations static returns only isActive=true entries', async () => {
      await Location.updateOne({ city: 'Tiranë' }, { $set: { isActive: false } });
      const list = await Location.getActiveLocations();
      const cities = list.map(l => l.city);
      expect(cities).not.toContain('Tiranë');
    });

    it('getPopularLocations static returns ordered by jobCount desc, limited', async () => {
      await Location.updateOne({ city: 'Tiranë' }, { $set: { jobCount: 50 } });
      await Location.updateOne({ city: 'Durrës' }, { $set: { jobCount: 30 } });
      await Location.updateOne({ city: 'Vlorë' }, { $set: { jobCount: 10 } });
      const list = await Location.getPopularLocations(2);
      expect(list).toHaveLength(2);
      expect(list[0].city).toBe('Tiranë');
      expect(list[1].city).toBe('Durrës');
    });
  });

  describe('File', () => {
    it('rejects missing required fields', async () => {
      await expect(File.create({})).rejects.toThrow();
    });

    it('rejects invalid fileCategory enum', async () => {
      const { user } = await createJobseeker();
      await expect(File.create({
        fileName: 'a.docx', fileType: 'application/pdf', fileSize: 100,
        uploadedBy: user._id, fileCategory: 'INVALID', fileData: Buffer.from('x')
      })).rejects.toThrow();
    });

    it('accepts all valid fileCategory values', async () => {
      const { user } = await createJobseeker();
      for (const cat of ['cv', 'logo', 'profile_photo', 'other']) {
        const f = await File.create({
          fileName: `${cat}.bin`, fileType: 'application/octet-stream',
          fileSize: 10, uploadedBy: user._id, fileCategory: cat,
          fileData: Buffer.from('x')
        });
        expect(f.fileCategory).toBe(cat);
      }
    });
  });

  describe('ConfigurationAudit', () => {
    it('rejects missing required fields', async () => {
      await expect(ConfigurationAudit.create({})).rejects.toThrow();
    });

    it('rejects invalid action enum', async () => {
      const { user: admin } = await createAdmin();
      await expect(ConfigurationAudit.create({
        configurationId: '507f1f77bcf86cd799439011',
        configKey: 'k',
        action: 'NOT_AN_ACTION',
        category: 'platform',
        changedBy: admin._id
      })).rejects.toThrow();
    });

    it('accepts all valid action values', async () => {
      const { user: admin } = await createAdmin();
      for (const action of ['created', 'updated', 'deleted', 'reset_to_default']) {
        const audit = await ConfigurationAudit.create({
          configurationId: '507f1f77bcf86cd799439011',
          configKey: `k-${action}`,
          configurationKey: `k-${action}`,
          newValue: 'v',
          action,
          category: 'platform',
          changedBy: admin._id
        });
        expect(audit.action).toBe(action);
      }
    });
  });

  describe('ReportAction', () => {
    it('rejects invalid actionType enum', async () => {
      const { user: admin } = await createAdmin();
      await expect(ReportAction.create({
        report: '507f1f77bcf86cd799439011',
        actionType: 'NOT_VALID',
        performedBy: admin._id
      })).rejects.toThrow();
    });
  });
});
