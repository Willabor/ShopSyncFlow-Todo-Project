/**
 * Simple test for AI size chart analyzer
 */

import 'dotenv/config'; // Load .env file
import { analyzeSizeChartImage } from './server/services/size-chart-ai-analyzer.service';

const testImagePath = process.argv[2] || '/tmp/test-size-chart.jpg';

console.log('🧪 Testing AI Size Chart Analyzer');
console.log('='.repeat(70));
console.log(`\n📁 Image: ${testImagePath}\n`);

analyzeSizeChartImage(testImagePath, 'Bottoms')
  .then(result => {
    console.log('\n' + '='.repeat(70));
    console.log('RESULT:');
    console.log('='.repeat(70));
    console.log(JSON.stringify(result, null, 2));
    console.log('\n');

    if (result.success) {
      console.log('✅ SUCCESS - AI extracted data from size chart');
    } else {
      console.log('❌ FAILED - ' + result.error);
    }
  })
  .catch(error => {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  });
