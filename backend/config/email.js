const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: `"Bark" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your COMSATS Email - Bark OTP Verification',
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
              <h1>🎓 Bark</h1>
              <p>COMSATS Student Network</p>
            </div>
            <div class="content">
              <h2>Welcome to Bark!</h2>
              <p>Thank you for joining the COMSATS student community. To complete your registration, please verify your email address.</p>
              <p><strong>Your OTP Code:</strong></p>
              <div class="otp-box">${otp}</div>
              <p>This code will expire in <strong>10 minutes</strong>.</p>
              <p>If you didn't request this code, please ignore this email.</p>
              <div class="footer">
                <p>© 2025 Bark - COMSATS University Student Network</p>
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
    from: `"Bark" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Bark Password Reset OTP',
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
              <p>Use this OTP to reset your Bark password:</p>
              <div class="otp-box">${otp}</div>
              <p>This code will expire in <strong>10 minutes</strong>.</p>
              <p>If you didn't request a password reset, you can ignore this email.</p>
              <div class="footer">
                <p>© 2025 Bark</p>
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

module.exports = { sendOTPEmail, sendPasswordResetOTPEmail };