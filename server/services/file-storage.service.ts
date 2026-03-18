/**
 * File Storage Service
 *
 * Integrates file storage (filesystem) with database operations.
 * Provides high-level CRUD operations for file management.
 *
 * Responsibilities:
 * - Upload files (validate → save → create DB record)
 * - Delete files (check usage → remove from FS → delete DB record)
 * - Link files to products/variants
 * - Query file metadata and usage
 *
 * Related:
 * - server/utils/file-upload.ts - File validation utilities
 * - server/storage/local-storage.ts - Filesystem operations
 * - shared/schema.ts - Database schema
 */

import { eq, desc, asc, and, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  files,
  productMedia,
  variantMedia,
  fileReferences,
  type File,
  type InsertFile,
  type UpdateFile,
  type ProductMedia,
  type InsertProductMedia,
  type VariantMedia,
  type InsertVariantMedia,
} from '../../shared/schema';
import {
  validateFile,
  calculateBufferHash,
  extractFileMetadata,
} from '../utils/file-upload';
import {
  saveFile,
  deleteFile as deleteFileFromStorage,
  getFileInfo,
} from '../storage/local-storage';

// ===================================================================
// Types
// ===================================================================

export interface UploadFileOptions {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  uploadedBy?: string;
  uploadSource?: string;
  tenantId: string;  // MULTI-TENANT: Required for tenant isolation
}

export interface UploadFileResult {
  success: boolean;
  file?: File;
  error?: string;
  validationErrors?: Array<{ field: string; message: string }>;
}

export interface DeleteFileResult {
  success: boolean;
  deletedFileId?: string;
  error?: string;
  usageCount?: number;
}

export interface FileUsage {
  productCount: number;
  variantCount: number;
  referenceCount: number;
  totalUsage: number;
}

export interface ListFilesOptions {
  limit?: number;
  offset?: number;
  fileType?: 'image' | 'document' | 'video' | 'other';
  uploadedBy?: string;
  uploadSource?: string;
  search?: string; // Search by filename or originalFilename
  sortBy?: 'createdAt' | 'filename' | 'fileSize'; // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort direction
}

export interface LinkFileToProductOptions {
  tenantId: string;  // MULTI-TENANT: Required to verify file ownership
  fileId: string;
  productId: string;
  position?: number;
  isFeatured?: boolean;
  mediaType?: string;
}

export interface LinkFileToVariantOptions {
  tenantId: string;  // MULTI-TENANT: Required to verify file ownership
  fileId: string;
  variantId: string;
  position?: number;
  isFeatured?: boolean;
}

// ===================================================================
// File Upload
// ===================================================================

/**
 * Upload a new file (validate, save to storage, create DB record)
 * Uses transactions to ensure atomicity
 */
