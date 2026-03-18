import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';

dotenv.config({ path: '/volume1/docker/ShopSyncFlow-Todo-Project/.env' });

const clientConfig = {
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
};

const customerConfig = {
  customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
  login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
};

const client = new GoogleAdsApi(clientConfig);
const customer = client.Customer(customerConfig);

const keywords = [
  'hasta muerte elite',
  'hasta muerte',
  'hasta muerte tshirts'
];

console.log('Testing keywords with Google Ads API:');
console.log('='.repeat(60));

const response = await customer.keywordPlanIdeas.generateKeywordIdeas({
  customer_id: customerConfig.customer_id,
  language: 'languageConstants/1000',
  geo_target_constants: ['geoTargetConstants/2840'],
  keyword_plan_network: 'GOOGLE_SEARCH',
  keyword_seed: { keywords },
});

console.log('\nReceived ' + response.length + ' keyword ideas\n');
console.log('Results:');
console.log('='.repeat(60));

response.forEach((idea, i) => {
  const keyword = idea.text || '';
  const monthlySearches = Number(idea.keyword_idea_metrics?.avg_monthly_searches || 0);
  const competition = idea.keyword_idea_metrics?.competition || 'UNSPECIFIED';
  const competitionIndex = Number(idea.keyword_idea_metrics?.competition_index || 0);
  const lowBid = Number(idea.keyword_idea_metrics?.low_top_of_page_bid_micros || 0) / 1000000;
  const highBid = Number(idea.keyword_idea_metrics?.high_top_of_page_bid_micros || 0) / 1000000;

  console.log((i+1) + '. "' + keyword + '"');
  console.log('   Monthly Searches: ' + monthlySearches.toLocaleString());
  console.log('   Competition: ' + competition + ' (' + competitionIndex + '/100)');
  console.log('   Bid Range: $' + lowBid.toFixed(2) + ' - $' + highBid.toFixed(2));
  console.log('');
});
