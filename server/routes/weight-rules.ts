/**
 * Weight Rules API Routes
 *
 * Endpoints for managing weight categories, product type mappings, and weight discrepancies.
 * Part of the Weight Rules System for ensuring product variants have correct shipping weights.
 *
 * Authentication: All endpoints require authentication
 * Authorization:
 * - SuperAdmin: Full access (create, update, delete, import, fix discrepancies)
 * - WarehouseManager: Read access to categories, mappings, and discrepancies
 * - Editor, Auditor: No access
 */

import { safeErrorMessage } from "../utils/safe-error";
import type { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { User } from '@shared/schema';
import { storage } from '../storage';

// ===================================================================
// Multer Configuration for Excel Import
// ===================================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max for Excel files
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Please upload an Excel (.xlsx, .xls) or CSV file.`));
    }
  },
});

// ===================================================================
// Request Validation Schemas
// ===================================================================

const createWeightCategorySchema = z.object({
  categoryName: z.string().min(1, 'Category name is required').max(255),
  weightValue: z.string().min(1, 'Weight value is required'),
  weightUnit: z.string().min(1, 'Weight unit is required').max(20).default('POUNDS'),
});

const updateWeightCategorySchema = z.object({
  categoryName: z.string().min(1).max(255).optional(),
  weightValue: z.string().min(1).optional(),
  weightUnit: z.string().min(1).max(20).optional(),
});

const createWeightMappingSchema = z.object({
  productType: z.string().min(1, 'Product type is required').max(255),
  weightCategoryId: z.string().min(1, 'Weight category ID is required'),
});

const updateWeightMappingSchema = z.object({
  productType: z.string().min(1).max(255).optional(),
  weightCategoryId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const ignoreDiscrepancySchema = z.object({
  notes: z.string().optional(),
});

const discrepancyFilterSchema = z.object({
  status: z.enum(['pending', 'fixed', 'ignored']).optional(),
});

// ===================================================================
// Helper Functions
// ===================================================================

/**
 * Get tenant ID from authenticated user
 */
function getTenantId(req: Request): string | null {
  const user = req.user as User | undefined;
  return user?.tenantId ?? null;
}

/**
 * Normalize weight unit to Shopify-compatible format
 * Accepts various formats (POUNDS, LBS, lb, etc.) and converts to standard codes
 */
function normalizeWeightUnit(unit: string): string {
  const normalized = unit.trim().toUpperCase();

  // Map common variations to standard Shopify units
  const unitMap: Record<string, string> = {
    'POUNDS': 'lb',
    'POUND': 'lb',
    'LBS': 'lb',
    'LB': 'lb',
    'OUNCES': 'oz',
    'OUNCE': 'oz',
    'OZ': 'oz',
    'KILOGRAMS': 'kg',
    'KILOGRAM': 'kg',
    'KG': 'kg',
    'GRAMS': 'g',
    'GRAM': 'g',
    'G': 'g',
  };

  return unitMap[normalized] || unit.toLowerCase();
}

/**
 * Parse Excel file and extract weight category rows
 * @param buffer - Excel file buffer
 * @param preferredSheet - Optional sheet name to use (if not provided, auto-detects)
 */
function parseWeightCategoriesExcel(buffer: Buffer, preferredSheet?: string): {
  rows: Array<{ categoryName: string; weightValue: string; weightUnit: string }>;
  errors: Array<{ row: number; message: string }>;
  sheetUsed: string;
  availableSheets: string[];
} {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const availableSheets = workbook.SheetNames;

  // Determine which sheet to use
  let sheetName: string;
  if (preferredSheet && availableSheets.includes(preferredSheet)) {
    // Use the explicitly selected sheet
    sheetName = preferredSheet;
  } else {
    // Auto-detect: prefer sheets with "categories", "weight", or "data" in the name
    // Skip sheets named "instructions", "help", "readme", etc.
    const skipPatterns = ['instruction', 'help', 'readme', 'info', 'guide', 'about'];
    const preferPatterns = ['categor', 'weight', 'data', 'import'];

    // First try to find a sheet matching prefer patterns
    let bestSheet = availableSheets.find(name =>
      preferPatterns.some(pattern => name.toLowerCase().includes(pattern)) &&
      !skipPatterns.some(pattern => name.toLowerCase().includes(pattern))
    );

    // If not found, use first sheet that's not in skip patterns
    if (!bestSheet) {
      bestSheet = availableSheets.find(name =>
        !skipPatterns.some(pattern => name.toLowerCase().includes(pattern))
      );
    }

    // Fallback to first sheet
    sheetName = bestSheet || availableSheets[0];
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json<any>(sheet, { header: 1 });

  const rows: Array<{ categoryName: string; weightValue: string; weightUnit: string }> = [];
  const errors: Array<{ row: number; message: string }> = [];

  // Find header row (first row with expected columns)
  let headerRowIndex = -1;
  let categoryNameCol = -1;
  let weightValueCol = -1;
  let weightUnitCol = -1;

  for (let i = 0; i < Math.min(rawData.length, 5); i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toLowerCase().trim();
      if (cell.includes('category') && cell.includes('name')) categoryNameCol = j;
      else if (cell === 'category') categoryNameCol = j;
      else if (cell.includes('weight') && cell.includes('value')) weightValueCol = j;
      else if (cell === 'weight') weightValueCol = j;
      else if (cell.includes('unit')) weightUnitCol = j;
    }

    if (categoryNameCol >= 0 && weightValueCol >= 0) {
      headerRowIndex = i;
      break;
    }
  }

  // If no header found, assume first row is header with columns: Category Name, Weight Value, Weight Unit
  if (headerRowIndex < 0) {
    headerRowIndex = 0;
    categoryNameCol = 0;
    weightValueCol = 1;
    weightUnitCol = 2;
  }

  // Parse data rows
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    const categoryName = String(row[categoryNameCol] || '').trim();
    const weightValue = String(row[weightValueCol] || '').trim();
    const weightUnit = String(row[weightUnitCol] || 'POUNDS').trim().toUpperCase();

    // Skip empty rows
    if (!categoryName && !weightValue) continue;

    // Validate row
    if (!categoryName) {
      errors.push({ row: i + 1, message: 'Missing category name' });
      continue;
    }

    if (!weightValue) {
      errors.push({ row: i + 1, message: 'Missing weight value' });
      continue;
    }

    // Validate weight value is a number
    const weightNum = parseFloat(weightValue);
    if (isNaN(weightNum) || weightNum < 0) {
      errors.push({ row: i + 1, message: `Invalid weight value: ${weightValue}` });
      continue;
    }

    // Normalize weight unit to Shopify-compatible format
    const normalizedUnit = normalizeWeightUnit(weightUnit || 'lb');

    // Validate weight unit is a known format
    const validUnits = ['lb', 'oz', 'kg', 'g'];
    if (!validUnits.includes(normalizedUnit)) {
      errors.push({ row: i + 1, message: `Invalid weight unit: "${weightUnit}". Use: lb, oz, kg, or g` });
      continue;
    }

    rows.push({
      categoryName,
      weightValue,
      weightUnit: normalizedUnit,
    });
  }

  return { rows, errors, sheetUsed: sheetName, availableSheets };
}

/**
 * Generate Excel template for weight categories import
 * Includes an Instructions sheet with valid values for Shopify/marketplace compatibility
 * Uses ExcelJS for rich formatting (colors, borders, bold headers)
 */
async function generateWeightCategoriesTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ShopSyncFlow';
  workbook.created = new Date();

  // Color palette
  const colors = {
    primaryBlue: '1E3A8A',      // Dark blue for main headers
    lightBlue: 'DBEAFE',        // Light blue background
    accentGreen: '059669',      // Green for valid values
    lightGreen: 'D1FAE5',       // Light green background
    accentOrange: 'EA580C',     // Orange for important notes
    lightOrange: 'FED7AA',      // Light orange background
    headerGray: '374151',       // Dark gray for section headers
    lightGray: 'F3F4F6',        // Light gray for alternating rows
    white: 'FFFFFF',
    black: '000000',
  };

  // ===================================================================
  // Sheet 1: Instructions
  // ===================================================================
  const instructionsSheet = workbook.addWorksheet('Instructions', {
    properties: { tabColor: { argb: colors.primaryBlue } },
  });

  // Set column widths
  instructionsSheet.columns = [
    { width: 28 },
    { width: 22 },
    { width: 18 },
    { width: 45 },
  ];

  // Title row
  instructionsSheet.mergeCells('A1:D1');
  const titleCell = instructionsSheet.getCell('A1');
  titleCell.value = 'WEIGHT CATEGORIES IMPORT TEMPLATE';
  titleCell.font = { bold: true, size: 18, color: { argb: colors.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primaryBlue } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  instructionsSheet.getRow(1).height = 35;

  // Subtitle
  instructionsSheet.mergeCells('A2:D2');
  const subtitleCell = instructionsSheet.getCell('A2');
  subtitleCell.value = 'Shopify & Marketplace Compatible Weight Standards';
  subtitleCell.font = { italic: true, size: 11, color: { argb: colors.headerGray } };
  subtitleCell.alignment = { horizontal: 'center' };

  // Instructions section header
  instructionsSheet.mergeCells('A4:D4');
  const instrHeader = instructionsSheet.getCell('A4');
  instrHeader.value = 'HOW TO USE THIS TEMPLATE';
  instrHeader.font = { bold: true, size: 13, color: { argb: colors.white } };
  instrHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerGray } };
  instrHeader.alignment = { horizontal: 'left', indent: 1 };
  instructionsSheet.getRow(4).height = 25;

  // Instructions content
  const instructions = [
    '1. Go to the "Weight Categories" sheet (tab at bottom)',
    '2. Fill in your weight categories - one per row',
    '3. Save the file and import it in the Weight Rules page',
    '4. After import, map your product types to the categories',
  ];
  instructions.forEach((text, idx) => {
    const row = instructionsSheet.getRow(5 + idx);
    row.getCell(1).value = text;
    row.getCell(1).font = { size: 11 };
    row.getCell(1).alignment = { indent: 1 };
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightGray } };
      });
    }
  });

  // Column definitions header
  instructionsSheet.mergeCells('A10:D10');
  const colDefHeader = instructionsSheet.getCell('A10');
  colDefHeader.value = 'COLUMN DEFINITIONS';
  colDefHeader.font = { bold: true, size: 13, color: { argb: colors.white } };
  colDefHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primaryBlue } };
  instructionsSheet.getRow(10).height = 25;

  // Column table header
  const colTableHeader = instructionsSheet.getRow(11);
  colTableHeader.values = ['Column Name', 'Description', '', ''];
  colTableHeader.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber <= 2) {
      cell.font = { bold: true, color: { argb: colors.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerGray } };
      cell.border = { bottom: { style: 'thin', color: { argb: colors.black } } };
    }
  });

  // Column definitions
  const columnDefs = [
    ['Category Name', 'A descriptive name for this weight category (e.g., "T-Shirts", "Heavy Outerwear")'],
    ['Weight Value', 'Numeric weight value - decimals allowed (e.g., 0.5, 1.25, 2.0)'],
    ['Weight Unit', 'Unit of measurement - see valid values below'],
  ];
  columnDefs.forEach((def, idx) => {
    const row = instructionsSheet.getRow(12 + idx);
    row.values = def;
    row.getCell(1).font = { bold: true, color: { argb: colors.primaryBlue } };
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightBlue } };
      });
    }
  });

  // Valid weight units header
  instructionsSheet.mergeCells('A16:D16');
  const unitsHeader = instructionsSheet.getCell('A16');
  unitsHeader.value = 'VALID WEIGHT UNITS (Shopify & Marketplace Compatible)';
  unitsHeader.font = { bold: true, size: 13, color: { argb: colors.white } };
  unitsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.accentGreen } };
  instructionsSheet.getRow(16).height = 25;

  // Units table header
  const unitsTableHeader = instructionsSheet.getRow(17);
  unitsTableHeader.values = ['Code', 'Full Name', 'When to Use', ''];
  unitsTableHeader.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber <= 3) {
      cell.font = { bold: true, color: { argb: colors.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerGray } };
    }
  });

  // Weight units data
  const weightUnits = [
    ['lb', 'Pounds', 'Default for US-based stores. 1 lb = 16 oz'],
    ['oz', 'Ounces', 'For lightweight items under 1 pound'],
    ['kg', 'Kilograms', 'Default for international/metric stores. 1 kg = 1000 g'],
    ['g', 'Grams', 'For very lightweight items'],
  ];
  weightUnits.forEach((unit, idx) => {
    const row = instructionsSheet.getRow(18 + idx);
    row.values = unit;
    row.getCell(1).font = { bold: true, color: { argb: colors.accentGreen } };
    row.getCell(1).alignment = { horizontal: 'center' };
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 3) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightGreen } };
      });
    }
  });

  // Alternative formats section
  instructionsSheet.mergeCells('A23:D23');
  const altHeader = instructionsSheet.getCell('A23');
  altHeader.value = 'ALTERNATIVE FORMATS (Also Accepted)';
  altHeader.font = { bold: true, size: 12, color: { argb: colors.accentOrange } };
  altHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightOrange } };
  instructionsSheet.getRow(23).height = 22;

  const altFormats = [
    ['POUNDS, LBS, POUND', 'All convert to → lb'],
    ['OUNCES, OUNCE', 'All convert to → oz'],
    ['KILOGRAMS, KILOGRAM', 'All convert to → kg'],
    ['GRAMS, GRAM', 'All convert to → g'],
  ];
  altFormats.forEach((format, idx) => {
    const row = instructionsSheet.getRow(24 + idx);
    row.values = format;
    row.getCell(1).font = { color: { argb: colors.headerGray } };
    row.getCell(2).font = { italic: true, color: { argb: colors.accentGreen } };
  });

  // Best practices section
  instructionsSheet.mergeCells('A29:D29');
  const bpHeader = instructionsSheet.getCell('A29');
  bpHeader.value = 'BEST PRACTICES';
  bpHeader.font = { bold: true, size: 13, color: { argb: colors.white } };
  bpHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primaryBlue } };
  instructionsSheet.getRow(29).height = 25;

  const bestPractices = [
    '• Use "lb" for most clothing items (Shopify default for US stores)',
    '• Use "oz" for accessories, jewelry, or items under 1 pound',
    '• Be consistent - use the same unit across similar categories',
    '• Include packaging weight for accurate shipping calculations',
  ];
  bestPractices.forEach((text, idx) => {
    const row = instructionsSheet.getRow(30 + idx);
    row.getCell(1).value = text;
    row.getCell(1).font = { size: 11 };
    if (idx % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightBlue } };
      });
    }
  });

  // Example categories section
  instructionsSheet.mergeCells('A35:D35');
  const exHeader = instructionsSheet.getCell('A35');
  exHeader.value = 'EXAMPLE CATEGORIES BY PRODUCT TYPE';
  exHeader.font = { bold: true, size: 13, color: { argb: colors.white } };
  exHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerGray } };
  instructionsSheet.getRow(35).height = 25;

  // Example table header
  const exTableHeader = instructionsSheet.getRow(36);
  exTableHeader.values = ['Category', 'Typical Weight', 'Unit', 'Example Products'];
  exTableHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colors.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primaryBlue } };
    cell.border = { bottom: { style: 'thin', color: { argb: colors.black } } };
  });

  // Example data
  const examples = [
    ['LIGHTWEIGHT TOPS', '0.25 - 0.5', 'lb', 'T-shirts, tank tops, blouses'],
    ['STANDARD TOPS', '0.5 - 0.75', 'lb', 'Button-down shirts, sweaters'],
    ['BOTTOMS', '0.75 - 1.0', 'lb', 'Jeans, pants, skirts'],
    ['OUTERWEAR', '1.5 - 3.0', 'lb', 'Jackets, coats, hoodies'],
    ['ACCESSORIES', '2 - 8', 'oz', 'Belts, hats, scarves'],
    ['FOOTWEAR', '1.5 - 2.5', 'lb', 'Sneakers, boots, sandals'],
    ['JEWELRY', '0.5 - 4', 'oz', 'Necklaces, bracelets, rings'],
    ['BAGS', '0.5 - 2.0', 'lb', 'Purses, backpacks, totes'],
  ];
  examples.forEach((ex, idx) => {
    const row = instructionsSheet.getRow(37 + idx);
    row.values = ex;
    row.getCell(1).font = { bold: true };
    row.getCell(3).font = { color: { argb: colors.accentGreen } };
    row.getCell(3).alignment = { horizontal: 'center' };
    if (idx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightGray } };
      });
    }
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
      };
    });
  });

  // ===================================================================
  // Sheet 2: Weight Categories (Data Entry)
  // ===================================================================
  const categoriesSheet = workbook.addWorksheet('Weight Categories', {
    properties: { tabColor: { argb: colors.accentGreen } },
  });

  // Set column widths
  categoriesSheet.columns = [
    { width: 30 },
    { width: 18 },
    { width: 18 },
  ];

  // Header row
  const catHeader = categoriesSheet.getRow(1);
  catHeader.values = ['Category Name', 'Weight Value', 'Weight Unit'];
  catHeader.height = 28;
  catHeader.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: colors.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.primaryBlue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: colors.black } },
      bottom: { style: 'medium', color: { argb: colors.black } },
      left: { style: 'thin', color: { argb: colors.black } },
      right: { style: 'thin', color: { argb: colors.black } },
    };
  });

  // Sample data with alternating colors
  const sampleData = [
    ['LIGHTWEIGHT TOPS', '0.35', 'lb'],
    ['STANDARD TOPS', '0.5', 'lb'],
    ['BOTTOMS', '0.85', 'lb'],
    ['OUTERWEAR', '1.75', 'lb'],
    ['ACCESSORIES', '4', 'oz'],
    ['FOOTWEAR', '2.0', 'lb'],
  ];

  sampleData.forEach((data, idx) => {
    const row = categoriesSheet.getRow(2 + idx);
    row.values = data;
    row.height = 22;

    row.eachCell((cell, colNumber) => {
      // Alternating row colors
      if (idx % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.lightGreen } };
      }

      // Center align numeric columns
      if (colNumber >= 2) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { vertical: 'middle' };
      }

      // Make unit column green
      if (colNumber === 3) {
        cell.font = { bold: true, color: { argb: colors.accentGreen } };
      }

      // Borders
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
        left: { style: 'thin', color: { argb: 'E5E7EB' } },
        right: { style: 'thin', color: { argb: 'E5E7EB' } },
      };
    });
  });

  // Add data validation for weight unit column
  // Use type assertion since ExcelJS types don't include dataValidations
  (categoriesSheet as any).dataValidations.add('C2:C1000', {
    type: 'list',
    allowBlank: true,
    formulae: ['"lb,oz,kg,g"'],
    showErrorMessage: true,
    errorTitle: 'Invalid Weight Unit',
    error: 'Please select a valid unit: lb, oz, kg, or g',
  });

  // Freeze header row
  categoriesSheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' },
  ];

  // Add instruction note at the bottom
  const noteRow = categoriesSheet.getRow(10);
  categoriesSheet.mergeCells('A10:C10');
  noteRow.getCell(1).value = 'Add your categories above. Delete sample rows if not needed.';
  noteRow.getCell(1).font = { italic: true, color: { argb: colors.headerGray }, size: 10 };
  noteRow.getCell(1).alignment = { horizontal: 'center' };

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ===================================================================
// Route Registration
// ===================================================================

export function registerWeightRulesRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  requireRole: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
) {
  // ===================================================================
  // Weight Categories Endpoints
  // ===================================================================

  /**
   * GET /api/weight-categories
   * Get all weight categories for the tenant
   *
   * Roles: SuperAdmin, WarehouseManager
   * Returns: { success: boolean, categories: WeightCategory[] }
   */
  app.get(
    '/api/weight-categories',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const categories = await storage.getWeightCategories(tenantId);

        return res.json({
          success: true,
          categories,
          count: categories.length,
        });
      } catch (error: any) {
        console.error('Get weight categories error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get weight categories'),
        });
      }
    }
  );

  /**
   * POST /api/weight-categories
   * Create a new weight category
   *
   * Roles: SuperAdmin
   * Body: { categoryName, weightValue, weightUnit }
   * Returns: { success: boolean, category: WeightCategory }
   */
  app.post(
    '/api/weight-categories',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const user = req.user as User;

        // Validate request body
        const validation = createWeightCategorySchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: validation.error.errors,
          });
        }

        const { categoryName, weightValue, weightUnit } = validation.data;

        const category = await storage.createWeightCategory({
          tenantId,
          categoryName,
          weightValue,
          weightUnit,
          source: 'manual',
          createdBy: user.id,
        });

        return res.status(201).json({
          success: true,
          category,
        });
      } catch (error: any) {
        console.error('Create weight category error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to create weight category'),
        });
      }
    }
  );

  /**
   * PUT /api/weight-categories/:id
   * Update an existing weight category
   *
   * Roles: SuperAdmin
   * Body: { categoryName?, weightValue?, weightUnit? }
   * Returns: { success: boolean, category: WeightCategory }
   */
  app.put(
    '/api/weight-categories/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { id } = req.params;

        // Validate request body
        const validation = updateWeightCategorySchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: validation.error.errors,
          });
        }

        const category = await storage.updateWeightCategory(tenantId, id, validation.data);

        if (!category) {
          return res.status(404).json({
            success: false,
            error: 'Weight category not found',
          });
        }

        return res.json({
          success: true,
          category,
        });
      } catch (error: any) {
        console.error('Update weight category error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update weight category'),
        });
      }
    }
  );

  /**
   * DELETE /api/weight-categories/:id
   * Delete a weight category (will cascade delete mappings)
   *
   * Roles: SuperAdmin
   * Returns: { success: boolean }
   */
  app.delete(
    '/api/weight-categories/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { id } = req.params;

        const deleted = await storage.deleteWeightCategory(tenantId, id);

        if (!deleted) {
          return res.status(404).json({
            success: false,
            error: 'Weight category not found',
          });
        }

        return res.json({
          success: true,
          message: 'Weight category deleted successfully',
        });
      } catch (error: any) {
        console.error('Delete weight category error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete weight category'),
        });
      }
    }
  );

  /**
   * POST /api/weight-categories/import
   * Import weight categories from Excel file
   *
   * Roles: SuperAdmin
   * Body: multipart/form-data with 'file' field
   * Returns: { success: boolean, created: number, updated: number, errors: [{row, message}] }
   */
  app.post(
    '/api/weight-categories/import',
    requireAuth,
    requireRole(['SuperAdmin']),
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const user = req.user as User;
        const file = req.file;

        if (!file) {
          return res.status(400).json({
            success: false,
            error: 'No file provided',
          });
        }

        // Get optional sheet name from form data
        const selectedSheet = req.body?.sheet as string | undefined;

        // Parse Excel file
        const { rows, errors, sheetUsed, availableSheets } = parseWeightCategoriesExcel(file.buffer, selectedSheet);

        if (rows.length === 0 && errors.length === 0) {
          return res.status(400).json({
            success: false,
            error: `No valid data found in sheet "${sheetUsed}". Available sheets: ${availableSheets.join(', ')}`,
            sheetUsed,
            availableSheets,
          });
        }

        // Import valid rows
        let created = 0;
        let updated = 0;

        if (rows.length > 0) {
          const result = await storage.importWeightCategories(tenantId, rows, user.id);
          created = result.created;
          updated = result.updated;
        }

        return res.json({
          success: true,
          created,
          updated,
          errors: errors.length > 0 ? errors : undefined,
          totalProcessed: rows.length,
          totalErrors: errors.length,
          sheetUsed,
          availableSheets,
        });
      } catch (error: any) {
        console.error('Import weight categories error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to import weight categories'),
        });
      }
    }
  );

  /**
   * POST /api/weight-categories/preview
   * Preview Excel file sheets and data before importing
   *
   * Roles: SuperAdmin
   * Body: multipart/form-data with 'file' field, optional 'sheet' field
   * Returns: { success: boolean, sheets: string[], selectedSheet: string, preview: array, rowCount: number }
   */
  app.post(
    '/api/weight-categories/preview',
    requireAuth,
    requireRole(['SuperAdmin']),
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const file = req.file;

        if (!file) {
          return res.status(400).json({
            success: false,
            error: 'No file provided',
          });
        }

        const selectedSheet = req.body?.sheet as string | undefined;
        const { rows, errors, sheetUsed, availableSheets } = parseWeightCategoriesExcel(file.buffer, selectedSheet);

        // Return ALL rows so user can review everything before importing
        return res.json({
          success: true,
          sheets: availableSheets,
          selectedSheet: sheetUsed,
          preview: rows, // All rows for full preview
          rowCount: rows.length,
          errorCount: errors.length,
          errors: errors, // All errors too
        });
      } catch (error: any) {
        console.error('Preview weight categories error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to preview file'),
        });
      }
    }
  );

  /**
   * GET /api/weight-categories/template
   * Download Excel template for weight categories import
   *
   * Roles: SuperAdmin, WarehouseManager
   * Returns: Excel file (.xlsx)
   */
  app.get(
    '/api/weight-categories/template',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const buffer = await generateWeightCategoriesTemplate();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="weight-categories-template.xlsx"');
        res.send(buffer);
      } catch (error: any) {
        console.error('Generate template error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to generate template'),
        });
      }
    }
  );

  // ===================================================================
  // Weight Mappings Endpoints
  // ===================================================================

  /**
   * GET /api/weight-mappings
   * Get all weight mappings with joined category data
   *
   * Roles: SuperAdmin, WarehouseManager
   * Returns: { success: boolean, mappings: (ProductTypeWeightMapping & {category: WeightCategory})[] }
   */
  app.get(
    '/api/weight-mappings',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const mappings = await storage.getWeightMappings(tenantId);

        return res.json({
          success: true,
          mappings,
          count: mappings.length,
        });
      } catch (error: any) {
        console.error('Get weight mappings error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get weight mappings'),
        });
      }
    }
  );

  /**
   * POST /api/weight-mappings
   * Create a new weight mapping
   *
   * Roles: SuperAdmin
   * Body: { productType, weightCategoryId }
   * Returns: { success: boolean, mapping: ProductTypeWeightMapping }
   */
  app.post(
    '/api/weight-mappings',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const user = req.user as User;

        // Validate request body
        const validation = createWeightMappingSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: validation.error.errors,
          });
        }

        const { productType, weightCategoryId } = validation.data;

        // Check if mapping already exists for this product type
        const existing = await storage.getWeightMappingByProductType(tenantId, productType);
        if (existing) {
          return res.status(409).json({
            success: false,
            error: `A mapping already exists for product type: ${productType}`,
          });
        }

        // Verify weight category exists
        const category = await storage.getWeightCategory(tenantId, weightCategoryId);
        if (!category) {
          return res.status(400).json({
            success: false,
            error: 'Weight category not found',
          });
        }

        const mapping = await storage.createWeightMapping({
          tenantId,
          productType,
          weightCategoryId,
          isActive: true,
          createdBy: user.id,
        });

        return res.status(201).json({
          success: true,
          mapping,
        });
      } catch (error: any) {
        console.error('Create weight mapping error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to create weight mapping'),
        });
      }
    }
  );

  /**
   * PUT /api/weight-mappings/:id
   * Update an existing weight mapping
   *
   * Roles: SuperAdmin
   * Body: { productType?, weightCategoryId?, isActive? }
   * Returns: { success: boolean, mapping: ProductTypeWeightMapping }
   */
  app.put(
    '/api/weight-mappings/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { id } = req.params;

        // Validate request body
        const validation = updateWeightMappingSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: validation.error.errors,
          });
        }

        // If updating weightCategoryId, verify it exists
        if (validation.data.weightCategoryId) {
          const category = await storage.getWeightCategory(tenantId, validation.data.weightCategoryId);
          if (!category) {
            return res.status(400).json({
              success: false,
              error: 'Weight category not found',
            });
          }
        }

        const mapping = await storage.updateWeightMapping(tenantId, id, validation.data);

        if (!mapping) {
          return res.status(404).json({
            success: false,
            error: 'Weight mapping not found',
          });
        }

        return res.json({
          success: true,
          mapping,
        });
      } catch (error: any) {
        console.error('Update weight mapping error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to update weight mapping'),
        });
      }
    }
  );

  /**
   * DELETE /api/weight-mappings/:id
   * Delete a weight mapping
   *
   * Roles: SuperAdmin
   * Returns: { success: boolean }
   */
  app.delete(
    '/api/weight-mappings/:id',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const { id } = req.params;

        const deleted = await storage.deleteWeightMapping(tenantId, id);

        if (!deleted) {
          return res.status(404).json({
            success: false,
            error: 'Weight mapping not found',
          });
        }

        return res.json({
          success: true,
          message: 'Weight mapping deleted successfully',
        });
      } catch (error: any) {
        console.error('Delete weight mapping error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to delete weight mapping'),
        });
      }
    }
  );

  /**
   * GET /api/weight-mappings/unmapped-types
   * Get product types that don't have weight mappings
   *
   * Roles: SuperAdmin, WarehouseManager
   * Returns: { success: boolean, productTypes: string[] }
   */
  app.get(
    '/api/weight-mappings/unmapped-types',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const productTypes = await storage.getUnmappedProductTypes(tenantId);

        return res.json({
          success: true,
          productTypes,
          count: productTypes.length,
        });
      } catch (error: any) {
        console.error('Get unmapped product types error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get unmapped product types'),
        });
      }
    }
  );

  // ===================================================================
  // Weight Discrepancies Endpoints
  // ===================================================================

  /**
   * GET /api/weight-discrepancies
   * Get weight discrepancies with optional status filter
   *
   * Roles: SuperAdmin, WarehouseManager
   * Query params: status (optional: 'pending', 'fixed', 'ignored')
   * Returns: { success: boolean, discrepancies: WeightDiscrepancy[] }
   */
  app.get(
    '/api/weight-discrepancies',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        // Validate query params
        const filterValidation = discrepancyFilterSchema.safeParse(req.query);
        const filters = filterValidation.success ? filterValidation.data : {};

        const discrepancies = await storage.getWeightDiscrepancies(tenantId, filters);

        return res.json({
          success: true,
          discrepancies,
          count: discrepancies.length,
        });
      } catch (error: any) {
        console.error('Get weight discrepancies error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get weight discrepancies'),
        });
      }
    }
  );

  /**
   * POST /api/weight-discrepancies/:id/fix
   * Mark a discrepancy as fixed (updates Shopify variant weight)
   *
   * Roles: SuperAdmin
   * Returns: { success: boolean, discrepancy: WeightDiscrepancy }
   *
   * Note: The actual Shopify weight update should be implemented
   * in the shopify service and called before marking as fixed.
   */
  app.post(
    '/api/weight-discrepancies/:id/fix',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const user = req.user as User;
        const { id } = req.params;

        // First, get the discrepancy details
        const discrepancies = await storage.getWeightDiscrepanciesByIds(tenantId, [id]);
        if (!discrepancies || discrepancies.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Weight discrepancy not found',
          });
        }

        const discrepancyData = discrepancies[0];
        const expectedWeight = parseFloat(discrepancyData.expectedWeight);
        const expectedUnit = discrepancyData.expectedUnit;

        // Update Shopify if we have a Shopify variant ID
        let shopifyUpdated = false;
        let shopifyError = null;
        if (discrepancyData.shopifyVariantId) {
          const { shopifyService } = await import('../shopify');
          const result = await shopifyService.updateVariantWeight(
            tenantId,
            discrepancyData.shopifyVariantId,
            expectedWeight,
            expectedUnit
          );
          shopifyUpdated = result.success;
          if (!result.success) {
            shopifyError = result.error;
          }
        }

        // Update local variant if we have a variant ID
        let localUpdated = false;
        if (discrepancyData.variantId) {
          try {
            await storage.updateProductVariant(discrepancyData.variantId, {
              weight: discrepancyData.expectedWeight,
              weightUnit: discrepancyData.expectedUnit,
            });
            localUpdated = true;
          } catch (err) {
            console.error(`Failed to update local variant ${discrepancyData.variantId}:`, err);
          }
        }

        // Mark as fixed
        const discrepancy = await storage.updateWeightDiscrepancyStatus(
          tenantId,
          id,
          'fixed',
          user.id,
          shopifyUpdated ? 'Weight corrected in Shopify and local DB' : 'Weight corrected in local DB only'
        );

        return res.json({
          success: true,
          discrepancy,
          shopifyUpdated,
          localUpdated,
          shopifyError,
        });
      } catch (error: any) {
        console.error('Fix weight discrepancy error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to fix weight discrepancy'),
        });
      }
    }
  );

  /**
   * POST /api/weight-discrepancies/:id/ignore
   * Mark a discrepancy as ignored
   *
   * Roles: SuperAdmin
   * Body: { notes?: string }
   * Returns: { success: boolean, discrepancy: WeightDiscrepancy }
   */
  app.post(
    '/api/weight-discrepancies/:id/ignore',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const user = req.user as User;
        const { id } = req.params;

        // Validate request body
        const validation = ignoreDiscrepancySchema.safeParse(req.body);
        const notes = validation.success ? validation.data.notes : undefined;

        const discrepancy = await storage.updateWeightDiscrepancyStatus(
          tenantId,
          id,
          'ignored',
          user.id,
          notes
        );

        if (!discrepancy) {
          return res.status(404).json({
            success: false,
            error: 'Weight discrepancy not found',
          });
        }

        return res.json({
          success: true,
          discrepancy,
        });
      } catch (error: any) {
        console.error('Ignore weight discrepancy error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to ignore weight discrepancy'),
        });
      }
    }
  );

  /**
   * POST /api/weight-discrepancies/fix-all
   * Fix discrepancies (batch operation)
   *
   * Roles: SuperAdmin
   * Body: { ids?: string[] } - Optional array of specific IDs to fix. If not provided, fixes all pending.
   * Returns: { success: boolean, fixedCount: number }
   *
   * Note: This should ideally update weights in Shopify first.
   */
  app.post(
    '/api/weight-discrepancies/fix-all',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const user = req.user as User;
        const { ids: requestedIds } = req.body as { ids?: string[] };

        // Get the discrepancies to fix
        let discrepanciesToFix;

        if (requestedIds && Array.isArray(requestedIds) && requestedIds.length > 0) {
          // Get specific discrepancies by ID
          discrepanciesToFix = await storage.getWeightDiscrepanciesByIds(tenantId, requestedIds);
        } else {
          // Fallback: get all pending discrepancies
          discrepanciesToFix = await storage.getWeightDiscrepancies(tenantId, { status: 'pending' });
        }

        if (discrepanciesToFix.length === 0) {
          return res.json({
            success: true,
            fixedCount: 0,
            shopifyUpdated: 0,
            localUpdated: 0,
            message: 'No discrepancies to fix',
          });
        }

        // Import shopify service
        const { shopifyService } = await import('../shopify');

        let shopifySuccessCount = 0;
        let shopifyFailCount = 0;
        let localUpdateCount = 0;
        const errors: string[] = [];

        // Update each variant weight in Shopify and local DB
        for (const discrepancy of discrepanciesToFix) {
          const expectedWeight = parseFloat(discrepancy.expectedWeight);
          const expectedUnit = discrepancy.expectedUnit;

          // Update Shopify if we have a Shopify variant ID
          if (discrepancy.shopifyVariantId) {
            const result = await shopifyService.updateVariantWeight(
              tenantId,
              discrepancy.shopifyVariantId,
              expectedWeight,
              expectedUnit
            );

            if (result.success) {
              shopifySuccessCount++;
            } else {
              shopifyFailCount++;
              errors.push(`Variant ${discrepancy.shopifyVariantId}: ${result.error}`);
            }
          }

          // Update local variant if we have a variant ID
          if (discrepancy.variantId) {
            try {
              await storage.updateProductVariant(discrepancy.variantId, {
                weight: discrepancy.expectedWeight,
                weightUnit: discrepancy.expectedUnit,
              });
              localUpdateCount++;
            } catch (err) {
              console.error(`Failed to update local variant ${discrepancy.variantId}:`, err);
            }
          }
        }

        // Mark discrepancies as fixed
        const ids = discrepanciesToFix.map(d => d.id);
        const fixedCount = await storage.bulkUpdateDiscrepancyStatus(
          tenantId,
          ids,
          'fixed',
          user.id
        );

        const message = shopifyFailCount > 0
          ? `Fixed ${fixedCount} discrepancies. Shopify: ${shopifySuccessCount} updated, ${shopifyFailCount} failed.`
          : `Fixed ${fixedCount} discrepancies. Updated ${shopifySuccessCount} variants in Shopify.`;

        return res.json({
          success: true,
          fixedCount,
          shopifyUpdated: shopifySuccessCount,
          shopifyFailed: shopifyFailCount,
          localUpdated: localUpdateCount,
          message,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined, // Return first 5 errors
        });
      } catch (error: any) {
        console.error('Fix all discrepancies error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to fix all discrepancies'),
        });
      }
    }
  );

  /**
   * GET /api/weight-discrepancies/stats
   * Get discrepancy counts by status
   *
   * Roles: SuperAdmin, WarehouseManager
   * Returns: { success: boolean, stats: { pending, fixed, ignored, total } }
   */
  app.get(
    '/api/weight-discrepancies/stats',
    requireAuth,
    requireRole(['SuperAdmin', 'WarehouseManager']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) {
          return res.status(401).json({
            success: false,
            error: 'No tenant context',
          });
        }

        const stats = await storage.getWeightDiscrepancyStats(tenantId);

        return res.json({
          success: true,
          stats,
        });
      } catch (error: any) {
        console.error('Get discrepancy stats error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to get discrepancy stats'),
        });
      }
    }
  );

  /**
   * POST /api/weight-discrepancies/scan
   * Scan all products/variants and create discrepancies for weight mismatches
   *
   * Requires: SuperAdmin role
   * Returns: { success: boolean, scannedCount: number, discrepanciesCreated: number }
   */
  app.post(
    '/api/weight-discrepancies/scan',
    requireAuth,
    requireRole(['SuperAdmin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.user!.tenantId;
        if (!tenantId) {
          return res.status(400).json({
            success: false,
            error: 'Tenant ID is required',
          });
        }

        // Get all active mappings with their categories
        const mappings = await storage.getWeightMappings(tenantId);

        if (mappings.length === 0) {
          return res.json({
            success: true,
            scannedCount: 0,
            discrepanciesCreated: 0,
            message: 'No product type mappings found. Create mappings first.',
          });
        }

        // Create a map of productType -> expected weight info
        const mappingsByType = new Map<string, {
          mappingId: string;
          categoryId: string;
          expectedWeight: string;
          expectedUnit: string;
        }>();

        for (const mapping of mappings) {
          if (mapping.category) {
            mappingsByType.set(mapping.productType.toLowerCase(), {
              mappingId: mapping.id,
              categoryId: mapping.weightCategoryId,
              expectedWeight: mapping.category.weightValue,
              expectedUnit: mapping.category.weightUnit,
            });
          }
        }

        // Get all products
        const allProducts = await storage.getProducts(tenantId, {});

        let scannedCount = 0;
        let discrepanciesCreated = 0;

        // Get existing pending discrepancies once (more efficient)
        const existingDiscrepancies = await storage.getWeightDiscrepancies(tenantId, { status: 'pending' });
        const existingVariantIds = new Set(
          existingDiscrepancies
            .filter(d => d.status === 'pending')
            .map(d => d.variantId)
        );

        for (const product of allProducts) {
          const productType = product.productType?.toLowerCase();

          if (!productType || !mappingsByType.has(productType)) {
            continue; // Skip products without mapping
          }

          const expectedInfo = mappingsByType.get(productType)!;

          // Get variants for this product
          const variants = await storage.getProductVariants(product.id);

          for (const variant of variants) {
            scannedCount++;

            // Skip if pending discrepancy already exists
            if (existingVariantIds.has(variant.id)) {
              continue;
            }

            // Normalize weights for comparison
            const actualWeightNum = variant.weight ? parseFloat(variant.weight) : null;
            const expectedWeightNum = parseFloat(expectedInfo.expectedWeight);
            const actualUnit = variant.weightUnit?.toLowerCase() || 'lb';
            const expectedUnit = expectedInfo.expectedUnit.toLowerCase();

            // Convert weights to a common unit (lb) for comparison
            const normalizedActual = actualWeightNum !== null
              ? convertToLb(actualWeightNum, actualUnit)
              : null;
            const normalizedExpected = convertToLb(expectedWeightNum, expectedUnit);

            // Check if there's a discrepancy (allow small tolerance for rounding)
            const tolerance = 0.01; // 0.01 lb tolerance
            const hasDiscrepancy = normalizedActual === null ||
              Math.abs(normalizedActual - normalizedExpected) > tolerance;

            if (hasDiscrepancy) {
              // Create the discrepancy
              await storage.createWeightDiscrepancy({
                tenantId,
                productId: product.id,
                variantId: variant.id,
                shopifyVariantId: variant.shopifyVariantId || null,
                productTitle: product.title,
                variantTitle: variant.title,
                sku: variant.sku || null,
                productType: product.productType || null,
                expectedWeight: expectedInfo.expectedWeight,
                expectedUnit: expectedInfo.expectedUnit,
                actualWeight: variant.weight || '0',
                actualUnit: variant.weightUnit || 'lb',
                mappingId: expectedInfo.mappingId,
                categoryId: expectedInfo.categoryId,
                status: 'pending',
              });
              discrepanciesCreated++;
            }
          }
        }

        return res.json({
          success: true,
          scannedCount,
          discrepanciesCreated,
          message: discrepanciesCreated > 0
            ? `Found ${discrepanciesCreated} weight discrepancies out of ${scannedCount} variants scanned.`
            : `Scanned ${scannedCount} variants. All weights match expected values.`,
        });
      } catch (error: any) {
        console.error('Scan weight discrepancies error:', error);
        return res.status(500).json({
          success: false,
          error: safeErrorMessage(error, 'Failed to scan for weight discrepancies'),
        });
      }
    }
  );
}

/**
 * Helper function to convert weight to pounds for comparison
 */
function convertToLb(weight: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return weight;
    case 'oz':
    case 'ounce':
    case 'ounces':
      return weight / 16;
    case 'kg':
    case 'kilogram':
    case 'kilograms':
      return weight * 2.20462;
    case 'g':
    case 'gram':
    case 'grams':
      return weight * 0.00220462;
    default:
      return weight; // Assume lb if unknown
  }
}
