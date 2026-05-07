/**
 * Unit tests for QuickUser model methods + virtuals (Phase 28 — Phase 6).
 *
 * Baseline 46.7%. Pure logic exercised without DB:
 *   - virtuals: fullName, allInterests, canReceiveNotification (all 3 freq tiers)
 *   - matchesJob: location-only, interest-mismatch, jobType filter, salary filter
 *   - schema defaults: unsubscribeToken auto-generated, isActive=true, etc.
 *
 * Methods that require .save() (recordNotificationSent, recordEmailClick,
 * unsubscribe, convertToFullUser) are NOT tested here — they need DB
 * integration; their pure-data updates are obvious.
 */

import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import QuickUser from '../../src/models/QuickUser.js';

function mkUser(overrides = {}) {
  return new QuickUser({
    firstName: 'Anila',
    lastName: 'Kola',
    email: 'anila@example.com',
    location: 'Tiranë',
    interests: ['Teknologji'],
    customInterests: [],
    preferences: {
      emailFrequency: 'immediate',
      smsNotifications: false,
      jobTypes: [],
      remoteWork: false,
    },
    ...overrides,
  });
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('QuickUser virtuals', () => {
  it('fullName joins firstName + lastName', () => {
    expect(mkUser({ firstName: 'Anila', lastName: 'Kola' }).fullName).toBe('Anila Kola');
  });

  it('allInterests merges interests + customInterests', () => {
    const u = mkUser({
      interests: ['Teknologji', 'Marketing'],
      customInterests: ['Sport', 'Music'],
    });
    expect(u.allInterests).toEqual(['Teknologji', 'Marketing', 'Sport', 'Music']);
  });

  it('allInterests handles empty arrays', () => {
    const u = mkUser({ interests: [], customInterests: [] });
    expect(u.allInterests).toEqual([]);
  });
});

describe('QuickUser.canReceiveNotification', () => {
  it('returns false when isActive is false', () => {
    expect(mkUser({ isActive: false }).canReceiveNotification).toBe(false);
  });

  it('IMMEDIATE: true when never notified', () => {
    const u = mkUser({ preferences: { emailFrequency: 'immediate' } });
    u.lastNotifiedAt = null;
    expect(u.canReceiveNotification).toBe(true);
  });

  it('IMMEDIATE: false when notified < 1h ago', () => {
    const u = mkUser({ preferences: { emailFrequency: 'immediate' } });
    u.lastNotifiedAt = new Date(Date.now() - HOUR / 2);
    expect(u.canReceiveNotification).toBe(false);
  });

  it('IMMEDIATE: true when notified > 1h ago', () => {
    const u = mkUser({ preferences: { emailFrequency: 'immediate' } });
    u.lastNotifiedAt = new Date(Date.now() - 2 * HOUR);
    expect(u.canReceiveNotification).toBe(true);
  });

  it('DAILY: false when notified < 24h ago', () => {
    const u = mkUser({ preferences: { emailFrequency: 'daily' } });
    u.lastNotifiedAt = new Date(Date.now() - 12 * HOUR);
    expect(u.canReceiveNotification).toBe(false);
  });

  it('DAILY: true when notified > 24h ago', () => {
    const u = mkUser({ preferences: { emailFrequency: 'daily' } });
    u.lastNotifiedAt = new Date(Date.now() - 25 * HOUR);
    expect(u.canReceiveNotification).toBe(true);
  });

  it('WEEKLY: false when notified < 7d ago', () => {
    const u = mkUser({ preferences: { emailFrequency: 'weekly' } });
    u.lastNotifiedAt = new Date(Date.now() - 3 * DAY);
    expect(u.canReceiveNotification).toBe(false);
  });

  it('WEEKLY: true when notified > 7d ago', () => {
    const u = mkUser({ preferences: { emailFrequency: 'weekly' } });
    u.lastNotifiedAt = new Date(Date.now() - 8 * DAY);
    expect(u.canReceiveNotification).toBe(true);
  });

  it('returns false for unknown frequency value', () => {
    const u = mkUser();
    u.preferences.emailFrequency = 'mystery';
    expect(u.canReceiveNotification).toBe(false);
  });
});

describe('QuickUser.matchesJob', () => {
  const mkJob = (over = {}) => ({
    title: 'Engineer',
    category: 'Teknologji',
    tags: [],
    jobType: 'full-time',
    location: { city: 'Tiranë', remote: false },
    salary: { min: 1000, max: 2000 },
    ...over,
  });

  it('matches when same city + interest in category', () => {
    const u = mkUser({ location: 'Tiranë', interests: ['Teknologji'] });
    expect(u.matchesJob(mkJob())).toBe(true);
  });

  it('rejects different city when not remote', () => {
    const u = mkUser({ location: 'Tiranë', interests: ['Teknologji'] });
    expect(u.matchesJob(mkJob({ location: { city: 'Vlorë', remote: false } }))).toBe(false);
  });

  it('matches different city when remote AND user wants remote', () => {
    const u = mkUser({
      location: 'Tiranë',
      interests: ['Teknologji'],
      preferences: { emailFrequency: 'immediate', remoteWork: true },
    });
    expect(u.matchesJob(mkJob({ location: { city: 'Vlorë', remote: true } }))).toBe(true);
  });

  it('rejects remote job when user does not want remote', () => {
    const u = mkUser({
      location: 'Tiranë',
      interests: ['Teknologji'],
      preferences: { emailFrequency: 'immediate', remoteWork: false },
    });
    expect(u.matchesJob(mkJob({ location: { city: 'Vlorë', remote: true } }))).toBe(false);
  });

  it('rejects when no interest overlaps job category or tags', () => {
    const u = mkUser({ interests: ['Marketing'] });
    expect(u.matchesJob(mkJob({ category: 'Inxhinieri', tags: [] }))).toBe(false);
  });

  it('matches via customInterests overlap with job category', () => {
    const u = mkUser({ interests: [], customInterests: ['Web Development'] });
    expect(u.matchesJob(mkJob({ category: 'Web Development', tags: [] }))).toBe(true);
  });

  it('matches via job tags overlap', () => {
    const u = mkUser({ interests: ['Marketing'] });
    expect(u.matchesJob(mkJob({ category: 'Other', tags: ['Marketing', 'Branding'] }))).toBe(true);
  });

  it('rejects when jobType filter excludes job', () => {
    const u = mkUser({
      preferences: {
        emailFrequency: 'immediate',
        jobTypes: ['part-time', 'internship'],
      },
    });
    expect(u.matchesJob(mkJob({ jobType: 'full-time' }))).toBe(false);
  });

  it('matches when jobType filter includes job', () => {
    const u = mkUser({
      preferences: {
        emailFrequency: 'immediate',
        jobTypes: ['full-time'],
      },
    });
    expect(u.matchesJob(mkJob({ jobType: 'full-time' }))).toBe(true);
  });

  it('rejects when job max salary is below user min expectation', () => {
    const u = mkUser({
      preferences: {
        emailFrequency: 'immediate',
        salaryRange: { min: 3000 },
      },
    });
    expect(u.matchesJob(mkJob({ salary: { min: 800, max: 1500 } }))).toBe(false);
  });

  it('matches when job max salary >= user min expectation', () => {
    const u = mkUser({
      preferences: {
        emailFrequency: 'immediate',
        salaryRange: { min: 1000 },
      },
    });
    expect(u.matchesJob(mkJob({ salary: { min: 1500, max: 2500 } }))).toBe(true);
  });

  it('does not enforce salary filter when min is not set', () => {
    const u = mkUser({
      preferences: { emailFrequency: 'immediate', salaryRange: {} },
    });
    expect(u.matchesJob(mkJob({ salary: { min: 100, max: 200 } }))).toBe(true);
  });
});

describe('QuickUser schema defaults', () => {
  it('isActive defaults to true', () => {
    expect(mkUser().isActive).toBe(true);
  });

  it('unsubscribeToken auto-generates a 64-char hex', () => {
    const u = mkUser();
    expect(u.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two users get different unsubscribeTokens', () => {
    expect(mkUser().unsubscribeToken).not.toBe(mkUser().unsubscribeToken);
  });

  it('lastNotifiedAt defaults to null', () => {
    expect(mkUser().lastNotifiedAt).toBeNull();
  });

  it('notificationCount / totalEmailsSent / emailClickCount default to 0', () => {
    const u = mkUser();
    expect(u.notificationCount).toBe(0);
    expect(u.totalEmailsSent).toBe(0);
    expect(u.emailClickCount).toBe(0);
  });

  it('source defaults to "quick_signup"', () => {
    expect(mkUser().source).toBe('quick_signup');
  });

  it('preferences.emailFrequency defaults to "immediate"', () => {
    const u = new QuickUser({
      firstName: 'A', lastName: 'B', email: 'a@b.com', location: 'Tiranë',
    });
    expect(u.preferences.emailFrequency).toBe('immediate');
  });

  it('convertedToFullUser defaults to false', () => {
    expect(mkUser().convertedToFullUser).toBe(false);
  });

  it('parsedCV.status defaults to "pending"', () => {
    expect(mkUser().parsedCV.status).toBe('pending');
  });

  it('embedding.status defaults to "pending"', () => {
    expect(mkUser().embedding.status).toBe('pending');
  });
});

describe('QuickUser email validation', () => {
  it('rejects malformed email at validation time', async () => {
    const u = mkUser({ email: 'not-an-email' });
    const err = u.validateSync();
    expect(err.errors.email).toBeDefined();
  });

  it('accepts valid email', async () => {
    const u = mkUser({ email: 'valid@example.com' });
    expect(u.validateSync()).toBeUndefined();
  });
});
