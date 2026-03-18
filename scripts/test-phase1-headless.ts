/**
 * Phase 1 Testing Script: Headless Browser Scraping
 *
 * Tests the new headless browser scraper and robots.txt checker
 * with multiple vendor sites.
 */

import 'dotenv/config';
import { scrapeHeadlessProduct, getBrowserPoolStatus } from '../server/services/headless-brand-scraper.service';
import { isScrapingAllowed, getNexusUserAgent } from '../server/services/robots-txt-checker.service';

interface TestCase {
  label: string;
  websiteUrl: string;
  styleNumber: string;
  productName?: string;
  color?: string;
  expectedBlocked?: boolean; // For robots.txt testing
}

const testCases: TestCase[] = [
  {
    label: 'Ethika - Staple Happy Daze (SPA)',
    websiteUrl: 'https://www.ethika.com',
    styleNumber: 'staple-happy-daze',
    productName: 'Staple Happy Daze',
    color: 'Happy Daze',
  },
  {
    label: 'True Religion - Joey Bootcut Jean (Bot-Protected)',
    websiteUrl: 'https://www.truereligion.com',
    styleNumber: 'joey-bootcut-jean',
    productName: 'Joey Bootcut Jean',
    color: 'Light Wash',
  },
  {
    label: 'Urban Outfitters - Test Product (Custom + JS)',
    websiteUrl: 'https://www.urbanoutfitters.com',
    styleNumber: 'test-product',
    productName: 'Test Product',
  },
  {
    label: 'Nike - Test Product (Expected Block)',
    websiteUrl: 'https://www.nike.com',
    styleNumber: 'test-shoe',
    expectedBlocked: true, // Testing ethical boundaries
  },
];

async function testRobotsTxt(testCase: TestCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🤖 Testing robots.txt: ${testCase.label}`);
  console.log(`${'='.repeat(80)}`);

  try {
    const result = await isScrapingAllowed(
      testCase.websiteUrl,
      getNexusUserAgent()
    );

    console.log(`\n📋 robots.txt Check Results:`);
    console.log(`  URL: ${result.robotsTxtUrl || 'N/A'}`);
    console.log(`  Allowed: ${result.allowed ? '✅ Yes' : '❌ No'}`);
    console.log(`  Reason: ${result.reason || 'N/A'}`);
    console.log(`  Crawl Delay: ${result.crawlDelay ? `${result.crawlDelay}s` : 'None'}`);
    console.log(`  Rules Found: ${result.rulesFound ? 'Yes' : 'No'}`);

    if (testCase.expectedBlocked && !result.allowed) {
      console.log(`\n✅ Expected block confirmed - ethical boundary working`);
    } else if (!testCase.expectedBlocked && result.allowed) {
      console.log(`\n✅ Scraping allowed - proceeding with test`);
    } else if (testCase.expectedBlocked && result.allowed) {
      console.log(`\n⚠️  Expected block but got allowed - manual review recommended`);
    }

    return result;
  } catch (error) {
    console.error(`\n❌ robots.txt check failed:`, error);
    return null;
  }
}

async function testHeadlessScraper(testCase: TestCase) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🌐 Testing Headless Scraper: ${testCase.label}`);
  console.log(`${'='.repeat(80)}`);

  const startTime = Date.now();

  try {
    console.log(`\n📊 Browser Pool Status (Before):`);
    const statusBefore = getBrowserPoolStatus();
    console.log(`  Active: ${statusBefore.activeBrowsers}/${statusBefore.maxConcurrent}`);
    console.log(`  Available: ${statusBefore.availableSlots}`);

    const result = await scrapeHeadlessProduct(
      testCase.websiteUrl,
      {
        styleNumber: testCase.styleNumber,
        productName: testCase.productName,
        color: testCase.color,
      },
      {
        timeout: 30000,
        headless: true,
      }
    );

    const duration = Date.now() - startTime;

    console.log(`\n📊 Browser Pool Status (After):`);
    const statusAfter = getBrowserPoolStatus();
    console.log(`  Active: ${statusAfter.activeBrowsers}/${statusAfter.maxConcurrent}`);
    console.log(`  Available: ${statusAfter.availableSlots}`);

    console.log(`\n⏱️  Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
    console.log(`\n📊 Results:`);
    console.log(`  Success: ${result.scrapingSuccess ? '✅' : '❌'}`);
    console.log(`  Product URL: ${result.brandProductUrl || 'N/A'}`);
    console.log(`  Title: ${result.brandProductTitle || 'N/A'}`);
    console.log(`  Description Length: ${result.brandDescription?.length || 0} chars`);
    console.log(`  Images Found: ${result.images?.length || 0}`);
    console.log(`  Features Found: ${result.features?.length || 0}`);
    console.log(`  Material: ${result.materialComposition || 'N/A'}`);
    console.log(`  Care: ${result.careInstructions || 'N/A'}`);
    console.log(`  Size Chart: ${result.sizeChartImageUrl ? 'Found' : 'Not found'}`);

    if (result.scrapingError) {
      console.log(`  Error: ${result.scrapingError}`);
    }

    if (result.images && result.images.length > 0) {
      console.log(`\n🖼️  Sample Images:`);
      result.images.slice(0, 3).forEach((img, i) => {
        console.log(`  ${i + 1}. ${img.url}`);
      });
    }

    if (result.features && result.features.length > 0) {
      console.log(`\n📝 Sample Features:`);
      result.features.slice(0, 3).forEach((feature, i) => {
        console.log(`  ${i + 1}. ${feature}`);
      });
    }

    return { success: result.scrapingSuccess, duration, result };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n❌ Headless scraping failed after ${duration}ms:`, error);
    return { success: false, duration, error };
  }
}

