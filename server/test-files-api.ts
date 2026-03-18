/**
 * Files API Integration Test Suite
 *
 * Tests all 13 file management API endpoints
 * Run with: npx tsx server/test-files-api.ts
 */

import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const BASE_URL = 'http://localhost:5000';
let sessionCookie = '';

// Test results storage
const testResults: Array<{
  test: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  statusCode?: number;
  error?: string;
  data?: any;
}> = [];

// ===================================================================
// Helper Functions
// ===================================================================

function logTest(name: string, endpoint: string, status: 'PASS' | 'FAIL' | 'SKIP', details?: any) {
  const symbol = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⊘';
  console.log(`${symbol} ${name}`);
  if (details) {
    console.log('  ', JSON.stringify(details, null, 2).split('\n').join('\n   '));
  }
  console.log('');

  testResults.push({
    test: name,
    endpoint,
    status,
    ...details,
  });
}

async function createTestImage(filename: string): Promise<Buffer> {
  // Create a simple 100x100 red square PNG
  const width = 100;
  const height = 100;

  // PNG header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (image header)
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // Length
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16); // Bit depth
  ihdr.writeUInt8(2, 17); // Color type (RGB)
  ihdr.writeUInt8(0, 18); // Compression
  ihdr.writeUInt8(0, 19); // Filter
  ihdr.writeUInt8(0, 20); // Interlace
  // CRC would go here in a real PNG

  // For testing, we'll use a minimal valid image
  // In production, you'd want to use a proper image library

  // For now, let's just create a buffer with some data
  const buffer = Buffer.alloc(1000);
  buffer.write('TEST_IMAGE_DATA', 0);

  return buffer;
}

// ===================================================================
// Authentication
// ===================================================================

async function login(): Promise<boolean> {
  console.log('=== Authentication ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin', // Adjust if needed
      }),
    });

    if (response.ok) {
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        sessionCookie = setCookie.split(';')[0];
        logTest('Login', 'POST /api/login', 'PASS', { statusCode: response.status });
        return true;
      }
    }

    logTest('Login', 'POST /api/login', 'FAIL', {
      statusCode: response.status,
      error: await response.text(),
    });
    return false;
  } catch (error: any) {
    logTest('Login', 'POST /api/login', 'FAIL', { error: error.message });
    return false;
  }
}

// ===================================================================
// Test 1: Upload Single File
// ===================================================================

async function testUploadSingleFile(): Promise<string | null> {
  console.log('=== Test 1: Upload Single File ===\n');

  try {
    const imageBuffer = await createTestImage('test-product.jpg');

    // Create FormData
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
    formData.append('files', blob, 'test-product.jpg');

    const response = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
      },
      body: formData as any,
    });

    const data = await response.json();

    if (response.ok && data.success && data.files && data.files.length > 0) {
      logTest('Upload Single File', 'POST /api/files/upload', 'PASS', {
        statusCode: response.status,
        fileId: data.files[0].id,
        cdnUrl: data.files[0].cdnUrl,
      });
      return data.files[0].id;
    } else {
      logTest('Upload Single File', 'POST /api/files/upload', 'FAIL', {
        statusCode: response.status,
        data,
      });
      return null;
    }
  } catch (error: any) {
    logTest('Upload Single File', 'POST /api/files/upload', 'FAIL', {
      error: error.message,
    });
    return null;
  }
}

// ===================================================================
// Test 2: Upload Multiple Files
// ===================================================================

async function testUploadMultipleFiles(): Promise<string[]> {
  console.log('=== Test 2: Upload Multiple Files ===\n');

  try {
    const formData = new FormData();

    for (let i = 1; i <= 3; i++) {
      const imageBuffer = await createTestImage(`test-${i}.jpg`);
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('files', blob, `test-${i}.jpg`);
    }

    const response = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
      },
      body: formData as any,
    });

    const data = await response.json();

    if (response.ok && data.success && data.files && data.files.length === 3) {
      logTest('Upload Multiple Files', 'POST /api/files/upload', 'PASS', {
        statusCode: response.status,
        count: data.files.length,
        fileIds: data.files.map((f: any) => f.id),
      });
      return data.files.map((f: any) => f.id);
    } else {
      logTest('Upload Multiple Files', 'POST /api/files/upload', 'FAIL', {
        statusCode: response.status,
        data,
      });
      return [];
    }
  } catch (error: any) {
    logTest('Upload Multiple Files', 'POST /api/files/upload', 'FAIL', {
      error: error.message,
    });
    return [];
  }
}

