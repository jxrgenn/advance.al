import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

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
        console.log('📧 Email service configured successfully');
      } catch (error) {
        console.error('❌ Email configuration error:', error);
        this.setupTestAccount();
      }
    } else {
      console.log('⚠️ No email credentials found, using test account');
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
      console.log('📧 Using Ethereal test account:', testAccount.user);
      console.log('🔗 View emails at: https://ethereal.email');
    } catch (error) {
      console.error('❌ Failed to setup test email account:', error);
      this.isConfigured = false;
    }
  }

  // Send email with retry logic
  async sendEmail(to, subject, htmlContent, textContent) {
    if (!this.isConfigured) {
      console.log('📧 Email not configured, simulating send to:', to);
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

      console.log(`✅ Email sent to ${to}: ${info.messageId}`);
      if (previewUrl) {
        console.log(`🔗 Preview: ${previewUrl}`);
      }

      return {
        success: true,
        messageId: info.messageId,
        preview: previewUrl
      };

    } catch (error) {
      console.error(`❌ Email send error for ${to}:`, error);

      // Retry once
      try {
        console.log('🔄 Retrying email send...');
        const retryInfo = await this.transporter.sendMail(mailOptions);

        let previewUrl = null;
        if (retryInfo.messageId && retryInfo.messageId.includes('ethereal')) {
          previewUrl = nodemailer.getTestMessageUrl(retryInfo);
        }

        console.log(`✅ Email sent on retry to ${to}: ${retryInfo.messageId}`);
        return {
          success: true,
          messageId: retryInfo.messageId,
          preview: previewUrl
        };

      } catch (retryError) {
        console.error(`❌ Email retry failed for ${to}:`, retryError);
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
      console.log(`📱 [SMS mock — Twilio not configured] To: ${to} | Message: ${message}`);
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

      console.log(`✅ SMS sent to ${to}: ${result.sid}`);
      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error(`❌ SMS send error for ${to}:`, error.message);
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
      console.log('✅ Email connection verified');
      return { success: true };
    } catch (error) {
      console.error('❌ Email verification failed:', error);
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