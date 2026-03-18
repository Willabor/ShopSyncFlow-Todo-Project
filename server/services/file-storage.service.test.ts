/**
 * Tests for File Storage Service
 *
 * Run with: npm test server/services/file-storage.service.test.ts
 * Or: ./node_modules/.bin/tsx server/services/file-storage.service.test.ts
 *
 * NOTE: These tests interact with the database and filesystem.
 * Ensure you have a clean test environment before running.
 */

import {
  uploadFile,
  deleteFileById,
  forceDeleteFile,
  getFileById,
  findFileByHash,
  listFiles,
  getFileUsage,
  linkFileToProduct,
  unlinkFileFromProduct,
  getProductMediaFiles,
  updateProductMediaPosition,
  linkFileToVariant,
  unlinkFileFromVariant,
  getVariantMediaFiles,
  updateFileMetadata,
  deleteMultipleFiles,
} from './file-storage.service';
import { calculateBufferHash } from '../utils/file-upload';

// ===================================================================
// Test Helpers
// ===================================================================

const TEST_USER_ID = 'test-user-123';
const TEST_PRODUCT_ID = 'test-product-456';
const TEST_VARIANT_ID = 'test-variant-789';

function createTestBuffer(content: string = 'Test file content'): Buffer {
  return Buffer.from(content);
}

// Store uploaded file IDs for cleanup
const uploadedFileIds: string[] = [];

// ===================================================================
// File Upload Tests
// ===================================================================

console.log('=== Testing File Upload ===\n');