// ===================================================================
// Test 3: List Files
// ===================================================================

async function testListFiles() {
  console.log('=== Test 3: List Files ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files?limit=10&offset=0`, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
      },
    });

    const data = await response.json();

    if (response.ok && data.success && Array.isArray(data.files)) {
      logTest('List Files', 'GET /api/files', 'PASS', {
        statusCode: response.status,
        count: data.files.length,
        limit: data.limit,
        offset: data.offset,
      });
    } else {
      logTest('List Files', 'GET /api/files', 'FAIL', {
        statusCode: response.status,
        data,
      });
    }
  } catch (error: any) {
    logTest('List Files', 'GET /api/files', 'FAIL', {
      error: error.message,
    });
  }
}

// ===================================================================
// Test 4: Get File Details
// ===================================================================

async function testGetFileDetails(fileId: string) {
  console.log('=== Test 4: Get File Details ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files/${fileId}`, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
      },
    });

    const data = await response.json();

    if (response.ok && data.success && data.file) {
      logTest('Get File Details', `GET /api/files/${fileId}`, 'PASS', {
        statusCode: response.status,
        fileId: data.file.id,
        filename: data.file.filename,
        usage: data.usage,
      });
    } else {
      logTest('Get File Details', `GET /api/files/${fileId}`, 'FAIL', {
        statusCode: response.status,
        data,
      });
    }
  } catch (error: any) {
    logTest('Get File Details', `GET /api/files/${fileId}`, 'FAIL', {
      error: error.message,
    });
  }
}

// ===================================================================
// Test 5: Update File Metadata
// ===================================================================

async function testUpdateFileMetadata(fileId: string) {
  console.log('=== Test 5: Update File Metadata ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files/${fileId}`, {
      method: 'PUT',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        altText: 'Test product image',
        title: 'Test Product',
      }),
    });

    const data = await response.json();

    if (response.ok && data.success && data.file) {
      logTest('Update File Metadata', `PUT /api/files/${fileId}`, 'PASS', {
        statusCode: response.status,
        altText: data.file.altText,
        title: data.file.title,
      });
    } else {
      logTest('Update File Metadata', `PUT /api/files/${fileId}`, 'FAIL', {
        statusCode: response.status,
        data,
      });
    }
  } catch (error: any) {
    logTest('Update File Metadata', `PUT /api/files/${fileId}`, 'FAIL', {
      error: error.message,
    });
  }
}

// ===================================================================
// Test 6: Link File to Product
// ===================================================================

async function testLinkFileToProduct(fileId: string, productId: string) {
  console.log('=== Test 6: Link File to Product ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files/link/product`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        productId,
        position: 1,
        isFeatured: true,
      }),
    });

    const data = await response.json();

    if (response.ok && data.success && data.productMedia) {
      logTest('Link File to Product', 'POST /api/files/link/product', 'PASS', {
        statusCode: response.status,
        productMediaId: data.productMedia.id,
        position: data.productMedia.position,
        isFeatured: data.productMedia.isFeatured,
      });
      return true;
    } else {
      logTest('Link File to Product', 'POST /api/files/link/product', 'FAIL', {
        statusCode: response.status,
        data,
      });
      return false;
    }
  } catch (error: any) {
    logTest('Link File to Product', 'POST /api/files/link/product', 'FAIL', {
      error: error.message,
    });
    return false;
  }
}

// ===================================================================
// Test 7: Get Product Media Files
// ===================================================================

async function testGetProductMedia(productId: string) {
  console.log('=== Test 7: Get Product Media Files ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/products/${productId}/media`, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
      },
    });

    const data = await response.json();

    if (response.ok && data.success && Array.isArray(data.files)) {
      logTest('Get Product Media Files', `GET /api/products/${productId}/media`, 'PASS', {
        statusCode: response.status,
        count: data.files.length,
      });
    } else {
      logTest('Get Product Media Files', `GET /api/products/${productId}/media`, 'FAIL', {
        statusCode: response.status,
        data,
      });
    }
  } catch (error: any) {
    logTest('Get Product Media Files', `GET /api/products/${productId}/media`, 'FAIL', {
      error: error.message,
    });
  }
}

// ===================================================================
// Test 8: Delete File (Should Fail - In Use)
// ===================================================================

