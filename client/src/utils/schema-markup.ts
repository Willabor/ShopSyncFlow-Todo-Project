/**
 * Schema.org Markup Generator
 *
 * Generates JSON-LD structured data for product pages.
 * This markup helps Google understand product information and enables rich results in search.
 */

import type { ParsedProduct } from './csv-parser';

export interface SchemaMarkupParams {
  product: ParsedProduct;
  title?: string;
  description?: string;
  imageUrls?: string[];
  url?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
}

/**
 * Generate Schema.org Product markup in JSON-LD format
 */
export function generateProductSchema(params: SchemaMarkupParams): string {
  const {
    product,
    title,
    description,
    imageUrls = [],
    url,
    availability = 'InStock'
  } = params;

  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": title || `${product.vendor} ${product.productName} - ${product.color}`,
    "description": description || product.description,
    "image": imageUrls.length > 0 ? imageUrls : undefined,
    "sku": product.skus[0] || product.styleNumber, // First SKU or style number
    "mpn": product.styleNumber, // Manufacturer Part Number (Style Number)
    "brand": {
      "@type": "Brand",
      "name": product.vendor
    },
    "offers": {
      "@type": "Offer",
      "url": url,
      "priceCurrency": "USD",
      "price": product.msrp.toFixed(2),
      "priceValidUntil": getOneYearFromNow(),
      "availability": `https://schema.org/${availability}`,
      "itemCondition": "https://schema.org/NewCondition"
    }
  };

  // Remove undefined fields
  const cleanedSchema = removeUndefinedFields(schema);

  return JSON.stringify(cleanedSchema, null, 2);
}

/**
 * Generate Schema.org markup for multiple product variants
 */
export function generateProductWithVariants(params: SchemaMarkupParams): string {
  const {
    product,
    title,
    description,
    imageUrls = [],
    url,
    availability = 'InStock'
  } = params;

  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": title || `${product.vendor} ${product.productName}`,
    "description": description || product.description,
    "image": imageUrls.length > 0 ? imageUrls : undefined,
    "mpn": product.styleNumber,
    "brand": {
      "@type": "Brand",
      "name": product.vendor
    },
    "offers": {
      "@type": "AggregateOffer",
      "url": url,
      "priceCurrency": "USD",
      "lowPrice": product.msrp.toFixed(2),
      "highPrice": product.msrp.toFixed(2),
      "priceValidUntil": getOneYearFromNow(),
      "availability": `https://schema.org/${availability}`,
      "itemCondition": "https://schema.org/NewCondition",
      "offers": product.skus.map((sku, idx) => ({
        "@type": "Offer",
        "sku": sku,
        "name": `${product.productName} - ${product.color} - ${product.sizes[idx]}`,
        "priceCurrency": "USD",
        "price": product.msrp.toFixed(2),
        "availability": `https://schema.org/${availability}`,
        "url": url ? `${url}?variant=${sku}` : undefined
      }))
    }
  };

  // Remove undefined fields
  const cleanedSchema = removeUndefinedFields(schema);

  return JSON.stringify(cleanedSchema, null, 2);
}

/**
 * Get date one year from now (for priceValidUntil)
 */
function getOneYearFromNow(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
}

/**
 * Remove undefined fields from object recursively
 */
function removeUndefinedFields(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedFields(item));
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = removeUndefinedFields(value);
      }
      return acc;
    }, {} as any);
  }

  return obj;
}

/**
 * Get HTML script tag for embedding in Shopify theme
 */
export function getSchemaScriptTag(schemaJson: string): string {
  return `<script type="application/ld+json">
${schemaJson}
</script>`;
}

/**
 * Validate Schema.org markup using Google's testing tool URL
 */
export function getGoogleTestingUrl(schemaJson: string): string {
  const encodedSchema = encodeURIComponent(schemaJson);
  return `https://search.google.com/test/rich-results?code=${encodedSchema}`;
}

/**
 * Example usage and documentation
 */
export const SCHEMA_USAGE_EXAMPLE = `
// Generate basic product schema
const schema = generateProductSchema({
  product: parsedProduct,
  title: generatedTitle,
  description: generatedDescription,
  imageUrls: ['https://example.com/product.jpg'],
  url: 'https://nexusclothing.com/products/eptm-freeway-pants-black',
  availability: 'InStock'
});

// Generate schema with variants
const variantSchema = generateProductWithVariants({
  product: parsedProduct,
  title: generatedTitle,
  description: generatedDescription,
  imageUrls: ['https://example.com/product.jpg'],
  url: 'https://nexusclothing.com/products/eptm-freeway-pants-black'
});

// Get script tag for Shopify
const scriptTag = getSchemaScriptTag(schema);

// Test with Google Rich Results
const testUrl = getGoogleTestingUrl(schema);
`;

/**
 * Shopify integration instructions
 */
export const SHOPIFY_INTEGRATION_INSTRUCTIONS = `
# How to Add Schema Markup to Shopify

1. Navigate to: Online Store > Themes > Actions > Edit Code

2. Open: Sections > product-template.liquid (or your product template file)

3. Add this code BEFORE the closing </div> tag at the bottom:

{{ SCHEMA_SCRIPT_TAG_HERE }}

4. Replace {{ SCHEMA_SCRIPT_TAG_HERE }} with the actual schema JSON wrapped in <script> tags

5. Save and test using Google's Rich Results Test:
   https://search.google.com/test/rich-results

## Example:

<div class="product-single">
  ... existing product code ...

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": "EPTM Men's Freeway Pants - Baggy Fit - Black",
    "mpn": "EP12429",
    "brand": {
      "@type": "Brand",
      "name": "EPTM"
    },
    "offers": {
      "@type": "Offer",
      "price": "85.00",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    }
  }
  </script>
</div>

## Benefits:
- Rich snippets in Google search results
- Price, availability, ratings displayed
- Better click-through rates (CTR)
- Required for Google Shopping
`;
