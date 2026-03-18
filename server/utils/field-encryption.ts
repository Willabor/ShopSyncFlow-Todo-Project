/**
 * Field Encryption Utilities
 *
 * Thin wrapper around encryption.service.ts for encrypting/decrypting
 * database fields. Handles graceful degradation when encryption is not
 * configured and transparent migration from plaintext to encrypted values.
 */

import {
  encryptApiKey,
  decryptApiKey,
  isEncryptionConfigured,
} from '../services/encryption.service.js';

/**
 * Minimum length of a valid AES-256-GCM encrypted Base64 string.
 * IV (16) + AuthTag (16) + at least 1 byte ciphertext = 33 bytes raw,
 * which encodes to at least 44 Base64 characters.
 */
const MIN_ENCRYPTED_LENGTH = 44;

/**
 * Heuristic to detect if a value is already encrypted.
 * Encrypted values are Base64-encoded and at least MIN_ENCRYPTED_LENGTH chars.
 * Plaintext tokens (OAuth, API keys) contain non-Base64 characters or known prefixes.
 */
function looksEncrypted(value: string): boolean {
  if (value.length < MIN_ENCRYPTED_LENGTH) return false;
  // Base64 uses A-Z, a-z, 0-9, +, /, and = for padding
  // If it's valid Base64 and doesn't start with known plaintext prefixes, treat as encrypted
  const knownPlaintextPrefixes = ['shpat_', 'sk-', 'pk_', 'ya29.', 'AIza', '1//', 'Bearer '];
  if (knownPlaintextPrefixes.some(p => value.startsWith(p))) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(value);
}

/**
 * Encrypt a field value for database storage.
 * Returns the original value if encryption is not configured or value is null/empty.
 */
export function encryptField(value: string | null | undefined): string | null {
  if (!value) return value as null;
  if (!isEncryptionConfigured()) return value;
  if (looksEncrypted(value)) return value; // already encrypted
  return encryptApiKey(value);
}

/**
 * Decrypt a field value read from the database.
 * Handles both encrypted and plaintext values gracefully (migration support).
 * Returns the original value if encryption is not configured or value is null/empty.
 */
export function decryptField(value: string | null | undefined): string | null {
  if (!value) return value as null;
  if (!isEncryptionConfigured()) return value;
  if (!looksEncrypted(value)) return value; // plaintext, not yet migrated

  try {
    return decryptApiKey(value);
  } catch {
    // Decryption failed — value might be plaintext that happens to look like Base64.
    // Return as-is rather than breaking the application.
    return value;
  }
}
