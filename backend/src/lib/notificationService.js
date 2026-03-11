import { QuickUser, User } from '../models/index.js';
import resendEmailService from './resendEmailService.js';
import emailService from './emailService.js'; // kept for SMS only
import userEmbeddingService from '../services/userEmbeddingService.js';
import { escapeHtml } from '../utils/sanitize.js';

class NotificationService {
  constructor() {
    this.isProcessing = false;
  }

  // Send email via Resend (consolidated — no longer uses Nodemailer for job alerts)
  async sendEmail(to, subject, htmlContent, textContent) {
    return await resendEmailService.sendTransactionalEmail(to, subject, htmlContent, textContent);
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

    // Sanitize user-supplied data for HTML templates
    const safeFirstName = escapeHtml(user.firstName);
    const safeJobTitle = escapeHtml(job.title);
    const safeCompanyName = escapeHtml(companyName);
    const safeCity = escapeHtml(job.location?.city);
    const safeDescription = escapeHtml(job.description?.substring(0, 300));
    const safeCategory = escapeHtml(job.category);
    const safeInterests = user.allInterests ? user.allInterests.map(i => escapeHtml(i)).join(', ') : '';

    const subject = `Punë e re: ${safeJobTitle} në ${safeCity}`;

    const textContent = `
Përshëndetje ${user.firstName},

Një punë e re që përputhet me interesat tuaja është publikuar:

📋 Pozicioni: ${job.title}
🏢 Kompania: ${companyName}
📍 Vendndodhja: ${job.location.city}${job.location.remote ? ' (Punë në distancë)' : ''}
💰 Paga: ${job.salary ? `${job.salary.min}-${job.salary.max} ${job.salary.currency}` : 'Nuk është specifikuar'}
📅 Afati: ${new Date(job.applicationDeadline).toLocaleDateString('sq-AL')}

📝 Përshkrimi:
${job.description.substring(0, 200)}...

👀 Shiko detajet e plota dhe apliko: https://advance.al/jobs/${job._id}

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
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; }
    .job-card { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .job-title { font-size: 20px; font-weight: bold; color: #667eea; margin-bottom: 10px; }
    .job-info { margin: 8px 0; }
    .job-info strong { color: #333; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Punë e re për ju!</h1>
      <p>Përshëndetje ${safeFirstName}, gjenim një mundësi të shkëlqyer!</p>
    </div>

    <div class="content">
      <div class="job-card">
        <div class="job-title">${safeJobTitle}</div>
        <div class="job-info"><strong>🏢 Kompania:</strong> ${safeCompanyName}</div>
        <div class="job-info"><strong>📍 Vendndodhja:</strong> ${safeCity}${job.location.remote ? ' <span style="color: #28a745;">(Punë në distancë)</span>' : ''}</div>
        ${job.salary ? `<div class="job-info"><strong>💰 Paga:</strong> ${job.salary.min}-${job.salary.max} ${job.salary.currency}</div>` : ''}
        <div class="job-info"><strong>📅 Afati:</strong> ${new Date(job.applicationDeadline).toLocaleDateString('sq-AL')}</div>
        <div class="job-info"><strong>🎯 Kategoria:</strong> ${safeCategory}</div>
      </div>

      <p><strong>📝 Përshkrimi i shkurtër:</strong></p>
      <p>${safeDescription}${job.description?.length > 300 ? '...' : ''}</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://advance.al/jobs/${job._id}?utm_source=email&utm_medium=notification&utm_campaign=job_match&token=${user.unsubscribeToken}"
           class="cta-button" onclick="fetch('${trackingUrl}', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: '${user.unsubscribeToken}'})})">
          👀 Shiko Detajet dhe Apliko
        </a>
      </div>

      <p style="font-size: 14px; color: #666;">
        💡 <strong>Përse mora këtë email?</strong><br>
        Ky pozicion përputhet me interesat tuaja: ${safeInterests}
      </p>
    </div>

    <div class="footer">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      <p>
        <a href="https://advance.al/preferences?token=${user.unsubscribeToken}">🔧 Ndrysho preferencat</a> |
        <a href="${unsubscribeUrl}">❌ Çregjistrohu</a>
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
    return `🎯 Punë e re: ${job.title} në ${companyName}, ${job.location.city}. Shiko: https://advance.al/jobs/${job._id} | Çregjistrohu: ${user.getUnsubscribeUrl()}`;
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

    const subject = `Punë e re: ${safeJobTitle} në ${safeCity}`;

    const textContent = `
Përshëndetje ${firstName},

Një punë e re që përputhet me profilin tuaj është publikuar:

📋 Pozicioni: ${job.title}
🏢 Kompania: ${companyName}
📍 Vendndodhja: ${job.location.city}${job.location.remote ? ' (Punë në distancë)' : ''}
💰 Paga: ${job.salary ? `${job.salary.min}-${job.salary.max} ${job.salary.currency}` : 'Nuk është specifikuar'}
📅 Afati: ${new Date(job.applicationDeadline).toLocaleDateString('sq-AL')}

📝 Përshkrimi:
${job.description.substring(0, 200)}...

👀 Shiko detajet e plota dhe apliko: https://advance.al/jobs/${job._id}

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
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; }
    .job-card { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .job-title { font-size: 20px; font-weight: bold; color: #667eea; margin-bottom: 10px; }
    .job-info { margin: 8px 0; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Punë e re për ju!</h1>
      <p>Përshëndetje ${safeFirstName}, gjenim një mundësi të shkëlqyer!</p>
    </div>
    <div class="content">
      <div class="job-card">
        <div class="job-title">${safeJobTitle}</div>
        <div class="job-info"><strong>🏢 Kompania:</strong> ${safeCompanyName}</div>
        <div class="job-info"><strong>📍 Vendndodhja:</strong> ${safeCity}${job.location.remote ? ' <span style="color:#28a745;">(Punë në distancë)</span>' : ''}</div>
        ${job.salary ? `<div class="job-info"><strong>💰 Paga:</strong> ${job.salary.min}-${job.salary.max} ${job.salary.currency}</div>` : ''}
        <div class="job-info"><strong>📅 Afati:</strong> ${new Date(job.applicationDeadline).toLocaleDateString('sq-AL')}</div>
        <div class="job-info"><strong>🎯 Kategoria:</strong> ${safeCategory}</div>
      </div>
      <p><strong>📝 Përshkrimi i shkurtër:</strong></p>
      <p>${safeDescription}${job.description?.length > 300 ? '...' : ''}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://advance.al/jobs/${job._id}?utm_source=email&utm_medium=notification&utm_campaign=job_match_account"
           class="cta-button">👀 Shiko Detajet dhe Apliko</a>
      </div>
      <p style="font-size: 14px; color: #666;">
        💡 <strong>Përse mora këtë email?</strong><br>
        Keni aktivizuar njoftimet e punës në llogarinë tuaj dhe ky pozicion përputhet me profilin tuaj.
      </p>
    </div>
    <div class="footer">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      <p><a href="https://advance.al/profile">⚙️ Menaxho njoftimet nga profili juaj</a></p>
    </div>
  </div>
</body>
</html>
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
      console.error(`Error sending notification to full user ${user._id}:`, error);
      return { success: false, error: error.message, userId: user._id };
    }
  }

  // Send job notification to a specific user
  async sendJobNotificationToUser(user, job) {
    try {
      const notifications = [];

      // Send email notification
      const emailContent = this.generateJobNotificationEmail(user, job);
      const emailResult = await this.sendEmail(
        user.email,
        emailContent.subject,
        emailContent.htmlContent,
        emailContent.textContent
      );

      notifications.push({
        type: 'email',
        success: emailResult.success,
        messageId: emailResult.messageId
      });

      // Send SMS notification if user has opted in and provided phone
      if (user.preferences.smsNotifications && user.phone) {
        const smsContent = this.generateJobNotificationSMS(user, job);
        const smsResult = await this.sendSMS(user.phone, smsContent);

        notifications.push({
          type: 'sms',
          success: smsResult.success,
          messageId: smsResult.messageId
        });
      }

      // Record notification sent
      await user.recordNotificationSent(job._id);

      return {
        success: true,
        notifications,
        userId: user._id
      };

    } catch (error) {
      console.error(`Error sending notification to user ${user._id}:`, error);
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
  async notifyMatchingUsers(job) {
    try {
      console.log(`🔍 Finding users to notify for job: ${job.title}`);

      // ── 1. Semantic matching (QuickUsers + full jobseekers) ──────────────────
      const { quickUsers: semanticQuickUsers, jobSeekers: semanticJobSeekers } =
        await userEmbeddingService.findSemanticMatchesForJob(job);

      console.log(`🧠 Semantic matches: ${semanticQuickUsers.length} QuickUsers, ${semanticJobSeekers.length} jobseekers`);

      // ── 2. Keyword fallback for QuickUsers (when job has no embedding) ───────
      let keywordQuickUsers = [];
      const jobHasEmbedding = job.embedding?.vector?.length === 1536;

      if (!jobHasEmbedding) {
        console.log('⚠️  Job has no embedding — falling back to keyword matching for QuickUsers');
        keywordQuickUsers = await QuickUser.findMatchesForJob(job);
        console.log(`🔑 Keyword matches: ${keywordQuickUsers.length} QuickUsers`);
      }

      // ── 3. Merge & deduplicate QuickUser lists ───────────────────────────────
      const semanticQuickUserIds = new Set(semanticQuickUsers.map(e => e.user._id.toString()));
      // Extract raw user docs (semantic results are { user, score } objects)
      const semanticQuickUserDocs = semanticQuickUsers.map(e => e.user);
      const newKeywordUsers = keywordQuickUsers.filter(
        u => !semanticQuickUserIds.has(u._id.toString())
      );
      const allQuickUsers = [...semanticQuickUserDocs, ...newKeywordUsers];
      const allJobSeekers = semanticJobSeekers.map(e => e.user);

      const totalTargets = allQuickUsers.length + allJobSeekers.length;
      console.log(`📧 Total notification targets: ${totalTargets} (${allQuickUsers.length} QuickUsers + ${allJobSeekers.length} jobseekers)`);

      if (totalTargets === 0) {
        return {
          success: true,
          message: 'No matching users found',
          stats: { totalUsers: 0, notificationsSent: 0, errors: 0 }
        };
      }

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      // ── 4. Notify QuickUsers ─────────────────────────────────────────────────
      const batchSize = 10;
      for (let i = 0; i < allQuickUsers.length; i += batchSize) {
        const batch = allQuickUsers.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(user => this.sendJobNotificationToUser(user, job))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            result.value.success ? successCount++ : errorCount++;
          } else {
            console.error(`QuickUser batch error for ${batch[index]._id}:`, result.reason);
            errorCount++;
          }
        });

        if (i + batchSize < allQuickUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // ── 5. Notify full jobseeker accounts ────────────────────────────────────
      for (let i = 0; i < allJobSeekers.length; i += batchSize) {
        const batch = allJobSeekers.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(user => this.sendJobNotificationToFullUser(user, job))
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            result.value.success ? successCount++ : errorCount++;
          } else {
            console.error(`JobSeeker batch error for ${batch[index]._id}:`, result.reason);
            errorCount++;
          }
        });

        if (i + batchSize < allJobSeekers.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ Notification process completed: ${successCount} sent, ${errorCount} errors`);

