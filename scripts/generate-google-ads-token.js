/**
 * Google Ads API - Generate Refresh Token
 *
 * This script helps you generate a refresh token for Google Ads API.
 * Run this ONCE to get your refresh token, then add it to .env file.
 *
 * Usage:
 *   node scripts/generate-google-ads-token.js
 */

import { google } from 'googleapis';
import readline from 'readline';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from parent docker directory
dotenv.config({ path: join(__dirname, '../../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob' // Special redirect URI for CLI apps
);

// Scopes needed for Google Ads API
const SCOPES = ['https://www.googleapis.com/auth/adwords'];

console.log('\n🔐 Google Ads API - Refresh Token Generator\n');
console.log('Step 1: Visit this URL to authorize the application:');
console.log('='.repeat(80));

// Generate the authorization URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Force to get refresh token
});

console.log(`\n${authUrl}\n`);
console.log('='.repeat(80));
console.log('\nStep 2: After authorizing, you will receive an authorization code.');
console.log('Step 3: Copy that code and paste it here:\n');

rl.question('Enter authorization code: ', async (code) => {
  try {
    console.log('\n⏳ Exchanging authorization code for tokens...\n');

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log('✅ SUCCESS! Your refresh token:\n');
    console.log('='.repeat(80));
    console.log(`\n${tokens.refresh_token}\n`);
    console.log('='.repeat(80));
    console.log('\n📝 Next steps:');
    console.log('1. Copy the refresh token above');
    console.log('2. Add it to your .env file:');
    console.log(`   GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('3. Restart your application\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure you:');
    console.error('1. Copied the ENTIRE authorization code');
    console.error('2. Used the code immediately (they expire quickly)');
    console.error('3. Have the correct Client ID and Client Secret in .env\n');
  }

  rl.close();
});