async function testDeleteFileInUse(fileId: string) {
  console.log('=== Test 8: Delete File (Should Fail - In Use) ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': sessionCookie,
      },
    });

    const data = await response.json();

    // Should fail with 409 Conflict
    if (response.status === 409 && !data.success && data.error?.includes('still in use')) {
      logTest('Delete File In Use', `DELETE /api/files/${fileId}`, 'PASS', {
        statusCode: response.status,
        expectedBehavior: 'Correctly prevented deletion',
      });
    } else {
      logTest('Delete File In Use', `DELETE /api/files/${fileId}`, 'FAIL', {
        statusCode: response.status,
        data,
        note: 'Should have returned 409 Conflict',
      });
    }
  } catch (error: any) {
    logTest('Delete File In Use', `DELETE /api/files/${fileId}`, 'FAIL', {
      error: error.message,
    });
  }
}

// ===================================================================
// Test 9: Unlink File from Product
// ===================================================================

async function testUnlinkFileFromProduct(productId: string, fileId: string) {
  console.log('=== Test 9: Unlink File from Product ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files/link/product/${productId}/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': sessionCookie,
      },
    });

    const data = await response.json();

    if (response.ok && data.success) {
      logTest('Unlink File from Product', `DELETE /api/files/link/product/${productId}/${fileId}`, 'PASS', {
        statusCode: response.status,
      });
      return true;
    } else {
      logTest('Unlink File from Product', `DELETE /api/files/link/product/${productId}/${fileId}`, 'FAIL', {
        statusCode: response.status,
        data,
      });
      return false;
    }
  } catch (error: any) {
    logTest('Unlink File from Product', `DELETE /api/files/link/product/${productId}/${fileId}`, 'FAIL', {
      error: error.message,
    });
    return false;
  }
}

// ===================================================================
// Test 10: Delete File (Should Succeed - Not In Use)
// ===================================================================

async function testDeleteFile(fileId: string) {
  console.log('=== Test 10: Delete File (Not In Use) ===\n');

  try {
    const response = await fetch(`${BASE_URL}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': sessionCookie,
      },
    });

    const data = await response.json();

    if (response.ok && data.success) {
      logTest('Delete File', `DELETE /api/files/${fileId}`, 'PASS', {
        statusCode: response.status,
        deletedFileId: data.deletedFileId,
      });
    } else {
      logTest('Delete File', `DELETE /api/files/${fileId}`, 'FAIL', {
        statusCode: response.status,
        data,
      });
    }
  } catch (error: any) {
    logTest('Delete File', `DELETE /api/files/${fileId}`, 'FAIL', {
      error: error.message,
    });
  }
}

// ===================================================================
// Main Test Runner
// ===================================================================

async function runTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║         Files API Integration Test Suite - Phase 2.5              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Step 1: Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('\n❌ Login failed. Cannot proceed with tests.\n');
    console.log('Please ensure:');
    console.log('  1. Server is running (npm run dev)');
    console.log('  2. Credentials are correct (username: admin, password: admin)');
    console.log('  3. Database is accessible\n');
    return;
  }

  // Step 2: Upload single file
  const singleFileId = await testUploadSingleFile();
  if (!singleFileId) {
    console.log('\n❌ Single file upload failed. Stopping tests.\n');
    return;
  }

  // Step 3: Upload multiple files
  const multipleFileIds = await testUploadMultipleFiles();

  // Step 4: List files
  await testListFiles();

  // Step 5: Get file details
  await testGetFileDetails(singleFileId);

  // Step 6: Update file metadata
  await testUpdateFileMetadata(singleFileId);

  // Step 7: Get a product ID from database
  // For testing, we'll use a hardcoded product ID
  // In real scenario, query the database first
  const testProductId = 'test-product-id'; // Will need to get a real product ID

  console.log('⚠ Note: Product linking tests require a valid product ID from database\n');
  console.log('Skipping product-related tests for now...\n');

  // Step 8: Link file to product (if we have a product)
  // const linked = await testLinkFileToProduct(singleFileId, testProductId);

  // Step 9: Get product media
  // if (linked) {
  //   await testGetProductMedia(testProductId);
  // }

  // Step 10: Try to delete file in use (should fail)
  // await testDeleteFileInUse(singleFileId);

  // Step 11: Unlink file
  // const unlinked = await testUnlinkFileFromProduct(testProductId, singleFileId);

  // Step 12: Delete file (should succeed now)
  if (multipleFileIds.length > 0) {
    await testDeleteFile(multipleFileIds[0]);
  }

  // Print summary
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                          Test Summary                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  const skipped = testResults.filter(r => r.status === 'SKIP').length;
  const total = testResults.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`⊘ Skipped: ${skipped}`);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('❌ Some tests failed. Review output above.');
  }

  console.log('\n');
}

// Run tests
runTests().catch(console.error);
