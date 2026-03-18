/**
 * Google Ads API - Generate Refresh Token from Authorization Code
 *
 * Usage:
 *   node scripts/get-refresh-token.js YOUR_AUTH_CODE
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from parent docker directory
dotenv.config({ path: join(__dirname, '../../.env') });

const authCode = process.argv[2];

if (!authCode) {
  console.error('❌ Error: Authorization code is required');
  console.error('Usage: node scripts/get-refresh-token.js YOUR_AUTH_CODE');
  process.exit(1);
}

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

console.log('\n⏳ Exchanging authorization code for tokens...\n');

try {
  const { tokens } = await oauth2Client.getToken(authCode);

  console.log('✅ SUCCESS! Your refresh token:\n');
  console.log('='.repeat(80));
  console.log(`\n${tokens.refresh_token}\n`);
  console.log('='.repeat(80));
  console.log('\n📝 Add this to your .env file:');
  console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}\n`);

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('\nMake sure you:');
  console.error('1. Copied the ENTIRE authorization code');
  console.error('2. Used the code immediately (they expire quickly)');
  console.error('3. Have the correct Client ID and Client Secret in .env\n');
  process.exit(1);
}
