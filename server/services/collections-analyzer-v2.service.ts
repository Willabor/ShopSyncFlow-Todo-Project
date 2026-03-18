/**
 * Collections Analyzer Service V2
 *
 * Analyzes smart collections in LOCAL database to identify which ones have rules
 * based on the old category system (hierarchical product types with hyphens).
 *
 * These collections will BREAK during category migration when product_type changes
 * from "Men-Tops-T-Shirts" to "T-Shirts".
 *
 * This version queries the local database directly (much faster than fetching from Shopify API).
 */

import { db } from "../db";
import { collections, products, productCollections, type Collection } from "../../shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { shopifyService } from "../shopify";
import { categoryRecommendationService } from "./category-recommendation.service";

// ============================================================================
// TYPES
// ============================================================================

export interface CollectionRule {
  column: string; // "TYPE", "TAG", "VENDOR", etc.
  relation: string; // "EQUALS", "CONTAINS", "NOT_EQUALS", etc.
  condition: string; // the value to match (e.g., "Men-Tops-T-Shirts")
}

export interface CollectionRuleSet {
  rules: CollectionRule[];
  appliedDisjunctively: boolean; // true = OR, false = AND
}

export interface AffectedCollection {
  id: string;
  name: string;
  shopifyCollectionId: string | null;
  shopifyHandle: string | null;
  productCount: number;
  currentRules: CollectionRuleSet;
  typeRule: CollectionRule | null; // The TYPE rule that will break
  recommendedFix: {
    newTypeValue: string; // Extracted clean type (e.g., "T-Shirts")
    suggestedTags: string[]; // Suggested tags to add (e.g., ["Men", "Tops"])
    explanation: string;

    // Google Product Taxonomy (from intelligent recommendation)
    categoryId: string | null; // Google category ID (e.g., "aa-2-17-5")
    categoryGid: string | null; // Shopify GID
    categoryPath: string | null; // Full path
    categoryName: string | null; // Category name
    confidence: 'high' | 'medium' | 'low' | 'none';
    source: 'database' | 'ai' | 'fallback';
    reasoning?: string;
  } | null;
  requiresUpdate: boolean;

  // Product migration status
  productsMigrated: boolean; // Are products in this collection already migrated?
  productsNeedingMigration: number; // How many products still need migration

  // Migration workflow status
  migrationStatus: 'needs_rules_fix' | 'needs_product_migration' | 'complete';
}

export interface AnalysisReport {
  timestamp: Date;

  // Summary stats
  totalCollections: number;
  totalSmartCollections: number;
  collectionsWithTypeRules: number;
  affectedCollections: number;

  // Migration progress stats
  collectionsFullyMigrated: number; // Rules fixed AND products migrated
  collectionsAwaitingMigration: number; // Rules OR products still need work

  // Detailed results
  affected: AffectedCollection[];

  // Status
  readyForMigration: boolean;
  warnings: string[];
  recommendations: string[];
}

// ============================================================================
// ANALYZER SERVICE
// ============================================================================

class CollectionsAnalyzerV2Service {

