/**
 * Category Migration Service
 *
 * Handles migration from old category system to Shopify's 4-part system:
 * 1. Product Type ← Last segment of category name
 * 2. Tags ← Gender + intermediate segments + descriptors
 * 3. Shopify Taxonomy ← Standard Google Product Category
 * 4. Collections ← Keep existing (already working)
 */

import { storage } from "../storage";
import { CATEGORY_MAPPINGS, type CategoryMapping } from "./category-mappings";
import { writeFile, readFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Backup directory (ensure it exists)
const BACKUP_DIR = join(__dirname, "../backups/category-migrations");

export interface BackupInfo {
  filename: string;
  categoryName: string;
  timestamp: string;
  productCount: number;
  createdAt: Date;
}

export interface MigrationStatus {
  categories: Array<{
    name: string;
    productCount: number;
    tier: number;
    riskLevel: 'low' | 'medium' | 'high';
    hasMapping: boolean;
    mapping?: CategoryMapping;
  }>;
  totalCategories: number;
  totalProducts: number;
  categoriesWithMapping: number;
}

export interface MigrationResult {
  success: boolean;
  categoryName: string;
  productsFound: number;
  productsUpdated: number;
  errors: string[];
  updatedProducts: Array<{
    id: string;
    title: string;
    oldCategory: string | null;
    newProductType: string;
    oldTags: string | null;
    newTags: string;
    shopifyTaxonomy: string;
  }>;
}

class CategoryMigrationService {
  /**
   * Get migration status for all categories
   * MULTI-TENANT: Added tenantId parameter
   */
  async getMigrationStatus(tenantId: string): Promise<MigrationStatus> {
    // Get all active categories with product counts
    const categories = await storage.getAllCategories(tenantId, { isActive: true });

    const categoriesWithStatus = categories.map(cat => {
      const productCount = cat.productCount || 0;

      // Determine tier and risk level
      let tier = 1;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';

      if (productCount <= 10) {
        tier = 1;
        riskLevel = 'low';
      } else if (productCount <= 50) {
        tier = 2;
        riskLevel = 'low';
      } else if (productCount <= 100) {
        tier = 3;
        riskLevel = 'medium';
      } else {
        tier = 4;
        riskLevel = 'high';
      }

      // Check if mapping exists
      const mapping = CATEGORY_MAPPINGS[cat.name];

      return {
        name: cat.name,
        productCount,
        tier,
        riskLevel,
        hasMapping: !!mapping,
        mapping
      };
    });

    // Sort by product count ascending (safest first)
    categoriesWithStatus.sort((a, b) => a.productCount - b.productCount);

    return {
      categories: categoriesWithStatus,
      totalCategories: categoriesWithStatus.length,
      totalProducts: categoriesWithStatus.reduce((sum, cat) => sum + cat.productCount, 0),
      categoriesWithMapping: categoriesWithStatus.filter(cat => cat.hasMapping).length
    };
  }

  /**
   * Run dry-run migration for a category (preview changes)
   */
  async runDryRun(tenantId: string, categoryName: string): Promise<MigrationResult> {
    return this.migrateCategory(tenantId, categoryName, true);
  }

  /**
   * Execute migration for a category (actually modify database)
   * MULTI-TENANT: Added tenantId parameter
   */
  async executeMigration(tenantId: string, categoryName: string): Promise<MigrationResult> {
    return this.migrateCategory(tenantId, categoryName, false);
  }

  /**
   * Internal migration logic (dry-run or execute)
   * MULTI-TENANT: Added tenantId parameter
   */
  private async migrateCategory(tenantId: string, categoryName: string, dryRun: boolean): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      categoryName,
      productsFound: 0,
      productsUpdated: 0,
      errors: [],
      updatedProducts: []
    };

    console.log(`\n${"=".repeat(80)}`);
    console.log(`🚀 Category Migration: ${categoryName}`);
    console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "EXECUTE (will modify database)"}`);
    console.log(`${"=".repeat(80)}\n`);

    // 1. Get mapping for this category
    const mapping = CATEGORY_MAPPINGS[categoryName];
    if (!mapping) {
      const error = `No mapping found for category: ${categoryName}`;
      result.errors.push(error);
      result.success = false;
      console.error(`❌ ERROR: ${error}`);
      return result;
    }

    console.log(`📋 Migration Mapping:`);
    console.log(`   Product Type: ${mapping.productType}`);
    console.log(`   Tags: ${mapping.tags.join(", ")}`);
    console.log(`   Shopify Taxonomy: ${mapping.shopifyTaxonomy.path}`);
    if (mapping.notes) {
      console.log(`   Notes: ${mapping.notes}`);
    }
    console.log();

    // 2. Find category in database
    // MULTI-TENANT: Use tenant-scoped category lookup
    const categories = await storage.getAllCategories(tenantId, { search: categoryName });
    const category = categories.find(c => c.name === categoryName);

    if (!category) {
      const error = `Category not found in database: ${categoryName}`;
      result.errors.push(error);
      result.success = false;
      console.error(`❌ ERROR: ${error}`);
      return result;
    }

    console.log(`✅ Found category: ${category.name} (ID: ${category.id})`);
    console.log(`   Product count: ${category.productCount}\n`);

    // 3. Get all products in this category
    // INTERNAL ADMIN TOOL: Using getProductsByCategoryId which doesn't filter by tenant
    const productsInCategory = await storage.getProductsByCategoryId(category.id);
    result.productsFound = productsInCategory.length;
    console.log(`📦 Found ${result.productsFound} products to migrate\n`);

    if (result.productsFound === 0) {
      console.log(`⚠️  No products found in this category. Nothing to migrate.`);
      return result;
    }

    // 4. Process each product
    for (const product of productsInCategory) {
      try {
        console.log(`\n${"─".repeat(80)}`);
        console.log(`📦 Product: ${product.title}`);
        console.log(`   ID: ${product.id}`);
        console.log(`   Handle: ${product.handle}`);

        // Parse existing tags
        const existingTags = product.tags ? product.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
        console.log(`   Existing tags (${existingTags.length}): ${existingTags.join(", ") || "(none)"}`);

        // Build new tags - append to existing, avoid duplicates
        const newTagsSet = new Set([...existingTags, ...mapping.tags]);
        const newTags = Array.from(newTagsSet).join(", ");
        console.log(`   New tags (${newTagsSet.size}): ${newTags}`);

        // Prepare update
        const updates = {
          productType: mapping.productType,
          tags: newTags,
          shopifyCategoryId: mapping.shopifyTaxonomy.id || null,
          shopifyCategoryPath: mapping.shopifyTaxonomy.path || null,
          // Clear old category references
          categoryId: null,
          category: null,
          updatedAt: new Date()
        };

        console.log(`\n   📝 Changes to apply:`);
        console.log(`      Product Type: ${product.productType || "(empty)"} → ${updates.productType}`);
        console.log(`      Tags: ${existingTags.length} tags → ${newTagsSet.size} tags`);
        console.log(`      Shopify Taxonomy: ${updates.shopifyCategoryPath || "(none)"}`);
        console.log(`      Category: ${product.category} → (removed)`);

        if (!dryRun) {
          // Execute the update
          // INTERNAL ADMIN TOOL: Using updateProductByInternalId which doesn't filter by tenant
          await storage.updateProductByInternalId(product.id, updates);
          console.log(`   ✅ Updated successfully`);
          result.productsUpdated++;
        } else {
          console.log(`   🔍 DRY RUN - No changes made`);
        }

        // Track for summary
        result.updatedProducts.push({
          id: product.id,
          title: product.title,
          oldCategory: product.category,
          newProductType: updates.productType,
          oldTags: product.tags,
          newTags: newTags,
          shopifyTaxonomy: updates.shopifyCategoryPath || ""
        });

      } catch (error: any) {
        const errorMsg = `Failed to migrate product ${product.id} (${product.title}): ${error.message}`;
        result.errors.push(errorMsg);
        result.success = false;
        console.error(`   ❌ ERROR: ${error.message}`);
      }
    }

    // 5. Update category product count (if executing)
    if (!dryRun) {
      await storage.updateCategoryProductCounts();
    }

    console.log(`\n\n${"=".repeat(80)}`);
    console.log(`📊 MIGRATION ${dryRun ? "PREVIEW" : "COMPLETE"}`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Category: ${result.categoryName}`);
    console.log(`Products found: ${result.productsFound}`);
    console.log(`Products ${dryRun ? "to be updated" : "updated"}: ${dryRun ? result.productsFound : result.productsUpdated}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`${"=".repeat(80)}\n`);

    return result;
  }

  /**
   * Create backup of all products in a category before migration
   * MULTI-TENANT: Added tenantId parameter
   */
  async createBackup(tenantId: string, categoryName: string): Promise<{ success: boolean; backupFile?: string; error?: string; productCount?: number }> {
    try {
      console.log(`📦 Creating backup for category: ${categoryName}`);

      // Ensure backup directory exists
      if (!existsSync(BACKUP_DIR)) {
        await mkdir(BACKUP_DIR, { recursive: true });
      }

      // Find category in database
      // MULTI-TENANT: Use tenant-scoped category lookup
      const categories = await storage.getAllCategories(tenantId, { search: categoryName });
      const category = categories.find(c => c.name === categoryName);

      if (!category) {
        return { success: false, error: `Category not found: ${categoryName}` };
      }

      // Get all products in this category
      // INTERNAL ADMIN TOOL: Using getProductsByCategoryId which doesn't filter by tenant
      const products = await storage.getProductsByCategoryId(category.id);

      if (products.length === 0) {
        return { success: false, error: `No products found in category: ${categoryName}` };
      }

      // Create backup data
      const backupData = {
        categoryName,
        categoryId: category.id,
        timestamp: new Date().toISOString(),
        productCount: products.length,
        products: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          productType: p.productType,
          tags: p.tags,
          category: p.category,
          categoryId: p.categoryId,
          shopifyCategoryId: p.shopifyCategoryId,
          shopifyCategoryPath: p.shopifyCategoryPath,
        }))
      };

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedCategoryName = categoryName.replace(/[^a-zA-Z0-9-]/g, '_');
      const filename = `backup_${sanitizedCategoryName}_${timestamp}.json`;
      const filepath = join(BACKUP_DIR, filename);

      // Write backup file
      await writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf-8');

      console.log(`✅ Backup created: ${filename}`);
      console.log(`   Products backed up: ${products.length}`);
      console.log(`   File: ${filepath}`);

      return {
        success: true,
        backupFile: filename,
        productCount: products.length
      };

    } catch (error: any) {
      console.error(`❌ Error creating backup: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore products from a backup file
   */
  async restoreFromBackup(backupFilename: string): Promise<{ success: boolean; restoredCount?: number; error?: string }> {
    try {
      console.log(`📦 Restoring from backup: ${backupFilename}`);

      const filepath = join(BACKUP_DIR, backupFilename);

      if (!existsSync(filepath)) {
        return { success: false, error: `Backup file not found: ${backupFilename}` };
      }

      // Read backup file
      const backupContent = await readFile(filepath, 'utf-8');
      const backupData = JSON.parse(backupContent);

      console.log(`📋 Backup info:`);
      console.log(`   Category: ${backupData.categoryName}`);
      console.log(`   Created: ${backupData.timestamp}`);
      console.log(`   Products: ${backupData.productCount}`);

      // Restore each product
      let restoredCount = 0;
      const errors: string[] = [];

      for (const productData of backupData.products) {
        try {
          // INTERNAL ADMIN TOOL: Using updateProductByInternalId which doesn't filter by tenant
          await storage.updateProductByInternalId(productData.id, {
            productType: productData.productType,
            tags: productData.tags,
            category: productData.category,
            categoryId: productData.categoryId,
            shopifyCategoryId: productData.shopifyCategoryId,
            shopifyCategoryPath: productData.shopifyCategoryPath,
            updatedAt: new Date()
          });
          restoredCount++;
          console.log(`   ✅ Restored: ${productData.title}`);
        } catch (error: any) {
          const errorMsg = `Failed to restore product ${productData.id}: ${error.message}`;
          errors.push(errorMsg);
          console.error(`   ❌ ${errorMsg}`);
        }
      }

      // Update category product counts
      await storage.updateCategoryProductCounts();

      console.log(`\n✅ Restore complete: ${restoredCount}/${backupData.productCount} products restored`);

      if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} errors occurred during restore`);
      }

      return {
        success: errors.length === 0,
        restoredCount,
        error: errors.length > 0 ? `${errors.length} products failed to restore` : undefined
      };

    } catch (error: any) {
      console.error(`❌ Error restoring from backup: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      // Ensure backup directory exists
      if (!existsSync(BACKUP_DIR)) {
        await mkdir(BACKUP_DIR, { recursive: true });
        return [];
      }

      const files = await readdir(BACKUP_DIR);
      const backups: BackupInfo[] = [];

      for (const filename of files) {
        if (!filename.endsWith('.json')) continue;

        try {
          const filepath = join(BACKUP_DIR, filename);
          const content = await readFile(filepath, 'utf-8');
          const data = JSON.parse(content);

          backups.push({
            filename,
            categoryName: data.categoryName,
            timestamp: data.timestamp,
            productCount: data.productCount,
            createdAt: new Date(data.timestamp)
          });
        } catch (error) {
          console.error(`Error reading backup file ${filename}:`, error);
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return backups;

    } catch (error: any) {
      console.error(`Error listing backups: ${error.message}`);
      return [];
    }
  }
}

export default new CategoryMigrationService();
