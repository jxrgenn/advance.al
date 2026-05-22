/**
 * Phase 28 — coverage push for resendEmailService template fallback ternaries
 * not exercised by the well-formed inputs in phase-12/email-templates.test.js.
 *
 * Targets fallback branches:
 *   - sendApplicationStatusEmail: applicant.profile=undefined → "Përdorues" fallback
 *   - sendApplicationStatusEmail: notes=undefined → no <Shënim> block (L1085-1088)
 *   - sendApplicationStatusEmail: unknown status → fallback statusInfo (L1061)
 *   - sendApplicationStatusEmail: job.companyName missing → '' fallback
 *   - sendNewApplicationEmail: employer.profile=undefined → "Punëdhënës" fallback
 *   - sendNewApplicationEmail: applicant fields missing → trimmed empty
 *   - sendApplicationMessageEmail: messageType unknown → "Mesazh i ri" fallback
 *   - sendApplicationMessageEmail: job.companyName missing → 'N/A' fallback
 *   - sendBulkNotificationEmail: type='maintenance' / 'feature' / 'warning' / 'update' branches
 *   - sendTransactionalEmail with disabled service
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import { seedLocations } from '../fixtures/locations.fixture.js';
import resendEmailService from '../../src/lib/resendEmailService.js';

let captured;
let originalResend;
let originalEnabled;

function mockSend() {
  captured = [];
  resendEmailService.resend = {
    emails: {
      send: async (payload) => {
        captured.push(payload);
        return { data: { id: `mock-${Date.now()}` }, error: null };
      },
    },
  };
  resendEmailService.enabled = true;
}

describe('resendEmailService — fallback ternary branches', () => {
  beforeAll(async () => {
    await connectTestDB();
    await seedLocations();
    originalResend = resendEmailService.resend;
    originalEnabled = resendEmailService.enabled;
  });

  beforeEach(() => mockSend());

  afterEach(async () => {
    await clearTestDB();
    await seedLocations();
  });

  afterAll(async () => {
    resendEmailService.resend = originalResend;
    resendEmailService.enabled = originalEnabled;
    await closeTestDB();
  });

  describe('sendApplicationStatusEmail fallbacks', () => {
    it('uses "Përdorues" fallback when applicant.profile.firstName missing (L1049)', async () => {
      const applicant = { email: 'a@x.com', profile: {} }; // no firstName
      const job = { title: 'T', companyName: 'C' };
      await resendEmailService.sendApplicationStatusEmail(applicant, job, 'viewed', null);
      expect(captured[0].text).toMatch(/Përdorues/);
    });

    it('omits <Shënim> block when notes missing (L1085-1088 ternary false)', async () => {
      const applicant = { email: 'a2@x.com', profile: { firstName: 'A' } };
      const job = { title: 'T', companyName: 'C' };
      await resendEmailService.sendApplicationStatusEmail(applicant, job, 'viewed', null);
      expect(captured[0].html).not.toMatch(/Shënim/);
    });

    it('includes <Shënim> block when notes provided', async () => {
      const applicant = { email: 'a3@x.com', profile: { firstName: 'A' } };
      const job = { title: 'T', companyName: 'C' };
      await resendEmailService.sendApplicationStatusEmail(applicant, job, 'viewed', 'Strong candidate');
      expect(captured[0].html).toMatch(/Shënim.*Strong candidate/);
    });

    it('uses fallback statusInfo for unknown status (L1061 default)', async () => {
      const applicant = { email: 'a4@x.com', profile: { firstName: 'A' } };
      const job = { title: 'T', companyName: 'C' };
      await resendEmailService.sendApplicationStatusEmail(applicant, job, 'pending', null);
      // unknown status uses raw value as label and 📋 icon
      expect(captured[0].subject).toMatch(/📋/);
      expect(captured[0].subject).toMatch(/pending/);
    });

    it('handles job.companyName missing → empty string', async () => {
      const applicant = { email: 'a5@x.com', profile: { firstName: 'A' } };
      const job = { title: 'T' /* no companyName */ };
      const r = await resendEmailService.sendApplicationStatusEmail(applicant, job, 'hired', null);
      expect(r.success).toBe(true);
    });
  });

  describe('sendNewApplicationEmail fallbacks', () => {
    it('uses "Punëdhënës" fallback when employer.profile.firstName missing (L1142)', async () => {
      const employer = { email: 'emp@x.com', profile: {} };
      const applicant = { profile: { firstName: 'AppName', lastName: 'Last' } };
      const job = { title: 'JobTitle' };
      await resendEmailService.sendNewApplicationEmail(employer, applicant, job);
      expect(captured[0].text).toMatch(/Punëdhënës/);
    });

    it('handles applicant with no profile → empty trimmed name', async () => {
      const employer = { email: 'emp2@x.com', profile: { firstName: 'Emp' } };
      const applicant = { /* no profile */ };
      const job = { title: 'JobTitle' };
      const r = await resendEmailService.sendNewApplicationEmail(employer, applicant, job);
      expect(r.success).toBe(true);
    });
  });

  describe('sendApplicationMessageEmail fallbacks', () => {
    const baseRecipient = { email: 'r@x.com', firstName: 'R', lastName: 'X' };
    const baseSender = { firstName: 'S', lastName: 'Y' };

    it('uses "Mesazh i ri" fallback for unknown messageType (L724)', async () => {
      const r = await resendEmailService.sendApplicationMessageEmail(
        baseRecipient, baseSender, { title: 'J', companyName: 'C' }, 'hello', 'unknown_type'
      );
      expect(r.success).toBe(true);
      expect(captured[0].subject).toMatch(/Mesazh i ri/);
    });

    it('uses "N/A" fallback when job.companyName missing (L731)', async () => {
      const r = await resendEmailService.sendApplicationMessageEmail(
        baseRecipient, baseSender, { title: 'J' /* no companyName */ }, 'hello', 'text'
      );
      expect(r.success).toBe(true);
      expect(captured[0].html).toMatch(/N\/A/);
    });
  });

  describe('sendBulkNotificationEmail type branches', () => {
    it.each(['announcement', 'maintenance', 'feature', 'warning', 'update'])(
      'type=%s sends with appropriate template',
      async (type) => {
        const r = await resendEmailService.sendBulkNotificationEmail('any@example.com', {
          type, title: `${type} Title`, message: `${type} message`, userName: 'User',
        });
        expect(r.success).toBe(true);
        expect(captured[0].subject).toBeTruthy();
      }
    );
  });

  describe('sendTransactionalEmail', () => {
    it('returns success on happy path', async () => {
      const r = await resendEmailService.sendTransactionalEmail(
        'any@example.com', 'Subj', '<p>html</p>', 'plain text'
      );
      expect(r.success).toBe(true);
      expect(captured[0].subject).toBe('Subj');
    });

    it('returns disabled when service is disabled (L685-686)', async () => {
      resendEmailService.enabled = false;
      const r = await resendEmailService.sendTransactionalEmail('a@x.com', 'S', '<p/>', 'p');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/disabled/i);
      // Restore for afterEach
      resendEmailService.enabled = true;
    });
  });
});
