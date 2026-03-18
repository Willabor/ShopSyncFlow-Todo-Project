// ============================================================================
// SYNC ENGINE - PUBLIC API
// ============================================================================
// Re-exports all public types and services for the sync engine.
//
// Created: December 17, 2025
// ============================================================================

// Types
export type {
  ConnectionConfig,
  FieldMapping,
  TableMapping,
  SyncResult,
  SyncError,
  IntegrationAdapter,
  SyncOptions,
  IntegrationType,
  SyncFrequency,
  SyncStatus,
} from './types';

// Services
export {
  syncTenant,
  getSyncStatus,
  closeAllAdapters,
} from './sync.service';

// Adapters
export {
  PostgreSQLAdapter,
  createNexusDbAdapter,
} from './adapters/postgresql.adapter';

// Scheduler
export {
  startSyncScheduler,
  stopSyncScheduler,
} from './scheduler';
