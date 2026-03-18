/**
 * Check if account has Keyword Planner access
 */

import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

console.log('\n🔍 Checking Keyword Planner Access\n');

const credentials = {
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
  login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
};

try {
  const client = new GoogleAdsApi({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    developer_token: credentials.developer_token,
  });

  const customer = client.Customer({
    customer_id: credentials.customer_id,
    login_customer_id: credentials.login_customer_id,
    refresh_token: credentials.refresh_token,
  });

  console.log('✅ Client initialized');
  console.log(`   MCC: ${credentials.login_customer_id}`);
  console.log(`   Sub-Account: ${credentials.customer_id}\n`);

  // Check account info
  console.log('⏳ Querying account information...\n');

  const [account] = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.manager,
      customer.test_account,
      customer.status
    FROM customer
    LIMIT 1
  `);

  console.log('Account Details:');
  console.log(`  Name: ${account.customer.descriptive_name}`);
  console.log(`  ID: ${account.customer.id}`);
  console.log(`  Currency: ${account.customer.currency_code}`);
  console.log(`  Is Manager Account: ${account.customer.manager}`);
  console.log(`  Is Test Account: ${account.customer.test_account}`);
  console.log(`  Status: ${account.customer.status}`);

  if (account.customer.manager) {
    console.log('\n⚠️  WARNING: This is a Manager Account (MCC)!');
    console.log('   Keyword Planner needs a regular client account, not a manager account.');
    console.log('   You need to use the Nexus Clothing sub-account ID: 2980861126');
  }

  if (account.customer.test_account) {
    console.log('\n⚠️  WARNING: This is a TEST account!');
    console.log('   Test accounts may have limited API access.');
  }

  console.log('\n⏳ Trying a simple keyword seed query...\n');

  // Try the simplest possible keyword ideas query
  const response = await customer.keywordPlanIdeas.generateKeywordIdeas({
    customer_id: credentials.customer_id,
    language: 'languageConstants/1000',
    geo_target_constants: ['geoTargetConstants/2840'],
    keyword_plan_network: 'GOOGLE_SEARCH',
    keyword_seed: {
      keywords: ['shoes'],
    },
  });

  console.log(`✅ SUCCESS! Received ${response.length} keyword ideas`);
  console.log('\n🎉 Keyword Planner API is working!\n');

} catch (error) {
  console.error('\n❌ ERROR:', error.message);

  if (error.message && error.message.includes('invalid value')) {
    console.error('\n💡 Possible reasons:');
    console.error('1. Account doesn\'t have billing set up (must have payment method)');
    console.error('2. Account needs to have run at least one campaign');
    console.error('3. Account must have served impressions');
    console.error('4. Using wrong account ID (check both manager & sub-account)');
    console.error('\n📝 To fix:');
    console.error('- Log in to https://ads.google.com/');
    console.error('- Switch to Nexus Clothing account (298-086-1126)');
    console.error('- Check if billing is set up under "Billing & payments"');
    console.error('- Check if there are any active or past campaigns');
  }

  console.error('\nFull error:', error);
  process.exit(1);
}
