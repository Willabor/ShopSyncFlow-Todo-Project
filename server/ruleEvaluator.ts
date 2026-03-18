/**
 * Rule Evaluation Engine
 *
 * Provides a simple rule evaluation system to preview which products
 * match collection rules. This is for PREVIEW ONLY - actual product
 * associations come from Shopify's calculations.
 */

import type { ProductWithVariants } from "@shared/schema";

export interface Rule {
  column: string;
  relation: string;
  condition: string;
}

export interface RuleSet {
  rules: Rule[];
  appliedDisjunctively: boolean; // false = AND, true = OR
}

/**
 * Evaluate a single rule against a product (with variants)
 */
export function evaluateRule(product: ProductWithVariants, rule: Rule): boolean {
  const { column, relation, condition } = rule;

  // Get the product field value based on column
  let productValue: any;

  switch (column) {
    case "TAG":
      // Tags are stored as comma-separated string
      productValue = product.tags
        ? product.tags.split(',').map(t => t.trim())
        : [];
      break;

    case "TITLE":
      productValue = product.title || "";
      break;

    case "TYPE":
      productValue = product.productType || "";
      break;

    case "VENDOR":
      productValue = product.vendor || "";
      break;

    case "VARIANT_TITLE":
      // Check if ANY variant title matches
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(variant =>
          evaluateCondition(variant.title || "", relation, condition)
        );
      }
      return false;

    case "VARIANT_PRICE":
      // Check if ANY variant price matches
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(variant =>
          evaluateCondition(parseFloat(variant.price || "0"), relation, condition)
        );
      }
      return false;

    case "VARIANT_COMPARE_AT_PRICE":
      // Check if ANY variant compareAtPrice matches
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(variant =>
          evaluateCondition(parseFloat(variant.compareAtPrice || "0"), relation, condition)
        );
      }
      return false;

    case "VARIANT_WEIGHT":
      // Check if ANY variant weight matches
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(variant =>
          evaluateCondition(parseFloat(variant.weight || "0"), relation, condition)
        );
      }
      return false;

    case "VARIANT_INVENTORY":
      // Check if ANY variant inventory matches
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(variant =>
          evaluateCondition(variant.inventoryQuantity || 0, relation, condition)
        );
      }
      return false;

    case "IS_PRICE_REDUCED":
      // Check if ANY variant has price reduced (compareAtPrice > price)
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(variant => {
          const price = parseFloat(variant.price || "0");
          const compareAt = parseFloat(variant.compareAtPrice || "0");
          return compareAt > 0 && price < compareAt;
        });
      }
      return false;

    case "PRODUCT_METAFIELD_DEFINITION":
      // Check product metadata field
      productValue = product.metadata || "";
      break;

    default:
      console.warn(`Unknown column type: ${column}`);
      return false;
  }

  // Evaluate based on relation (for product-level fields only)
  return evaluateCondition(productValue, relation, condition);
}

/**
 * Evaluate a condition based on relation type
 */
function evaluateCondition(productValue: any, relation: string, condition: string): boolean {
  switch (relation) {
    case "EQUALS":
      return evaluateEquals(productValue, condition);

    case "NOT_EQUALS":
      return !evaluateEquals(productValue, condition);

    case "CONTAINS":
      return evaluateContains(productValue, condition);

    case "NOT_CONTAINS":
      return !evaluateContains(productValue, condition);

    case "STARTS_WITH":
      return String(productValue).toLowerCase().startsWith(condition.toLowerCase());

    case "ENDS_WITH":
      return String(productValue).toLowerCase().endsWith(condition.toLowerCase());

    case "GREATER_THAN":
      return evaluateGreaterThan(productValue, condition);

    case "LESS_THAN":
      return evaluateLessThan(productValue, condition);

    case "IS_SET":
      return evaluateIsSet(productValue);

    case "IS_NOT_SET":
      return !evaluateIsSet(productValue);

    default:
      console.warn(`Unknown relation type: ${relation}`);
      return false;
  }
}

/**
 * EQUALS evaluation
 */
function evaluateEquals(productValue: any, condition: string): boolean {
  // Handle arrays (like tags)
  if (Array.isArray(productValue)) {
    return productValue.some(v =>
      String(v).toLowerCase() === condition.toLowerCase()
    );
  }

  // Handle booleans
  if (typeof productValue === 'boolean') {
    return productValue === (condition.toLowerCase() === 'true');
  }

  // Handle numbers
  if (typeof productValue === 'number') {
    return productValue === parseFloat(condition);
  }

  // Handle strings
  return String(productValue).toLowerCase() === condition.toLowerCase();
}

/**
 * CONTAINS evaluation
 */
function evaluateContains(productValue: any, condition: string): boolean {
  // Handle arrays (like tags)
  if (Array.isArray(productValue)) {
    return productValue.some(v =>
      String(v).toLowerCase().includes(condition.toLowerCase())
    );
  }

  // Handle strings
  return String(productValue).toLowerCase().includes(condition.toLowerCase());
}

/**
 * GREATER_THAN evaluation
 */
function evaluateGreaterThan(productValue: any, condition: string): boolean {
  const numValue = typeof productValue === 'number'
    ? productValue
    : parseFloat(String(productValue));
  const numCondition = parseFloat(condition);

  return !isNaN(numValue) && !isNaN(numCondition) && numValue > numCondition;
}

/**
 * LESS_THAN evaluation
 */
function evaluateLessThan(productValue: any, condition: string): boolean {
  const numValue = typeof productValue === 'number'
    ? productValue
    : parseFloat(String(productValue));
  const numCondition = parseFloat(condition);

  return !isNaN(numValue) && !isNaN(numCondition) && numValue < numCondition;
}

/**
 * IS_SET evaluation (checks if value exists and is not empty)
 */
function evaluateIsSet(productValue: any): boolean {
  if (productValue === null || productValue === undefined) {
    return false;
  }

  if (Array.isArray(productValue)) {
    return productValue.length > 0;
  }

  if (typeof productValue === 'string') {
    return productValue.trim().length > 0;
  }

  if (typeof productValue === 'number') {
    return productValue !== 0;
  }

  if (typeof productValue === 'boolean') {
    return productValue === true;
  }

  return true;
}

/**
 * Evaluate all rules in a ruleset against a product
 */
export function evaluateRuleSet(product: ProductWithVariants, ruleSet: RuleSet): boolean {
  if (!ruleSet.rules || ruleSet.rules.length === 0) {
    return false; // No rules = manual collection
  }

  if (ruleSet.appliedDisjunctively) {
    // OR logic - product must match ANY rule
    return ruleSet.rules.some(rule => evaluateRule(product, rule));
  } else {
    // AND logic - product must match ALL rules
    return ruleSet.rules.every(rule => evaluateRule(product, rule));
  }
}

/**
 * Preview products that match a ruleset
 */
export function previewProductsForRuleSet(
  products: ProductWithVariants[],
  ruleSet: RuleSet
): { matchingProducts: ProductWithVariants[]; totalCount: number } {
  if (!ruleSet.rules || ruleSet.rules.length === 0) {
    return { matchingProducts: [], totalCount: 0 };
  }

  const matchingProducts = products.filter(product =>
    evaluateRuleSet(product, ruleSet)
  );

  return {
    matchingProducts: matchingProducts.slice(0, 10), // Return first 10 for preview
    totalCount: matchingProducts.length,
  };
}
