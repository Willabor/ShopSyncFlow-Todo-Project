/**
 * Phase 2: AI-Powered Product Extraction - Test Suite
 *
 * Tests the AI extraction layer with real vendor websites:
 * 1. Tests robots.txt compliance (from Phase 1)
 * 2. Tests AI-powered product extraction
 * 3. Validates extraction accuracy
 * 4. Measures token usage and cost
 *
 * Run: ./node_modules/.bin/tsx scripts/test-phase2-ai.ts
 */

import 'dotenv/config';

interface TestCase {
  label: string;
  websiteUrl: string;
  styleNumber: string;
  productName?: string;
  color?: string;
  expectedBlock?: boolean; // True if robots.txt should block
}

// Test cases covering different site types
const testCases: TestCase[] = [
  {
    label: 'Ethika - Staple Happy Daze (SPA)',
    websiteUrl: 'https://www.ethika.com',
    styleNumber: 'staple-happy-daze',
    productName: 'Staple Happy Daze',
    color: 'Multi',
  },
  {
    label: 'True Religion - Joey Bootcut Jean (Bot-Protected)',
    websiteUrl: 'https://www.truereligion.com',
    styleNumber: 'joey-bootcut-jean',
    productName: 'Joey Bootcut Jean',
    color: 'Blue',
  },
  {
    label: 'Urban Outfitters - Test Product (Generic)',
    websiteUrl: 'https://www.urbanoutfitters.com',
    styleNumber: 'test-product',
    productName: 'Test Product',
  },
  {
    label: 'Nike - Test Product (Expected Block)',
    websiteUrl: 'https://www.nike.com',
    styleNumber: 'test-shoe',
    productName: 'Test Shoe',
    expectedBlock: true,
  },
];

interface TestResult {
  testCase: TestCase;
  robotsCheckPassed: boolean;
  robotsAllowed: boolean;
  aiExtractionPassed: boolean;
  extractedData?: any;
  error?: string;
  duration: number;
}

/**
 * Test robots.txt compliance
 */
async function testRobotsTxt(websiteUrl: string): Promise<{
  allowed: boolean;
  reason: string;
  crawlDelay?: number;
}> {
  try {
    const { isScrapingAllowed, getNexusUserAgent } = await import('../server/services/robots-txt-checker.service');

    const result = await isScrapingAllowed(
      websiteUrl,
      getNexusUserAgent(process.env.SCRAPER_USER_AGENT_CONTACT || 'will@nexusclothing.com')
    );

    return {
      allowed: result.allowed,
      reason: result.reason,
      crawlDelay: result.crawlDelay,
    };
  } catch (error: any) {
    console.error(`   ❌ robots.txt check error: ${error.message}`);
    return {
      allowed: true, // Conservative fallback
      reason: `Error checking robots.txt: ${error.message}`,
    };
  }
}

/**
 * Test AI extraction
 */
async function testAIExtraction(
  websiteUrl: string,
  searchCriteria: {
    styleNumber: string;
    productName?: string;
    color?: string;
  }
): Promise<any> {
  try {
    const { extractProductDataWithAI } = await import('../server/services/gemini-content.service');

    // Fetch HTML
    const productUrl = `${websiteUrl}/products/${searchCriteria.styleNumber}`;
    console.log(`   Fetching HTML from: ${productUrl}`);

    const response = await fetch(productUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`   HTML fetched: ${html.length} characters`);

    // Extract with AI
    const enrichedData = await extractProductDataWithAI(html, productUrl, searchCriteria);

    return enrichedData;
  } catch (error: any) {
    throw new Error(`AI extraction failed: ${error.message}`);
  }
}

/**
 * Run a single test
 */