async function runTests() {
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`# Phase 1 Testing: Headless Browser Scraping`);
  console.log(`${'#'.repeat(80)}\n`);

  console.log(`⚙️  Configuration:`);
  console.log(`  SCRAPER_HEADLESS_ENABLED: ${process.env.SCRAPER_HEADLESS_ENABLED || '0'}`);
  console.log(`  SCRAPER_MAX_CONCURRENT_BROWSERS: ${process.env.SCRAPER_MAX_CONCURRENT_BROWSERS || '3'}`);
  console.log(`  SCRAPER_HEADLESS_TIMEOUT: ${process.env.SCRAPER_HEADLESS_TIMEOUT || '30000'}ms`);
  console.log(`  SCRAPER_RESPECT_ROBOTS_TXT: ${process.env.SCRAPER_RESPECT_ROBOTS_TXT || '1'}`);

  const results: Array<{
    label: string;
    robotsAllowed: boolean;
    scrapingSuccess: boolean;
    duration: number;
  }> = [];

  for (const testCase of testCases) {
    // Test 1: robots.txt compliance
    const robotsResult = await testRobotsTxt(testCase);

    // Test 2: Headless scraping (only if robots.txt allows or expectedBlocked)
    let scrapingResult = null;
    if (robotsResult && robotsResult.allowed && !testCase.expectedBlocked) {
      // Honor crawl-delay
      if (robotsResult.crawlDelay && robotsResult.crawlDelay > 0) {
        console.log(`\n⏳ Waiting ${robotsResult.crawlDelay}s for crawl-delay...`);
        await new Promise(resolve => setTimeout(resolve, robotsResult.crawlDelay! * 1000));
      }

      scrapingResult = await testHeadlessScraper(testCase);
    } else if (testCase.expectedBlocked) {
      console.log(`\n⏭️  Skipping headless test (expected block)`);
    } else {
      console.log(`\n⏭️  Skipping headless test (robots.txt disallowed)`);
    }

    results.push({
      label: testCase.label,
      robotsAllowed: robotsResult?.allowed || false,
      scrapingSuccess: scrapingResult?.success || false,
      duration: scrapingResult?.duration || 0,
    });

    // Wait between tests to be polite
    console.log(`\n⏳ Waiting 3s before next test...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Summary
  console.log(`\n${'#'.repeat(80)}`);
  console.log(`# Test Summary`);
  console.log(`${'#'.repeat(80)}\n`);

  console.log(`📊 Results Table:\n`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Site                          | robots.txt | Scraping | Duration`);
  console.log(`${'─'.repeat(80)}`);

  for (const result of results) {
    const robotsIcon = result.robotsAllowed ? '✅' : '❌';
    const scrapingIcon = result.scrapingSuccess ? '✅' : '❌';
    const durationStr = result.duration > 0 ? `${(result.duration / 1000).toFixed(1)}s` : 'N/A';

    const label = result.label.substring(0, 27).padEnd(27);
    console.log(`${label} | ${robotsIcon}        | ${scrapingIcon}      | ${durationStr}`);
  }
  console.log(`${'─'.repeat(80)}\n`);

  const successCount = results.filter(r => r.scrapingSuccess).length;
  const totalTests = results.filter(r => r.robotsAllowed).length; // Only count allowed sites

  console.log(`\n✅ Success Rate: ${successCount}/${totalTests} (${((successCount / totalTests) * 100).toFixed(0)}%)`);

  const avgDuration = results
    .filter(r => r.duration > 0)
    .reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.duration > 0).length;

  console.log(`⏱️  Average Duration: ${(avgDuration / 1000).toFixed(2)}s`);

  console.log(`\n${'#'.repeat(80)}\n`);
}

// Run tests
runTests()
  .then(() => {
    console.log('✅ All tests completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
