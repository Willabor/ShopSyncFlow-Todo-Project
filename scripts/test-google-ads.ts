#!/usr/bin/env tsx
/**
 * Test Google Ads API Connection
 *
 * This script tests if your Google Ads OAuth credentials are working.
 * Run with: npm run test:google-ads
 */

import { GoogleAdsApi } from 'google-ads-api';
import * as dotenv from 'dotenv';

dotenv.config();

async function testGoogleAdsConnection() {
  console.log('🔍 Testing Google Ads API Connection...\n');

  // Check if all required env vars are present
  const requiredVars = [
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    'GOOGLE_ADS_CUSTOMER_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
  }

  console.log('✓ All environment variables present\n');

  // Initialize Google Ads client
  try {
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    });

    console.log('✓ Google Ads API client initialized\n');

    // Get customer account
    const customer = client.Customer({
      customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    });

    console.log('✓ Customer client created\n');
    console.log('📊 Account Details:');
    console.log(`   Manager Account ID: ${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}`);
    console.log(`   Customer Account ID: ${process.env.GOOGLE_ADS_CUSTOMER_ID}\n`);

    // Test API call - fetch campaign info
    console.log('🔄 Testing API call: Fetching campaigns...\n');

    const campaigns = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status
      FROM campaign
      LIMIT 5
    `);

    console.log('✅ API call successful!');
    console.log(`✅ Found ${campaigns.length} campaign(s)\n`);

    if (campaigns.length > 0) {
      console.log('📋 Sample campaigns:');
      campaigns.forEach((campaign: any, index: number) => {
        console.log(`   ${index + 1}. ${campaign.campaign.name} (ID: ${campaign.campaign.id}, Status: ${campaign.campaign.status})`);
      });
    } else {
      console.log('ℹ️  No campaigns found in this account (this is okay)');
    }

    console.log('\n✅ All tests passed! Your Google Ads credentials are working correctly.');
    console.log('✅ Keyword research features should now work.\n');

  } catch (error: any) {
    console.error('\n❌ Google Ads API Error:\n');

    if (error.message?.includes('invalid_grant')) {
      console.error('🔴 Error: INVALID_GRANT');
      console.error('   Your refresh token has expired or is invalid.\n');
      console.error('📝 How to fix:');
      console.error('   1. Go to: https://developers.google.com/oauthplayground/');
      console.error('   2. Click the gear icon ⚙️ and enter your OAuth credentials');
      console.error('   3. Authorize "Google Ads API v18" scope');
      console.error('   4. Get a new refresh token');
      console.error('   5. Update GOOGLE_ADS_REFRESH_TOKEN in .env file\n');
    } else if (error.message?.includes('PERMISSION_DENIED')) {
      console.error('🔴 Error: PERMISSION_DENIED');
      console.error('   Your account does not have access to the Google Ads API.\n');
      console.error('📝 How to fix:');
      console.error('   1. Ensure you have a Google Ads account');
      console.error('   2. Link your developer token to your MCC account');
      console.error('   3. Verify customer IDs are correct\n');
    } else {
      console.error('🔴 Unexpected error:');
      console.error(error.message || error);
      console.error('\n📝 Check your credentials in .env file\n');
    }

    process.exit(1);
  }
}

// Run the test
testGoogleAdsConnection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
