/**
 * Registration Routes
 *
 * Handles tenant registration flow:
 * 1. POST /api/auth/register/send-code - Send verification code to email
 * 2. POST /api/auth/register/verify-code - Verify code and get temp token
 * 3. GET /api/tenants/check-subdomain/:subdomain - Check subdomain availability
 * 4. POST /api/tenants/register - Create tenant and owner user
 */

import { safeErrorMessage } from "../utils/safe-error";
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import {
  verificationCodes,
  invitations,
  registrationAuditLog,
  tenants,
  users,
  sendCodeSchema,
  verifyCodeSchema,
  registerTenantSchema
} from '@shared/schema';
import jwt from 'jsonwebtoken';
import { scrypt, randomBytes, timingSafeEqual, randomInt } from 'crypto';
import { promisify } from 'util';
import { EmailService } from '../services/email';

const scryptAsync = promisify(scrypt);

// Ensure SESSION_SECRET is configured - critical for JWT security
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable must be set');
}

const router = Router();

// App domain for tenant URLs (configurable via environment)
const APP_DOMAIN = process.env.APP_DOMAIN || 'tasks.nexusdenim.com';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a 6-digit verification code using cryptographically secure random
 */
function generateVerificationCode(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Generate secure random token
 */
function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Hash password using scrypt (matches existing auth.ts format)
 * Format: hex(hash).salt
 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

/**
 * Add minutes to a date
 */
function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Log registration event for audit purposes
 */
async function logRegistrationEvent(
  eventType: string,
  data: {
    email?: string;
    tenantId?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    note?: string;
    error?: string;
    [key: string]: any
  }
): Promise<void> {
  try {
    await db.insert(registrationAuditLog).values({
      eventType,
      email: data.email,
      tenantId: data.tenantId,
      userId: data.userId,
      ipAddress: data.ip,
      userAgent: data.userAgent,
      metadata: data,
    });
  } catch (err) {
    console.error('[Registration Audit] Failed to log event:', err);
  }
}

/**
 * Generate subdomain suggestions when requested one is taken
 */
function generateSubdomainSuggestions(base: string): string[] {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 900) + 100;
  return [
    `${base}-store`,
    `${base}-shop`,
    `${base}${year}`,
    `${base}-${randomNum}`,
  ];
}

/**
 * Validate password strength
 * Returns array of error messages (empty if valid)
 */
function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push('At least 8 characters required');
  if (!/[a-z]/.test(password)) errors.push('Lowercase letter required');
  if (!/[A-Z]/.test(password)) errors.push('Uppercase letter required');
  if (!/[0-9]/.test(password)) errors.push('Number required');
  return errors;
}

/**
 * Reserved subdomains that cannot be registered
 */
const RESERVED_SUBDOMAINS = [
  'www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp', 'blog',
  'help', 'support', 'login', 'register', 'dashboard', 'billing',
  'account', 'settings', 'status', 'docs', 'dev', 'staging',
  'test', 'demo', 'cdn', 'assets', 'static', 'media', 'img',
  'images', 'files', 'upload', 'download', 'webhooks', 'webhook'
];

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/auth/register/send-code
 * Send verification code to email address
 *
 * Rate limited: max 5 codes per email per hour
 */
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = sendCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid email address',
        details: parsed.error.errors
      });
    }

    const email = parsed.data.email.toLowerCase().trim();

    // Rate limit: Check for codes sent in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCodes = await db.select()
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.email, email),
        gt(verificationCodes.createdAt, oneHourAgo)
      ));

    if (recentCodes.length >= 5) {
      await logRegistrationEvent('verification_code_rate_limited', {
        email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: 3600
      });
    }

    // Check if email already registered
    // Important: Don't reveal if email exists to prevent enumeration attacks
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      // Log but return same response as success
      await logRegistrationEvent('verification_code_sent', {
        email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        note: 'Email already registered - no code sent'
      });

      return res.json({
        success: true,
        message: 'If this email is not registered, a verification code will be sent.',
        expiresIn: 900
      });
    }

    // Generate and store verification code
    const code = generateVerificationCode();
    const expiresAt = addMinutes(new Date(), 15); // 15 minutes expiry

    await db.insert(verificationCodes).values({
      email,
      code,
      purpose: 'registration',
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
    });

    // Send verification code email
    const emailSent = await EmailService.sendVerificationCodeEmail(email, code, 15);

    // Fallback: log to console if email fails or in dev mode
    if (!emailSent || process.env.NODE_ENV !== 'production') {
      console.log('\n========================================');
      console.log('[DEV] Verification Code');
      console.log(`Email: ${email}`);
      console.log(`Code: ${code}`);
      console.log(`Expires: ${expiresAt.toISOString()}`);
      console.log(`Email sent: ${emailSent ? 'YES' : 'NO (check SMTP config)'}`);
      console.log('========================================\n');
    }

    await logRegistrationEvent('verification_code_sent', {
      email,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: 'If this email is not registered, a verification code will be sent.',
      expiresIn: 900 // 15 minutes in seconds
    });

  } catch (error: any) {
    console.error('[Registration] Send code error:', error);
    res.status(500).json({ message: 'Failed to send verification code' });
  }
});

