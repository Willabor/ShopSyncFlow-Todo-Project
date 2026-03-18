/**
 * CSV Order Parser
 *
 * Parses vendor order CSV and XLS files and extracts unique products for Content Studio.
 * Groups line items by Style Number + Color to identify unique products with variants.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedProduct {
  // Unique identifiers
  styleNumber: string;        // EP12429
  productName: string;         // FREEWAY PANTS
  vendor: string;              // EPTM

  // Product details
  color: string;               // BLACK
  description: string;          // Vendor description (needs SEO rewrite)
  features: string[];          // Extracted from description
  category: string;            // Auto-detected (Bottoms, Outerwear, etc.)
  imageUrl?: string;           // Product image URL from CSV

  // Pricing
  msrp: number;                // $85
  wholesalePrice: number;       // $34

  // Variants
  sizes: string[];             // [S-30, M-32, L-34, XL-36, 2XL-38]
  skus: string[];              // [EP12429-S-30, EP12429-M-32, ...]

  // Raw data
  rawData: OrderLineItem[];    // All CSV rows for this product
}

export interface OrderLineItem {
  [key: string]: string;       // Dynamic CSV columns
}

export interface CSVParseResult {
  success: boolean;
  products: ParsedProduct[];
  orderInfo: {
    orderNumber?: string;
    orderDate?: string;
    vendor?: string;
    totalItems: number;
  };
  error?: string;
}

/**
 * Convert XLS file to CSV-compatible data
 */
