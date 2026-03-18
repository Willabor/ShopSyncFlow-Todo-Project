/**
 * Test basic Google Ads account access
 */

import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

console.log('\n🧪 Testing Google Ads Account Access\n');

const credentials = {
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
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
    refresh_token: credentials.refresh_token,
  });

  console.log('✅ Client initialized');
  console.log(`\n⏳ Attempting to query customer account info...\n`);

  // Try a simple query to get account info
  const [account] = await customer.query(`
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone
    FROM customer
    LIMIT 1
  `);

  console.log('✅ SUCCESS! Account access works!\n');
  console.log('Account Details:');
  console.log(`  ID: ${account.customer.id}`);
  console.log(`  Name: ${account.customer.descriptive_name}`);
  console.log(`  Currency: ${account.customer.currency_code}`);
  console.log(`  Timezone: ${account.customer.time_zone}`);
  console.log('\n🎉 Your Google Ads API is properly configured!\n');

} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error('\nDetailed error:', error);

  console.error('\n⚠️  Possible issues:');
  console.error('1. Customer ID format - try removing dashes if your ID has them');
  console.error('2. Developer Token not approved - must have at least "Basic Access"');
  console.error('3. Account might be a Manager Account (MCC) - needs different handling');
  console.error('4. Refresh token might be invalid - try regenerating');
  console.error('\n📝 Next steps:');
  console.error('- Go to https://ads.google.com/ and verify your account ID in top-right');
  console.error('- Go to Tools → API Center and check Developer Token status');
  console.error('- Make sure the account has billing enabled\n');

  process.exit(1);
}
