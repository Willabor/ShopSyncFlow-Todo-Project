import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { loginLimiter, registrationLimiter, passwordResetLimiter } from "./middleware/rateLimiter";
import { EmailService } from "./services/email";

// MULTI-TENANT: Default tenant ID for new user registrations
// In the future, this could be determined by subdomain or registration form
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || "00000000-0000-0000-0000-000000000001";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

// Hash password using bcrypt (preferred for new passwords)
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Compare passwords - supports both bcrypt ($2b$) and legacy scrypt (hash.salt) formats
async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  // Detect bcrypt format (starts with $2a$, $2b$, or $2y$)
  if (stored.startsWith('$2')) {
    return bcrypt.compare(supplied, stored);
  }

  // Legacy scrypt format (hash.salt)
  const [hashed, salt] = stored.split(".");
  if (!salt) {
    // Invalid format
    return false;
  }
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,              // Prevent XSS attacks
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',            // Allow cookies from same site
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      path: '/',
    },
    proxy: true,  // Trust first proxy (for reverse proxy support)
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        const user = await storage.getUserByEmail(email.trim().toLowerCase());
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      }
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", registrationLimiter, async (req, res, next) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // Validate required fields
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }

      // Normalize email for consistent storage and lookup
      const normalizedEmail = email.trim().toLowerCase();

      // Check if username already exists
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if email already exists (using normalized email)
      const existingEmail = await storage.getUserByEmail(normalizedEmail);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Create user with pending status (requires admin approval)
      // MULTI-TENANT: Assign new users to default tenant
      const user = await storage.createUser({
        tenantId: DEFAULT_TENANT_ID,  // MULTI-TENANT: Required tenant assignment
        username,
        email: normalizedEmail,  // Store normalized email
        password: await hashPassword(password),
        firstName,
        lastName,
        accountStatus: "pending", // Requires admin approval
        emailVerified: false,
      });

      // Send registration pending email
      await EmailService.sendRegistrationPendingEmail(normalizedEmail, username);

      // DO NOT auto-login - user must wait for admin approval
      res.status(201).json({
        message: "Registration successful! Your account is pending admin approval. You will be notified once approved.",
        accountStatus: "pending"
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });

  app.post("/api/login", loginLimiter, async (req, res, next) => {
    const { email, password, tenantId } = req.body;  // MULTI-TENANT: Accept tenantId
    const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"];
    const normalizedEmail = email?.trim().toLowerCase();

    try {
      // Find user by email
      const user = await storage.getUserByEmail(normalizedEmail);

      if (!user) {
        // Log failed attempt (user not found)
        await storage.logLoginAttempt({
          email: normalizedEmail,
          ipAddress,
          userAgent,
          success: false,
          failureReason: "Invalid credentials",
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check password
      const isPasswordValid = await comparePasswords(password, user.password);

      if (!isPasswordValid) {
        // Log failed attempt (wrong password)
        await storage.logLoginAttempt({
          email: user.email,
          ipAddress,
          userAgent,
          success: false,
          failureReason: "Invalid credentials",
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // MULTI-TENANT: Validate tenant context
      // If user has a tenant assigned, tenantId must be provided and must match
      if (user.tenantId) {
        if (!tenantId) {
          // User belongs to a tenant but no tenantId provided - requires two-step login
          await storage.logLoginAttempt({
            email: user.email,
            ipAddress,
            userAgent,
            success: false,
            failureReason: "Missing tenant context",
          });
          return res.status(401).json({ message: "Invalid credentials" });
        }
        if (user.tenantId !== tenantId) {
          await storage.logLoginAttempt({
            email: user.email,
            ipAddress,
            userAgent,
            success: false,
            failureReason: "Tenant mismatch",
          });
          return res.status(401).json({ message: "Invalid credentials" });
        }
      }

      // Check account status
      if (user.accountStatus === "pending") {
        await storage.logLoginAttempt({
          email: user.email,
          ipAddress,
          userAgent,
          success: false,
          failureReason: "Account pending approval",
        });
        return res.status(403).json({ message: "Your account is pending admin approval" });
      }

      if (user.accountStatus === "suspended") {
        await storage.logLoginAttempt({
          email: user.email,
          ipAddress,
          userAgent,
          success: false,
          failureReason: "Account suspended",
        });
        return res.status(403).json({ message: "Your account has been suspended. Please contact support." });
      }

      if (user.accountStatus === "rejected") {
        await storage.logLoginAttempt({
          email: user.email,
          ipAddress,
          userAgent,
          success: false,
          failureReason: "Account rejected",
        });
        return res.status(403).json({ message: "Your account registration was rejected." });
      }

      // Successful login
      req.login(user, async (err) => {
        if (err) {
          await storage.logLoginAttempt({
            email: user.email,
            ipAddress,
            userAgent,
            success: false,
            failureReason: "Session error",
          });
          return next(err);
        }

        // Log successful login
        await storage.logLoginAttempt({
          email: user.email,
          ipAddress,
          userAgent,
          success: true,
          failureReason: null,
        });

        const { password: _pw, ...safeUser } = user as any;
        res.status(200).json(safeUser);
      });
    } catch (error) {
      console.error("Login error:", error);
      next(error);
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      // Destroy the session completely (not just passport logout)
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error("Session destroy error:", destroyErr);
          return next(destroyErr);
        }
        // Clear the session cookie (options must match original cookie settings)
        res.clearCookie("connect.sid", {
          path: "/",
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: "lax"
        });
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { password: _pw, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  // Forgot password - send reset email
  app.post("/api/forgot-password", passwordResetLimiter, async (req, res, next) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);

      // Always return success message (don't reveal if email exists)
      if (!user) {
        return res.status(200).json({
          message: "If an account with that email exists, a password reset link has been sent."
        });
      }

      // Generate reset token
      const resetToken = await EmailService.generateResetToken();
      const tokenHash = await EmailService.hashToken(resetToken);

      // Store token in database (expires in 60 minutes)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);

      // Send reset email
      await EmailService.sendPasswordResetEmail(user.email, user.username, resetToken);

      res.status(200).json({
        message: "If an account with that email exists, a password reset link has been sent."
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      next(error);
    }
  });

  // Reset password with token
  app.post("/api/reset-password", async (req, res, next) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      // Hash the token to look it up
      const tokenHash = await EmailService.hashToken(token);

      // Find the token in database
      const resetToken = await storage.getPasswordResetToken(tokenHash);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token was already used
      if (resetToken.used) {
        return res.status(400).json({ message: "Reset token has already been used" });
      }

      // MULTI-TENANT: Get user to retrieve their tenant context
      const user = await storage.getUser(resetToken.userId);
      if (!user || !user.tenantId) {
        return res.status(400).json({ message: "User not found or invalid tenant" });
      }

      // Update user's password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(user.tenantId, resetToken.userId, { password: hashedPassword });

      // Mark token as used
      await storage.markTokenAsUsed(tokenHash);

      // Clean up expired tokens
      await storage.deleteExpiredTokens();

      res.status(200).json({
        message: "Password has been reset successfully. You can now log in with your new password."
      });
    } catch (error) {
      console.error("Reset password error:", error);
      next(error);
    }
  });

  // MULTI-TENANT: Look up tenant(s) for an email before login
  // This enables the two-step login flow:
  // 1. User enters email → system looks up their tenant
  // 2. User sees THEIR company name (not hardcoded) → enters password
  app.post("/api/auth/lookup-tenant", loginLimiter, async (req, res, next) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== "string" || email.trim() === "") {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(normalizedEmail);

      if (!user) {
        // Security: Don't reveal if user exists - return empty array
        return res.json({ tenants: [] });
      }

      // Check if user has a tenant assigned
      if (!user.tenantId) {
        // User exists but no tenant assigned
        return res.json({ tenants: [] });
      }

      // Get tenant info for this user
      const tenant = await storage.getTenantById(user.tenantId);

      if (!tenant || !tenant.isActive) {
        // Tenant not found or inactive
        return res.json({ tenants: [] });
      }

      // Return tenant info (only public-safe fields)
      res.json({
        tenants: [{
          id: tenant.id,
          companyName: tenant.companyName,
          subdomain: tenant.subdomain,
        }]
      });
    } catch (error) {
      console.error("Tenant lookup error:", error);
      next(error);
    }
  });

  // Legacy endpoint: Get default tenant info (kept for backwards compatibility)
  // Will be deprecated once subdomain-based routing is implemented
  app.get("/api/tenant/info", async (req, res, next) => {
    try {
      const tenant = await storage.getDefaultTenant();
      if (!tenant) {
        return res.status(404).json({ message: "No tenant configured" });
      }
      // Return only public-safe tenant info
      res.json({
        id: tenant.id,
        companyName: tenant.companyName,
        subdomain: tenant.subdomain,
      });
    } catch (error) {
      console.error("Error fetching tenant info:", error);
      next(error);
    }
  });
}