/**
 * POST /api/auth/register/verify-code
 * Verify 6-digit code and return temporary token
 *
 * The temp token is valid for 10 minutes and allows completing registration
 */
router.post('/verify-code', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = verifyCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: parsed.error.errors
      });
    }

    const { email, code } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Find valid, unexpired, unverified code
    const [verification] = await db.select()
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.email, normalizedEmail),
        eq(verificationCodes.code, code),
        eq(verificationCodes.purpose, 'registration'),
        isNull(verificationCodes.verifiedAt),
        gt(verificationCodes.expiresAt, new Date())
      ))
      .limit(1);

    if (!verification) {
      // Increment attempts on the most recent unverified code for this email
      await db.execute(sql`
        UPDATE verification_codes
        SET attempts = attempts + 1
        WHERE email = ${normalizedEmail}
          AND purpose = 'registration'
          AND verified_at IS NULL
          AND created_at = (
            SELECT MAX(created_at) FROM verification_codes
            WHERE email = ${normalizedEmail}
              AND purpose = 'registration'
              AND verified_at IS NULL
          )
      `);

      await logRegistrationEvent('verification_code_failed', {
        email: normalizedEmail,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(400).json({
        error: 'Invalid or expired verification code'
      });
    }

    // Check max attempts exceeded
    if (verification.attempts && verification.attempts >= (verification.maxAttempts || 5)) {
      await logRegistrationEvent('verification_code_max_attempts', {
        email: normalizedEmail,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(400).json({
        error: 'Too many failed attempts. Please request a new code.'
      });
    }

    // Mark code as verified
    await db.update(verificationCodes)
      .set({ verifiedAt: new Date() })
      .where(eq(verificationCodes.id, verification.id));

    // Generate temporary JWT token (valid for 10 minutes)
    const tempToken = jwt.sign(
      {
        email: normalizedEmail,
        verified: true,
        purpose: 'registration'
      },
      process.env.SESSION_SECRET!,
      { expiresIn: '10m' }
    );

    await logRegistrationEvent('verification_code_verified', {
      email: normalizedEmail,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      verified: true,
      tempToken,
      expiresIn: 600 // 10 minutes in seconds
    });

  } catch (error: any) {
    console.error('[Registration] Verify code error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
});

/**
 * GET /api/tenants/check-subdomain/:subdomain
 * Check if a subdomain is available for registration
 *
 * Returns availability status and suggestions if taken
 */
router.get('/check-subdomain/:subdomain', async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const normalized = subdomain.toLowerCase().trim();

    // Validate format: 3-32 chars, alphanumeric + hyphens, can't start/end with hyphen
    const subdomainRegex = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

    if (normalized.length < 3) {
      return res.json({
        available: false,
        subdomain: normalized,
        error: 'Subdomain must be at least 3 characters'
      });
    }

    if (!subdomainRegex.test(normalized)) {
      return res.json({
        available: false,
        subdomain: normalized,
        error: 'Subdomain must be 3-32 characters, lowercase alphanumeric and hyphens only (cannot start or end with hyphen)'
      });
    }

    // Check reserved words
    if (RESERVED_SUBDOMAINS.includes(normalized)) {
      return res.json({
        available: false,
        subdomain: normalized,
        error: 'This subdomain is reserved',
        suggestions: generateSubdomainSuggestions(normalized)
      });
    }

    // Check if already taken
    const [existing] = await db.select()
      .from(tenants)
      .where(eq(tenants.subdomain, normalized))
      .limit(1);

    if (existing) {
      return res.json({
        available: false,
        subdomain: normalized,
        error: 'This subdomain is already taken',
        suggestions: generateSubdomainSuggestions(normalized)
      });
    }

    // Subdomain is available
    res.json({
      available: true,
      subdomain: normalized,
      url: APP_DOMAIN // Tenant identified by login, subdomain is unique identifier
    });

  } catch (error: any) {
    console.error('[Registration] Check subdomain error:', error);
    res.status(500).json({ message: 'Failed to check subdomain availability' });
  }
});

/**
 * POST /api/tenants/register
 * Create a new tenant and owner user account
 *
 * Requires valid temp token from verify-code step
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parsed = registerTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { tempToken, companyName, subdomain, firstName, lastName, password } = parsed.data;
    const normalizedSubdomain = subdomain.toLowerCase().trim();

    // Verify the temporary token
    let decoded: { email: string; verified: boolean; purpose: string };
    try {
      decoded = jwt.verify(
        tempToken,
        process.env.SESSION_SECRET!
      ) as { email: string; verified: boolean; purpose: string };
    } catch (err) {
      await logRegistrationEvent('registration_invalid_token', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        error: 'Invalid or expired token'
      });

      return res.status(401).json({
        error: 'Invalid or expired token. Please restart the registration process.'
      });
    }

    // Validate token claims
    if (!decoded.verified || decoded.purpose !== 'registration') {
      return res.status(401).json({ message: 'Email not verified' });
    }

    const email = decoded.email;

    // Double-check subdomain availability (may have been taken since check)
    const [existingTenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.subdomain, normalizedSubdomain))
      .limit(1);

    if (existingTenant) {
      return res.status(409).json({
        error: 'Subdomain is no longer available. Please choose another.',
        suggestions: generateSubdomainSuggestions(normalizedSubdomain)
      });
    }

    // Check if email already has an account
    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      await logRegistrationEvent('registration_email_exists', {
        email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(409).json({
        error: 'An account with this email already exists. Please log in instead.'
      });
    }

    // Validate password strength
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordErrors
      });
    }

    // Create tenant and user in a transaction
    const result = await db.transaction(async (tx) => {
      // Create tenant
      const [tenant] = await tx.insert(tenants).values({
        companyName,
        subdomain: normalizedSubdomain,
        planTier: 'free',
        isActive: true,
        trialEndsAt: addDays(new Date(), 14), // 14-day trial
        settings: {
          theme: 'default',
          locale: 'en-US',
          timezone: 'America/Los_Angeles'
        },
      }).returning();

      // Hash password (matching auth.ts format)
      const passwordHash = await hashPassword(password);

      // Create owner user (first user is SuperAdmin)
      const [user] = await tx.insert(users).values({
        tenantId: tenant.id,
        email,
        username: email, // Use email as username initially
        password: passwordHash,
        firstName,
        lastName,
        role: 'SuperAdmin', // First user is always SuperAdmin/owner
        accountStatus: 'active', // Owner is immediately active
        emailVerified: true, // Already verified via code
      }).returning();

      return { tenant, user };
    });

    // Log the user in automatically by creating a session
    req.login(result.user, (err) => {
      if (err) {
        console.error('[Registration] Session creation failed:', err);
        // Don't fail the registration - user can log in manually
      }
    });

    await logRegistrationEvent('registration_completed', {
      email,
      tenantId: result.tenant.id,
      userId: result.user.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Return success response
    res.status(201).json({
      success: true,
      tenant: {
        id: result.tenant.id,
        companyName: result.tenant.companyName,
        subdomain: result.tenant.subdomain,
        url: APP_DOMAIN, // All tenants access via main domain, identified by login
        trialEndsAt: result.tenant.trialEndsAt,
      },
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
      },
      redirectUrl: '/dashboard'
    });

  } catch (error: any) {
    console.error('[Registration] Registration error:', error);

    await logRegistrationEvent('registration_failed', {
      error: safeErrorMessage(error),
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(500).json({ message: 'Registration failed. Please try again.' });
  }
});

export default router;
