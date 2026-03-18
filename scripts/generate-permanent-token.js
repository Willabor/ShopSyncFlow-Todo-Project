#!/usr/bin/env node

/**
 * Google Ads API - Permanent Refresh Token Generator
 *
 * Generates a PERMANENT refresh token using your own OAuth2 credentials.
 * This token will NEVER expire (unlike OAuth Playground tokens that expire in 7 days).
 *
 * Usage:
 *   node scripts/generate-permanent-token.js
 */

import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from PROJECT .env (not parent directory)
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

// OAuth2 Configuration
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/adwords'];

console.log('\n🔐 Google Ads API - Permanent Token Generator\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Validate environment variables
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: Missing Google Ads credentials in .env file');
  console.error(`   Looking in: ${envPath}`);
  console.error('   Required: GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET\n');
  process.exit(1);
}

console.log('✓ Client ID found:', CLIENT_ID);
console.log('✓ Client Secret found:', CLIENT_SECRET.substring(0, 20) + '...');
console.log('✓ Using .env file:', envPath, '\n');

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Generate authorization URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Get refresh token
  scope: SCOPES,
  prompt: 'consent' // Force consent screen to ensure refresh token
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📋 STEP 1: Authorize Access\n');
console.log('Opening authorization URL in your browser...\n');
console.log('If the browser doesn\'t open automatically, copy this URL:\n');
console.log('\x1b[36m%s\x1b[0m\n', authUrl);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Open browser automatically
open(authUrl);

// Create HTTP server to receive callback
const server = http.createServer(async (req, res) => {
  try {
    const queryObject = url.parse(req.url, true).query;

    if (req.url.indexOf('/oauth2callback') > -1) {
      const code = queryObject.code;

      if (!code) {
        res.end('❌ Error: No authorization code received');
        return;
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📋 STEP 2: Exchanging code for tokens...\n');

      // Exchange authorization code for tokens
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        console.error('❌ Error: No refresh token received!');
        console.error('   This might happen if you\'ve already authorized this app.');
        console.error('   Try revoking access at: https://myaccount.google.com/permissions');
        console.error('   Then run this script again.\n');
        res.end('❌ Error: No refresh token received. Check console for details.');
        server.close();
        process.exit(1);
      }

      console.log('✅ Tokens received successfully!\n');
      console.log('Token Details:');
      console.log('  • Access Token:', tokens.access_token ? '✓ Generated' : '✗ Missing');
      console.log('  • Refresh Token:', tokens.refresh_token ? '✓ Generated (PERMANENT)' : '✗ Missing');
      console.log('  • Expires In:', tokens.expiry_date ? `${Math.floor((tokens.expiry_date - Date.now()) / 1000 / 60)} minutes` : 'Unknown');
      console.log('  • Token Type:', tokens.token_type || 'Unknown');
      console.log('  • Scope:', tokens.scope || 'Unknown\n');

      // Update .env file
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📋 STEP 3: Updating .env file...\n');

      let envContent = fs.readFileSync(envPath, 'utf8');

      // Replace or add refresh token
      const tokenLine = `GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`;

      if (envContent.includes('GOOGLE_ADS_REFRESH_TOKEN=')) {
        envContent = envContent.replace(
          /GOOGLE_ADS_REFRESH_TOKEN=.*/,
          tokenLine
        );
        console.log('✓ Updated existing GOOGLE_ADS_REFRESH_TOKEN in .env');
      } else {
        envContent += `\n${tokenLine}\n`;
        console.log('✓ Added GOOGLE_ADS_REFRESH_TOKEN to .env');
      }

      fs.writeFileSync(envPath, envContent);

      console.log(`✓ .env file saved: ${envPath}\n`);

      // Success response
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              max-width: 600px;
              margin: 100px auto;
              padding: 40px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              border-radius: 10px;
            }
            h1 { font-size: 48px; margin: 0 0 20px 0; }
            p { font-size: 18px; line-height: 1.6; }
            .token { background: rgba(0,0,0,0.3); padding: 15px; border-radius: 5px; margin: 20px 0; word-break: break-all; font-family: monospace; font-size: 14px; }
            .success { color: #4ade80; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>✅ Success!</h1>
          <p class="success">Google Ads API token generated successfully!</p>
          <p>Your permanent refresh token has been saved to .env</p>
          <div class="token">${tokens.refresh_token}</div>
          <p>This token will <strong>NEVER expire</strong> unless you revoke it.</p>
          <p>You can close this window and return to the terminal.</p>
        </body>
        </html>
      `);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🎉 SUCCESS! Permanent refresh token generated!\n');
      console.log('Your refresh token has been saved to .env file.\n');
      console.log('Next steps:');
      console.log('  1. Restart your Docker container:');
      console.log('     cd /volume1/docker/ShopSyncFlow-Todo-Project');
      console.log('     docker-compose up -d --force-recreate');
      console.log('  2. Test the Keyword Research feature');
      console.log('  3. This token will NEVER expire (unless you revoke it)\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Close server after 2 seconds
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 2000);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.end('❌ Error: ' + error.message);
    server.close();
    process.exit(1);
  }
});

// Start server
server.listen(3000, () => {
  console.log('🌐 Local server started on http://localhost:3000');
  console.log('⏳ Waiting for authorization...\n');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('\n❌ Error: Port 3000 is already in use');
    console.error('   Please close any applications using port 3000 and try again\n');
  } else {
    console.error('\n❌ Server error:', error.message, '\n');
  }
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n❌ Process interrupted. Exiting...\n');
  server.close();
  process.exit(0);
});