async function convertXLSToCSV(file: File): Promise<OrderLineItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Get raw data as array of arrays
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

        // 🔍 DEBUG: Log file structure
        console.log('📊 XLS FILE STRUCTURE:');
        console.log(`Total rows: ${rawData.length}`);
        console.log(`First 10 rows (preview):`, rawData.slice(0, 10));
        console.log(`Row 55 (index 54):`, rawData[54]);
        console.log(`Row 56 (index 55):`, rawData[55]);

        // Extract order metadata from rows 1-54 (vertical key-value format)
        const metadata: Record<string, any> = {};
        for (let i = 0; i < Math.min(54, rawData.length); i++) {
          const row = rawData[i];
          if (row && row[0] && row[1]) {
            const key = String(row[0]).trim();
            const value = String(row[1]).trim();
            metadata[key] = value;
          }
        }

        console.log('📋 Extracted metadata:', metadata);

        // 🔍 DYNAMIC HEADER DETECTION: Search for the header row instead of assuming row 55
        // Look for row containing "Style Number" or "SKU Number" (common header identifiers)
        let headerRowIndex = -1;
        for (let i = 50; i < Math.min(rawData.length, 60); i++) {
          const row = rawData[i];
          const rowStr = JSON.stringify(row).toLowerCase();
          if (rowStr.includes('style number') || rowStr.includes('sku number') || rowStr.includes('imageurl')) {
            headerRowIndex = i;
            console.log(`✅ Found header row at index ${i} (row ${i + 1})`);
            break;
          }
        }

        if (headerRowIndex === -1) {
          console.error(`❌ Could not find header row between rows 50-60`);
          console.error('First row in search range:', rawData[50]);
          throw new Error('XLS file does not contain recognizable product headers (looking for "Style Number", "SKU Number", or "ImageURL")');
        }

        const productHeaderRow = rawData[headerRowIndex];
        const productDataRows = rawData.slice(headerRowIndex + 1);  // Data starts AFTER header row

        console.log(`📊 Header row: ${headerRowIndex + 1}, Data rows start: ${headerRowIndex + 2}`);

        // Map XLS product headers to positions
        const xlsHeaders = productHeaderRow.map((h: any) => String(h).trim());
        console.log('📌 Product headers found:', xlsHeaders);

        const headerMap: Record<string, number> = {};
        xlsHeaders.forEach((header: string, idx: number) => {
          headerMap[header] = idx;
        });

        console.log('🗺️  Header mapping:', headerMap);

        // Convert to CSV-like format
        const csvData: OrderLineItem[] = [];

        console.log(`🔄 Processing ${productDataRows.length} product rows...`);

        for (const productRow of productDataRows) {
          const row = productRow as any[];

          // Skip empty rows
          if (!row || row.length === 0 || !row[headerMap['Style Number']]) {
            console.log('⏭️  Skipping empty row or row without Style Number:', row);
            continue;
          }

          // Map XLS columns to CSV format
          const lineItem: OrderLineItem = {
            'Showroom Name': metadata['Showroom Name'] || metadata['boom Showroom Name'] || metadata['Vendor'] || metadata['Brand'] || '',
            'Order Number': metadata['Order Number'] || '',
            'Customer PO': metadata['Customer PO'] || '',
            'Style Number': row[headerMap['Style Number']] || '',
            'Option Name': row[headerMap['Option Name']] || '',  // Color
            'Size': row[headerMap['Size']] || '',
            'Product Name': row[headerMap['name']] || '',
            'Description': row[headerMap['description']] || '',
            'MSRP': row[headerMap['MSRP']] || '',
            'Original Price': row[headerMap['Original Price']] || '',
            'Image Src': row[headerMap['ImageURL']] || ''  // IMAGE URL MAPPING!
          };

          console.log('✅ Parsed line item:', lineItem);
          csvData.push(lineItem);
        }

        console.log(`✅ XLS conversion complete: ${csvData.length} line items extracted`);
        resolve(csvData);
      } catch (error: any) {
        reject(new Error(`XLS conversion failed: ${error.message}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read XLS file'));
    reader.readAsBinaryString(file);
  });
}

/**
 * Parse vendor order CSV or XLS file
 */
export async function parseOrderCSV(file: File): Promise<CSVParseResult> {
  console.log('🚀 parseOrderCSV() CALLED');
  console.log('📁 File name:', file.name);
  console.log('📏 File size:', file.size, 'bytes');
  console.log('📄 File type:', file.type);

  // Check if file is XLS/XLSX
  const isXLS = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');
  console.log('🔍 Is XLS file?', isXLS);

  if (isXLS) {
    // Handle XLS files
    console.log('🔄 Starting XLS conversion...');
    try {
      const csvData = await convertXLSToCSV(file);
      console.log('✅ XLS converted, extracting products...');
      const products = extractUniqueProducts(csvData);
      const orderInfo = extractOrderInfo(csvData);

      return {
        success: true,
        products,
        orderInfo,
      };
    } catch (error) {
      console.error('❌ XLS parsing error:', error);
      return {
        success: false,
        products: [],
        orderInfo: { totalItems: 0 },
        error: error instanceof Error ? error.message : 'XLS parsing error'
      };
    }
  }

  // Handle CSV files
  return new Promise((resolve) => {
    Papa.parse<OrderLineItem>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<OrderLineItem>) => {
        try {
          if (results.errors.length > 0) {
            resolve({
              success: false,
              products: [],
              orderInfo: { totalItems: 0 },
              error: `CSV parsing error: ${results.errors[0].message}`
            });
            return;
          }

          const products = extractUniqueProducts(results.data);
          const orderInfo = extractOrderInfo(results.data);

          resolve({
            success: true,
            products,
            orderInfo,
          });
        } catch (error) {
          resolve({
            success: false,
            products: [],
            orderInfo: { totalItems: 0 },
            error: error instanceof Error ? error.message : 'Unknown parsing error'
          });
        }
      },
      error: (error: Error) => {
        resolve({
          success: false,
          products: [],
          orderInfo: { totalItems: 0 },
          error: `File read error: ${error.message}`
        });
      }
    });
  });
}

/**
 * Extract unique products from CSV rows by grouping by Style Number AND Color
 * Each color variant is treated as a separate product (important for size mapping)
 */
function extractUniqueProducts(rows: OrderLineItem[]): ParsedProduct[] {
  console.log('🔍 extractUniqueProducts() called with', rows.length, 'rows');

  if (rows.length === 0) {
    console.error('❌ No data found - rows array is empty');
    throw new Error('No data found in CSV file!!');
  }

  console.log('First row sample:', rows[0]);

  // Group rows by Style Number + Color (each color variant is a separate product)
  const grouped = new Map<string, OrderLineItem[]>();

  for (const row of rows) {
    const styleNumber = row['Style Number'] || row['Style'] || row['SKU'] || '';
    const color = row['Option Name'] || row['Color'] || row['Variant'] || 'Default';

    if (!styleNumber) {
      console.warn('⚠️  Row missing Style Number:', row);
      continue;
    }

    // Create unique key combining style number and color
    const productKey = `${styleNumber}|${color}`;

    if (!grouped.has(productKey)) {
      grouped.set(productKey, []);
    }
    grouped.get(productKey)!.push(row);
  }

  console.log(`📦 Grouped into ${grouped.size} unique products`);

  // Extract product data from each group
  const products: ParsedProduct[] = [];

  grouped.forEach((lineItems, productKey) => {
    const firstRow = lineItems[0];

    // Extract style number from the composite key (before the pipe)
    const styleNumber = productKey.split('|')[0];

    // Extract vendor/brand
    let vendor = firstRow['Showroom Name'] || firstRow['Vendor'] || firstRow['Brand'] || '';
    vendor = vendor.replace(/\.$/, '').trim(); // Remove trailing period

    // If vendor is missing or unclear, we'll prompt user later
    if (!vendor || vendor === 'N/A' || vendor.toLowerCase() === 'unknown') {
      vendor = ''; // Will trigger user prompt in UI
    }

    // Extract product name
    const productName = firstRow['Product Name'] || firstRow['Product'] || firstRow['Description'] || '';

    // Extract description
    const description = firstRow['Description'] || '';

    // Extract color/option
    const color = firstRow['Option Name'] || firstRow['Color'] || firstRow['Variant'] || '';

    // Extract image URL (try common field names)
    const imageUrl = firstRow['Image Src'] ||
                     firstRow['Image URL'] ||
                     firstRow['Product Image'] ||
                     firstRow['Image'] ||
                     firstRow['Src'] ||
                     firstRow['Photo URL'] ||
                     firstRow['Image Link'] ||
                     '';

    // Extract pricing
    const msrp = parseFloat(firstRow['MSRP'] || firstRow['Retail Price'] || '0');
    const wholesalePrice = parseFloat(firstRow['Original Price'] || firstRow['Wholesale Price'] || firstRow['Cost'] || '0');

    // Extract all sizes and SKUs from the group
    const sizes = lineItems.map((row: OrderLineItem) => row['Size'] || '').filter(Boolean);
    const skus = lineItems.map((row: OrderLineItem) => row['SKU Number'] || row['SKU'] || '').filter(Boolean);

    // Extract features from description
    const features = extractFeatures(description);

    // Auto-detect category
    const category = detectCategory(productName);

    products.push({
      styleNumber,
      productName,
      vendor,
      color,
      description,
      features,
      category,
      imageUrl: imageUrl || undefined, // Only include if present
      msrp,
      wholesalePrice,
      sizes,
      skus,
      rawData: lineItems
    });
  });

  return products;
}

/**
 * Extract order-level information
 */
function extractOrderInfo(rows: OrderLineItem[]): CSVParseResult['orderInfo'] {
  if (rows.length === 0) {
    return { totalItems: 0 };
  }

  const firstRow = rows[0];

  return {
    orderNumber: firstRow['Order Number'] || firstRow['PO Number'] || undefined,
    orderDate: firstRow['Order Date'] || firstRow['Date Created'] || undefined,
    vendor: firstRow['Showroom Name'] || firstRow['Vendor'] || undefined,
    totalItems: rows.length
  };
}

/**
 * Extract features from product description
 * Vendor descriptions often have line-separated features
 */
function extractFeatures(description: string): string[] {
  if (!description) return [];

  // Split by newlines
  const lines = description
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Filter out intro/marketing text
  const features = lines.filter(line => {
    const lower = line.toLowerCase();

    // Skip lines that are clearly intro text
    if (lower.includes('feature') && lower.includes('the')) return false;
    if (lower.startsWith('the ') && line.length > 100) return false;
    if (lower.startsWith('this ') && line.length > 100) return false;

    // Keep lines that look like features (short, descriptive)
    return line.length < 150 && !line.endsWith('.');
  });

  return features.slice(0, 10); // Max 10 features
}

/**
 * Auto-detect product category from product name
 */
function detectCategory(productName: string): string {
  const name = productName.toLowerCase();

  // Bottoms
  if (name.includes('pants') || name.includes('pant') ||
      name.includes('jogger') || name.includes('short') ||
      name.includes('jeans') || name.includes('jean') ||
      name.includes('trouser') || name.includes('legging')) {
    return 'Bottoms';
  }

  // Outerwear
  if (name.includes('jacket') || name.includes('coat') ||
      name.includes('hoodie') || name.includes('cardigan') ||
      name.includes('blazer') || name.includes('parka') ||
      name.includes('bomber') || name.includes('vest')) {
    return 'Outerwear';
  }

  // Tops
  if (name.includes('shirt') || name.includes('tee') ||
      name.includes('top') || name.includes('blouse') ||
      name.includes('tank') || name.includes('polo') ||
      name.includes('sweater') || name.includes('pullover')) {
    return 'Tops';
  }

  // Dresses
  if (name.includes('dress') || name.includes('gown') ||
      name.includes('skirt')) {
    return 'Dresses';
  }

  // Footwear
  if (name.includes('shoe') || name.includes('sneaker') ||
      name.includes('boot') || name.includes('sandal') ||
      name.includes('loafer') || name.includes('heel')) {
    return 'Footwear';
  }

  // Accessories
  if (name.includes('hat') || name.includes('cap') ||
      name.includes('beanie') || name.includes('scarf') ||
      name.includes('bag') || name.includes('belt') ||
      name.includes('glove') || name.includes('sock') ||
      name.includes('jewelry') || name.includes('watch')) {
    return 'Accessories';
  }

  // Activewear
  if (name.includes('athletic') || name.includes('sport') ||
      name.includes('yoga') || name.includes('gym') ||
      name.includes('performance') || name.includes('running')) {
    return 'Activewear';
  }

  return 'Uncategorized'; // Editor can manually select
}
