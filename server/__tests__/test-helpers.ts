import express, { Express, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { vi } from 'vitest';

/**
 * Create a mock user object for testing.
 * Defaults to SuperAdmin with active account in tenant-1.
 */
export function createMockUser(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    username: 'testuser',
    email: 'test@example.com',
    password: '$2b$10$hashedpasswordplaceholdervalue',
    firstName: 'Test',
    lastName: 'User',
    role: 'SuperAdmin',
    accountStatus: 'active',
    emailVerified: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a mock tenant object for testing.
 */
export function createMockTenant(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'tenant-1',
    companyName: 'Test Tenant',
    subdomain: 'test-tenant',
    shopifyStoreUrl: null,
    shopifyAccessToken: null,
    isActive: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create an Express app with auth middleware that uses a mock user.
 * This bypasses Passport entirely for simpler unit testing of middleware
 * and route logic that depends on req.user / req.isAuthenticated().
 */
export function createTestApp(mockUser?: any): Express {
  const app = express();
  app.use(express.json());

  // Simple in-memory session (no database dependency)
  app.use(session({
    secret: 'test-secret-for-vitest',
    resave: false,
    saveUninitialized: false,
    store: new session.MemoryStore(),
  }));

  // Attach mock user to every request (simulating passport)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) {
      (req as any).user = mockUser;
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });

  return app;
}

/**
 * Authentication middleware -- mirrors the production requireAuth pattern.
 * Returns 401 if the request is not authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required' });
}

/**
 * Role-based access middleware -- mirrors the production requireRole pattern.
 * Returns 401 if not authenticated, 403 if role does not match.
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const user = req.user as any;
    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Extract the tenant ID from the authenticated user.
 * Returns null when there is no user on the request.
 */
export function getTenantId(req: Request): string | null {
  return (req.user as any)?.tenantId || null;
}
