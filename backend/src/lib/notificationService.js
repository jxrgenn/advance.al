import { QuickUser } from '../models/index.js';
import emailService from './emailService.js';

class NotificationService {
  constructor() {
    this.emailQueue = [];
    this.smsQueue = [];
    this.isProcessing = false;
  }

  // Send email using real email service
  async sendEmail(to, subject, htmlContent, textContent) {
    return await emailService.sendEmail(to, subject, htmlContent, textContent);
  }

  // Send SMS using SMS service
  async sendSMS(to, message) {
    return await emailService.sendSMS(to, message);
  }

  // Generate email content for job notification
  generateJobNotificationEmail(user, job) {
    const unsubscribeUrl = user.getUnsubscribeUrl();
    const trackingUrl = `https://advance.al/api/quickusers/track-click`;

    const subject = `Punë e re: ${job.title} në ${job.location.city}`;

    const textContent = `
Përshëndetje ${user.firstName},

Një punë e re që përputhet me interesat tuaja është publikuar:

📋 Pozicioni: ${job.title}
🏢 Kompania: ${job.company.name}
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
      <p>Përshëndetje ${user.firstName}, gjenim një mundësi të shkëlqyer!</p>
    </div>

    <div class="content">
      <div class="job-card">
        <div class="job-title">${job.title}</div>
        <div class="job-info"><strong>🏢 Kompania:</strong> ${job.company.name}</div>
        <div class="job-info"><strong>📍 Vendndodhja:</strong> ${job.location.city}${job.location.remote ? ' <span style="color: #28a745;">(Punë në distancë)</span>' : ''}</div>
        ${job.salary ? `<div class="job-info"><strong>💰 Paga:</strong> ${job.salary.min}-${job.salary.max} ${job.salary.currency}</div>` : ''}
        <div class="job-info"><strong>📅 Afati:</strong> ${new Date(job.applicationDeadline).toLocaleDateString('sq-AL')}</div>
        <div class="job-info"><strong>🎯 Kategoria:</strong> ${job.category}</div>
      </div>

      <p><strong>📝 Përshkrimi i shkurtër:</strong></p>
      <p>${job.description.substring(0, 300)}${job.description.length > 300 ? '...' : ''}</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://advance.al/jobs/${job._id}?utm_source=email&utm_medium=notification&utm_campaign=job_match&token=${user.unsubscribeToken}"
           class="cta-button" onclick="fetch('${trackingUrl}', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: '${user.unsubscribeToken}'})})">
          👀 Shiko Detajet dhe Apliko
        </a>
      </div>

      <p style="font-size: 14px; color: #666;">
        💡 <strong>Përse mora këtë email?</strong><br>
        Ky pozicion përputhet me interesat tuaja: ${user.allInterests.join(', ')}
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
    return `🎯 Punë e re: ${job.title} në ${job.company.name}, ${job.location.city}. Shiko: https://advance.al/jobs/${job._id} | Çregjistrohu: ${user.getUnsubscribeUrl()}`;
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

  // Notify all matching users about a new job
  async notifyMatchingUsers(job) {
    try {
      console.log(`🔍 Finding users to notify for job: ${job.title}`);

      // Find all users that match this job
      const matchingUsers = await QuickUser.findMatchesForJob(job);

      console.log(`📧 Found ${matchingUsers.length} matching users`);

      if (matchingUsers.length === 0) {
        return {
          success: true,
          message: 'No matching users found',
          stats: {
            totalUsers: 0,
            notificationsSent: 0,
            errors: 0
          }
        };
      }

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      // Process notifications in batches to avoid overwhelming email/SMS services
      const batchSize = 10;
      for (let i = 0; i < matchingUsers.length; i += batchSize) {
        const batch = matchingUsers.slice(i, i + batchSize);

        const batchPromises = batch.map(user =>
          this.sendJobNotificationToUser(user, job)
        );

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.success) {
              successCount++;
            } else {
              errorCount++;
            }
          } else {
            console.error(`Batch error for user ${batch[index]._id}:`, result.reason);
            errorCount++;
          }
        });

        // Small delay between batches to be respectful to email/SMS APIs
        if (i + batchSize < matchingUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ Notification process completed: ${successCount} sent, ${errorCount} errors`);

      return {
        success: true,
        message: `Notifications sent to ${successCount} users`,
        stats: {
          totalUsers: matchingUsers.length,
          notificationsSent: successCount,
          errors: errorCount
        },
        results
      };

    } catch (error) {
      console.error('Error notifying matching users:', error);
      return {
        success: false,
        error: error.message,
        stats: {
          totalUsers: 0,
          notificationsSent: 0,
          errors: 1
        }
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
      <h2>Përshëndetje ${user.firstName}!</h2>

      <p>Ju regjistruat me sukses për të marrë njoftimet e punës nga advance.al! 🎯</p>

      <div class="interests-box">
        <h3>🎯 Interesat tuaja:</h3>
        <ul>
          ${user.allInterests.map(interest => `<li>${interest}</li>`).join('')}
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