  /**
   * Main analysis method - queries local database for affected collections
   */
  async analyzeCollections(): Promise<AnalysisReport> {
    console.log("🔍 Starting collections analysis (local DB)...");

    try {
      // Step 1: Get total counts
      const totalResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(collections);
      const totalCollections = totalResult[0]?.count || 0;

      const smartResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(collections)
        .where(eq(collections.shopifyType, 'smart'));
      const totalSmartCollections = smartResult[0]?.count || 0;

      console.log(`📦 Found ${totalSmartCollections} smart collections (out of ${totalCollections} total)`);

      // Step 2: Get collections with TYPE rules
      const collectionsWithTypeRules = await db
        .select()
        .from(collections)
        .where(
          and(
            eq(collections.shopifyType, 'smart'),
            sql`${collections.rules}::text LIKE '%TYPE%'`
          )
        );

      console.log(`📊 Found ${collectionsWithTypeRules.length} collections with TYPE rules`);

      // Step 3: Filter for affected collections (TYPE rules with hyphens)
      const affected: AffectedCollection[] = [];

      for (const collection of collectionsWithTypeRules) {
        const analysis = await this.analyzeCollection(collection);
        if (analysis.requiresUpdate) {
          affected.push(analysis);
        }
      }

      console.log(`⚠️  Found ${affected.length} collections affected by migration`);

      // Step 4: Calculate migration progress stats
      const collectionsFullyMigrated = affected.filter(c => c.migrationStatus === 'complete').length;
      const collectionsAwaitingMigration = affected.filter(c => c.migrationStatus !== 'complete').length;

      console.log(`✅ Fully migrated: ${collectionsFullyMigrated}`);
      console.log(`⏳ Awaiting migration: ${collectionsAwaitingMigration}`);

      // Step 5: Generate report
      const report: AnalysisReport = {
        timestamp: new Date(),
        totalCollections,
        totalSmartCollections,
        collectionsWithTypeRules: collectionsWithTypeRules.length,
        affectedCollections: affected.length,
        collectionsFullyMigrated,
        collectionsAwaitingMigration,
        affected,
        readyForMigration: collectionsAwaitingMigration === 0,
        warnings: [],
        recommendations: []
      };

      // Add warnings
      if (collectionsAwaitingMigration > 0) {
        const needsRulesFix = affected.filter(c => c.migrationStatus === 'needs_rules_fix').length;
        const needsProductMigration = affected.filter(c => c.migrationStatus === 'needs_product_migration').length;

        if (needsRulesFix > 0) {
          report.warnings.push(
            `${needsRulesFix} collections have TYPE rules with hyphens that need fixing`
          );
        }
        if (needsProductMigration > 0) {
          report.warnings.push(
            `${needsProductMigration} collections have rules fixed but products still need migration`
          );
        }
      }

      // Add recommendations
      if (collectionsAwaitingMigration > 0) {
        report.recommendations.push(
          `Complete migration for all ${collectionsAwaitingMigration} collections BEFORE proceeding`
        );
        report.recommendations.push(
          `Use "Fix Rules" button to update collection rules`
        );
        report.recommendations.push(
          `Use "Migrate Products" button to migrate products in each collection`
        );
        report.recommendations.push(
          `Collections must have BOTH rules fixed AND products migrated to be complete`
        );
      } else {
        report.recommendations.push(
          `✅ All collections are fully migrated! Ready to proceed.`
        );
      }

      console.log(`✅ Analysis complete: ${report.readyForMigration ? 'READY' : 'NOT READY'} for migration`);

      return report;

    } catch (error) {
      console.error("❌ Error during collections analysis:", error);
      throw error;
    }
  }

