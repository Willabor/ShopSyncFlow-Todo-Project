/**
 * XLS to CSV Converter
 *
 * Converts vendor order XLS files (vertical key-value format)
 * to CSV format compatible with the Content Studio parser.
 */

import XLSX from 'xlsx';

export interface XLSConversionResult {
  success: boolean;
  csvContent?: string;
  error?: string;
}

/**
 * Convert XLS file buffer to CSV format
 */
export function convertXLSTOCSV(fileBuffer: Buffer): XLSConversionResult {
  try {
    // Read the XLS file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Get raw data as array of arrays
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    // Extract order metadata from rows 1-54 (vertical key-value format)
    const metadata: Record<string, any> = {};
    for (let i = 0; i < 54; i++) {
      const row = rawData[i] as any[];
      if (row && row[0] && row[1]) {
        const key = String(row[0]).trim();
        const value = String(row[1]).trim();
        metadata[key] = value;
      }
    }

    // Extract product table (starts at row 55, header row 55, data rows 56+)
    const productHeaderRow = rawData[54] as any[];  // Row 55 (0-indexed as 54)
    const productDataRows = rawData.slice(55);      // Rows 56+ (0-indexed as 55+)

    // Map XLS product headers to positions
    const xlsHeaders = productHeaderRow.map(h => String(h).trim());
    const headerMap: Record<string, number> = {};
    xlsHeaders.forEach((header, idx) => {
      headerMap[header] = idx;
    });

    // Define CSV headers (matching the expected format)
    const csvHeaders = [
      'Order ID',
      'Record ID',
      'Showroom ID',
      'Showroom Name',
      'Date Created',
      'Sales Rep Name',
      'Sales Rep Email',
      'Order Date',
      'Order Number',
      'Order Type',
      'Order Status',
      'Order Discount',
      'Order Credit',
      'Order Shipping',
      'Order Fees',
      'Payment Status',
      'Customer PO',
      'Ship Date',
      'Cancel Date',
      'Terms',
      'Currency',
      'SKU Number',
      'Style Number',
      'Option Code',
      'Option Name',
      'Size',
      'UPC',
      'Product Name',
      'Description',
      'Season',
      'Type',
      'Category',
      'MSRP',
      'Original Price',
      'Sale Price',
      'QTY',
      'Wholesale Total',
      'Retail Total',
      'Total Order Amount',
      'Total Invoiced Amount',
      'Customer Code 1',
      'Customer Code 2',
      'Customer Name',
      'Customer ERP Code',
      'VAT Number',
      'Buyer First Name',
      'Buyer Last Name',
      'Buyer Name',
      'Buyer Phone',
      'Buyer Fax',
      'Buyer Email',
      'Bill To Name',
      'Bill To Address 1',
      'Bill To Address 2',
      'Bill To City',
      'Bill To State',
      'Bill To Zip Code',
      'Bill To Country',
      'Ship To Name',
      'Ship To Address 1',
      'Ship To Address 2',
      'Ship To City',
      'Ship To State',
      'Ship To Zip Code',
      'Ship To Country',
      'Comments',
      'Shipping Method',
      'Shipping Instructions',
      'Image Src'  // NEW: Image URL field
    ];

    // Build CSV rows
    const csvRows: string[][] = [];
    csvRows.push(csvHeaders);  // Header row

    // Process each product row
    for (const productRow of productDataRows) {
      const row = productRow as any[];

      // Skip empty rows
      if (!row || row.length === 0 || !row[headerMap['Style Number']]) {
        continue;
      }

      // Map XLS columns to CSV columns
      const csvRow = [
        metadata['boom Order ID'] || '',                    // Order ID
        metadata['boom Record ID'] || '',                   // Record ID
        metadata['boom Showroom ID'] || '',                 // Showroom ID
        metadata['Showroom Name'] || metadata['boom Showroom Name'] || metadata['Vendor'] || metadata['Brand'] || '',  // Showroom Name
        metadata['Order Date'] || '',                       // Date Created
        metadata['Sales Rep Name'] || '',                   // Sales Rep Name
        metadata['Sales Rep Email'] || '',                  // Sales Rep Email
        metadata['Order Date'] || '',                       // Order Date
        metadata['Order Number'] || '',                     // Order Number
        metadata['Order Type'] || '',                       // Order Type
        'complete',                                         // Order Status
        '',                                                 // Order Discount
        '',                                                 // Order Credit
        '',                                                 // Order Shipping
        '',                                                 // Order Fees
        'Unpaid',                                           // Payment Status
        metadata['Customer PO'] || '',                      // Customer PO
        metadata['Ship Date'] || '',                        // Ship Date
        metadata['Cancel Date'] || '',                      // Cancel Date
        metadata['Terms'] || '',                            // Terms
        metadata['Currency'] || 'USD',                      // Currency
        row[headerMap['SKU Number']] || '',                 // SKU Number
        row[headerMap['Style Number']] || '',               // Style Number
        row[headerMap['Option Code']] || '',                // Option Code
        row[headerMap['Option Name']] || '',                // Option Name (Color)
        row[headerMap['Size']] || '',                       // Size
        row[headerMap['UPC']] || '',                        // UPC
        row[headerMap['name']] || '',                       // Product Name
        row[headerMap['description']] || '',                // Description
        '',                                                 // Season
        '',                                                 // Type
        '',                                                 // Category
        row[headerMap['MSRP']] || '',                       // MSRP
        row[headerMap['Original Price']] || '',             // Original Price
        row[headerMap['Sale Price']] || '',                 // Sale Price
        row[headerMap['QTY']] || '',                        // QTY
        row[headerMap['Line Total']] || '',                 // Wholesale Total
        '',                                                 // Retail Total
        '',                                                 // Total Order Amount
        '',                                                 // Total Invoiced Amount
        '',                                                 // Customer Code 1
        '',                                                 // Customer Code 2
        metadata['Bill To Name'] || '',                     // Customer Name
        '',                                                 // Customer ERP Code
        metadata['VAT Number'] || '',                       // VAT Number
        '',                                                 // Buyer First Name
        '',                                                 // Buyer Last Name
        metadata['Buyer Name'] || '',                       // Buyer Name
        metadata['Buyer Phone'] || '',                      // Buyer Phone
        metadata['Buyer Fax'] || '',                        // Buyer Fax
        metadata['Buyer Email'] || '',                      // Buyer Email
        metadata['Bill To Name'] || '',                     // Bill To Name
        metadata['Bill To Address 1'] || '',                // Bill To Address 1
        metadata['Bill To Address 2'] || '',                // Bill To Address 2
        metadata['Bill To City'] || '',                     // Bill To City
        metadata['Bill To State'] || '',                    // Bill To State
        metadata['Bill To Zip Code'] || '',                 // Bill To Zip Code
        metadata['Bill To Country'] || '',                  // Bill To Country
        metadata['Ship To Name'] || '',                     // Ship To Name
        metadata['Ship To Address 1'] || '',                // Ship To Address 1
        metadata['Ship To Address 2'] || '',                // Ship To Address 2
        metadata['Ship To City'] || '',                     // Ship To City
        metadata['Ship To State'] || '',                    // Ship To State
        metadata['Ship To Zip Code'] || '',                 // Ship To Zip Code
        metadata['Ship To Country'] || '',                  // Ship To Country
        metadata['Comments'] || '',                         // Comments
        '',                                                 // Shipping Method
        metadata['Shipping Instructions'] || '',            // Shipping Instructions
        row[headerMap['ImageURL']] || ''                    // Image Src (NEW!)
      ];

      csvRows.push(csvRow);
    }

    // Convert to CSV string
    const csvContent = csvRows.map(row =>
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');

    return {
      success: true,
      csvContent
    };

  } catch (error: any) {
    return {
      success: false,
      error: `Failed to convert XLS: ${error.message}`
    };
  }
}
