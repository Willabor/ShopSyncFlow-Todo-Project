/**
 * Initial Sync Script
 *
 * Runs the first sync from nexus_db to shopsyncflow_db for the Nexus tenant.
 *
 * Usage: cd /volume1/docker/ShopSyncFlow-Todo-Project && npx tsx server/scripts/run-initial-sync.ts
 */

import 'dotenv/config';
import { syncTenant, getSyncStatus } from '../sync/index.js';

const NEXUS_TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function runInitialSync() {
  console.log('='.repeat(60));
  console.log('ShopSyncFlow Initial Sync');
  console.log('='.repeat(60));
  console.log(`Tenant ID: ${NEXUS_TENANT_ID}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Run the sync
    console.log('Starting sync from nexus_db...');
    console.log('');

    const result = await syncTenant(NEXUS_TENANT_ID, {
      fullSync: true,
      batchSize: 1000,
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('SYNC RESULTS');
    console.log('='.repeat(60));
    console.log(`Success: ${result.success}`);
    console.log(`Items Synced: ${result.itemsSynced}`);
    console.log(`Items Created: ${result.itemsCreated}`);
    console.log(`Items Updated: ${result.itemsUpdated}`);
    console.log(`Items Failed: ${result.itemsFailed}`);
    console.log(`Duration: ${result.duration}ms (${(result.duration / 1000).toFixed(2)}s)`);
    console.log(`Log ID: ${result.logId}`);

    if (result.errors && result.errors.length > 0) {
      console.log('');
      console.log('ERRORS:');
      result.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. [${err.code}] ${err.message}`);
      });
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    // Get final status
    console.log('');
    console.log('='.repeat(60));
    console.log('SYNC STATUS');
    console.log('='.repeat(60));

    const status = await getSyncStatus(NEXUS_TENANT_ID);
    if (status.lastSync) {
      console.log(`Last Sync Status: ${status.lastSync.status}`);
      console.log(`Started: ${status.lastSync.startedAt}`);
      console.log(`Completed: ${status.lastSync.completedAt}`);
    }
    if (status.integration) {
      console.log(`Integration: ${status.integration.name}`);
      console.log(`Type: ${status.integration.type}`);
      console.log(`Frequency: ${status.integration.syncFrequency}`);
    }

    console.log('');
    console.log('Initial sync complete!');
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('SYNC FAILED');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

runInitialSync();
