import { QuickUser, User, Job } from '../models/index.js';
import resendEmailService from './resendEmailService.js';
import emailService from './emailService.js'; // kept for SMS only
import userEmbeddingService from '../services/userEmbeddingService.js';
import { escapeHtml, safeSubject } from '../utils/sanitize.js';
import logger from '../config/logger.js';
import { formatSalary } from './salary.js';
import { formatAlbanianDate } from './albanianDate.js';

// Salary line for job-alert emails. Stored salaries are ANNUAL; formatSalary
// converts to a monthly "800-1,500 EUR/muaj" string and returns null when the
// employer hid the salary or no numbers exist — callers then omit the line.
// Output is built only from numbers + the EUR/ALL enum, so it is HTML-safe.
const jobSalaryText = (job) => formatSalary(job?.salary, 'monthly');

// "Afati" (deadline) = the listing's expiresAt, rendered as an Albanian date in
// Tirana time ("3 tetor 2026", independent of the server's ICU data / TZ).
// Returns null for a missing/invalid date so the line is omitted instead of
// printing "Invalid Date" (Job has no applicationDeadline field).
const jobDeadlineText = (job) => formatAlbanianDate(job?.expiresAt) || null;

// Footer links every QuickUser job-alert email carries (manage + unsubscribe).
const quickUserFooterHtml = (user) => `
      <p>
        <a href="https://advance.al/preferences?token=${user.unsubscribeToken}" style="color: #667eea; text-decoration: none;">🔧 Ndrysho preferencat</a> |
        <a href="${user.getUnsubscribeUrl()}" style="color: #667eea; text-decoration: none;">❌ Çregjistrohu</a>
      </p>`;
const quickUserFooterText = (user) => `🔧 Ndrysho preferencat: https://advance.al/preferences?token=${user.unsubscribeToken}
❌ Çregjistrohu: ${user.getUnsubscribeUrl()}`;

class NotificationService {
  constructor() {
    this.isProcessing = false;
  }

  // Send email via Resend (consolidated — no longer uses Nodemailer for job alerts).
  // `meta` ({tags, userId, userType, jobId}) is threaded into the EmailOutbox row on
  // transient failure so the drain cron can re-check user preferences before the retry.
  async sendEmail(to, subject, htmlContent, textContent, meta = {}) {
    return await resendEmailService.sendTransactionalEmail(to, subject, htmlContent, textContent, meta);
  }

  // Send SMS using SMS service (Twilio placeholder)
  async sendSMS(to, message) {
    return await emailService.sendSMS(to, message);
  }

  // Generate email content for job notification
  generateJobNotificationEmail(user, job) {
    const unsubscribeUrl = user.getUnsubscribeUrl();
    const trackingUrl = `https://advance.al/api/quickusers/track-click`;

    // Extract company name from populated employerId
    const companyName = job.employerId?.profile?.employerProfile?.companyName || 'Kompani';

    // Sanitize user-supplied data for HTML templates. Quick profiles may have
    // no name (CV-first / "Nuk kam CV") — the greeting then has none.
    const safeFirstName = escapeHtml(user.firstName || '');
    const greetingName = user.firstName ? ` ${user.firstName}` : '';
    const safeGreetingName = safeFirstName ? ` ${safeFirstName}` : '';
    const safeJobTitle = escapeHtml(job.title);
    const safeCompanyName = escapeHtml(companyName);
    const safeCity = escapeHtml(job.location?.city);
    const safeDescription = escapeHtml(job.description?.substring(0, 300));
    const safeCategory = escapeHtml(job.category);
    const safeInterests = user.allInterests ? user.allInterests.map(i => escapeHtml(i)).join(', ') : '';
    const salaryText = jobSalaryText(job);
    const deadlineText = jobDeadlineText(job);

    const subject = safeSubject(`Punë e re: ${job.title || ''} në ${job.location?.city || ''}`);

    const textContent = `
Përshëndetje${greetingName},

Një punë e re që përputhet me interesat tuaja është publikuar:

📋 Pozicioni: ${job.title}
🏢 Kompania: ${companyName}
📍 Vendndodhja: ${job.location.city}${job.location.remote ? ' (Punë në distancë)' : ''}
${salaryText ? `💰 Paga: ${salaryText}\n` : ''}${deadlineText ? `📅 Afati: ${deadlineText}\n` : ''}
📝 Përshkrimi:
${job.description.substring(0, 200)}...

👀 Shiko detajet e plota dhe apliko: https://advance.al/jobs/${job.slug || job._id}

---

🔧 Ndrysho preferencat: https://advance.al/preferences?token=${user.unsubscribeToken}
❌ Çregjistrohu: ${unsubscribeUrl}

advance.al - Platforma #1 e Punës në Shqipëri
`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="sq">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="margin: 0;">🎯 Punë e re për ju!</h1>
      <p style="margin: 10px 0 0 0;">Përshëndetje${safeGreetingName}, gjenim një mundësi të shkëlqyer!</p>
    </div>

    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0;">
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
        <div style="font-size: 20px; font-weight: bold; color: #667eea; margin-bottom: 10px;">${safeJobTitle}</div>
        <div style="margin: 8px 0;"><strong style="color: #333;">🏢 Kompania:</strong> ${safeCompanyName}</div>
        <div style="margin: 8px 0;"><strong style="color: #333;">📍 Vendndodhja:</strong> ${safeCity}${job.location.remote ? ' <span style="color: #28a745;">(Punë në distancë)</span>' : ''}</div>
        ${salaryText ? `<div style="margin: 8px 0;"><strong style="color: #333;">💰 Paga:</strong> ${salaryText}</div>` : ''}
        ${deadlineText ? `<div style="margin: 8px 0;"><strong style="color: #333;">📅 Afati:</strong> ${deadlineText}</div>` : ''}
        <div style="margin: 8px 0;"><strong style="color: #333;">🎯 Kategoria:</strong> ${safeCategory}</div>
      </div>

      <p><strong>📝 Përshkrimi i shkurtër:</strong></p>
      <p>${safeDescription}${job.description?.length > 300 ? '...' : ''}</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://advance.al/jobs/${job.slug || job._id}?utm_source=email&utm_medium=notification&utm_campaign=job_match"
           style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">
          👀 Shiko Detajet dhe Apliko
        </a>
      </div>

      <p style="font-size: 14px; color: #666;">
        💡 <strong>Përse mora këtë email?</strong><br>
        Ky pozicion përputhet me interesat tuaja: ${safeInterests}
      </p>
    </div>

    <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666;">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      <p>
        <a href="https://advance.al/preferences?token=${user.unsubscribeToken}" style="color: #667eea; text-decoration: none;">🔧 Ndrysho preferencat</a> |
        <a href="${unsubscribeUrl}" style="color: #667eea; text-decoration: none;">❌ Çregjistrohu</a>
      </p>
      <p style="margin-top: 15px; font-size: 11px;">
        Ju merrni këtë email sepse jeni regjistruar për njoftimet e punës në advance.al.
        Nëse nuk dëshironi të merrni më email, mund të çregjistroheni duke klikuar linkun më sipër.
      </p>
    </div>
  </div>
</body>
</html>
`;

    return { subject, textContent, htmlContent };
  }

  // Generate SMS content for job notification
  generateJobNotificationSMS(user, job) {
    const companyName = job.employerId?.profile?.employerProfile?.companyName || 'Kompani';
    return `🎯 Punë e re: ${job.title} në ${companyName}, ${job.location.city}. Shiko: https://advance.al/jobs/${job.slug || job._id} | Çregjistrohu: ${user.getUnsubscribeUrl()}`;
  }

