/**
 * Test script for AI size chart analyzer
 *
 * This tests the AI analysis service with a real size chart image
 */

import { analyzeSizeChartImage } from './dist/services/size-chart-ai-analyzer.service.js';
import fs from 'fs';
import path from 'path';

async function testAIAnalyzer() {
  console.log('🧪 Testing AI Size Chart Analyzer\n');
  console.log('=' .repeat(70));

  // Check if test image exists
  const testImagePath = process.argv[2];

  if (!testImagePath) {
    console.error('❌ Error: Please provide path to test size chart image');
    console.log('\nUsage: node test-ai-analyzer.js <path-to-image>');
    console.log('Example: node test-ai-analyzer.js /tmp/size-chart.jpg');
    process.exit(1);
  }

  if (!fs.existsSync(testImagePath)) {
    console.error(`❌ Error: Image not found at: ${testImagePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(testImagePath);
  console.log(`\n📁 Test Image: ${testImagePath}`);
  console.log(`📏 File Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`📅 Modified: ${stats.mtime.toLocaleString()}\n`);

  // Test different categories
  const categoriesToTest = ['Tops', 'Bottoms', 'Outerwear'];

  for (const category of categoriesToTest) {
    console.log('─'.repeat(70));
    console.log(`\n🏷️  Testing Category: ${category}\n`);

    const startTime = Date.now();

    try {
      const result = await analyzeSizeChartImage(testImagePath, category);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`⏱️  Analysis Duration: ${duration}s\n`);

      if (result.success) {
        console.log('✅ AI Analysis: SUCCESS\n');

        // Show parsed data
        console.log('📊 Extracted Data:');
        console.log('-'.repeat(70));

        if (result.rawAIResponse) {
          const data = result.rawAIResponse;

          console.log(`\n🔢 Sizes Found: ${data.sizes?.length || 0}`);
          if (data.sizes) {
            console.log(`   ${data.sizes.join(' | ')}`);
          }

          console.log(`\n📏 Measurements Found: ${Object.keys(data.measurements || {}).length}`);
          if (data.measurements) {
            for (const [measurementType, values] of Object.entries(data.measurements)) {
              console.log(`\n   ${measurementType.toUpperCase()}:`);
              console.log(`   ${values.join(' | ')}`);
            }
          }

          console.log(`\n📐 Unit: ${data.unit || 'N/A'}`);
          console.log(`💪 Fit Guidance: ${data.fitGuidance || 'None'}`);
          console.log(`🎯 Confidence: ${((data.confidence || 0) * 100).toFixed(1)}%`);

          if (data.warnings && data.warnings.length > 0) {
            console.log(`\n⚠️  Warnings:`);
            data.warnings.forEach((warning, i) => {
              console.log(`   ${i + 1}. ${warning}`);
            });
          }
        }

        // Show generated HTML
        if (result.parsedTables) {
          console.log('\n\n📝 Generated HTML Table:');
          console.log('-'.repeat(70));
          const tables = Object.entries(result.parsedTables);
          if (tables.length > 0) {
            console.log(tables[0][1]);
          }
        }

      } else {
        console.log('❌ AI Analysis: FAILED\n');
        console.log(`Error: ${result.error}`);

        if (result.rawAIResponse) {
          console.log('\n📄 Raw AI Response (first 500 chars):');
          console.log('-'.repeat(70));
          const response = typeof result.rawAIResponse === 'string'
            ? result.rawAIResponse
            : JSON.stringify(result.rawAIResponse, null, 2);
          console.log(response.substring(0, 500));
        }
      }

    } catch (error) {
      console.log('❌ Exception during analysis:');
      console.error(error.message);
      console.error(error.stack);
    }

    console.log('\n');
  }

  console.log('=' .repeat(70));
  console.log('\n✅ Test Complete\n');
}

// Run the test
testAIAnalyzer().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
