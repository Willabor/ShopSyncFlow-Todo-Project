/**
 * File Upload Utilities
 *
 * Provides utilities for handling file uploads:
 * - File validation (type, size, extension)
 * - Filename sanitization (remove special chars, spaces)
 * - Unique filename generation (UUID + extension)
 * - File hashing (SHA-256 for deduplication)
 * - MIME type detection
 *
 * Related: /volume1/docker/planning/05-shopsyncflow/File-system/
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// ===================================================================
// Constants
// ===================================================================

/**
 * Allowed MIME types for file uploads
 * Following Shopify's supported formats
 */
export const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Documents
  'application/pdf',
  'text/plain',
  'text/csv',

  // Videos (for future)
  'video/mp4',
  'video/quicktime', // .mov files
] as const;

/**
 * File type categories
 */
export const FILE_TYPE_CATEGORIES = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  document: ['application/pdf', 'text/plain', 'text/csv'],
  video: ['video/mp4', 'video/quicktime'],
} as const;

/**
 * Maximum file size (20 MB - Shopify limit)
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB in bytes

/**
 * Maximum image resolution (20 megapixels - Shopify limit)
 */
export const MAX_IMAGE_RESOLUTION = 20 * 1000 * 1000; // 20 MP

// ===================================================================
// Types
// ===================================================================

export interface FileValidationError {
  field: string;
  message: string;
}

export interface FileValidationResult {
  valid: boolean;
  errors: FileValidationError[];
}

export interface SanitizedFilename {
  sanitized: string;
  extension: string;
}

export interface FileMetadata {
  originalFilename: string;
  sanitizedFilename: string;
  uniqueFilename: string;
  mimeType: string;
  fileType: 'image' | 'document' | 'video' | 'other';
  fileSize: number;
  extension: string;
}

// ===================================================================
// Validation Functions
// ===================================================================

/**
 * Validate file MIME type
 */