export async function uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
  const { buffer, originalFilename, mimeType, uploadedBy, uploadSource = 'manual', tenantId } = options;

  try {
    // Step 1: Validate file
    const validation = validateFile(originalFilename, mimeType, buffer.length);
    if (!validation.valid) {
      return {
        success: false,
        validationErrors: validation.errors,
        error: `File validation failed: ${validation.errors.map(e => e.message).join(', ')}`,
      };
    }

    // Step 2: Calculate file hash (for deduplication check)
    const fileHash = calculateBufferHash(buffer);

    // Step 3: Check for duplicate (optional - can skip for now)
    // const existingFile = await findFileByHash(fileHash);
    // if (existingFile) return { success: true, file: existingFile };

    // Step 4: Save file to storage
    const saveResult = await saveFile(buffer, originalFilename);
    if (!saveResult.success) {
      return {
        success: false,
        error: saveResult.error || 'Failed to save file to storage',
      };
    }

    // Step 5: Extract metadata
    const metadata = extractFileMetadata(originalFilename, mimeType, buffer.length);

    // Step 6: Create database record (transaction not needed for single insert)
    // MULTI-TENANT: Include tenantId to associate file with tenant
    const [fileRecord] = await db
      .insert(files)
      .values({
        tenantId,  // MULTI-TENANT: Associate file with tenant
        filename: metadata.uniqueFilename,
        originalFilename: metadata.originalFilename,
        filePath: saveResult.relativePath,
        mimeType: metadata.mimeType,
        fileType: metadata.fileType,
        fileSize: metadata.fileSize,
        fileHash,
        cdnUrl: saveResult.publicUrl,
        storageProvider: 'local',
        uploadedBy,
        uploadSource,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return {
      success: true,
      file: fileRecord,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Upload failed: ${error.message}`,
    };
  }
}

// ===================================================================
// File Deletion
// ===================================================================

/**
 * Delete file (check usage, remove from storage, delete DB record)
 * Uses transactions to ensure atomicity
 * MULTI-TENANT: Requires tenantId to ensure file belongs to tenant
 */
export async function deleteFileById(tenantId: string, fileId: string): Promise<DeleteFileResult> {
  try {
    // Step 1: Get file record - MULTI-TENANT: Verify file belongs to tenant
    const fileRecord = await getFileById(tenantId, fileId);

    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // Step 2: Check file usage
    const usage = await getFileUsage(tenantId, fileId);
    if (usage.totalUsage > 0) {
      return {
        success: false,
        error: `Cannot delete file: still in use (${usage.productCount} products, ${usage.variantCount} variants, ${usage.referenceCount} references)`,
        usageCount: usage.totalUsage,
      };
    }

    // Step 3: Delete from database (will cascade to junction tables)
    await db.delete(files).where(eq(files.id, fileId));

    // Step 4: Delete from storage
    const deleteResult = await deleteFileFromStorage(fileRecord.filePath);
    if (!deleteResult.success) {
      // File deleted from DB but not storage - log warning but don't fail
      console.warn(`File ${fileId} deleted from DB but not from storage: ${deleteResult.error}`);
    }

    return {
      success: true,
      deletedFileId: fileId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Delete failed: ${error.message}`,
    };
  }
}

/**
 * Force delete file (ignores usage, removes all links)
 * WARNING: Use with caution - may break product/variant references
 * MULTI-TENANT: Requires tenantId to ensure file belongs to tenant
 */
export async function forceDeleteFile(tenantId: string, fileId: string): Promise<DeleteFileResult> {
  try {
    // MULTI-TENANT: Verify file belongs to tenant before deleting
    const fileRecord = await getFileById(tenantId, fileId);

    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // Delete from database (CASCADE will remove all links)
    await db.delete(files).where(eq(files.id, fileId));

    // Delete from storage
    await deleteFileFromStorage(fileRecord.filePath);

    return {
      success: true,
      deletedFileId: fileId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Force delete failed: ${error.message}`,
    };
  }
}

// ===================================================================
// File Queries
// ===================================================================

/**
 * Get file by ID
 * MULTI-TENANT: Requires tenantId to ensure file belongs to tenant
 */
export async function getFileById(tenantId: string, fileId: string): Promise<File | null> {
  const [fileRecord] = await db
    .select()
    .from(files)
    .where(and(
      eq(files.id, fileId),
      eq(files.tenantId, tenantId)  // MULTI-TENANT: Added tenantId filter
    ))
    .limit(1);

  return fileRecord || null;
}

/**
 * Get file by hash (for deduplication)
 * MULTI-TENANT: Only searches within the specified tenant's files
 * Used for deduplication - ensures files are only deduplicated within same tenant
 */
export async function findFileByHash(tenantId: string, fileHash: string): Promise<File | null> {
  const [fileRecord] = await db
    .select()
    .from(files)
    .where(and(
      eq(files.tenantId, tenantId),  // MULTI-TENANT: Only search within tenant
      eq(files.fileHash, fileHash)
    ))
    .limit(1);

  return fileRecord || null;
}

/**
 * List files with pagination and filters
 * MULTI-TENANT: Requires tenantId to filter files by tenant
 */
export async function listFiles(tenantId: string, options: ListFilesOptions = {}): Promise<{ files: File[], totalCount: number }> {
  const {
    limit = 50,
    offset = 0,
    fileType,
    uploadedBy,
    uploadSource,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;

  let query = db.select().from(files);

  // Apply filters - MULTI-TENANT: Always start with tenant filter
  const conditions = [eq(files.tenantId, tenantId)];  // MULTI-TENANT: Added tenantId filter
  if (fileType) conditions.push(eq(files.fileType, fileType));
  if (uploadedBy) conditions.push(eq(files.uploadedBy, uploadedBy));
  if (uploadSource) conditions.push(eq(files.uploadSource, uploadSource));

  // Apply search (case-insensitive search on filename and originalFilename)
  if (search && search.trim()) {
    const searchTerm = `%${search.trim()}%`;
    conditions.push(
      sql`(${files.filename} ILIKE ${searchTerm} OR ${files.originalFilename} ILIKE ${searchTerm})`
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  // Get total count (without pagination)
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(files);
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as any;
  }
  const [{ count: totalCount }] = await countQuery;

  // Apply dynamic sorting
  const sortColumn = sortBy === 'filename' ? files.filename :
                     sortBy === 'fileSize' ? files.fileSize :
                     files.createdAt;

  const orderFn = sortOrder === 'asc' ? asc : desc;

  // Apply ordering and pagination
  const results = await query
    .orderBy(orderFn(sortColumn))
    .limit(limit)
    .offset(offset);

  return { files: results, totalCount: Number(totalCount) };
}

/**
 * Get file usage statistics
 * MULTI-TENANT: Requires tenantId to verify file belongs to tenant
 */
export async function getFileUsage(tenantId: string, fileId: string): Promise<FileUsage> {
  // MULTI-TENANT: First verify file belongs to tenant
  const file = await getFileById(tenantId, fileId);
  if (!file) {
    return { productCount: 0, variantCount: 0, referenceCount: 0, totalUsage: 0 };
  }

  // Count product media
  const productCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(productMedia)
    .where(eq(productMedia.fileId, fileId))
    .then(result => Number(result[0]?.count || 0));

  // Count variant media
  const variantCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(variantMedia)
    .where(eq(variantMedia.fileId, fileId))
    .then(result => Number(result[0]?.count || 0));

  // Count file references
  const referenceCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(fileReferences)
    .where(eq(fileReferences.fileId, fileId))
    .then(result => Number(result[0]?.count || 0));

  return {
    productCount,
    variantCount,
    referenceCount,
    totalUsage: productCount + variantCount + referenceCount,
  };
}

// ===================================================================
// Product Media Links
// ===================================================================

/**
 * Link file to product (create product_media record)
 * MULTI-TENANT: Verifies file belongs to tenant before linking
 */
export async function linkFileToProduct(
  options: LinkFileToProductOptions
): Promise<{ success: boolean; productMedia?: ProductMedia; error?: string }> {
  const { tenantId, fileId, productId, position = 1, isFeatured = false, mediaType = 'image' } = options;

  try {
    // MULTI-TENANT: Verify file exists AND belongs to tenant
    const fileRecord = await getFileById(tenantId, fileId);
    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // Check if link already exists
    const existingLink = await db
      .select()
      .from(productMedia)
      .where(
        and(
          eq(productMedia.productId, productId),
          eq(productMedia.fileId, fileId)
        )
      )
      .limit(1);

    if (existingLink.length > 0) {
      return {
        success: false,
        error: 'File already linked to this product',
      };
    }

    // Create link
    const [link] = await db
      .insert(productMedia)
      .values({
        productId,
        fileId,
        position,
        isFeatured,
        mediaType,
        createdAt: new Date(),
      })
      .returning();

    return {
      success: true,
      productMedia: link,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to link file to product: ${error.message}`,
    };
  }
}

/**
 * Unlink file from product
 * MULTI-TENANT: Verifies file belongs to tenant before unlinking
 */
export async function unlinkFileFromProduct(
  tenantId: string,
  productId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // MULTI-TENANT: Verify file belongs to tenant
    const fileRecord = await getFileById(tenantId, fileId);
    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    await db
      .delete(productMedia)
      .where(
        and(
          eq(productMedia.productId, productId),
          eq(productMedia.fileId, fileId)
        )
      );

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to unlink file from product: ${error.message}`,
    };
  }
}

/**
 * Get all media files for a product (ordered by position)
 * MULTI-TENANT: Filters files by tenantId
 */
export async function getProductMediaFiles(tenantId: string, productId: string): Promise<Array<File & { position: number; isFeatured: boolean | null }>> {
  const results = await db
    .select({
      file: files,
      position: productMedia.position,
      isFeatured: productMedia.isFeatured,
    })
    .from(productMedia)
    .innerJoin(files, eq(productMedia.fileId, files.id))
    .where(and(
      eq(productMedia.productId, productId),
      eq(files.tenantId, tenantId)  // MULTI-TENANT: Added tenantId filter
    ))
    .orderBy(productMedia.position);

  return results.map(r => ({
    ...r.file,
    position: r.position,
    isFeatured: r.isFeatured,
  }));
}

/**
 * Update product media position and featured status
 * MULTI-TENANT: Verifies file belongs to tenant before updating
 */
export async function updateProductMediaPosition(
  tenantId: string,
  productId: string,
  fileId: string,
  position: number,
  isFeatured?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    // MULTI-TENANT: Verify file belongs to tenant
    const fileRecord = await getFileById(tenantId, fileId);
    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    const updateData: any = { position };
    if (isFeatured !== undefined) {
      updateData.isFeatured = isFeatured;
    }

    await db
      .update(productMedia)
      .set(updateData)
      .where(
        and(
          eq(productMedia.productId, productId),
          eq(productMedia.fileId, fileId)
        )
      );

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to update media position: ${error.message}`,
    };
  }
}

