/**
 * Test Google Ads API Integration
 *
 * This script tests if the Google Ads API credentials are working
 * by fetching keyword metrics for a simple test keyword.
 */

import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from parent docker directory
dotenv.config({ path: join(__dirname, '../../.env') });

console.log('\n🧪 Testing Google Ads API Integration\n');
console.log('='.repeat(80));

// Check if all credentials are present
const credentials = {
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
};

console.log('\n📋 Checking Credentials:');
for (const [key, value] of Object.entries(credentials)) {
  if (value) {
    console.log(`  ✅ ${key}: ${value.substring(0, 20)}...`);
  } else {
    console.log(`  ❌ ${key}: MISSING`);
  }
}

if (Object.values(credentials).some(v => !v)) {
  console.error('\n❌ ERROR: Some credentials are missing!');
  console.error('Please check your .env file\n');
  process.exit(1);
}

console.log('\n' + '='.repeat(80));

try {
  // Initialize Google Ads client
  console.log('\n⏳ Initializing Google Ads API client...');

  const client = new GoogleAdsApi({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    developer_token: credentials.developer_token,
  });

  console.log('✅ Client initialized');

  const customer = client.Customer({
    customer_id: credentials.customer_id,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token: credentials.refresh_token,
  });

  console.log(`✅ MCC Manager: ${process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}`);
  console.log(`✅ Sub-Account: ${credentials.customer_id}`);

  // Test with a simple keyword
  console.log('\n⏳ Fetching keyword metrics for "nike shoes"...\n');
  console.log('='.repeat(80));

  const response = await customer.keywordPlanIdeas.generateKeywordIdeas({
    customer_id: credentials.customer_id,
    language: 'languageConstants/1000', // English
    geo_target_constants: ['geoTargetConstants/2840'], // United States
    keyword_plan_network: 'GOOGLE_SEARCH',
    keyword_seed: {
      keywords: ['nike shoes'],
    },
  });

  console.log(`\n✅ SUCCESS! Received ${response.length} keyword ideas\n`);
  console.log('Sample results:');
  console.log('='.repeat(80));

  // Show top 5 results
  response.slice(0, 5).forEach((idea, index) => {
    const keyword = idea.text || 'N/A';
    const searches = Number(idea.keyword_idea_metrics?.avg_monthly_searches || 0);
    const competition = idea.keyword_idea_metrics?.competition || 'UNSPECIFIED';

    console.log(`\n${index + 1}. "${keyword}"`);
    console.log(`   Monthly Searches: ${searches.toLocaleString()}`);
    console.log(`   Competition: ${competition}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('\n🎉 Google Ads API is working perfectly!');
  console.log('\n✨ You now have access to REAL keyword search volumes!');
  console.log('   - No more rate limiting issues');
  console.log('   - Actual monthly search numbers (not 0-100 scale)');
  console.log('   - Competition levels');
  console.log('   - 10,000 requests per day\n');

} catch (error) {
  console.error('\n' + '='.repeat(80));
  console.error('\n❌ ERROR:', error.message);
  console.error('\nCommon issues:');
  console.error('1. Developer Token not approved (check Google Ads API Center)');
  console.error('2. Refresh token expired (regenerate using generate-google-ads-token.js)');
  console.error('3. Customer ID incorrect (check Google Ads account)');
  console.error('4. API not enabled (enable in Google Cloud Console)');
  console.error('\nFull error:', error);
  console.error('\n' + '='.repeat(80) + '\n');
  process.exit(1);
}