export function validateMimeType(mimeType: string): FileValidationResult {
  const errors: FileValidationError[] = [];

  if (!mimeType) {
    errors.push({
      field: 'mimeType',
      message: 'MIME type is required',
    });
    return { valid: false, errors };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    errors.push({
      field: 'mimeType',
      message: `File type not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate file size
 */
export function validateFileSize(fileSize: number): FileValidationResult {
  const errors: FileValidationError[] = [];

  if (fileSize === undefined || fileSize === null) {
    errors.push({
      field: 'fileSize',
      message: 'File size is required',
    });
    return { valid: false, errors };
  }

  if (fileSize <= 0) {
    errors.push({
      field: 'fileSize',
      message: 'File size must be greater than 0',
    });
    return { valid: false, errors };
  }

  if (fileSize > MAX_FILE_SIZE) {
    const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
    const actualSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    errors.push({
      field: 'fileSize',
      message: `File too large (${actualSizeMB} MB). Maximum allowed: ${maxSizeMB} MB`,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate file extension against MIME type
 */
export function validateFileExtension(filename: string, mimeType: string): FileValidationResult {
  const errors: FileValidationError[] = [];
  const extension = path.extname(filename).toLowerCase();

  if (!extension) {
    errors.push({
      field: 'filename',
      message: 'File must have an extension',
    });
    return { valid: false, errors };
  }

  // Map MIME types to expected extensions
  const mimeToExtension: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],
    'video/mp4': ['.mp4'],
    'video/quicktime': ['.mov'],
  };

  const expectedExtensions = mimeToExtension[mimeType];
  if (expectedExtensions && !expectedExtensions.includes(extension)) {
    errors.push({
      field: 'filename',
      message: `File extension ${extension} doesn't match MIME type ${mimeType}. Expected: ${expectedExtensions.join(' or ')}`,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Comprehensive file validation
 */
export function validateFile(
  filename: string,
  mimeType: string,
  fileSize: number
): FileValidationResult {
  const errors: FileValidationError[] = [];

  // Validate MIME type
  const mimeValidation = validateMimeType(mimeType);
  if (!mimeValidation.valid) {
    errors.push(...mimeValidation.errors);
  }

  // Validate file size
  const sizeValidation = validateFileSize(fileSize);
  if (!sizeValidation.valid) {
    errors.push(...sizeValidation.errors);
  }

  // Validate extension
  const extensionValidation = validateFileExtension(filename, mimeType);
  if (!extensionValidation.valid) {
    errors.push(...extensionValidation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ===================================================================
// Filename Sanitization
// ===================================================================

/**
 * Sanitize filename (remove special characters, spaces)
 * Makes filename URL-safe and filesystem-safe
 */
export function sanitizeFilename(filename: string): SanitizedFilename {
  // Extract extension
  const extension = path.extname(filename).toLowerCase();
  const nameWithoutExt = path.basename(filename, extension);

  // Sanitize the name part
  let sanitized = nameWithoutExt
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^a-z0-9-_.]/g, '')   // Remove special chars (keep hyphen, underscore, dot)
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '')        // Remove leading/trailing hyphens
    .substring(0, 100);             // Limit length

  // Fallback if sanitization resulted in empty string
  if (!sanitized) {
    sanitized = 'file';
  }

  return {
    sanitized: sanitized + extension,
    extension,
  };
}

/**
 * Generate unique filename with UUID
 */
export function generateUniqueFilename(originalFilename: string): string {
  const { extension } = sanitizeFilename(originalFilename);
  const uuid = uuidv4();
  return `${uuid}${extension}`;
}

/**
 * Generate filename for current date directory structure
 * Returns: { filename, relativePath, fullPath }
 * Example: { filename: "abc-123.jpg", relativePath: "2025/11", fullPath: "/uploads/2025/11/abc-123.jpg" }
 */
export function generateDateBasedPath(originalFilename: string, baseDir: string = '/uploads'): {
  filename: string;
  relativePath: string;
  fullPath: string;
} {
  const filename = generateUniqueFilename(originalFilename);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const relativePath = `${year}/${month}`;
  const fullPath = `${baseDir}/${relativePath}/${filename}`;

  return { filename, relativePath, fullPath };
}

// ===================================================================
// File Type Detection
// ===================================================================

/**
 * Determine file type category from MIME type
 */
export function getFileType(mimeType: string): 'image' | 'document' | 'video' | 'other' {
  // Check images
  if (FILE_TYPE_CATEGORIES.image.includes(mimeType as any)) {
    return 'image';
  }
  // Check documents
  if (FILE_TYPE_CATEGORIES.document.includes(mimeType as any)) {
    return 'document';
  }
  // Check videos
  if (FILE_TYPE_CATEGORIES.video.includes(mimeType as any)) {
    return 'video';
  }
  return 'other';
}

// ===================================================================
// File Hashing
// ===================================================================

/**
 * Calculate SHA-256 hash of a file (for deduplication)
 * @param filePath - Absolute path to file
 * @returns SHA-256 hash as hex string
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filePath);

    stream.on('data', (data: Buffer) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error: Error) => {
      reject(new Error(`Failed to calculate hash: ${error.message}`));
    });
  });
}

/**
 * Calculate SHA-256 hash from buffer (for in-memory files)
 */
export function calculateBufferHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ===================================================================
// File Metadata Extraction
// ===================================================================

/**
 * Extract comprehensive file metadata
 */
export function extractFileMetadata(
  originalFilename: string,
  mimeType: string,
  fileSize: number
): FileMetadata {
  const { sanitized } = sanitizeFilename(originalFilename);
  const uniqueFilename = generateUniqueFilename(originalFilename);
  const extension = path.extname(originalFilename).toLowerCase();
  const fileType = getFileType(mimeType);

  return {
    originalFilename,
    sanitizedFilename: sanitized,
    uniqueFilename,
    mimeType,
    fileType,
    fileSize,
    extension,
  };
}

// ===================================================================
// Utility Functions
// ===================================================================

/**
 * Format file size to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists (create if not)
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
  }
}

// ===================================================================
// Exports
// ===================================================================

export default {
  // Validation
  validateMimeType,
  validateFileSize,
  validateFileExtension,
  validateFile,

  // Sanitization
  sanitizeFilename,
  generateUniqueFilename,
  generateDateBasedPath,

  // Type detection
  getFileType,

  // Hashing
  calculateFileHash,
  calculateBufferHash,

  // Metadata
  extractFileMetadata,

  // Utilities
  formatFileSize,
  fileExists,
  ensureDirectory,

  // Constants
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_IMAGE_RESOLUTION,
};
