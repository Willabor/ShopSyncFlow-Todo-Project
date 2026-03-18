import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import express from 'express';
import session from 'express-session';
import supertest from 'supertest';
import bcrypt from 'bcrypt';

const scryptAsync = promisify(scrypt);

// ---------------------------------------------------------------------------
// Module mocks -- must be declared before any import that triggers auth.ts
// ---------------------------------------------------------------------------

// Mock the storage module so we never touch a real database
vi.mock('../storage', () => {
  const MemoryStore = require('express-session').MemoryStore;
  return {
    storage: {
      getUserByEmail: vi.fn(),
      getUserByUsername: vi.fn(),
      createUser: vi.fn(),
      getUser: vi.fn(),
      logLoginAttempt: vi.fn().mockResolvedValue(undefined),
      createPasswordResetToken: vi.fn().mockResolvedValue(undefined),
      getPasswordResetToken: vi.fn(),
      markTokenAsUsed: vi.fn().mockResolvedValue(undefined),
      deleteExpiredTokens: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn(),
      getDefaultTenant: vi.fn(),
      getTenantById: vi.fn(),
      sessionStore: new MemoryStore(),
    },
  };
});

// Mock the email service to prevent SMTP connections during tests
vi.mock('../services/email', () => ({
  EmailService: {
    sendRegistrationPendingEmail: vi.fn().mockResolvedValue(true),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
    sendAccountApprovedEmail: vi.fn().mockResolvedValue(true),
    sendVerificationCodeEmail: vi.fn().mockResolvedValue(true),
    generateResetToken: vi.fn().mockResolvedValue('mock-reset-token'),
    hashToken: vi.fn().mockResolvedValue('hashed-mock-token.salt'),
    verifyToken: vi.fn().mockResolvedValue(true),
  },
}));

// Mock the rate limiter so it never blocks test requests
vi.mock('../middleware/rateLimiter', () => {
  const passthrough = (_req: any, _res: any, next: any) => next();
  return {
    loginLimiter: passthrough,
    registrationLimiter: passthrough,
    passwordResetLimiter: passthrough,
    twoFactorLimiter: passthrough,
    apiLimiter: passthrough,
  };
});

