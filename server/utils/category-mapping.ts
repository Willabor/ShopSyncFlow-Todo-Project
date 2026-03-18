/**
 * Google Shopping Category to Product Type Mapping
 *
 * Maps Google Shopping taxonomy categories to simplified Product Types
 * for size chart lookup. Items without a mapping fall back to "Accessories"
 * which skips size chart lookup entirely.
 *
 * Product Types with size charts:
 * - Headwear-Adjustable: Snapback, Trucker, Dad Hats (adjustable closure)
 * - Headwear-Fitted: Fitted caps (head circumference sizing)
 * - Headwear-Beanies: Beanies, knit caps (stretch/one-size)
 * - Tops: T-shirts, Hoodies, Polos, Sweaters
 * - Tops-Dress: Dress shirts (neck/sleeve sizing)
 * - Bottoms: Pants, Jeans, Shorts, Joggers
 * - Outerwear: Jackets, Coats, Vests
 * - Footwear: Shoes, Sneakers, Boots
 * - Belts: Belts (waist measurement)
 * - Gloves: Gloves (hand size)
 * - Rings: Rings (ring size)
 * - Accessories: No size chart needed (wallet chains, keychains, pins, etc.)
 */

// Product types that have size charts
export const SIZED_PRODUCT_TYPES = [
  'Headwear-Adjustable',
  'Headwear-Fitted',
  'Headwear-Beanies',
  'Tops',
  'Tops-Dress',
  'Bottoms',
  'Outerwear',
  'Footwear',
  'Belts',
  'Gloves',
  'Rings',
] as const;

export type SizedProductType = typeof SIZED_PRODUCT_TYPES[number];
export type ProductType = SizedProductType | 'Accessories';

/**
 * Mapping from Google Shopping category names to Product Types
 *
 * This covers common Level 3-4 Google Shopping categories.
 * Categories not in this map will fallback to "Accessories".
 */
