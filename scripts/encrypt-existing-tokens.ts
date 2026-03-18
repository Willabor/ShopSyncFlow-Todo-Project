/**
 * One-time Migration Script: Encrypt Existing Plaintext Tokens
 *
 * Reads all api_integrations rows and encrypts accessToken/refreshToken
 * fields that are currently stored as plaintext.
 *
 * Usage:
 *   npx tsx scripts/encrypt-existing-tokens.ts              # Dry run (default)
 *   npx tsx scripts/encrypt-existing-tokens.ts --execute     # Actually encrypt
 *
 * Prerequisites:
 *   - API_KEY_ENCRYPTION_SECRET must be set in .env
 *   - Database must be accessible
 *
 * Safety:
 *   - Idempotent: skips already-encrypted values
 *   - Dry run by default: shows what would be changed without modifying data
 *   - Logs every change for audit trail
 */

import 'dotenv/config';
import { db, pool } from '../server/db.js';
import { apiIntegrations } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { encryptApiKey, isEncryptionConfigured } from '../server/services/encryption.service.js';

const MIN_ENCRYPTED_LENGTH = 44;
const KNOWN_PLAINTEXT_PREFIXES = ['shpat_', 'sk-', 'pk_', 'ya29.', 'AIza', '1//', 'Bearer '];

function looksEncrypted(value: string): boolean {
  if (value.length < MIN_ENCRYPTED_LENGTH) return false;
  if (KNOWN_PLAINTEXT_PREFIXES.some(p => value.startsWith(p))) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(value);
}

async function main() {
  const isDryRun = !process.argv.includes('--execute');

  console.log('=== Token Encryption Migration ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'EXECUTE (will encrypt)'}`);
  console.log('');

  if (!isEncryptionConfigured()) {
    console.error('ERROR: API_KEY_ENCRYPTION_SECRET is not set in environment.');
    console.error('Generate one with: openssl rand -hex 32');
    process.exit(1);
  }

  console.log('Encryption configured: YES');
  console.log('');

  // Fetch all integrations
  const integrations = await db.select().from(apiIntegrations);
  console.log(`Found ${integrations.length} integration(s) in database.`);
  console.log('');

  let encryptedCount = 0;
  let skippedCount = 0;
  let nullCount = 0;

  for (const integration of integrations) {
    const id = integration.id;
    const provider = integration.provider;
    const updates: Record<string, string> = {};

    // Check accessToken
    if (integration.accessToken) {
      if (looksEncrypted(integration.accessToken)) {
        console.log(`  [${provider}] accessToken: already encrypted, skipping`);
        skippedCount++;
      } else {
        const encrypted = encryptApiKey(integration.accessToken);
        updates.accessToken = encrypted;
        console.log(`  [${provider}] accessToken: PLAINTEXT → will encrypt (${integration.accessToken.substring(0, 8)}...)`);
        encryptedCount++;
      }
    } else {
      nullCount++;
    }

    // Check refreshToken
    if (integration.refreshToken) {
      if (looksEncrypted(integration.refreshToken)) {
        console.log(`  [${provider}] refreshToken: already encrypted, skipping`);
        skippedCount++;
      } else {
        const encrypted = encryptApiKey(integration.refreshToken);
        updates.refreshToken = encrypted;
        console.log(`  [${provider}] refreshToken: PLAINTEXT → will encrypt (${integration.refreshToken.substring(0, 8)}...)`);
        encryptedCount++;
      }
    } else {
      nullCount++;
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      if (isDryRun) {
        console.log(`  [${provider}] Would update ${Object.keys(updates).length} field(s) [DRY RUN]`);
      } else {
        await db
          .update(apiIntegrations)
          .set(updates)
          .where(eq(apiIntegrations.id, id));
        console.log(`  [${provider}] Updated ${Object.keys(updates).length} field(s)`);
      }
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Encrypted: ${encryptedCount} field(s)`);
  console.log(`  Skipped (already encrypted): ${skippedCount} field(s)`);
  console.log(`  Null (no value): ${nullCount} field(s)`);

  if (isDryRun && encryptedCount > 0) {
    console.log('');
    console.log('To apply changes, run with --execute flag:');
    console.log('  npx tsx scripts/encrypt-existing-tokens.ts --execute');
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  pool.end();
  process.exit(1);
});
