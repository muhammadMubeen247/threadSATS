const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: false, // true for 465, false for other ports
  family: 4,     // Force IPv4 — Node 18+ prefers IPv6 by default which breaks Gmail SMTP
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: `"Personas" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your COMSATS Email - Personas OTP Verification',
    html: `<!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 20px 0; border-radius: 8px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Personas</h1>
              <p>COMSATS Social Platform</p>
            </div>
            <div class="content">
              <h2>Welcome to Personas!</h2>
              <p>Thank you for joining Personas. To complete your registration, please verify your email address.</p>
              <p><strong>Your OTP Code:</strong></p>
              <div class="otp-box">${otp}</div>
              <p>This code will expire in <strong>10 minutes</strong>.</p>
              <p>If you didn't request this code, please ignore this email.</p>
              <div class="footer">
                <p>© 2025 Personas - COMSATS Social Platform</p>
                <p>This is an automated message, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
      </html>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Email send error: ${error.message}`);
    throw new Error('Failed to send OTP email');
  }
};

// ✅ new: password reset OTP email
const sendPasswordResetOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: `"Personas" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Personas Password Reset OTP',
    html: `<!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #111827; color: white; padding: 22px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #111827; padding: 18px; text-align: center; font-size: 30px; font-weight: bold; color: #111827; letter-spacing: 8px; margin: 18px 0; border-radius: 8px; }
            .footer { text-align: center; margin-top: 18px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Password reset</h2>
            </div>
            <div class="content">
              <p>Use this OTP to reset your Personas password:</p>
              <div class="otp-box">${otp}</div>
              <p>This code will expire in <strong>10 minutes</strong>.</p>
              <p>If you didn't request a password reset, you can ignore this email.</p>
              <div class="footer">
                <p>© 2025 Personas</p>
              </div>
            </div>
          </div>
        </body>
      </html>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Email send error: ${error.message}`);
    throw new Error('Failed to send password reset OTP email');
  }
};

const sendNotificationDigestEmail = async (email, unreadCount, appUrl) => {
  const mailOptions = {
    from: `"Personas" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `You have ${unreadCount} unread notifications on Personas`,
    html: `<!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .count-box { background: white; border-left: 4px solid #667eea; padding: 16px 20px; font-size: 18px; font-weight: bold; color: #667eea; margin: 20px 0; border-radius: 4px; }
            .cta { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold; margin: 16px 0; }
            .footer { text-align: center; margin-top: 24px; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin:0;">Personas</h1>
              <p style="margin:6px 0 0;">COMSATS Social Platform</p>
            </div>
            <div class="content">
              <h2>You've been missed!</h2>
              <p>While you were away, your notifications have been piling up on Personas.</p>
              <div class="count-box">🔔 ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''} waiting for you</div>
              <p>Don't let them pile up! Catch up on likes, comments, replies, and more.</p>
              <div style="text-align: center;">
                <a href="${appUrl}/notifications" class="cta">View My Notifications</a>
              </div>
              <p style="color:#888; font-size:13px; margin-top:24px;">You're receiving this because you haven't signed in for over 12 hours and have unread activity. You won't receive another reminder for 24 hours.</p>
              <div class="footer">
                <p>© 2025 Personas – COMSATS University Student Network</p>
                <p>This is an automated message, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
      </html>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Notification digest email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Digest email error for ${email}: ${error.message}`);
    return false;
  }
};

module.exports = { sendOTPEmail, sendPasswordResetOTPEmail, sendNotificationDigestEmail };
