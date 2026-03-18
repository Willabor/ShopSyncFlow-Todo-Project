/**
 * Inline token encryption script — runs inside the Docker container.
 * Usage: docker exec shopsyncflow-app node /app/scripts/encrypt-tokens-inline.js [--execute]
 */
const crypto = require('crypto');
const { Client } = require('pg');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const MIN_ENC_LEN = 44;
const PREFIXES = ['shpat_', 'sk-', 'pk_', 'ya29.', 'AIza', '1//', 'Bearer '];

const secret = process.env.API_KEY_ENCRYPTION_SECRET;
if (!secret) { console.error('ERROR: API_KEY_ENCRYPTION_SECRET not set'); process.exit(1); }
const key = Buffer.from(secret, 'hex');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function looksEncrypted(val) {
  if (val.length < MIN_ENC_LEN) return false;
  if (PREFIXES.some(p => val.startsWith(p))) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(val);
}

async function main() {
  const execute = process.argv.includes('--execute');
  console.log('=== Token Encryption Migration ===');
  console.log('Mode:', execute ? 'EXECUTE' : 'DRY RUN');

  const client = new Client({
    host: process.env.PGHOST || 'postgres16',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'shopsyncflow_db',
    user: process.env.PGUSER || 'shopsyncflow_user',
    password: process.env.PGPASSWORD,
  });
  await client.connect();

  const { rows } = await client.query('SELECT id, provider, access_token, refresh_token FROM api_integrations');
  console.log('Found', rows.length, 'integration(s)');

  let encrypted = 0, skipped = 0;

  for (const row of rows) {
    const updates = {};
    for (const field of ['access_token', 'refresh_token']) {
      const val = row[field];
      if (!val) continue;
      if (looksEncrypted(val)) { console.log('  [' + row.provider + '] ' + field + ': already encrypted'); skipped++; continue; }
      updates[field] = encrypt(val);
      console.log('  [' + row.provider + '] ' + field + ': ' + val.substring(0, 12) + '... -> ENCRYPTED');
      encrypted++;
    }

    if (Object.keys(updates).length > 0 && execute) {
      const setClauses = Object.keys(updates).map((k, i) => k + ' = $' + (i + 2)).join(', ');
      const values = [row.id, ...Object.values(updates)];
      await client.query('UPDATE api_integrations SET ' + setClauses + ' WHERE id = $1', values);
      console.log('  [' + row.provider + '] Updated');
    }
  }

  console.log('\n=== Summary ===');
  console.log('  Encrypted:', encrypted, 'field(s)');
  console.log('  Skipped:', skipped, 'field(s)');
  if (!execute && encrypted > 0) console.log('\nRun with --execute to apply changes.');

  await client.end();
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
