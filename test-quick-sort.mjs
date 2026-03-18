import { sortSizes } from './server/qb-import-helpers.js';

console.log('🧪 Quick Size Sorting Test\n');

// Test: Mixed toddler and youth sizes (like the Ice Blue jeans)
const testSizes = ['14', '2T', '8', '5T', '12', '3T', '16', '7T', '10', '6T', '4T'];
console.log('Input (unsorted):  ', testSizes.join(', '));

const sorted = sortSizes([...testSizes]);
console.log('Output (sorted):   ', sorted.join(', '));
console.log('Expected order:     2T, 3T, 4T, 5T, 6T, 7T, 8, 10, 12, 14, 16');
console.log('✅ Match:', sorted.join(', ') === '2T, 3T, 4T, 5T, 6T, 7T, 8, 10, 12, 14, 16');

// Test: Waist x Length sizes
console.log('\n--- Waist x Length Test ---');
const waistSizes = ['34W X 32L', '30W X 30L', '32W X 30L', '28W X 32L', '30W X 32L'];
console.log('Input:  ', waistSizes.join(', '));
const sortedWaist = sortSizes([...waistSizes]);
console.log('Output: ', sortedWaist.join(', '));

// Test: Standard sizes
console.log('\n--- Standard Sizes Test ---');
const standardSizes = ['Large', 'Small', 'X-Large', 'Medium'];
console.log('Input:  ', standardSizes.join(', '));
const sortedStandard = sortSizes([...standardSizes]);
console.log('Output: ', sortedStandard.join(', '));
console.log('Expected: X-Small, Small, Medium, Large, X-Large');