// Mock the db module to prevent DATABASE_URL requirement
vi.mock('../db', () => ({
  db: {},
  pool: { on: vi.fn(), query: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Now import the modules that depend on the mocks above
// ---------------------------------------------------------------------------
import { setupAuth } from '../auth';
import { storage } from '../storage';

// ---------------------------------------------------------------------------
// Helper: build a fresh Express app with auth routes for each test suite
// ---------------------------------------------------------------------------
function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Provide SESSION_SECRET so setupAuth doesn't blow up
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.NODE_ENV = 'test';

  setupAuth(app);
  return app;
}

// ---------------------------------------------------------------------------
// Helper: create a bcrypt-hashed password for test users
// ---------------------------------------------------------------------------
async function hashForTest(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ---------------------------------------------------------------------------
// Helper: create a scrypt-hashed password (legacy format) for test users
// ---------------------------------------------------------------------------
async function scryptHashForTest(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString('hex')}.${salt}`;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Authentication - Password Hashing Utilities', () => {
  const testPassword = 'testPassword123';

  it('should hash a password with salt using scrypt', async () => {
    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(testPassword, salt, 64)) as Buffer;
    const hashedPassword = `${buf.toString('hex')}.${salt}`;

    expect(hashedPassword).toBeDefined();
    expect(hashedPassword).toContain('.');
    expect(hashedPassword.split('.').length).toBe(2);
  });

  it('should verify correct password with scrypt', async () => {
    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(testPassword, salt, 64)) as Buffer;
    const hashedPassword = `${buf.toString('hex')}.${salt}`;

    const [hashed, saltFromDb] = hashedPassword.split('.');
    const hashedBuf = Buffer.from(hashed, 'hex');
    const suppliedBuf = (await scryptAsync(testPassword, saltFromDb, 64)) as Buffer;

    expect(timingSafeEqual(hashedBuf, suppliedBuf)).toBe(true);
  });

  it('should reject incorrect password with scrypt', async () => {
    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(testPassword, salt, 64)) as Buffer;
    const hashedPassword = `${buf.toString('hex')}.${salt}`;

    const [hashed, saltFromDb] = hashedPassword.split('.');
    const hashedBuf = Buffer.from(hashed, 'hex');
    const suppliedBuf = (await scryptAsync('wrongPassword', saltFromDb, 64)) as Buffer;

    expect(timingSafeEqual(hashedBuf, suppliedBuf)).toBe(false);
  });

  it('should create unique hashes for the same password (different salts)', async () => {
    const salt1 = randomBytes(16).toString('hex');
    const buf1 = (await scryptAsync(testPassword, salt1, 64)) as Buffer;
    const hash1 = `${buf1.toString('hex')}.${salt1}`;

    const salt2 = randomBytes(16).toString('hex');
    const buf2 = (await scryptAsync(testPassword, salt2, 64)) as Buffer;
    const hash2 = `${buf2.toString('hex')}.${salt2}`;

    expect(hash1).not.toBe(hash2);
  });

  it('bcrypt hash produces a verifiable hash', async () => {
    const hash = await bcrypt.hash(testPassword, 10);
    expect(hash.startsWith('$2b$')).toBe(true);
    expect(await bcrypt.compare(testPassword, hash)).toBe(true);
  });

  it('bcrypt compare succeeds for correct password', async () => {
    const hash = await bcrypt.hash(testPassword, 10);
    expect(await bcrypt.compare(testPassword, hash)).toBe(true);
  });

  it('bcrypt compare fails for wrong password', async () => {
    const hash = await bcrypt.hash(testPassword, 10);
    expect(await bcrypt.compare('wrongPassword', hash)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/login
// ---------------------------------------------------------------------------

describe('POST /api/login', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 for non-existent email', async () => {
    (storage.getUserByEmail as any).mockResolvedValue(null);

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'nobody@test.com', password: 'pwd', tenantId: 'tenant-1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    expect(storage.logLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, failureReason: 'Invalid credentials' }),
    );
  });

  it('should return 401 for wrong password', async () => {
    const hashedPw = await hashForTest('correctPassword');
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@test.com',
      password: hashedPw,
      accountStatus: 'active',
    });

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'user@test.com', password: 'wrongPassword', tenantId: 'tenant-1' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('should return 403 for pending account', async () => {
    const hashedPw = await hashForTest('pass123');
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'pending@test.com',
      password: hashedPw,
      accountStatus: 'pending',
    });

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'pending@test.com', password: 'pass123', tenantId: 'tenant-1' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('pending');
  });

  it('should return 403 for suspended account', async () => {
    const hashedPw = await hashForTest('pass123');
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'suspended@test.com',
      password: hashedPw,
      accountStatus: 'suspended',
    });

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'suspended@test.com', password: 'pass123', tenantId: 'tenant-1' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('suspended');
  });

  it('should return 403 for rejected account', async () => {
    const hashedPw = await hashForTest('pass123');
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'rejected@test.com',
      password: hashedPw,
      accountStatus: 'rejected',
    });

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'rejected@test.com', password: 'pass123', tenantId: 'tenant-1' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('rejected');
  });

  it('should return 401 when tenantId is missing for a tenant-bound user', async () => {
    const hashedPw = await hashForTest('pass123');
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@test.com',
      password: hashedPw,
      accountStatus: 'active',
    });

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'user@test.com', password: 'pass123' }); // no tenantId

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    expect(storage.logLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: 'Missing tenant context' }),
    );
  });

  it('should return 401 when tenantId does not match user tenant', async () => {
    const hashedPw = await hashForTest('pass123');
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@test.com',
      password: hashedPw,
      accountStatus: 'active',
    });

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'user@test.com', password: 'pass123', tenantId: 'wrong-tenant' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    expect(storage.logLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: 'Tenant mismatch' }),
    );
  });

  it('should return 200 with user data (sans password) for valid login', async () => {
    const hashedPw = await hashForTest('pass123');
    const mockUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      username: 'jdoe',
      email: 'jdoe@test.com',
      password: hashedPw,
      firstName: 'John',
      lastName: 'Doe',
      role: 'SuperAdmin',
      accountStatus: 'active',
      emailVerified: true,
    };
    (storage.getUserByEmail as any).mockResolvedValue(mockUser);
    // deserializeUser is called by passport session -- mock getUser too
    (storage.getUser as any).mockResolvedValue(mockUser);

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'jdoe@test.com', password: 'pass123', tenantId: 'tenant-1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'user-1');
    expect(res.body).toHaveProperty('username', 'jdoe');
    expect(res.body).toHaveProperty('email', 'jdoe@test.com');
    // Password must never be returned
    expect(res.body).not.toHaveProperty('password');
    // Successful login must be logged
    expect(storage.logLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, failureReason: null }),
    );
  });

  it('should normalize email to lowercase', async () => {
    const hashedPw = await hashForTest('pass123');
    const mockUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      username: 'jdoe',
      email: 'jdoe@test.com',
      password: hashedPw,
      accountStatus: 'active',
    };
    (storage.getUserByEmail as any).mockResolvedValue(mockUser);
    (storage.getUser as any).mockResolvedValue(mockUser);

    await supertest(app)
      .post('/api/login')
      .send({ email: '  JDoe@Test.COM  ', password: 'pass123', tenantId: 'tenant-1' });

    // getUserByEmail should have been called with the normalized version
    expect(storage.getUserByEmail).toHaveBeenCalledWith('jdoe@test.com');
  });

  it('should authenticate with legacy scrypt password format', async () => {
    const scryptHash = await scryptHashForTest('legacyPass');
    const mockUser = {
      id: 'user-2',
      tenantId: 'tenant-1',
      username: 'legacyuser',
      email: 'legacy@test.com',
      password: scryptHash,
      accountStatus: 'active',
    };
    (storage.getUserByEmail as any).mockResolvedValue(mockUser);
    (storage.getUser as any).mockResolvedValue(mockUser);

    const res = await supertest(app)
      .post('/api/login')
      .send({ email: 'legacy@test.com', password: 'legacyPass', tenantId: 'tenant-1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'user-2');
    expect(res.body).not.toHaveProperty('password');
  });
});

// ---------------------------------------------------------------------------
// POST /api/register
// ---------------------------------------------------------------------------

describe('POST /api/register', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for missing required fields (no username)', async () => {
    const res = await supertest(app)
      .post('/api/register')
      .send({ email: 'a@b.com', password: 'pw' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('required');
  });

  it('should return 400 for missing required fields (no email)', async () => {
    const res = await supertest(app)
      .post('/api/register')
      .send({ username: 'user1', password: 'pw' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('required');
  });

  it('should return 400 for missing required fields (no password)', async () => {
    const res = await supertest(app)
      .post('/api/register')
      .send({ username: 'user1', email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('required');
  });

  it('should return 400 for duplicate username', async () => {
    (storage.getUserByUsername as any).mockResolvedValue({ id: 'existing-user' });
    (storage.getUserByEmail as any).mockResolvedValue(null);

    const res = await supertest(app)
      .post('/api/register')
      .send({ username: 'taken', email: 'new@test.com', password: 'pw123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Username already exists');
  });

  it('should return 400 for duplicate email', async () => {
    (storage.getUserByUsername as any).mockResolvedValue(null);
    (storage.getUserByEmail as any).mockResolvedValue({ id: 'existing-user' });

    const res = await supertest(app)
      .post('/api/register')
      .send({ username: 'newuser', email: 'taken@test.com', password: 'pw123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Email already exists');
  });

  it('should return 201 with pending status for valid registration', async () => {
    (storage.getUserByUsername as any).mockResolvedValue(null);
    (storage.getUserByEmail as any).mockResolvedValue(null);
    (storage.createUser as any).mockImplementation(async (data: any) => ({
      id: 'new-user-id',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const res = await supertest(app)
      .post('/api/register')
      .send({
        username: 'newuser',
        email: 'new@test.com',
        password: 'strongPassword123',
        firstName: 'New',
        lastName: 'User',
      });

    expect(res.status).toBe(201);
    expect(res.body.accountStatus).toBe('pending');
    expect(res.body.message).toContain('pending');
  });

  it('should store a hashed password, never plaintext', async () => {
    (storage.getUserByUsername as any).mockResolvedValue(null);
    (storage.getUserByEmail as any).mockResolvedValue(null);

    let capturedUser: any = null;
    (storage.createUser as any).mockImplementation(async (data: any) => {
      capturedUser = data;
      return { id: 'new-user-id', ...data };
    });

    await supertest(app)
      .post('/api/register')
      .send({ username: 'hashtest', email: 'hash@test.com', password: 'myPlaintext' });

    expect(capturedUser).not.toBeNull();
    // Password must be a bcrypt hash, not the plaintext value
    expect(capturedUser.password).not.toBe('myPlaintext');
    expect(capturedUser.password.startsWith('$2b$')).toBe(true);
    // The bcrypt hash should verify against the original password
    const isValid = await bcrypt.compare('myPlaintext', capturedUser.password);
    expect(isValid).toBe(true);
  });

  it('should normalize email to lowercase before storage', async () => {
    (storage.getUserByUsername as any).mockResolvedValue(null);
    (storage.getUserByEmail as any).mockResolvedValue(null);

    let capturedUser: any = null;
    (storage.createUser as any).mockImplementation(async (data: any) => {
      capturedUser = data;
      return { id: 'new-id', ...data };
    });

    await supertest(app)
      .post('/api/register')
      .send({ username: 'casetest', email: '  TestEmail@UPPER.com  ', password: 'pass' });

    expect(capturedUser.email).toBe('testemail@upper.com');
  });
});

// ---------------------------------------------------------------------------
// POST /api/logout
// ---------------------------------------------------------------------------

describe('POST /api/logout', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 and clear the session', async () => {
    // First login to get a session
    const hashedPw = await hashForTest('pass123');
    const mockUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      username: 'jdoe',
      email: 'jdoe@test.com',
      password: hashedPw,
      accountStatus: 'active',
    };
    (storage.getUserByEmail as any).mockResolvedValue(mockUser);
    (storage.getUser as any).mockResolvedValue(mockUser);

    const agent = supertest.agent(app);

    // Login
    const loginRes = await agent
      .post('/api/login')
      .send({ email: 'jdoe@test.com', password: 'pass123', tenantId: 'tenant-1' });
    expect(loginRes.status).toBe(200);

    // Logout
    const logoutRes = await agent.post('/api/logout');
    expect(logoutRes.status).toBe(200);

    // After logout, /api/user should return 401
    const userRes = await agent.get('/api/user');
    expect(userRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/user
// ---------------------------------------------------------------------------

describe('GET /api/user', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    const res = await supertest(app).get('/api/user');
    expect(res.status).toBe(401);
  });

  it('should return user data (sans password) when authenticated', async () => {
    const hashedPw = await hashForTest('pass123');
    const mockUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      username: 'jdoe',
      email: 'jdoe@test.com',
      password: hashedPw,
      firstName: 'John',
      lastName: 'Doe',
      role: 'SuperAdmin',
      accountStatus: 'active',
    };
    (storage.getUserByEmail as any).mockResolvedValue(mockUser);
    (storage.getUser as any).mockResolvedValue(mockUser);

    const agent = supertest.agent(app);

    // Login first
    await agent
      .post('/api/login')
      .send({ email: 'jdoe@test.com', password: 'pass123', tenantId: 'tenant-1' });

    // Now request user info
    const res = await agent.get('/api/user');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'user-1');
    expect(res.body).toHaveProperty('username', 'jdoe');
    expect(res.body).not.toHaveProperty('password');
  });
});

// ---------------------------------------------------------------------------
// POST /api/forgot-password
// ---------------------------------------------------------------------------

describe('POST /api/forgot-password', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when email is missing', async () => {
    const res = await supertest(app)
      .post('/api/forgot-password')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Email is required');
  });

  it('should return 200 even when user does not exist (no information leak)', async () => {
    (storage.getUserByEmail as any).mockResolvedValue(null);

    const res = await supertest(app)
      .post('/api/forgot-password')
      .send({ email: 'nonexistent@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If an account');
  });

  it('should return 200 and trigger token creation for existing user', async () => {
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      username: 'testuser',
    });

    const res = await supertest(app)
      .post('/api/forgot-password')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(storage.createPasswordResetToken).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/lookup-tenant
// ---------------------------------------------------------------------------

describe('POST /api/auth/lookup-tenant', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when email is missing', async () => {
    const res = await supertest(app)
      .post('/api/auth/lookup-tenant')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Email is required');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await supertest(app)
      .post('/api/auth/lookup-tenant')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid email format');
  });

  it('should return empty tenants array for non-existent user', async () => {
    (storage.getUserByEmail as any).mockResolvedValue(null);

    const res = await supertest(app)
      .post('/api/auth/lookup-tenant')
      .send({ email: 'nobody@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.tenants).toEqual([]);
  });

  it('should return tenant info for valid user', async () => {
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@test.com',
    });
    (storage.getTenantById as any).mockResolvedValue({
      id: 'tenant-1',
      companyName: 'Acme Corp',
      subdomain: 'acme',
      isActive: true,
    });

    const res = await supertest(app)
      .post('/api/auth/lookup-tenant')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0]).toEqual({
      id: 'tenant-1',
      companyName: 'Acme Corp',
      subdomain: 'acme',
    });
  });

  it('should return empty tenants for inactive tenant', async () => {
    (storage.getUserByEmail as any).mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@test.com',
    });
    (storage.getTenantById as any).mockResolvedValue({
      id: 'tenant-1',
      companyName: 'Acme Corp',
      subdomain: 'acme',
      isActive: false,
    });

    const res = await supertest(app)
      .post('/api/auth/lookup-tenant')
      .send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.tenants).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tenant/info
// ---------------------------------------------------------------------------

describe('GET /api/tenant/info', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 404 when no default tenant exists', async () => {
    (storage.getDefaultTenant as any).mockResolvedValue(null);

    const res = await supertest(app).get('/api/tenant/info');

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('No tenant configured');
  });

  it('should return tenant info when default tenant exists', async () => {
    (storage.getDefaultTenant as any).mockResolvedValue({
      id: 'tenant-1',
      companyName: 'Default Co',
      subdomain: 'default',
    });

    const res = await supertest(app).get('/api/tenant/info');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'tenant-1',
      companyName: 'Default Co',
      subdomain: 'default',
    });
  });
});
