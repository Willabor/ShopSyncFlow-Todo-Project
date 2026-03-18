/**
 * Tests for File Upload Utilities
 *
 * Run with: npm test server/utils/file-upload.test.ts
 */

import {
  validateMimeType,
  validateFileSize,
  validateFileExtension,
  validateFile,
  sanitizeFilename,
  generateUniqueFilename,
  generateDateBasedPath,
  getFileType,
  calculateBufferHash,
  extractFileMetadata,
  formatFileSize,
  MAX_FILE_SIZE,
} from './file-upload';

// ===================================================================
// Validation Tests
// ===================================================================

console.log('=== Testing File Validation ===\n');

// Test 1: Valid MIME type
console.log('Test 1: Valid MIME type (image/jpeg)');
const test1 = validateMimeType('image/jpeg');
console.log(test1.valid ? '✓ PASS' : '✗ FAIL', test1);
console.log('');

// Test 2: Invalid MIME type
console.log('Test 2: Invalid MIME type (application/exe)');
const test2 = validateMimeType('application/exe');
console.log(!test2.valid ? '✓ PASS (correctly rejected)' : '✗ FAIL', test2);
console.log('');

// Test 3: Valid file size (5 MB)
console.log('Test 3: Valid file size (5 MB)');
const test3 = validateFileSize(5 * 1024 * 1024);
console.log(test3.valid ? '✓ PASS' : '✗ FAIL', test3);
console.log('');

// Test 4: File too large (25 MB)
console.log('Test 4: File too large (25 MB)');
const test4 = validateFileSize(25 * 1024 * 1024);
console.log(!test4.valid ? '✓ PASS (correctly rejected)' : '✗ FAIL', test4);
console.log('');

// Test 5: Valid extension matching MIME
console.log('Test 5: Valid extension (.jpg matches image/jpeg)');
const test5 = validateFileExtension('test.jpg', 'image/jpeg');
console.log(test5.valid ? '✓ PASS' : '✗ FAIL', test5);
console.log('');

// Test 6: Invalid extension mismatch
console.log('Test 6: Invalid extension (.pdf with image/jpeg)');
const test6 = validateFileExtension('test.pdf', 'image/jpeg');
console.log(!test6.valid ? '✓ PASS (correctly rejected)' : '✗ FAIL', test6);
console.log('');

// Test 7: Comprehensive validation (valid file)
console.log('Test 7: Comprehensive validation (valid file)');
const test7 = validateFile('product-image.jpg', 'image/jpeg', 2 * 1024 * 1024);
console.log(test7.valid ? '✓ PASS' : '✗ FAIL', test7);
console.log('');

// Test 8: Comprehensive validation (invalid file)
console.log('Test 8: Comprehensive validation (invalid file - too large)');
const test8 = validateFile('large-file.jpg', 'image/jpeg', 25 * 1024 * 1024);
console.log(!test8.valid ? '✓ PASS (correctly rejected)' : '✗ FAIL', test8);
console.log('');

// ===================================================================
// Sanitization Tests
// ===================================================================

console.log('=== Testing Filename Sanitization ===\n');

// Test 9: Sanitize filename with spaces
console.log('Test 9: Sanitize "My Photo (1).jpg"');
const test9 = sanitizeFilename('My Photo (1).jpg');
console.log('Result:', test9);
console.log(test9.sanitized === 'my-photo-1.jpg' ? '✓ PASS' : '✗ FAIL');
console.log('');

// Test 10: Sanitize filename with special chars
console.log('Test 10: Sanitize "Product@Image#2024.png"');
const test10 = sanitizeFilename('Product@Image#2024.png');
console.log('Result:', test10);
console.log(test10.sanitized === 'productimage2024.png' ? '✓ PASS' : '✗ FAIL');
console.log('');

// Test 11: Generate unique filename
console.log('Test 11: Generate unique filename');
const test11a = generateUniqueFilename('test.jpg');
const test11b = generateUniqueFilename('test.jpg');
console.log('Generated:', test11a);
console.log('Generated:', test11b);
console.log(test11a !== test11b && test11a.endsWith('.jpg') ? '✓ PASS (unique UUIDs)' : '✗ FAIL');
console.log('');

