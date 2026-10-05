/**
 * Phase 28 — coverage push for notificationService template branches:
 *   - generateJobNotificationEmail with location.remote=true (text + html)
 *   - generateJobNotificationEmail with salary present (truthy branch)
 *   - generateJobNotificationEmail with salary null/undefined (falsy branch)
 *   - generateJobNotificationEmail with description.length>300 (truncation marker)
 *   - generateFullUserJobNotificationEmail same branches
 *
 * Salary (O-4): stored salaries are ANNUAL; emails show the MONTHLY range
 * via lib/salary.js ("800-1,500 EUR/muaj") and omit the line entirely when
 * the employer hid the salary or no numbers exist.
 * Deadline (O-5): "Afati" comes from job.expiresAt (Job has no
 * applicationDeadline), formatted sq-AL in Europe/Tirane — never "Invalid Date".
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
    salary: { min: 12000, max: 24000, currency: 'EUR', showPublic: true },
    expiresAt: new Date('2026-12-31T10:00:00Z'),
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

  it('renders the MONTHLY salary range (stored annual 9600-18000 → 800-1,500 EUR/muaj)', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ salary: { min: 9600, max: 18000, currency: 'EUR', showPublic: true } })
    );
    expect(r.textContent).toContain('💰 Paga: 800-1,500 EUR/muaj');
    expect(r.htmlContent).toContain('💰 Paga:</strong> 800-1,500 EUR/muaj');
    expect(r.textContent).not.toContain('9600');
  });

  it('omits the salary line when salary is null', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ salary: null })
    );
    expect(r.textContent).not.toContain('Paga');
    expect(r.htmlContent).not.toContain('💰 Paga:');
  });

  it('omits the salary line when the employer hid it (showPublic=false) — numbers never leak', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ salary: { min: 30000, max: 42000, currency: 'EUR', showPublic: false } })
    );
    expect(r.textContent).not.toContain('Paga');
    expect(r.htmlContent).not.toContain('Paga');
    expect(r.textContent + r.htmlContent).not.toMatch(/30000|42000|2,500|3,500/);
  });

  it('omits the salary line for a Mongoose-materialized salary without numbers (no "undefined-undefined")', () => {
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ salary: { currency: 'EUR', negotiable: true, showPublic: true } })
    );
    expect(r.textContent + r.htmlContent).not.toContain('undefined');
    expect(r.textContent).not.toContain('Paga');
  });

  it('prints "Afati" from expiresAt as an Albanian date in Tirana time', () => {
    // 22:30Z on 31 July is already 1 August in Tirana (UTC+2 in summer)
    const r = notificationService.generateJobNotificationEmail(
      makeQuickUser(),
      baseJob({ expiresAt: new Date('2026-07-31T22:30:00Z') })
    );
    expect(r.textContent).toContain('📅 Afati: 1 gusht 2026');
    expect(r.htmlContent).toContain('📅 Afati:</strong> 1 gusht 2026');
    expect(r.textContent + r.htmlContent).not.toContain('Invalid Date');
  });

  it('omits "Afati" when expiresAt is missing or invalid (never "Invalid Date")', () => {
    const missing = notificationService.generateJobNotificationEmail(makeQuickUser(), baseJob({ expiresAt: undefined }));
    const invalid = notificationService.generateJobNotificationEmail(makeQuickUser(), baseJob({ expiresAt: 'not-a-date' }));
    for (const r of [missing, invalid]) {
      expect(r.textContent).not.toContain('Afati');
      expect(r.htmlContent).not.toContain('Afati');
      expect(r.textContent + r.htmlContent).not.toContain('Invalid Date');
    }
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

  it('omits the salary line when salary is missing', () => {
    const r = notificationService.generateFullUserJobNotificationEmail(
      makeFullUser(),
      baseJob({ salary: null })
    );
    expect(r.textContent).not.toContain('Paga');
    expect(r.htmlContent).not.toContain('💰 Paga:');
  });

  it('renders the monthly salary + Albanian deadline, and hides a hidden salary', () => {
    const shown = notificationService.generateFullUserJobNotificationEmail(makeFullUser(), baseJob());
    expect(shown.textContent).toContain('💰 Paga: 1,000-2,000 EUR/muaj');
    expect(shown.htmlContent).toContain('💰 Paga:</strong> 1,000-2,000 EUR/muaj');
    expect(shown.textContent).toContain('📅 Afati: 31 dhjetor 2026');

    const hidden = notificationService.generateFullUserJobNotificationEmail(
      makeFullUser(),
      baseJob({ salary: { min: 12000, max: 24000, currency: 'EUR', showPublic: false } })
    );
    expect(hidden.textContent + hidden.htmlContent).not.toContain('Paga');
  });

  it('falls back to "Kandidat" when firstName is undefined (L134)', () => {
    const userNoName = { profile: {} };
    const r = notificationService.generateFullUserJobNotificationEmail(userNoName, baseJob());
    expect(r.textContent).toMatch(/Kandidat/);
  });
});

describe('notificationService.generateJobAlertsDigestEmail — salary lines', () => {
  it('shows monthly ALL salaries, omits hidden ones', () => {
    const jobs = [
      baseJob({ _id: 'a1', title: 'Shown ALL', salary: { min: 960000, max: 1200000, currency: 'ALL', showPublic: true } }),
      baseJob({ _id: 'a2', title: 'Hidden EUR', salary: { min: 30000, max: 42000, currency: 'EUR', showPublic: false } }),
    ];
    const r = notificationService.generateJobAlertsDigestEmail(makeFullUser(), jobs);
    expect(r.textContent).toContain('Shown ALL — TechCo (Tiranë) — 80,000-100,000 ALL/muaj');
    expect(r.htmlContent).toContain('80,000-100,000 ALL/muaj');
    expect(r.textContent).toMatch(/Hidden EUR — TechCo \(Tiranë\)\n/);
    expect(r.textContent + r.htmlContent).not.toMatch(/30000|42000|2,500-3,500/);
  });
});
