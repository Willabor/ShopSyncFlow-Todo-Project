#!/usr/bin/env tsx
/**
 * Google Ads OAuth Token Generator
 *
 * This script helps you get a new Google Ads refresh token without using OAuth Playground.
 * It runs a local server to handle the OAuth callback.
 */

import * as http from 'http';
import * as url from 'url';
import * as dotenv from 'dotenv';
import open from 'open';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:3333/oauth2callback';
const PORT = 3333;

console.log('🔐 Google Ads OAuth Token Generator\n');

// Check if credentials are present
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing Google Ads credentials in .env file');
  console.error('   Please ensure GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET are set');
  process.exit(1);
}

console.log('✓ Credentials loaded from .env\n');

// Step 1: Build authorization URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
authUrl.searchParams.append('client_id', CLIENT_ID);
authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
authUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/adwords');
authUrl.searchParams.append('response_type', 'code');
authUrl.searchParams.append('access_type', 'offline');
authUrl.searchParams.append('prompt', 'consent');

console.log('📝 Step 1: Starting local OAuth server on http://localhost:3333\n');

// Step 2: Create local server to receive callback
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url!, true);

  if (parsedUrl.pathname === '/oauth2callback') {
    const code = parsedUrl.query.code as string;
    const error = parsedUrl.query.error as string;

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #d32f2f;">❌ Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      server.close();
      console.error(`\n❌ Authorization failed: ${error}`);
      process.exit(1);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #d32f2f;">❌ No Authorization Code</h1>
            <p>No authorization code received from Google.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
      server.close();
      console.error('\n❌ No authorization code received');
      process.exit(1);
      return;
    }

    console.log('✓ Authorization code received\n');
    console.log('📝 Step 3: Exchanging authorization code for tokens...\n');

    // Step 3: Exchange code for tokens
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${JSON.stringify(errorData)}`);
      }

      const tokens = await tokenResponse.json();

      // Success!
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #4caf50;">✅ Success!</h1>
            <p style="font-size: 18px;">Your refresh token has been generated.</p>
            <p style="color: #666;">Check your terminal for the token.</p>
            <p style="margin-top: 40px;">You can close this window now.</p>
          </body>
        </html>
      `);

      console.log('✅ Successfully obtained tokens!\n');
      console.log('━'.repeat(80));
      console.log('📋 YOUR NEW REFRESH TOKEN:');
      console.log('━'.repeat(80));
      console.log(tokens.refresh_token);
      console.log('━'.repeat(80));
      console.log('\n📝 Next steps:');
      console.log('   1. Copy the token above');
      console.log('   2. Update your .env file:');
      console.log(`      GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('   3. Restart your dev server');
      console.log('   4. Test with: npm run test:google-ads\n');

      server.close();
      process.exit(0);

    } catch (error: any) {
      console.error('❌ Error exchanging code for tokens:', error.message);

      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #d32f2f;">❌ Token Exchange Failed</h1>
            <p>${error.message}</p>
            <p>Check your terminal for details.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);

      server.close();
      process.exit(1);
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, async () => {
  console.log(`✓ OAuth server listening on http://localhost:${PORT}\n`);
  console.log('📝 Step 2: Opening browser for authorization...\n');
  console.log('   If the browser doesn\'t open automatically, visit:');
  console.log(`   ${authUrl.toString()}\n`);

  // Open browser automatically
  try {
    await open(authUrl.toString());
    console.log('✓ Browser opened\n');
    console.log('⏳ Waiting for authorization...\n');
    console.log('   Please sign in with your Google account and click "Allow"\n');
  } catch (error) {
    console.log('⚠️  Could not open browser automatically');
    console.log('   Please manually visit the URL above\n');
  }
});

// Handle errors
server.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('   Please close any other applications using this port and try again');
  } else {
    console.error('❌ Server error:', error.message);
  }
  process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Authorization cancelled by user');
  server.close();
  process.exit(0);
});