  /**
   * Analyze a single collection to determine if it's affected by migration
   */
  private async analyzeCollection(collection: Collection): Promise<AffectedCollection> {
    const rules = collection.rules as CollectionRuleSet | null;

    // Check product migration status
    const migrationStatus = await this.checkProductMigrationStatus(collection.id);

    if (!rules || !rules.rules || rules.rules.length === 0) {
      return {
        id: collection.id,
        name: collection.name,
        shopifyCollectionId: collection.shopifyCollectionId,
        shopifyHandle: collection.shopifyHandle,
        productCount: collection.productCount,
        currentRules: rules || { rules: [], appliedDisjunctively: false },
        typeRule: null,
        recommendedFix: null,
        requiresUpdate: false,
        productsMigrated: migrationStatus.productsMigrated,
        productsNeedingMigration: migrationStatus.productsNeedingMigration,
        migrationStatus: migrationStatus.productsNeedingMigration > 0 ? 'needs_product_migration' : 'complete'
      };
    }

    // Find TYPE rule
    const typeRule = rules.rules.find(rule =>
      rule.column === 'TYPE' || rule.column === 'PRODUCT_TYPE'
    );

    if (!typeRule) {
      // No TYPE rule - check if products still need migration
      const needsWork = migrationStatus.productsNeedingMigration > 0;
      return {
        id: collection.id,
        name: collection.name,
        shopifyCollectionId: collection.shopifyCollectionId,
        shopifyHandle: collection.shopifyHandle,
        productCount: collection.productCount,
        currentRules: rules,
        typeRule: null,
        recommendedFix: null,
        requiresUpdate: needsWork,
        productsMigrated: migrationStatus.productsMigrated,
        productsNeedingMigration: migrationStatus.productsNeedingMigration,
        migrationStatus: needsWork ? 'needs_product_migration' : 'complete'
      };
    }

    // Check if TYPE condition contains hyphens (hierarchical category name)
    const hasHyphens = typeRule.condition.includes('-');

    if (!hasHyphens) {
      // TYPE rule exists but doesn't have hyphens - rules are clean, but check products
      const needsWork = migrationStatus.productsNeedingMigration > 0;

      // DEBUG LOG
      if (collection.name === 'Women-Dresses-Maxi Dresses') {
        console.log(`🔍 DEBUG Women-Dresses-Maxi Dresses:`, {
          hasHyphens: false,
          productsNeedingMigration: migrationStatus.productsNeedingMigration,
          productsMigrated: migrationStatus.productsMigrated,
          needsWork,
          requiresUpdate: needsWork,
          migrationStatus: needsWork ? 'needs_product_migration' : 'complete'
        });
      }

      return {
        id: collection.id,
        name: collection.name,
        shopifyCollectionId: collection.shopifyCollectionId,
        shopifyHandle: collection.shopifyHandle,
        productCount: collection.productCount,
        currentRules: rules,
        typeRule,
        recommendedFix: null,
        requiresUpdate: needsWork, // Show collection if products still need migration
        productsMigrated: migrationStatus.productsMigrated,
        productsNeedingMigration: migrationStatus.productsNeedingMigration,
        migrationStatus: needsWork ? 'needs_product_migration' : 'complete'
      };
    }

    // This collection is affected! Generate recommended fix
    const recommendedFix = await this.generateRecommendedFix(typeRule.condition);

    return {
      id: collection.id,
      name: collection.name,
      shopifyCollectionId: collection.shopifyCollectionId,
      shopifyHandle: collection.shopifyHandle,
      productCount: collection.productCount,
      currentRules: rules,
      typeRule,
      recommendedFix,
      requiresUpdate: true, // Always show if rules need fixing
      productsMigrated: migrationStatus.productsMigrated,
      productsNeedingMigration: migrationStatus.productsNeedingMigration,
      migrationStatus: 'needs_rules_fix' // Rules have hyphens
    };
  }