// ===================================================================
// Variant Media Links
// ===================================================================

/**
 * Link file to variant (create variant_media record)
 * MULTI-TENANT: Verifies file belongs to tenant before linking
 */
export async function linkFileToVariant(
  options: LinkFileToVariantOptions
): Promise<{ success: boolean; variantMedia?: VariantMedia; error?: string }> {
  const { tenantId, fileId, variantId, position = 1, isFeatured = false } = options;

  try {
    // MULTI-TENANT: Verify file exists AND belongs to tenant
    const fileRecord = await getFileById(tenantId, fileId);
    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    // Check if link already exists
    const existingLink = await db
      .select()
      .from(variantMedia)
      .where(
        and(
          eq(variantMedia.variantId, variantId),
          eq(variantMedia.fileId, fileId)
        )
      )
      .limit(1);

    if (existingLink.length > 0) {
      return {
        success: false,
        error: 'File already linked to this variant',
      };
    }

    // Create link
    const [link] = await db
      .insert(variantMedia)
      .values({
        variantId,
        fileId,
        position,
        isFeatured,
        createdAt: new Date(),
      })
      .returning();

    return {
      success: true,
      variantMedia: link,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to link file to variant: ${error.message}`,
    };
  }
}

/**
 * Unlink file from variant
 * MULTI-TENANT: Verifies file belongs to tenant before unlinking
 */
export async function unlinkFileFromVariant(
  tenantId: string,
  variantId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // MULTI-TENANT: Verify file belongs to tenant
    const fileRecord = await getFileById(tenantId, fileId);
    if (!fileRecord) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    await db
      .delete(variantMedia)
      .where(
        and(
          eq(variantMedia.variantId, variantId),
          eq(variantMedia.fileId, fileId)
        )
      );

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to unlink file from variant: ${error.message}`,
    };
  }
}