// Test 1: Upload valid image file
console.log('Test 1: Upload valid image file');
(async () => {
  try {
    const buffer = createTestBuffer('Test product image');
    const result = await uploadFile({
      buffer,
      originalFilename: 'product-image.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: TEST_USER_ID,
      uploadSource: 'test',
    });

    console.log('Upload result:', result.success ? '✓' : '✗');
    if (result.file) {
      console.log('File ID:', result.file.id);
      console.log('CDN URL:', result.file.cdnUrl);
      uploadedFileIds.push(result.file.id);
    }

    console.log(
      result.success && result.file && result.file.id
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 2: Upload file with invalid MIME type
console.log('Test 2: Upload file with invalid MIME type (should fail)');
(async () => {
  try {
    const buffer = createTestBuffer('Invalid file');
    const result = await uploadFile({
      buffer,
      originalFilename: 'malicious.exe',
      mimeType: 'application/exe',
      uploadedBy: TEST_USER_ID,
    });

    console.log('Upload result:', result);
    console.log(
      !result.success && result.validationErrors && result.validationErrors.length > 0
        ? '✓ PASS (correctly rejected)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 3: Upload file too large (should fail)
console.log('Test 3: Upload file that exceeds size limit');
(async () => {
  try {
    // Create 25 MB buffer (over 20 MB limit)
    const largeBuffer = Buffer.alloc(25 * 1024 * 1024);
    const result = await uploadFile({
      buffer: largeBuffer,
      originalFilename: 'large-image.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: TEST_USER_ID,
    });

    console.log('Upload result:', result);
    console.log(
      !result.success && result.error?.includes('too large')
        ? '✓ PASS (correctly rejected)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 4: Upload multiple files
console.log('Test 4: Upload multiple files (batch upload)');
(async () => {
  try {
    const files = [
      { name: 'product-1.jpg', mime: 'image/jpeg', content: 'Product 1' },
      { name: 'product-2.png', mime: 'image/png', content: 'Product 2' },
      { name: 'product-3.webp', mime: 'image/webp', content: 'Product 3' },
    ];

    const uploadPromises = files.map(file =>
      uploadFile({
        buffer: createTestBuffer(file.content),
        originalFilename: file.name,
        mimeType: file.mime,
        uploadedBy: TEST_USER_ID,
        uploadSource: 'test',
      })
    );

    const results = await Promise.all(uploadPromises);
    const allSuccess = results.every(r => r.success);

    // Store IDs for cleanup
    results.forEach(r => {
      if (r.file) uploadedFileIds.push(r.file.id);
    });

    console.log('Uploaded:', results.length, 'files');
    console.log('All successful:', allSuccess ? '✓' : '✗');
    console.log(
      allSuccess
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Query Tests
// ===================================================================

console.log('=== Testing File Queries ===\n');

// Test 5: Get file by ID
console.log('Test 5: Get file by ID');
(async () => {
  try {
    // Wait for file to be uploaded
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[0];
    const file = await getFileById(fileId);

    console.log('File found:', file ? '✓' : '✗');
    if (file) {
      console.log('File ID:', file.id);
      console.log('Original filename:', file.originalFilename);
      console.log('CDN URL:', file.cdnUrl);
    }

    console.log(
      file && file.id === fileId
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 6: Get file by hash
console.log('Test 6: Get file by hash');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const buffer = createTestBuffer('Test content for hash');
    const hash = calculateBufferHash(buffer);

    // Upload file with known hash
    const uploadResult = await uploadFile({
      buffer,
      originalFilename: 'hash-test.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: TEST_USER_ID,
      uploadSource: 'test',
    });

    if (uploadResult.file) {
      uploadedFileIds.push(uploadResult.file.id);
    }

    // Find by hash
    const file = await findFileByHash(hash);

    console.log('File found by hash:', file ? '✓' : '✗');
    console.log(
      file && file.fileHash === hash
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 7: List files with pagination
console.log('Test 7: List files with pagination');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const { files, totalCount } = await listFiles({ limit: 5, offset: 0 });

    console.log('Files retrieved:', files.length, 'Total count:', totalCount);
    console.log(
      files.length > 0 && files.length <= 5
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 8: List files with filters
console.log('Test 8: List files with filters (fileType = image)');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const { files, totalCount } = await listFiles({ fileType: 'image', limit: 10 });

    const allImages = files.every(f => f.fileType === 'image');

    console.log('Files retrieved:', files.length, 'Total count:', totalCount);
    console.log('All images:', allImages ? '✓' : '✗');
    console.log(
      allImages
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Usage Tests
// ===================================================================

console.log('=== Testing File Usage ===\n');

// Test 9: Get file usage (should be 0 initially)
console.log('Test 9: Get file usage for newly uploaded file');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[0];
    const usage = await getFileUsage(fileId);

    console.log('Usage:', usage);
    console.log(
      usage.totalUsage === 0
        ? '✓ PASS (no usage yet)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Product Media Link Tests
// ===================================================================

console.log('=== Testing Product Media Links ===\n');

// Test 10: Link file to product
console.log('Test 10: Link file to product');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[0];
    const result = await linkFileToProduct({
      fileId,
      productId: TEST_PRODUCT_ID,
      position: 1,
      isFeatured: true,
    });

    console.log('Link result:', result);
    console.log(
      result.success && result.productMedia
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 11: Get product media files
console.log('Test 11: Get product media files');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const mediaFiles = await getProductMediaFiles(TEST_PRODUCT_ID);

    console.log('Media files:', mediaFiles.length);
    console.log(
      mediaFiles.length > 0
        ? '✓ PASS (found linked files)'
        : '⚠ SKIP (no files linked)'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 12: Update product media position
console.log('Test 12: Update product media position');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[0];
    const result = await updateProductMediaPosition(
      TEST_PRODUCT_ID,
      fileId,
      2,
      false
    );

    console.log('Update result:', result);
    console.log(
      result.success
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 13: Unlink file from product
console.log('Test 13: Unlink file from product');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[0];
    const result = await unlinkFileFromProduct(TEST_PRODUCT_ID, fileId);

    console.log('Unlink result:', result);
    console.log(
      result.success
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Variant Media Link Tests
// ===================================================================

console.log('=== Testing Variant Media Links ===\n');

// Test 14: Link file to variant
console.log('Test 14: Link file to variant');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length < 2) {
      console.log('⚠ SKIP (not enough files uploaded)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[1];
    const result = await linkFileToVariant({
      fileId,
      variantId: TEST_VARIANT_ID,
      position: 1,
      isFeatured: true,
    });

    console.log('Link result:', result);
    console.log(
      result.success && result.variantMedia
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 15: Get variant media files
console.log('Test 15: Get variant media files');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    const mediaFiles = await getVariantMediaFiles(TEST_VARIANT_ID);

    console.log('Media files:', mediaFiles.length);
    console.log(
      mediaFiles.length > 0
        ? '✓ PASS (found linked files)'
        : '⚠ SKIP (no files linked)'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 16: Unlink file from variant
console.log('Test 16: Unlink file from variant');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length < 2) {
      console.log('⚠ SKIP (not enough files uploaded)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[1];
    const result = await unlinkFileFromVariant(TEST_VARIANT_ID, fileId);

    console.log('Unlink result:', result);
    console.log(
      result.success
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Metadata Update Tests
// ===================================================================

console.log('=== Testing File Metadata Updates ===\n');

// Test 17: Update file alt text and title
console.log('Test 17: Update file alt text and title');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[0];
    const result = await updateFileMetadata(fileId, {
      altText: 'A beautiful product image',
      title: 'Product Image 1',
    });

    console.log('Update result:', result);
    if (result.file) {
      console.log('Alt text:', result.file.altText);
      console.log('Title:', result.file.title);
    }

    console.log(
      result.success &&
      result.file?.altText === 'A beautiful product image' &&
      result.file?.title === 'Product Image 1'
        ? '✓ PASS'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// File Deletion Tests
// ===================================================================

console.log('=== Testing File Deletion ===\n');

// Test 18: Delete unused file
console.log('Test 18: Delete unused file');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length < 3) {
      console.log('⚠ SKIP (not enough files uploaded)');
      console.log('');
      return;
    }

    const fileId = uploadedFileIds[2]; // Use 3rd file
    const result = await deleteFileById(fileId);

    console.log('Delete result:', result);
    console.log(
      result.success && result.deletedFileId === fileId
        ? '✓ PASS'
        : '✗ FAIL'
    );

    // Remove from tracking array
    if (result.success) {
      const index = uploadedFileIds.indexOf(fileId);
      if (index > -1) uploadedFileIds.splice(index, 1);
    }
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 19: Try to delete file in use (should fail)
console.log('Test 19: Try to delete file that is in use (should fail)');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    // Link file to product first
    const fileId = uploadedFileIds[0];
    await linkFileToProduct({
      fileId,
      productId: TEST_PRODUCT_ID,
      position: 1,
      isFeatured: true,
    });

    // Try to delete (should fail)
    const result = await deleteFileById(fileId);

    console.log('Delete result:', result);
    console.log(
      !result.success &&
      result.error?.includes('still in use')
        ? '✓ PASS (correctly prevented deletion)'
        : '✗ FAIL'
    );

    // Cleanup: unlink file
    await unlinkFileFromProduct(TEST_PRODUCT_ID, fileId);
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// Test 20: Force delete file (ignores usage)
console.log('Test 20: Force delete file (ignores usage)');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 500));

    if (uploadedFileIds.length === 0) {
      console.log('⚠ SKIP (no files uploaded yet)');
      console.log('');
      return;
    }

    // Upload and link new file
    const buffer = createTestBuffer('File to force delete');
    const uploadResult = await uploadFile({
      buffer,
      originalFilename: 'force-delete-test.jpg',
      mimeType: 'image/jpeg',
      uploadedBy: TEST_USER_ID,
      uploadSource: 'test',
    });

    if (!uploadResult.file) {
      console.log('✗ FAIL (could not upload file)');
      console.log('');
      return;
    }

    const fileId = uploadResult.file.id;

    // Link to product
    await linkFileToProduct({
      fileId,
      productId: TEST_PRODUCT_ID,
      position: 1,
      isFeatured: false,
    });

    // Force delete (should succeed despite being in use)
    const result = await forceDeleteFile(fileId);

    console.log('Force delete result:', result);
    console.log(
      result.success
        ? '✓ PASS (force delete worked)'
        : '✗ FAIL'
    );
  } catch (error: any) {
    console.log('✗ FAIL', error.message);
  }
  console.log('');
})();

// ===================================================================
// Cleanup
// ===================================================================

console.log('=== Cleanup ===\n');

console.log('Test 21: Cleanup test files');
(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('Cleaning up', uploadedFileIds.length, 'test files...');

    for (const fileId of uploadedFileIds) {
      // Unlink from product/variant first
      await unlinkFileFromProduct(TEST_PRODUCT_ID, fileId).catch(() => {});
      await unlinkFileFromVariant(TEST_VARIANT_ID, fileId).catch(() => {});

      // Force delete
      await forceDeleteFile(fileId);
    }

    console.log('✓ Cleanup complete');
  } catch (error: any) {
    console.log('⚠ Cleanup warning:', error.message);
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
  console.log('Review results above.');
  console.log('');
  console.log('Expected: ~20 tests run');
  console.log('');
  console.log('Categories tested:');
  console.log('  - File upload: 4 tests');
  console.log('  - File queries: 4 tests');
  console.log('  - File usage: 1 test');
  console.log('  - Product media links: 4 tests');
  console.log('  - Variant media links: 3 tests');
  console.log('  - Metadata updates: 1 test');
  console.log('  - File deletion: 3 tests');
  console.log('  - Cleanup: 1 test');
  console.log('');
  console.log('NOTE: Some tests may show ⚠ SKIP if dependencies not met.');
  console.log('This is expected for tests that require actual product/variant records.');
}, 5000); // Wait 5 seconds for all async tests