      return {
        success: true,
        message: `Notifications sent to ${successCount} users`,
        stats: {
          totalUsers: totalTargets,
          notificationsSent: successCount,
          errors: errorCount,
          breakdown: {
            quickUsers: allQuickUsers.length,
            jobSeekers: allJobSeekers.length,
            semanticMatches: semanticQuickUsers.length + allJobSeekers.length,
            keywordMatches: newKeywordUsers.length
          }
        },
        results
      };

    } catch (error) {
      console.error('Error notifying matching users:', error);
      return {
        success: false,
        error: error.message,
        stats: { totalUsers: 0, notificationsSent: 0, errors: 1 }
      };
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
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; }
    .interests-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; font-size: 12px; color: #666; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Mirë se vini në advance.al!</h1>
      <p>Platforma #1 e Punës në Shqipëri</p>
    </div>

    <div class="content">
      <h2>Përshëndetje ${escapeHtml(user.firstName)}!</h2>

      <p>Ju regjistruat me sukses për të marrë njoftimet e punës nga advance.al! 🎯</p>

      <div class="interests-box">
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

    <div class="footer">
      <p><strong>advance.al</strong> - Platforma #1 e Punës në Shqipëri</p>
      <p>
        <a href="https://advance.al/preferences?token=${user.unsubscribeToken}">🔧 Ndrysho preferencat</a> |
        <a href="${user.getUnsubscribeUrl()}">❌ Çregjistrohu</a>
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
      console.error('Error sending welcome email:', error);
      throw error;
    }
  }

  // Daily digest of new jobs for users who prefer daily notifications
  async sendDailyDigest() {
    try {
      console.log('📅 Starting daily digest process...');

      // Find users who prefer daily notifications and haven't been notified in the last 20 hours
      const now = new Date();
      const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);

      const dailyUsers = await QuickUser.find({
        isActive: true,
        convertedToFullUser: false,
        'preferences.emailFrequency': 'daily',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: twentyHoursAgo } }
        ]
      });

      console.log(`📧 Found ${dailyUsers.length} users for daily digest`);

      // For daily digest, we would need to fetch jobs from the last 24 hours
      // This is a simplified version - in production, you'd fetch actual recent jobs
      const recentJobs = []; // await Job.find({ createdAt: { $gte: yesterday } });

      if (recentJobs.length === 0) {
        console.log('📭 No new jobs for daily digest');
        return { success: true, message: 'No new jobs to digest' };
      }

      // Process each user
      let successCount = 0;
      for (const user of dailyUsers) {
        try {
          // Find jobs that match this user's interests
          const matchingJobs = recentJobs.filter(job => user.matchesJob(job));

          if (matchingJobs.length > 0) {
            // Send digest email (implementation would include multiple jobs)
            // For now, just send the first matching job
            await this.sendJobNotificationToUser(user, matchingJobs[0]);
            successCount++;
          }
        } catch (error) {
          console.error(`Error sending daily digest to user ${user._id}:`, error);
        }
      }

      console.log(`✅ Daily digest completed: ${successCount} sent`);

      return {
        success: true,
        message: `Daily digest sent to ${successCount} users`,
        stats: { totalUsers: dailyUsers.length, sent: successCount }
      };

    } catch (error) {
      console.error('Error in daily digest process:', error);
      return { success: false, error: error.message };
    }
  }

  // Weekly digest for users who prefer weekly notifications
  async sendWeeklyDigest() {
    try {
      console.log('📅 Starting weekly digest process...');

      // Find users who prefer weekly notifications and haven't been notified in the last 6 days
      const now = new Date();
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

      const weeklyUsers = await QuickUser.find({
        isActive: true,
        convertedToFullUser: false,
        'preferences.emailFrequency': 'weekly',
        $or: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { $lt: sixDaysAgo } }
        ]
      });

      console.log(`📧 Found ${weeklyUsers.length} users for weekly digest`);

      // Similar to daily digest but for weekly timeframe
      // Implementation would be similar to daily digest

      return {
        success: true,
        message: `Weekly digest process completed`,
        stats: { totalUsers: weeklyUsers.length }
      };

    } catch (error) {
      console.error('Error in weekly digest process:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export default new NotificationService();