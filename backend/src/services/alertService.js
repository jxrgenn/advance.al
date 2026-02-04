import nodemailer from 'nodemailer';
import debugLogger from './debugLogger.js';

/**
 * Alert Service
 *
 * Sends email alerts for critical embedding system events:
 * - Worker failures
 * - Queue backup
 * - Repeated errors
 */

class AlertService {
  constructor() {
    this.enabled = process.env.ALERT_EMAIL_ENABLED === 'true';
    this.emailTo = process.env.ALERT_EMAIL_TO;
    this.emailFrom = process.env.ALERT_EMAIL_FROM || 'noreply@advance.al';

    // Alert thresholds
    this.failureThreshold = parseInt(process.env.ALERT_THRESHOLD_FAILURES || '10');
    this.queueSizeThreshold = parseInt(process.env.ALERT_THRESHOLD_QUEUE_SIZE || '100');

    // Rate limiting (don't spam alerts)
    this.lastAlerts = {
      worker_failure: 0,
      queue_backup: 0,
      repeated_errors: 0
    };
    this.alertCooldown = 30 * 60 * 1000; // 30 minutes

    // Initialize mailer if enabled
    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    }
  }

  /**
   * Send alert email
   * @param {string} type - Alert type
   * @param {string} subject
   * @param {string} body
   */
  async sendAlert(type, subject, body) {
    if (!this.enabled) {
      return;
    }

    // Check cooldown
    const now = Date.now();
    const lastAlert = this.lastAlerts[type] || 0;

    if (now - lastAlert < this.alertCooldown) {
      console.log(`[ALERT] Skipping ${type} alert (cooldown)`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: this.emailTo,
        subject: `[advance.al] ${subject}`,
        text: body,
        html: this.formatHtmlEmail(subject, body)
      });

      this.lastAlerts[type] = now;
      console.log(`[ALERT] Sent ${type} alert to ${this.emailTo}`);
    } catch (error) {
      console.error(`[ALERT] Failed to send ${type} alert:`, error.message);
    }
  }

  /**
   * Alert: Worker failure
   * @param {number} workerId
   * @param {string} reason
   */
  async alertWorkerFailure(workerId, reason) {
    await this.sendAlert(
      'worker_failure',
      `Embedding Worker Failure (PID: ${workerId})`,
      `
Worker Process Failed
=====================

Worker ID: ${workerId}
Reason: ${reason}
Time: ${new Date().toISOString()}

Action Required:
- Check worker logs: pm2 logs albania-jobflow-worker
- Restart worker: pm2 restart albania-jobflow-worker
- Check for repeated errors in admin dashboard

This is an automated alert from the embedding system.
      `.trim()
    );
  }

  /**
   * Alert: Queue backup
   * @param {number} queueSize
   */
  async alertQueueBackup(queueSize) {
    await this.sendAlert(
      'queue_backup',
      `Embedding Queue Backup (${queueSize} pending)`,
      `
Queue Backup Detected
=====================

Pending Jobs: ${queueSize}
Threshold: ${this.queueSizeThreshold}
Time: ${new Date().toISOString()}

Possible Causes:
- Worker not running or paused
- OpenAI API rate limiting
- High memory usage causing pauses

Action Required:
- Check worker status in admin dashboard
- Verify worker is running: pm2 status albania-jobflow-worker
- Check OpenAI API status and rate limits
- Consider increasing EMBEDDING_MAX_CONCURRENT if not rate limited

This is an automated alert from the embedding system.
      `.trim()
    );
  }

  /**
   * Alert: Repeated errors
   * @param {string} errorType
   * @param {number} count
   * @param {string} lastError
   */
  async alertRepeatedErrors(errorType, count, lastError) {
    await this.sendAlert(
      'repeated_errors',
      `Repeated Embedding Errors (${errorType}: ${count} times)`,
      `
Repeated Errors Detected
========================

Error Type: ${errorType}
Count: ${count}
Threshold: ${this.failureThreshold}
Time: ${new Date().toISOString()}

Last Error:
${lastError}

Possible Causes:
- Invalid OpenAI API key
- Network connectivity issues
- Malformed job data
- OpenAI API outage

Action Required:
- Check admin dashboard for error details
- Verify OpenAI API key: echo $OPENAI_API_KEY | cut -c1-10
- Review failed jobs for common patterns
- Check OpenAI API status: https://status.openai.com

This is an automated alert from the embedding system.
      `.trim()
    );
  }

  /**
   * Check and alert based on queue stats
   * @param {Object} stats
   */
  async checkQueueHealth(stats) {
    // Alert if queue too large
    if (stats.byStatus?.pending > this.queueSizeThreshold) {
      await this.alertQueueBackup(stats.byStatus.pending);
    }

    // Alert if too many failures
    if (stats.byStatus?.failed > this.failureThreshold) {
      await this.alertRepeatedErrors(
        'QUEUE_FAILURES',
        stats.byStatus.failed,
        'Multiple jobs failed in queue. Check admin dashboard for details.'
      );
    }
  }

  /**
   * Format HTML email
   * @param {string} subject
   * @param {string} body
   * @returns {string}
   */
  formatHtmlEmail(subject, body) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #dc2626;
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
    }
    .content {
      background: #f9fafb;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    .content pre {
      background: white;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
      overflow-x: auto;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2 style="margin: 0;">⚠️ ${subject}</h2>
  </div>
  <div class="content">
    <pre>${body}</pre>
  </div>
  <div class="footer">
    <p>
      This is an automated alert from advance.al embedding system.<br>
      To disable alerts, set ALERT_EMAIL_ENABLED=false in your environment.
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Test email configuration
   */
  async testEmail() {
    if (!this.enabled) {
      throw new Error('Email alerts are disabled');
    }

    try {
      await this.transporter.sendMail({
        from: this.emailFrom,
        to: this.emailTo,
        subject: '[advance.al] Test Email',
        text: 'This is a test email from the embedding alert system.',
        html: this.formatHtmlEmail(
          'Test Email',
          'This is a test email from the embedding alert system.\n\nIf you received this, email alerts are working correctly.'
        )
      });

      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      throw new Error(`Failed to send test email: ${error.message}`);
    }
  }
}

// Singleton instance
const alertService = new AlertService();

export default alertService;
