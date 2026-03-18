/**
 * File Size Backfill Service
 *
 * Fetches actual file sizes from CDN URLs for files with fileSize = 0
 * and updates the database. Used during Shopify sync.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { files } from '../../shared/schema';

// ===================================================================
// Types
// ===================================================================

export interface BackfillProgress {
  total: number;
  processed: number;
  updated: number;
  failed: number;
  skipped: number;
}

export interface BackfillResult {
  success: boolean;
  progress: BackfillProgress;
  errors: string[];
}

type ProgressCallback = (progress: BackfillProgress) => void;

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
      return null;
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      return null;
    }

    return parseInt(contentLength, 10);
  } catch (error) {
    return null;
  }
}

/**
 * Add delay between requests to avoid rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===================================================================
// Main Service
// ===================================================================

/**
 * Backfill file sizes for all files with fileSize = 0
 * Files that fail to fetch are marked with fileSize = -1 to prevent retries
 *
 * @param onProgress - Optional callback for progress updates
 * @param batchSize - Number of files to process in each batch (default: 50)
 * @param delayMs - Delay between requests in milliseconds (default: 100)
 */
export async function backfillFileSizes(
  onProgress?: ProgressCallback,
  batchSize: number = 50,
  delayMs: number = 100
): Promise<BackfillResult> {
  const result: BackfillResult = {
    success: true,
    progress: {
      total: 0,
      processed: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    },
    errors: [],
  };

  try {
    console.log('📏 Starting file size backfill...');

    // Step 1: Query all files with fileSize = 0
    const filesToUpdate = await db
      .select({
        id: files.id,
        originalFilename: files.originalFilename,
        cdnUrl: files.cdnUrl,
        fileSize: files.fileSize,
      })
      .from(files)
      .where(eq(files.fileSize, 0));

    result.progress.total = filesToUpdate.length;

    if (filesToUpdate.length === 0) {
      console.log('✅ No files need size backfill');
      return result;
    }

    console.log(`📊 Found ${filesToUpdate.length} files to process`);

    // Step 2: Process in batches
    for (let i = 0; i < filesToUpdate.length; i += batchSize) {
      const batch = filesToUpdate.slice(i, Math.min(i + batchSize, filesToUpdate.length));

      // Process each file in the batch
      for (const file of batch) {
        try {
          // Fetch actual file size
          const actualSize = await fetchFileSize(file.cdnUrl);

          if (actualSize === null) {
            // Mark file as inaccessible (-1) to prevent future retries
            await db
              .update(files)
              .set({
                fileSize: -1,
                updatedAt: new Date(),
              })
              .where(eq(files.id, file.id));

            result.progress.failed++;
            result.errors.push(`Failed to fetch size for: ${file.originalFilename}`);
            continue;
          }

          if (actualSize === 0) {
            result.progress.skipped++;
            continue;
          }

          // Update database
          await db
            .update(files)
            .set({
              fileSize: actualSize,
              updatedAt: new Date(),
            })
            .where(eq(files.id, file.id));

          result.progress.updated++;

          // Rate limiting delay
          await delay(delayMs);
        } catch (error) {
          result.progress.failed++;
          result.errors.push(`Error processing ${file.originalFilename}: ${error instanceof Error ? error.message : String(error)}`);
        }

        result.progress.processed++;

        // Report progress
        if (onProgress) {
          onProgress(result.progress);
        }
      }

      // Log batch completion
      const percentage = ((result.progress.processed / result.progress.total) * 100).toFixed(1);
      console.log(`   Processed ${result.progress.processed}/${result.progress.total} (${percentage}%)`);
    }

    console.log(`✅ File size backfill complete: ${result.progress.updated} updated, ${result.progress.failed} failed, ${result.progress.skipped} skipped`);

    // Mark as failed if more than 50% failed
    if (result.progress.failed > result.progress.total / 2) {
      result.success = false;
    }

    return result;
  } catch (error) {
    console.error('❌ File size backfill failed:', error);
    result.success = false;
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}
