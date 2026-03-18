import { describe, it, expect, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createTestApp, createMockUser, requireAuth, requireRole, getTenantId } from './test-helpers';
import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// In-memory data store for testing tenant isolation
// ---------------------------------------------------------------------------

const testData = new Map<string, any[]>();

// ---------------------------------------------------------------------------
// Helper: register test routes on an Express app
// ---------------------------------------------------------------------------

function setupTestRoutes(app: any) {
  // GET /api/items - returns items for user's tenant only
  app.get('/api/items', requireAuth, (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'No tenant' });
    const items = testData.get(tenantId) || [];
    res.json(items);
  });

  // GET /api/items/:id - returns single item if it belongs to the tenant
  app.get('/api/items/:id', requireAuth, (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'No tenant' });
    const items = testData.get(tenantId) || [];
    const item = items.find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  });

  // POST /api/items - creates an item scoped to the user's tenant
  app.post('/api/items', requireAuth, (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'No tenant' });
    const item = { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tenantId, ...req.body };
    const items = testData.get(tenantId) || [];
    items.push(item);
    testData.set(tenantId, items);
    res.status(201).json(item);
  });

  // DELETE /api/items/:id - deletes only if the item belongs to the tenant
  app.delete('/api/items/:id', requireAuth, (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'No tenant' });
    const items = testData.get(tenantId) || [];
    const idx = items.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    items.splice(idx, 1);
    res.status(200).json({ message: 'Deleted' });
  });

  // PUT /api/items/:id - updates only if the item belongs to the tenant
  app.put('/api/items/:id', requireAuth, (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'No tenant' });
    const items = testData.get(tenantId) || [];
    const idx = items.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    items[idx] = { ...items[idx], ...req.body };
    res.json(items[idx]);
  });

  // GET /api/admin/items - admin-only route (SuperAdmin, WarehouseManager)
  app.get('/api/admin/items', requireRole(['SuperAdmin', 'WarehouseManager']), (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ message: 'No tenant' });
    const items = testData.get(tenantId) || [];
    res.json(items);
  });
}

// ---------------------------------------------------------------------------
// Seed data used across tests
// ---------------------------------------------------------------------------

const TENANT_1_ITEMS = [
  { id: 'item-t1-a', tenantId: 'tenant-1', name: 'Tenant 1 Item A' },
  { id: 'item-t1-b', tenantId: 'tenant-1', name: 'Tenant 1 Item B' },
  { id: 'item-t1-c', tenantId: 'tenant-1', name: 'Tenant 1 Item C' },
];

const TENANT_2_ITEMS = [
  { id: 'item-t2-x', tenantId: 'tenant-2', name: 'Tenant 2 Item X' },
  { id: 'item-t2-y', tenantId: 'tenant-2', name: 'Tenant 2 Item Y' },
];

// ---------------------------------------------------------------------------
// Test apps for each tenant
// ---------------------------------------------------------------------------

const tenant1User = createMockUser({ id: 'user-t1', tenantId: 'tenant-1', role: 'SuperAdmin' });
const tenant2User = createMockUser({ id: 'user-t2', tenantId: 'tenant-2', role: 'SuperAdmin' });

const app1 = createTestApp(tenant1User);
setupTestRoutes(app1);

const app2 = createTestApp(tenant2User);
setupTestRoutes(app2);

// ---------------------------------------------------------------------------
// Reset and seed data before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  testData.clear();
  testData.set('tenant-1', [...TENANT_1_ITEMS]);
  testData.set('tenant-2', [...TENANT_2_ITEMS]);
});

// ===========================================================================
// Test Suites
// ===========================================================================

