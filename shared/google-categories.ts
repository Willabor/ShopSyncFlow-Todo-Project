/**
 * Google Shopping Product Taxonomy for Apparel & Accessories
 *
 * Based on Google's official product taxonomy
 * https://support.google.com/merchants/answer/6324436
 */

export interface GoogleCategory {
  id: string;
  name: string;
  fullPath: string;
  gender: 'Men' | 'Women' | 'Unisex' | 'Kids' | 'Baby';
  type: 'Tops' | 'Bottoms' | 'Outerwear' | 'Activewear' | 'Underwear' | 'Swimwear' | 'Suits' | 'Accessories' | 'Shoes' | 'Other';
}

export const GOOGLE_APPAREL_CATEGORIES: GoogleCategory[] = [
  // ===== MEN'S CLOTHING =====

  // Men's Tops
  {
    id: '212',
    name: 'T-Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '207',
    name: 'Dress Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Dress Shirts',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '2306',
    name: 'Polo Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Polos',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '5598',
    name: 'Casual Button-Down Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Casual Button-Down Shirts',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '5441',
    name: 'Henley Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Henley Shirts',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '5513',
    name: 'Tank Tops',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Tank Tops',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '5441',
    name: 'Sweatshirts & Hoodies',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Sweatshirts & Hoodies',
    gender: 'Men',
    type: 'Tops'
  },
  {
    id: '5513',
    name: 'Sweaters',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Sweaters',
    gender: 'Men',
    type: 'Tops'
  },

  // Men's Bottoms
  {
    id: '1604',
    name: 'Jeans',
    fullPath: 'Apparel & Accessories > Clothing > Pants > Jeans',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '208',
    name: 'Casual Pants',
    fullPath: 'Apparel & Accessories > Clothing > Pants',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '5513',
    name: 'Cargo Pants',
    fullPath: 'Apparel & Accessories > Clothing > Pants > Cargo Pants',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '5598',
    name: 'Chinos',
    fullPath: 'Apparel & Accessories > Clothing > Pants > Chinos',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '207',
    name: 'Dress Pants',
    fullPath: 'Apparel & Accessories > Clothing > Pants > Dress Pants',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '211',
    name: 'Shorts',
    fullPath: 'Apparel & Accessories > Clothing > Shorts',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '5598',
    name: 'Athletic Shorts',
    fullPath: 'Apparel & Accessories > Clothing > Shorts > Athletic Shorts',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '5598',
    name: 'Cargo Shorts',
    fullPath: 'Apparel & Accessories > Clothing > Shorts > Cargo Shorts',
    gender: 'Men',
    type: 'Bottoms'
  },
  {
    id: '5598',
    name: 'Sweatpants & Joggers',
    fullPath: 'Apparel & Accessories > Clothing > Activewear > Sweatpants & Joggers',
    gender: 'Men',
    type: 'Bottoms'
  },

  // Men's Outerwear
  {
    id: '203',
    name: 'Jackets & Coats',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Bomber Jackets',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Bomber Jackets',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Denim Jackets',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Denim Jackets',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Leather Jackets',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Leather Jackets',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Puffer Jackets',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Puffer Jackets',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Raincoats',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Raincoats',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Windbreakers',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Windbreakers',
    gender: 'Men',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Vests',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Vests',
    gender: 'Men',
    type: 'Outerwear'
  },

  // Men's Activewear
  {
    id: '1011',
    name: 'Activewear',
    fullPath: 'Apparel & Accessories > Clothing > Activewear',
    gender: 'Men',
    type: 'Activewear'
  },
  {
    id: '5598',
    name: 'Athletic Pants & Tights',
    fullPath: 'Apparel & Accessories > Clothing > Activewear > Pants & Tights',
    gender: 'Men',
    type: 'Activewear'
  },
  {
    id: '5598',
    name: 'Athletic Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Activewear > Shirts',
    gender: 'Men',
    type: 'Activewear'
  },
  {
    id: '5598',
    name: 'Track Suits',
    fullPath: 'Apparel & Accessories > Clothing > Activewear > Track Suits',
    gender: 'Men',
    type: 'Activewear'
  },

  // Men's Suits & Formalwear
  {
    id: '1581',
    name: 'Suits',
    fullPath: 'Apparel & Accessories > Clothing > Suits',
    gender: 'Men',
    type: 'Suits'
  },
  {
    id: '5598',
    name: 'Suit Jackets & Blazers',
    fullPath: 'Apparel & Accessories > Clothing > Suits > Suit Jackets & Blazers',
    gender: 'Men',
    type: 'Suits'
  },
  {
    id: '5598',
    name: 'Tuxedos',
    fullPath: 'Apparel & Accessories > Clothing > Suits > Tuxedos',
    gender: 'Men',
    type: 'Suits'
  },

  // Men's Underwear & Socks
  {
    id: '213',
    name: 'Underwear',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks',
    gender: 'Men',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Boxer Briefs',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Boxer Briefs',
    gender: 'Men',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Boxers',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Boxers',
    gender: 'Men',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Briefs',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Briefs',
    gender: 'Men',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Socks',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Socks',
    gender: 'Men',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Athletic Socks',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Socks > Athletic Socks',
    gender: 'Men',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Dress Socks',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Socks > Dress Socks',
    gender: 'Men',
    type: 'Underwear'
  },

  // Men's Swimwear
  {
    id: '1144',
    name: 'Swimwear',
    fullPath: 'Apparel & Accessories > Clothing > Swimwear',
    gender: 'Men',
    type: 'Swimwear'
  },
  {
    id: '5598',
    name: 'Swim Trunks',
    fullPath: 'Apparel & Accessories > Clothing > Swimwear > Swim Trunks',
    gender: 'Men',
    type: 'Swimwear'
  },

  // ===== WOMEN'S CLOTHING =====

  // Women's Tops
  {
    id: '212',
    name: 'T-Shirts',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts',
    gender: 'Women',
    type: 'Tops'
  },
  {
    id: '2271',
    name: 'Blouses',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Blouses',
    gender: 'Women',
    type: 'Tops'
  },
  {
    id: '5513',
    name: 'Tank Tops & Camisoles',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Tank Tops & Camisoles',
    gender: 'Women',
    type: 'Tops'
  },
  {
    id: '5441',
    name: 'Sweatshirts & Hoodies',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Sweatshirts & Hoodies',
    gender: 'Women',
    type: 'Tops'
  },
  {
    id: '5513',
    name: 'Sweaters & Cardigans',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Sweaters & Cardigans',
    gender: 'Women',
    type: 'Tops'
  },
  {
    id: '5598',
    name: 'Crop Tops',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Crop Tops',
    gender: 'Women',
    type: 'Tops'
  },
  {
    id: '5598',
    name: 'Tunics',
    fullPath: 'Apparel & Accessories > Clothing > Shirts & Tops > Tunics',
    gender: 'Women',
    type: 'Tops'
  },

  // Women's Bottoms
  {
    id: '1604',
    name: 'Jeans',
    fullPath: 'Apparel & Accessories > Clothing > Pants > Jeans',
    gender: 'Women',
    type: 'Bottoms'
  },
  {
    id: '208',
    name: 'Pants',
    fullPath: 'Apparel & Accessories > Clothing > Pants',
    gender: 'Women',
    type: 'Bottoms'
  },
  {
    id: '5598',
    name: 'Leggings',
    fullPath: 'Apparel & Accessories > Clothing > Pants > Leggings',
    gender: 'Women',
    type: 'Bottoms'
  },
  {
    id: '2580',
    name: 'Skirts',
    fullPath: 'Apparel & Accessories > Clothing > Skirts',
    gender: 'Women',
    type: 'Bottoms'
  },
  {
    id: '211',
    name: 'Shorts',
    fullPath: 'Apparel & Accessories > Clothing > Shorts',
    gender: 'Women',
    type: 'Bottoms'
  },

  // Women's Dresses
  {
    id: '2271',
    name: 'Dresses',
    fullPath: 'Apparel & Accessories > Clothing > Dresses',
    gender: 'Women',
    type: 'Other'
  },
  {
    id: '5598',
    name: 'Casual Dresses',
    fullPath: 'Apparel & Accessories > Clothing > Dresses > Casual Dresses',
    gender: 'Women',
    type: 'Other'
  },
  {
    id: '5598',
    name: 'Cocktail Dresses',
    fullPath: 'Apparel & Accessories > Clothing > Dresses > Cocktail Dresses',
    gender: 'Women',
    type: 'Other'
  },
  {
    id: '5598',
    name: 'Maxi Dresses',
    fullPath: 'Apparel & Accessories > Clothing > Dresses > Maxi Dresses',
    gender: 'Women',
    type: 'Other'
  },
  {
    id: '5598',
    name: 'Evening Gowns',
    fullPath: 'Apparel & Accessories > Clothing > Dresses > Evening Gowns',
    gender: 'Women',
    type: 'Other'
  },

  // Women's Outerwear
  {
    id: '203',
    name: 'Jackets & Coats',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets',
    gender: 'Women',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Blazers',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Blazers',
    gender: 'Women',
    type: 'Outerwear'
  },
  {
    id: '5598',
    name: 'Cardigans',
    fullPath: 'Apparel & Accessories > Clothing > Outerwear > Cardigans',
    gender: 'Women',
    type: 'Outerwear'
  },

  // Women's Activewear
  {
    id: '1011',
    name: 'Activewear',
    fullPath: 'Apparel & Accessories > Clothing > Activewear',
    gender: 'Women',
    type: 'Activewear'
  },
  {
    id: '5598',
    name: 'Sports Bras',
    fullPath: 'Apparel & Accessories > Clothing > Activewear > Sports Bras',
    gender: 'Women',
    type: 'Activewear'
  },
  {
    id: '5598',
    name: 'Athletic Leggings',
    fullPath: 'Apparel & Accessories > Clothing > Activewear > Leggings',
    gender: 'Women',
    type: 'Activewear'
  },

  // Women's Underwear
  {
    id: '213',
    name: 'Underwear & Intimates',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks',
    gender: 'Women',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Bras',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Bras',
    gender: 'Women',
    type: 'Underwear'
  },
  {
    id: '5598',
    name: 'Panties',
    fullPath: 'Apparel & Accessories > Clothing > Underwear & Socks > Panties',
    gender: 'Women',
    type: 'Underwear'
  },

  // Women's Swimwear
  {
    id: '1144',
    name: 'Swimwear',
    fullPath: 'Apparel & Accessories > Clothing > Swimwear',
    gender: 'Women',
    type: 'Swimwear'
  },
  {
    id: '5598',
    name: 'Bikinis',
    fullPath: 'Apparel & Accessories > Clothing > Swimwear > Bikinis',
    gender: 'Women',
    type: 'Swimwear'
  },
  {
    id: '5598',
    name: 'One-Piece Swimsuits',
    fullPath: 'Apparel & Accessories > Clothing > Swimwear > One-Piece Swimsuits',
    gender: 'Women',
    type: 'Swimwear'
  },

  // ===== UNISEX/ACCESSORIES =====

  // Accessories
  {
    id: '167',
    name: 'Bags & Accessories',
    fullPath: 'Apparel & Accessories > Clothing Accessories',
    gender: 'Unisex',
    type: 'Accessories'
  },
  {
    id: '5598',
    name: 'Belts',
    fullPath: 'Apparel & Accessories > Clothing Accessories > Belts',
    gender: 'Unisex',
    type: 'Accessories'
  },
  {
    id: '173',
    name: 'Hats & Caps',
    fullPath: 'Apparel & Accessories > Clothing Accessories > Hats',
    gender: 'Unisex',
    type: 'Accessories'
  },
  {
    id: '5598',
    name: 'Scarves',
    fullPath: 'Apparel & Accessories > Clothing Accessories > Scarves',
    gender: 'Unisex',
    type: 'Accessories'
  },
  {
    id: '5598',
    name: 'Gloves',
    fullPath: 'Apparel & Accessories > Clothing Accessories > Gloves',
    gender: 'Unisex',
    type: 'Accessories'
  },
  {
    id: '5598',
    name: 'Sunglasses',
    fullPath: 'Apparel & Accessories > Clothing Accessories > Sunglasses',
    gender: 'Unisex',
    type: 'Accessories'
  },

  // Shoes
  {
    id: '187',
    name: 'Shoes',
    fullPath: 'Apparel & Accessories > Shoes',
    gender: 'Unisex',
    type: 'Shoes'
  },
  {
    id: '1686',
    name: 'Sneakers',
    fullPath: 'Apparel & Accessories > Shoes > Athletic Shoes',
    gender: 'Unisex',
    type: 'Shoes'
  },
  {
    id: '5598',
    name: 'Boots',
    fullPath: 'Apparel & Accessories > Shoes > Boots',
    gender: 'Unisex',
    type: 'Shoes'
  },
  {
    id: '5598',
    name: 'Sandals',
    fullPath: 'Apparel & Accessories > Shoes > Sandals',
    gender: 'Unisex',
    type: 'Shoes'
  },
  {
    id: '5598',
    name: 'Dress Shoes',
    fullPath: 'Apparel & Accessories > Shoes > Dress Shoes',
    gender: 'Unisex',
    type: 'Shoes'
  },

  // ===== KIDS =====
  {
    id: '5598',
    name: 'Boys Clothing',
    fullPath: 'Apparel & Accessories > Clothing',
    gender: 'Kids',
    type: 'Other'
  },
  {
    id: '5598',
    name: 'Girls Clothing',
    fullPath: 'Apparel & Accessories > Clothing',
    gender: 'Kids',
    type: 'Other'
  },

  // ===== BABY =====
  {
    id: '5598',
    name: 'Baby Clothing',
    fullPath: 'Apparel & Accessories > Clothing > Baby & Toddler Clothing',
    gender: 'Baby',
    type: 'Other'
  }
];

/**
 * Get unique filter options for gender and type
 */
export function getCategoryFilters() {
  const genders = Array.from(new Set(GOOGLE_APPAREL_CATEGORIES.map(c => c.gender)));
  const types = Array.from(new Set(GOOGLE_APPAREL_CATEGORIES.map(c => c.type)));

  return {
    genders: genders.sort(),
    types: types.sort()
  };
}

/**
 * Filter categories by gender, type, and search query
 */
export function filterCategories(
  gender?: string,
  type?: string,
  searchQuery?: string
): GoogleCategory[] {
  let filtered = GOOGLE_APPAREL_CATEGORIES;

  if (gender) {
    filtered = filtered.filter(c => c.gender === gender);
  }

  if (type) {
    filtered = filtered.filter(c => c.type === type);
  }

  if (searchQuery && searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.fullPath.toLowerCase().includes(query)
    );
  }

  return filtered;
}