export const googleCategoryToProductType: Record<string, ProductType> = {
  // ═══════════════════════════════════════════════════════════════
  // HEADWEAR - Adjustable (snapback, trucker, dad hats)
  // ═══════════════════════════════════════════════════════════════
  'Snapback Caps': 'Headwear-Adjustable',
  'Baseball Caps': 'Headwear-Adjustable',
  'Baseball & Softball Caps': 'Headwear-Adjustable',
  'Trucker Hats': 'Headwear-Adjustable',
  'Trucker Caps': 'Headwear-Adjustable',
  'Dad Hats': 'Headwear-Adjustable',
  'Bucket Hats': 'Headwear-Adjustable',
  'Sun Hats': 'Headwear-Adjustable',
  'Visors': 'Headwear-Adjustable',
  'Golf Hats': 'Headwear-Adjustable',
  'Caps': 'Headwear-Adjustable',
  'Hats': 'Headwear-Adjustable',

  // ═══════════════════════════════════════════════════════════════
  // HEADWEAR - Fitted (sized by head circumference)
  // ═══════════════════════════════════════════════════════════════
  'Fitted Hats': 'Headwear-Fitted',
  'Fitted Caps': 'Headwear-Fitted',

  // ═══════════════════════════════════════════════════════════════
  // HEADWEAR - Beanies (stretch/one-size)
  // ═══════════════════════════════════════════════════════════════
  'Beanies': 'Headwear-Beanies',
  'Beanie Hats': 'Headwear-Beanies',
  'Knit Caps': 'Headwear-Beanies',
  'Winter Hats': 'Headwear-Beanies',
  'Skull Caps': 'Headwear-Beanies',

  // ═══════════════════════════════════════════════════════════════
  // TOPS - Regular (S/M/L/XL sizing)
  // ═══════════════════════════════════════════════════════════════
  'T-Shirts': 'Tops',
  'Tees': 'Tops',
  'Polo Shirts': 'Tops',
  'Polos': 'Tops',
  'Tank Tops': 'Tops',
  'Sleeveless Shirts': 'Tops',
  'Long Sleeve T-Shirts': 'Tops',
  'Hoodies': 'Tops',
  'Hoodies & Sweatshirts': 'Tops',
  'Sweatshirts': 'Tops',
  'Pullovers': 'Tops',
  'Sweaters': 'Tops',
  'Cardigans': 'Tops',
  'Jerseys': 'Tops',
  'Sports Jerseys': 'Tops',
  'Henley Shirts': 'Tops',
  'Rugby Shirts': 'Tops',
  'Crop Tops': 'Tops',
  'Tunics': 'Tops',
  'Blouses': 'Tops',
  'Shirts': 'Tops',
  'Tops': 'Tops',

  // ═══════════════════════════════════════════════════════════════
  // TOPS - Dress (neck/sleeve sizing)
  // ═══════════════════════════════════════════════════════════════
  'Dress Shirts': 'Tops-Dress',
  'Button-Down Shirts': 'Tops-Dress',
  'Button-Up Shirts': 'Tops-Dress',
  'Oxford Shirts': 'Tops-Dress',
  'Formal Shirts': 'Tops-Dress',

  // ═══════════════════════════════════════════════════════════════
  // BOTTOMS (waist/inseam sizing)
  // ═══════════════════════════════════════════════════════════════
  'Pants': 'Bottoms',
  'Trousers': 'Bottoms',
  'Jeans': 'Bottoms',
  'Denim': 'Bottoms',
  'Shorts': 'Bottoms',
  'Cargo Shorts': 'Bottoms',
  'Cargo Pants': 'Bottoms',
  'Chinos': 'Bottoms',
  'Khakis': 'Bottoms',
  'Joggers': 'Bottoms',
  'Sweatpants': 'Bottoms',
  'Track Pants': 'Bottoms',
  'Leggings': 'Bottoms',
  'Capris': 'Bottoms',
  'Culottes': 'Bottoms',
  'Overalls': 'Bottoms',
  'Skirts': 'Bottoms',
  'Skorts': 'Bottoms',

  // ═══════════════════════════════════════════════════════════════
  // OUTERWEAR
  // ═══════════════════════════════════════════════════════════════
  'Jackets': 'Outerwear',
  'Coats': 'Outerwear',
  'Blazers': 'Outerwear',
  'Vests': 'Outerwear',
  'Parkas': 'Outerwear',
  'Windbreakers': 'Outerwear',
  'Bomber Jackets': 'Outerwear',
  'Denim Jackets': 'Outerwear',
  'Leather Jackets': 'Outerwear',
  'Rain Jackets': 'Outerwear',
  'Puffer Jackets': 'Outerwear',
  'Down Jackets': 'Outerwear',
  'Fleece Jackets': 'Outerwear',
  'Track Jackets': 'Outerwear',
  'Varsity Jackets': 'Outerwear',
  'Outerwear': 'Outerwear',

  // ═══════════════════════════════════════════════════════════════
  // FOOTWEAR
  // ═══════════════════════════════════════════════════════════════
  'Shoes': 'Footwear',
  'Sneakers': 'Footwear',
  'Athletic Shoes': 'Footwear',
  'Running Shoes': 'Footwear',
  'Basketball Shoes': 'Footwear',
  'Boots': 'Footwear',
  'Sandals': 'Footwear',
  'Flip Flops': 'Footwear',
  'Slippers': 'Footwear',
  'Loafers': 'Footwear',
  'Dress Shoes': 'Footwear',
  'Oxfords': 'Footwear',
  'Heels': 'Footwear',
  'Flats': 'Footwear',
  'Footwear': 'Footwear',

  // ═══════════════════════════════════════════════════════════════
  // BELTS
  // ═══════════════════════════════════════════════════════════════
  'Belts': 'Belts',
  'Leather Belts': 'Belts',
  'Canvas Belts': 'Belts',
  'Dress Belts': 'Belts',
  'Casual Belts': 'Belts',

  // ═══════════════════════════════════════════════════════════════
  // GLOVES
  // ═══════════════════════════════════════════════════════════════
  'Gloves': 'Gloves',
  'Winter Gloves': 'Gloves',
  'Leather Gloves': 'Gloves',
  'Driving Gloves': 'Gloves',
  'Work Gloves': 'Gloves',
  'Mittens': 'Gloves',

  // ═══════════════════════════════════════════════════════════════
  // RINGS (ring size)
  // ═══════════════════════════════════════════════════════════════
  'Rings': 'Rings',
  'Wedding Rings': 'Rings',
  'Engagement Rings': 'Rings',
  'Fashion Rings': 'Rings',

  // ═══════════════════════════════════════════════════════════════
  // ACCESSORIES - No size chart needed (fallback for unlisted items)
  // These are explicitly mapped to show intent, though unmapped items
  // also fall back to Accessories
  // ═══════════════════════════════════════════════════════════════
  'Wallet Chains': 'Accessories',
  'Keychains': 'Accessories',
  'Pins': 'Accessories',
  'Patches': 'Accessories',
  'Bags': 'Accessories',
  'Backpacks': 'Accessories',
  'Tote Bags': 'Accessories',
  'Duffle Bags': 'Accessories',
  'Messenger Bags': 'Accessories',
  'Wallets': 'Accessories',
  'Sunglasses': 'Accessories',
  'Watches': 'Accessories',
  'Necklaces': 'Accessories',
  'Bracelets': 'Accessories',
  'Earrings': 'Accessories',
  'Scarves': 'Accessories',
  'Ties': 'Accessories',
  'Bow Ties': 'Accessories',
  'Pocket Squares': 'Accessories',
  'Suspenders': 'Accessories',
  'Hair Accessories': 'Accessories',
  'Phone Cases': 'Accessories',
  'Socks': 'Accessories', // Often one-size or simple S/M/L
};

