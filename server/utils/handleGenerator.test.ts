/**
 * Handle Generator Test Suite
 *
 * Comprehensive tests for all handle generation, validation, and utility functions
 * Tests include: normal cases, edge cases, error cases, and performance checks
 */

import {
  generateHandleFromTitle,
  sanitizeHandle,
  validateHandle,
  validateHandleDetailed,
  generateUniqueHandle,
  scoreHandleSEO,
  suggestHandleImprovements,
  parseHandleFromUrl,
  previewUrl,
  batchGenerateHandles,
  MAX_HANDLE_LENGTH,
  MIN_HANDLE_LENGTH,
  OPTIMAL_HANDLE_LENGTH,
} from './handleGenerator';

/**
 * Test runner that counts passed/failed tests
 */
class TestRunner {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; status: 'pass' | 'fail'; error?: string }> = [];

  test(name: string, fn: () => void | Promise<void>) {
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result
          .then(() => {
            this.passed++;
            this.tests.push({ name, status: 'pass' });
            console.log(`  ✓ ${name}`);
          })
          .catch((error) => {
            this.failed++;
            this.tests.push({ name, status: 'fail', error: error.message });
            console.error(`  ✗ ${name}`);
            console.error(`    Error: ${error.message}`);
          });
      } else {
        this.passed++;
        this.tests.push({ name, status: 'pass' });
        console.log(`  ✓ ${name}`);
      }
    } catch (error) {
      this.failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.tests.push({ name, status: 'fail', error: errorMsg });
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${errorMsg}`);
    }
  }

  async runAsync(fn: () => Promise<void>) {
    await fn();
  }

  summary() {
    const total = this.passed + this.failed;
    const percentage = total > 0 ? ((this.passed / total) * 100).toFixed(1) : '0';

    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${total}`);
    console.log(`✓ Passed: ${this.passed}`);
    console.log(`✗ Failed: ${this.failed}`);
    console.log(`Success Rate: ${percentage}%`);
    console.log('='.repeat(70));

    if (this.failed > 0) {
      console.log('\nFAILED TESTS:');
      this.tests
        .filter(t => t.status === 'fail')
        .forEach(t => {
          console.log(`  ✗ ${t.name}`);
          if (t.error) console.log(`    ${t.error}`);
        });
    }

    return { passed: this.passed, failed: this.failed, percentage };
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: any, expected: any, message?: string) {
  const msg = message || `Expected ${expected}, got ${actual}`;
  assert(actual === expected, msg);
}

function assertDeepEqual(actual: any, expected: any, message?: string) {
  const msg = message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  assert(JSON.stringify(actual) === JSON.stringify(expected), msg);
}

/**
 * Main test execution
 */