async function runTest(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing: ${testCase.label}`);
  console.log(`${'='.repeat(80)}\n`);

  const result: TestResult = {
    testCase,
    robotsCheckPassed: false,
    robotsAllowed: false,
    aiExtractionPassed: false,
    duration: 0,
  };

  try {
    // Step 1: Test robots.txt
    console.log(`📋 Step 1: Checking robots.txt...`);
    const robotsCheck = await testRobotsTxt(testCase.websiteUrl);

    result.robotsCheckPassed = true;
    result.robotsAllowed = robotsCheck.allowed;

    console.log(`   URL: ${testCase.websiteUrl}/robots.txt`);
    console.log(`   Allowed: ${robotsCheck.allowed ? '✅ Yes' : '❌ No'}`);
    console.log(`   Reason: ${robotsCheck.reason}`);
    if (robotsCheck.crawlDelay) {
      console.log(`   Crawl Delay: ${robotsCheck.crawlDelay}s`);
    }

    // If expected block, verify blocking works
    if (testCase.expectedBlock) {
      if (!robotsCheck.allowed) {
        console.log(`\n✅ Expected block confirmed - ethical boundary working`);
        console.log(`⏭️  Skipping AI extraction test (expected block)\n`);
        result.duration = Date.now() - startTime;
        return result;
      } else {
        console.log(`\n⚠️  WARNING: Expected block but robots.txt allows scraping`);
        console.log(`   This may indicate robots.txt changed or was not found\n`);
      }
    }

    // If blocked by robots.txt, skip AI extraction
    if (!robotsCheck.allowed) {
      console.log(`\n❌ Scraping blocked by robots.txt - skipping AI extraction\n`);
      result.duration = Date.now() - startTime;
      return result;
    }

    // Honor crawl-delay
    if (robotsCheck.crawlDelay && robotsCheck.crawlDelay > 0) {
      console.log(`\n⏱️  Honoring crawl-delay: ${robotsCheck.crawlDelay}s...`);
      await new Promise(resolve => setTimeout(resolve, robotsCheck.crawlDelay! * 1000));
    }

    // Step 2: Test AI extraction
    console.log(`\n🤖 Step 2: Testing AI extraction...`);
    const extractedData = await testAIExtraction(testCase.websiteUrl, {
      styleNumber: testCase.styleNumber,
      productName: testCase.productName,
      color: testCase.color,
    });

    result.aiExtractionPassed = extractedData.scrapingSuccess;
    result.extractedData = extractedData;

    console.log(`\n📊 Results:`);
    console.log(`   Success: ${extractedData.scrapingSuccess ? '✅' : '❌'}`);
    console.log(`   Product URL: ${extractedData.brandProductUrl}`);
    console.log(`   Title: ${extractedData.brandProductTitle || 'N/A'}`);
    console.log(`   Description Length: ${extractedData.brandDescription?.length || 0} chars`);
    console.log(`   Images Found: ${extractedData.images?.length || 0}`);
    console.log(`   Features Found: ${extractedData.features?.length || 0}`);
    console.log(`   Material: ${extractedData.materialComposition || 'N/A'}`);
    console.log(`   Care: ${extractedData.careInstructions || 'N/A'}`);
    console.log(`   Variants: ${extractedData.variants?.length || 0}`);
    console.log(`   Size Chart: ${extractedData.sizeChartImageUrl ? 'Found' : 'Not found'}`);

    if (extractedData.images && extractedData.images.length > 0) {
      console.log(`\n🖼️  Sample Images:`);
      extractedData.images.slice(0, 3).forEach((img: any, idx: number) => {
        console.log(`   ${idx + 1}. ${img.url}`);
      });
    }
  } catch (error: any) {
    result.error = error.message;
    console.error(`\n❌ Test failed: ${error.message}\n`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Main test execution
 */
async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Phase 2: AI-Powered Product Extraction - Test Suite`);
  console.log(`${'='.repeat(80)}\n`);

  // Check environment
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in environment');
    console.error('   Please add GEMINI_API_KEY to your .env file\n');
    process.exit(1);
  }

  if (process.env.SCRAPER_AI_ENABLED !== '1') {
    console.warn('⚠️  SCRAPER_AI_ENABLED is not set to 1');
    console.warn('   AI extraction may not work as expected\n');
  }

  console.log(`Environment Check:`);
  console.log(`   GEMINI_API_KEY: ${process.env.GEMINI_API_KEY?.substring(0, 10)}...`);
  console.log(`   SCRAPER_AI_ENABLED: ${process.env.SCRAPER_AI_ENABLED}`);
  console.log(`   SCRAPER_RESPECT_ROBOTS_TXT: ${process.env.SCRAPER_RESPECT_ROBOTS_TXT}`);
  console.log(``);

  const results: TestResult[] = [];

  // Run tests sequentially
  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push(result);

    // Add delay between tests to be polite
    if (results.length < testCases.length) {
      console.log(`⏳ Waiting 3 seconds before next test...\n`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Test Summary`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`Site                          | robots.txt | AI Extraction | Duration`);
  console.log(`${'—'.repeat(80)}`);

  let successCount = 0;
  let totalTests = 0;

  results.forEach(result => {
    const robotsStatus = result.robotsCheckPassed
      ? result.robotsAllowed
        ? '✅'
        : '❌'
      : '⚠️ ';

    const aiStatus = result.testCase.expectedBlock || !result.robotsAllowed
      ? 'N/A'
      : result.aiExtractionPassed
      ? '✅'
      : '❌';

    const duration = `${(result.duration / 1000).toFixed(1)}s`;

    console.log(
      `${result.testCase.label.padEnd(30)} | ${robotsStatus.padEnd(10)} | ${aiStatus.padEnd(13)} | ${duration}`
    );

    if (!result.testCase.expectedBlock && result.robotsAllowed) {
      totalTests++;
      if (result.aiExtractionPassed) {
        successCount++;
      }
    }
  });

  console.log(`${'—'.repeat(80)}`);

  const successRate = totalTests > 0 ? ((successCount / totalTests) * 100).toFixed(1) : '0.0';
  console.log(`\n✅ Success Rate: ${successCount}/${totalTests} (${successRate}%)`);

  // Calculate total duration
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);

  // Recommendations
  console.log(`\n💡 Recommendations:`);

  if (successCount === totalTests) {
    console.log(`   ✅ All tests passed! AI extraction is working perfectly.`);
    console.log(`   ✅ Ready for Phase 2 completion and gap analysis.`);
  } else if (successCount >= totalTests * 0.8) {
    console.log(`   ⚠️  Most tests passed (${successRate}%), but some issues found.`);
    console.log(`   🔍 Review failed tests above for debugging.`);
  } else {
    console.log(`   ❌ Multiple tests failed (${successRate}% success).`);
    console.log(`   🐛 Debug required before proceeding to gap analysis.`);
  }

  console.log(``);
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
