import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createTestApp, createMockUser, requireAuth, requireRole, getTenantId } from './test-helpers';

// ---------------------------------------------------------------------------
// requireAuth middleware
// ---------------------------------------------------------------------------

describe('requireAuth middleware', () => {
  it('should allow authenticated requests (200)', async () => {
    const app = createTestApp(createMockUser());
    app.get('/protected', requireAuth, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('should block unauthenticated requests (401)', async () => {
    const app = createTestApp(); // no user
    app.get('/protected', requireAuth, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });
});

// ---------------------------------------------------------------------------
// requireRole middleware
// ---------------------------------------------------------------------------

describe('requireRole middleware', () => {
  it('should allow matching role (200)', async () => {
    const app = createTestApp(createMockUser({ role: 'SuperAdmin' }));
    app.get('/admin', requireRole(['SuperAdmin']), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/admin');
    expect(res.status).toBe(200);
  });

  it('should block non-matching role (403)', async () => {
    const app = createTestApp(createMockUser({ role: 'Auditor' }));
    app.get('/admin', requireRole(['SuperAdmin']), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/admin');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Insufficient permissions');
  });

  it('should block unauthenticated user (401)', async () => {
    const app = createTestApp(); // no user
    app.get('/admin', requireRole(['SuperAdmin']), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/admin');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('should allow when user role is one of multiple accepted roles', async () => {
    const app = createTestApp(createMockUser({ role: 'WarehouseManager' }));
    app.get('/manage', requireRole(['SuperAdmin', 'WarehouseManager']), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/manage');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Role-specific access tests (all four roles)
// ---------------------------------------------------------------------------

describe('Role-specific access control', () => {
  const roles = ['SuperAdmin', 'WarehouseManager', 'Editor', 'Auditor'] as const;

  // Each role should be granted access when it is in the allowed list
  roles.forEach((role) => {
    it(`should grant access to ${role} when role is in allowed list`, async () => {
      const app = createTestApp(createMockUser({ role }));
      app.get('/test', requireRole([role]), (_req, res) => {
        res.status(200).json({ role });
      });

      const res = await supertest(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe(role);
    });
  });

  // Each role should be denied access when it is NOT in the allowed list
  roles.forEach((role) => {
    const otherRoles = roles.filter((r) => r !== role);
    it(`should deny ${role} when only [${otherRoles.join(', ')}] are allowed`, async () => {
      const app = createTestApp(createMockUser({ role }));
      app.get('/test', requireRole(otherRoles as unknown as string[]), (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const res = await supertest(app).get('/test');
      expect(res.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// getTenantId helper
// ---------------------------------------------------------------------------

describe('getTenantId helper', () => {
  it('should extract tenantId from authenticated user', async () => {
    const app = createTestApp(createMockUser({ tenantId: 'my-tenant-42' }));
    app.get('/tenant', (req, res) => {
      res.json({ tenantId: getTenantId(req) });
    });

    const res = await supertest(app).get('/tenant');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe('my-tenant-42');
  });

  it('should return null when no user is present', async () => {
    const app = createTestApp(); // no user
    app.get('/tenant', (req, res) => {
      res.json({ tenantId: getTenantId(req) });
    });

    const res = await supertest(app).get('/tenant');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Middleware composition (requireAuth + requireRole chained)
// ---------------------------------------------------------------------------

describe('Middleware composition', () => {
  it('should allow authenticated user with correct role through both guards', async () => {
    const app = createTestApp(createMockUser({ role: 'Editor' }));
    app.get('/compose', requireAuth, requireRole(['Editor', 'SuperAdmin']), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/compose');
    expect(res.status).toBe(200);
  });

  it('should block at requireAuth before reaching requireRole', async () => {
    const app = createTestApp(); // no user
    app.get('/compose', requireAuth, requireRole(['SuperAdmin']), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(app).get('/compose');
    expect(res.status).toBe(401);
  });
});
