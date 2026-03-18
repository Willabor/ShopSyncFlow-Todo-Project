import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import { scrypt } from 'crypto';

const scryptAsync = promisify(scrypt);

// Email configuration
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;
const FROM_NAME = process.env.FROM_NAME || 'ShopSyncFlow';
const APP_URL = process.env.APP_URL || 'http://localhost:9000';

// Create reusable transporter
const transporter = createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: SMTP_USER && SMTP_PASS ? {
    user: SMTP_USER,
    pass: SMTP_PASS,
  } : undefined,
});

// Verify connection configuration
if (SMTP_USER && SMTP_PASS) {
  transporter.verify((error, success) => {
    if (error) {
      console.error('Email configuration error:', error);
    } else {
      console.log('Email server is ready to send messages');
    }
  });
} else {
  console.warn('SMTP credentials not configured. Email functionality disabled.');
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  /**
   * Send an email
   */
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!SMTP_USER || !SMTP_PASS) {
      console.warn('Email not sent - SMTP not configured:', options.subject);
      return false;
    }

    try {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      console.log(`Email sent successfully to ${options.to}: ${options.subject}`);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(email: string, username: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${username}</strong>,</p>

          <p>We received a request to reset your password for your ShopSyncFlow account.</p>

          <p>Click the button below to reset your password:</p>

          <p style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </p>

          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul style="margin: 10px 0;">
              <li>This link will expire in <strong>60 minutes</strong></li>
              <li>This link can only be used <strong>once</strong></li>
              <li>If you didn't request this reset, please ignore this email</li>
            </ul>
          </div>

          <p>If you have any questions or concerns, please contact your administrator.</p>

          <p>Best regards,<br><strong>ShopSyncFlow Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message from ShopSyncFlow. Please do not reply to this email.</p>
          <p>&copy; ${new Date().getFullYear()} ShopSyncFlow - nexusdenim.com</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Password Reset Request

Hello ${username},

We received a request to reset your password for your ShopSyncFlow account.

Click the link below to reset your password:
${resetUrl}

⚠️ Security Notice:
- This link will expire in 60 minutes
- This link can only be used once
- If you didn't request this reset, please ignore this email

Best regards,
ShopSyncFlow Team

---
This is an automated message. Please do not reply to this email.
© ${new Date().getFullYear()} ShopSyncFlow - nexusdenim.com
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Reset Your Password - ShopSyncFlow',
      html,
      text,
    });
  }

  /**
   * Send account approval notification
   */
  static async sendAccountApprovedEmail(email: string, username: string): Promise<boolean> {
    const loginUrl = `${APP_URL}/login`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .success { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>✅ Account Approved!</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${username}</strong>,</p>

          <div class="success">
            <p><strong>Great news!</strong> Your ShopSyncFlow account has been approved by an administrator.</p>
          </div>

          <p>You can now log in and start using ShopSyncFlow to manage your workflow.</p>

          <p style="text-align: center;">
            <a href="${loginUrl}" class="button">Log In Now</a>
          </p>

          <p>If you have any questions, please contact your administrator.</p>

          <p>Welcome to the team!<br><strong>ShopSyncFlow Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message from ShopSyncFlow.</p>
          <p>&copy; ${new Date().getFullYear()} ShopSyncFlow - nexusdenim.com</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Account Approved!

Hello ${username},

Great news! Your ShopSyncFlow account has been approved by an administrator.

You can now log in and start using ShopSyncFlow: ${loginUrl}

Welcome to the team!
ShopSyncFlow Team

---
© ${new Date().getFullYear()} ShopSyncFlow - nexusdenim.com
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Your Account Has Been Approved - ShopSyncFlow',
      html,
      text,
    });
  }

  /**
   * Send welcome email to new registrants (pending approval)
   */
  static async sendRegistrationPendingEmail(email: string, username: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .info { background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Registration Received!</h1>
        </div>
        <div class="content">
          <p>Hello <strong>${username}</strong>,</p>

          <p>Thank you for registering with ShopSyncFlow!</p>

          <div class="info">
            <p><strong>ℹ️ What happens next:</strong></p>
            <p>Your account is currently pending approval by an administrator. You will receive an email notification once your account has been approved.</p>
          </div>

          <p>This typically takes 1-2 business days.</p>

          <p>If you have any questions, please contact your administrator.</p>

          <p>Best regards,<br><strong>ShopSyncFlow Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message from ShopSyncFlow.</p>
          <p>&copy; ${new Date().getFullYear()} ShopSyncFlow - nexusdenim.com</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Registration Received!

Hello ${username},

Thank you for registering with ShopSyncFlow!

ℹ️ What happens next:
Your account is currently pending approval by an administrator. You will receive an email notification once your account has been approved.

This typically takes 1-2 business days.

Best regards,
ShopSyncFlow Team

---
© ${new Date().getFullYear()} ShopSyncFlow - nexusdenim.com
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Registration Received - Pending Approval',
      html,
      text,
    });
  }

  /**
   * Send verification code for registration
   */
  static async sendVerificationCodeEmail(email: string, code: string, expiresInMinutes: number = 15): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .code-box { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: monospace; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Verify Your Email</h1>
        </div>
        <div class="content">
          <p>Welcome to <strong>ShopSyncFlow</strong>!</p>

          <p>Use the verification code below to complete your registration:</p>

          <div class="code-box">
            <div class="code">${code}</div>
          </div>

          <div class="warning">
            <strong>⏱️ This code expires in ${expiresInMinutes} minutes</strong>
            <p style="margin: 5px 0 0 0;">If you didn't request this code, please ignore this email.</p>
          </div>

          <p>Best regards,<br><strong>ShopSyncFlow Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message from ShopSyncFlow. Please do not reply to this email.</p>
          <p>&copy; ${new Date().getFullYear()} ShopSyncFlow</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Verify Your Email - ShopSyncFlow

Your verification code is: ${code}

This code expires in ${expiresInMinutes} minutes.

If you didn't request this code, please ignore this email.

Best regards,
ShopSyncFlow Team
    `;

    return await this.sendEmail({
      to: email,
      subject: `${code} is your ShopSyncFlow verification code`,
      html,
      text,
    });
  }

  /**
   * Generate a password reset token
   */
  static async generateResetToken(): Promise<string> {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for storage (using bcrypt-style with scrypt)
   */
  static async hashToken(token: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(token, salt, 64)) as Buffer;
    return `${buf.toString('hex')}.${salt}`;
  }

  /**
   * Verify a token against its hash
   */
  static async verifyToken(token: string, hash: string): Promise<boolean> {
    const [hashed, salt] = hash.split('.');
    const hashedBuf = Buffer.from(hashed, 'hex');
    const tokenBuf = (await scryptAsync(token, salt, 64)) as Buffer;

    if (hashedBuf.length !== tokenBuf.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < hashedBuf.length; i++) {
      result |= hashedBuf[i] ^ tokenBuf[i];
    }
    return result === 0;
  }
}
