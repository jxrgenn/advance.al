import { Resend } from 'resend';

class ResendEmailService {
  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  RESEND_API_KEY not set - email sending disabled');
      this.enabled = false;
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
      this.enabled = true;
    }

    this.testEmail = 'advance.al123456@gmail.com'; // Your email for testing
    // Enable test mode to redirect all emails to testEmail (set EMAIL_TEST_MODE=true in .env)
    this.testMode = process.env.EMAIL_TEST_MODE === 'true';

    if (this.testMode) {
      console.log(`📧 EMAIL TEST MODE ENABLED - All emails will be sent to ${this.testEmail}`);
    }
  }

  // Helper to get recipient email (redirects to test email in test mode)
  getRecipientEmail(originalEmail) {
    if (this.testMode) {
      console.log(`📧 [TEST MODE] Redirecting email from ${originalEmail} to ${this.testEmail}`);
      return this.testEmail;
    }
    return originalEmail;
  }

  // Send welcome email to new full account user
  async sendFullAccountWelcomeEmail(user) {
    if (!this.enabled) {
      console.log('📧 Email sending disabled - skipping full account welcome email');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const subject = 'Mirë se vini në advance.al! 🎉 Llogaria juaj u krijua me sukses';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mirë se vini - advance.al</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px 0; border-bottom: 2px solid #2563eb;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: bold;">advance.al</h1>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">Platforma e Punës në Shqipëri</p>
        </div>

        <!-- Main Content -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">🎉 Mirë se vini ${user.profile.firstName}!</h2>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Llogaria juaj në advance.al u krijua me sukses! Tani mund të filloni të kërkoni për punën e ëndrrave tuaja në Shqipëri.
            </p>

            <!-- Account Info -->
            <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #10b981;">
                <h3 style="color: #1f2937; margin-top: 0;">📋 Detajet e Llogarisë</h3>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Emri:</strong> ${user.profile.firstName} ${user.profile.lastName}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Email:</strong> ${user.email}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Qyteti:</strong> ${user.profile.location.city}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Lloji:</strong> Kërkues Pune</p>
            </div>

            <!-- What's Next -->
            <h3 style="color: #1f2937;">🚀 Çfarë mund të bëni tani?</h3>
            <ul style="color: #4b5563; line-height: 1.8;">
                <li><strong>Plotësoni profilin tuaj</strong> - Shtoni CV-në, aftësitë dhe përvojën tuaj</li>
                <li><strong>Kërkoni për punë</strong> - Shfletoni mijëra pozicione pune</li>
                <li><strong>Aplikoni direkt</strong> - Dërgoni aplikime me një klikim</li>
                <li><strong>Merrni njoftimet</strong> - Ju informojmë për punët më të reja</li>
            </ul>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="https://advance.al/profile"
                   style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    📝 Plotëso Profilin Tënd
                </a>
            </div>

            <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #1e40af; margin: 0; font-size: 14px; font-weight: 500;">
                    💡 <strong>Këshillë:</strong> Profilet e plotësuara marrin 5x më shumë vizita nga punëdhënësit!
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                © 2024 advance.al - Platforma e Punës në Shqipëri
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                Nëse keni pyetje, na kontaktoni në support@advance.al
            </p>
        </div>
    </div>
</body>
</html>
      `;

      const textContent = `
Mirë se vini në advance.al! 🎉

Përshëndetje ${user.profile.firstName},

Llogaria juaj në advance.al u krijua me sukses!

Detajet e Llogarisë:
- Emri: ${user.profile.firstName} ${user.profile.lastName}
- Email: ${user.email}
- Qyteti: ${user.profile.location.city}
- Lloji: Kërkues Pune

Çfarë mund të bëni tani?
• Plotësoni profilin tuaj - Shtoni CV-në, aftësitë dhe përvojën tuaj
• Kërkoni për punë - Shfletoni mijëra pozicione pune
• Aplikoni direkt - Dërgoni aplikime me një klikim
• Merrni njoftimet - Ju informojmë për punët më të reja

Shkoni në profilin tuaj: https://advance.al/profile

Faleminderit që na zgjodht!

--
advance.al - Platforma e Punës në Shqipëri
      `;

      const emailResult = await this.resend.emails.send({
        from: 'Advance.al <onboarding@resend.dev>',
        to: this.getRecipientEmail(user.email),
        subject: subject,
        html: htmlContent,
        text: textContent,
      });

      console.log('📬 Full account email send result:', emailResult);

      if (emailResult.error) {
        console.error('❌ Resend error:', emailResult.error);
        throw new Error('Failed to send email via Resend');
      }

      console.log('✅ Full account welcome email sent:', emailResult.data?.id);

      return {
        success: true,
        emailId: emailResult.data?.id
      };

    } catch (error) {
      console.error('❌ Error sending full account welcome email:', error);
      throw error;
    }
  }

  // Send welcome email to new quick user
  async sendQuickUserWelcomeEmail(user) {
    if (!this.enabled) {
      console.log('📧 Email sending disabled - skipping quick user welcome email');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const subject = 'Mirë se vini në advance.al! 🎉 Regjistrimi për njoftimet u krye me sukses';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mirë se vini - advance.al</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px 0; border-bottom: 2px solid #2563eb;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: bold;">advance.al</h1>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">Platforma e Punës në Shqipëri</p>
        </div>

        <!-- Main Content -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">🎉 Mirë se vini ${user.firstName}!</h2>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Regjistrimi juaj për njoftimet e punës në advance.al u krye me sukses! Do të merrni email për punë të reja që përputhen me interesat tuaja.
            </p>

            <!-- User Info -->
            <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #10b981;">
                <h3 style="color: #1f2937; margin-top: 0;">📋 Detajet e Regjistrimit</h3>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Emri:</strong> ${user.firstName} ${user.lastName}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Email:</strong> ${user.email}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Qyteti:</strong> ${user.location}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Interesat:</strong> ${user.interests.join(', ')}</p>
                ${user.customInterests && user.customInterests.length > 0 ?
                  `<p style="margin: 8px 0; color: #4b5563;"><strong>Interesat e tjera:</strong> ${user.customInterests.join(', ')}</p>` : ''
                }
            </div>

            <!-- What Happens Next -->
            <h3 style="color: #1f2937;">📧 Çfarë do të ndodhë tani?</h3>
            <ul style="color: #4b5563; line-height: 1.8;">
                <li><strong>Njoftimet automatike</strong> - Do të merrni email për punë të reja që përputhen me interesat tuaja</li>
                <li><strong>Falas dhe pa reklamë</strong> - Asnjë pagesë apo spam</li>
                <li><strong>Mund të ndryshoni preferencat</strong> - Ose të çregjistroheni në çdo kohë</li>
                <li><strong>Krijoni llogari të plotë</strong> - Për më shumë veçori dhe për të aplikuar direkt</li>
            </ul>

            <!-- CTA Buttons -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="https://advance.al/register"
                   style="background: #2563eb; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin: 0 10px;">
                    🚀 Krijo Llogari të Plotë
                </a>
                <a href="https://advance.al/jobs"
                   style="background: #10b981; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin: 0 10px;">
                    👀 Shiko Punët
                </a>
            </div>

            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
                    💡 <strong>E dinit?</strong> Përdoruesit me llogari të plotë marrin 3x më shumë mundësi pune!
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                © 2024 advance.al - Platforma e Punës në Shqipëri
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                <a href="${user.getUnsubscribeUrl()}" style="color: #6b7280;">Çregjistrohu nga njoftimet</a> |
                <a href="mailto:support@advance.al" style="color: #6b7280;">Kontakt</a>
            </p>
        </div>
    </div>
</body>
</html>
      `;

      const textContent = `
Mirë se vini në advance.al! 🎉

Përshëndetje ${user.firstName},

Regjistrimi juaj për njoftimet e punës në advance.al u krye me sukses!

Detajet e Regjistrimit:
- Emri: ${user.firstName} ${user.lastName}
- Email: ${user.email}
- Qyteti: ${user.location}
- Interesat: ${user.interests.join(', ')}
${user.customInterests && user.customInterests.length > 0 ? `- Interesat e tjera: ${user.customInterests.join(', ')}` : ''}

Çfarë do të ndodhë tani?
• Do të merrni email për punë të reja që përputhen me interesat tuaja
• Falas dhe pa reklamë
• Mund të ndryshoni preferencat ose të çregjistroheni në çdo kohë
• Krijoni llogari të plotë për më shumë veçori

Krijoni llogari të plotë: https://advance.al/register
Shikoni punët: https://advance.al/jobs

Çregjistrohu: ${user.getUnsubscribeUrl()}

Faleminderit që na zgjodht!

--
advance.al - Platforma e Punës në Shqipëri
      `;

      const emailResult = await this.resend.emails.send({
        from: 'Advance.al <onboarding@resend.dev>',
        to: this.getRecipientEmail(user.email),
        subject: subject,
        html: htmlContent,
        text: textContent,
      });

      console.log('📬 Quick user email send result:', emailResult);

      if (emailResult.error) {
        console.error('❌ Resend error:', emailResult.error);
        throw new Error('Failed to send email via Resend');
      }

      console.log('✅ Quick user welcome email sent:', emailResult.data?.id);

      return {
        success: true,
        emailId: emailResult.data?.id
      };

    } catch (error) {
      console.error('❌ Error sending quick user welcome email:', error);
      throw error;
    }
  }

  // Send account action email (warning, suspension, ban)
  async sendAccountActionEmail(user, action, reason, duration = null) {
    if (!this.enabled) {
      console.log('📧 Email sending disabled - skipping account action email');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const actionDetails = {
        warning: {
          subject: '⚠️ Paralajmërim për llogarinë tuaj - advance.al',
          title: '⚠️ Keni marrë një paralajmërim',
          description: 'Keni marrë një paralajmërim për sjelljen tuaj në platformën advance.al.',
          action: 'paralajmërim',
          color: '#f59e0b',
          icon: '⚠️'
        },
        temporary_suspension: {
          subject: '🚫 Llogaria juaj është pezulluar - advance.al',
          title: '🚫 Llogaria juaj është pezulluar',
          description: `Llogaria juaj është pezulluar për ${duration} ditë.`,
          action: 'pezullim të përkohshëm',
          color: '#ef4444',
          icon: '🚫'
        },
        permanent_suspension: {
          subject: '🚫 Llogaria juaj është mbyllur - advance.al',
          title: '🚫 Llogaria juaj është mbyllur',
          description: 'Llogaria juaj është mbyllur përgjithmonë.',
          action: 'mbyllje të përhershme të llogarisë',
          color: '#dc2626',
          icon: '🚫'
        },
        account_termination: {
          subject: '🚫 Llogaria juaj është fshirë - advance.al',
          title: '🚫 Llogaria juaj është fshirë',
          description: 'Llogaria juaj është fshirë përgjithmonë.',
          action: 'fshirje të llogarisë',
          color: '#dc2626',
          icon: '🚫'
        }
      };

      const details = actionDetails[action];
      if (!details) {
        throw new Error(`Unknown action type: ${action}`);
      }

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${details.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px 0; border-bottom: 2px solid #2563eb;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: bold;">advance.al</h1>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">Platforma e Punës në Shqipëri</p>
        </div>

        <!-- Main Content -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">${details.title}</h2>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Përshëndetje ${user.profile.firstName} ${user.profile.lastName},
            </p>

            <div style="background: #ffffff; border-left: 4px solid ${details.color}; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <p style="color: #1f2937; margin: 0; font-size: 16px; font-weight: 500;">
                    ${details.description}
                </p>
                ${duration ? `<p style="color: #4b5563; margin: 10px 0 0 0;"><strong>Kohëzgjatja:</strong> ${duration} ditë</p>` : ''}
                <p style="color: #4b5563; margin: 10px 0 0 0;"><strong>Arsyeja:</strong> ${reason || 'Shkelje e rregullave të platformës'}</p>
            </div>

            ${action === 'warning' ? `
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
                    💡 <strong>Vërejtje:</strong> Ju lutemi lexoni dhe respektoni rregullat e platformës për të shmangur veprime të tjera.
                </p>
            </div>
            ` : ''}

            ${action !== 'warning' ? `
            <div style="background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #dc2626; margin: 0; font-size: 14px; font-weight: 500;">
                    ❌ <strong>Llogaria juaj nuk është më aktive.</strong> ${duration ? `Pezullimi do të ngritet automatikisht pas ${duration} ditësh.` : 'Kjo vendim është i përhershëm.'}
                </p>
            </div>
            ` : ''}

            <h3 style="color: #1f2937;">📋 Çfarë mund të bëni?</h3>
            <ul style="color: #4b5563; line-height: 1.8;">
                ${action === 'warning' ? `
                <li>Lexoni rregullat e platformës</li>
                <li>Vazhdoni të përdorni platformën duke respektuar udhëzimet</li>
                <li>Kontaktoni mbështetjen nëse keni pyetje</li>
                ` : duration ? `
                <li>Pritni derisa të skadojë pezullimi (${duration} ditë)</li>
                <li>Lexoni rregullat e platformës</li>
                <li>Kontaktoni mbështetjen për ankesë nëse besoni se ka gabim</li>
                ` : `
                <li>Kontaktoni mbështetjen për ankesë nëse besoni se ka gabim</li>
                <li>Ky vendim mund të apelohet brenda 30 ditësh</li>
                `}
            </ul>

            <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #1e40af; margin: 0; font-size: 14px; font-weight: 500;">
                    📞 <strong>Mbështetje:</strong> Nëse keni pyetje rreth këtij vendimi, na kontaktoni në support@advance.al
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                © 2024 advance.al - Platforma e Punës në Shqipëri
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                Ky email u dërgua sepse u morr një vendim administrativ për llogarinë tuaj.
            </p>
        </div>
    </div>
</body>
</html>
      `;

      const textContent = `
${details.title} - advance.al

Përshëndetje ${user.profile.firstName} ${user.profile.lastName},

${details.description}
${duration ? `Kohëzgjatja: ${duration} ditë` : ''}
Arsyeja: ${reason || 'Shkelje e rregullave të platformës'}

${action === 'warning'
  ? 'Ju lutemi lexoni dhe respektoni rregullat e platformës për të shmangur veprime të tjera.'
  : action !== 'warning' && duration
    ? `Llogaria juaj nuk është më aktive. Pezullimi do të ngritet automatikisht pas ${duration} ditësh.`
    : 'Llogaria juaj nuk është më aktive. Ky vendim është i përhershëm.'
}

Çfarë mund të bëni?
${action === 'warning'
  ? '• Lexoni rregullat e platformës\n• Vazhdoni të përdorni platformën duke respektuar udhëzimet\n• Kontaktoni mbështetjen nëse keni pyetje'
  : duration
    ? `• Pritni derisa të skadojë pezullimi (${duration} ditë)\n• Lexoni rregullat e platformës\n• Kontaktoni mbështetjen për ankesë nëse besoni se ka gabim`
    : '• Kontaktoni mbështetjen për ankesë nëse besoni se ka gabim\n• Ky vendim mund të apelohet brenda 30 ditësh'
}

Mbështetje: Nëse keni pyetje rreth këtij vendimi, na kontaktoni në support@advance.al

--
advance.al - Platforma e Punës në Shqipëri
      `;

      const emailResult = await this.resend.emails.send({
        from: 'Advance.al <support@resend.dev>',
        to: this.getRecipientEmail(user.email),
        subject: details.subject,
        html: htmlContent,
        text: textContent,
      });

      console.log('📬 Account action email send result:', emailResult);

      if (emailResult.error) {
        console.error('❌ Resend error:', emailResult.error);
        throw new Error('Failed to send account action email via Resend');
      }

      console.log('✅ Account action email sent:', emailResult.data?.id);

      return {
        success: true,
        emailId: emailResult.data?.id
      };

    } catch (error) {
      console.error('❌ Error sending account action email:', error);
      throw error;
    }
  }

  // Send bulk notification email
  async sendBulkNotificationEmail(toEmail, notificationData) {
    if (!this.enabled) {
      console.log('📧 Email sending disabled - skipping bulk notification email');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const { title, message, type, userName } = notificationData;

      const typeIcons = {
        announcement: '📢',
        maintenance: '🔧',
        feature: '🆕',
        warning: '⚠️',
        update: '🔄'
      };

      const typeColors = {
        announcement: '#2563eb',
        maintenance: '#f59e0b',
        feature: '#10b981',
        warning: '#ef4444',
        update: '#8b5cf6'
      };

      const subject = `${typeIcons[type] || '📢'} ${title} - advance.al`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - advance.al</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px 0; border-bottom: 2px solid #2563eb;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: bold;">advance.al</h1>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">Platforma e Punës në Shqipëri</p>
        </div>

        <!-- Main Content -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0; border-left: 4px solid ${typeColors[type] || '#2563eb'};">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">
                ${typeIcons[type] || '📢'} ${title}
            </h2>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Përshëndetje ${userName},
            </p>

            <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <p style="color: #1f2937; line-height: 1.6; font-size: 16px; margin: 0; white-space: pre-line;">${message}</p>
            </div>

            <!-- Footer Info -->
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                    Ky njoftim u dërgua nga ekipi i advance.al për të mbajtur përdoruesit e informuar për platformat dhe shërbimet tona.
                </p>
            </div>
        </div>

        <!-- Call to Action -->
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://advance.al" style="background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Shko te advance.al
            </a>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                © 2025 advance.al - Platforma e Punës në Shqipëri
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                Ky email u dërgua në ${toEmail}
            </p>
        </div>
    </div>
</body>
</html>`;

      const textContent = `
${typeIcons[type] || '📢'} ${title}

Përshëndetje ${userName},

${message}

---

Ky njoftim u dërgua nga ekipi i advance.al për të mbajtur përdoruesit e informuar për platformat dhe shërbimet tona.

Shko te advance.al: https://advance.al

© 2025 advance.al - Platforma e Punës në Shqipëri
Ky email u dërgua në ${toEmail}
`;

      console.log(`📧 Sending bulk notification email to: ${toEmail}`);
      console.log(`📧 Subject: ${subject}`);

      const emailResult = await this.resend.emails.send({
        from: 'advance.al <noreply@advance.al>',
        to: this.getRecipientEmail(toEmail),
        subject: subject,
        html: htmlContent,
        text: textContent,
        headers: {
          'X-Entity-Ref-ID': `bulk-notification-${Date.now()}`
        }
      });

      if (emailResult.error) {
        console.error('❌ Resend error:', emailResult.error);
        throw new Error('Failed to send bulk notification email via Resend');
      }

      console.log('✅ Bulk notification email sent:', emailResult.data?.id);

      return {
        success: true,
        emailId: emailResult.data?.id
      };

    } catch (error) {
      console.error('❌ Error sending bulk notification email:', error);
      throw error;
    }
  }

  // Generic transactional email — used by notificationService for job alerts
  async sendTransactionalEmail(to, subject, htmlContent, textContent) {
    if (!this.enabled) {
      console.log('📧 Email sending disabled - skipping transactional email');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const emailResult = await this.resend.emails.send({
        from: 'advance.al <noreply@advance.al>',
        to: this.getRecipientEmail(to),
        subject,
        html: htmlContent,
        text: textContent,
      });

      if (emailResult.error) {
        console.error('❌ Resend transactional error:', emailResult.error);
        throw new Error('Failed to send transactional email via Resend');
      }

      return { success: true, messageId: emailResult.data?.id };
    } catch (error) {
      console.error('❌ Error sending transactional email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send application message notification email
  async sendApplicationMessageEmail(recipient, sender, job, message, messageType) {
    if (!this.enabled) {
      console.log('📧 Email sending disabled - skipping application message email');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const messageTypeLabels = {
        text: 'Mesazh i ri',
        interview_invite: 'Ftesë për intervistë',
        offer: 'Ofertë pune',
        rejection: 'Përgjigje për aplikimin'
      };

      const typeLabel = messageTypeLabels[messageType] || 'Mesazh i ri';
      const subject = `${typeLabel} për aplikimin tuaj - ${job.title}`;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${typeLabel} - advance.al</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding: 20px 0; border-bottom: 2px solid #2563eb;">
            <h1 style="color: #2563eb; margin: 0; font-size: 28px; font-weight: bold;">advance.al</h1>
            <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">Platforma e Punës në Shqipëri</p>
        </div>

        <!-- Main Content -->
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin: 20px 0;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px;">💬 ${typeLabel}</h2>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Përshëndetje ${recipient.firstName},
            </p>

            <p style="color: #4b5563; line-height: 1.6; font-size: 16px; margin: 20px 0;">
                Keni marrë një mesazh të ri për aplikimin tuaj në pozicionin <strong>${job.title}</strong>.
            </p>

            <!-- Job Info -->
            <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #10b981;">
                <h3 style="color: #1f2937; margin-top: 0;">📋 Detajet e Punës</h3>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Titulli:</strong> ${job.title}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Kompania:</strong> ${job.companyName || 'N/A'}</p>
                <p style="margin: 8px 0; color: #4b5563;"><strong>Nga:</strong> ${sender.firstName} ${sender.lastName}</p>
            </div>

            <!-- Message Content -->
            <div style="background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <h4 style="color: #1e40af; margin-top: 0;">Mesazhi:</h4>
                <p style="color: #1f2937; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="https://advance.al/applications"
                   style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    💬 Shiko Aplikimin dhe Përgjigju
                </a>
            </div>

            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
                    💡 <strong>Këshillë:</strong> Përgjigjuni shpejt për të rritur shanset tuaja për të marrë këtë punë!
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                © 2025 advance.al - Platforma e Punës në Shqipëri
            </p>
            <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
                Ky email u dërgua sepse keni një mesazh të ri për aplikimin tuaj.
            </p>
        </div>
    </div>
</body>
</html>
      `;

      const textContent = `
${typeLabel} - advance.al

Përshëndetje ${recipient.firstName},

Keni marrë një mesazh të ri për aplikimin tuaj në pozicionin "${job.title}".

Detajet e Punës:
- Titulli: ${job.title}
- Kompania: ${job.companyName || 'N/A'}
- Nga: ${sender.firstName} ${sender.lastName}

Mesazhi:
${message}

Shiko aplikimin dhe përgjigju: https://advance.al/applications

--
advance.al - Platforma e Punës në Shqipëri
      `;

      const emailResult = await this.resend.emails.send({
        from: 'Advance.al <noreply@resend.dev>',
        to: this.getRecipientEmail(recipient.email),
        subject,
        html: htmlContent,
        text: textContent,
      });

      if (emailResult.error) {
        console.error('❌ Resend application message error:', emailResult.error);
        throw new Error('Failed to send application message email via Resend');
      }

      console.log('✅ Application message email sent:', emailResult.data?.id);

      return {
        success: true,
        emailId: emailResult.data?.id
      };

    } catch (error) {
      console.error('❌ Error sending application message email:', error);
      throw error;
    }
  }
}

// Create singleton instance
const resendEmailService = new ResendEmailService();

// Export bulk notification email function
export const sendBulkNotificationEmail = async (toEmail, notificationData) => {
  return resendEmailService.sendBulkNotificationEmail(toEmail, notificationData);
};

// Export singleton instance
export default resendEmailService;