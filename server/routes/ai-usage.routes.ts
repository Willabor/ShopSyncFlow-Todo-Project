/**
 * AI Usage & Billing API Routes
 *
 * Endpoints for viewing AI usage statistics, quota status, and billing information.
 * Provides usage breakdown by feature, provider, and time period.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager: Full access to all usage data
 * - Editor: View own usage stats
 * - Auditor: View tenant usage stats (read-only)
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { User } from '@shared/schema';
import { storage } from '../storage';
import { getTenantUsageStatus, TIER_RATE_LIMITS } from '../services/ai/index.js';

// ===================================================================
// Request Validation Schemas
// ===================================================================

const usageQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  period: z.enum(['today', 'week', 'month', 'all']).optional(),
});

// ===================================================================
// Helper Functions
// ===================================================================

function getTenantId(req: Request): string | null {
  const user = req.user as User | undefined;
  return user?.tenantId || null;
}

function getDateRange(period?: string): { startDate?: Date; endDate?: Date } {
  const now = new Date();
  now.setUTCHours(23, 59, 59, 999);

  switch (period) {
    case 'today': {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      return { startDate: start, endDate: now };
    }
    case 'week': {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setUTCHours(0, 0, 0, 0);
      return { startDate: start, endDate: now };
    }
    case 'month': {
      const start = new Date();
      start.setDate(1);
      start.setUTCHours(0, 0, 0, 0);
      return { startDate: start, endDate: now };
    }
    case 'all':
    default:
      return {};
  }
}

// ===================================================================
// Route Registration
// ===================================================================

export function registerAIUsageRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // ===================================================================
  // Usage Summary
  // ===================================================================

  /**
   * GET /api/ai/usage
   * Get usage summary for the tenant
   */
  app.get(
    '/api/ai/usage',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const parseResult = usageQuerySchema.safeParse(req.query);
        if (!parseResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid query parameters',
            details: parseResult.error.format(),
          });
        }

        const { startDate, endDate, period } = parseResult.data;

        // Calculate date range
        let dateRange: { startDate?: Date; endDate?: Date } = {};
        if (startDate || endDate) {
          dateRange = {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
          };
        } else if (period) {
          dateRange = getDateRange(period);
        } else {
          // Default to current month
          dateRange = getDateRange('month');
        }

        const stats = await storage.getTenantAiUsageStats(tenantId, dateRange);

        return res.json({
          success: true,
          usage: {
            summary: {
              totalRequests: stats.totalRequests,
              successfulRequests: stats.successfulRequests,
              failedRequests: stats.failedRequests,
              successRate: stats.totalRequests > 0
                ? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
                : 0,
            },
            tokens: {
              input: stats.totalTokensInput,
              output: stats.totalTokensOutput,
              total: stats.totalTokensInput + stats.totalTokensOutput,
            },
            cost: {
              estimated: stats.totalCost,
              currency: 'USD',
            },
            performance: {
              avgDurationMs: Math.round(stats.avgDurationMs),
            },
            byProvider: stats.byProvider,
            byFeature: stats.byFeature,
          },
          dateRange: {
            start: dateRange.startDate?.toISOString(),
            end: dateRange.endDate?.toISOString(),
          },
        });
      } catch (error: any) {
        console.error('[AI Usage] Error getting usage stats:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get usage statistics'),
        });
      }
    }
  );

  /**
   * GET /api/ai/usage/by-feature
   * Get usage breakdown by feature
   */
  app.get(
    '/api/ai/usage/by-feature',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { period } = req.query;
        const dateRange = getDateRange(period as string);
        const stats = await storage.getTenantAiUsageStats(tenantId, dateRange);

        // Convert to array format with percentages
        const total = Object.values(stats.byFeature).reduce((sum, count) => sum + count, 0);
        const features = Object.entries(stats.byFeature).map(([feature, count]) => ({
          feature,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        })).sort((a, b) => b.count - a.count);

        return res.json({
          success: true,
          features,
          total,
        });
      } catch (error: any) {
        console.error('[AI Usage] Error getting feature usage:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get feature usage'),
        });
      }
    }
  );

  /**
   * GET /api/ai/usage/by-provider
   * Get usage breakdown by provider
   */
  app.get(
    '/api/ai/usage/by-provider',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { period } = req.query;
        const dateRange = getDateRange(period as string);
        const stats = await storage.getTenantAiUsageStats(tenantId, dateRange);

        // Convert to array format with percentages
        const total = Object.values(stats.byProvider).reduce((sum, count) => sum + count, 0);
        const providers = Object.entries(stats.byProvider).map(([provider, count]) => ({
          provider,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        })).sort((a, b) => b.count - a.count);

        return res.json({
          success: true,
          providers,
          total,
        });
      } catch (error: any) {
        console.error('[AI Usage] Error getting provider usage:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get provider usage'),
        });
      }
    }
  );

  // ===================================================================
  // Quota Status
  // ===================================================================

  /**
   * GET /api/ai/quota
   * Get current quota status (used/limit)
   */
  app.get(
    '/api/ai/quota',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        // Get usage status for this tenant
        const status = await getTenantUsageStatus(tenantId);

        return res.json({
          success: true,
          quota: {
            tier: status.tier,
            usageToday: status.usageToday,
            dailyLimit: status.dailyLimit,
            percentUsed: status.percentUsed,
            remainingRequests: status.remainingRequests,
            isUnlimited: status.dailyLimit === null,
            resetTime: getNextResetTime(),
          },
        });
      } catch (error: any) {
        console.error('[AI Usage] Error getting quota:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get quota status'),
        });
      }
    }
  );

  // ===================================================================
  // Plan Information
  // ===================================================================

  /**
   * GET /api/ai/plans
   * Get available plan information
   */
  app.get(
    '/api/ai/plans',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const config = await storage.getTenantAiConfig(tenantId);
        const currentTier = config?.tier || 'free';

        const plans = [
          {
            tier: 'free',
            name: 'Free',
            description: 'Basic AI features for small teams',
            features: [
              'Platform AI keys only',
              `${TIER_RATE_LIMITS.free} requests/day`,
              'Access to all platform templates',
              'Basic AI features',
            ],
            price: 0,
            requestLimit: TIER_RATE_LIMITS.free,
            isCurrent: currentTier === 'free',
          },
          {
            tier: 'pro',
            name: 'Pro',
            description: 'Advanced features for growing businesses',
            features: [
              'Platform AI keys + BYOK',
              `${TIER_RATE_LIMITS.pro} requests/day (platform) or unlimited (BYOK)`,
              'Custom prompt templates',
              'All AI features',
              'Priority support',
            ],
            price: 49,
            requestLimit: TIER_RATE_LIMITS.pro,
            isCurrent: currentTier === 'pro',
          },
          {
            tier: 'enterprise',
            name: 'Enterprise',
            description: 'Full control for large organizations',
            features: [
              'BYOK required',
              'Unlimited requests',
              'Custom + shared templates',
              'Custom model support',
              'Dedicated support',
              'SLA guarantee',
            ],
            price: null, // Contact sales
            requestLimit: null, // Unlimited
            isCurrent: currentTier === 'enterprise',
          },
        ];

        return res.json({
          success: true,
          plans,
          currentTier,
        });
      } catch (error: any) {
        console.error('[AI Usage] Error getting plans:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get plan information'),
        });
      }
    }
  );

  // ===================================================================
  // Usage History
  // ===================================================================

  /**
   * GET /api/ai/usage/history
   * Get historical usage data for charts
   */
  app.get(
    '/api/ai/usage/history',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({ success: false, error: 'No tenant context' });
        }

        const { days = '30' } = req.query;
        const numDays = Math.min(parseInt(days as string, 10) || 30, 90);

        // Get daily usage for the last N days
        const history: Array<{
          date: string;
          requests: number;
          tokens: number;
          cost: number;
        }> = [];

        const now = new Date();
        for (let i = numDays - 1; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const startOfDay = new Date(date);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date(date);
          endOfDay.setUTCHours(23, 59, 59, 999);

          const dayStats = await storage.getTenantAiUsageStats(tenantId, {
            startDate: startOfDay,
            endDate: endOfDay,
          });

          history.push({
            date: startOfDay.toISOString().split('T')[0],
            requests: dayStats.totalRequests,
            tokens: dayStats.totalTokensInput + dayStats.totalTokensOutput,
            cost: dayStats.totalCost,
          });
        }

        return res.json({
          success: true,
          history,
          period: {
            days: numDays,
            start: history[0]?.date,
            end: history[history.length - 1]?.date,
          },
        });
      } catch (error: any) {
        console.error('[AI Usage] Error getting usage history:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get usage history'),
        });
      }
    }
  );
}

// ===================================================================
// Utility Functions
// ===================================================================

function getNextResetTime(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}