describe('Multi-tenant data isolation', () => {

  // -------------------------------------------------------------------------
  // 1. List isolation
  // -------------------------------------------------------------------------

  describe('List isolation', () => {
    it('tenant-1 user sees only tenant-1 items', async () => {
      const res = await supertest(app1).get('/api/items');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.every((item: any) => item.tenantId === 'tenant-1')).toBe(true);
      expect(res.body.map((i: any) => i.id)).toEqual(['item-t1-a', 'item-t1-b', 'item-t1-c']);
    });

    it('tenant-2 user sees only tenant-2 items', async () => {
      const res = await supertest(app2).get('/api/items');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((item: any) => item.tenantId === 'tenant-2')).toBe(true);
      expect(res.body.map((i: any) => i.id)).toEqual(['item-t2-x', 'item-t2-y']);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Get isolation
  // -------------------------------------------------------------------------

  describe('Get by ID isolation', () => {
    it('tenant-1 can GET its own item by ID', async () => {
      const res = await supertest(app1).get('/api/items/item-t1-a');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('item-t1-a');
      expect(res.body.tenantId).toBe('tenant-1');
    });

    it('tenant-1 cannot GET tenant-2 item by ID (returns 404)', async () => {
      const res = await supertest(app1).get('/api/items/item-t2-x');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
    });

    it('tenant-2 cannot GET tenant-1 item by ID (returns 404)', async () => {
      const res = await supertest(app2).get('/api/items/item-t1-a');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Create isolation
  // -------------------------------------------------------------------------

  describe('Create isolation', () => {
    it('items created by tenant-1 user have tenantId=tenant-1', async () => {
      const res = await supertest(app1)
        .post('/api/items')
        .send({ name: 'New Item from T1' });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-1');
      expect(res.body.name).toBe('New Item from T1');

      // Verify it appears in tenant-1 list
      const listRes = await supertest(app1).get('/api/items');
      expect(listRes.body).toHaveLength(4);
    });

    it('items created by tenant-2 user have tenantId=tenant-2', async () => {
      const res = await supertest(app2)
        .post('/api/items')
        .send({ name: 'New Item from T2' });

      expect(res.status).toBe(201);
      expect(res.body.tenantId).toBe('tenant-2');
      expect(res.body.name).toBe('New Item from T2');

      // Verify it appears in tenant-2 list
      const listRes = await supertest(app2).get('/api/items');
      expect(listRes.body).toHaveLength(3);
    });

    it('creating in tenant-1 does not affect tenant-2 list (no cross-pollination)', async () => {
      // Snapshot tenant-2 count before
      const beforeRes = await supertest(app2).get('/api/items');
      const countBefore = beforeRes.body.length;

      // Create item in tenant-1
      await supertest(app1)
        .post('/api/items')
        .send({ name: 'T1 only item' });

      // tenant-2 count must remain unchanged
      const afterRes = await supertest(app2).get('/api/items');
      expect(afterRes.body.length).toBe(countBefore);

      // Confirm no tenant-1 data leaked into tenant-2
      const hasTenant1Data = afterRes.body.some((item: any) => item.tenantId === 'tenant-1');
      expect(hasTenant1Data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Delete isolation
  // -------------------------------------------------------------------------

  describe('Delete isolation', () => {
    it('tenant-1 can delete its own item', async () => {
      const res = await supertest(app1).delete('/api/items/item-t1-b');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Deleted');

      // Verify it was removed from tenant-1 list
      const listRes = await supertest(app1).get('/api/items');
      expect(listRes.body).toHaveLength(2);
      expect(listRes.body.find((i: any) => i.id === 'item-t1-b')).toBeUndefined();
    });

    it('tenant-1 cannot delete tenant-2 item (returns 404)', async () => {
      const res = await supertest(app1).delete('/api/items/item-t2-x');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');

      // Verify tenant-2 item was NOT deleted
      const listRes = await supertest(app2).get('/api/items');
      expect(listRes.body).toHaveLength(2);
      expect(listRes.body.find((i: any) => i.id === 'item-t2-x')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Update isolation
  // -------------------------------------------------------------------------

  describe('Update isolation', () => {
    it('tenant-2 cannot update tenant-1 item (returns 404)', async () => {
      const res = await supertest(app2)
        .put('/api/items/item-t1-a')
        .send({ name: 'Hacked by T2' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Not found');

      // Confirm the original item is untouched
      const getRes = await supertest(app1).get('/api/items/item-t1-a');
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Tenant 1 Item A');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Empty state
  // -------------------------------------------------------------------------

  describe('Empty state', () => {
    it('a tenant with no data returns an empty array', async () => {
      // Create a test app for a brand-new tenant with no seeded data
      const tenant3User = createMockUser({ id: 'user-t3', tenantId: 'tenant-3', role: 'SuperAdmin' });
      const app3 = createTestApp(tenant3User);
      setupTestRoutes(app3);

      const res = await supertest(app3).get('/api/items');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Unauthenticated / no tenant
  // -------------------------------------------------------------------------

  describe('Unauthenticated and no-tenant access', () => {
    it('unauthenticated request returns 401', async () => {
      const noUserApp = createTestApp(); // no user attached
      setupTestRoutes(noUserApp);

      const res = await supertest(noUserApp).get('/api/items');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Authentication required');
    });

    it('authenticated user without tenantId returns 401 with No tenant message', async () => {
      const noTenantUser = createMockUser({ id: 'user-orphan', tenantId: null });
      const noTenantApp = createTestApp(noTenantUser);
      setupTestRoutes(noTenantApp);

      const res = await supertest(noTenantApp).get('/api/items');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('No tenant');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Role-based access combined with tenant isolation
  // -------------------------------------------------------------------------

  describe('Role-based access with tenant isolation', () => {
    it('Auditor cannot access admin-only route (returns 403)', async () => {
      const auditorUser = createMockUser({ id: 'user-auditor', tenantId: 'tenant-1', role: 'Auditor' });
      const auditorApp = createTestApp(auditorUser);
      setupTestRoutes(auditorApp);

      const res = await supertest(auditorApp).get('/api/admin/items');

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Insufficient permissions');
    });

    it('SuperAdmin can access admin-only route and only sees own tenant data', async () => {
      const res = await supertest(app1).get('/api/admin/items');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.every((item: any) => item.tenantId === 'tenant-1')).toBe(true);
    });

    it('WarehouseManager can access admin-only route and only sees own tenant data', async () => {
      const warehouseUser = createMockUser({ id: 'user-wm', tenantId: 'tenant-2', role: 'WarehouseManager' });
      const warehouseApp = createTestApp(warehouseUser);
      setupTestRoutes(warehouseApp);

      const res = await supertest(warehouseApp).get('/api/admin/items');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.every((item: any) => item.tenantId === 'tenant-2')).toBe(true);
    });
  });
});
