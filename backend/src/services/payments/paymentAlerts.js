/**
 * Admin alerts for money problems that need a human: duplicate payments,
 * amount/currency/livemode mismatches, disputes, payments for dead jobs,
 * production running without provider keys.
 *
 * Two channels, both fire-and-forget (never throw into a money path):
 *   - Discord `payments` channel (DISCORD_WEBHOOK_PAYMENTS)
 *   - email to ALERT_EMAIL_TO (default ops@advance.al) via Resend
 *
 * Email is de-duplicated in-process per dedupKey for 10 minutes so a webhook
 * retry storm cannot spam the inbox (Discord has its own dedupe).
 */

import logger from '../../config/logger.js';
import { notifyDiscord } from '../discordNotifier.js';
import resendEmailService from '../../lib/resendEmailService.js';
import { escapeHtml } from '../../utils/sanitize.js';

const EMAIL_DEDUP_MS = 10 * 60 * 1000;
const recentEmails = new Map();

function shouldEmail(dedupKey) {
  if (!dedupKey) return true;
  const now = Date.now();
  for (const [k, exp] of recentEmails) {
    if (exp < now) recentEmails.delete(k);
  }
  if (recentEmails.has(dedupKey)) return false;
  recentEmails.set(dedupKey, now + EMAIL_DEDUP_MS);
  return true;
}

/**
 * @param {object} p
 * @param {string} p.title         short headline (also the email subject)
 * @param {string} [p.description]
 * @param {Array<{name:string,value:string}>} [p.fields]
 * @param {string} [p.dedupKey]
 * @param {boolean} [p.email=true] also email ALERT_EMAIL_TO
 */
export function alertPaymentsAdmin({ title, description, fields = [], dedupKey, email = true }) {
  try {
    notifyDiscord({
      channel: 'payments',
      title,
      description,
      color: 0xe74c3c,
      fields: fields.map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value ?? '—').slice(0, 1024), inline: !!f.inline })),
      dedupKey,
    });
  } catch (err) {
    logger.warn('paymentAlerts: discord failed', { error: err.message });
  }

  if (!email || !shouldEmail(dedupKey)) return;
  const to = process.env.ALERT_EMAIL_TO || 'ops@advance.al';
  const rowsHtml = fields.map((f) => `<tr><td style="padding:4px 8px;color:#6b7280">${escapeHtml(String(f.name))}</td><td style="padding:4px 8px;font-family:monospace">${escapeHtml(String(f.value ?? '—'))}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif">
<h2 style="color:#dc2626">${escapeHtml(title)}</h2>
${description ? `<p>${escapeHtml(description)}</p>` : ''}
<table style="border-collapse:collapse;font-size:14px">${rowsHtml}</table>
<p style="color:#6b7280;font-size:12px">advance.al payments — see PAYMENTS.md runbook. Admin panel → Pagesat.</p>
</body></html>`;
  const text = `${title}\n\n${description || ''}\n\n${fields.map((f) => `${f.name}: ${f.value ?? '—'}`).join('\n')}\n\nSee PAYMENTS.md runbook.`;
  Promise.resolve()
    .then(() => resendEmailService.sendTransactionalEmail(to, `[advance.al payments] ${title}`.slice(0, 200), html, text, { tags: ['admin_alert', 'payments'] }))
    .catch((err) => logger.warn('paymentAlerts: email failed', { error: err.message }));
}

export default { alertPaymentsAdmin };