  /**
   * Generate recommended fix for a hierarchical TYPE value using intelligent recommendation
   * Example: "Headwear-Bucket Hat" → Google category "Bucket Hats" + tags ["Headwear"]
   */
  private async generateRecommendedFix(hierarchicalType: string): Promise<AffectedCollection['recommendedFix']> {
    try {
      // Use intelligent recommendation service (Tier 1: DB search, Tier 2: AI)
      const recommendation = await categoryRecommendationService.recommendCategory(hierarchicalType);

      const explanation = recommendation.categoryPath
        ? `Change TYPE from "${hierarchicalType}" to "${recommendation.productType}" (Google: ${recommendation.categoryPath})` +
          (recommendation.suggestedTags.length > 0 ? `, add TAG rules: ${recommendation.suggestedTags.join(', ')}` : '')
        : `Change TYPE from "${hierarchicalType}" to "${recommendation.productType}"` +
          (recommendation.suggestedTags.length > 0 ? `, add TAG rules: ${recommendation.suggestedTags.join(', ')}` : '');

      return {
        newTypeValue: recommendation.productType,
        suggestedTags: recommendation.suggestedTags,
        explanation,
        categoryId: recommendation.categoryId,
        categoryGid: recommendation.categoryGid,
        categoryPath: recommendation.categoryPath,
        categoryName: recommendation.categoryName,
        confidence: recommendation.confidence,
        source: recommendation.source,
        reasoning: recommendation.reasoning
      };

    } catch (error) {
      console.error('Error generating recommendation:', error);

      // Fallback to simple string splitting
      const parts = hierarchicalType.split('-').map(p => p.trim()).filter(p => p.length > 0);
      const newTypeValue = parts[parts.length - 1];
      const suggestedTags = parts.slice(0, -1);

      return {
        newTypeValue,
        suggestedTags,
        explanation: `Change TYPE from "${hierarchicalType}" to "${newTypeValue}"` +
          (suggestedTags.length > 0 ? `, add TAG rules: ${suggestedTags.join(', ')}` : ''),
        categoryId: null,
        categoryGid: null,
        categoryPath: null,
        categoryName: null,
        confidence: 'none',
        source: 'fallback'
      };
    }
  }

  /**
   * Check if products in a collection have been migrated
   * Returns number of products that still have hierarchical product_type
   */
  private async checkProductMigrationStatus(collectionId: string): Promise<{
    productsMigrated: boolean;
    productsNeedingMigration: number;
  }> {
    try {
      // Get all product IDs in this collection
      const collectionProductRecords = await db
        .select({ productId: productCollections.productId })
        .from(productCollections)
        .where(eq(productCollections.collectionId, collectionId));

      if (collectionProductRecords.length === 0) {
        return { productsMigrated: true, productsNeedingMigration: 0 };
      }

      const productIds = collectionProductRecords.map(cp => cp.productId);

      // Count products with hierarchical product_type (contains hyphens)
      const productsWithHierarchicalType = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            sql`${products.productType} LIKE '%-%'`
          )
        );

      const needsMigration = productsWithHierarchicalType.length;

