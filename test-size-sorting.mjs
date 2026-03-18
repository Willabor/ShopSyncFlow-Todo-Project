/**
 * Test Size Sorting Function
 * Verifies that sortSizes() correctly orders various size formats
 */

import { sortSizes } from './server/qb-import-helpers.js';

console.log('🧪 Testing Size Sorting Function\n');
console.log('═══════════════════════════════════════════════════════════\n');

// Test Case 1: Toddler sizes (mixed order)
console.log('Test 1: Toddler Sizes (Mixed Order)');
const toddlerSizes = ['7T', '3T', '5T', '2T', '4T', '6T', '8T'];
const sortedToddler = sortSizes([...toddlerSizes]);
console.log('Input:  ', toddlerSizes.join(', '));
console.log('Output: ', sortedToddler.join(', '));
console.log('Expected: 2T, 3T, 4T, 5T, 6T, 7T, 8T');
console.log('✓ Pass:', sortedToddler.join(', ') === '2T, 3T, 4T, 5T, 6T, 7T, 8T');
console.log();

// Test Case 2: Numeric sizes with decimals (mixed)
console.log('Test 2: Numeric Sizes with Decimals');
const numericSizes = ['10', '7.5', '8', '9.5', '8.5', '9', '10.5'];
const sortedNumeric = sortSizes([...numericSizes]);
console.log('Input:  ', numericSizes.join(', '));
console.log('Output: ', sortedNumeric.join(', '));
console.log('Expected: 7.5, 8, 8.5, 9, 9.5, 10, 10.5');
console.log('✓ Pass:', sortedNumeric.join(', ') === '7.5, 8, 8.5, 9, 9.5, 10, 10.5');
console.log();

// Test Case 3: Waist x Length combinations (mixed waist sizes)
console.log('Test 3: Waist x Length Combinations');
const waistSizes = ['32W X 32L', '28W X 30L', '30W X 32L', '34W X 30L', '28W X 28L'];
const sortedWaist = sortSizes([...waistSizes]);
console.log('Input:  ', waistSizes.join(', '));
console.log('Output: ', sortedWaist.join(', '));
console.log('Expected: 28W X 28L, 28W X 30L, 30W X 32L, 32W X 32L, 34W X 30L');
console.log('✓ Pass:', sortedWaist.join(', ') === '28W X 28L, 28W X 30L, 30W X 32L, 32W X 32L, 34W X 30L');
console.log();

// Test Case 4: Standard sizes (mixed order)
console.log('Test 4: Standard Sizes');
const standardSizes = ['Large', 'Small', 'X-Large', 'Medium', 'X-Small'];
const sortedStandard = sortSizes([...standardSizes]);
console.log('Input:  ', standardSizes.join(', '));
console.log('Output: ', sortedStandard.join(', '));
console.log('Expected: X-Small, Small, Medium, Large, X-Large');
console.log('✓ Pass:', sortedStandard.join(', ') === 'X-Small, Small, Medium, Large, X-Large');
console.log();

// Test Case 5: Hat sizes with fractions (mixed)
console.log('Test 5: Hat Sizes with Fractions');
const hatSizes = ['7 1/4', '6 3/4', '7', '6 1/2', '7 1/2'];
const sortedHat = sortSizes([...hatSizes]);
console.log('Input:  ', hatSizes.join(', '));
console.log('Output: ', sortedHat.join(', '));
console.log('Expected: 6 1/2, 6 3/4, 7, 7 1/4, 7 1/2');
console.log('✓ Pass:', sortedHat.join(', ') === '6 1/2, 6 3/4, 7, 7 1/4, 7 1/2');
console.log();

// Test Case 6: Real QB Import scenario (like Ice Blue jeans)
console.log('Test 6: Real QB Import Scenario (Ice Blue Jeans)');
const realSizes = ['8', '12', '2T', '16', '4T', '10', '14', '3T', '6T', '5T', '7T'];
const sortedReal = sortSizes([...realSizes]);
console.log('Input:  ', realSizes.join(', '));
console.log('Output: ', sortedReal.join(', '));
console.log('Expected: 2T, 3T, 4T, 5T, 6T, 7T, 8, 10, 12, 14, 16');
console.log('✓ Pass:', sortedReal.join(', ') === '2T, 3T, 4T, 5T, 6T, 7T, 8, 10, 12, 14, 16');
console.log();

// Test Case 7: Sizes not in predefined list (fallback to alphabetical)
console.log('Test 7: Unknown Sizes (Alphabetical Fallback)');
const unknownSizes = ['ZZ-Custom', 'AA-Custom', 'MM-Custom'];
const sortedUnknown = sortSizes([...unknownSizes]);
console.log('Input:  ', unknownSizes.join(', '));
console.log('Output: ', sortedUnknown.join(', '));
console.log('Expected: AA-Custom, MM-Custom, ZZ-Custom');
console.log('✓ Pass:', sortedUnknown.join(', ') === 'AA-Custom, MM-Custom, ZZ-Custom');
console.log();

console.log('═══════════════════════════════════════════════════════════');
console.log('✅ All size sorting tests completed!');
console.log('═══════════════════════════════════════════════════════════\n');
