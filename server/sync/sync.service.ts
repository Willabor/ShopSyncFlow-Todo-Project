// ============================================================================
// SYNC SERVICE
// ============================================================================
// Orchestration service for managing sync operations across tenants.
// Maintains adapter registry, creates sync logs, and coordinates sync execution.
//
// Created: December 17, 2025
// ============================================================================

import { pool } from '../db';
import type {
  IntegrationAdapter,
  SyncResult,
  SyncOptions,
  SyncStatus,
  ConnectionConfig,
} from './types';
import { PostgreSQLAdapter, createNexusDbAdapter } from './adapters/postgresql.adapter';

/**
 * UUID validation pattern
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID
 * Prevents SQL injection and ensures data integrity
 */
function isValidUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Adapter factory registry
 */
const adapterFactories: Record<string, (config: ConnectionConfig) => IntegrationAdapter> = {
  postgresql: (config) => new PostgreSQLAdapter(config),
};

/**
 * Active adapter instances (cached per tenant:integration key)
 * Format: "${tenantId}:${integrationId}"
 */
const activeAdapters: Map<string, IntegrationAdapter> = new Map();

/**
 * Create cache key for adapter lookup
 */
function getAdapterCacheKey(tenantId: string, integrationId: string): string {
  return `${tenantId}:${integrationId}`;
}

/**
 * Get or create an adapter for a tenant integration
 */
async function getAdapter(tenantId: string, integrationId: string): Promise<IntegrationAdapter | null> {
  // Validate UUIDs
  if (!isValidUUID(tenantId)) {
    console.error(`[SyncService] Invalid tenantId UUID: ${tenantId}`);
    return null;
  }
  if (!isValidUUID(integrationId)) {
    console.error(`[SyncService] Invalid integrationId UUID: ${integrationId}`);
    return null;
  }

  const cacheKey = getAdapterCacheKey(tenantId, integrationId);

  // Check cache first
  if (activeAdapters.has(cacheKey)) {
    return activeAdapters.get(cacheKey)!;
  }

  // Fetch integration config from database
  const result = await pool.query(
    `SELECT id, integration_type, connection_config
     FROM public.tenant_integrations
     WHERE id = $1 AND tenant_id = $2`,
    [integrationId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const integration = result.rows[0];

  // Get adapter factory for integration type
  const factory = adapterFactories[integration.integration_type];
  if (!factory) {
    console.error(`[SyncService] Unknown integration type: ${integration.integration_type}`);
    return null;
  }

  // Create adapter instance
  const config = integration.connection_config as ConnectionConfig;
  const adapter = factory(config);

  // Cache for reuse (keyed by tenant:integration)
  activeAdapters.set(cacheKey, adapter);

  return adapter;
}

/**
 * Create a sync log entry
 */
async function createSyncLog(
  tenantId: string,
  integrationId: string | null
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO public.sync_logs (tenant_id, integration_id, status, started_at, items_synced, items_failed, items_created, items_updated)
     VALUES ($1, $2, 'running', NOW(), 0, 0, 0, 0)
     RETURNING id`,
    [tenantId, integrationId]
  );

  return result.rows[0].id;
}

/**
 * Update a sync log with results
 */
async function updateSyncLog(
  logId: string,
  result: SyncResult
): Promise<void> {
  const status: SyncStatus = result.success
    ? 'success'
    : result.itemsSynced > 0
    ? 'partial'
    : 'failed';

  const details = {
    duration: result.duration,
    errors: result.errors.map((e) => ({
      message: e.message,
      code: e.code,
      table: e.table,
    })),
    ...result.details,
  };

  await pool.query(
    `UPDATE public.sync_logs
     SET status = $1,
         completed_at = NOW(),
         items_synced = $2,
         items_failed = $3,
         items_created = $4,
         items_updated = $5,
         error_message = $6,
         details = $7
     WHERE id = $8`,
    [
      status,
      result.itemsSynced,
      result.itemsFailed,
      result.itemsCreated,
      result.itemsUpdated,
      result.errors.length > 0 ? result.errors[0].message : null,
      JSON.stringify(details),
      logId,
    ]
  );
}

/**
 * Update tenant integration with last sync info
 */
async function updateIntegrationSyncStatus(
  integrationId: string,
  result: SyncResult
): Promise<void> {
  const status = result.success ? 'success' : result.itemsSynced > 0 ? 'partial' : 'failed';

  await pool.query(
    `UPDATE public.tenant_integrations
     SET last_sync_at = NOW(),
         last_sync_status = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [status, integrationId]
  );
}

/**
 * Run sync for a specific tenant
 */
export async function syncTenant(
  tenantId: string,
  options: SyncOptions = {}
): Promise<SyncResult & { logId: string }> {
  // Validate tenantId is a valid UUID before any database queries
  if (!isValidUUID(tenantId)) {
    throw new Error(`Invalid tenant ID format: must be a valid UUID`);
  }

  console.log(`[SyncService] Starting sync for tenant ${tenantId}`);

  // Find active integration for tenant
  const integrationResult = await pool.query(
    `SELECT id, integration_type, connection_config
     FROM public.tenant_integrations
     WHERE tenant_id = $1 AND sync_enabled = true
     LIMIT 1`,
    [tenantId]
  );

  // If no configured integration, use default nexus_db adapter
  let adapter: IntegrationAdapter;
  let integrationId: string | null = null;

  if (integrationResult.rows.length > 0) {
    const integration = integrationResult.rows[0];
    integrationId = integration.id;
    const adapterInstance = await getAdapter(tenantId, integration.id);
    if (!adapterInstance) {
      throw new Error(`Failed to create adapter for integration ${integration.integration_type}`);
    }
    adapter = adapterInstance;
  } else {
    // Use default nexus_db adapter
    console.log('[SyncService] No integration configured, using default nexus_db adapter');
    adapter = createNexusDbAdapter();
  }

  // Create sync log
  const logId = await createSyncLog(tenantId, integrationId);
  console.log(`[SyncService] Created sync log ${logId}`);

  try {
    // Test connection first
    const connected = await adapter.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to source database');
    }

    // Run sync
    const result = await adapter.syncAll(tenantId, options);

    // Update sync log
    await updateSyncLog(logId, result);

    // Update integration status if applicable
    if (integrationId) {
      await updateIntegrationSyncStatus(integrationId, result);
    }

    console.log(
      `[SyncService] Sync complete for tenant ${tenantId}: ` +
        `${result.itemsSynced} synced, ${result.itemsCreated} created, ` +
        `${result.itemsUpdated} updated, ${result.itemsFailed} failed`
    );

    return { ...result, logId };
  } catch (error) {
    const err = error as Error;
    console.error(`[SyncService] Sync failed for tenant ${tenantId}:`, err.message);

    // Update sync log with failure
    const failedResult: SyncResult = {
      success: false,
      itemsSynced: 0,
      itemsFailed: 1,
      itemsCreated: 0,
      itemsUpdated: 0,
      errors: [
        {
          message: err.message,
          code: 'SYNC_FAILED',
          timestamp: new Date(),
        },
      ],
      duration: 0,
    };
    await updateSyncLog(logId, failedResult);

    throw error;
  } finally {
    // Close adapter if it's a one-off (not cached)
    if (!integrationId) {
      await adapter.close();
    }
  }
}

