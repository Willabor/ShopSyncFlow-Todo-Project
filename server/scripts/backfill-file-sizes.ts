/**
 * Backfill File Sizes Script
 *
 * Fetches actual file sizes from CDN URLs for files with fileSize = 0
 * and updates the database with the correct values.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-file-sizes.ts [--dry-run] [--limit N]
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *   --limit N    Only process first N files (default: all)
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { files } from '../../shared/schema';

// ===================================================================
// Configuration
// ===================================================================

interface ScriptOptions {
  dryRun: boolean;
  limit?: number;
}

// Parse command line arguments
function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
  };

  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }

  return options;
}

// ===================================================================
// Utilities
// ===================================================================

/**
 * Fetch file size from CDN URL using HEAD request
 * Returns file size in bytes or null if failed
 */
async function fetchFileSize(cdnUrl: string): Promise<number | null> {
  try {
    const response = await fetch(cdnUrl, { method: 'HEAD' });

    if (!response.ok) {
      console.error(`  ❌ Failed to fetch ${cdnUrl}: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      console.error(`  ⚠️  No Content-Length header for ${cdnUrl}`);
      return null;
    }

    return parseInt(contentLength, 10);
  } catch (error: any) {
    console.error(`  ❌ Error fetching ${cdnUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Format file size to human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Add delay between requests to avoid rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===================================================================
// Main Script
// ===================================================================

async function main() {
  const options = parseArgs();

  console.log('🔍 Backfill File Sizes from CDN URLs\n');
  console.log(`Mode: ${options.dryRun ? '🔍 DRY RUN (no changes)' : '✅ LIVE (will update database)'}`);
  if (options.limit) {
    console.log(`Limit: Processing first ${options.limit} files`);
  }
  console.log('');

  try {
    // Step 1: Query all files with fileSize = 0
    console.log('📊 Querying files with fileSize = 0...\n');

    let query = db
      .select({
        id: files.id,
        originalFilename: files.originalFilename,
        cdnUrl: files.cdnUrl,
        fileSize: files.fileSize,
      })
      .from(files)
      .where(eq(files.fileSize, 0));

    if (options.limit) {
      query = query.limit(options.limit) as any;
    }

    const filesToUpdate = await query;

    if (filesToUpdate.length === 0) {
      console.log('✅ No files found with fileSize = 0. All files already have sizes!\n');
      return;
    }

    console.log(`Found ${filesToUpdate.length} files to process\n`);
    console.log('─'.repeat(80));

    // Step 2: Process each file
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < filesToUpdate.length; i++) {
      const file = filesToUpdate[i];
      const progress = `[${i + 1}/${filesToUpdate.length}]`;

      console.log(`\n${progress} Processing: ${file.originalFilename}`);
      console.log(`  ID: ${file.id}`);
      console.log(`  CDN URL: ${file.cdnUrl}`);

      // Fetch actual file size
      const actualSize = await fetchFileSize(file.cdnUrl);

      if (actualSize === null) {
        console.log(`  ⚠️  Skipping (failed to fetch size)`);
        skippedCount++;
        continue;
      }

      if (actualSize === 0) {
        console.log(`  ⚠️  Skipping (CDN returned 0 bytes)`);
        skippedCount++;
        continue;
      }

      console.log(`  ✅ Fetched size: ${formatFileSize(actualSize)} (${actualSize} bytes)`);

      // Update database (unless dry run)
      if (!options.dryRun) {
        try {
          await db
            .update(files)
            .set({
              fileSize: actualSize,
              updatedAt: new Date(),
            })
            .where(eq(files.id, file.id));

          console.log(`  💾 Updated database`);
          successCount++;
        } catch (error: any) {
          console.error(`  ❌ Failed to update database: ${error.message}`);
          failedCount++;
        }
      } else {
        console.log(`  🔍 Would update database (dry run)`);
        successCount++;
      }

      // Rate limiting: wait 100ms between requests to avoid overwhelming CDN
      if (i < filesToUpdate.length - 1) {
        await delay(100);
      }
    }

    // Step 3: Summary
    console.log('\n' + '─'.repeat(80));
    console.log('\n📊 Summary:\n');
    console.log(`  Total files processed: ${filesToUpdate.length}`);
    console.log(`  ✅ Successfully updated: ${successCount}`);
    console.log(`  ❌ Failed: ${failedCount}`);
    console.log(`  ⚠️  Skipped: ${skippedCount}`);
    console.log('');

    if (options.dryRun) {
      console.log('🔍 This was a DRY RUN. No changes were made to the database.');
      console.log('   Run without --dry-run to apply updates.\n');
    } else {
      console.log('✅ Database updated successfully!\n');
    }

  } catch (error: any) {
    console.error('\n❌ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
