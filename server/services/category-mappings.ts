/**
 * Category Migration Mappings
 *
 * Complete mappings for all 86 categories from the old system to Shopify's 4-part system.
 * See: /volume1/docker/planning/05-shopsyncflow/CATEGORIES-VS-TAGS/FULL-MIGRATION-MAPPING.md
 */

export interface CategoryMapping {
  productType: string;
  tags: string[];
  shopifyTaxonomy: {
    id: string;
    path: string;
  };
  notes?: string;
}

export const CATEGORY_MAPPINGS: Record<string, CategoryMapping> = {
  "Gift Cards": {
    productType: "Gift Card",
    tags: ["Gift Card"],
    shopifyTaxonomy: {
      id: "aa-1-5-5-1",
      path: "Arts & Entertainment > Party & Celebration > Gift Giving > Gift Cards & Certificates"
    },
    notes: "Perfect pilot test candidate"
  },
  "Insurance": {
    productType: "Insurance",
    tags: ["Insurance", "Protection"],
    shopifyTaxonomy: {
      id: "bb-1-10-2-5",
      path: "Business & Industrial > Retail > Retail Supplies > Retail Insurance Products"
    }
  },
  "Men-Tops-Hoodies & Sweatshirts-Mystery Box": {
    productType: "Mystery Box",
    tags: ["Men", "Tops", "Hoodies", "Sweatshirts", "Mystery Box", "Bundle"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-5",
      path: "Apparel & Accessories > Clothing > Shirts & Tops > Hoodies"
    }
  },
  "Men-Tops-Outerwear-Jackets-Leather": {
    productType: "Leather Jackets",
    tags: ["Men", "Tops", "Outerwear", "Jackets", "Leather"],
    shopifyTaxonomy: {
      id: "aa-1-1-6-1",
      path: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"
    }
  },
  "Men-Tops-TrackPants-Mystery Box": {
    productType: "Mystery Box",
    tags: ["Men", "Bottoms", "Track Pants", "Mystery Box", "Bundle"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-3-1",
      path: "Apparel & Accessories > Clothing > Activewear > Activewear Pants"
    },
    notes: "Category name says 'Tops' but TrackPants are bottoms - fixing hierarchy"
  },
  "Men-Tops-Tshirts-Mystery Box": {
    productType: "Mystery Box",
    tags: ["Men", "Tops", "T-Shirts", "Mystery Box", "Bundle"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-8",
      path: "Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts"
    }
  },
  "Men-Underwear-Leggings": {
    productType: "Leggings",
    tags: ["Men", "Underwear", "Leggings", "Base Layer"],
    shopifyTaxonomy: {
      id: "aa-1-1-13-1",
      path: "Apparel & Accessories > Clothing > Underwear & Socks > Underwear"
    }
  },
  "Sample": {
    productType: "Sample",
    tags: ["Sample", "Test Product"],
    shopifyTaxonomy: {
      id: "",
      path: ""
    },
    notes: "Test product - minimal taxonomy"
  },
  "T-Shirt": {
    productType: "T-Shirts",
    tags: ["T-Shirts", "Tops"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-8",
      path: "Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts"
    },
    notes: "Missing gender - add based on product details"
  },
  "UpCart - Shipping Protection": {
    productType: "Shipping Protection",
    tags: ["UpCart", "Shipping Protection", "Insurance"],
    shopifyTaxonomy: {
      id: "bb-1-10-2-6",
      path: "Business & Industrial > Retail > Retail Supplies > Shipping Protection"
    },
    notes: "Add-on product managed by UpCart app"
  }
  // NOTE: Add more mappings here as you migrate additional categories
  // See: /volume1/docker/planning/05-shopsyncflow/CATEGORIES-VS-TAGS/FULL-MIGRATION-MAPPING.md
};
