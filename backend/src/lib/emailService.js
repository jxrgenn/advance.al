import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import logger from '../config/logger.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  // Initialize email transporter based on environment
  initializeTransporter() {
    const emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    // Check if email is configured
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        this.transporter = nodemailer.createTransport(emailConfig);
        this.isConfigured = true;
      } catch (error) {
        logger.error('Email configuration error:', error.message);
        this.setupTestAccount();
      }
    } else {
      this.setupTestAccount();
    }
  }

  // Setup ethereal test account for development
  async setupTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();

      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });

      this.isConfigured = true;
    } catch (error) {
      logger.error('Failed to setup test email account:', error.message);
      this.isConfigured = false;
    }
  }

  // Send email with retry logic
  async sendEmail(to, subject, htmlContent, textContent) {
    if (!this.isConfigured) {
      return {
        success: true,
        messageId: `mock_${Date.now()}`,
        preview: 'Email service not configured'
      };
    }

    const mailOptions = {
      from: {
        name: 'advance.al',
        address: process.env.SMTP_FROM || 'noreply@advance.al'
      },
      to,
      subject,
      html: htmlContent,
      text: textContent
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);

      let previewUrl = null;
      if (info.messageId && info.messageId.includes('ethereal')) {
        previewUrl = nodemailer.getTestMessageUrl(info);
      }

      return {
        success: true,
        messageId: info.messageId,
        preview: previewUrl
      };

    } catch (error) {
      logger.error(`Email send error for ${to}:`, error.message);

      // Retry once
      try {
        const retryInfo = await this.transporter.sendMail(mailOptions);

        let previewUrl = null;
        if (retryInfo.messageId && retryInfo.messageId.includes('ethereal')) {
          previewUrl = nodemailer.getTestMessageUrl(retryInfo);
        }

        return {
          success: true,
          messageId: retryInfo.messageId,
          preview: previewUrl
        };

      } catch (retryError) {
        logger.error(`Email retry failed for ${to}:`, retryError.message);
        return {
          success: false,
          error: retryError.message
        };
      }
    }
  }

  // Send SMS via Twilio (requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE env vars)
  async sendSMS(to, message) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone  = process.env.TWILIO_PHONE;

    // If Twilio is not configured, log and return mock success
    if (!accountSid || !authToken || !fromPhone) {
      return { success: true, messageId: `sms_mock_${Date.now()}` };
    }

    try {
      // Dynamic import so the package is only required when Twilio is actually configured
      const twilio = (await import('twilio')).default;
      const client = twilio(accountSid, authToken);

      const result = await client.messages.create({
        body: message,
        from: fromPhone,
        to: to
      });

      return { success: true, messageId: result.sid };
    } catch (error) {
      logger.error(`SMS send error for ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Verify email configuration
  async verifyConnection() {
    if (!this.isConfigured) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      logger.error('Email verification failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send test email
  async sendTestEmail(to = 'test@advance.al') {
    const subject = 'Test Email nga advance.al';
    const textContent = 'Ky është një test email nga advance.al për të verifikuar konfigurimin e email-it.';
    const htmlContent = `
      <h2>Test Email nga advance.al</h2>
      <p>Ky është një test email për të verifikuar që sistemi i email-it punon si duhet.</p>
      <p><strong>Nëse e lexoni këtë, email-i punon!</strong> ✅</p>
      <hr>
      <p style="color: #666; font-size: 12px;">
        advance.al - Platforma #1 e Punës në Shqipëri
      </p>
    `;

    return await this.sendEmail(to, subject, htmlContent, textContent);
  }
}

// Export singleton instance
export default new EmailService();