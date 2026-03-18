/**
 * File Management API Routes
 *
 * Endpoints for file upload, management, and linking to products/variants.
 * Uses multer for file upload middleware and integrates with storage service.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin, WarehouseManager: Full access (upload, delete, link, update)
 * - Editor: Upload, link to own products, update own files
 * - Auditor: Read-only access
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { User } from '@shared/schema';
import * as fileStorageService from '../services/file-storage.service';

// ===================================================================
// Multer Configuration
// ===================================================================

// Use memory storage (files stored in buffer, not disk)
// We'll handle saving to disk via our storage service
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max (Shopify limit)
    files: 10, // Max 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allowed MIME types
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'text/plain',
      'text/csv',
      'video/mp4',
      'video/quicktime',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ===================================================================
// Request Validation Schemas
// ===================================================================

const linkFileToProductSchema = z.object({
  fileId: z.string().min(1),
  productId: z.string().min(1),
  position: z.number().int().positive().optional(),
  isFeatured: z.boolean().optional(),
  mediaType: z.string().optional(),
});

const linkFileToVariantSchema = z.object({
  fileId: z.string().min(1),
  variantId: z.string().min(1),
  position: z.number().int().positive().optional(),
  isFeatured: z.boolean().optional(),
});

const updateFileMetadataSchema = z.object({
  altText: z.string().optional(),
  title: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const listFilesQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  fileType: z.enum(['image', 'document', 'video', 'other']).optional(),
  uploadedBy: z.string().optional(),
  uploadSource: z.string().optional(),
  search: z.string().optional(), // Search by filename
  sortBy: z.enum(['createdAt', 'filename', 'fileSize']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ===================================================================
// Route Registration
// ===================================================================

export function registerFileRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // ===================================================================
  // File Upload
  // ===================================================================

  /**
   * POST /api/files/upload
   * Upload one or multiple files
   *
   * Body: multipart/form-data
   * - files: File[] (max 10 files, 20 MB each)
   *
   * Returns: { success: boolean, files: File[], errors?: string[] }
   */
  app.post(
    '/api/files/upload',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    upload.array('files', 10),
    async (req: Request, res: Response) => {
      try {
        const files = req.files as Express.Multer.File[];
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        if (!files || files.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No files provided',
          });
        }

        // Upload all files - MULTI-TENANT: Include tenantId
        const uploadPromises = files.map(file =>
          fileStorageService.uploadFile({
            buffer: file.buffer,
            originalFilename: file.originalname,
            mimeType: file.mimetype,
            uploadedBy: user.id,
            uploadSource: 'manual',
            tenantId,  // MULTI-TENANT: Associate file with tenant
          })
        );

        const results = await Promise.all(uploadPromises);

        // Separate successes and failures
        const successfulUploads = results.filter(r => r.success).map(r => r.file);
        const failedUploads = results
          .filter(r => !r.success)
          .map(r => r.error || 'Unknown error');

        return res.status(failedUploads.length > 0 ? 207 : 200).json({
          success: failedUploads.length === 0,
          files: successfulUploads,
          errors: failedUploads.length > 0 ? failedUploads : undefined,
          uploaded: successfulUploads.length,
          failed: failedUploads.length,
        });
      } catch (error: any) {
        console.error('File upload error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'File upload failed'),
        });
      }
    }
  );

  // ===================================================================
  // File Queries
  // ===================================================================

  /**
   * GET /api/files
   * List files with pagination, filters, search, and sorting
   *
   * Query params:
   * - limit: number (default: 50)
   * - offset: number (default: 0)
   * - fileType: 'image' | 'document' | 'video' | 'other'
   * - uploadedBy: string (user ID)
   * - uploadSource: string
   * - search: string (search filename/originalFilename)
   * - sortBy: 'createdAt' | 'filename' | 'fileSize' (default: 'createdAt')
   * - sortOrder: 'asc' | 'desc' (default: 'desc')
   *
   * Returns: { success: boolean, files: File[], total: number }
   */
  app.get('/api/files', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as User;

      // MULTI-TENANT: Extract tenantId from authenticated user
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'No tenant context',
        });
      }

      // Validate query params
      const queryValidation = listFilesQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: queryValidation.error.errors,
        });
      }

      const { limit, offset, fileType, uploadedBy, uploadSource, search, sortBy, sortOrder } = queryValidation.data;

      // MULTI-TENANT: Pass tenantId to filter files by tenant
      const { files, totalCount } = await fileStorageService.listFiles(tenantId, {
        limit,
        offset,
        fileType,
        uploadedBy,
        uploadSource,
        search,
        sortBy,
        sortOrder,
      });

      return res.json({
        success: true,
        files,
        count: totalCount,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error('List files error:', error);
      return res.status(500).json({
        success: false,
        error: safeErrorMessage(error, 'Failed to list files'),
      });
    }
  });

  /**
   * GET /api/files/:id
   * Get file details by ID
   *
   * Returns: { success: boolean, file: File, usage: FileUsage }
   */
  app.get('/api/files/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as User;

      // MULTI-TENANT: Extract tenantId from authenticated user
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'No tenant context',
        });
      }

      const { id } = req.params;

      // MULTI-TENANT: Pass tenantId to verify file belongs to tenant
      const file = await fileStorageService.getFileById(tenantId, id);
      if (!file) {
        return res.status(404).json({
          success: false,
          error: 'File not found',
        });
      }

      // Get usage statistics - MULTI-TENANT: Pass tenantId
      const usage = await fileStorageService.getFileUsage(tenantId, id);

      return res.json({
        success: true,
        file,
        usage,
      });
    } catch (error: any) {
      console.error('Get file error:', error);
      return res.status(500).json({
        success: false,
        error: safeErrorMessage(error, 'Failed to get file'),
      });
    }
  });

  // ===================================================================
  // File Metadata Updates
  // ===================================================================

  /**
   * PUT /api/files/:id
   * Update file metadata (alt text, title, dimensions)
   *
   * Body: { altText?: string, title?: string, width?: number, height?: number }
   *
   * Returns: { success: boolean, file: File }
   */
  app.put(
    '/api/files/:id',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { id } = req.params;

        // Validate request body
        const bodyValidation = updateFileMetadataSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: bodyValidation.error.errors,
          });
        }

        // MULTI-TENANT: Pass tenantId to verify file ownership
        const result = await fileStorageService.updateFileMetadata(tenantId, id, bodyValidation.data);

        if (!result.success) {
          return res.status(404).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Update file error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update file'),
        });
      }
    }
  );

  // ===================================================================
  // File Deletion
  // ===================================================================

  /**
   * DELETE /api/files/:id
   * Delete file (soft delete - checks usage)
   *
   * Query params:
   * - force: boolean (force delete even if in use)
   *
   * Returns: { success: boolean, deletedFileId?: string, error?: string }
   */
  app.delete(
    '/api/files/:id',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { id } = req.params;
        const force = req.query.force === 'true';

        // MULTI-TENANT: Pass tenantId to verify file ownership before deletion
        const result = force
          ? await fileStorageService.forceDeleteFile(tenantId, id)
          : await fileStorageService.deleteFileById(tenantId, id);

        if (!result.success) {
          return res.status(result.usageCount ? 409 : 404).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Delete file error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete file'),
        });
      }
    }
  );

  // ===================================================================
  // Product Media Links
  // ===================================================================

  /**
   * POST /api/files/link/product
   * Link file to product
   *
   * Body: { fileId: string, productId: string, position?: number, isFeatured?: boolean }
   *
   * Returns: { success: boolean, productMedia: ProductMedia }
   */
  app.post(
    '/api/files/link/product',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        // Validate request body
        const bodyValidation = linkFileToProductSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: bodyValidation.error.errors,
          });
        }

        // MULTI-TENANT: Pass tenantId to verify file ownership before linking
        const result = await fileStorageService.linkFileToProduct({
          ...bodyValidation.data,
          tenantId,
        });

        if (!result.success) {
          return res.status(400).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Link file to product error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to link file to product'),
        });
      }
    }
  );

  /**
   * DELETE /api/files/link/product/:productId/:fileId
   * Unlink file from product
   *
   * Returns: { success: boolean }
   */
  app.delete(
    '/api/files/link/product/:productId/:fileId',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { productId, fileId } = req.params;

        // MULTI-TENANT: Pass tenantId to verify file ownership before unlinking
        const result = await fileStorageService.unlinkFileFromProduct(tenantId, productId, fileId);

        if (!result.success) {
          return res.status(400).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Unlink file from product error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to unlink file from product'),
        });
      }
    }
  );

  /**
   * GET /api/products/:productId/media
   * Get all media files for a product
   *
   * Returns: { success: boolean, files: File[] }
   */
  app.get('/api/products/:productId/media', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as User;

      // MULTI-TENANT: Extract tenantId from authenticated user
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'No tenant context',
        });
      }

      const { productId } = req.params;

      // MULTI-TENANT: Pass tenantId to filter files by tenant
      const files = await fileStorageService.getProductMediaFiles(tenantId, productId);

      return res.json({
        success: true,
        files,
        count: files.length,
      });
    } catch (error: any) {
      console.error('Get product media error:', error);
      return res.status(500).json({
        success: false,
        error: safeErrorMessage(error, 'Failed to get product media'),
      });
    }
  });

  /**
   * PUT /api/files/link/product/:productId/:fileId/position
   * Update product media position and featured status
   *
   * Body: { position: number, isFeatured?: boolean }
   *
   * Returns: { success: boolean }
   */
  app.put(
    '/api/files/link/product/:productId/:fileId/position',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { productId, fileId } = req.params;
        const { position, isFeatured } = req.body;

        if (typeof position !== 'number' || position < 1) {
          return res.status(400).json({
            success: false,
            error: 'Invalid position (must be positive integer)',
          });
        }

        // MULTI-TENANT: Pass tenantId to verify file ownership
        const result = await fileStorageService.updateProductMediaPosition(
          tenantId,
          productId,
          fileId,
          position,
          isFeatured
        );

        if (!result.success) {
          return res.status(400).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Update media position error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update media position'),
        });
      }
    }
  );

  // ===================================================================
  // Variant Media Links
  // ===================================================================

  /**
   * POST /api/files/link/variant
   * Link file to variant
   *
   * Body: { fileId: string, variantId: string, position?: number, isFeatured?: boolean }
   *
   * Returns: { success: boolean, variantMedia: VariantMedia }
   */
  app.post(
    '/api/files/link/variant',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        // Validate request body
        const bodyValidation = linkFileToVariantSchema.safeParse(req.body);
        if (!bodyValidation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: bodyValidation.error.errors,
          });
        }

        // MULTI-TENANT: Pass tenantId to verify file ownership before linking
        const result = await fileStorageService.linkFileToVariant({
          ...bodyValidation.data,
          tenantId,
        });

        if (!result.success) {
          return res.status(400).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Link file to variant error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to link file to variant'),
        });
      }
    }
  );

  /**
   * DELETE /api/files/link/variant/:variantId/:fileId
   * Unlink file from variant
   *
   * Returns: { success: boolean }
   */
  app.delete(
    '/api/files/link/variant/:variantId/:fileId',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager', 'Editor']),
    async (req: Request, res: Response) => {
      try {
        const user = req.user as User;

        // MULTI-TENANT: Extract tenantId from authenticated user
        const tenantId = user?.tenantId;
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { variantId, fileId } = req.params;

        // MULTI-TENANT: Pass tenantId to verify file ownership before unlinking
        const result = await fileStorageService.unlinkFileFromVariant(tenantId, variantId, fileId);

        if (!result.success) {
          return res.status(400).json(result);
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Unlink file from variant error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to unlink file from variant'),
        });
      }
    }
  );

  /**
   * GET /api/variants/:variantId/media
   * Get all media files for a variant
   *
   * Returns: { success: boolean, files: File[] }
   */
  app.get('/api/variants/:variantId/media', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as User;

      // MULTI-TENANT: Extract tenantId from authenticated user
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'No tenant context',
        });
      }

      const { variantId } = req.params;

      // MULTI-TENANT: Pass tenantId to filter files by tenant
      const files = await fileStorageService.getVariantMediaFiles(tenantId, variantId);

      return res.json({
        success: true,
        files,
        count: files.length,
      });
    } catch (error: any) {
      console.error('Get variant media error:', error);
      return res.status(500).json({
        success: false,
        error: safeErrorMessage(error, 'Failed to get variant media'),
      });
    }
  });

  // ===================================================================
  // Static File Serving
  // ===================================================================

  /**
   * Serve uploaded files
   * GET /uploads/*
   */
  // Note: This is typically handled by Express static middleware in index.ts
  // app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
}
