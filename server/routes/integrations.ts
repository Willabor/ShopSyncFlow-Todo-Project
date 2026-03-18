/**
 * API Integrations Routes
 *
 * Handles OAuth flows for external service integrations (Google Ads, etc.)
 * MULTI-TENANT: All routes filter by tenantId for proper isolation
 * SECURITY: OAuth state uses HMAC signature to prevent tampering
 */

import { safeErrorMessage } from "../utils/safe-error";
import { Router, Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { storage } from '../storage';
import type { User } from '@shared/schema';

const router = Router();

// OAuth state signing secret - use SESSION_SECRET as base
const OAUTH_STATE_SECRET = process.env.SESSION_SECRET || 'shopsyncflow-oauth-state-secret';

/**
 * Sign OAuth state with HMAC to prevent tampering
 * SECURITY: Prevents attackers from forging state with another tenant's ID
 */
function signOAuthState(data: { userId: string; tenantId: string }): string {
  const payload = JSON.stringify(data);
  const signature = crypto
    .createHmac('sha256', OAUTH_STATE_SECRET)
    .update(payload)
    .digest('hex');
  // Combine payload and signature as base64 to handle special characters
  return Buffer.from(JSON.stringify({ payload, signature })).toString('base64url');
}

/**
 * Verify and decode OAuth state
 * Returns null if signature is invalid
 */
function verifyOAuthState(state: string): { userId: string; tenantId: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    const { payload, signature } = decoded;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', OAUTH_STATE_SECRET)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      console.error('❌ [OAuth State] Invalid signature - possible tampering attempt');
      return null;
    }

    return JSON.parse(payload);
  } catch (error) {
    console.error('❌ [OAuth State] Failed to verify state:', error);
    return null;
  }
}

// Middleware to check authentication (defined here since it's not exported from auth.ts)
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
};

// MULTI-TENANT: Helper to get tenantId from authenticated user
const getTenantId = (req: Request): string | null => {
  const user = req.user as User | undefined;
  return user?.tenantId || null;
};

// OAuth2 Configuration
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID!;
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET!;
const REDIRECT_URI = `${process.env.APP_URL || 'http://localhost:5000'}/api/integrations/google-ads/callback`;
const SCOPES = ['https://www.googleapis.com/auth/adwords'];

/**
 * Initiate Google Ads OAuth flow
 * Returns the authorization URL for the user to visit
 * MULTI-TENANT: Includes tenantId in OAuth state for callback
 */
router.post('/google-ads/initiate', requireAuth, async (req: Request, res: Response) => {
  try {
    // MULTI-TENANT: Get tenantId from authenticated user
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: "No tenant context found" });
    }

    console.log('🔐 [Google Ads OAuth] Initiating OAuth flow');
    console.log('   Redirect URI:', REDIRECT_URI);
    console.log('   Tenant ID:', tenantId);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_ADS_CLIENT_ID,
      GOOGLE_ADS_CLIENT_SECRET,
      REDIRECT_URI
    );

    // Generate authorization URL
    // MULTI-TENANT + SECURITY: Include signed tenantId in state for callback
    // Sign state with HMAC to prevent tampering attacks
    const signedState = signOAuthState({ userId: (req.user as User)?.id, tenantId });
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: SCOPES,
      prompt: 'consent', // Force consent screen to ensure refresh token
      state: signedState,
    });

    console.log('✓ Authorization URL generated');

    res.json({
      success: true,
      authUrl,
    });
  } catch (error: any) {
    console.error('❌ [Google Ads OAuth] Error initiating OAuth:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error),
    });
  }
});

/**
 * Handle Google Ads OAuth callback
 * Exchanges authorization code for tokens and saves to database
 * MULTI-TENANT: Parses tenantId from verified state parameter for proper isolation
 * SECURITY: Verifies HMAC signature to prevent state tampering
 */
