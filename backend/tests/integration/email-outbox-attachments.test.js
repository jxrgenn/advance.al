/**
 * EmailOutbox keeps attachments: a payment receipt whose first send hit a
 * transient Resend failure (429/5xx) used to be queued WITHOUT its .docx and
 * retried without it (also a different payload under the same idempotency
 * key). Resend is replaced at its SDK boundary; the real outbox model and the
 * real drain run.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup/testDb.js';
import resendEmailService from '../../src/lib/resendEmailService.js';
import EmailOutbox from '../../src/models/EmailOutbox.js';
import { drainOnce } from '../../src/services/emailOutboxDrain.js';

const originalEnabled = resendEmailService.enabled;
const originalResend = resendEmailService.resend;

function fakeResend(results) {
  const sent = [];
  resendEmailService.enabled = true;
  resendEmailService.resend = {
    emails: {
      send: async (args, opts) => {
        sent.push({ args, opts });
        return results.shift() ?? { data: { id: `msg_${sent.length}` }, error: null };
      },
    },
  };
  return sent;
}

const DOCX_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('receipt-body-bytes')]);

describe('EmailOutbox attachments', () => {
  beforeAll(connectTestDB);
  afterEach(async () => {
    resendEmailService.enabled = originalEnabled;
    resendEmailService.resend = originalResend;
    await clearTestDB();
  });
  afterAll(closeTestDB);

  it('payment receipt: transient failure → row stores the .docx → the drain retry sends it with the same key', async () => {
    const sent = fakeResend([{ data: null, error: { statusCode: 429, message: 'rate limited', name: 'rate_limit_exceeded' } }]);

    const r = await resendEmailService.sendPaymentReceiptEmail({
      to: 'employer@example.com', employerName: 'Acme', jobTitle: 'Shitës/e', amountEur: 35, tier: 'basic',
      paymentDate: new Date('2026-10-10T10:00:00Z'), paymentId: 'ord_123',
      attachment: { filename: 'Fatura-ord_123.docx', content: DOCX_BYTES },
      jobStatus: 'active',
    });
    expect(r.success).toBe(true);
    expect(r.queued).toBe(true);
    expect(sent[0].args.attachments.map((a) => a.filename)).toEqual(['Fatura-ord_123.docx']);

    const row = await EmailOutbox.findById(r.outboxId).lean();
    expect(row.attachments).toHaveLength(1);
    expect(row.attachments[0].filename).toBe('Fatura-ord_123.docx');
    expect(Buffer.from(row.attachments[0].content.buffer).equals(DOCX_BYTES)).toBe(true);

    // Make it due and drain.
    await EmailOutbox.updateOne({ _id: r.outboxId }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await drainOnce();
    expect(sent).toHaveLength(2);
    const retry = sent[1];
    expect(retry.args.attachments).toHaveLength(1);
    expect(retry.args.attachments[0].filename).toBe('Fatura-ord_123.docx');
    expect(Buffer.isBuffer(retry.args.attachments[0].content)).toBe(true);
    expect(retry.args.attachments[0].content.equals(DOCX_BYTES)).toBe(true);
    expect(retry.opts.idempotencyKey).toBe(sent[0].opts.idempotencyKey);
    expect((await EmailOutbox.findById(r.outboxId).lean()).status).toBe('sent');
  });

  it('a base64-string attachment is stored as bytes and re-sent identically', async () => {
    const sent = fakeResend([{ data: null, error: { statusCode: 503, message: 'down' } }]);
    const r = await resendEmailService._dispatchSend({
      from: 'a@b.al', to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't',
      attachments: [{ filename: 'a.txt', content: Buffer.from('hello').toString('base64') }],
    }, { tags: ['t'] });
    expect(r.queued).toBe(true);
    const row = await EmailOutbox.findById(r.outboxId);
    await resendEmailService._outboxRetrySend(row);
    expect(sent[1].args.attachments[0].content.toString('utf8')).toBe('hello');
  });

  it('emails without attachments queue without the field (no empty arrays stored)', async () => {
    fakeResend([{ data: null, error: { statusCode: 500, message: 'boom' } }]);
    const r = await resendEmailService._dispatchSend({ from: 'a@b.al', to: 'x@example.com', subject: 's', html: '<p>h</p>' }, {});
    const row = await EmailOutbox.findById(r.outboxId).lean();
    expect(row.attachments).toBeUndefined();
  });
});
