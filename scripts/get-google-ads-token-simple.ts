#!/usr/bin/env tsx
/**
 * Google Ads OAuth Token Generator (Simple Version)
 *
 * This version uses "out of band" (urn:ietf:wg:oauth:2.0:oob) redirect URI
 * which doesn't require any Google Cloud Console configuration.
 *
 * You'll copy the authorization code from your browser and paste it here.
 */

import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET!;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Special "out of band" URI - no config needed!

console.log('🔐 Google Ads OAuth Token Generator (Simple Version)\n');

// Check if credentials are present
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing Google Ads credentials in .env file');
  console.error('   Please ensure GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET are set');
  process.exit(1);
}

console.log('✓ Credentials loaded from .env\n');

// Build authorization URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
authUrl.searchParams.append('client_id', CLIENT_ID);
authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
authUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/adwords');
authUrl.searchParams.append('response_type', 'code');
authUrl.searchParams.append('access_type', 'offline');
authUrl.searchParams.append('prompt', 'consent');

console.log('━'.repeat(80));
console.log('📋 STEP 1: Visit this URL in your browser');
console.log('━'.repeat(80));
console.log(authUrl.toString());
console.log('━'.repeat(80));
console.log('\n📝 Instructions:');
console.log('   1. Copy the URL above');
console.log('   2. Open it in your browser');
console.log('   3. Sign in with your Google account (Kpgent@gmail.com)');
console.log('   4. Click "Allow" to grant permissions');
console.log('   5. Google will show you an authorization code');
console.log('   6. Copy the entire code');
console.log('   7. Paste it here when prompted\n');

// Create readline interface to get user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('📋 Paste the authorization code here: ', async (code) => {
  rl.close();

  const trimmedCode = code.trim();

  if (!trimmedCode) {
    console.error('\n❌ No authorization code provided');
    process.exit(1);
  }

  console.log('\n✓ Authorization code received');
  console.log('📝 Step 2: Exchanging authorization code for tokens...\n');

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: trimmedCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      throw new Error(`Token exchange failed: ${JSON.stringify(errorData, null, 2)}`);
    }

    const tokens = await tokenResponse.json();

    // Success!
    console.log('✅ Successfully obtained tokens!\n');
    console.log('━'.repeat(80));
    console.log('📋 YOUR NEW REFRESH TOKEN:');
    console.log('━'.repeat(80));
    console.log(tokens.refresh_token);
    console.log('━'.repeat(80));
    console.log('\n📝 Next steps:');
    console.log('   1. Copy the token above');
    console.log('   2. Edit your .env file:');
    console.log('      nano /volume1/docker/ShopSyncFlow-Todo-Project/.env');
    console.log('   3. Find line 49 (GOOGLE_ADS_REFRESH_TOKEN)');
    console.log('   4. Replace the old token with the new one');
    console.log('   5. Save the file (Ctrl+O, Enter, Ctrl+X)');
    console.log('   6. Test with: npm run test:google-ads');
    console.log('   7. Restart dev server: npm run dev\n');

    process.exit(0);

  } catch (error: any) {
    console.error('❌ Error exchanging code for tokens:', error.message);
    console.error('\nPossible issues:');
    console.error('   - Authorization code was copied incorrectly');
    console.error('   - Authorization code has expired (they expire after a few minutes)');
    console.error('   - Network connectivity issue');
    console.error('\nTry running the script again and make sure to:');
    console.error('   1. Copy the ENTIRE authorization code (no extra spaces)');
    console.error('   2. Paste it immediately (codes expire quickly)\n');
    process.exit(1);
  }
});
