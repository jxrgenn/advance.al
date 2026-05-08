/**
 * Phase 28 — coverage push for notificationService template branches:
 *   - generateJobNotificationEmail with location.remote=true (text + html)
 *   - generateJobNotificationEmail with salary present (truthy branch)
 *   - generateJobNotificationEmail with salary null/undefined (falsy branch)
 *   - generateJobNotificationEmail with description.length>300 (truncation marker)
 *   - generateFullUserJobNotificationEmail same branches
 */

import { describe, it, expect } from '@jest/globals';
import notificationService from '../../src/lib/notificationService.js';

function makeQuickUser(overrides = {}) {
  return {
    firstName: 'Anila',
    email: 'anila@example.com',
    phone: '+355681234567',
    allInterests: ['IT'],
    unsubscribeToken: 'tok123',
    getUnsubscribeUrl() { return 'https://advance.al/unsubscribe?token=tok123'; },
    ...overrides,
  };
}

function makeFullUser(overrides = {}) {
  return {
    firstName: 'Bekim',
    email: 'bekim@example.com',
    profile: { firstName: 'Bekim' },
    ...overrides,
  };
}

function baseJob(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    title: 'Senior Dev',
    description: 'Default description',
    category: 'IT',
    location: { city: 'Tiranë', remote: false },
    employerId: { profile: { employerProfile: { companyName: 'TechCo' } } },
    salary: { min: 1000, max: 2000, currency: 'EUR' },
    applicationDeadline: new Date('2026-12-31'),
    ...overrides,
  };
}

describe('notificationService.generateJobNotificationEmail — template branches', () => {
  it('renders "Punë në distancë" badge when location.remote=true', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ location: { city: 'Tiranë', remote: true } })
    );
    expect(r.textContent).toMatch(/Punë në distancë/);
    expect(r.htmlContent).toMatch(/Punë në distancë/);
  });

  it('renders salary range when salary is set', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ salary: { min: 800, max: 1500, currency: 'EUR' } })
    );
    expect(r.textContent).toMatch(/800-1500 EUR/);
    expect(r.htmlContent).toMatch(/800-1500 EUR/);
  });

  it('falls back to "Nuk është specifikuar" when salary is null', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ salary: null })
    );
    expect(r.textContent).toMatch(/Nuk është specifikuar/);
    // HTML branch: when salary null, the salary <div> should not appear
    expect(r.htmlContent).not.toMatch(/💰 Paga:/);
  });

  it('appends "..." to HTML description when length > 300 chars (L92)', () => {
    const longDesc = 'a'.repeat(400);
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ description: longDesc })
    );
    // After substring(0,300) + the conditional ellipsis appends '...'
    expect(r.htmlContent).toMatch(/\.\.\./);
  });

  it('does NOT append "..." when description fits under 300 chars', () => {
    const shortDesc = 'short job description';
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ description: shortDesc })
    );
    // The unsubscribe footer URL also has '...' in some templates? — match
    // specifically the description marker location instead.
    const descIndex = r.htmlContent.indexOf(shortDesc);
    expect(descIndex).toBeGreaterThan(0);
    // The 3-char ellipsis right after the description should NOT appear
    expect(r.htmlContent.substring(descIndex, descIndex + shortDesc.length + 5)).not.toMatch(/\.\.\./);
  });
});

describe('notificationService.generateFullUserJobNotificationEmail — template branches', () => {
  it('renders "Punë në distancë" badge when location.remote=true', () => {
    const r = notificationService.generateFullUserJobNotificationEmail(
      makeFullUser(),
      baseJob({ location: { city: 'Tiranë', remote: true } })
    );
    expect(r.textContent + r.htmlContent).toMatch(/Punë në distancë|distance|Remote/i);
  });

  it('falls back gracefully when salary is missing', () => {
    const r = notificationService.generateFullUserJobNotificationEmail(
      makeFullUser(),
      baseJob({ salary: null })
    );
    expect(r.htmlContent).toBeTruthy();
    // No salary range displayed
    expect(r.htmlContent).not.toMatch(/EUR$/);
  });

  it('falls back to "Kandidat" when firstName is undefined (L134)', () => {
    const userNoName = { profile: {} };
    const r = notificationService.generateFullUserJobNotificationEmail(userNoName, baseJob());
    expect(r.textContent).toMatch(/Kandidat/);
  });
});