      return {
        productsMigrated: needsMigration === 0,
        productsNeedingMigration: needsMigration
      };
    } catch (error) {
      console.error(`Error checking product migration status for collection ${collectionId}:`, error);
      return { productsMigrated: false, productsNeedingMigration: 0 };
    }
  }

  /**
   * Fix collection rules in LOCAL DATABASE ONLY
   *
   * IMPORTANT: This does NOT update Shopify!
   * Workflow:
   * 1. Fix collection rules locally (this method)
   * 2. Test everything in dev
   * 3. Migrate product types
   * 4. THEN sync everything to Shopify (separate operation)
   */
  async fixCollectionRules(
    collectionId: string,
    newRules: CollectionRule[],
    appliedDisjunctively: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔧 Fixing collection rules (LOCAL DATABASE ONLY)`);
      console.log(`📋 Collection ID: ${collectionId}`);
      console.log(`📋 New rules:`, JSON.stringify(newRules, null, 2));
      console.log(`🔀 Applied disjunctively: ${appliedDisjunctively}`);

      // Get collection from database
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, collectionId));

      if (!collection) {
        console.error(`❌ Collection not found in database: ${collectionId}`);
        return { success: false, error: "Collection not found in database" };
      }

      console.log(`📦 Collection: ${collection.name}`);
      console.log(`📊 Current rules:`, collection.rules);

      // Update in local database ONLY
      await db
        .update(collections)
        .set({
          rules: {
            rules: newRules,
            appliedDisjunctively
          },
          updatedAt: new Date()
        })
        .where(eq(collections.id, collectionId));

      console.log(`✅ Successfully fixed collection in LOCAL database: ${collection.name}`);
      console.log(`ℹ️  Shopify will be synced later during migration`);

      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error(`❌ Error fixing collection rules:`, errorMsg);
      console.error(`❌ Stack trace:`, errorStack);
      return { success: false, error: `Database error: ${errorMsg}` };
    }
  }

  /**
   * Migrate products in a specific collection
   * Updates product_type from hierarchical to clean, adds category tags
   *
   * IMPORTANT: This does NOT update Shopify!
   * Only updates local database. Shopify sync happens later.
   */
  async migrateCollectionProducts(collectionId: string): Promise<{
    success: boolean;
    productsUpdated: number;
    error?: string;
  }> {
    try {
      console.log(`🔄 Migrating products for collection: ${collectionId}`);

      // Get collection
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, collectionId));

      if (!collection) {
        return { success: false, productsUpdated: 0, error: "Collection not found" };
      }

      console.log(`📦 Collection: ${collection.name}`);

      // Get all product IDs in this collection
      const collectionProductRecords = await db
        .select({ productId: productCollections.productId })
        .from(productCollections)
        .where(eq(productCollections.collectionId, collectionId));

      if (collectionProductRecords.length === 0) {
        console.log(`ℹ️  No products in collection`);
        return { success: true, productsUpdated: 0 };
      }

      const productIds = collectionProductRecords.map(cp => cp.productId);
      console.log(`📊 Found ${productIds.length} products in collection`);

      // Get products with hierarchical product_type (contains hyphens)
      const productsToMigrate = await db
        .select()
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            sql`${products.productType} LIKE '%-%'`
          )
        );

      console.log(`🔍 Found ${productsToMigrate.length} products needing migration`);

      if (productsToMigrate.length === 0) {
        console.log(`✅ All products already migrated`);
        return { success: true, productsUpdated: 0 };
      }

      // Migrate each product
      let updatedCount = 0;
      for (const product of productsToMigrate) {
        const hierarchicalType = product.productType;
        if (!hierarchicalType) continue;

        // Split hierarchical type
        const parts = hierarchicalType.split('-').map(p => p.trim()).filter(p => p.length > 0);

        if (parts.length === 0) continue;

        // Last part is the clean product type
        const cleanType = parts[parts.length - 1];

        // Earlier parts become tags
        const categoryTags = parts.slice(0, -1);

        // Get existing tags (stored as comma-separated string)
        const existingTags = product.tags ? product.tags.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

        // Add category tags if they don't already exist
        const newTags = [...existingTags];
        for (const tag of categoryTags) {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
          }
        }

        // Update product
        const migrationTimestamp = new Date();
        await db
          .update(products)
          .set({
            productType: cleanType,
            tags: newTags.join(', '), // Store as comma-separated string
            categoryMigratedAt: migrationTimestamp, // Mark when migration happened for visual tracking
            updatedAt: migrationTimestamp
          })
          .where(eq(products.id, product.id));

        console.log(`  ✅ ${product.styleNumber || product.title}: "${hierarchicalType}" → "${cleanType}" + tags [${categoryTags.join(', ')}]`);
        updatedCount++;
      }

      console.log(`✅ Successfully migrated ${updatedCount} products in collection: ${collection.name}`);
      console.log(`ℹ️  Shopify will be synced later during migration`);

      return { success: true, productsUpdated: updatedCount };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error(`❌ Error migrating collection products:`, errorMsg);
      console.error(`❌ Stack trace:`, errorStack);
      return { success: false, productsUpdated: 0, error: `Database error: ${errorMsg}` };
    }
  }

  /**
   * Helper: Get a single collection analysis by ID
   */
  async analyzeCollectionById(collectionId: string): Promise<AffectedCollection | null> {
    try {
      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, collectionId));

      if (!collection) {
        return null;
      }

      return await this.analyzeCollection(collection);

    } catch (error) {
      console.error(`❌ Error analyzing collection ${collectionId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const collectionsAnalyzerV2 = new CollectionsAnalyzerV2Service();
export default collectionsAnalyzerV2;
