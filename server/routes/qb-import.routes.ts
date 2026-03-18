import type { Express, Request, Response } from "express";
import { storage } from "../storage.js";
import { db } from "../db.js";
import { safeErrorMessage } from "../utils/safe-error.js";
import { eq, and, isNotNull, ne, or, ilike, desc, sql, inArray } from "drizzle-orm";
import { items, itemLevels, ssfLocations } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import xlsx from "xlsx";
import { extractColorFromTitle, sortSizes, validateQBRow, parseQBRow, type QBVariantData } from "../qb-import-helpers.js";
import { syncTenant, getSyncStatus } from "../sync/sync.service.js";

export function registerQbImportRoutes(
  app: Express,
  requireAuth: any,
  requireRole: (roles: string[]) => any
) {
  function getTenantId(req: Request): string | null {
    return (req.user as any)?.tenantId || null;
  }

  // ============================================================
  // QuickBooks Import Endpoint (depends on variant storage methods)
  // ============================================================

  // Configure multer for QuickBooks file uploads
  const qbUploadDir = path.join(process.cwd(), 'server', 'uploads', 'qb-imports');
  if (!fs.existsSync(qbUploadDir)) {
    fs.mkdirSync(qbUploadDir, { recursive: true });
  }

  const qbUpload = multer({
    storage: multer.diskStorage({
      destination: qbUploadDir,
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Allow only Excel files
      const allowedTypes = /xlsx|xls/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                       file.mimetype === 'application/vnd.ms-excel';

      if (extname && mimetype) {
        return cb(null, true);
      } else {
        cb(new Error('Only Excel files (.xls, .xlsx) are allowed'));
      }
    }
  });

  // Import variants from QuickBooks POS export
  // MULTI-TENANT: Verify product belongs to tenant before importing
  app.post("/api/products/:id/import-variants-from-qb",
    requireAuth,
    requireRole(["SuperAdmin", "WarehouseManager", "Editor"]),
    qbUpload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const productId = req.params.id;

        // MULTI-TENANT: Verify product belongs to tenant
        const tenantId = getTenantId(req);
        if (!tenantId) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(401).json({ message: "No tenant context" });
        }

        // Check if file was uploaded
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'No file uploaded',
            message: 'Please upload a QuickBooks export file (.xls or .xlsx)'
          });
        }

        console.log(`[QB Import] Starting import for product ${productId}`);
        console.log(`[QB Import] File: ${req.file.originalname} (${req.file.size} bytes)`);

        // Get product - MULTI-TENANT: Filter by tenant
        const product = await storage.getProduct(tenantId, productId);
        if (!product) {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          return res.status(404).json({
            success: false,
            error: 'Product not found',
            message: `No product found with ID: ${productId}`
          });
        }

        // Check Style Number
        if (!product.styleNumber) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            error: 'Product missing Style Number',
            message: 'Please set the Style Number field before importing variants. This is required to match QuickBooks data.'
          });
        }

        // Extract color from product title
        const productColor = extractColorFromTitle(product.title);
        if (!productColor) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            error: 'Could not determine product color',
            message: 'Product title does not end with " - ColorName". Expected format: "Product Name - Color"',
            hint: 'Add color to the end of the product title (e.g., "Product Name - Ice Blue")'
          });
        }

        console.log(`[QB Import] Product: ${product.title}`);
        console.log(`[QB Import] Style Number: ${product.styleNumber}`);
        console.log(`[QB Import] Color: ${productColor}`);

        // Parse QuickBooks file
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const allRows = xlsx.utils.sheet_to_json(sheet);

        console.log(`[QB Import] Parsed ${allRows.length} total rows from QuickBooks file`);

        // DEBUG: Show first few rows to help diagnose mismatches
        if (allRows.length > 0) {
          const firstRow = allRows[0] as Record<string, unknown>;
          console.log(`[QB Import DEBUG] First row sample:`, {
            'Custom Field 1': firstRow['Custom Field 1'],
            'Attribute': firstRow['Attribute'],
            'Size': firstRow['Size'],
            'Item Number': firstRow['Item Number']
          });
          // Show all unique style numbers and colors in file
          const uniqueStyles = [...new Set(allRows.map((r: any) => r['Custom Field 1']?.toString().trim()).filter(Boolean))];
          const uniqueColors = [...new Set(allRows.map((r: any) => r['Attribute']?.toString().trim()).filter(Boolean))];
          console.log(`[QB Import DEBUG] Unique Style Numbers in file (${uniqueStyles.length}):`, uniqueStyles);
          console.log(`[QB Import DEBUG] Unique Colors in file (${uniqueColors.length}):`, uniqueColors);
        }

        // Filter rows by Style Number + Color
        const matchingRows = allRows.filter((row: any) =>
          row['Custom Field 1']?.toString().trim() === product.styleNumber &&
          row['Attribute']?.toString().trim() === productColor
        ) as Record<string, unknown>[];

        console.log(`[QB Import] Found ${matchingRows.length} matching rows (Style: ${product.styleNumber}, Color: ${productColor})`);

        if (matchingRows.length === 0) {
          // Extract available colors for helpful error message
          const availableColors = [...new Set(
            allRows
              .filter((r: any) => r['Custom Field 1']?.toString().trim() === product.styleNumber)
              .map((r: any) => r['Attribute']?.toString().trim())
              .filter(Boolean)
          )];

          fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            error: 'No matching variants found in QuickBooks file',
            message: `No rows found with Style Number '${product.styleNumber}' and Color '${productColor}'`,
            details: {
              styleNumber: product.styleNumber,
              color: productColor,
              totalRowsInFile: allRows.length,
              availableColors: availableColors.length > 0 ? availableColors : ['None found']
            }
          });
        }

        // Get existing variants
        const existingVariants = await storage.getProductVariants(productId);
        const variantsBySku = new Map(
          existingVariants.map(v => [v.sku, v])
        );

        console.log(`[QB Import] Existing variants: ${existingVariants.length}`);

        // Process each row (Smart Merge)
        const allSizes = new Set<string>();
        const toUpdate: { variantId: string; data: QBVariantData }[] = [];
        const toCreate: QBVariantData[] = [];
        const skipped: string[] = [];
        const warnings: string[] = [];

        for (const row of matchingRows) {
          // Validate row
          const validation = validateQBRow(row);
          if (!validation.isValid) {
            const sku = row['Item Number']?.toString() || 'Unknown';
            skipped.push(`SKU ${sku}: ${validation.error}`);
            continue;
          }

          // Parse row
          const variantData = parseQBRow(row);
          allSizes.add(variantData.size);

          // Check if SKU exists in another product
          const existingVariant = await storage.getVariantBySku(variantData.sku);
          if (existingVariant && existingVariant.productId !== productId) {
            warnings.push(`SKU ${variantData.sku} belongs to another product - skipped`);
            continue;
          }

          // Check if exists in THIS product
          const variantInProduct = variantsBySku.get(variantData.sku);
          if (variantInProduct) {
            toUpdate.push({ variantId: variantInProduct.id, data: variantData });
          } else {
            toCreate.push(variantData);
          }
        }

        console.log(`[QB Import] To update: ${toUpdate.length}, To create: ${toCreate.length}, Skipped: ${skipped.length}`);

        // Sync options BEFORE transaction (to avoid transaction isolation issues)
        console.log(`[QB Import] Creating/updating product options...`);
        await storage.upsertProductOption(productId, 'Color', [productColor]);

        if (allSizes.size > 0) {
          const sortedSizes = sortSizes(Array.from(allSizes));
          await storage.upsertProductOption(productId, 'Size', sortedSizes);
        }

        // Execute variant updates and creates in transaction
        await db.transaction(async (tx) => {
          // Update existing variants with correct option1/option2
          for (const { variantId, data } of toUpdate) {
            await storage.updateProductVariant(variantId, {
              title: `${productColor} / ${data.size}`,
              option1: productColor,  // Color at position 1
              option2: data.size,     // Size at position 2
              price: data.price,
              cost: data.cost,
              inventoryQuantity: data.inventoryQuantity,
              barcode: data.barcode,
              weight: data.weight?.toString() || null,  // Weight value from QB
              weightUnit: data.weight ? 'lb' : null,    // QuickBooks uses pounds
              updatedAt: new Date()
            });
          }

          // Create new variants with correct option1/option2
          for (const data of toCreate) {
            await storage.createProductVariant({
              productId,
              title: `${productColor} / ${data.size}`,
              option1: productColor,  // Color at position 1
              option2: data.size,     // Size at position 2
              option3: null,
              price: data.price,
              cost: data.cost,
              inventoryQuantity: data.inventoryQuantity,
              sku: data.sku,
              barcode: data.barcode,
              weight: data.weight?.toString() || null,  // Weight value from QB
              weightUnit: data.weight ? 'lb' : null,    // QuickBooks uses pounds
              position: existingVariants.length + toCreate.indexOf(data) + 1
            });
          }

          // Update product timestamp - MULTI-TENANT: tenantId already verified above
          await storage.updateProduct(tenantId, productId, {
            updatedAt: new Date()
          });
        });

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        const totalVariantsAfter = existingVariants.length - toUpdate.length + toUpdate.length + toCreate.length;

        console.log(`[QB Import] Import completed successfully`);
        console.log(`[QB Import] Total variants after import: ${totalVariantsAfter}`);

        res.json({
          success: true,
          message: 'Import completed successfully',
          summary: {
            totalRowsInFile: allRows.length,
            filteredRows: matchingRows.length,
            variantsUpdated: toUpdate.length,
            variantsCreated: toCreate.length,
            rowsSkipped: skipped.length,
            existingVariantsKept: existingVariants.length - toUpdate.length
          },
          details: {
            productId,
            productTitle: product.title,
            styleNumber: product.styleNumber,
            color: productColor,
            sizesFound: sortSizes(Array.from(allSizes)),
            totalVariantsAfterImport: totalVariantsAfter
          },
          warnings: warnings.length > 0 ? warnings : undefined,
          errors: skipped.length > 0 ? skipped : undefined
        });

      } catch (error: any) {
        console.error('[QB Import] Error during import:', error);

        // Clean up uploaded file if it exists
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        res.status(500).json({
          success: false,
          error: 'Import failed',
          message: `Error processing QuickBooks file: ${safeErrorMessage(error, 'unknown error')}`
        });
      }
    }
  );

  // ============================================================================
  // QuickBooks Inventory Routes
  // Import variants directly from QB POS data synced to qb_inventory table
  // ============================================================================

  // Trigger manual QB inventory sync (nexus_db → shopsyncflow_db)
  app.post("/api/qb-inventory/sync", requireAuth, requireRole(["SuperAdmin", "WarehouseManager"]), async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    try {
      const result = await syncTenant(tenantId, { batchSize: 1000 });
      res.json({
        success: result.success,
        itemsSynced: result.itemsSynced,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsFailed: result.itemsFailed,
        duration: result.duration,
        logId: result.logId,
      });
    } catch (error) {
      const err = error as Error;
      console.error("Error triggering QB inventory sync:", err.message);
      res.status(500).json({ message: "QB inventory sync failed", error: err.message });
    }
  });

  // Get QB inventory sync status (last sync info)
  app.get("/api/qb-inventory/sync-status", requireAuth, async (req: Request, res: Response) => {
    const tenantId = getTenantId(req);
    try {
      const status = await getSyncStatus(tenantId);
      res.json(status);
    } catch (error) {
      const err = error as Error;
      console.error("Error getting QB sync status:", err.message);
      res.status(500).json({ message: "Failed to get sync status" });
    }
  });

  // Search inventory - returns grouped products by style
  // Updated Dec 17, 2025: Now uses public.items and public.item_levels tables
  app.get("/api/qb-inventory/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const { q, vendor, category, gender, limit = 50 } = req.query;
      const tenantId = getTenantId(req);

      // Build the search query using SSF-owned items and itemLevels tables
      // MULTI-TENANT: Filter items by tenantId for proper isolation
      let query = db.select({
        style: items.style,
        vendorName: items.vendor,
        category: items.category,
        gender: items.gender,
        description: sql<string>`MIN(${items.description})`,
        variantCount: sql<number>`COUNT(DISTINCT ${items.id})::int`,
        totalQty: sql<string>`COALESCE(SUM(${itemLevels.quantity}::numeric), 0)::text`,
        colors: sql<string[]>`ARRAY_AGG(DISTINCT ${items.attribute}) FILTER (WHERE ${items.attribute} IS NOT NULL AND ${items.attribute} != '')`,
        sizes: sql<string[]>`ARRAY_AGG(DISTINCT ${items.size}) FILTER (WHERE ${items.size} IS NOT NULL AND ${items.size} != '')`,
        minPrice: sql<string>`MIN(${items.retailPrice})`,
        maxPrice: sql<string>`MAX(${items.retailPrice})`,
      })
      .from(items)
      .leftJoin(itemLevels, eq(items.id, itemLevels.itemId))
      .where(
        and(
          // MULTI-TENANT: Filter by tenant
          tenantId ? eq(items.tenantId, tenantId) : sql`1=1`,
          // Must have a style to group by
          isNotNull(items.style),
          ne(items.style, ''),
          // Search filter
          q ? or(
            ilike(items.style, `%${q}%`),
            ilike(items.vendor, `%${q}%`),
            ilike(items.description, `%${q}%`),
            ilike(items.itemNumber, `%${q}%`)
          ) : undefined,
          // Vendor filter
          vendor ? eq(items.vendor, vendor as string) : undefined,
          // Category filter
          category ? eq(items.category, category as string) : undefined,
          // Gender filter
          gender ? eq(items.gender, gender as string) : undefined
        )
      )
      .groupBy(items.style, items.vendor, items.category, items.gender)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(parseInt(limit as string, 10));

      const results = await query;

      res.json({
        results,
        count: results.length
      });
    } catch (error) {
      console.error("Error searching inventory:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all filter options (vendors, categories, genders)
  // Updated Dec 17, 2025: Now uses public.items table
  app.get("/api/qb-inventory/filters", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const tenantFilter = tenantId ? eq(items.tenantId, tenantId) : sql`1=1`;

      const [vendors, categories, genders] = await Promise.all([
        db.selectDistinct({ value: items.vendor })
          .from(items)
          .where(and(tenantFilter, isNotNull(items.vendor), ne(items.vendor, '')))
          .orderBy(items.vendor),
        db.selectDistinct({ value: items.category })
          .from(items)
          .where(and(tenantFilter, isNotNull(items.category), ne(items.category, '')))
          .orderBy(items.category),
        db.selectDistinct({ value: items.gender })
          .from(items)
          .where(and(tenantFilter, isNotNull(items.gender), ne(items.gender, '')))
          .orderBy(items.gender),
      ]);

      res.json({
        vendors: vendors.map(v => v.value),
        categories: categories.map(c => c.value),
        genders: genders.map(g => g.value),
      });
    } catch (error) {
      console.error("Error fetching inventory filters:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all items for a specific style (for preview before import)
  // Updated Feb 13, 2026: Returns per-location inventory breakdown
  // MULTI-TENANT: Filter items by tenantId for proper isolation
  app.get("/api/qb-inventory/styles/:style", requireAuth, async (req: Request, res: Response) => {
    try {
      const { style } = req.params;
      const tenantId = getTenantId(req);
      const tenantFilter = tenantId ? eq(items.tenantId, tenantId) : sql`1=1`;

      // Query 1: Get items (no inventory join, no GROUP BY needed)
      const itemResults = await db.select({
        listId: items.id,
        itemNumber: items.itemNumber,
        description: items.description,
        attribute: items.attribute,
        size: items.size,
        upc: items.upc,
        alu: items.alu,
        msrp: items.msrp,
        retailPrice: items.retailPrice,
        costPrice: items.costPrice,
        weight: items.weight,
        vendorName: items.vendor,
        category: items.category,
        gender: items.gender,
      })
      .from(items)
      .where(and(tenantFilter, eq(items.style, style)))
      .orderBy(items.attribute, items.size);

      if (itemResults.length === 0) {
        return res.status(404).json({ message: "Style not found" });
      }

      // Query 2: Get per-location inventory for all items of this style
      const itemIds = itemResults.map(i => i.listId);
      const inventoryRows = await db.select({
        itemId: itemLevels.itemId,
        locationCode: ssfLocations.code,
        locationName: ssfLocations.name,
        quantity: itemLevels.quantity,
      })
      .from(itemLevels)
      .innerJoin(ssfLocations, eq(itemLevels.locationId, ssfLocations.id))
      .where(inArray(itemLevels.itemId, itemIds))
      .orderBy(ssfLocations.sortOrder);

      // Build Map: itemId -> locationInventory[]
      const inventoryMap = new Map<string, Array<{ code: string; name: string; qty: number }>>();
      for (const row of inventoryRows) {
        const arr = inventoryMap.get(row.itemId) || [];
        arr.push({ code: row.locationCode, name: row.locationName, qty: parseFloat(row.quantity || '0') });
        inventoryMap.set(row.itemId, arr);
      }

      // Attach per-location data and compute total per item
      const enrichedItems = itemResults.map(item => {
        const locationInventory = inventoryMap.get(item.listId) || [];
        const quantityOnHand = locationInventory.reduce((sum, loc) => sum + loc.qty, 0).toString();
        return { ...item, locationInventory, quantityOnHand };
      });

      // Get ordered location list
      const locationCodes = [...new Set(inventoryRows.map(r => r.locationCode))];

      // Extract unique colors and sizes
      const colors = [...new Set(enrichedItems.map(i => i.attribute).filter(Boolean))];
      const sizes = [...new Set(enrichedItems.map(i => i.size).filter(Boolean))];

      // Detect duplicates: items with same color/size but different item numbers (SKUs)
      const colorSizeMap = new Map<string, typeof enrichedItems>();
      for (const item of enrichedItems) {
        const key = `${item.attribute || ''}|${item.size || ''}`;
        const existing = colorSizeMap.get(key);
        if (existing) {
          existing.push(item);
        } else {
          colorSizeMap.set(key, [item]);
        }
      }

      // Build duplicates array - only include groups with more than one item
      const duplicates: Array<{
        color: string | null;
        size: string | null;
        key: string;
        items: Array<{
          itemNumber: string;
          description: string | null;
          quantityOnHand: string;
          costPrice: string | null;
          retailPrice: string | null;
          locationInventory: Array<{ code: string; name: string; qty: number }>;
        }>;
      }> = [];

      for (const [key, groupItems] of colorSizeMap.entries()) {
        if (groupItems.length > 1) {
          duplicates.push({
            color: groupItems[0].attribute,
            size: groupItems[0].size,
            key,
            items: groupItems.map(item => ({
              itemNumber: item.itemNumber || '',
              description: item.description,
              quantityOnHand: item.quantityOnHand,
              costPrice: item.costPrice,
              retailPrice: item.retailPrice,
              locationInventory: item.locationInventory,
            })),
          });
        }
      }

      res.json({
        style,
        vendorName: enrichedItems[0].vendorName,
        category: enrichedItems[0].category,
        gender: enrichedItems[0].gender,
        description: enrichedItems[0].description,
        colors,
        sizes,
        locations: locationCodes,
        items: enrichedItems,
        duplicates,
        summary: {
          variantCount: enrichedItems.length,
          colorCount: colors.length,
          sizeCount: sizes.length,
          totalInventory: enrichedItems.reduce((sum, i) => sum + parseFloat(i.quantityOnHand || '0'), 0),
          duplicateCount: duplicates.length,
        }
      });
    } catch (error) {
      console.error("Error fetching style details:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Import variants from QB inventory into a product
  app.post("/api/products/:id/import-qb-variants", requireAuth, requireRole(["SuperAdmin", "WarehouseManager", "Editor"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(401).json({ message: "No tenant context" });
      }

      const { id: productId } = req.params;
      const { style, replaceExisting = false, selectedColors, selectedSizes, excludedSkus } = req.body;

      if (!style) {
        return res.status(400).json({ message: "Style is required" });
      }

      // Verify product exists and belongs to tenant
      const product = await storage.getProduct(tenantId, productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Get items for this style from SSF-owned items table, with inventory quantities
      // Updated Feb 13, 2026: Now joins item_levels to get actual QB inventory
      let qbItems = await db.select({
        id: items.id,
        tenantId: items.tenantId,
        style: items.style,
        itemNumber: items.itemNumber,
        description: items.description,
        attribute: items.attribute,
        size: items.size,
        upc: items.upc,
        vendor: items.vendor,
        category: items.category,
        gender: items.gender,
        retailPrice: items.retailPrice,
        msrp: items.msrp,
        costPrice: items.costPrice,
        weight: items.weight,
        totalQuantity: sql<string>`COALESCE(SUM(${itemLevels.quantity}::numeric), 0)::text`,
      })
        .from(items)
        .leftJoin(itemLevels, eq(items.id, itemLevels.itemId))
        .where(and(
          eq(items.tenantId, tenantId),
          eq(items.style, style)
        ))
        .groupBy(items.id)
        .orderBy(items.attribute, items.size);

      if (qbItems.length === 0) {
        return res.status(404).json({ message: "No QB inventory found for this style" });
      }

      // Filter by selected colors and sizes if provided
      if (selectedColors && selectedColors.length > 0) {
        const colorSet = new Set(selectedColors as string[]);
        qbItems = qbItems.filter(item => !item.attribute || colorSet.has(item.attribute));
      }
      if (selectedSizes && selectedSizes.length > 0) {
        const sizeSet = new Set(selectedSizes as string[]);
        qbItems = qbItems.filter(item => !item.size || sizeSet.has(item.size));
      }

      // Filter out excluded SKUs (user-selected duplicates to discard)
      if (excludedSkus && Array.isArray(excludedSkus) && excludedSkus.length > 0) {
        const excludedSet = new Set(excludedSkus as string[]);
        qbItems = qbItems.filter(item => !item.itemNumber || !excludedSet.has(item.itemNumber));
      }

      if (qbItems.length === 0) {
        return res.status(400).json({ message: "No variants match the selected colors/sizes" });
      }

      // Check for remaining duplicates (same color/size, different SKUs)
      const colorSizeCheck = new Map<string, string>();
      for (const item of qbItems) {
        const key = `${item.attribute || ''}|${item.size || ''}`;
        const existingSku = colorSizeCheck.get(key);
        if (existingSku && existingSku !== item.itemNumber) {
          return res.status(400).json({
            message: `Duplicate detected: ${item.attribute || 'No Color'} / ${item.size || 'No Size'} has multiple SKUs (${existingSku} and ${item.itemNumber}). Please resolve duplicates before importing.`,
          });
        }
        colorSizeCheck.set(key, item.itemNumber || '');
      }

      // Extract unique colors and sizes from filtered items
      const colors = [...new Set(qbItems.map(i => i.attribute).filter(Boolean))] as string[];
      const sizes = [...new Set(qbItems.map(i => i.size).filter(Boolean))] as string[];

      // Sort sizes in logical order
      const sizeOrder = ['XXS', 'XS', 'S', 'Small', 'M', 'Medium', 'L', 'Large', 'XL', 'X-Large', 'XXL', 'XX-Large', 'XXXL', 'XXX-Large', '2XL', '3XL', '4XL', '5XL'];
      sizes.sort((a, b) => {
        const aIndex = sizeOrder.findIndex(s => a.toLowerCase().includes(s.toLowerCase()));
        const bIndex = sizeOrder.findIndex(s => b.toLowerCase().includes(s.toLowerCase()));
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
      });

      // Delete existing options and variants if replaceExisting is true
      if (replaceExisting) {
        await storage.deleteProductVariants(productId);
        await storage.deleteProductOptions(productId);
      }

      // Create product options
      const createdOptions: any[] = [];

      // Create Color option if there are multiple colors
      if (colors.length > 0) {
        const colorOption = await storage.createProductOption({
          productId,
          name: 'Color',
          position: 1,
          values: colors,
        });
        createdOptions.push(colorOption);
      }

      // Create Size option if there are multiple sizes
      if (sizes.length > 0) {
        const sizeOption = await storage.createProductOption({
          productId,
          name: 'Size',
          position: 2,
          values: sizes,
        });
        createdOptions.push(sizeOption);
      }

      // Create variants for each QB item (duplicates have been resolved by user)
      const createdVariants: any[] = [];
      for (const qbItem of qbItems) {
        // Build option values
        const option1 = qbItem.attribute || null;
        const option2 = qbItem.size || null;

        // Create variant with actual QB inventory quantity
        const totalQty = parseInt(qbItem.totalQuantity || '0', 10);
        const variant = await storage.createProductVariant({
          productId,
          title: [option1, option2].filter(Boolean).join(' / ') || 'Default',
          sku: qbItem.itemNumber || undefined,
          barcode: qbItem.upc || undefined,
          price: qbItem.retailPrice?.toString() || undefined,
          compareAtPrice: qbItem.msrp?.toString() || undefined,
          cost: qbItem.costPrice?.toString() || undefined,
          inventoryQuantity: totalQty,
          option1,
          option2,
          option3: null,
          weight: qbItem.weight ? parseFloat(qbItem.weight.toString()) : undefined,
          weightUnit: 'lb',
          requiresShipping: true,
          taxable: true,
          inventoryPolicy: 'deny',
          fulfillmentService: 'manual',
          inventoryManagement: 'shopify',
        });
        createdVariants.push(variant);
      }

      // Get first item for metadata
      const firstItem = qbItems[0];

      // Update product with QB metadata
      // Note: items table uses 'vendor' instead of 'vendorName'
      await storage.updateProduct(tenantId, productId, {
        styleNumber: style,
        vendor: firstItem.vendor || product.vendor,
        metadata: {
          ...((product.metadata as object) || {}),
          qbImport: {
            style,
            importedAt: new Date().toISOString(),
            itemCount: qbItems.length,
            category: firstItem.category,
            gender: firstItem.gender,
          }
        }
      });

      res.json({
        success: true,
        message: `Imported ${createdVariants.length} variants from QB style ${style}`,
        options: createdOptions,
        variants: createdVariants,
        summary: {
          style,
          vendor: firstItem.vendor,
          optionsCreated: createdOptions.length,
          variantsCreated: createdVariants.length,
          colors: colors.length,
          sizes: sizes.length,
        }
      });
    } catch (error) {
      console.error("Error importing QB variants:", error);
      res.status(500).json({ message: "Internal server error", error: safeErrorMessage(error) });
    }
  });

  // Get per-location inventory breakdown for a product's imported variants
  // Links productVariants.sku → items.itemNumber → item_levels per location
  app.get("/api/products/:id/variants/inventory-by-location", requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) return res.status(401).json({ message: "No tenant context" });

      const product = await storage.getProduct(tenantId, req.params.id);
      if (!product) return res.status(404).json({ message: "Product not found" });

      // Get all variants for this product
      const variants = await storage.getProductVariants(req.params.id);
      const skus = variants.map(v => v.sku).filter(Boolean) as string[];

      if (skus.length === 0) {
        return res.json({ variantInventory: {}, locations: [] });
      }

      // Get per-location inventory for all matching SKUs
      const inventoryRows = await db.select({
        itemNumber: items.itemNumber,
        locationCode: ssfLocations.code,
        locationName: ssfLocations.name,
        quantity: itemLevels.quantity,
      })
      .from(itemLevels)
      .innerJoin(items, eq(itemLevels.itemId, items.id))
      .innerJoin(ssfLocations, eq(itemLevels.locationId, ssfLocations.id))
      .where(and(
        eq(items.tenantId, tenantId),
        inArray(items.itemNumber, skus)
      ))
      .orderBy(ssfLocations.sortOrder);

      // Build map: sku -> locationInventory[]
      const variantInventory: Record<string, Array<{ code: string; name: string; qty: number }>> = {};
      for (const row of inventoryRows) {
        const sku = row.itemNumber!;
        if (!variantInventory[sku]) variantInventory[sku] = [];
        variantInventory[sku].push({
          code: row.locationCode,
          name: row.locationName,
          qty: parseFloat(row.quantity || '0'),
        });
      }

      // Get ordered location list for this tenant
      const locations = await db.select({
        code: ssfLocations.code,
        name: ssfLocations.name,
      })
      .from(ssfLocations)
      .where(eq(ssfLocations.tenantId, tenantId))
      .orderBy(ssfLocations.sortOrder);

      res.json({ variantInventory, locations });
    } catch (error) {
      console.error("Error fetching variant inventory by location:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
