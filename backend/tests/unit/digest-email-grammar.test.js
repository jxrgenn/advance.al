/**
 * Verifies Albanian singular/plural agreement in generateJobAlertsDigestEmail.
 *
 * Bug reported from a real digest screenshot:
 *   subject: "🎯 1 punë e re për ju!" (singular ✓)
 *   body:    "gjenim pozicione që përputhen" (always plural ✗)
 *
 * Fixed in PR-H. The whole digest should consistently agree:
 *   N=1 → "punë e re", "1 pozicion të ri", "përputhet", "Ky pozicion"
 *   N>1 → "punë të reja", "N pozicione të reja", "përputhen", "Këto pozicione"
 */

import { describe, it, expect } from '@jest/globals';
import notificationService from '../../src/lib/notificationService.js';

const fakeUser = { profile: { firstName: 'Ohana' }, email: 'test@example.com' };
const makeJob = (i = 1) => ({
  _id: `66000000000000000000000${i}`,
  title: `Test Job ${i}`,
  category: 'Teknologji',
  location: { city: 'Tiranë' },
  salary: { min: 1000, max: 1500, currency: 'EUR' },
  employerId: { profile: { employerProfile: { companyName: 'Test Co' } } },
});

describe('generateJobAlertsDigestEmail — Albanian grammar agreement', () => {
  it('N=1: subject + body all use singular forms', () => {
    const { subject, textContent, htmlContent } = notificationService.generateJobAlertsDigestEmail(fakeUser, [makeJob(1)]);

    expect(subject).toMatch(/1 punë e re/);
    expect(subject).not.toMatch(/punë të reja/);

    expect(textContent).toMatch(/1 pozicion të ri/);
    expect(textContent).not.toMatch(/pozicione të reja/);
    expect(textContent).toMatch(/përputhet/);
    expect(textContent).not.toMatch(/përputhen/);

    expect(htmlContent).toMatch(/1 punë e re/);
    expect(htmlContent).not.toMatch(/punë të reja/);
    expect(htmlContent).toMatch(/1 pozicion të ri/);
    expect(htmlContent).not.toMatch(/pozicione të reja/);
    // "Ky pozicion përputhet" or "ky pozicion përputhet" — singular agreement
    expect(htmlContent).toMatch(/ky pozicion përputhet/i);
    expect(htmlContent).not.toMatch(/këto pozicione përputhen/i);
    // Grouping sentence is plural-only — should be absent for N=1
    expect(htmlContent).not.toMatch(/grupojmë në një email/);
  });

  it('N=3: subject + body all use plural forms', () => {
    const jobs = [makeJob(1), makeJob(2), makeJob(3)];
    const { subject, textContent, htmlContent } = notificationService.generateJobAlertsDigestEmail(fakeUser, jobs);

    expect(subject).toMatch(/3 punë të reja/);
    expect(subject).not.toMatch(/punë e re\b/);

    expect(textContent).toMatch(/3 pozicione të reja/);
    expect(textContent).not.toMatch(/pozicion të ri/);
    expect(textContent).toMatch(/përputhen/);

    expect(htmlContent).toMatch(/3 punë të reja/);
    expect(htmlContent).toMatch(/3 pozicione të reja/);
    expect(htmlContent).toMatch(/këto pozicione përputhen/i);
    expect(htmlContent).toMatch(/grupojmë në një email/);
  });

  it('N=2: also plural (not "1")', () => {
    const { htmlContent } = notificationService.generateJobAlertsDigestEmail(fakeUser, [makeJob(1), makeJob(2)]);
    expect(htmlContent).toMatch(/2 punë të reja/);
    expect(htmlContent).toMatch(/2 pozicione të reja/);
  });
});
