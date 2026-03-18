/**
 * Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive data like API keys.
 * Uses Node.js built-in crypto module for cryptographic operations.
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Unique IV (16 bytes) per encryption operation
 * - Authentication tag (16 bytes) prevents tampering
 * - Constant-time comparison for tag verification
 *
 * Storage Format:
 * - Base64 encoded: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
 *
 * Environment:
 * - Requires API_KEY_ENCRYPTION_SECRET (32 bytes, hex-encoded or raw)
 *
 * Related:
 * - .env.example - Environment variable documentation
 * - shared/schema.ts - Database schema for encrypted fields
 */

import crypto from 'crypto';

// ===================================================================
// Constants
// ===================================================================

/** AES-256-GCM algorithm identifier */
const ALGORITHM = 'aes-256-gcm';

/** Initialization vector length in bytes (128 bits for GCM) */
const IV_LENGTH = 16;

/** Authentication tag length in bytes (128 bits) */
const AUTH_TAG_LENGTH = 16;

/** Required encryption key length in bytes (256 bits) */
const KEY_LENGTH = 32;

/** Environment variable name for the encryption secret */
const ENV_KEY_NAME = 'API_KEY_ENCRYPTION_SECRET';

// ===================================================================
// Types
// ===================================================================

/**
 * Error thrown when encryption configuration is invalid or missing
 */
export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

// ===================================================================
// Internal Helpers
// ===================================================================

/**
 * Retrieves and validates the encryption key from environment variables.
 *
 * Supports two formats:
 * - Hex-encoded string (64 characters)
 * - Raw 32-byte string
 *
 * @returns Buffer containing the 32-byte encryption key
 * @throws EncryptionError if key is missing or invalid length
 */
function getEncryptionKey(): Buffer {
  const secret = process.env[ENV_KEY_NAME];

  if (!secret) {
    throw new EncryptionError(
      `${ENV_KEY_NAME} environment variable is not set. ` +
      `Generate a key with: openssl rand -hex 32`
    );
  }

  // Try hex-encoded format first (64 hex characters = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }

  // Fall back to raw string (must be exactly 32 bytes)
  const rawBuffer = Buffer.from(secret, 'utf8');
  if (rawBuffer.length !== KEY_LENGTH) {
    throw new EncryptionError(
      `${ENV_KEY_NAME} must be either a 64-character hex string or exactly 32 bytes. ` +
      `Current length: ${rawBuffer.length} bytes. ` +
      `Generate a key with: openssl rand -hex 32`
    );
  }

  return rawBuffer;
}

// ===================================================================
// Public API
// ===================================================================

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * The output format is base64-encoded: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
 *
 * @param plaintext - The string to encrypt (e.g., an API key)
 * @returns Base64-encoded encrypted string
 * @throws EncryptionError if encryption key is not configured
 * @throws Error if plaintext is empty or not a string
 *
 * @example
 * ```typescript
 * const encrypted = encryptApiKey('sk-live-abc123xyz');
 * // Store `encrypted` in the database
 * ```
 */
export function encryptApiKey(plaintext: string): string {
  // Validate input
  if (typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a string');
  }
  if (plaintext.length === 0) {
    throw new Error('Plaintext cannot be empty');
  }

  const key = getEncryptionKey();

  // Generate a cryptographically secure random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get the authentication tag (16 bytes)
  const authTag = cipher.getAuthTag();

  // Bundle: IV + AuthTag + Ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString('base64');
}

/**
 * Decrypts a ciphertext string that was encrypted with encryptApiKey.
 *
 * Expects base64-encoded format: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
 *
 * @param ciphertext - Base64-encoded encrypted string
 * @returns The original plaintext string
 * @throws EncryptionError if encryption key is not configured
 * @throws Error if ciphertext is invalid, tampered, or malformed
 *
 * @example
 * ```typescript
 * const apiKey = decryptApiKey(storedEncryptedValue);
 * // Use `apiKey` for API calls
 * ```
 */
export function decryptApiKey(ciphertext: string): string {
  // Validate input
  if (typeof ciphertext !== 'string') {
    throw new Error('Ciphertext must be a string');
  }
  if (ciphertext.length === 0) {
    throw new Error('Ciphertext cannot be empty');
  }

  const key = getEncryptionKey();

  // Decode from base64
  let combined: Buffer;
  try {
    combined = Buffer.from(ciphertext, 'base64');
  } catch {
    throw new Error('Invalid ciphertext: not valid base64');
  }

  // Minimum length: IV (16) + AuthTag (16) + at least 1 byte of ciphertext
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH + 1;
  if (combined.length < minLength) {
    throw new Error(
      `Invalid ciphertext: too short (${combined.length} bytes, minimum ${minLength})`
    );
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt (will throw if authentication fails)
  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (err) {
    // GCM authentication failure or other decryption error
    throw new Error(
      'Decryption failed: data may be corrupted or tampered with'
    );
  }
}

/**
 * Checks if the encryption service is properly configured.
 *
 * Use this to conditionally enable/disable features that require encryption.
 *
 * @returns true if API_KEY_ENCRYPTION_SECRET is set and valid
 *
 * @example
 * ```typescript
 * if (!isEncryptionConfigured()) {
 *   console.warn('Encryption not configured - API keys will not be stored');
 * }
 * ```
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Masks an API key for safe display in the UI.
 *
 * Shows a prefix and last few characters, hiding the middle portion.
 *
 * @param key - The full API key to mask
 * @returns Masked string like "sk-...abc1" or "****" for very short keys
 *
 * @example
 * ```typescript
 * maskApiKey('sk-live-abc123xyz789def456')
 * // Returns: "sk-...f456"
 *
 * maskApiKey('short')
 * // Returns: "****"
 * ```
 */
export function maskApiKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    return '';
  }

  // For very short keys, just mask entirely
  if (key.length <= 8) {
    return '****';
  }

  // Find a natural prefix (like "sk-", "shpat_", etc.)
  let prefix = '';
  let suffixLength = 4;

  // Common API key prefixes
  const prefixPatterns = [
    /^(sk-live-)/,
    /^(sk-test-)/,
    /^(sk-)/,
    /^(shpat_)/,
    /^(pk_live_)/,
    /^(pk_test_)/,
    /^(AIza)/,
  ];

  for (const pattern of prefixPatterns) {
    const match = key.match(pattern);
    if (match) {
      prefix = match[1];
      break;
    }
  }

  // If no known prefix found, use first 3 characters
  if (!prefix && key.length > 12) {
    prefix = key.substring(0, 3);
  }

  // Get the suffix (last N characters)
  const suffix = key.slice(-suffixLength);

  return `${prefix}...${suffix}`;
}