router.get('/google-ads/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    console.log('🔐 [Google Ads OAuth] Handling callback');

    if (!code) {
      throw new Error('No authorization code received');
    }

    if (!state) {
      throw new Error('No OAuth state parameter received');
    }

    // SECURITY: Verify signed state to prevent tampering attacks
    const stateData = verifyOAuthState(state as string);
    if (!stateData) {
      throw new Error('Invalid OAuth state - signature verification failed. Please try again.');
    }

    const { userId, tenantId } = stateData;
    console.log('   ✓ State signature verified');

    // MULTI-TENANT: Require tenantId for proper isolation
    if (!tenantId) {
      throw new Error('No tenant context in OAuth state. Please try again.');
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_ADS_CLIENT_ID,
      GOOGLE_ADS_CLIENT_SECRET,
      REDIRECT_URI
    );

    // Exchange authorization code for tokens
    console.log('⏳ Exchanging authorization code for tokens...');
    const { tokens } = await oauth2Client.getToken(code as string);

    if (!tokens.refresh_token) {
      throw new Error('No refresh token received. User may have already authorized this app.');
    }

    console.log('✓ Tokens received');
    console.log('   Access Token:', tokens.access_token ? '✓' : '✗');
    console.log('   Refresh Token:', tokens.refresh_token ? '✓ (PERMANENT)' : '✗');

    // Get Google Ads customer ID (optional, for display)
    let customerInfo: any = {};
    try {
      oauth2Client.setCredentials(tokens);

      // Get customer ID from environment or config
      const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
      const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

      customerInfo = {
        customerId,
        loginCustomerId,
      };
    } catch (err) {
      console.warn('⚠️  Could not fetch customer info:', err);
    }

    // Save to database
    // MULTI-TENANT: Pass tenantId to storage method
    console.log('💾 Saving integration to database...');
    await storage.upsertApiIntegration(tenantId, {
      provider: 'google_ads',
      isActive: true,
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      config: customerInfo,
      connectedBy: userId,
    });

    console.log('✅ Google Ads integration saved successfully');

    // Redirect to settings page with success message
    const redirectUrl = `${process.env.APP_URL || 'http://localhost:5000'}/settings?tab=integrations&status=success`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            max-width: 600px;
            margin: 100px auto;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            border-radius: 10px;
          }
          h1 { font-size: 48px; margin: 0 0 20px 0; }
          p { font-size: 18px; line-height: 1.6; }
          .success { color: #4ade80; font-weight: bold; }
        </style>
        <meta http-equiv="refresh" content="2;url=${redirectUrl}">
      </head>
      <body>
        <h1>✅ Success!</h1>
        <p class="success">Google Ads connected successfully!</p>
        <p>Redirecting you back to settings...</p>
        <p><small>If you're not redirected, <a href="${redirectUrl}" style="color: white;">click here</a></small></p>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error('❌ [Google Ads OAuth] Error in callback:', error);

    const errorUrl = `${process.env.APP_URL || 'http://localhost:5000'}/settings?tab=integrations&status=error&message=${encodeURIComponent(error.message)}`;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            max-width: 600px;
            margin: 100px auto;
            padding: 40px;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            text-align: center;
            border-radius: 10px;
          }
          h1 { font-size: 48px; margin: 0 0 20px 0; }
          p { font-size: 18px; line-height: 1.6; }
        </style>
        <meta http-equiv="refresh" content="3;url=${errorUrl}">
      </head>
      <body>
        <h1>❌ Error</h1>
        <p>${error.message}</p>
        <p>Redirecting you back to settings...</p>
      </body>
      </html>
    `);
  }
});

/**
 * Get Google Ads integration status
 * Returns connection status and account info
 * MULTI-TENANT: Filters by tenantId for isolation
 */
router.get('/google-ads/status', requireAuth, async (req: Request, res: Response) => {
  try {
    // MULTI-TENANT: Get tenantId from authenticated user
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: "No tenant context found" });
    }

    const integration = await storage.getApiIntegration(tenantId, 'google_ads');

    if (!integration) {
      return res.json({
        connected: false,
      });
    }

    res.json({
      connected: true,
      provider: integration.provider,
      isActive: integration.isActive,
      config: integration.config,
      lastUsedAt: integration.lastUsedAt,
      createdAt: integration.createdAt,
      tokenExpiresAt: integration.tokenExpiresAt, // For frontend to check actual expiration
      updatedAt: integration.updatedAt, // When token was last refreshed
      // Don't send tokens to frontend for security
    });
  } catch (error: any) {
    console.error('❌ [Google Ads] Error checking status:', error);
    res.status(500).json({
      error: safeErrorMessage(error),
    });
  }
});

/**
 * Disconnect Google Ads integration
 * Soft deletes the integration (sets isActive to false)
 * MULTI-TENANT: Filters by tenantId for isolation
 */
router.post('/google-ads/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    // MULTI-TENANT: Get tenantId from authenticated user
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: "No tenant context found" });
    }

    console.log('🔌 [Google Ads] Disconnecting integration');
    console.log('   Tenant ID:', tenantId);

    await storage.disconnectApiIntegration(tenantId, 'google_ads');

    console.log('✓ Google Ads integration disconnected');

    res.json({
      success: true,
      message: 'Google Ads disconnected successfully',
    });
  } catch (error: any) {
    console.error('❌ [Google Ads] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error),
    });
  }
});

/**
 * Test Google Ads connection
 * Makes a lightweight API call to verify the token is still valid
 * MULTI-TENANT: Filters by tenantId for isolation
 */
router.post('/google-ads/test', requireAuth, async (req: Request, res: Response) => {
  try {
    // MULTI-TENANT: Get tenantId from authenticated user
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ success: false, error: "No tenant context found" });
    }

    console.log('🔍 [Google Ads] Testing connection...');
    console.log('   Tenant ID:', tenantId);

    const integration = await storage.getApiIntegration(tenantId, 'google_ads');

    if (!integration || !integration.isActive) {
      return res.json({
        success: false,
        error: 'Google Ads not connected',
      });
    }

    if (!integration.refreshToken) {
      return res.json({
        success: false,
        error: 'No refresh token available. Please reconnect your account.',
      });
    }

    // Try to refresh the token - this validates the refresh token is still valid
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_ADS_CLIENT_ID,
      GOOGLE_ADS_CLIENT_SECRET,
      REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update database with new access token
      await storage.upsertApiIntegration(tenantId, {
        provider: 'google_ads',
        isActive: true,
        accessToken: credentials.access_token || null,
        refreshToken: integration.refreshToken,
        tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        config: integration.config as any,
        connectedBy: integration.connectedBy,
      });

      console.log('✅ [Google Ads] Connection test passed - token refreshed');

      res.json({
        success: true,
        message: 'Connection verified! Token is valid and was refreshed.',
      });
    } catch (refreshError: any) {
      console.error('❌ [Google Ads] Connection test failed:', refreshError.message);

      // Check for specific error types
      if (refreshError.message?.includes('invalid_grant')) {
        return res.json({
          success: false,
          error: 'Token expired or revoked. Please reconnect your Google Ads account.',
        });
      }

      return res.json({
        success: false,
        error: `Token refresh failed: ${refreshError.message}`,
      });
    }
  } catch (error: any) {
    console.error('❌ [Google Ads] Error testing connection:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error),
    });
  }
});

/**
 * Refresh Google Ads access token using refresh token
 * Manual endpoint in case automatic refresh fails
 * MULTI-TENANT: Filters by tenantId for isolation
 */
router.post('/google-ads/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    // MULTI-TENANT: Get tenantId from authenticated user
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: "No tenant context found" });
    }

    console.log('🔄 [Google Ads] Manual token refresh requested');
    console.log('   Tenant ID:', tenantId);

    const integration = await storage.getApiIntegration(tenantId, 'google_ads');

    if (!integration || !integration.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Google Ads not connected',
      });
    }

    if (!integration.refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'No refresh token available. Please reconnect your account.',
      });
    }

    // Use refresh token to get new access token
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_ADS_CLIENT_ID,
      GOOGLE_ADS_CLIENT_SECRET,
      REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update database with new access token
    // MULTI-TENANT: Pass tenantId to storage method
    await storage.upsertApiIntegration(tenantId, {
      provider: 'google_ads',
      isActive: true,
      accessToken: credentials.access_token || null,
      refreshToken: integration.refreshToken, // Keep existing refresh token
      tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      config: integration.config as any,
      connectedBy: integration.connectedBy,
    });

    console.log('✅ Google Ads token refreshed successfully');

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    });
  } catch (error: any) {
    console.error('❌ [Google Ads] Token refresh failed:', error);
    res.status(500).json({
      success: false,
      error: safeErrorMessage(error),
    });
  }
});

/**
 * Get all API integrations (admin only)
 * MULTI-TENANT: Filters by tenantId for isolation
 */
router.get('/all', requireAuth, async (req: Request, res: Response) => {
  try {
    // MULTI-TENANT: Get tenantId from authenticated user
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: "No tenant context found" });
    }

    // Check if user is admin
    const user = req.user as User;
    if (user.role !== 'SuperAdmin') {
      return res.status(403).json({
        error: 'Unauthorized. SuperAdmin access required.',
      });
    }

    const integrations = await storage.getAllApiIntegrations(tenantId);

    // Remove sensitive data
    const sanitized = integrations.map(int => ({
      id: int.id,
      provider: int.provider,
      isActive: int.isActive,
      config: int.config,
      connectedBy: int.connectedBy,
      lastUsedAt: int.lastUsedAt,
      createdAt: int.createdAt,
      updatedAt: int.updatedAt,
      // Don't send tokens
    }));

    res.json(sanitized);
  } catch (error: any) {
    console.error('❌ [Integrations] Error fetching all:', error);
    res.status(500).json({
      error: safeErrorMessage(error),
    });
  }
});

// ============================================================================
// CLAUDE/ANTHROPIC API INTEGRATION
// ============================================================================

/**
 * GET /api/integrations/claude/status
 * Check if Claude API key is configured
 */
router.get('/claude/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: 'No tenant context' });
    }

    const integration = await storage.getApiIntegration(tenantId, 'claude');

    if (!integration || !integration.accessToken) {
      return res.json({
        connected: false,
        hasApiKey: false
      });
    }

    res.json({
      connected: integration.isActive,
      hasApiKey: true,
      lastTestedAt: integration.lastUsedAt,
      model: integration.config?.model || 'claude-3-haiku-20240307'
    });
  } catch (error: any) {
    console.error('❌ [Claude] Error fetching status:', error);
    res.status(500).json({ message: safeErrorMessage(error) });
  }
});

/**
 * POST /api/integrations/claude/save
 * Save Anthropic API key
 */
router.post('/claude/save', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = (req.user as User)?.id;

    if (!tenantId || !userId) {
      return res.status(401).json({ message: 'No tenant context' });
    }

    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ message: 'API key is required' });
    }

    // Basic validation - Anthropic keys start with "sk-ant-"
    if (!apiKey.startsWith('sk-ant-')) {
      return res.status(400).json({ message: 'Invalid API key format. Anthropic keys start with sk-ant-' });
    }

    // Use upsert to create or update
    await storage.upsertApiIntegration(tenantId, {
      tenantId,
      provider: 'claude',
      accessToken: apiKey,
      isActive: true,
      config: { model: 'claude-3-haiku-20240307' },
      connectedBy: userId
    });

    console.log(`✅ [Claude] API key saved for tenant ${tenantId}`);
    res.json({ success: true, message: 'API key saved' });
  } catch (error: any) {
    console.error('❌ [Claude] Error saving API key:', error);
    res.status(500).json({ message: safeErrorMessage(error) });
  }
});

/**
 * POST /api/integrations/claude/test
 * Test the Claude API connection
 */
router.post('/claude/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: 'No tenant context' });
    }

    const integration = await storage.getApiIntegration(tenantId, 'claude');

    if (!integration || !integration.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'No Claude API key configured'
      });
    }

    // Test the API by making a simple request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': integration.accessToken,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "API test successful" in exactly 3 words.' }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API returned ${response.status}`);
    }

    const data = await response.json();

    // Update last used timestamp
    await storage.updateApiIntegrationLastUsed(tenantId, 'claude');

    console.log(`✅ [Claude] Connection test successful for tenant ${tenantId}`);
    res.json({
      success: true,
      message: 'Connection successful',
      model: 'claude-3-haiku-20240307',
      response: data.content?.[0]?.text || 'Test completed'
    });
  } catch (error: any) {
    console.error('❌ [Claude] Connection test failed:', error);
    res.status(400).json({
      success: false,
      message: safeErrorMessage(error, 'Connection test failed')
    });
  }
});

/**
 * POST /api/integrations/claude/disconnect
 * Remove Claude API key
 */
router.post('/claude/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ message: 'No tenant context' });
    }

    const integration = await storage.getApiIntegration(tenantId, 'claude');

    if (integration) {
      await storage.deleteApiIntegration(tenantId, 'claude');
      console.log(`✅ [Claude] API key removed for tenant ${tenantId}`);
    }

    res.json({ success: true, message: 'Disconnected' });
  } catch (error: any) {
    console.error('❌ [Claude] Error disconnecting:', error);
    res.status(500).json({ message: safeErrorMessage(error) });
  }
});

export default router;