/**
 * Get sync status for a tenant
 */
export async function getSyncStatus(tenantId: string): Promise<{
  lastSync: {
    id: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    itemsSynced: number;
    itemsFailed: number;
    itemsCreated: number;
    itemsUpdated: number;
    errorMessage: string | null;
    duration: number | null;
  } | null;
  integration: {
    id: string;
    type: string;
    name: string | null;
    syncEnabled: boolean;
    syncFrequency: string;
    lastSyncAt: Date | null;
    lastSyncStatus: string | null;
  } | null;
  recentSyncs: Array<{
    id: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    itemsSynced: number;
    itemsFailed: number;
  }>;
}> {
  // Validate tenantId is a valid UUID
  if (!isValidUUID(tenantId)) {
    throw new Error(`Invalid tenant ID format: must be a valid UUID`);
  }

  // Get most recent sync log
  const lastSyncResult = await pool.query(
    `SELECT id, status, started_at, completed_at, items_synced, items_failed, items_created, items_updated, error_message, details
     FROM public.sync_logs
     WHERE tenant_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [tenantId]
  );

  // Get integration config
  const integrationResult = await pool.query(
    `SELECT id, integration_type, name, sync_enabled, sync_frequency, last_sync_at, last_sync_status
     FROM public.tenant_integrations
     WHERE tenant_id = $1
     LIMIT 1`,
    [tenantId]
  );

  // Get recent sync history
  const recentSyncsResult = await pool.query(
    `SELECT id, status, started_at, completed_at, items_synced, items_failed
     FROM public.sync_logs
     WHERE tenant_id = $1
     ORDER BY started_at DESC
     LIMIT 10`,
    [tenantId]
  );

  const lastSync = lastSyncResult.rows.length > 0 ? lastSyncResult.rows[0] : null;
  const integration = integrationResult.rows.length > 0 ? integrationResult.rows[0] : null;

  return {
    lastSync: lastSync
      ? {
          id: lastSync.id,
          status: lastSync.status || 'unknown',
          startedAt: lastSync.started_at,
          completedAt: lastSync.completed_at,
          itemsSynced: lastSync.items_synced || 0,
          itemsFailed: lastSync.items_failed || 0,
          itemsCreated: lastSync.items_created || 0,
          itemsUpdated: lastSync.items_updated || 0,
          errorMessage: lastSync.error_message,
          duration: lastSync.details && typeof lastSync.details === 'object'
            ? (lastSync.details as Record<string, unknown>).duration as number | null
            : null,
        }
      : null,
    integration: integration
      ? {
          id: integration.id,
          type: integration.integration_type,
          name: integration.name,
          syncEnabled: integration.sync_enabled ?? true,
          syncFrequency: integration.sync_frequency || 'manual',
          lastSyncAt: integration.last_sync_at,
          lastSyncStatus: integration.last_sync_status,
        }
      : null,
    recentSyncs: recentSyncsResult.rows.map((s) => ({
      id: s.id,
      status: s.status || 'unknown',
      startedAt: s.started_at,
      completedAt: s.completed_at,
      itemsSynced: s.items_synced || 0,
      itemsFailed: s.items_failed || 0,
    })),
  };
}

/**
 * Close all cached adapters (for graceful shutdown)
 */
export async function closeAllAdapters(): Promise<void> {
  for (const [id, adapter] of activeAdapters) {
    try {
      await adapter.close();
      console.log(`[SyncService] Closed adapter ${id}`);
    } catch (error) {
      console.error(`[SyncService] Error closing adapter ${id}:`, error);
    }
  }
  activeAdapters.clear();
}
