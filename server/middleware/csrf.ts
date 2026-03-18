import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

/**
 * CSRF protection using double-submit cookie pattern.
 *
 * For every authenticated session, a CSRF token is set as a cookie.
 * State-mutating requests (POST, PUT, PATCH, DELETE) must include
 * the token in the X-CSRF-Token header.
 */

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

// Routes exempt from CSRF (webhooks from external services)
const EXEMPT_ROUTES = [
  "/api/shopify/webhooks",
];

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Middleware to set CSRF token cookie on every response.
 */
export function csrfTokenSetter(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,  // Must be readable by JavaScript
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  next();
}

/**
 * Middleware to validate CSRF token on state-mutating requests.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Only check state-mutating methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Skip exempt routes (external webhooks)
  if (EXEMPT_ROUTES.some(route => req.path.startsWith(route))) {
    return next();
  }

  // Skip non-API routes
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  next();
}