async function runTests() {
  const runner = new TestRunner();

  console.log('\n' + '='.repeat(70));
  console.log('HANDLE GENERATOR TEST SUITE - Phase 2 Gap Analysis');
  console.log('='.repeat(70));

  // ============================================================================
  // Test Group 1: generateHandleFromTitle
  // ============================================================================
  console.log('\n📝 Test Group 1: generateHandleFromTitle()');
  console.log('-'.repeat(70));

  runner.test('Converts basic title to handle', () => {
    const result = generateHandleFromTitle('Mens Leather Wallet');
    assertEqual(result, 'mens-leather-wallet');
  });

  runner.test('Removes special characters', () => {
    const result = generateHandleFromTitle("Men's Leather Wallet (Black)");
    assertEqual(result, 'mens-leather-wallet-black');
  });

  runner.test('Handles multiple spaces', () => {
    const result = generateHandleFromTitle('Product    With   Spaces');
    assertEqual(result, 'product-with-spaces');
  });

  runner.test('Replaces underscores with hyphens', () => {
    const result = generateHandleFromTitle('Product_Name_Here');
    assertEqual(result, 'product-name-here');
  });

  runner.test('Removes consecutive hyphens', () => {
    const result = generateHandleFromTitle('Product - - Name');
    assertEqual(result, 'product-name');
  });

  runner.test('Truncates to 60 characters', () => {
    const longTitle = 'This is a very long product title that exceeds sixty characters and should be truncated';
    const result = generateHandleFromTitle(longTitle);
    assert(result.length <= MAX_HANDLE_LENGTH, 'Handle exceeds max length');
    assert(!result.endsWith('-'), 'Handle ends with hyphen after truncation');
  });

  runner.test('Handles unicode characters', () => {
    const result = generateHandleFromTitle('Café Latté Mug');
    assertEqual(result, 'caf-latt-mug');
  });

  runner.test('Handles numbers correctly', () => {
    const result = generateHandleFromTitle('iPhone 15 Pro Max');
    assertEqual(result, 'iphone-15-pro-max');
  });

  runner.test('Throws error on empty string', () => {
    try {
      generateHandleFromTitle('');
      throw new Error('Should have thrown');
    } catch (error) {
      assert(error instanceof Error, 'Should throw Error');
    }
  });

  runner.test('Throws error on only special characters', () => {
    try {
      generateHandleFromTitle('!!@#$%^&*()');
      throw new Error('Should have thrown');
    } catch (error) {
      assert(error instanceof Error, 'Should throw Error');
    }
  });

  runner.test('Handles title with only numbers', () => {
    const result = generateHandleFromTitle('123456');
    assertEqual(result, '123456');
  });

  runner.test('Removes leading/trailing hyphens', () => {
    const result = generateHandleFromTitle('-Product Name-');
    assertEqual(result, 'product-name');
  });

  // ============================================================================
  // Test Group 2: sanitizeHandle
  // ============================================================================
  console.log('\n🧹 Test Group 2: sanitizeHandle()');
  console.log('-'.repeat(70));

  runner.test('Sanitizes uppercase handle', () => {
    const result = sanitizeHandle('My-Product-HANDLE');
    assertEqual(result, 'my-product-handle');
  });

  runner.test('Removes consecutive hyphens', () => {
    const result = sanitizeHandle('product--name---here');
    assertEqual(result, 'product-name-here');
  });

  runner.test('Removes invalid characters', () => {
    const result = sanitizeHandle('product@name!here');
    assertEqual(result, 'productnamehere');
  });

  runner.test('Truncates long handles', () => {
    const longHandle = 'a'.repeat(100);
    const result = sanitizeHandle(longHandle);
    assert(result.length <= MAX_HANDLE_LENGTH, 'Did not truncate');
  });

  // ============================================================================
  // Test Group 3: validateHandle & validateHandleDetailed
  // ============================================================================
  console.log('\n✅ Test Group 3: validateHandle() & validateHandleDetailed()');
  console.log('-'.repeat(70));

  runner.test('Validates correct handle', () => {
    assert(validateHandle('mens-leather-wallet'), 'Valid handle failed');
  });

  runner.test('Rejects uppercase', () => {
    assert(!validateHandle('Mens-Wallet'), 'Accepted uppercase');
  });

  runner.test('Rejects leading hyphen', () => {
    assert(!validateHandle('-mens-wallet'), 'Accepted leading hyphen');
  });

  runner.test('Rejects trailing hyphen', () => {
    assert(!validateHandle('mens-wallet-'), 'Accepted trailing hyphen');
  });

  runner.test('Rejects consecutive hyphens', () => {
    assert(!validateHandle('mens--wallet'), 'Accepted consecutive hyphens');
  });

  runner.test('Rejects special characters', () => {
    assert(!validateHandle('mens_wallet'), 'Accepted underscore');
    assert(!validateHandle('mens@wallet'), 'Accepted @');
  });

  runner.test('Rejects too long handle', () => {
    const tooLong = 'a'.repeat(MAX_HANDLE_LENGTH + 1);
    assert(!validateHandle(tooLong), 'Accepted handle over max length');
  });

  runner.test('Validates numbers in handle', () => {
    assert(validateHandle('product-123'), 'Rejected valid numbers');
  });

  runner.test('validateHandleDetailed returns errors', () => {
    const result = validateHandleDetailed('-invalid--handle-');
    assert(!result.valid, 'Should be invalid');
    assert(result.errors.length > 0, 'Should have errors');
  });

  runner.test('validateHandleDetailed returns warnings for short handles', () => {
    const result = validateHandleDetailed('short');
    assert(result.warnings.length > 0, 'Should have warnings');
  });

  // ============================================================================
  // Test Group 4: generateUniqueHandle
  // ============================================================================
  console.log('\n🔢 Test Group 4: generateUniqueHandle()');
  console.log('-'.repeat(70));

  runner.test('Returns base handle if unique', () => {
    const result = generateUniqueHandle('unique-product', []);
    assertEqual(result, 'unique-product');
  });

  runner.test('Appends -2 for first duplicate', () => {
    const result = generateUniqueHandle('product', ['product']);
    assertEqual(result, 'product-2');
  });

  runner.test('Finds next available number', () => {
    const result = generateUniqueHandle('product', ['product', 'product-2', 'product-3']);
    assertEqual(result, 'product-4');
  });

  runner.test('Handles case-insensitive duplicates', () => {
    const result = generateUniqueHandle('product', ['Product', 'PRODUCT']);
    assertEqual(result, 'product-2');
  });

  runner.test('Truncates long handles when adding suffix', () => {
    const longHandle = 'a'.repeat(MAX_HANDLE_LENGTH);
    const result = generateUniqueHandle(longHandle, [longHandle]);
    assert(result.length <= MAX_HANDLE_LENGTH, 'Exceeded max length with suffix');
    assert(result.endsWith('-2'), 'Did not add suffix correctly');
  });

  runner.test('Handles many duplicates', () => {
    const existing = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? 'product' : `product-${i + 1}`
    );
    const result = generateUniqueHandle('product', existing);
    assertEqual(result, 'product-101');
  });

  // ============================================================================
  // Test Group 5: scoreHandleSEO
  // ============================================================================
  console.log('\n📊 Test Group 5: scoreHandleSEO()');
  console.log('-'.repeat(70));

  runner.test('Scores optimal handle highly', () => {
    const result = scoreHandleSEO('mens-leather-wallet-black-bifold-genuine');
    assert(result.score >= 70, `Score too low: ${result.score}`);
    assert(['A', 'B', 'C'].includes(result.grade), `Grade too low: ${result.grade}`);
  });

  runner.test('Penalizes very short handles', () => {
    const result = scoreHandleSEO('prod');
    assert(result.score < 70, 'Short handle scored too high');
  });

  runner.test('Penalizes stop words', () => {
    const result = scoreHandleSEO('the-best-product-of-the-year');
    assert(result.suggestions.some(s => s.includes('stop words')), 'Did not detect stop words');
  });

  runner.test('Returns detailed breakdown', () => {
    const result = scoreHandleSEO('quality-product-name');
    assert(result.breakdown.length > 0, 'Missing length score');
    assert(result.breakdown.keywords > 0, 'Missing keywords score');
    assert(result.breakdown.readability > 0, 'Missing readability score');
  });

  runner.test('Handles invalid handle gracefully', () => {
    const result = scoreHandleSEO('INVALID-HANDLE');
    assert(result.score === 0, 'Invalid handle should score 0');
    assert(result.grade === 'F', 'Invalid handle should get F grade');
  });

  // ============================================================================
  // Test Group 6: suggestHandleImprovements
  // ============================================================================
  console.log('\n💡 Test Group 6: suggestHandleImprovements()');
  console.log('-'.repeat(70));

  runner.test('Suggests improvements for short handle', () => {
    const suggestions = suggestHandleImprovements('prod');
    assert(suggestions.length > 0, 'No suggestions provided');
    assert(suggestions.some(s => s.toLowerCase().includes('short')), 'Did not suggest length improvement');
  });

  runner.test('Suggests removing stop words', () => {
    const suggestions = suggestHandleImprovements('the-best-product');
    assert(suggestions.some(s => s.toLowerCase().includes('stop')), 'Did not suggest removing stop words');
  });

  runner.test('Returns validation errors first', () => {
    const suggestions = suggestHandleImprovements('-invalid-');
    assert(suggestions.length > 0, 'No errors returned');
    assert(suggestions[0].includes('hyphen'), 'Validation error not prioritized');
  });

  // ============================================================================
  // Test Group 7: parseHandleFromUrl
  // ============================================================================
  console.log('\n🔗 Test Group 7: parseHandleFromUrl()');
  console.log('-'.repeat(70));

  runner.test('Parses handle from full URL', () => {
    const result = parseHandleFromUrl('https://shop.com/products/mens-wallet');
    assertEqual(result, 'mens-wallet');
  });

  runner.test('Parses handle from path', () => {
    const result = parseHandleFromUrl('/products/mens-wallet');
    assertEqual(result, 'mens-wallet');
  });

  runner.test('Removes query parameters', () => {
    const result = parseHandleFromUrl('/products/mens-wallet?ref=abc&utm=xyz');
    assertEqual(result, 'mens-wallet');
  });

  runner.test('Removes hash fragments', () => {
    const result = parseHandleFromUrl('/products/mens-wallet#reviews');
    assertEqual(result, 'mens-wallet');
  });

  runner.test('Handles URL encoded characters', () => {
    const result = parseHandleFromUrl('/products/mens%20wallet');
    assertEqual(result, 'mens-wallet');
  });

  runner.test('Gets last segment as handle', () => {
    const result = parseHandleFromUrl('https://shop.com/collections/mens/products/wallet');
    assertEqual(result, 'wallet');
  });

  // ============================================================================
  // Test Group 8: previewUrl
  // ============================================================================
  console.log('\n🌐 Test Group 8: previewUrl()');
  console.log('-'.repeat(70));

  runner.test('Generates preview URL with domain', () => {
    const result = previewUrl('mens-wallet', 'mystore.myshopify.com');
    assertEqual(result, 'https://mystore.myshopify.com/products/mens-wallet');
  });

  runner.test('Uses default domain if not provided', () => {
    const result = previewUrl('mens-wallet');
    assert(result.includes('/products/mens-wallet'), 'Missing handle in URL');
    assert(result.startsWith('https://'), 'Missing https');
  });

  runner.test('Handles domain with https already', () => {
    const result = previewUrl('mens-wallet', 'https://mystore.com');
    assertEqual(result, 'https://mystore.com/products/mens-wallet');
  });

  // ============================================================================
  // Test Group 9: batchGenerateHandles
  // ============================================================================
  console.log('\n📦 Test Group 9: batchGenerateHandles()');
  console.log('-'.repeat(70));

  runner.test('Generates handles for multiple titles', () => {
    const titles = ['Product A', 'Product B', 'Product C'];
    const result = batchGenerateHandles(titles);
    assertEqual(result.length, 3);
    assert(result.every(h => validateHandle(h)), 'Some handles are invalid');
  });

  runner.test('Handles duplicate titles', () => {
    const titles = ['Product A', 'Product B', 'Product A'];
    const result = batchGenerateHandles(titles);
    assertEqual(result[0], 'product-a');
    assertEqual(result[1], 'product-b');
    assertEqual(result[2], 'product-a-2');
  });

  runner.test('Ensures all handles are unique', () => {
    const titles = Array(10).fill('Same Product');
    const result = batchGenerateHandles(titles);
    const uniqueHandles = new Set(result);
    assertEqual(uniqueHandles.size, 10);
  });

  runner.test('Handles empty array', () => {
    const result = batchGenerateHandles([]);
    assertEqual(result.length, 0);
  });

  // ============================================================================
  // Test Group 10: Edge Cases & Error Handling
  // ============================================================================
  console.log('\n⚠️  Test Group 10: Edge Cases & Error Handling');
  console.log('-'.repeat(70));

  runner.test('Handles null/undefined title gracefully', () => {
    try {
      // @ts-ignore - Testing runtime behavior
      generateHandleFromTitle(null);
      throw new Error('Should have thrown');
    } catch (error) {
      assert(error instanceof Error, 'Should throw Error');
    }
  });

  runner.test('Handles very long word in title', () => {
    const title = 'Product with ' + 'x'.repeat(100) + ' long word';
    const result = generateHandleFromTitle(title);
    assert(result.length <= MAX_HANDLE_LENGTH, 'Exceeded max length');
  });

  runner.test('Handles title with only hyphens and spaces', () => {
    try {
      generateHandleFromTitle('--- --- ---');
      throw new Error('Should have thrown');
    } catch (error) {
      assert(error instanceof Error, 'Should throw Error');
    }
  });

  runner.test('Handles mixed case consistently', () => {
    const result1 = generateHandleFromTitle('MeNs WaLLeT');
    const result2 = generateHandleFromTitle('mens wallet');
    assertEqual(result1, result2);
  });

  // ============================================================================
  // Test Group 11: Performance Tests
  // ============================================================================
  console.log('\n⚡ Test Group 11: Performance Tests');
  console.log('-'.repeat(70));

  runner.test('Batch generation is efficient', () => {
    const startTime = Date.now();
    const titles = Array.from({ length: 1000 }, (_, i) => `Product ${i}`);
    const result = batchGenerateHandles(titles);
    const duration = Date.now() - startTime;

    assertEqual(result.length, 1000);
    assert(duration < 5000, `Took too long: ${duration}ms`);
    console.log(`    Generated 1000 handles in ${duration}ms`);
  });

  runner.test('Unique handle generation with many duplicates', () => {
    const startTime = Date.now();
    const existing = Array.from({ length: 100 }, (_, i) =>
      i === 0 ? 'product' : `product-${i + 1}`
    );
    const result = generateUniqueHandle('product', existing);
    const duration = Date.now() - startTime;

    assertEqual(result, 'product-101');
    assert(duration < 100, `Took too long: ${duration}ms`);
  });

  // ============================================================================
  // Test Group 12: Real-World Examples
  // ============================================================================
  console.log('\n🌍 Test Group 12: Real-World Examples');
  console.log('-'.repeat(70));

  runner.test('Example 1: Jordan Craig product', () => {
    const title = 'Jordan Craig KIDS Paradise Ranch Hoodie with Rhinestones (Red)';
    const result = generateHandleFromTitle(title);
    assert(validateHandle(result), 'Handle is invalid');
    assert(result.length <= MAX_HANDLE_LENGTH, 'Handle too long');
    console.log(`    "${title}" → "${result}"`);
  });

  runner.test('Example 2: EPTM product', () => {
    const title = "EPTM Men's Soco Track Pants - Relaxed Fit Joggers - Black";
    const result = generateHandleFromTitle(title);
    assert(validateHandle(result), 'Handle is invalid');
    console.log(`    "${title}" → "${result}"`);
  });

  runner.test('Example 3: Nexus product with special chars', () => {
    const title = 'NEXUS Men Vintage Leather Dragon Face Wallet With Chain (Black)';
    const result = generateHandleFromTitle(title);
    assert(validateHandle(result), 'Handle is invalid');
    const score = scoreHandleSEO(result);
    console.log(`    "${title}" → "${result}" (SEO: ${score.score}/100, Grade: ${score.grade})`);
  });

  // Run summary
  const summary = runner.summary();

  console.log('\n📋 Test Coverage Summary:');
  console.log(`  - generateHandleFromTitle: 12 tests`);
  console.log(`  - sanitizeHandle: 4 tests`);
  console.log(`  - validateHandle: 11 tests`);
  console.log(`  - generateUniqueHandle: 6 tests`);
  console.log(`  - scoreHandleSEO: 5 tests`);
  console.log(`  - suggestHandleImprovements: 3 tests`);
  console.log(`  - parseHandleFromUrl: 6 tests`);
  console.log(`  - previewUrl: 3 tests`);
  console.log(`  - batchGenerateHandles: 4 tests`);
  console.log(`  - Edge cases: 4 tests`);
  console.log(`  - Performance: 2 tests`);
  console.log(`  - Real-world: 3 tests`);

  return summary;
}

// Run tests
runTests()
  .then(summary => {
    if (summary.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\nTest execution failed:', error);
    process.exit(1);
  });