  // Generate email content for a full jobseeker account (no unsubscribe token — they manage via profile)
  generateFullUserJobNotificationEmail(user, job) {
    const firstName = user.profile?.firstName || 'Kandidat';
    const companyName = job.employerId?.profile?.employerProfile?.companyName || 'Kompani';

    // Sanitize for HTML
    const safeFirstName = escapeHtml(firstName);
    const safeJobTitle = escapeHtml(job.title);
    const safeCompanyName = escapeHtml(companyName);
    const safeCity = escapeHtml(job.location?.city);
    const safeDescription = escapeHtml(job.description?.substring(0, 300));
    const safeCategory = escapeHtml(job.category);
    const salaryText = jobSalaryText(job);
    const deadlineText = jobDeadlineText(job);

    const subject = safeSubject(`Punë e re: ${job.title || ''} në ${job.location?.city || ''}`);

    const textContent = `
Përshëndetje ${firstName},

Një punë e re që përputhet me profilin tuaj është publikuar:

📋 Pozicioni: ${job.title}
🏢 Kompania: ${companyName}
📍 Vendndodhja: ${job.location.city}${job.location.remote ? ' (Punë në distancë)' : ''}
${salaryText ? `💰 Paga: ${salaryText}\n` : ''}${deadlineText ? `📅 Afati: ${deadlineText}\n` : ''}
📝 Përshkrimi:
${job.description.substring(0, 200)}...

👀 Shiko detajet e plota dhe apliko: https://advance.al/jobs/${job.slug || job._id}

---
Mund të çaktivizoni njoftimet nga faqja juaj e profilit: https://advance.al/profile

advance.al - Platforma #1 e Punës në Shqipëri
`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="sq">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="margin: 0;">🎯 Punë e re për ju!</h1>
      <p style="margin: 10px 0 0 0;">Përshëndetje ${safeFirstName}, gjenim një mundësi të shkëlqyer!</p>
    </div>
    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0;">
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
        <div style="font-size: 20px; font-weight: bold; color: #667eea; margin-bottom: 10px;">${safeJobTitle}</div>
        <div style="margin: 8px 0;"><strong>🏢 Kompania:</strong> ${safeCompanyName}</div>
        <div style="margin: 8px 0;"><strong>📍 Vendndodhja:</strong> ${safeCity}${job.location.remote ? ' <span style="color:#28a745;">(Punë në distancë)</span>' : ''}</div>
        ${salaryText ? `<div style="margin: 8px 0;"><strong>💰 Paga:</strong> ${salaryText}</div>` : ''}
        ${deadlineText ? `<div style="margin: 8px 0;"><strong>📅 Afati:</strong> ${deadlineText}</div>` : ''}
        <div style="margin: 8px 0;"><strong>🎯 Kategoria:</strong> ${safeCategory}</div>
      </div>
      <p><strong>📝 Përshkrimi i shkurtër:</strong></p>
      <p>${safeDescription}${job.description?.length > 300 ? '...' : ''}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://advance.al/jobs/${job.slug || job._id}?utm_source=email&utm_medium=notification&utm_campaign=job_match_account"
           style="display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">👀 Shiko Detajet dhe Apliko</a>
      </div>
      <p style="font-size: 14px; color: #666;">
        💡 <strong>Përse mora këtë email?</strong><br>
        Keni aktivizuar njoftimet e punës në llogarinë tuaj dhe ky pozicion përputhet me profilin tuaj.
      </p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666;">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      <p><a href="https://advance.al/profile" style="color: #667eea; text-decoration: none;">⚙️ Menaxho njoftimet nga profili juaj</a></p>
    </div>
  </div>
</body>
</html>
`;

    return { subject, textContent, htmlContent };
  }

  /**
   * Build a single email summarising multiple matched jobs queued during the
   * digest window. Used by the digest flushes in jobAlertsDigest.js for both
   * full jobseeker accounts (User) and QuickUsers.
   *
   * @param {Object} user - jobseeker User document, or a QuickUser document
   *   when `options.audience === 'quickuser'`
   * @param {Array<Object>} jobs - list of Job docs (sorted desc by matchScore)
   * @param {{ audience?: 'jobseeker'|'quickuser' }} [options]
   */
  generateJobAlertsDigestEmail(user, jobs, options = {}) {
    const isQuickUser = options.audience === 'quickuser';
    const firstName = (isQuickUser ? user.firstName : user.profile?.firstName) || 'Kandidat';
    const safeFirstName = escapeHtml(firstName);
    const count = jobs.length;
    // Albanian agreement: pozicion is masculine. "1 pozicion i ri" (sg) vs
    // "N pozicione të reja" (pl). Verb "përputhet" (3rd-sg) vs "përputhen" (3rd-pl).
    // Demonstrative "ky" (sg-masc) vs "këto" (pl-fem-collective for nouns).
    // "punë" (job, feminine): "punë e re" (sg) vs "punë të reja" (pl).
    const isSingular = count === 1;
    const subject = safeSubject(`${count} ${isSingular ? 'punë e re' : 'punë të reja'} për ju në advance.al`);
    const positionsPhrase = isSingular ? '1 pozicion të ri' : `${count} pozicione të reja`;
    const matchesVerb = isSingular ? 'përputhet' : 'përputhen';
    const thisOrThese = isSingular ? 'Ky pozicion' : 'Këto pozicione';
    const groupingSentence = isSingular ? '' : ' Ne i grupojmë në një email për të mos ju shqetësuar shumë herë.';
    const target = isQuickUser ? 'interesat tuaja' : 'profilin tuaj';
    const utmCampaign = isQuickUser ? 'job_match_digest' : 'job_match';

    const textJobLines = jobs.map((job, i) => {
      const company = job.employerId?.profile?.employerProfile?.companyName || 'Kompani';
      const salaryText = jobSalaryText(job);
      const salary = salaryText ? ` — ${salaryText}` : '';
      return `${i + 1}. ${job.title} — ${company} (${job.location?.city || ''})${salary}\n   https://advance.al/jobs/${job.slug || job._id}`;
    }).join('\n\n');

    const textFooter = isQuickUser
      ? quickUserFooterText(user)
      : 'Menaxhoni njoftimet nga profili juaj: https://advance.al/profile';

    const textContent = `
Përshëndetje ${firstName},

Gjetëm ${positionsPhrase} që ${matchesVerb} me ${target}:

${textJobLines}

---
${textFooter}

advance.al - Platforma #1 e Punës në Shqipëri
`;

    const htmlJobCards = jobs.map(job => {
      const company = job.employerId?.profile?.employerProfile?.companyName || 'Kompani';
      const safeTitle = escapeHtml(job.title);
      const safeCompany = escapeHtml(company);
      const safeCity = escapeHtml(job.location?.city || '');
      const safeCategory = escapeHtml(job.category || '');
      const salaryText = jobSalaryText(job);
      const salaryLine = salaryText
        ? `<div style="margin: 4px 0; font-size: 13px;"><strong>💰</strong> ${salaryText}</div>`
        : '';
      return `
        <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 12px 0; border-left: 4px solid #667eea;">
          <div style="font-size: 17px; font-weight: bold; color: #667eea; margin-bottom: 6px;">${safeTitle}</div>
          <div style="margin: 4px 0; font-size: 13px;"><strong>🏢</strong> ${safeCompany}</div>
          <div style="margin: 4px 0; font-size: 13px;"><strong>📍</strong> ${safeCity}${job.location?.remote ? ' <span style="color:#28a745;">(distancë)</span>' : ''}${safeCategory ? ` · <span style="color:#666;">${safeCategory}</span>` : ''}</div>
          ${salaryLine}
          <div style="margin-top: 10px;">
            <a href="https://advance.al/jobs/${job.slug || job._id}?utm_source=email&utm_medium=digest&utm_campaign=${utmCampaign}"
               style="display: inline-block; background: #667eea; color: white; padding: 8px 18px; text-decoration: none; border-radius: 20px; font-size: 13px; font-weight: 600;">Shiko detajet →</a>
          </div>
        </div>`;
    }).join('');

    const whyText = isQuickUser
      ? `Jeni regjistruar për njoftimet e punës në advance.al dhe ${thisOrThese.toLowerCase()} ${matchesVerb} me interesat tuaja.${groupingSentence}`
      : `Keni aktivizuar njoftimet e punës dhe ${thisOrThese.toLowerCase()} ${matchesVerb} me profilin tuaj.${groupingSentence}`;
    const htmlFooterLinks = isQuickUser
      ? quickUserFooterHtml(user)
      : '<p><a href="https://advance.al/profile" style="color: #667eea; text-decoration: none;">⚙️ Menaxho njoftimet</a></p>';

    const htmlContent = `
<!DOCTYPE html>
<html lang="sq">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="margin: 0;">🎯 ${count} ${isSingular ? 'punë e re' : 'punë të reja'} për ju!</h1>
      <p style="margin: 10px 0 0 0;">Përshëndetje ${safeFirstName}, gjetëm ${positionsPhrase} që ${matchesVerb} me ${target}.</p>
    </div>
    <div style="background: #fff; padding: 24px; border: 1px solid #e0e0e0;">
      ${htmlJobCards}
      <p style="font-size: 14px; color: #666; margin-top: 24px;">
        💡 <strong>Përse mora këtë email?</strong><br>
        ${whyText}
      </p>
    </div>
    <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666;">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      ${htmlFooterLinks}
    </div>
  </div>
</body></html>
`;

    return { subject, textContent, htmlContent };
  }

  // Send job notification to a full jobseeker account (User model)
  async sendJobNotificationToFullUser(user, job) {
    try {
      const emailContent = this.generateFullUserJobNotificationEmail(user, job);
      const emailResult = await this.sendEmail(
        user.email,
        emailContent.subject,
        emailContent.htmlContent,
        emailContent.textContent
      );

      return {
        success: emailResult.success,
        userId: user._id,
        type: 'full_account',
        messageId: emailResult.messageId
      };
    } catch (error) {
      logger.error(`Error sending notification to full user ${user._id}:`, error.message);
      return { success: false, error: error.message, userId: user._id };
    }
  }

  // Send (or queue) a new-job alert to a QuickUser.
  //
  // Exactly-once + frequency gap, both enforced ATOMICALLY in Mongo
  // (QuickUser.claimJobAlertSlot) instead of on the in-memory snapshot the
  // matcher loaded — two fan-outs running at once can no longer both email
  // inside one gap or lose a counter increment:
  //   - gap passed and job never sent  → claim + send now
  //   - inside the gap (1h / 24h / 7d) → queue the job for the subscriber's
  //     next digest (jobAlertsDigest.flushQuickUserDigests) — never dropped
  //   - job already sent or queued     → skipped
  // A permanently rejected email (non-transient) or a crash before the send
  // releases the claim AND puts the job back in the subscriber's digest queue
  // (QuickUser.giveBackJobAlert, bounded to MAX_ALERT_DELIVERY_ATTEMPTS), so
  // the next digest retries it even though the job's fan-out as a whole is
  // recorded as sent.
  //
  // Delivery guarantee: at-most-once per (subscriber, job). The claim is taken
  // before the email is sent, so a process crash between claim and send loses
  // that one email (at most one in-flight batch of 4 per fan-out); it is never
  // sent twice.
  //
  // Returns { success, sent?, queued?, reason?, userId, notifications? }:
  // success === false only for a real delivery failure.
  async _giveBackJobAlert(user, job, claim, matchScore) {
    try {
      await QuickUser.giveBackJobAlert(user._id, job._id, claim, matchScore);
    } catch (err) {
      logger.error(`Could not give job alert back to QuickUser ${user._id}:`, err.message);
    }
  }

  async sendJobNotificationToUser(user, job, { matchScore = 0 } = {}) {
    let claim = null;
    try {
      // Guard: user has been deactivated since match-time → no send.
      if (user.isActive === false) {
        return { success: true, sent: false, reason: 'inactive', userId: user._id };
      }
      // Phone-only quick profile: alerts are emails — nothing to send or
      // queue (the matchers already skip these; defense in depth).
      if (!user.email) {
        return { success: true, sent: false, reason: 'no-email', userId: user._id };
      }

      claim = await QuickUser.claimJobAlertSlot(user._id, job._id);
      if (!claim.claimed) {
        const queued = await QuickUser.queueJobAlert(user._id, job._id, matchScore);
        return { success: true, sent: false, queued, reason: queued ? 'queued-for-digest' : 'already-notified-or-inactive', userId: user._id };
      }

      const notifications = [];

      // Send email notification (with provenance for outbox retry race-check)
      const emailContent = this.generateJobNotificationEmail(user, job);
      const emailResult = await this.sendEmail(
        user.email,
        emailContent.subject,
        emailContent.htmlContent,
        emailContent.textContent,
        { tags: ['job_match'], userId: user._id, userType: 'quickuser', jobId: job._id }
      );

      notifications.push({
        type: 'email',
        success: emailResult.success,
        messageId: emailResult.messageId
      });

      if (!emailResult.success) {
        // Not delivered and not queued in the outbox: give the slot back and
        // re-queue the job for this subscriber's next digest.
        await this._giveBackJobAlert(user, job, claim, matchScore);
        return { success: false, sent: false, error: emailResult.error || 'email send failed', userId: user._id, notifications };
      }

      // Send SMS notification if user has opted in and provided phone
      if (user.preferences?.smsNotifications && user.phone) {
        const smsContent = this.generateJobNotificationSMS(user, job);
        const smsResult = await this.sendSMS(user.phone, smsContent);

        notifications.push({
          type: 'sms',
          success: smsResult.success,
          messageId: smsResult.messageId
        });
      }

      return {
        success: true,
        sent: true,
        notifications,
        userId: user._id
      };

    } catch (error) {
      logger.error(`Error sending notification to user ${user._id}:`, error.message);
      if (claim?.claimed) {
        // The email did not go out: hand the slot back and re-queue the job.
        await this._giveBackJobAlert(user, job, claim, matchScore);
      }
      return {
        success: false,
        error: error.message,
        userId: user._id
      };
    }
  }

  // Notify all matching users about a new job.
  // Uses semantic embedding matching (preferred) with keyword fallback for QuickUsers.
  // Also notifies full jobseeker accounts that have opted into alerts (semantic only).
  //
  // Returns { success: false, error } when the fan-out did NOT complete —
  // a lookup failed (job, matchers) or every targeted delivery failed — so the
  // caller marks the job's notification 'failed' and the retry sweep runs it
  // again. A retry is safe: QuickUsers remember announced job ids and the
  // jobseeker digest queue is deduplicated per job.
  //
  // { dryRun: true } runs the matching only and reports who WOULD be
  // notified (and how) — nothing is sent, queued or recorded. Used by the
  // admin "test" endpoint, which must not announce a job outside the job's
  // exactly-once claim (services/jobFanOut.js).
  async notifyMatchingUsers(job, { dryRun = false } = {}) {
    try {
      // Load job with embedding vector (select: false by default)
      const jobWithVector = await Job.findById(job._id).select('+embedding.vector').populate('employerId', '_id');
      const jobForSemantic = jobWithVector || job;

      // Defense-in-depth: refuse to fan-out a job whose employer was deleted.
      // The cascade hook on User prevents this for programmatic deletes; this
      // guard handles Atlas-UI deletes + pre-existing orphans.
      if (jobWithVector && jobWithVector.employerId == null) {
        logger.warn('notifyMatchingUsers: refusing to fan-out orphan job', { jobId: String(job._id), title: jobWithVector.title });
        return {
          success: true,
          message: 'Job has no live employer — skipped fan-out (orphan).',
          stats: { totalUsers: 0, notificationsSent: 0, errors: 0, breakdown: { quickUsers: 0, jobSeekers: 0, semanticMatches: 0, keywordMatches: 0 } }
        };
      }

      // ── 1. Semantic matching (QuickUsers + full jobseekers) ──────────────────
      let semanticQuickUsers = [];
      let semanticJobSeekers = [];
      let semanticError = null;
      try {
        const semanticResult = await userEmbeddingService.findSemanticMatchesForJob(jobForSemantic);
        semanticQuickUsers = semanticResult.quickUsers || [];
        semanticJobSeekers = semanticResult.jobSeekers || [];
      } catch (err) {
        // Keep going with the keyword path (those subscribers should not wait),
        // but report the fan-out as failed so it is retried for the embedded
        // QuickUsers and the jobseekers this lookup never reached.
        semanticError = err;
        logger.error('Semantic matching failed, falling back to keyword-only:', err.message);
      }

      // ── 2. Keyword fallback for QuickUsers (always run, deduplicated later) ──
      let keywordQuickUsers = [];
      keywordQuickUsers = await QuickUser.findMatchesForJob(job);

      // ── 3. Merge & deduplicate QuickUser lists ───────────────────────────────
      const semanticQuickUserIds = new Set((semanticQuickUsers || []).map(e => e.user._id.toString()));
      const quickUserScore = new Map((semanticQuickUsers || []).map(e => [e.user._id.toString(), e.score]));
      // Extract raw user docs (semantic results are { user, score } objects)
      const semanticQuickUserDocs = (semanticQuickUsers || []).map(e => e.user);
      const newKeywordUsers = keywordQuickUsers.filter(
        u => !semanticQuickUserIds.has(u._id.toString())
      );
      const allQuickUsers = [...semanticQuickUserDocs, ...newKeywordUsers];
      const allJobSeekers = (semanticJobSeekers || []).map(e => e.user);

      const totalTargets = allQuickUsers.length + allJobSeekers.length;

      if (totalTargets === 0) {
        if (semanticError) {
          return {
            success: false,
            ...(dryRun ? { dryRun: true } : {}),
            error: `semantic matching failed: ${semanticError.message}`,
            stats: { totalUsers: 0, notificationsSent: 0, errors: 1 }
          };
        }
        return {
          success: true,
          ...(dryRun ? { dryRun: true } : {}),
          message: 'No matching users found',
          stats: { totalUsers: 0, notificationsSent: 0, errors: 0 }
        };
      }

      if (dryRun) {
        const jobIdStr = String(job._id);
        const quickUsers = allQuickUsers.map(u => {
          const alreadySent = (u.notifiedJobIds || []).some(id => String(id) === jobIdStr)
            || (u.pendingJobAlerts || []).some(p => String(p.jobId) === jobIdStr);
          const action = u.isActive === false || alreadySent
            ? 'skip'
            : (u.canReceiveNotification === false ? 'queue_for_digest' : 'email_now');
          return {
            id: u._id, email: u.email, action,
            path: semanticQuickUserIds.has(u._id.toString()) ? 'semantic' : 'keyword',
            score: quickUserScore.get(u._id.toString()) ?? null,
          };
        });
        const jobSeekers = allJobSeekers.map(u => ({
          id: u._id, email: u.email,
          action: (u.pendingJobAlerts || []).some(p => String(p.jobId) === jobIdStr) ? 'skip' : 'queue_for_digest',
          score: (semanticJobSeekers || []).find(e => e.user._id.toString() === u._id.toString())?.score ?? null,
        }));
        const count = (list, action) => list.filter(x => x.action === action).length;
        return {
          success: !semanticError,
          dryRun: true,
          ...(semanticError ? { error: `semantic matching failed: ${semanticError.message}` } : {}),
          stats: {
            totalUsers: totalTargets,
            wouldEmailNow: count(quickUsers, 'email_now'),
            wouldQueueForDigest: count(quickUsers, 'queue_for_digest') + count(jobSeekers, 'queue_for_digest'),
            wouldSkip: count(quickUsers, 'skip') + count(jobSeekers, 'skip'),
            notificationsSent: 0,
            breakdown: {
              quickUsers: allQuickUsers.length,
              jobSeekers: allJobSeekers.length,
              semanticMatches: semanticQuickUsers.length + allJobSeekers.length,
              keywordMatches: newKeywordUsers.length
            }
          },
          recipients: { quickUsers, jobSeekers }
        };
      }

      const results = [];
      let successCount = 0;
      let quickUsersQueued = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // ── 4. Notify QuickUsers ─────────────────────────────────────────────────
      // Resend rate limit: 5 req/sec. Batch of 4 + 1.2s delay gives safe margin.
      const batchSize = 4;
      const batchDelay = 1200;
      for (let i = 0; i < allQuickUsers.length; i += batchSize) {
        const batch = allQuickUsers.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(user => this.sendJobNotificationToUser(user, job, { matchScore: quickUserScore.get(user._id.toString()) || 0 }))
        );

        let batchSent = 0;
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (!result.value.success) errorCount++;
            else if (result.value.sent) { successCount++; batchSent++; }
            else if (result.value.queued) quickUsersQueued++;
            else skippedCount++;
          } else {
            logger.error(`QuickUser batch error for ${batch[index]._id}:`, result.reason?.message || result.reason);
            errorCount++;
          }
        });

        // Only pace when this batch actually hit Resend.
        if (batchSent > 0 && i + batchSize < allQuickUsers.length) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      // ── 5. Queue full jobseeker accounts for 2h digest (instead of immediate send) ──
      // Per UX rationale: a busy afternoon with 5 matching jobs would otherwise
      // produce 5 separate emails to the same user. Now we batch into a single
      // digest. The flush cron in server.js sends when the user's oldest queued
      // alert exceeds the digest window (default 2h).
      let queuedCount = 0;
      const digestModule = await import('../services/jobAlertsDigest.js');
      // semanticJobSeekers retains { user, score } pairs; allJobSeekers is the
      // capped doc array. Build a quick score lookup so we preserve match scores.
      const scoreByUserId = new Map(
        (semanticJobSeekers || []).map(e => [e.user._id.toString(), e.score])
      );
      for (const u of allJobSeekers) {
        try {
          const r = await digestModule.queueMatchForDigest(u, job, scoreByUserId.get(u._id.toString()) || 0);
          if (r.queued) queuedCount++;
          else skippedCount++;
        } catch (err) {
          logger.error(`Digest queue error for jobseeker ${u._id}:`, err.message);
          errorCount++;
        }
      }

      const stats = {
        totalUsers: totalTargets,
        notificationsSent: successCount,
        quickUsersQueuedForDigest: quickUsersQueued,
        jobseekersQueuedForDigest: queuedCount,
        skipped: skippedCount,
        errors: errorCount,
        breakdown: {
          quickUsers: allQuickUsers.length,
          jobSeekers: allJobSeekers.length,
          semanticMatches: semanticQuickUsers.length + allJobSeekers.length,
          keywordMatches: newKeywordUsers.length
        }
      };

      // Every targeted delivery failed (e.g. Resend rejecting all sends):
      // nothing reached anyone, so this is a failed fan-out, not a sent one.
      const delivered = successCount + quickUsersQueued + queuedCount + skippedCount;
      if (semanticError || (errorCount > 0 && delivered === 0)) {
        return {
          success: false,
          error: semanticError
            ? `semantic matching failed: ${semanticError.message}`
            : `all ${errorCount} deliveries failed`,
          stats,
          results
        };
      }

      return {
        success: true,
        message: `Notifications sent to ${successCount} users, queued ${quickUsersQueued} quick-user and ${queuedCount} jobseeker digests`,
        stats,
        results
      };

    } catch (error) {
      logger.error('Error notifying matching users:', error.message);
      return {
        success: false,
        error: error.message,
        stats: { totalUsers: 0, notificationsSent: 0, errors: 1 }
      };
    }
  }

  /**
   * Notify a user about existing jobs that match their profile.
   * Called after a QuickUser signs up or a jobseeker registers/updates their profile.
   * Finds matching jobs via semantic embedding, then sends a single digest email.
   *
   * @param {Object} params
   * @param {string} params.type - 'quickuser' or 'jobseeker'
   * @param {string} params.userId - The user's _id
   * @returns {Promise<Object>} Result with matchCount and email status
   */
  async notifyUserAboutMatchingJobs({ type, userId }) {
    try {
      let userVector = null;
      let userEmail = null;
      let firstName = null;
      let city = null;
      let quickUser = null;

      if (type === 'quickuser') {
        const qu = await QuickUser.findById(userId).select('+embedding.vector');
        if (!qu || qu.embedding?.status !== 'completed' || !qu.embedding?.vector) {
          return { success: true, matchCount: 0, message: 'No embedding available yet' };
        }
        if (qu.isActive === false) {
          return { success: true, matchCount: 0, message: 'Subscriber is not active' };
        }
        if (!qu.email) {
          return { success: true, matchCount: 0, message: 'Subscriber has no email' };
        }
        quickUser = qu;
        userVector = qu.embedding.vector;
        userEmail = qu.email;
        firstName = qu.firstName;
        city = qu.location;
      } else {
        const user = await User.findById(userId).select('+profile.jobSeekerProfile.embedding.vector');
        if (!user || user.profile?.jobSeekerProfile?.embedding?.status !== 'completed') {
          return { success: true, matchCount: 0, message: 'No embedding available yet' };
        }
        userVector = user.profile.jobSeekerProfile.embedding.vector;
        userEmail = user.email;
        firstName = user.profile?.firstName;
        city = user.profile?.location?.city;
      }

      // Find matching jobs (live listings only; a job whose employer account
      // is gone is not advertised)
      const matches = (await userEmbeddingService.findMatchingJobsForUser(userVector, { limit: 5, city }))
        .filter(({ job }) => job.employerId != null);

      if (matches.length === 0) {
        logger.info(`No matching jobs found for ${type} ${userId}`);
        return { success: true, matchCount: 0, message: 'No matching jobs found' };
      }

      // Build digest email with top matches
      const safeFirstName = escapeHtml(firstName || 'Kandidat');
      const jobListHtml = matches.map(({ job, score }) => {
        const safeTitle = escapeHtml(job.title);
        const safeCompany = escapeHtml(job.employerId?.profile?.employerProfile?.companyName || 'Kompani');
        const safeCity = escapeHtml(job.location?.city || '');
        const salaryText = jobSalaryText(job) || '';
        return `
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #667eea;">
            <div style="font-weight: bold; color: #333; margin-bottom: 5px;">${safeTitle}</div>
            <div style="font-size: 13px; color: #666;">🏢 ${safeCompany} &nbsp; 📍 ${safeCity}${salaryText ? ` &nbsp; 💰 ${salaryText}` : ''}</div>
            <div style="margin-top: 10px;">
              <a href="https://advance.al/jobs/${job.slug || job._id}?utm_source=email&utm_medium=welcome_match&utm_campaign=new_user_jobs"
                 style="display: inline-block; background: #667eea; color: white; padding: 8px 16px; text-decoration: none; border-radius: 20px; font-size: 13px; font-weight: bold;">Shiko Detajet</a>
            </div>
          </div>`;
      }).join('');

      const jobListText = matches.map(({ job }) => {
        const company = job.employerId?.profile?.employerProfile?.companyName || 'Kompani';
        return `- ${job.title} (${company}, ${job.location?.city || ''}) → https://advance.al/jobs/${job.slug || job._id}`;
      }).join('\n');

      const subject = `🎯 Gjenim ${matches.length} punë që përputhen me profilin tuaj!`;

      const htmlContent = `
<!DOCTYPE html>
<html lang="sq">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="margin: 0;">🎯 Punë që përputhen me ju!</h1>
      <p style="margin: 10px 0 0 0;">Përshëndetje ${safeFirstName}, gjenim ${matches.length} mundësi bazuar në profilin tuaj</p>
    </div>
    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0;">
      <p>Bazuar në aftësitë dhe interesat tuaja, këto punë mund t'ju interesojnë:</p>
      ${jobListHtml}
      <div style="text-align: center; margin: 25px 0;">
        <a href="https://advance.al?utm_source=email&utm_medium=welcome_match"
           style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold;">🔍 Shiko të gjitha punët</a>
      </div>
      <p style="font-size: 13px; color: #888;">Do të vazhdoni të merrni njoftime kur postohen punë të reja që përputhen me profilin tuaj.</p>
    </div>
    <div style="background: #f8f9fa; padding: 15px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; text-align: center;">
      <p><strong>advance.al</strong> — Platforma #1 e Punës në Shqipëri</p>
      ${quickUser ? quickUserFooterHtml(quickUser) : '<p><a href="https://advance.al/profile" style="color: #667eea; text-decoration: none;">⚙️ Menaxho njoftimet nga profili juaj</a></p>'}
    </div>
  </div>
</body>
</html>`;

      const textFooter = quickUser ? quickUserFooterText(quickUser) : 'Menaxhoni njoftimet nga profili juaj: https://advance.al/profile';
      const textContent = `Përshëndetje ${firstName || 'Kandidat'},\n\nGjenim ${matches.length} punë që përputhen me profilin tuaj:\n\n${jobListText}\n\nShiko të gjitha punët: https://advance.al\n\n---\n${textFooter}\n\nadvance.al — Platforma #1 e Punës në Shqipëri`;

      // Send the digest email (provenance lets the outbox drain re-check the
      // subscriber before a retry)
      const emailResult = await this.sendEmail(userEmail, subject, htmlContent, textContent, {
        tags: ['welcome_matches'],
        userId,
        userType: type === 'quickuser' ? 'quickuser' : 'user',
      });

      logger.info(`Sent ${matches.length} matching jobs to ${type} ${userId} (${userEmail})`);

      return {
        success: emailResult.success,
        matchCount: matches.length,
        email: userEmail,
        messageId: emailResult.messageId
      };
    } catch (error) {
      logger.error(`Error notifying ${type} ${userId} about matching jobs:`, error.message);
      return { success: false, matchCount: 0, error: error.message };
    }
  }

  // Send welcome email to new quick user
  async sendWelcomeEmail(user) {
    try {
      const subject = 'Mirë se vini në advance.al! 🎉';

      const textContent = `
Përshëndetje ${user.firstName},

Mirë se vini në advance.al - Platforma #1 e Punës në Shqipëri! 🎉

Ju regjistruat me sukses për të marrë njoftimet e punës që përputhen me interesat tuaja:
${user.allInterests.map(interest => `• ${interest}`).join('\n')}

🎯 Çfarë do të ndodhë tani?
• Do të merrni email për punë të reja që përputhen me kriteret tuaja
• Mund të ndryshoni preferencat tuaja në çdo kohë
• Gjithçka është falas!

🔧 Ndrysho preferencat: https://advance.al/preferences?token=${user.unsubscribeToken}
❌ Çregjistrohu: ${user.getUnsubscribeUrl()}

Faleminderit që na zgjodht!

Ekipi i advance.al
`;

      const htmlContent = `
<!DOCTYPE html>
<html lang="sq">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="margin: 0;">🎉 Mirë se vini në advance.al!</h1>
      <p style="margin: 10px 0 0 0;">Platforma #1 e Punës në Shqipëri</p>
    </div>

    <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0;">
      <h2>Përshëndetje ${escapeHtml(user.firstName)}!</h2>

      <p>Ju regjistruat me sukses për të marrë njoftimet e punës nga advance.al! 🎯</p>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>🎯 Interesat tuaja:</h3>
        <ul>
          ${user.allInterests.map(interest => `<li>${escapeHtml(interest)}</li>`).join('')}
        </ul>
      </div>

      <h3>📋 Çfarë do të ndodhë tani?</h3>
      <ul>
        <li>✅ Do të merrni email për punë të reja që përputhen me interesat tuaja</li>
        <li>🔧 Mund të ndryshoni preferencat tuaja në çdo kohë</li>
        <li>💰 Gjithçka është falas!</li>
        <li>🚀 Qasje e parë në punët më të mira në Shqipëri</li>
      </ul>

      <p style="margin-top: 30px;">
        <strong>Faleminderit që na zgjodht!</strong><br>
        Ekipi i advance.al
      </p>
    </div>

    <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666;">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      <p>
        <a href="https://advance.al/preferences?token=${user.unsubscribeToken}" style="color: #667eea; text-decoration: none;">🔧 Ndrysho preferencat</a> |
        <a href="${user.getUnsubscribeUrl()}" style="color: #667eea; text-decoration: none;">❌ Çregjistrohu</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

      const result = await this.sendEmail(
        user.email,
        subject,
        htmlContent,
        textContent
      );

      return result;

    } catch (error) {
      logger.error('Error sending welcome email:', error.message);
      throw error;
    }
  }

  // Notify admin users about a new report
  async notifyAdmins(type, report) {
    try {
      const admins = await User.find({ userType: 'admin', isDeleted: false }).select('email profile.firstName').lean();
      if (admins.length === 0) return { success: true, message: 'No admins to notify' };

      const subject = safeSubject(type === 'new_report'
        ? `Raportim i ri në advance.al — ${report.reason || 'Pa arsye'}`
        : `Njoftim admin: ${type}`);

      for (const admin of admins) {
        const name = admin.profile?.firstName || 'Admin';
        const html = `<p>Përshëndetje ${escapeHtml(name)},</p>
          <p>Një raportim i ri është bërë në platformë.</p>
          <p><strong>Arsyeja:</strong> ${escapeHtml(report.reason || 'Nuk është specifikuar')}</p>
          <p><a href="https://advance.al/admin">Shiko në panel</a></p>`;
        await this.sendEmail(admin.email, subject, html, `Raportim i ri: ${report.reason || 'Pa arsye'}`).catch(err =>
          logger.error(`Failed to notify admin ${admin.email}:`, err.message)
        );
      }
      return { success: true, message: `Notified ${admins.length} admins` };
    } catch (error) {
      logger.error('Error notifying admins:', error.message);
      return { success: false, error: error.message };
    }
  }

  // QuickUser digests (matches queued while the subscriber's immediate /
  // daily / weekly email gap was running). The 15-minute cron
  // (jobAlertsDigest.flushPendingJobAlerts) sends them automatically; these
  // admin triggers just run that flush now. Both send every digest that is
  // due — the gap per subscriber decides, not which button was pressed.
  async sendDailyDigest() {
    const { flushQuickUserDigests } = await import('../services/jobAlertsDigest.js');
    const stats = await flushQuickUserDigests();
    return { success: true, message: `QuickUser digests sent: ${stats.sent}`, stats };
  }

  async sendWeeklyDigest() {
    return this.sendDailyDigest();
  }
}

// Export singleton instance
export default new NotificationService();