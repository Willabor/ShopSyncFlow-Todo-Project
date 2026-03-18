/**
 * Local Storage Implementation
 *
 * Handles file storage on the local filesystem:
 * - Saves files to /uploads/YYYY/MM/ structure
 * - Generates public URLs
 * - Deletes files
 * - Ensures directory structure
 *
 * Related: /volume1/docker/planning/05-shopsyncflow/File-system/
 */

import fs from 'fs/promises';
import path from 'path';
import {
  generateDateBasedPath,
  ensureDirectory,
  fileExists,
} from '../utils/file-upload';

// ===================================================================
// Configuration
// ===================================================================

/**
 * Base directory for file uploads (relative to project root)
 */
const UPLOADS_DIR = path.join(process.cwd(), 'server', 'uploads');

/**
 * Public URL path for accessing files
 */
const PUBLIC_URL_BASE = '/uploads';

// ===================================================================
// Types
// ===================================================================

export interface SaveFileResult {
  success: boolean;
  filePath: string;      // Absolute filesystem path
  relativePath: string;  // Relative path from uploads dir (YYYY/MM/filename.jpg)
  publicUrl: string;     // Public URL (/uploads/YYYY/MM/filename.jpg)
  error?: string;
}

export interface DeleteFileResult {
  success: boolean;
  deletedPath: string;
  error?: string;
}

// ===================================================================
// Storage Functions
// ===================================================================

/**
 * Save file to local filesystem
 * @param buffer - File buffer to save
 * @param originalFilename - Original filename (for extension)
 * @returns SaveFileResult with paths and URL
 */
export async function saveFile(
  buffer: Buffer,
  originalFilename: string
): Promise<SaveFileResult> {
  try {
    // Generate date-based path structure
    const { filename, relativePath } = generateDateBasedPath(originalFilename, '');

    // Create full directory path
    const yearMonthDir = path.join(UPLOADS_DIR, relativePath);

    // Ensure directory exists
    await ensureDirectory(yearMonthDir);

    // Full file path
    const filePath = path.join(yearMonthDir, filename);

    // Write file to disk
    await fs.writeFile(filePath, buffer);

    // Generate public URL
    const publicUrl = `${PUBLIC_URL_BASE}/${relativePath}/${filename}`;

    return {
      success: true,
      filePath,
      relativePath: `${relativePath}/${filename}`,
      publicUrl,
    };
  } catch (error: any) {
    return {
      success: false,
      filePath: '',
      relativePath: '',
      publicUrl: '',
      error: `Failed to save file: ${error.message}`,
    };
  }
}

/**
 * Delete file from local filesystem
 * @param relativePath - Relative path from uploads dir (YYYY/MM/filename.jpg)
 * @returns DeleteFileResult
 */
export async function deleteFile(relativePath: string): Promise<DeleteFileResult> {
  try {
    const filePath = path.join(UPLOADS_DIR, relativePath);

    // Check if file exists
    const exists = await fileExists(filePath);
    if (!exists) {
      return {
        success: false,
        deletedPath: relativePath,
        error: 'File not found',
      };
    }

    // Delete file
    await fs.unlink(filePath);

    return {
      success: true,
      deletedPath: relativePath,
    };
  } catch (error: any) {
    return {
      success: false,
      deletedPath: relativePath,
      error: `Failed to delete file: ${error.message}`,
    };
  }
}

/**
 * Get file info (size, exists)
 * @param relativePath - Relative path from uploads dir
 * @returns File stats or null if not found
 */
export async function getFileInfo(relativePath: string): Promise<{
  exists: boolean;
  size?: number;
  createdAt?: Date;
  modifiedAt?: Date;
}> {
  try {
    const filePath = path.join(UPLOADS_DIR, relativePath);
    const stats = await fs.stat(filePath);

    return {
      exists: true,
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Generate public URL from relative path
 * @param relativePath - Relative path (YYYY/MM/filename.jpg)
 * @returns Public URL
 */
export function getPublicUrl(relativePath: string): string {
  return `${PUBLIC_URL_BASE}/${relativePath}`;
}

/**
 * Check available disk space in uploads directory
 * @returns Available space in bytes
 */
export async function getAvailableSpace(): Promise<number> {
  try {
    // Node.js doesn't have built-in disk space check
    // This would require a third-party library like 'check-disk-space'
    // For now, return a large number (not implemented)
    return Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Clean up empty directories in uploads folder
 * Removes empty year/month directories
 */
export async function cleanupEmptyDirectories(): Promise<number> {
  let removedCount = 0;

  try {
    const years = await fs.readdir(UPLOADS_DIR);

    for (const year of years) {
      const yearPath = path.join(UPLOADS_DIR, year);
      const yearStat = await fs.stat(yearPath);

      if (!yearStat.isDirectory()) continue;

      const months = await fs.readdir(yearPath);

      for (const month of months) {
        const monthPath = path.join(yearPath, month);
        const monthStat = await fs.stat(monthPath);

        if (!monthStat.isDirectory()) continue;

        // Check if month directory is empty
        const files = await fs.readdir(monthPath);
        if (files.length === 0) {
          await fs.rmdir(monthPath);
          removedCount++;
        }
      }

      // Check if year directory is now empty
      const remainingMonths = await fs.readdir(yearPath);
      if (remainingMonths.length === 0) {
        await fs.rmdir(yearPath);
        removedCount++;
      }
    }
  } catch (error: any) {
    console.error('Error cleaning up directories:', error.message);
  }

  return removedCount;
}

/**
 * Initialize uploads directory structure
 * Ensures base directory exists
 */
export async function initializeStorage(): Promise<void> {
  await ensureDirectory(UPLOADS_DIR);
}

// ===================================================================
// Exports
// ===================================================================

export default {
  saveFile,
  deleteFile,
  getFileInfo,
  getPublicUrl,
  getAvailableSpace,
  cleanupEmptyDirectories,
  initializeStorage,
  UPLOADS_DIR,
  PUBLIC_URL_BASE,
};