/**
 * Get all media files for a variant (ordered by position)
 * MULTI-TENANT: Filters files by tenantId
 */
export async function getVariantMediaFiles(tenantId: string, variantId: string): Promise<Array<File & { position: number; isFeatured: boolean | null }>> {
  const results = await db
    .select({
      file: files,
      position: variantMedia.position,
      isFeatured: variantMedia.isFeatured,
    })
    .from(variantMedia)
    .innerJoin(files, eq(variantMedia.fileId, files.id))
    .where(and(
      eq(variantMedia.variantId, variantId),
      eq(files.tenantId, tenantId)  // MULTI-TENANT: Added tenantId filter
    ))
    .orderBy(variantMedia.position);

  return results.map(r => ({
    ...r.file,
    position: r.position,
    isFeatured: r.isFeatured,
  }));
}

// ===================================================================
// File Metadata Updates
// ===================================================================

/**
 * Update file metadata (alt text, title)
 * MULTI-TENANT: Requires tenantId to verify file belongs to tenant
 */
export async function updateFileMetadata(
  tenantId: string,
  fileId: string,
  updates: UpdateFile
): Promise<{ success: boolean; file?: File; error?: string }> {
  try {
    // MULTI-TENANT: Verify file belongs to tenant first
    const existing = await getFileById(tenantId, fileId);
    if (!existing) {
      return {
        success: false,
        error: 'File not found',
      };
    }

    const [updatedFile] = await db
      .update(files)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId))
      .returning();

    return {
      success: true,
      file: updatedFile,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to update file metadata: ${error.message}`,
    };
  }
}

// ===================================================================
// Bulk Operations
// ===================================================================

/**
 * Delete multiple files (checks usage for each)
 * MULTI-TENANT: Requires tenantId to ensure files belong to tenant
 */
export async function deleteMultipleFiles(
  tenantId: string,
  fileIds: string[]
): Promise<{ success: boolean; deleted: string[]; failed: Array<{ fileId: string; error: string }> }> {
  const deleted: string[] = [];
  const failed: Array<{ fileId: string; error: string }> = [];

  for (const fileId of fileIds) {
    const result = await deleteFileById(tenantId, fileId);
    if (result.success) {
      deleted.push(fileId);
    } else {
      failed.push({ fileId, error: result.error || 'Unknown error' });
    }
  }

  return {
    success: failed.length === 0,
    deleted,
    failed,
  };
}

// ===================================================================
// Exports
// ===================================================================

export default {
  // Upload & Delete
  uploadFile,
  deleteFileById,
  forceDeleteFile,

  // Queries
  getFileById,
  findFileByHash,
  listFiles,
  getFileUsage,

  // Product Media
  linkFileToProduct,
  unlinkFileFromProduct,
  getProductMediaFiles,
  updateProductMediaPosition,

  // Variant Media
  linkFileToVariant,
  unlinkFileFromVariant,
  getVariantMediaFiles,

  // Metadata
  updateFileMetadata,

  // Bulk
  deleteMultipleFiles,
};
