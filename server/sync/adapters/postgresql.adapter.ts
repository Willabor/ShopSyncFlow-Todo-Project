// ============================================================================
// POSTGRESQL SYNC ADAPTER
// ============================================================================
// Syncs data from a source PostgreSQL database (nexus_db) to the
// ShopSyncFlow database (shopsyncflow_db) using Drizzle ORM for target writes.
//
// Source tables (nexus_db.public):
//   - qb_inventory -> public.items
//   - locations -> public.locations
//   - inventory_levels -> public.item_levels
//
// Created: December 17, 2025
// ============================================================================

import pg from 'pg';
import { pool as ssfPool } from '../../db';
import type {
  IntegrationAdapter,
  ConnectionConfig,
  SyncResult,
  SyncError,
  SyncOptions,
} from '../types';

const { Pool } = pg;

/**
 * Default batch size for inserts
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Maximum number of errors to track before truncating
 * Prevents memory exhaustion from large sync operations with many failures
 */
const MAX_ERRORS = 100;

/**
 * Validate schema name to prevent SQL injection
 * Schema names must be valid PostgreSQL identifiers
 */
function validateSchemaName(schema: string): void {
  // PostgreSQL identifier rules: start with letter or underscore, contain only
  // letters, digits, underscores, max 63 chars
  const validIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
  if (!validIdentifierPattern.test(schema)) {
    throw new Error(`Invalid schema name: "${schema}". Schema must be a valid PostgreSQL identifier.`);
  }
}

/**
 * Escape a PostgreSQL identifier (schema/table name) for safe interpolation
 * Uses double quotes and escapes any existing double quotes
 */