/**
 * Get the Product Type for a given Google Shopping category name
 *
 * @param googleCategoryName - The Google Shopping category name (e.g., "Snapback Caps")
 * @returns The Product Type for size chart lookup, or "Accessories" if no mapping exists
 *
 * @example
 * getProductTypeFromGoogleCategory("Snapback Caps") // "Headwear-Adjustable"
 * getProductTypeFromGoogleCategory("Wallet Chains") // "Accessories"
 * getProductTypeFromGoogleCategory("Unknown Item") // "Accessories" (fallback)
 */
export function getProductTypeFromGoogleCategory(googleCategoryName: string | null | undefined): ProductType {
  if (!googleCategoryName) {
    return 'Accessories';
  }

  // Try exact match first
  if (googleCategoryToProductType[googleCategoryName]) {
    return googleCategoryToProductType[googleCategoryName];
  }

  // Try case-insensitive match
  const lowerName = googleCategoryName.toLowerCase();
  for (const [category, productType] of Object.entries(googleCategoryToProductType)) {
    if (category.toLowerCase() === lowerName) {
      return productType;
    }
  }

  // Try partial match (for variations like "Men's T-Shirts" matching "T-Shirts")
  for (const [category, productType] of Object.entries(googleCategoryToProductType)) {
    if (lowerName.includes(category.toLowerCase()) || category.toLowerCase().includes(lowerName)) {
      return productType;
    }
  }

  // Fallback to Accessories (no size chart needed)
  return 'Accessories';
}

/**
 * Check if a Product Type has size charts
 *
 * @param productType - The Product Type to check
 * @returns true if size charts exist for this type, false for Accessories
 */
export function productTypeHasSizeChart(productType: ProductType): boolean {
  return productType !== 'Accessories';
}

/**
 * Get size chart category key for database lookup
 *
 * Maps Product Type to the key format used in size chart parsedTables.
 * This handles the transition from old keys (Headwear-Baseball-Snapback)
 * to new standardized keys.
 *
 * @param productType - The Product Type
 * @returns Array of possible keys to try for size chart lookup
 */
export function getSizeChartLookupKeys(productType: ProductType): string[] {
  const keyMappings: Record<ProductType, string[]> = {
    'Headwear-Adjustable': ['Headwear-Adjustable', 'Headwear-Baseball-Snapback', 'Headwear', 'Snapback', 'Baseball', 'Caps'],
    'Headwear-Fitted': ['Headwear-Fitted', 'Fitted', 'Headwear'],
    'Headwear-Beanies': ['Headwear-Beanies', 'Beanies', 'Headwear'],
    'Tops': ['Tops', 'T-Shirts', 'Shirts'],
    'Tops-Dress': ['Tops-Dress', 'Dress Shirts', 'Tops'],
    'Bottoms': ['Bottoms', 'Pants', 'Jeans'],
    'Outerwear': ['Outerwear', 'Jackets', 'Tops'],
    'Footwear': ['Footwear', 'Shoes'],
    'Belts': ['Belts'],
    'Gloves': ['Gloves'],
    'Rings': ['Rings'],
    'Accessories': [], // No size chart lookup for accessories
  };

  return keyMappings[productType] || [];
}

/**
 * Log category mapping for debugging
 */
export function logCategoryMapping(googleCategoryName: string | null | undefined): void {
  const productType = getProductTypeFromGoogleCategory(googleCategoryName);
  const hasSizeChartFlag = productTypeHasSizeChart(productType);
  const lookupKeys = getSizeChartLookupKeys(productType);

  console.log(`📦 Category Mapping:`);
  console.log(`   Google Category: "${googleCategoryName || 'none'}"`);
  console.log(`   Product Type: "${productType}"`);
  console.log(`   Has Size Chart: ${hasSizeChartFlag}`);
  if (hasSizeChartFlag) {
    console.log(`   Lookup Keys: [${lookupKeys.join(', ')}]`);
  }
}