// Test 12: Generate date-based path
console.log('Test 12: Generate date-based path');
const test12 = generateDateBasedPath('product.jpg');
console.log('Result:', test12);
const now = new Date();
const expectedYear = now.getFullYear();
const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
console.log(test12.relativePath === `${expectedYear}/${expectedMonth}` ? '✓ PASS' : '✗ FAIL');
console.log('');

// ===================================================================
// File Type Detection Tests
// ===================================================================

console.log('=== Testing File Type Detection ===\n');

// Test 13: Image type
console.log('Test 13: Detect image type');
const test13 = getFileType('image/jpeg');
console.log(test13 === 'image' ? '✓ PASS' : '✗ FAIL', `Got: ${test13}`);
console.log('');

// Test 14: Document type
console.log('Test 14: Detect document type');
const test14 = getFileType('application/pdf');
console.log(test14 === 'document' ? '✓ PASS' : '✗ FAIL', `Got: ${test14}`);
console.log('');

// Test 15: Video type
console.log('Test 15: Detect video type');
const test15 = getFileType('video/mp4');
console.log(test15 === 'video' ? '✓ PASS' : '✗ FAIL', `Got: ${test15}`);
console.log('');

// Test 16: Other type
console.log('Test 16: Detect other type');
const test16 = getFileType('application/zip');
console.log(test16 === 'other' ? '✓ PASS' : '✗ FAIL', `Got: ${test16}`);
console.log('');

// ===================================================================
// Hashing Tests
// ===================================================================

console.log('=== Testing File Hashing ===\n');

// Test 17: Calculate buffer hash
console.log('Test 17: Calculate buffer hash');
const buffer = Buffer.from('Hello World');
const test17a = calculateBufferHash(buffer);
const test17b = calculateBufferHash(buffer);
console.log('Hash 1:', test17a);
console.log('Hash 2:', test17b);
console.log(test17a === test17b && test17a.length === 64 ? '✓ PASS (consistent SHA-256)' : '✗ FAIL');
console.log('');

// Test 18: Different content = different hash
console.log('Test 18: Different content yields different hash');
const buffer2 = Buffer.from('Different Content');
const test18a = calculateBufferHash(buffer);
const test18b = calculateBufferHash(buffer2);
console.log('Hash 1:', test18a);
console.log('Hash 2:', test18b);
console.log(test18a !== test18b ? '✓ PASS (different hashes)' : '✗ FAIL');
console.log('');

// ===================================================================
// Metadata Extraction Tests
// ===================================================================

console.log('=== Testing Metadata Extraction ===\n');

// Test 19: Extract metadata
console.log('Test 19: Extract complete file metadata');
const test19 = extractFileMetadata('Product Image (1).jpg', 'image/jpeg', 1500000);
console.log('Result:', test19);
console.log(
  test19.originalFilename === 'Product Image (1).jpg' &&
  test19.mimeType === 'image/jpeg' &&
  test19.fileType === 'image' &&
  test19.fileSize === 1500000 &&
  test19.extension === '.jpg'
    ? '✓ PASS'
    : '✗ FAIL'
);
console.log('');

// ===================================================================
// Utility Tests
// ===================================================================

console.log('=== Testing Utility Functions ===\n');

// Test 20: Format file size
console.log('Test 20: Format file sizes');
const test20a = formatFileSize(1024);
const test20b = formatFileSize(1024 * 1024);
const test20c = formatFileSize(1024 * 1024 * 5.5);
console.log('1 KB:', test20a);
console.log('1 MB:', test20b);
console.log('5.5 MB:', test20c);
console.log(
  test20a === '1 KB' &&
  test20b === '1 MB' &&
  test20c === '5.5 MB'
    ? '✓ PASS'
    : '✗ FAIL'
);
console.log('');

// ===================================================================
// Summary
// ===================================================================

console.log('=== Test Summary ===');
console.log('');
console.log('All tests completed!');
console.log('Review results above to ensure all tests pass.');
console.log('');
console.log('Expected: 20/20 tests pass ✓');