function escapeIdentifier(identifier: string): string {
  // Replace any double quotes with two double quotes (PostgreSQL escape)
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Helper to add an error to array with limit enforcement
 * Prevents unbounded error accumulation
 */
function addErrorWithLimit(
  errors: SyncError[],
  error: SyncError
): void {
  if (errors.length < MAX_ERRORS) {
    errors.push(error);
  } else if (errors.length === MAX_ERRORS) {
    // Add a final error indicating truncation
    errors.push({
      message: `Error limit reached (${MAX_ERRORS}). Additional errors not recorded.`,
      code: 'ERROR_LIMIT_REACHED',
      timestamp: new Date(),
    });
  }
  // If already past limit, silently ignore (count is tracked separately)
}

// ============================================================================
// FIELD MAPPINGS (for reference):
// ============================================================================
// qb_inventory -> items:
//   list_id -> external_id
//   item_number -> item_number, sku
//   description -> description
//   upc -> upc
//   alu -> alu
//   style -> style
//   attribute -> attribute, color
//   size -> size
//   vendor_name -> vendor
//   department_name -> department
//   category -> category
//   msrp -> msrp
//   retail_price -> retail_price
//   cost_price -> cost_price
//   reorder_point -> reorder_point
//   gender -> gender
//   weight -> weight
//   notes -> notes
//   available_online -> available_online
//   time_created -> source_created_at
//   time_modified -> source_modified_at
//   source_system = 'quickbooks' (constant)
//
// locations -> locations:
//   id -> id (preserve UUID for FK relationships)
//   code -> code
//   name -> name
//   type -> type
//   address -> address
//   city -> city
//   state -> state
//   zip -> zip
//   phone -> phone
//   is_active -> is_active
//   is_default -> is_default
//   sort_order -> sort_order
//   sells_online -> sells_online
//
// inventory_levels -> item_levels:
//   item_id (list_id) -> lookup item by list_id to get items.id -> item_id
//   location_id -> location_id (same UUID)
//   quantity -> quantity
//   reserved_qty -> reserved_qty
//   reorder_point -> reorder_point
//   last_counted_at -> last_counted_at
//   last_counted_by -> last_counted_by

/**
 * PostgreSQL Integration Adapter
 * Syncs data from a source PostgreSQL database (nexus_db) to ShopSyncFlow
 */
export class PostgreSQLAdapter implements IntegrationAdapter {
  readonly type = 'postgresql';
  private sourcePool: pg.Pool;
  private schema: string;
  private escapedSchema: string;

  constructor(config: ConnectionConfig) {
    this.schema = config.schema || 'public';
    // Validate schema name to prevent SQL injection
    validateSchemaName(this.schema);
    // Pre-escape the schema for SQL queries
    this.escapedSchema = escapeIdentifier(this.schema);
    this.sourcePool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }

  /**
   * Test connection to the source database
   */
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.sourcePool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[PostgreSQLAdapter] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Sync items from source qb_inventory to target items table
   */
  async syncItems(tenantId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const errors: SyncError[] = [];
    let itemsSynced = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let itemsFailed = 0;

    try {
      // Fetch items from source
      const whereClause = options.since
        ? `WHERE tenant_id = $1 AND updated_at > $2`
        : `WHERE tenant_id = $1`;
      const params = options.since ? [tenantId, options.since] : [tenantId];

      const query = `
        SELECT
          list_id,
          item_number,
          description,
          upc,
          alu,
          style,
          attribute,
          size,
          vendor_name,
          department_name,
          category,
          msrp,
          retail_price,
          cost_price,
          reorder_point,
          gender,
          weight,
          notes,
          available_online,
          time_created,
          time_modified,
          updated_at
        FROM ${this.escapedSchema}.qb_inventory
        ${whereClause}
        ORDER BY list_id
      `;

      const result = await this.sourcePool.query(query, params);
      const sourceItems = result.rows;

      console.log(`[PostgreSQLAdapter] Fetched ${sourceItems.length} items from source`);

      if (options.dryRun) {
        return {
          success: true,
          itemsSynced: sourceItems.length,
          itemsFailed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          errors: [],
          duration: Date.now() - startTime,
          details: { dryRun: true, message: `Would sync ${sourceItems.length} items` },
        };
      }

      // Process in batches
      for (let i = 0; i < sourceItems.length; i += batchSize) {
        const batch = sourceItems.slice(i, i + batchSize);

        try {
          const batchResults = await this.upsertItemsBatch(tenantId, batch);
          itemsSynced += batchResults.synced;
          itemsCreated += batchResults.created;
          itemsUpdated += batchResults.updated;
        } catch (error) {
          const err = error as Error;
          console.error(`[PostgreSQLAdapter] Batch ${Math.floor(i / batchSize) + 1} failed:`, err.message);
          itemsFailed += batch.length;
          addErrorWithLimit(errors, {
            message: `Batch failed: ${err.message}`,
            code: 'BATCH_INSERT_FAILED',
            table: 'items',
            timestamp: new Date(),
          });
        }
      }

      return {
        success: errors.length === 0,
        itemsSynced,
        itemsFailed,
        itemsCreated,
        itemsUpdated,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      console.error('[PostgreSQLAdapter] syncItems failed:', err.message);
      addErrorWithLimit(errors, {
        message: err.message,
        code: 'SYNC_ITEMS_FAILED',
        table: 'items',
        timestamp: new Date(),
      });
      return {
        success: false,
        itemsSynced,
        itemsFailed: itemsFailed + 1,
        itemsCreated,
        itemsUpdated,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Upsert a batch of items using INSERT ON CONFLICT for massive speedup
   * Replaces row-by-row processing with a single batch query
   */
  private async upsertItemsBatch(
    tenantId: string,
    batch: Record<string, unknown>[]
  ): Promise<{ synced: number; created: number; updated: number }> {
    if (batch.length === 0) {
      return { synced: 0, created: 0, updated: 0 };
    }

    const now = new Date().toISOString();

    // Build parameterized values for batch insert
    // Each row has 25 parameters (22 data fields + source_system + 2 timestamps)
    const PARAMS_PER_ROW = 25;
    const valueStrings: string[] = [];
    const flatParams: (string | number | boolean | null)[] = [];

    batch.forEach((row, idx) => {
      const base = idx * PARAMS_PER_ROW;
      valueStrings.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
        `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, ` +
        `$${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, ` +
        `$${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, ` +
        `$${base + 21}, $${base + 22}, $${base + 23}, $${base + 24}, $${base + 25})`
      );

      flatParams.push(
        tenantId,
        (row.list_id as string) || null,                          // external_id
        (row.item_number as string) || null,                      // item_number
        (row.item_number as string) || null,                      // sku (same as item_number)
        (row.upc as string | null) || null,
        (row.alu as string | null) || null,
        (row.description as string | null) || null,
        (row.style as string | null) || null,
        (row.attribute as string | null) || null,
        (row.size as string | null) || null,
        (row.attribute as string | null) || null,                 // color = attribute
        row.msrp !== null ? Number(row.msrp) : null,
        row.retail_price !== null ? Number(row.retail_price) : null,
        row.cost_price !== null ? Number(row.cost_price) : null,
        (row.department_name as string | null) || null,
        (row.category as string | null) || null,
        (row.vendor_name as string | null) || null,
        (row.gender as string | null) || null,
        row.weight !== null ? Number(row.weight) : 0,
        row.reorder_point !== null ? Number(row.reorder_point) : null,
        (row.available_online as boolean) ?? true,
        (row.notes as string | null) || null,
        'quickbooks',                                             // source_system (parameterized)
        now,                                                      // last_synced_at (parameterized)
        now                                                       // updated_at (parameterized)
      );
    });

    const upsertQuery = `
      INSERT INTO public.items (
        tenant_id, external_id, item_number, sku, upc,
        alu, description, style, attribute, size,
        color, msrp, retail_price, cost_price, department,
        category, vendor, gender, weight, reorder_point,
        available_online, notes, source_system, last_synced_at, updated_at
      )
      VALUES ${valueStrings.join(',\n')}
      ON CONFLICT (tenant_id, source_system, external_id)
      DO UPDATE SET
        item_number = EXCLUDED.item_number,
        sku = EXCLUDED.sku,
        upc = EXCLUDED.upc,
        alu = EXCLUDED.alu,
        description = EXCLUDED.description,
        style = EXCLUDED.style,
        attribute = EXCLUDED.attribute,
        size = EXCLUDED.size,
        color = EXCLUDED.color,
        msrp = EXCLUDED.msrp,
        retail_price = EXCLUDED.retail_price,
        cost_price = EXCLUDED.cost_price,
        department = EXCLUDED.department,
        category = EXCLUDED.category,
        vendor = EXCLUDED.vendor,
        gender = EXCLUDED.gender,
        weight = EXCLUDED.weight,
        reorder_point = EXCLUDED.reorder_point,
        available_online = EXCLUDED.available_online,
        notes = EXCLUDED.notes,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = EXCLUDED.updated_at
    `;

    // Smart auditing: Use RETURNING for small batches (accurate counts)
    // Skip RETURNING for large batches (better performance)
    const AUDIT_THRESHOLD = 500;

    if (batch.length <= AUDIT_THRESHOLD) {
      // Small batch: Get accurate created vs updated counts
      const auditQuery = upsertQuery + '\n    RETURNING (xmax = 0) AS was_inserted';
      const result = await ssfPool.query(auditQuery, flatParams);

      const created = result.rows.filter((r: { was_inserted: boolean }) => r.was_inserted).length;
      const updated = result.rows.length - created;

      return { synced: batch.length, created, updated };
    } else {
      // Large batch: Skip RETURNING for speed, report as synced only
      await ssfPool.query(upsertQuery, flatParams);
      return { synced: batch.length, created: 0, updated: 0 };
    }
  }

  /**
   * Sync locations from source to target
   */
  async syncLocations(tenantId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: SyncError[] = [];
    let itemsSynced = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let itemsFailed = 0;

    try {
      // Fetch locations from source
      const query = `
        SELECT
          id,
          code,
          name,
          type,
          address,
          city,
          state,
          zip,
          phone,
          is_active,
          is_default,
          sort_order,
          sells_online
        FROM ${this.escapedSchema}.locations
        WHERE tenant_id = $1
        ORDER BY code
      `;

      const result = await this.sourcePool.query(query, [tenantId]);
      const sourceLocations = result.rows;

      console.log(`[PostgreSQLAdapter] Fetched ${sourceLocations.length} locations from source`);

      if (options.dryRun) {
        return {
          success: true,
          itemsSynced: sourceLocations.length,
          itemsFailed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          errors: [],
          duration: Date.now() - startTime,
          details: { dryRun: true, message: `Would sync ${sourceLocations.length} locations` },
        };
      }

      // Process locations using batch upsert
      if (sourceLocations.length > 0) {
        const batchResult = await this.upsertLocationsBatch(tenantId, sourceLocations);
        itemsSynced = batchResult.synced;
        itemsCreated = batchResult.created;
        itemsUpdated = batchResult.updated;
      }

      return {
        success: errors.length === 0,
        itemsSynced,
        itemsFailed,
        itemsCreated,
        itemsUpdated,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      console.error('[PostgreSQLAdapter] syncLocations failed:', err.message);
      addErrorWithLimit(errors, {
        message: err.message,
        code: 'SYNC_LOCATIONS_FAILED',
        table: 'locations',
        timestamp: new Date(),
      });
      return {
        success: false,
        itemsSynced,
        itemsFailed: itemsFailed + 1,
        itemsCreated,
        itemsUpdated,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Upsert a batch of locations using INSERT ON CONFLICT
   */
  private async upsertLocationsBatch(
    tenantId: string,
    batch: Record<string, unknown>[]
  ): Promise<{ synced: number; created: number; updated: number }> {
    if (batch.length === 0) {
      return { synced: 0, created: 0, updated: 0 };
    }

    const now = new Date().toISOString();

    // Build parameterized values for batch insert
    // Each row has 15 parameters (14 data fields + 1 timestamp)
    const PARAMS_PER_ROW = 15;
    const valueStrings: string[] = [];
    const flatParams: (string | number | boolean | null)[] = [];

    batch.forEach((row, idx) => {
      const base = idx * PARAMS_PER_ROW;
      valueStrings.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
        `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, ` +
        `$${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15})`
      );

      flatParams.push(
        (row.id as string),                                       // id (preserve UUID)
        tenantId,
        (row.code as string),
        (row.name as string),
        (row.type as string) || 'retail',
        (row.address as string | null) || null,
        (row.city as string | null) || null,
        (row.state as string | null) || null,
        (row.zip as string | null) || null,
        (row.phone as string | null) || null,
        (row.is_active as boolean) ?? true,
        (row.is_default as boolean) ?? false,
        (row.sort_order as number) ?? 0,
        (row.sells_online as boolean) ?? true,
        now                                                       // updated_at (parameterized)
      );
    });

    const upsertQuery = `
      INSERT INTO public.locations (
        id, tenant_id, code, name, type,
        address, city, state, zip, phone,
        is_active, is_default, sort_order, sells_online, updated_at
      )
      VALUES ${valueStrings.join(',\n')}
      ON CONFLICT (tenant_id, code)
      DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zip = EXCLUDED.zip,
        phone = EXCLUDED.phone,
        is_active = EXCLUDED.is_active,
        is_default = EXCLUDED.is_default,
        sort_order = EXCLUDED.sort_order,
        sells_online = EXCLUDED.sells_online,
        updated_at = EXCLUDED.updated_at
      RETURNING (xmax = 0) AS was_inserted
    `;

    const result = await ssfPool.query(upsertQuery, flatParams);
    const created = result.rows.filter((r: { was_inserted: boolean }) => r.was_inserted).length;
    const updated = result.rows.length - created;

    return { synced: batch.length, created, updated };
  }

  /**
   * Sync inventory levels from source to target
   */
  async syncInventoryLevels(tenantId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const errors: SyncError[] = [];
    let itemsSynced = 0;
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let itemsFailed = 0;

    try {
      // Fetch inventory levels from source with location code for mapping
      const query = `
        SELECT
          il.id,
          il.item_id,
          il.location_id,
          il.quantity,
          il.reserved_qty,
          il.reorder_point,
          il.last_counted_at,
          il.last_counted_by,
          l.code as location_code
        FROM ${this.escapedSchema}.inventory_levels il
        JOIN ${this.escapedSchema}.locations l ON l.id = il.location_id
        WHERE il.tenant_id = $1
        ORDER BY il.item_id, il.location_id
      `;

      const result = await this.sourcePool.query(query, [tenantId]);
      const sourceInventoryLevels = result.rows;

      console.log(`[PostgreSQLAdapter] Fetched ${sourceInventoryLevels.length} inventory levels from source`);

      if (options.dryRun) {
        return {
          success: true,
          itemsSynced: sourceInventoryLevels.length,
          itemsFailed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          errors: [],
          duration: Date.now() - startTime,
          details: { dryRun: true, message: `Would sync ${sourceInventoryLevels.length} inventory levels` },
        };
      }

      // Build mapping from source item_id (list_id) to target items.id
      // This is needed because source uses list_id as FK, target uses UUID
      const itemMappingQuery = `
        SELECT id, external_id
        FROM public.items
        WHERE tenant_id = $1 AND source_system = 'quickbooks'
      `;
      const itemMappingResult = await ssfPool.query(itemMappingQuery, [tenantId]);
      const itemIdMap = new Map<string, string>();
      for (const row of itemMappingResult.rows) {
        itemIdMap.set(row.external_id, row.id);
      }

      // Build mapping from source location code to target location id
      const locationMappingQuery = `
        SELECT id, code
        FROM public.locations
        WHERE tenant_id = $1
      `;
      const locationMappingResult = await ssfPool.query(locationMappingQuery, [tenantId]);
      const locationIdMap = new Map<string, string>();
      for (const row of locationMappingResult.rows) {
        locationIdMap.set(row.code, row.id);
      }

      // Process in batches
      for (let i = 0; i < sourceInventoryLevels.length; i += batchSize) {
        const batch = sourceInventoryLevels.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(sourceInventoryLevels.length / batchSize);

        try {
          // Filter and transform batch, mapping IDs
          const validRows: Array<{
            tenantId: string;
            itemId: string;
            locationId: string;
            quantity: number;
            reservedQty: number | null;
            reorderPoint: number | null;
            lastCountedAt: string | null;
            lastCountedBy: string | null;
          }> = [];

          for (const row of batch) {
            // Map item_id (list_id) to target items.id
            const targetItemId = itemIdMap.get(row.item_id);
            if (!targetItemId) {
              itemsFailed++;
              addErrorWithLimit(errors, {
                message: `Item ${row.item_id} not found in target`,
                code: 'ITEM_NOT_FOUND',
                table: 'item_levels',
                record: { item_id: row.item_id, location_code: row.location_code },
                timestamp: new Date(),
              });
              continue;
            }

            // Map location code to target location id
            const targetLocationId = locationIdMap.get(row.location_code);
            if (!targetLocationId) {
              itemsFailed++;
              addErrorWithLimit(errors, {
                message: `Location ${row.location_code} not found in target`,
                code: 'LOCATION_NOT_FOUND',
                table: 'item_levels',
                record: { item_id: row.item_id, location_code: row.location_code },
                timestamp: new Date(),
              });
              continue;
            }

            validRows.push({
              tenantId,
              itemId: targetItemId,
              locationId: targetLocationId,
              quantity: Number(row.quantity) || 0,
              reservedQty: row.reserved_qty !== null ? Number(row.reserved_qty) : null,
              reorderPoint: row.reorder_point !== null ? Number(row.reorder_point) : null,
              lastCountedAt: row.last_counted_at,
              lastCountedBy: row.last_counted_by,
            });
          }

          if (validRows.length === 0) continue;

          const batchResult = await this.upsertInventoryLevelsBatch(validRows);
          itemsSynced += batchResult.synced;
          itemsCreated += batchResult.created;
          itemsUpdated += batchResult.updated;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`[PostgreSQLAdapter] Inventory levels batch ${batchNum}/${totalBatches} complete (${itemsSynced} total)`);
          }
        } catch (error) {
          const err = error as Error;
          console.error(`[PostgreSQLAdapter] Inventory level batch ${batchNum} failed:`, err.message);
          itemsFailed += batch.length;
          addErrorWithLimit(errors, {
            message: `Batch ${batchNum} failed: ${err.message}`,
            code: 'BATCH_INVENTORY_SYNC_FAILED',
            table: 'item_levels',
            timestamp: new Date(),
          });
        }
      }

      return {
        success: errors.length === 0,
        itemsSynced,
        itemsFailed,
        itemsCreated,
        itemsUpdated,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error as Error;
      console.error('[PostgreSQLAdapter] syncInventoryLevels failed:', err.message);
      addErrorWithLimit(errors, {
        message: err.message,
        code: 'SYNC_INVENTORY_LEVELS_FAILED',
        table: 'item_levels',
        timestamp: new Date(),
      });
      return {
        success: false,
        itemsSynced,
        itemsFailed: itemsFailed + 1,
        itemsCreated,
        itemsUpdated,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Upsert a batch of inventory levels using INSERT ON CONFLICT
   */
  private async upsertInventoryLevelsBatch(
    batch: Array<{
      tenantId: string;
      itemId: string;
      locationId: string;
      quantity: number;
      reservedQty: number | null;
      reorderPoint: number | null;
      lastCountedAt: string | null;
      lastCountedBy: string | null;
    }>
  ): Promise<{ synced: number; created: number; updated: number }> {
    if (batch.length === 0) {
      return { synced: 0, created: 0, updated: 0 };
    }

    const now = new Date().toISOString();

    // Build parameterized values for batch insert
    // Each row has 10 parameters (8 data fields + 2 timestamps)
    const PARAMS_PER_ROW = 10;
    const valueStrings: string[] = [];
    const flatParams: (string | number | null)[] = [];

    batch.forEach((row, idx) => {
      const base = idx * PARAMS_PER_ROW;
      valueStrings.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, ` +
        `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`
      );

      flatParams.push(
        row.tenantId,
        row.itemId,
        row.locationId,
        row.quantity,
        row.reservedQty,
        row.reorderPoint,
        row.lastCountedAt,
        row.lastCountedBy,
        now,                                                      // last_synced_at (parameterized)
        now                                                       // updated_at (parameterized)
      );
    });

    const upsertQuery = `
      INSERT INTO public.item_levels (
        tenant_id, item_id, location_id, quantity, reserved_qty,
        reorder_point, last_counted_at, last_counted_by, last_synced_at, updated_at
      )
      VALUES ${valueStrings.join(',\n')}
      ON CONFLICT (tenant_id, item_id, location_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        reserved_qty = EXCLUDED.reserved_qty,
        reorder_point = EXCLUDED.reorder_point,
        last_counted_at = EXCLUDED.last_counted_at,
        last_counted_by = EXCLUDED.last_counted_by,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = EXCLUDED.updated_at
      RETURNING (xmax = 0) AS was_inserted
    `;

    const result = await ssfPool.query(upsertQuery, flatParams);
    const created = result.rows.filter((r: { was_inserted: boolean }) => r.was_inserted).length;
    const updated = result.rows.length - created;

    return { synced: batch.length, created, updated };
  }

  /**
   * Run full sync of all data types
   */
  async syncAll(tenantId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const allErrors: SyncError[] = [];
    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;

    // Order matters: locations first (for FK), then items, then inventory levels
    const syncSteps = [
      { name: 'locations', skip: options.skipLocations, fn: () => this.syncLocations(tenantId, options) },
      { name: 'items', skip: options.skipItems, fn: () => this.syncItems(tenantId, options) },
      { name: 'item_levels', skip: options.skipInventoryLevels, fn: () => this.syncInventoryLevels(tenantId, options) },
    ];

    const stepResults: Record<string, SyncResult> = {};

    for (const step of syncSteps) {
      if (step.skip) {
        console.log(`[PostgreSQLAdapter] Skipping ${step.name} sync`);
        continue;
      }

      console.log(`[PostgreSQLAdapter] Starting ${step.name} sync...`);
      const result = await step.fn();
      stepResults[step.name] = result;

      totalSynced += result.itemsSynced;
      totalCreated += result.itemsCreated;
      totalUpdated += result.itemsUpdated;
      totalFailed += result.itemsFailed;
      allErrors.push(...result.errors);

      console.log(`[PostgreSQLAdapter] ${step.name} sync complete: ${result.itemsSynced} synced, ${result.itemsFailed} failed`);
    }

    const success = allErrors.length === 0;

    return {
      success,
      itemsSynced: totalSynced,
      itemsFailed: totalFailed,
      itemsCreated: totalCreated,
      itemsUpdated: totalUpdated,
      errors: allErrors,
      duration: Date.now() - startTime,
      details: stepResults,
    };
  }

  /**
   * Close the source database connection pool
   */
  async close(): Promise<void> {
    await this.sourcePool.end();
  }
}

/**
 * Create a PostgreSQL adapter for nexus_db
 */
export function createNexusDbAdapter(): PostgreSQLAdapter {
  return new PostgreSQLAdapter({
    host: process.env.NEXUS_DB_HOST || 'postgres16',
    port: parseInt(process.env.NEXUS_DB_PORT || '5432', 10),
    database: process.env.NEXUS_DB_NAME || 'nexus_db',
    user: process.env.NEXUS_DB_USER || 'postgres',
    password: process.env.NEXUS_DB_PASSWORD || 'postgres',
    schema: 'public',
  });
}
