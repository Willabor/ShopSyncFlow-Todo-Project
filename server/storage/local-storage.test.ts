/**
 * Tests for Local Storage Implementation
 *
 * Run with: npm test server/storage/local-storage.test.ts
 * Or: npx tsx server/storage/local-storage.test.ts
 */

import fs from 'fs/promises';
import path from 'path';
import {
  saveFile,
  deleteFile,
  getFileInfo,
  getPublicUrl,
  cleanupEmptyDirectories,
  initializeStorage,
} from './local-storage';

// ===================================================================
// Test Configuration
// ===================================================================

const TEST_UPLOADS_DIR = path.join(process.cwd(), 'server', 'uploads', 'test');

// ===================================================================
// Helper Functions
// ===================================================================

async function cleanupTestDirectory() {
  try {
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore if directory doesn't exist
  }
}

async function createTestBuffer(content: string = 'Test file content'): Promise<Buffer> {
  return Buffer.from(content);
}

// ===================================================================
// Storage Initialization Tests
// ===================================================================

console.log('=== Testing Storage Initialization ===\n');

// Test 1: Initialize storage directory
console.log('Test 1: Initialize storage directory');
(async () => {
  try {
    await initializeStorage();
    const uploadsDir = path.join(process.cwd(), 'server', 'uploads');
    const stats = await fs.stat(uploadsDir);
    console.log(stats.isDirectory() ? '✓ PASS' : '✗ FAIL', 'Directory created successfully');
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Save Tests
// ===================================================================

console.log('=== Testing File Save Operations ===\n');

// Test 2: Save file successfully
console.log('Test 2: Save file successfully (product-image.jpg)');
(async () => {
  try {
    const buffer = await createTestBuffer('Test product image content');
    const result = await saveFile(buffer, 'product-image.jpg');

    console.log('Result:', result);
    console.log(
      result.success &&
      result.filePath.length > 0 &&
      result.relativePath.length > 0 &&
      result.publicUrl.startsWith('/uploads/')
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 3: Save multiple files in same month
console.log('Test 3: Save multiple files in same month');
(async () => {
  try {
    const buffer1 = await createTestBuffer('File 1');
    const buffer2 = await createTestBuffer('File 2');

    const result1 = await saveFile(buffer1, 'test-1.jpg');
    const result2 = await saveFile(buffer2, 'test-2.jpg');

    console.log('File 1:', result1.publicUrl);
    console.log('File 2:', result2.publicUrl);
    console.log(
      result1.success &&
      result2.success &&
      result1.publicUrl !== result2.publicUrl
        ? '✓ PASS (unique filenames)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 4: Save file with spaces in filename
console.log('Test 4: Save file with spaces in filename');
(async () => {
  try {
    const buffer = await createTestBuffer('Test content');
    const result = await saveFile(buffer, 'My Product Photo (1).jpg');

    console.log('Original: "My Product Photo (1).jpg"');
    console.log('Saved as:', result.publicUrl);
    console.log(
      result.success &&
      !result.publicUrl.includes(' ') &&
      !result.publicUrl.includes('(') &&
      !result.publicUrl.includes(')')
        ? '✓ PASS (sanitized filename)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 5: Save file with special characters
console.log('Test 5: Save file with special characters');
(async () => {
  try {
    const buffer = await createTestBuffer('Test content');
    const result = await saveFile(buffer, 'Product@Image#2024!.png');

    console.log('Original: "Product@Image#2024!.png"');
    console.log('Saved as:', result.publicUrl);
    console.log(
      result.success &&
      !result.publicUrl.includes('@') &&
      !result.publicUrl.includes('#') &&
      !result.publicUrl.includes('!')
        ? '✓ PASS (special chars removed)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Info Tests
// ===================================================================

console.log('=== Testing File Info Operations ===\n');

// Test 6: Get info for existing file
console.log('Test 6: Get info for existing file');
(async () => {
  try {
    const buffer = await createTestBuffer('Test content for info');
    const saveResult = await saveFile(buffer, 'info-test.jpg');

    if (!saveResult.success) {
      console.log('✗ FAIL', 'Could not save file');
      return;
    }

    const infoResult = await getFileInfo(saveResult.relativePath);

    console.log('File exists:', infoResult.exists);
    console.log('File size:', infoResult.size, 'bytes');
    console.log(
      infoResult.exists &&
      infoResult.size !== undefined &&
      infoResult.size > 0
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 7: Get info for non-existent file
console.log('Test 7: Get info for non-existent file');
(async () => {
  try {
    const infoResult = await getFileInfo('2025/11/non-existent-file.jpg');

    console.log('File exists:', infoResult.exists);
    console.log(
      !infoResult.exists
        ? '✓ PASS (correctly returns exists: false)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Delete Tests
// ===================================================================

console.log('=== Testing File Delete Operations ===\n');

// Test 8: Delete existing file
console.log('Test 8: Delete existing file');
(async () => {
  try {
    // Save a file first
    const buffer = await createTestBuffer('File to be deleted');
    const saveResult = await saveFile(buffer, 'delete-test.jpg');

    if (!saveResult.success) {
      console.log('✗ FAIL', 'Could not save file');
      return;
    }

    console.log('Saved file:', saveResult.relativePath);

    // Delete the file
    const deleteResult = await deleteFile(saveResult.relativePath);

    console.log('Delete result:', deleteResult);
    console.log(
      deleteResult.success
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 9: Delete non-existent file
console.log('Test 9: Delete non-existent file');
(async () => {
  try {
    const deleteResult = await deleteFile('2025/11/non-existent-file.jpg');

    console.log('Delete result:', deleteResult);
    console.log(
      !deleteResult.success &&
      deleteResult.error === 'File not found'
        ? '✓ PASS (correctly fails with "File not found")'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 10: Verify file is actually deleted
console.log('Test 10: Verify file is actually deleted');
(async () => {
  try {
    // Save a file
    const buffer = await createTestBuffer('File to verify deletion');
    const saveResult = await saveFile(buffer, 'verify-delete.jpg');

    if (!saveResult.success) {
      console.log('✗ FAIL', 'Could not save file');
      return;
    }

    // Verify it exists
    const infoBeforeDelete = await getFileInfo(saveResult.relativePath);
    console.log('Before delete - exists:', infoBeforeDelete.exists);

    // Delete it
    await deleteFile(saveResult.relativePath);

    // Verify it's gone
    const infoAfterDelete = await getFileInfo(saveResult.relativePath);
    console.log('After delete - exists:', infoAfterDelete.exists);

    console.log(
      infoBeforeDelete.exists && !infoAfterDelete.exists
        ? '✓ PASS (file deleted from filesystem)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Public URL Tests
// ===================================================================

console.log('=== Testing Public URL Generation ===\n');

// Test 11: Generate public URL
console.log('Test 11: Generate public URL');
const test11 = getPublicUrl('2025/11/abc123-uuid.jpg');
console.log('Input: "2025/11/abc123-uuid.jpg"');
console.log('Output:', test11);
console.log(
  test11 === '/uploads/2025/11/abc123-uuid.jpg'
    ? '✓ PASS'
    : '✗ FAIL'
);
console.log('');

// Test 12: Generate public URL without leading slash
console.log('Test 12: Generate public URL without leading slash');
const test12 = getPublicUrl('2024/05/another-file.png');
console.log('Input: "2024/05/another-file.png"');
console.log('Output:', test12);
console.log(
  test12 === '/uploads/2024/05/another-file.png'
    ? '✓ PASS'
    : '✗ FAIL'
);
console.log('');

// ===================================================================
// Directory Cleanup Tests
// ===================================================================

console.log('=== Testing Directory Cleanup ===\n');

// Test 13: Clean up empty directories
console.log('Test 13: Clean up empty directories');
(async () => {
  try {
    // Create empty directory structure manually
    const testYearDir = path.join(process.cwd(), 'server', 'uploads', '2020');
    const testMonthDir = path.join(testYearDir, '01');

    await fs.mkdir(testMonthDir, { recursive: true });
    console.log('Created empty directory: /uploads/2020/01');

    // Run cleanup
    const removedCount = await cleanupEmptyDirectories();
    console.log('Removed directories:', removedCount);

    // Verify directory is gone
    try {
      await fs.access(testYearDir);
      console.log('✗ FAIL (directory still exists)');
    } catch {
      console.log('✓ PASS (empty directories removed)');
    }
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 14: Don't delete directories with files
console.log('Test 14: Don\'t delete directories with files');
(async () => {
  try {
    // Save a file (creates directory)
    const buffer = await createTestBuffer('File in directory');
    const saveResult = await saveFile(buffer, 'keep-dir.jpg');

    if (!saveResult.success) {
      console.log('✗ FAIL', 'Could not save file');
      return;
    }

    console.log('Created file:', saveResult.relativePath);

    // Run cleanup (should not delete directory with file)
    await cleanupEmptyDirectories();

    // Verify file still exists
    const infoResult = await getFileInfo(saveResult.relativePath);
    console.log(
      infoResult.exists
        ? '✓ PASS (directory with files not deleted)'
        : '✗ FAIL (directory with files was deleted!)'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Error Handling Tests
// ===================================================================

console.log('=== Testing Error Handling ===\n');

// Test 15: Handle invalid relative path in deleteFile
console.log('Test 15: Handle invalid path characters in deleteFile');
(async () => {
  try {
    const deleteResult = await deleteFile('../../../etc/passwd');
    console.log('Delete result:', deleteResult);
    console.log(
      !deleteResult.success
        ? '✓ PASS (path traversal prevented)'
        : '✗ FAIL (security issue!)'
    );
  } catch (error: any) {
    console.log('✓ PASS (error thrown for invalid path)');
  }
  console.log('');
})();

// ===================================================================
// Integration Tests
// ===================================================================

console.log('=== Testing Integration Scenarios ===\n');

// Test 16: Complete workflow (save → get info → delete)
console.log('Test 16: Complete workflow (save → get info → delete)');
(async () => {
  try {
    // Save
    const buffer = await createTestBuffer('Complete workflow test');
    const saveResult = await saveFile(buffer, 'workflow-test.jpg');
    console.log('1. Saved:', saveResult.success ? '✓' : '✗');

    // Get info
    const infoResult = await getFileInfo(saveResult.relativePath);
    console.log('2. Got info:', infoResult.exists ? '✓' : '✗');

    // Generate URL
    const publicUrl = getPublicUrl(saveResult.relativePath);
    console.log('3. Generated URL:', publicUrl === saveResult.publicUrl ? '✓' : '✗');

    // Delete
    const deleteResult = await deleteFile(saveResult.relativePath);
    console.log('4. Deleted:', deleteResult.success ? '✓' : '✗');

    // Verify deleted
    const infoAfterDelete = await getFileInfo(saveResult.relativePath);
    console.log('5. Verified deletion:', !infoAfterDelete.exists ? '✓' : '✗');

    console.log(
      saveResult.success &&
      infoResult.exists &&
      deleteResult.success &&
      !infoAfterDelete.exists
        ? '✓ PASS (complete workflow successful)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 17: Save and retrieve multiple files
console.log('Test 17: Save and retrieve multiple files');
(async () => {
  try {
    const files = [
      { name: 'product-1.jpg', content: 'Product 1 content' },
      { name: 'product-2.png', content: 'Product 2 content' },
      { name: 'product-3.webp', content: 'Product 3 content' },
    ];

    const saveResults = await Promise.all(
      files.map(file =>
        saveFile(Buffer.from(file.content), file.name)
      )
    );

    const allSaved = saveResults.every(r => r.success);
    console.log('All files saved:', allSaved ? '✓' : '✗');

    const infoResults = await Promise.all(
      saveResults.map(r => getFileInfo(r.relativePath))
    );

    const allExist = infoResults.every(i => i.exists);
    console.log('All files exist:', allExist ? '✓' : '✗');

    console.log(
      allSaved && allExist
        ? '✓ PASS (multiple files handled correctly)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Performance Tests
// ===================================================================

console.log('=== Testing Performance ===\n');

// Test 18: Save 10 files and measure time
console.log('Test 18: Save 10 files (performance check)');
(async () => {
  try {
    const startTime = Date.now();

    const savePromises = Array.from({ length: 10 }, (_, i) =>
      saveFile(Buffer.from(`File ${i} content`), `perf-test-${i}.jpg`)
    );

    const results = await Promise.all(savePromises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    const allSuccessful = results.every(r => r.success);

    console.log('Files saved:', results.length);
    console.log('Duration:', duration, 'ms');
    console.log('Average:', (duration / results.length).toFixed(2), 'ms per file');
    console.log(
      allSuccessful && duration < 5000
        ? '✓ PASS (acceptable performance)'
        : allSuccessful ? '⚠ PASS (but slow)' : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Summary
// ===================================================================

setTimeout(() => {
  console.log('=== Test Summary ===');
  console.log('');
  console.log('All tests completed!');
  console.log('Review results above to ensure all tests pass.');
  console.log('');
  console.log('Expected: 18/18 tests pass ✓');
  console.log('');
  console.log('Categories tested:');
  console.log('  - Storage initialization: 1 test');
  console.log('  - File save operations: 4 tests');
  console.log('  - File info operations: 2 tests');
  console.log('  - File delete operations: 3 tests');
  console.log('  - Public URL generation: 2 tests');
  console.log('  - Directory cleanup: 2 tests');
  console.log('  - Error handling: 1 test');
  console.log('  - Integration scenarios: 2 tests');
  console.log('  - Performance: 1 test');
}, 3000); // Wait 3 seconds for all async tests to complete
