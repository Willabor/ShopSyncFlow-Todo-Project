// ============================================================================
// SYNC SCHEDULER
// ============================================================================
// Background scheduler for automatic QB inventory sync from nexus_db.
//
// - First run (30s after startup): Full sync of all items
// - Every N minutes after: Incremental sync (only changed items)
// - Configurable via QB_SYNC_INTERVAL_MINUTES env var (default: 5)
// - Guards against concurrent runs
//
// Created: February 13, 2026
// ============================================================================

import { syncTenant } from './sync.service';

let syncTimer: NodeJS.Timeout | null = null;
let isSyncing = false;
let lastSyncTime: Date | null = null;

const DEFAULT_INTERVAL_MINUTES = 5;
const NEXUS_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Start the background sync scheduler.
 * Called once from server/index.ts on startup.
 */
export function startSyncScheduler(): void {
  const intervalMinutes = parseInt(
    process.env.QB_SYNC_INTERVAL_MINUTES || String(DEFAULT_INTERVAL_MINUTES),
    10
  );
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[SyncScheduler] Starting QB inventory sync every ${intervalMinutes} minutes`);

  // Run first full sync after 30-second delay (let server finish starting)
  setTimeout(() => runScheduledSync(true), 30_000);

  // Schedule incremental syncs
  syncTimer = setInterval(() => runScheduledSync(false), intervalMs);
}

/**
 * Run a sync operation (full or incremental).
 */
async function runScheduledSync(isFullSync: boolean): Promise<void> {
  if (isSyncing) {
    console.log('[SyncScheduler] Sync already in progress, skipping');
    return;
  }

  isSyncing = true;
  const syncType = (isFullSync || !lastSyncTime) ? 'full' : 'incremental';

  try {
    const result = await syncTenant(NEXUS_TENANT_ID, {
      batchSize: 1000,
      fullSync: isFullSync || !lastSyncTime,
      since: lastSyncTime || undefined,
    });

    // Update last sync time on success
    if (result.success || result.itemsSynced > 0) {
      lastSyncTime = new Date();
    }

    // Only log when items were actually synced (skip noisy "0 synced" logs)
    if (result.itemsSynced > 0 || syncType === 'full') {
      console.log(
        `[SyncScheduler] ${syncType} sync complete: ` +
        `${result.itemsSynced} synced, ${result.itemsCreated} created, ` +
        `${result.itemsUpdated} updated, ${result.itemsFailed} failed ` +
        `(${result.duration}ms)`
      );
    }
  } catch (error) {
    console.error('[SyncScheduler] Scheduled sync failed:', error);
  } finally {
    isSyncing = false;
  }
}

/**
 * Stop the background sync scheduler.
 * Called for graceful shutdown.
 */
export function stopSyncScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[SyncScheduler] Sync scheduler stopped');
  }
}
