// ============================================================================
// SYNC ENGINE TYPES
// ============================================================================
// Type definitions for the ShopSyncFlow Inventory Sync Engine.
// Supports multiple integration adapters (PostgreSQL, Shopify, CSV, etc.)
//
// Created: December 17, 2025
// ============================================================================

/**
 * Integration type enum (matches database)
 */
export type IntegrationType = 'postgresql' | 'shopify' | 'csv' | 'api_push';

/**
 * Sync status enum (matches database)
 */
export type SyncStatus = 'running' | 'success' | 'partial' | 'failed';

/**
 * Sync frequency enum (matches database)
 */
export type SyncFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly' | 'manual';

/**
 * PostgreSQL connection configuration
 */
export interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  schema?: string;
}

/**
 * Field mapping between source and target systems
 */
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'constant';
  defaultValue?: unknown;
  constantValue?: unknown;
}

/**
 * Table mapping configuration
 */
export interface TableMapping {
  sourceTable: string;
  targetTable: string;
  fields: FieldMapping[];
  primaryKey: string;
  conflictFields?: string[];
}

/**
 * Sync result returned by adapters
 */
export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  itemsCreated: number;
  itemsUpdated: number;
  errors: SyncError[];
  duration: number; // milliseconds
  details?: Record<string, unknown>;
}

/**
 * Error encountered during sync
 */
export interface SyncError {
  message: string;
  code?: string;
  table?: string;
  record?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Integration adapter interface
 * All adapters must implement this interface
 */
export interface IntegrationAdapter {
  /**
   * Unique adapter type identifier
   */
  readonly type: string;

  /**
   * Test the connection to the source system
   */
  testConnection(): Promise<boolean>;

  /**
   * Sync items from source to target
   * @param tenantId - The tenant ID to sync for
   * @param options - Optional sync options
   */
  syncItems(tenantId: string, options?: SyncOptions): Promise<SyncResult>;

  /**
   * Sync locations from source to target
   * @param tenantId - The tenant ID to sync for
   * @param options - Optional sync options
   */
  syncLocations(tenantId: string, options?: SyncOptions): Promise<SyncResult>;

  /**
   * Sync inventory levels from source to target
   * @param tenantId - The tenant ID to sync for
   * @param options - Optional sync options
   */
  syncInventoryLevels(tenantId: string, options?: SyncOptions): Promise<SyncResult>;

  /**
   * Run full sync (items, locations, inventory levels)
   * @param tenantId - The tenant ID to sync for
   * @param options - Optional sync options
   */
  syncAll(tenantId: string, options?: SyncOptions): Promise<SyncResult>;

  /**
   * Close any open connections
   */
  close(): Promise<void>;
}

/**
 * Sync options for controlling sync behavior
 */
export interface SyncOptions {
  /**
   * Batch size for inserts/updates (default: 1000)
   */
  batchSize?: number;

  /**
   * Whether to perform a full sync or incremental (default: false = incremental)
   */
  fullSync?: boolean;

  /**
   * Sync items modified since this date (incremental mode)
   */
  since?: Date;

  /**
   * Whether to skip items sync
   */
  skipItems?: boolean;

  /**
   * Whether to skip locations sync
   */
  skipLocations?: boolean;

  /**
   * Whether to skip inventory levels sync
   */
  skipInventoryLevels?: boolean;

  /**
   * Dry run mode - don't actually write to target
   */
  dryRun?: boolean;
}
