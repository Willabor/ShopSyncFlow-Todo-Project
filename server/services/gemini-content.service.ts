import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Validates that a URL is a safe external image URL to prevent SSRF attacks.
 * Blocks localhost, loopback addresses, private IP ranges, and non-HTTP(S) protocols.
 */
function isValidExternalImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }

    // Block localhost and loopback addresses
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    // Block private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    const ipParts = hostname.split('.').map(Number);
    if (ipParts.length === 4 && ipParts.every(p => !isNaN(p))) {
      if (ipParts[0] === 10) return false; // 10.0.0.0/8
      if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return false; // 172.16.0.0/12
      if (ipParts[0] === 192 && ipParts[1] === 168) return false; // 192.168.0.0/16
      if (ipParts[0] === 169 && ipParts[1] === 254) return false; // Link-local
    }

    return true;
  } catch {
    return false;
  }
}

// Load API key from environment
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️  GEMINI_API_KEY not found in environment. AI content generation will not work.');
  console.warn('   Please add GEMINI_API_KEY to your .env file.');
}

// Initialize Gemini AI
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Log initialization (without exposing key)
if (apiKey) {
  console.log(`✓ Gemini API initialized (key: ${apiKey.substring(0, 10)}...)`);
}

/**
 * Enhanced error handler for Gemini API errors
 * Provides user-friendly error messages for common API issues
 */
function handleGeminiError(error: any, context: string): Error {
  console.error(`Gemini API error in ${context}:`, error);

  // Extract error message and status code
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  const statusCode = error?.status || error?.statusCode;

  // Check for quota/rate limit errors
  if (
    statusCode === 429 ||
    errorMessage.includes('RESOURCE_EXHAUSTED') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('Quota exceeded')
  ) {
    return new Error(
      '⚠️ API Daily Limit Reached - The Gemini AI has reached its daily quota limit. ' +
      'Please try again later or contact your administrator to upgrade the API quota. ' +
      'Free tier limits: 1,500 requests per day.'
    );
  }

  // Check for authentication errors
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    errorMessage.includes('API key') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('permission')
  ) {
    return new Error(
      '🔑 API Authentication Error - The Gemini API key is invalid or expired. ' +
      'Please check your API credentials.'
    );
  }

  // Check for network/timeout errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('network')
  ) {
    return new Error(
      '🌐 Network Error - Unable to connect to Gemini AI. ' +
      'Please check your internet connection and try again.'
    );
  }

  // Check for content safety/blocked errors
  if (
    errorMessage.includes('SAFETY') ||
    errorMessage.includes('blocked') ||
    errorMessage.includes('content policy')
  ) {
    return new Error(
      '🛡️ Content Safety Block - The AI blocked this request due to content safety policies. ' +
      'Please try modifying your input.'
    );
  }

  // Generic error with context
  return new Error(
    `Failed to ${context}: ${errorMessage}. ` +
    'If this persists, please contact support.'
  );
}

/**
 * Helper function to convert text to proper Title Case
 * (First letter of each word capitalized, except small words)
 */
function toTitleCase(str: string): string {
  if (!str) return '';

  // Small words that should stay lowercase (unless first/last word)
  const smallWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with'];

  const words = str.toLowerCase().split(/\s+/);

  return words.map((word, index) => {
    // Always capitalize first and last word
    if (index === 0 || index === words.length - 1) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }

    // Keep small words lowercase
    if (smallWords.includes(word)) {
      return word;
    }

    // Capitalize all other words
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

/**
 * Parameters for generating product titles
 */
export interface GenerateTitleParams {
  productName: string;
  category: string;
  brand?: string;
  price?: number;
  keyFeatures: string[];
  vendorDescription?: string; // Full vendor description for context
  selectedTitle?: string; // Phase 4: Selected SEO title for consistency (used in meta generation)
  targetKeyword?: string;
  gender?: string; // From Google Shopping category (Men, Women, Unisex)
  googleCategory?: { name: string; fullPath: string; gender: string };
  imageUrl?: string; // Product image for visual analysis
  color?: string; // Product color (will be converted to Title Case)
}

/**
 * Parameters for generating product descriptions
 */
export interface GenerateDescriptionParams {
  productName: string;
  category: string;
  brand?: string;
  price?: number;
  keyFeatures: string[];
  vendorDescription?: string; // Full vendor description for context
  selectedTitle?: string; // Phase 4: Selected SEO title for consistency
  targetKeyword?: string;
  tone?: 'professional' | 'casual' | 'luxury';
  styleNumber?: string;
  color?: string;
  material?: string;
  careInstructions?: string;
  fitType?: string;
  imageUrl?: string; // Product image for visual analysis
  enrichedData?: {
    materialComposition?: string;
    careInstructions?: string;
    features?: string[];
    brandDescription?: string;
  } | null; // Brand enrichment data from website scraping
  sizeData?: {
    sizesAvailable?: string[]; // e.g., ["S", "M", "L", "XL", "2XL"]
    fitGuidance?: string; // e.g., "True to size, relaxed fit"
    sizeChartUrl?: string; // Link to full size chart
    sizeChartTable?: string; // HTML table for embedding in description (category-specific)
  } | null; // Size chart data for SEO
  brandData?: {
    name: string;
    description?: string | null; // Brand story/about section
    foundedYear?: string | null;
    specialty?: string | null; // e.g., "Contemporary streetwear"
    targetAudience?: string | null;
    websiteUrl?: string | null;
  } | null; // Brand information for "About the Brand" section
}

/**
 * Parameters for generating keywords
 */
export interface GenerateKeywordsParams {
  productName: string;
  category: string;
  brand?: string;
  description?: string;
  vendorDescription?: string; // Full vendor description for context
  selectedTitle?: string; // Phase 4: Selected SEO title for consistency
}

/**
 * Generate 5 SEO-optimized product title variations
 */
export async function generateProductTitles(params: GenerateTitleParams): Promise<string[]> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash" // FREE tier, fast, good quality
  });

  const keyword = params.targetKeyword || params.productName;

  // Determine gender from googleCategory or gender parameter
  const gender = params.googleCategory?.gender || params.gender || 'Unisex';
  const genderFormatted = gender === 'Men' ? "Men's" : gender === 'Women' ? "Women's" : "Unisex";

  // Format product name to Title Case (SEO best practice: NEVER use ALL CAPS)
  const productNameFormatted = toTitleCase(params.productName);

  // Format color to Title Case (SEO best practice: NEVER use ALL CAPS)
  const colorFormatted = params.color ? toTitleCase(params.color) : '';

  const prompt = `You are an expert e-commerce SEO copywriter who follows apparel SEO best practices (Amazon, Shopify, Google Shopping standards).

Product Information:
- **PRODUCT NAME (MANDATORY): "${productNameFormatted}"** ← USE THIS EXACT NAME IN TITLE CASE (NOT ALL CAPS)
- Category: ${params.category}
- Brand: ${params.brand || 'Not specified'}
- Price: $${params.price || 'Not specified'}
- Key Features: ${params.keyFeatures.join(', ')}
${params.vendorDescription ? `- **Vendor Description** (use for context): ${params.vendorDescription}` : ''}
- Target Keyword: ${keyword}
- **GENDER (MANDATORY): ${genderFormatted}** ← YOU MUST USE THIS EXACT GENDER IN ALL TITLES
${colorFormatted ? `- **COLOR (MANDATORY): ${colorFormatted}** ← YOU MUST USE THIS EXACT COLOR IN TITLE CASE (First Letter Capitalized)` : ''}

CRITICAL APPAREL SEO RULES YOU MUST FOLLOW:

1. **CHARACTER LENGTH (ABSOLUTELY MANDATORY - NO EXCEPTIONS):**
   - ✅ MINIMUM: 55 characters (including all spaces, hyphens, punctuation)
   - ✅ MAXIMUM: 60 characters (including all spaces, hyphens, punctuation)
   - ⚠️ EVERY TITLE MUST BE BETWEEN 55-60 CHARACTERS - THIS IS NON-NEGOTIABLE
   - 🔢 COUNT METHOD: Include EVERY character (letters + spaces + hyphens + punctuation)
   - ❌ REJECT any title under 55 or over 60 characters
   - 📊 Example counts:
     * "EPTM Men's Freeway Pants - Baggy Fit - Black" = 44 chars ❌ TOO SHORT
     * "EPTM Men's Freeway Pants - Relaxed Baggy Fit - Black" = 54 chars ❌ TOO SHORT
     * "EPTM Men's Freeway Pants - Relaxed Baggy Style - Black" = 56 chars ✅ PERFECT
     * "EPTM Men's Freeway Pants - Relaxed Baggy Fit Style - Black" = 60 chars ✅ PERFECT

2. **Brand First**: Brand "${params.brand}" MUST be in the FIRST 3 WORDS
3. **Complete Product Name MANDATORY**: USE THE COMPLETE PRODUCT NAME "${productNameFormatted}" - DO NOT shorten it!
4. **Gender MANDATORY**: ALL titles MUST include "${genderFormatted}" (no exceptions!)
5. **Color MANDATORY**: ALL titles MUST end with the exact color "${colorFormatted || 'specify color'}" in Title Case (no exceptions!)
6. **Format**: [${params.brand}] [${genderFormatted}] [${productNameFormatted}] - [KEY FEATURE/DESCRIPTORS] - ${colorFormatted || '[COLOR]'}
7. **Title Case Formatting**: Use Title Case (First Letter Capitalized) for color - "Concrete" NOT "CONCRETE", "Space Gray" NOT "SPACE GRAY"
8. **Color Placement**: Use EXACT color name "${colorFormatted || ''}" at the END (NOT at the beginning)

Format Breakdown:
- Start with BRAND: "${params.brand}"
- Add GENDER: "${genderFormatted}" (MANDATORY)
- Add COMPLETE PRODUCT NAME: "${productNameFormatted}" (DO NOT shorten! Use the FULL name provided in Title Case)
- Add DESCRIPTIVE FEATURES/ADJECTIVES to reach 55-60 characters (e.g., "Relaxed Baggy Fit", "High-Rise Slim Fit", "Lightweight Breathable")
- End with EXACT COLOR IN TITLE CASE: "${colorFormatted || '[color]'}" (e.g., "Concrete" NOT "CONCRETE")

HOW TO REACH 55-60 CHARACTERS:
- Base format typically gives 40-48 characters: "${params.brand} ${genderFormatted} ${productNameFormatted} - [Feature] - ${colorFormatted}"
- ADD DESCRIPTIVE WORDS to reach 55-60:
  * Add adjectives: "Relaxed", "Premium", "Classic", "Modern", "Stylish"
  * Add fit descriptors: "Slim Fit", "Baggy Fit", "Athletic Fit", "Regular Fit"
  * Combine features: "Relaxed Baggy Fit", "High-Rise Skinny Fit", "Cropped Wide Leg"
  * Add material: "Cotton Blend", "Denim Stretch", "Fleece Lined"

WRONG EXAMPLES (DO NOT DO THIS):
❌ "${params.brand} ${genderFormatted} Hoodie - Boxy Fit - ${colorFormatted}" (Missing product name)
❌ "${params.brand} ${genderFormatted} ${productNameFormatted} - Fit - ${colorFormatted}" (TOO SHORT - add more descriptors)
❌ "${params.brand} ${genderFormatted} ${productNameFormatted} - ${colorFormatted}" (TOO SHORT - missing features)

CORRECT EXAMPLES (55-60 CHARACTERS):
✅ "${params.brand} ${genderFormatted} ${productNameFormatted} - Relaxed Baggy Fit - ${colorFormatted}" (55-60 chars)
✅ "${params.brand} ${genderFormatted} ${productNameFormatted} - Premium Streetwear - ${colorFormatted}" (55-60 chars)

Generate 5 title variations that ALL meet these requirements:
1. Standard apparel format variation (with descriptive features to reach 55-60 chars)
2. Feature-focused variation (emphasize key feature + adjectives to reach 55-60 chars)
3. Style-focused variation (emphasize style/fit + descriptors to reach 55-60 chars)
4. Material-focused variation (if material is a key feature + descriptors to reach 55-60 chars)
5. Occasion-focused variation (casual, athletic, formal + descriptors to reach 55-60 chars)

CRITICAL CAPITALIZATION RULES (Amazon/Google Shopping/Shopify Compliance):
- ✅ USE Title Case: "Concrete", "Space Gray", "Navy Blue"
- ❌ NEVER use ALL CAPS: "CONCRETE", "SPACE GRAY" (violates platform guidelines)
- BRAND must be first, "${genderFormatted}" must be included, COLOR IN TITLE CASE "${colorFormatted || ''}" must be last
- DO NOT paraphrase the color (e.g., "Concrete" should stay "Concrete", NOT "Grey" or "Neutral")
- DO NOT use ALL CAPS for color (e.g., "CONCRETE" is WRONG, must be "Concrete")

⚠️ BEFORE GENERATING EACH TITLE:
1. Draft the title
2. COUNT every character (including spaces, hyphens, punctuation)
3. If under 55 characters → ADD descriptive words (adjectives, features, materials)
4. If over 60 characters → REMOVE less important words
5. Verify count is between 55-60 before including in output

⚠️ FINAL VALIDATION CHECKLIST (ALL 5 TITLES MUST PASS):
✅ Character count: 55-60 characters (count spaces, hyphens, punctuation)
✅ Brand first: "${params.brand}" in first 3 words
✅ Gender included: "${genderFormatted}" present
✅ Complete product name: "${productNameFormatted}" not shortened
✅ Color at end: "${colorFormatted || '[color]'}" in Title Case
✅ No ALL CAPS: Color and product name in Title Case only

Return ONLY the 5 titles, one per line, numbered 1-5. No explanations, no character counts, just titles.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse numbered list
    const titles = text
      .split('\n')
      .filter(line => /^\d\./.test(line.trim()))
      .map(line => line.replace(/^\d\.\s*/, '').trim())
      .slice(0, 5);

    if (titles.length === 0) {
      throw new Error('No titles generated. Response format may be incorrect.');
    }

    return titles;
  } catch (error: any) {
    throw handleGeminiError(error, 'generate product titles');
  }
}

/**
 * Generate 3 product description variations in different tones
 */
export async function generateProductDescriptions(params: GenerateDescriptionParams): Promise<string[]> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const toneDescriptions = {
    professional: 'formal, factual, informative, business-like',
    casual: 'friendly, conversational, approachable, relatable',
    luxury: 'sophisticated, premium, exclusive, aspirational'
  };

  const tone = params.tone || 'professional';
  // IMPORTANT: Use selectedTitle (the AI-generated SEO title) as the primary product reference
  // This ensures description uses the optimized title, not the raw product name
  const productTitle = params.selectedTitle || params.productName;
  const keyword = params.targetKeyword || productTitle;

  // Format color to Title Case (SEO best practice)
  const colorFormatted = params.color ? toTitleCase(params.color) : '';

  const prompt = `You are an expert e-commerce copywriter who follows apparel SEO best practices (Amazon, Shopify, Yoast standards).
${params.imageUrl ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖼️ PRODUCT IMAGE PROVIDED - MANDATORY VISUAL ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A PRODUCT IMAGE IS INCLUDED BELOW. You MUST analyze it FIRST before writing.

🚨 CRITICAL RULE: DESCRIBE WHAT YOU ACTUALLY SEE - NOT WHAT YOU THINK SHOULD BE THERE

Step 1: LOOK AT THE IMAGE and identify:

**COLOR ANALYSIS** (MANDATORY):
- PRIMARY color(s): What is the EXACT shade you see? (cream, taupe, sand, khaki, olive, charcoal, navy, burgundy, etc.)
- SECONDARY colors: Any accent colors, contrast stitching, panels, trim?
- Color tone: Muted/faded, vibrant/saturated, earth tones, neutral?
- Example: "The taupe cream colorway has warm beige undertones with cream ribbing at the waistband and cuffs"

**FABRIC TEXTURE** (What you can SEE):
- Surface appearance: Smooth, brushed, fleece, ribbed, textured, waffle-knit?
- Thickness: Lightweight, midweight, heavyweight, plush?
- Finish: Matte, slight sheen, distressed, washed?
- Example: "The fleece fabric has a soft brushed surface texture visible in the close-up"

**SILHOUETTE & FIT DETAILS** (Visible in image):
- Overall shape: Tapered, straight, wide-leg, stacked, cropped?
- Rise: Low-rise, mid-rise, high-rise (visible from waistband placement)?
- Leg opening: Narrow, regular, wide, elasticated cuffs?
- Unique cut features: Dropped crotch, cargo pockets, articulated knees?
- Example: "The stacked silhouette shows pronounced bunching at the ankles from the extended inseam"

**CONSTRUCTION DETAILS YOU CAN SEE**:
- Waistband style: Elastic with drawcord, ribbed, flat-front?
- Drawcord details: Flat laces, round cords, metal tips, contrast color?
- Pockets: Side seam, slant, cargo, back pockets visible?
- Stitching: Contrast stitching, flatlock seams, decorative topstitching?
- Hardware: Metal eyelets, zippers, snaps visible?
- Example: "Metal-tipped flat drawstrings extend from the ribbed elastic waistband"

**GRAPHICS/PRINTS/BRANDING** (if ANY visible):
- Logos: Where placed? Size? Style (embroidered, screen print, patch)?
- Graphics: DESCRIBE what you see (not "bold graphic" but "skull with roses")
- Text: What does it say? Font style?
- If NONE visible: State "clean, logo-free design" or "minimal branding"
- Example: "Small embroidered brand logo on left thigh" OR "No visible graphics - clean minimalist aesthetic"

**STYLING/AESTHETIC VIBE**:
- What culture/scene does this fit? (streetwear, athleisure, workwear, prep, grunge, Y2K)
- Era/inspiration: 90s, vintage, modern minimalist, retro athletic?
- Example: "Modern streetwear aesthetic with stacked jogger styling popular in urban fashion"

⚠️ REJECTION CRITERIA - Your description will be REJECTED if you use:
- ❌ "unique design" without describing WHAT makes it unique
- ❌ "bold graphics" without describing WHAT the graphic shows
- ❌ "eye-catching style" without describing WHAT catches the eye
- ❌ "premium look" without describing WHAT looks premium
- ❌ ANY generic phrase not backed by specific visual observation

✅ APPROVED: "The taupe cream fleece has a soft brushed texture with ribbed elastic waistband and metal-tipped drawcords. The stacked silhouette creates pronounced bunching at the ankles."
❌ REJECTED: "These pants have a unique design and bold style that will make you stand out."

YOU MUST weave 3-5 specific visual observations from the image into your opening paragraphs and Key Features section.
` : ''}
${params.enrichedData ? '\n⭐ CRITICAL: You have TWO data sources below - BOTH are valuable:\n1. **Vendor Description** (CSV file) - May contain sizing notes, fit recommendations, and general product info\n2. **Brand Website Data** (scraped from official site) - MOST ACCURATE for technical specs like material, care instructions, and features\n\nIMPORTANT RULES:\n- For technical specs (material, care, features): ALWAYS use Brand Website Data if available\n- For additional context (fit notes, styling tips): Use Vendor Description to supplement\n- If there are conflicts: Brand Website Data takes priority\n- Combine the best information from both sources\n' : ''}
Product Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 **PRODUCT TITLE (USE THIS IN DESCRIPTION)**: "${productTitle}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ MANDATORY: Use "${productTitle}" as the product name in your description.
   This is the SEO-optimized title - use it in opening paragraph, closing, and throughout.

- Category: ${params.category}
- Brand: ${params.brand || 'Not specified'}
- Price: $${params.price || 'Not specified'}
- Key Features (from CSV): ${params.keyFeatures.join(', ')}
${params.vendorDescription ? `- **Vendor Description** (from CSV file - use for context and supplementary details):\n  ${params.vendorDescription}` : ''}
- Target Keyword: ${keyword}
- Tone: ${toneDescriptions[tone]}
${params.styleNumber ? `- Style Number: ${params.styleNumber}` : ''}
${colorFormatted ? `- Color: ${colorFormatted} (in Title Case)` : ''}
${params.material ? `- Material (from CSV): ${toTitleCase(params.material)}` : ''}
${params.careInstructions ? `- Care Instructions (from CSV): ${params.careInstructions}` : ''}
${params.fitType ? `- Fit Type: ${toTitleCase(params.fitType || '')}` : ''}

${params.sizeData ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📏 SIZE & FIT DATA (From Brand Size Chart)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${params.sizeData.sizesAvailable ? `✓ Available Sizes: ${params.sizeData.sizesAvailable.join(', ')}` : ''}
${params.sizeData.fitGuidance ? `✓ Fit Guidance (USE THIS): ${params.sizeData.fitGuidance}` : ''}
${params.sizeData.sizeChartTable ? `
✓ SIZE CHART TABLE (MANDATORY - EMBED THIS IN YOUR DESCRIPTION):

${params.sizeData.sizeChartTable}

⚠️ CRITICAL INSTRUCTIONS FOR SIZE CHART EMBEDDING:
1. You MUST embed the size chart table above in your product description
2. Use HTML <details> and <summary> tags for a collapsible section
3. Place it INSIDE the "Size & Fit" section - AFTER the closing </ul> tag but BEFORE the next <h2> heading
4. Format exactly like this:

</ul>

<details>
  <summary><strong>📏 View Size Chart</strong></summary>
  ${params.sizeData.sizeChartTable}
</details>

<h2>Product Details</h2>

5. DO NOT modify the table HTML - use it exactly as provided
6. The table is already category-specific for this product
7. This is for SEO - search engines can crawl content in <details> tags
8. ⚠️ DO NOT add any links or URLs to the size chart in the body
9. ⚠️ DO NOT place the size chart at the very end of the description - it goes INSIDE "Size & Fit" section
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${params.enrichedData ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 OFFICIAL BRAND WEBSITE DATA (Priority Source for Technical Specs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${params.enrichedData.materialComposition ? `✓ Material Composition (USE THIS): ${params.enrichedData.materialComposition}` : ''}
${params.enrichedData.careInstructions ? `✓ Care Instructions (USE THIS): ${params.enrichedData.careInstructions}` : ''}
${params.enrichedData.features && params.enrichedData.features.length > 0 ? `✓ Official Features (USE THESE):\n${params.enrichedData.features.map(f => `  • ${f}`).join('\n')}` : ''}
${params.enrichedData.brandDescription ? `✓ Brand Description: ${params.enrichedData.brandDescription}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ MANDATORY: You MUST use ALL features listed above in the "Official Features" section.
   - DO NOT make up generic features like "Premium Cotton" or "Comfortable Fit"
   - DO NOT skip unique details like "Gold shimmer neckless neck tag" or "5.3 oz."
   - Each feature above MUST appear in your "Key Features" section
   - You may rephrase for clarity, but preserve all specific details (weights, materials, construction)
   - Example: "5.3 oz., 100% mid weight combed cotton" → "<strong>5.3 oz. Fabric:</strong> Made from 100% mid-weight combed cotton for premium comfort."
` : ''}

CRITICAL APPAREL DESCRIPTION RULES YOU MUST FOLLOW:

1. **Length**: 250-300 words (optimal for apparel product pages)
2. **Product Title First**: "${productTitle}" MUST appear in the FIRST 5 WORDS of your description
3. **Benefits Over Features**: Lead with WHY customer needs this (emotion/aspiration), then WHAT it is (specs)
4. **Keyword Density**: Use keyword 2-3 times total (0.5-2.5% density)
5. **Readability** (Flesch Score 60-70):
   - Max 20 words per sentence
   - Max 4 sentences per paragraph
   - Active voice (no passive: "is made", "was designed")
   - Transition words (however, therefore, additionally)
6. **Customer-Focused**: Use "you" language, NOT "this product" or "our product"
7. **Structure** (Benefits-First Approach):
   - Opening hook (product name in first 5 words, create interest)
   - Benefits paragraph (emotional appeal, aspirations, why they need this)
   - Key Features list (Feature + Benefit format: "What it is: Why it matters")
   - Size & Fit list (fit type, material, care instructions)
   - Closing CTA (call-to-action with urgency)

APPAREL-SPECIFIC REQUIREMENTS:

Emotional Benefits to Highlight (based on style):
- Streetwear: Confidence, individuality, authenticity, standing out
- Athletic: Performance, achievement, motivation, pushing limits
- Casual: Comfort, ease, versatility, reliability
- Luxury: Sophistication, exclusivity, refined elegance

Feature + Benefit Format (MANDATORY):
- ❌ WRONG: "Reflective detailing"
- ✅ CORRECT: "Reflective Accents: Stand out and stay visible after dark"

- ❌ WRONG: "100% cotton"
- ✅ CORRECT: "Premium Cotton: Soft, breathable fabric keeps you cool all day"

${params.sizeData ? `Size & Fit (MANDATORY for Apparel):
- Include fit type (Baggy, Slim, Regular, Oversized, etc.)
- Include material composition and care instructions
- Use sizing guidance ("True to size" or "Runs small/large")` : `Size & Fit Section: SKIP - This is an Accessories product without size charts.
- DO NOT include a Size & Fit section in the description.
- Focus on Key Features and Product Details instead.`}

CRITICAL CAPITALIZATION RULES (SEO Best Practices):

**For Paragraph Text (Use Sentence Case)**:
- ✅ CORRECT: "This premium fleece hoodie combines comfort with style."
- ❌ WRONG: "This Premium Fleece Hoodie Combines Comfort With Style." (Title Case in paragraph)
- ❌ VERY WRONG: "THIS PREMIUM FLEECE HOODIE COMBINES COMFORT WITH STYLE." (ALL CAPS)

**For Product Attributes (Use Title Case)**:
- ✅ CORRECT: Concrete gray, Space Gray, Navy Blue, Olive Green
- ❌ WRONG: CONCRETE GRAY, SPACE GRAY (ALL CAPS violates Amazon/Google guidelines)
- ❌ WRONG: concrete gray, space gray (all lowercase)

**For Headings (<h2>, <h3>)**: Use Title Case
- ✅ CORRECT: "Key Features", "Size and Fit"
- ❌ WRONG: "KEY FEATURES" (ALL CAPS)

**For Bold Terms**: Use Title Case or Sentence Case (NOT ALL CAPS)
- ✅ CORRECT: <strong>Premium Cotton</strong>
- ❌ WRONG: <strong>PREMIUM COTTON</strong>

Generate 1 product description in ${tone} tone that follows ALL rules above.

EXACT HTML STRUCTURE TO FOLLOW:

CRITICAL: Shopify automatically generates <h1> tag from Product Title field.
DO NOT include product title or <h1> tag in description. Start directly with <p> tag.

HTML Output Format (320-350 words total):

⚠️ YOAST SEO PARAGRAPH LENGTH REQUIREMENTS (CRITICAL):
- MAXIMUM 150 WORDS PER PARAGRAPH (Yoast standard)
- Each paragraph: 2-3 sentences ONLY (NOT 4+ sentences)
- Each sentence: 10-20 words maximum
- NO PARAGRAPH can exceed 150 words (Yoast will flag as red)
- ⚠️ INCLUDE 2-3 TRANSITION WORDS throughout the ENTIRE description (not every sentence)
- ✅ Place them naturally WITHIN sentences or at logical connection points
- ❌ DO NOT start EVERY sentence with transition words
- ✅ Use natural, direct language for most sentences

❌ WRONG EXAMPLES (TOO MANY TRANSITION WORDS):
"Moreover, you can experience style. Additionally, these pants offer comfort. Furthermore, the fit is relaxed."

✅ CORRECT EXAMPLES (2-3 TRANSITION WORDS NATURALLY PLACED):
"You'll experience elevated style. Additionally, these pants deliver all-day comfort. The relaxed fit moves with you."

<p>[Opening Hook - 2-3 SHORT, DIRECT sentences. Sentence 1: Include the product title "${productTitle}" wrapped in <strong> tags in first 10 words for emphasis. NO transition words at start (no "Moreover," "Additionally," etc.). MAX 35 words total]

Example: "The <strong>${productTitle}</strong> brings modern streetwear style to your wardrobe. You'll enjoy premium comfort and standout design. These pants deliver the perfect blend of function and fashion."</p>

<p>[Benefits - 2-3 PUNCHY sentences. Focus on why customer needs this. NO transition words at sentence start. MAX 40 words total]

Example: "You'll turn heads with the relaxed baggy fit. The durable fabric withstands daily wear. Reflective details keep you visible after dark."</p>

<p>[Features & Quality - 2 SHORT sentences. Highlight 1-2 key features. Direct language. MAX 30 words total]

Example: "The nylon ripstop fabric provides exceptional durability. Elastic waistband ensures a comfortable, adjustable fit all day."</p>

<h2>Key Features</h2>
<ul>
  <li><strong>[Feature 1]:</strong> [Clear benefit explanation - 10-15 words. Use descriptive language]</li>
  <li><strong>[Feature 2]:</strong> [How it improves your experience - 10-15 words. Use descriptive adjectives]</li>
  <li><strong>[Feature 3]:</strong> [Practical benefit with detail - 10-15 words. Be specific]</li>
  <li><strong>[Feature 4]:</strong> [Emotional or comfort benefit - 10-15 words. Use descriptive words]</li>
  <li><strong>[Feature 5]:</strong> [Additional quality feature - 10-15 words. Mention durability or style]</li>
</ul>

${params.sizeData ? `<h2>Size &amp; Fit</h2>
<ul>
  <li><strong>Fit Style:</strong> [Direct fit description - 10-15 words. ${params.sizeData?.fitGuidance ? `Use this guidance: "${params.sizeData.fitGuidance}"` : 'Start with fit type, NOT transition word. Example: "Features a relaxed baggy fit for comfortable streetwear style."'}]</li>
  <li><strong>Sizing Guide:</strong> [Size tips - 10-15 words. ${params.sizeData?.fitGuidance ? `Incorporate fit guidance provided above.` : 'Example: "True to size, select your regular size for best fit."'}]</li>
${params.sizeData?.sizesAvailable ? `  <li><strong>Available Sizes:</strong> ${params.sizeData.sizesAvailable.join(', ')}</li>` : ''}
  <li><strong>Material:</strong> [Material composition - 10-15 words. ${params.enrichedData?.materialComposition ? `Use: "${params.enrichedData.materialComposition}"` : 'Example: "Made from 100% polyester for durability and comfort."'}]</li>
  <li><strong>Care Instructions:</strong> [Care info - 10-15 words. ${params.enrichedData?.careInstructions ? `Use: "${params.enrichedData.careInstructions}"` : 'Example: "Machine wash cold, tumble dry low for easy care."'}]</li>
</ul>` : ''}

<h2>Product Details</h2>
<ul>
${params.styleNumber ? `  <li><strong>Style Number:</strong> ${params.styleNumber}</li>` : '  <li><strong>Style Number:</strong> [Style number if provided]</li>'}
${params.color ? `  <li><strong>Color:</strong> ${params.color}</li>` : '  <li><strong>Color:</strong> [Color name]</li>'}
${params.material ? `  <li><strong>Material:</strong> ${params.material}</li>` : '  <li><strong>Material:</strong> [Material composition]</li>'}
${params.careInstructions ? `  <li><strong>Care Instructions:</strong> ${params.careInstructions}</li>` : '  <li><strong>Care Instructions:</strong> [Care instructions]</li>'}
${params.fitType ? `  <li><strong>Fit Type:</strong> ${params.fitType}</li>` : '  <li><strong>Fit Type:</strong> [Fit description]</li>'}
</ul>

${params.brandData && (params.brandData.description || params.brandData.specialty) ? `
<h2>About ${params.brandData.name}</h2>
<p>[Write 2-3 sentences about the brand. ${params.brandData.description ? `Use this brand description: "${params.brandData.description}"` : ''} ${params.brandData.specialty ? `Mention their specialty: ${params.brandData.specialty}.` : ''} ${params.brandData.foundedYear ? `Founded in ${params.brandData.foundedYear}.` : ''} ${params.brandData.targetAudience ? `Designed for ${params.brandData.targetAudience}.` : ''} Keep it concise and relevant to the product. MAX 50 words.]</p>
` : ''}

<p>[Closing - 2 SHORT sentences. Summarize main benefit. Use <strong> tags around product name if mentioned. NO transition words (no "Finally," "In conclusion," "Overall"). MAX 25 words total]

Example: "These <strong>${keyword}</strong> combine street-ready style with all-day comfort. Built to last and designed to impress."</p>

<p>[CTA - 1-2 DIRECT sentences. Strong urgency. NO transition words (no "Therefore," "So,"). MAX 20 words total]

Example: "Upgrade your streetwear collection today. Get yours now and experience premium quality."</p>

HTML FORMATTING RULES:
- ❌ DO NOT include <h1> tag (Shopify already generates this from Product Title)
- ✅ START with <p> tag for opening paragraph
- ✅ USE <h2> for section headings (Key Features, Size & Fit, Product Details, About [Brand])
- ✅ USE <ul> and <li> for bullet lists (CRITICAL - Yoast checks for lists!)
- ✅ USE <strong> for feature names (Feature:) and label names (Style Number:, Color:)
- ✅ USE <em> for emphasis if needed
- ✅ ESCAPE special characters: Use &amp; for &, &quot; for ", &lt; for <, &gt; for >
- ✅ CLOSE all tags properly (<p>...</p>, <h2>...</h2>, <ul>...</ul>)
- ✅ NEST tags properly (ul > li, not backwards)
- ✅ ALWAYS include Product Details section with style number (critical for SEO)
- ✅ About the Brand section is OPTIONAL (only if brand data provided)

**List Requirements** (CRITICAL - Yoast checks for bullet/numbered lists):
- MUST include at least 3 <ul> lists in the HTML
- Each list MUST have at least 4-5 <li> items
- Lists MUST be properly formatted: <ul><li>text</li><li>text</li></ul>
- NO extra spacing or line breaks inside <ul> tags
- Example: <h2>Key Features</h2><ul><li><strong>Feature:</strong> Description</li></ul>

YOAST SEO REQUIREMENTS (CRITICAL - MUST MEET ALL):

**Content Length**:
- MINIMUM: 300 words (Yoast requirement - MUST meet!)
- TARGET: 310-340 words for optimal SEO
- Count all words including headings and list items
- If total is under 300 words, ADD MORE CONTENT to paragraphs

**Keyword Density** (Focus Keyword: "${keyword}"):
- Use the EXACT focus keyword "${keyword}" at least 3-4 times in the content
- Target density: 1.0-2.5% (for 300 words, use keyword 3-7 times)
- MUST appear in: First paragraph (100% match), at least 2 other places
- First paragraph MUST contain the COMPLETE focus keyword within first 20 words

**Paragraph Length** (CRITICAL - Yoast FAILS if paragraph over 150 words):
- ABSOLUTE MAXIMUM: 40 words per paragraph (STRICT!)
- IDEAL: 25-35 words per paragraph (2-3 SHORT sentences)
- Each <p> tag MUST be under 40 words
- Count words carefully - if over 40, make it 2 paragraphs instead

**Transition Words** (CRITICAL - Include exactly 2-3 in the entire description):
- ⚠️ You MUST include 2-3 transition words in the description (not 0, not 10)
- Place them NATURALLY at the start of 2-3 sentences across different paragraphs
- Good transition words: "Additionally," "Moreover," "Furthermore," "Therefore," "Also,"
- Example placements:
  * Paragraph 1: No transition word (direct start)
  * Paragraph 2: "Additionally, you'll experience..." (1st transition word)
  * Paragraph 3: "Moreover, the design..." (2nd transition word)
  * Closing: No transition word (direct CTA)
- ❌ DON'T use transition words in every sentence (too robotic)
- ✅ DO use them to connect 2-3 key ideas naturally

**Sentence Variety** (CRITICAL - Yoast checks for consecutive sentences):
- NEVER start consecutive sentences with the same word
- Vary sentence beginnings: use transition words, pronouns (You, It, This, The), and action words
- If sentence starts with "The", next sentence must start with different word
- If sentence starts with "You'll", next sentence must start with different word
- Mix up: "The hoodie...", "You'll love...", "It gives...", "This piece...", "Moreover, it..."

**Readability** (Target Flesch 60-70 - MUST ACHIEVE 60+ SCORE):
- Use MOSTLY simple, short words (1-2 syllables) with FEW longer descriptive words
- Prioritize simple vocabulary:
  * ALWAYS use: "use", "buy", "get", "has", "gives", "made", "keeps", "feel", "wear", "look", "stay", "fit"
  * SOMETIMES use (sparingly): "comfortable", "durable", "premium" (max 3-4 times total)
  * NEVER use: "utilize", "exceptional", "additional", "features", "provides", "designed", "ensures"
- Keep sentences VERY SHORT (9-12 words average, ABSOLUTE MAX 18 words per sentence)
- CRITICAL: Every 3rd sentence should be 8-10 words maximum
- Use active voice ONLY ("you'll love it" NOT "it is loved")
- Write at 7th-8th grade reading level (simple conversational English)
- Use contractions in EVERY opportunity: "you'll", "it's", "don't", "won't", "can't", "we've"
- Avoid passive voice completely (0%)
- Use mostly 1-2 syllable words, limit 3+ syllable words to 10% or less
- Use direct "you" language: "You'll feel great" NOT "You'll feel comfortable"
- CRITICAL: To achieve Flesch 60+, make sentences shorter and words simpler than current output

Return ONLY the HTML description. No markdown, no title, no explanations. Pure HTML only.`;

  try {
    let result;

    // If image URL provided, fetch and include it in the request
    if (params.imageUrl) {
      try {
        console.log(`🖼️  Fetching product image from: ${params.imageUrl}`);
        const imageResponse = await fetch(params.imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

        // Detect mime type from URL or default to jpeg
        let mimeType = 'image/jpeg';
        if (params.imageUrl.toLowerCase().endsWith('.png')) {
          mimeType = 'image/png';
        } else if (params.imageUrl.toLowerCase().endsWith('.webp')) {
          mimeType = 'image/webp';
        } else if (params.imageUrl.toLowerCase().endsWith('.gif')) {
          mimeType = 'image/gif';
        }

        console.log(`✅ Image fetched successfully (${Math.round(base64Image.length / 1024)}KB, ${mimeType})`);
        console.log(`🤖 Sending to Gemini Vision API with image analysis prompt`);

        // Multimodal request with image and text
        result = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType,
              data: base64Image
            }
          }
        ]);
        console.log(`✅ Gemini Vision API returned response`);
      } catch (imgError: any) {
        console.warn(`❌ Failed to fetch image from ${params.imageUrl}:`, imgError.message);
        console.warn('⚠️  Falling back to text-only generation (no image analysis)');
        // Fallback to text-only if image fetch fails
        result = await model.generateContent(prompt);
      }
    } else {
      // Text-only request
      console.log(`ℹ️  No image URL provided - using text-only generation`);
      result = await model.generateContent(prompt);
    }

    const response = await result.response;
    let description = response.text().trim();

    console.log('🔍 DESCRIPTION BEFORE PROCESSING:', description.substring(0, 200));

    // Remove markdown code fences if present (```html ... ``` or ```...```)
    description = description.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

    // 🔧 BACKEND FIX: Limit transition words to 2-3 per description (not 0)
    // List of transition words that AI forces at sentence beginnings
    const forcedTransitions = [
      'Moreover,', 'Additionally,', 'Furthermore,', 'In addition,',
      'Therefore,', 'Thus,', 'Consequently,', 'As a result,',
      'For example,', 'For instance,', 'Also,', 'Besides,',
      'In conclusion,', 'Finally,', 'Overall,', 'So,'
    ];

    // Find all transition word occurrences with their positions
    const transitionOccurrences: Array<{transition: string, match: string, position: number, type: 'paragraph'|'mid'|'list'}> = [];

    forcedTransitions.forEach(transition => {
      // Pattern: <p>Transition, rest of sentence
      const regex = new RegExp(`<p>${transition}\\s+([a-z])`, 'gi');
      let match;
      while ((match = regex.exec(description)) !== null) {
        transitionOccurrences.push({
          transition,
          match: match[0],
          position: match.index,
          type: 'paragraph'
        });
      }

      // Pattern: sentence. Transition, rest of sentence (mid-paragraph)
      const midRegex = new RegExp(`\\.\\s+${transition}\\s+([a-z])`, 'gi');
      while ((match = midRegex.exec(description)) !== null) {
        transitionOccurrences.push({
          transition,
          match: match[0],
          position: match.index,
          type: 'mid'
        });
      }

      // Pattern: <li><strong>Fit Style:</strong> Additionally, these pants...
      const listRegex = new RegExp(`(</strong>)\\s+${transition}\\s+([a-z])`, 'gi');
      while ((match = listRegex.exec(description)) !== null) {
        transitionOccurrences.push({
          transition,
          match: match[0],
          position: match.index,
          type: 'list'
        });
      }
    });

    console.log(`📊 Found ${transitionOccurrences.length} transition words in description`);

    // Keep 2-3 transition words, remove the rest
    const MAX_TRANSITIONS = 3;
    if (transitionOccurrences.length > MAX_TRANSITIONS) {
      // Sort by position to maintain reading order
      transitionOccurrences.sort((a, b) => a.position - b.position);

      // Keep first 2-3 (naturally spaced), remove the rest
      const toRemove = transitionOccurrences.slice(MAX_TRANSITIONS);

      toRemove.forEach(occurrence => {
        const transition = occurrence.transition;

        if (occurrence.type === 'paragraph') {
          const regex = new RegExp(`<p>${transition}\\s+([a-z])`, 'gi');
          description = description.replace(regex, (match, firstChar) => {
            return `<p>${firstChar.toUpperCase()}`;
          });
        } else if (occurrence.type === 'mid') {
          const midRegex = new RegExp(`\\.\\s+${transition}\\s+([a-z])`, 'gi');
          description = description.replace(midRegex, (match, firstChar) => {
            return `. ${firstChar.toUpperCase()}`;
          });
        } else if (occurrence.type === 'list') {
          const listRegex = new RegExp(`(</strong>)\\s+${transition}\\s+([a-z])`, 'gi');
          description = description.replace(listRegex, (match, strongTag, firstChar) => {
            return `${strongTag} ${firstChar.toUpperCase()}`;
          });
        }
      });

      console.log(`✅ Kept ${MAX_TRANSITIONS} transition words, removed ${toRemove.length} excessive ones`);
    } else {
      console.log(`✅ Transition word count (${transitionOccurrences.length}) is within acceptable range (max ${MAX_TRANSITIONS})`);
    }

    // 🔧 BACKEND FIX: Split paragraphs that exceed 60 words (Yoast fails at 150 words)
    // Split on <p> tags and process each paragraph
    const paragraphRegex = /<p>(.*?)<\/p>/g;
    const paragraphs = description.match(paragraphRegex) || [];
    console.log(`📊 Found ${paragraphs.length} paragraphs to check`);

    description = description.replace(paragraphRegex, (match: string, content: string) => {
      // Count words in this paragraph
      const words = content.trim().split(/\s+/).filter((w: string) => w.length > 0);
      const wordCount = words.length;

      console.log(`📏 Paragraph word count: ${wordCount} words`);

      // If paragraph is under 60 words, keep it as-is
      if (wordCount <= 60) {
        return match;
      }

      console.log(`⚠️ Paragraph has ${wordCount} words (over 60), splitting...`);

      // Split long paragraph into sentences
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];

      // Group sentences into paragraphs of max 40 words each
      const newParagraphs: string[] = [];
      let currentParagraph: string[] = [];
      let currentWordCount = 0;

      sentences.forEach((sentence: string) => {
        const sentenceWords = sentence.trim().split(/\s+/).filter((w: string) => w.length > 0).length;

        // If adding this sentence would exceed 40 words, start new paragraph
        if (currentWordCount + sentenceWords > 40 && currentParagraph.length > 0) {
          newParagraphs.push(currentParagraph.join(' ').trim());
          currentParagraph = [sentence];
          currentWordCount = sentenceWords;
        } else {
          currentParagraph.push(sentence);
          currentWordCount += sentenceWords;
        }
      });

      // Add remaining sentences
      if (currentParagraph.length > 0) {
        newParagraphs.push(currentParagraph.join(' ').trim());
      }

      // Convert back to HTML paragraphs
      const result = newParagraphs.map(p => `<p>${p}</p>`).join('\n\n');
      console.log(`✅ Split into ${newParagraphs.length} paragraphs`);
      return result;
    });

    if (!description) {
      throw new Error('No description generated.');
    }

    // 🔧 POST-PROCESSING FIX: Auto-embed size chart if Gemini forgot
    if (params.sizeData?.sizeChartTable) {
      // Check if size chart is already embedded (look for the table content)
      const tablePreview = params.sizeData.sizeChartTable.substring(0, 100);
      const isSizeChartEmbedded = description.includes(tablePreview) ||
                                   description.includes('<details>') ||
                                   description.includes('View Size Chart');

      if (!isSizeChartEmbedded) {
        console.log('⚠️  Gemini forgot to embed size chart - auto-injecting now');

        // Find the Size & Fit section and inject the size chart after the </ul> tag
        const sizeChartHtml = `\n\n<details>\n  <summary><strong>📏 View Size Chart</strong></summary>\n  ${params.sizeData.sizeChartTable}\n</details>\n`;

        // Pattern: Find </ul> that closes the Size & Fit section (followed by either <h2> or <p>)
        const sizeFitPattern = /(<h2>Size &amp; Fit<\/h2>\s*<ul>[\s\S]*?<\/ul>)(\s*)(<h2>|<p>)/i;

        if (sizeFitPattern.test(description)) {
          description = description.replace(sizeFitPattern, `$1${sizeChartHtml}$2$3`);
          console.log('✅ Size chart auto-injected into Size & Fit section');
        } else {
          console.warn('⚠️  Could not find Size & Fit section pattern - size chart not injected');
        }
      } else {
        console.log('✅ Size chart already embedded by Gemini');
      }
    }

    return [description];
  } catch (error: any) {
    throw handleGeminiError(error, 'generate product description');
  }
}

/**
 * Generate 5 relevant keywords/tags for a product (optimal SEO range: 3-5)
 */
export async function generateProductKeywords(params: GenerateKeywordsParams): Promise<string[]> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const prompt = `You are an SEO keyword expert for e-commerce.

Product Information:
- Name: ${params.productName}
- Category: ${params.category}
- Brand: ${params.brand || 'Not specified'}
${params.selectedTitle ? `- **Selected SEO Title** (use this as the PRIMARY reference): "${params.selectedTitle}"` : ''}
${params.vendorDescription ? `- **Vendor Description**: ${params.vendorDescription.substring(0, 200)}...` : ''}
${params.description ? `- Description: ${params.description.substring(0, 200)}...` : ''}

CRITICAL: Generate EXACTLY 5 SEO keywords/tags for this product (optimal range for SEO).

Keyword Requirements:
1. EXACTLY 5 keywords (no more, no less)
2. Are commonly searched by customers
3. Are specific enough to drive qualified traffic
4. Include both broad and long-tail keywords
5. Mix product attributes, use cases, and benefits
6. Are Shopify-optimized (lowercase, hyphen-separated for multi-word)
7. Order by importance (most important first)

Return ONLY the 5 keywords, one per line, numbered 1-5. No explanations.

Example format:
1. women-jeans
2. high-rise-jeans
3. skinny-fit-denim
4. stretch-denim-pants
5. casual-everyday-jeans`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse numbered list
    const keywords = text
      .split('\n')
      .filter(line => /^\d+\./.test(line.trim()))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .slice(0, 5); // Limit to 5 keywords

    if (keywords.length === 0) {
      throw new Error('No keywords generated.');
    }

    return keywords;
  } catch (error: any) {
    throw handleGeminiError(error, 'generate keywords');
  }
}

/**
 * Generate 5 meta title variations and 1 meta description for SEO
 */
export async function generateMetaTags(params: GenerateTitleParams): Promise<{ metaTitles: string[]; metaDescription: string }> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const keyword = params.targetKeyword || params.productName;

  // Determine gender from googleCategory or gender parameter
  const gender = params.googleCategory?.gender || params.gender || 'Unisex';
  const genderFormatted = gender === 'Men' ? "Men's" : gender === 'Women' ? "Women's" : "Unisex";

  // Format product name to Title Case (SEO best practice: NEVER use ALL CAPS)
  const productNameFormatted = toTitleCase(params.productName);

  // Format color to Title Case (SEO best practice: NEVER use ALL CAPS)
  const colorFormatted = params.color ? toTitleCase(params.color) : '';

  const prompt = `You are an SEO expert who follows apparel SEO best practices (Amazon, Shopify, Google Shopping standards) and Yoast SEO optimization.

Product Information:
- **PRODUCT NAME (use in Title Case): "${productNameFormatted}"** ← USE THIS (NOT ALL CAPS!)
${params.selectedTitle ? `- **Selected SEO Title** (use this as PRIMARY reference for meta title): "${params.selectedTitle}"` : ''}
- Category: ${params.category}
- Brand: ${params.brand || 'Not specified'}
- Price: $${params.price || 'Not specified'}
- Key Features: ${params.keyFeatures.join(', ')}
${params.vendorDescription ? `- **Vendor Description**: ${params.vendorDescription.substring(0, 200)}...` : ''}
- Target Keyword: ${keyword}
- Gender: ${genderFormatted}
${colorFormatted ? `- Color: ${colorFormatted} (in Title Case - NEVER use ALL CAPS)` : ''}

CRITICAL: Generate EXACTLY 5 DIFFERENT meta title variations (not just 1).

⚠️ CHARACTER COUNT IS CRITICAL - FAILURE TO MEET 50-60 RANGE = IMMEDIATE REJECTION ⚠️

Meta Title Requirements (Apparel SEO Standard):
- Generate EXACTLY 5 variations
- ⚠️ EACH TITLE MUST BE **MINIMUM 50 CHARACTERS** (46-49 = TOO SHORT = REJECTED!)
- ⚠️ EACH TITLE MUST BE **MAXIMUM 60 CHARACTERS** (61+ = TOO LONG = REJECTED!)
- ⚠️ OPTIMAL RANGE: 55-60 characters (TARGET THIS!)
- COUNT EVERY SINGLE CHARACTER INCLUDING SPACES AND PUNCTUATION
- Brand "${params.brand}" MUST be in the FIRST 3 WORDS of each variation

STEP-BY-STEP PROCESS FOR EACH TITLE:
1. Write the title
2. COUNT characters (including spaces, dashes, apostrophes)
3. If < 50 chars: ADD more descriptive words (e.g., "Premium", "Stylish", "Modern")
4. If > 60 chars: REMOVE unnecessary words
5. If 50-60 chars: PERFECT, keep it!

Format: [BRAND] [${genderFormatted}] [PRODUCT NAME] - [DESCRIPTIVE FEATURE] - ${colorFormatted || '[COLOR]'}

GOOD EXAMPLES (55-60 chars = GREEN):
✅ "${params.brand} ${genderFormatted} ${productNameFormatted} - Premium Relaxed Fit - ${colorFormatted || 'Black'}" (58 chars)
✅ "${params.brand} ${genderFormatted} ${productNameFormatted} - Durable Ripstop Fabric - ${colorFormatted || 'Black'}" (60 chars)

BAD EXAMPLES (< 50 chars = RED = REJECTED):
❌ "${params.brand} ${genderFormatted} ${productNameFormatted} - Relaxed - ${colorFormatted || 'Black'}" (46 chars - TOO SHORT!)
❌ "${params.brand} ${genderFormatted} ${productNameFormatted} - Casual - ${colorFormatted || 'Black'}" (45 chars - TOO SHORT!)

Each variation should emphasize DIFFERENT features:
- Variation 1: Focus on fit/style (add adjectives: "Premium", "Modern", "Classic")
- Variation 2: Focus on material/fabric (add adjectives: "Durable", "High-Quality", "Premium")
- Variation 3: Focus on occasion (add adjectives: "Everyday", "Versatile", "All-Day")
- Variation 4: Focus on benefit (add adjectives: "Ultimate", "Superior", "Maximum")
- Variation 5: Focus on unique feature (add adjectives: "Signature", "Exclusive", "Standout")
- ❌ WRONG: "${params.brand} ${genderFormatted} ${params.productName}" (ALL CAPS product name)
- ✅ CORRECT: "${params.brand} ${genderFormatted} ${productNameFormatted}" (Title Case product name)
- Product name MUST be in Title Case: "${productNameFormatted}" (NOT "${params.productName}")
- Color MUST be in Title Case (e.g., "Concrete" NOT "CONCRETE")
- Color MUST be near the end (NOT at the beginning)
- Make each variation clickable and compelling

Meta Description Requirements (Yoast Standard):
- Generate ONLY 1 meta description (not 5)
- Length: EXACTLY 130-150 characters (STRICT - target 145 chars max!)
- ABSOLUTE MAXIMUM: 156 characters (anything over gets truncated by Google)
- Start with product name or brand in the FIRST 10 WORDS
- MUST include the focus keyword "${keyword}" in the FIRST SENTENCE (Yoast requirement!)
- Include ONE main benefit or USP
- Include ONE call-to-action (Shop, Buy, Get, Discover, etc.)
- Mention color in Title Case: "${colorFormatted}" (NOT ALL CAPS)
- Use sentence case (normal capitalization, NOT Title Case for every word)
- Keep it SHORT and compelling
- COUNT CHARACTERS - if over 150, remove words immediately

CRITICAL CAPITALIZATION RULES (SEO Compliance):
- ✅ USE Title Case for product name: "${productNameFormatted}"
- ✅ USE Title Case for colors: "Concrete", "Space Gray", "Navy Blue"
- ❌ NEVER use ALL CAPS: "${params.productName}", "CONCRETE", "SPACE GRAY"
- Meta titles: Use Title Case for product name and attributes
- Meta description: Use sentence case (normal capitalization)

⚠️ FINAL CHARACTER COUNT VALIDATION (DO THIS BEFORE RETURNING!) ⚠️

FOR EACH META TITLE:
1. Count the characters (use your internal character counter)
2. If < 50 characters: ADD descriptive adjectives until you reach 50-60
3. If > 60 characters: REMOVE words until you reach 50-60
4. If 50-60 characters: PERFECT! Use it.

REJECTION CRITERIA:
❌ ANY title with < 50 characters = FAILED GENERATION
❌ ANY title with > 60 characters = FAILED GENERATION
✅ ALL 5 titles must be 50-60 characters (ideally 55-60)

Meta Description:
- MUST be 130-156 characters (target 145 max)
- Include focus keyword "${keyword}" in first sentence
- Benefits, CTA, stay under 150 characters

Return in this EXACT format (no extra text):
META_TITLE_1: [50-60 character title here]
META_TITLE_2: [50-60 character title here]
META_TITLE_3: [50-60 character title here]
META_TITLE_4: [50-60 character title here]
META_TITLE_5: [50-60 character title here]
META_DESCRIPTION: [130-150 character description here]`;



  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log('🎯 META TAGS AI RESPONSE:', text.substring(0, 500)); // Debug: see what AI returned

    // Parse the response - extract all 5 meta title variations
    const title1Match = text.match(/META_TITLE_1:\s*(.+)/i);
    const title2Match = text.match(/META_TITLE_2:\s*(.+)/i);
    const title3Match = text.match(/META_TITLE_3:\s*(.+)/i);
    const title4Match = text.match(/META_TITLE_4:\s*(.+)/i);
    const title5Match = text.match(/META_TITLE_5:\s*(.+)/i);
    const descMatch = text.match(/META_DESCRIPTION:\s*(.+)/i);

    // Collect all found titles
    const metaTitles: string[] = [];
    if (title1Match) metaTitles.push(title1Match[1].trim());
    if (title2Match) metaTitles.push(title2Match[1].trim());
    if (title3Match) metaTitles.push(title3Match[1].trim());
    if (title4Match) metaTitles.push(title4Match[1].trim());
    if (title5Match) metaTitles.push(title5Match[1].trim());

    console.log('🎯 PARSED META TITLES:', { count: metaTitles.length, titles: metaTitles });

    // Validate we have at least 3 titles (allow partial success)
    if (metaTitles.length < 3 || !descMatch) {
      throw new Error(`Failed to parse meta tags from response. Found ${metaTitles.length} titles, need at least 3.`);
    }

    // 🔧 BACKEND VALIDATION: Fix titles that are too short (< 50 chars)
    const descriptiveWords = [
      'Premium', 'Stylish', 'Modern', 'Classic', 'Quality',
      'Comfortable', 'Durable', 'Versatile', 'Essential', 'Perfect'
    ];

    const validatedTitles = metaTitles.map((title, index) => {
      let fixedTitle = title;

      // If title is too short, add descriptive adjectives
      if (fixedTitle.length < 50) {
        console.log(`⚠️ Title ${index + 1} is too short (${fixedTitle.length} chars): "${fixedTitle}"`);

        // Strategy: Add adjective before the feature part (before the first dash)
        const parts = fixedTitle.split(' - ');
        if (parts.length >= 2) {
          // Add adjective to the feature (middle part)
          const adjective = descriptiveWords[index % descriptiveWords.length];
          parts[1] = `${adjective} ${parts[1]}`;
          fixedTitle = parts.join(' - ');
          console.log(`✅ Fixed to ${fixedTitle.length} chars: "${fixedTitle}"`);
        }
      }

      // If still too short, add another adjective to product name
      if (fixedTitle.length < 50) {
        const parts = fixedTitle.split(' - ');
        if (parts.length >= 1) {
          const secondAdjective = descriptiveWords[(index + 5) % descriptiveWords.length];
          parts[0] = parts[0].replace(/Pants/, `${secondAdjective} Pants`);
          fixedTitle = parts.join(' - ');
          console.log(`✅ Second fix to ${fixedTitle.length} chars: "${fixedTitle}"`);
        }
      }

      // If too long, truncate intelligently
      if (fixedTitle.length > 60) {
        console.log(`⚠️ Title ${index + 1} is too long (${fixedTitle.length} chars): "${fixedTitle}"`);
        fixedTitle = fixedTitle.substring(0, 60);
        console.log(`✅ Truncated to 60 chars: "${fixedTitle}"`);
      }

      return fixedTitle;
    });

    const result2 = {
      metaTitles: validatedTitles,
      metaDescription: descMatch[1].trim()
    };

    console.log('🎯 RETURNING META TAGS (after validation):', result2);

    return result2;
  } catch (error: any) {
    throw handleGeminiError(error, 'generate meta tags');
  }
}

/**
 * Generate SEO-optimized image alt text
 */
export async function generateImageAltText(params: {
  productName: string;
  color?: string;
  mainFeature?: string;
  targetKeyword?: string;
  imageContext?: string; // e.g., "front view", "detail shot", "lifestyle"
}): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const keyword = params.targetKeyword || params.productName;

  const prompt = `You are an SEO expert who writes accessible, SEO-optimized image alt text.

Product Information:
- Product: ${params.productName}
- Color: ${params.color || 'Not specified'}
- Main Feature: ${params.mainFeature || 'Not specified'}
- Target Keyword: ${keyword}
- Image Context: ${params.imageContext || 'product photo'}

CRITICAL ALT TEXT RULES (Accessibility + SEO):

1. **Length**: 100-125 characters (screen readers prefer concise)
2. **Descriptive**: Describe what's IN the image, not what it's FOR
3. **Keyword**: Include target keyword naturally
4. **Context**: Mention image context (front view, detail, lifestyle)
5. **Color**: Include color if visible
6. **NO fluff**: Don't say "image of" or "photo of" (screen readers know it's an image)
7. **Accessible**: Write for visually impaired users first, SEO second

Format: [Color] [Product] [Feature/Context]

Examples:
- "Black leather jacket with silver zipper, front view"
- "High-rise skinny jeans in dark wash, model wearing"
- "Close-up of running shoe sole with grip pattern"

Generate ONE alt text for this ${params.imageContext || 'product'} image.

Return ONLY the alt text, nothing else. No quotes, no explanations.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const altText = response.text().trim();

    if (!altText) {
      throw new Error('No alt text generated.');
    }

    return altText;
  } catch (error: any) {
    throw handleGeminiError(error, 'generate image alt text');
  }
}

/**
 * Analyze size chart image using Gemini Vision API
 * Extracts fit type, material specs, measurements from image
 */
export async function analyzeSizeChartImage(imageUrl: string): Promise<{
  fitType?: string;
  material?: string;
  features?: string[];
  measurements?: Record<string, Record<string, string>>;
  rawAnalysis?: string;
}> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash" // Supports vision
  });

  const prompt = `You are an expert at analyzing apparel size charts and technical specifications.

TASK: Analyze this size chart image and extract ALL relevant information in a structured format.

CRITICAL INSTRUCTIONS:
1. **Fit Type**: Identify the fit style (e.g., "Regular Fit", "Oversized Fit", "Slim Fit", "Relaxed Fit", "Athletic Fit")
2. **Material Composition**: Extract fabric/material details (e.g., "100% Cotton", "80% Polyester 20% Cotton", "Mid-weight 5.3 oz")
3. **Features**: List any special features mentioned (e.g., "Preshrunk", "Pre-washed", "Garment dyed", "Side-seamed")
4. **Measurements**: Extract size measurements in a table format (convert to JSON structure)

MEASUREMENT TABLE FORMAT:
If the image contains a size chart table with measurements (chest, length, waist, etc.), extract it as:
{
  "S": { "chest": "18", "length": "28", "waist": "30" },
  "M": { "chest": "20", "length": "29", "waist": "32" },
  "L": { "chest": "22", "length": "30", "waist": "34" }
}

CRITICAL RULES:
- Extract EVERY piece of text you can see in the image
- If measurements are in inches, keep them as-is (don't convert)
- If the image shows a size diagram/illustration, describe the fit visually
- If material weight is shown (e.g., "5.3 oz"), include it
- If care instructions are shown, include them in features
- Be VERY thorough - extract everything visible

Return your analysis in this EXACT JSON format (no markdown, no code fences):
{
  "fitType": "fit style here or null",
  "material": "material composition here or null",
  "features": ["feature 1", "feature 2", "feature 3"],
  "measurements": {
    "SIZE": { "measurement1": "value", "measurement2": "value" }
  },
  "rawAnalysis": "full detailed description of everything you see in the image"
}

If you cannot extract a specific field, set it to null or empty array. The rawAnalysis should ALWAYS contain a detailed description of what you see.`;

  try {
    console.log(`📸 Fetching size chart image from: ${imageUrl}`);

    // Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Detect mime type from URL or default to jpeg
    let mimeType = 'image/jpeg';
    const urlLower = imageUrl.toLowerCase();
    if (urlLower.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (urlLower.endsWith('.webp')) {
      mimeType = 'image/webp';
    } else if (urlLower.endsWith('.gif')) {
      mimeType = 'image/gif';
    }

    console.log(`✓ Image fetched (${(imageBuffer.byteLength / 1024).toFixed(1)}KB, ${mimeType})`);

    // Multimodal request with image and text
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Image
        }
      }
    ]);

    const response = await result.response;
    let analysisText = response.text().trim();

    console.log('🔍 RAW VISION API RESPONSE:', analysisText.substring(0, 300));

    // Remove markdown code fences if present
    analysisText = analysisText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

    // Parse JSON response
    let analysisData;
    try {
      analysisData = JSON.parse(analysisText);
    } catch (parseError) {
      console.error('❌ Failed to parse Vision API JSON response:', parseError);
      console.error('Raw response:', analysisText);

      // Fallback: Return raw text as analysis
      return {
        rawAnalysis: analysisText,
        fitType: undefined,
        material: undefined,
        features: [],
        measurements: undefined
      };
    }

    console.log('✅ Size chart image analyzed successfully');
    console.log(`  - Fit Type: ${analysisData.fitType || 'Not detected'}`);
    console.log(`  - Material: ${analysisData.material || 'Not detected'}`);
    console.log(`  - Features: ${analysisData.features?.length || 0} items`);
    console.log(`  - Measurements: ${analysisData.measurements ? Object.keys(analysisData.measurements).length : 0} sizes`);

    return {
      fitType: analysisData.fitType || undefined,
      material: analysisData.material || undefined,
      features: analysisData.features || [],
      measurements: analysisData.measurements || undefined,
      rawAnalysis: analysisData.rawAnalysis || analysisText
    };

  } catch (error: any) {
    throw handleGeminiError(error, 'analyze size chart image');
  }
}

/**
 * Parameters for generating keyword variations for Google Trends research
 */
export interface GenerateKeywordVariationsParams {
  productName: string;
  brand: string;
  category?: string;
  googleCategory?: {
    name: string;
    fullPath: string;
    gender: string;
  };
  description?: string;
  material?: string;
  color?: string;
}

/**
 * Generate 10 intelligent BRANDED keyword variations for Google Trends testing
 *
 * This function uses AI to generate smart keyword variations based on:
 * - Product name and features
 * - Brand (ALWAYS included - authorized retailer strategy)
 * - Google Shopping category taxonomy
 * - Material, color, and other attributes
 *
 * Returns exactly 10 keyword variations optimized for authorized retailer SEO
 */
export async function generateKeywordVariationsForTrends(params: GenerateKeywordVariationsParams): Promise<string[]> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const prompt = `You are an expert SEO strategist for AUTHORIZED RETAILERS with deep knowledge of 2025 e-commerce SEO best practices and keyword research.

BUSINESS CONTEXT:
We are an AUTHORIZED RETAILER selling branded products. We are NOT a manufacturer or private label seller.

🔬 2025 SEO RESEARCH FINDINGS (CRITICAL):
- ✅ LONG-TAIL KEYWORDS (3-4 words) = 2.5x HIGHER conversion rate
- ✅ BRANDED keywords = 50%+ CTR vs 20% non-branded
- ✅ BRANDED keywords = 25-40% conversion boost
- ✅ Optimal keyword density: 0.5-1.5% (3-4 mentions in 300 words)
- ❌ SHORT-TAIL (1-2 words) = High traffic BUT lower conversion
- ❌ ULTRA LONG-TAIL (5+ words) = Too specific, no search volume
- ❌ Brand-only keywords (e.g., "EPTM") = Too broad, unclear intent

Product Information:
- Product Name: ${params.productName}
- Brand: ${params.brand}
- Product Type: ${params.productName.toLowerCase().includes('hoodie') ? 'Hoodie' : params.productName.toLowerCase().includes('sweatshirt') ? 'Sweatshirt' : params.productName.toLowerCase().includes('shirt') ? 'Shirt' : params.productName.toLowerCase().includes('pant') ? 'Pants' : params.productName.split(/\\s+/).pop() || 'Apparel'}
${params.googleCategory ? `- Gender: ${params.googleCategory.gender}` : ''}
${params.material ? `- Material: ${params.material}` : ''}
${params.color ? `- Color: ${params.color}` : ''}
${params.description ? `- Description: ${params.description}` : ''}

🎯 SMART KEYWORD STRATEGY (2025 Best Practices):

**OPTIMAL FORMULA**: Brand + Product Type (3-4 words)
- ✅ "EPTM Freeway Pants" (perfect - 3 words, clear intent)
- ✅ "Ethika Sport Boxers" (perfect - 3 words, branded long-tail)
- ✅ "Nike Air Max Shoes" (perfect - 4 words, specific model)
- ❌ "EPTM" (too broad - no product intent)
- ❌ "Pants" (too generic - no brand)
- ❌ "EPTM Men's Black Freeway Cargo Pants Size 32" (too specific - no search volume)

**KEYWORD LENGTH REQUIREMENTS**:
- 🎯 TARGET: 70% of keywords should be 3-4 words (LONG-TAIL - BEST conversion)
- ⚠️  INCLUDE: 20% of keywords can be 2 words (SHORT-TAIL - for brand testing)
- ⚠️  INCLUDE: 10% can be 5 words (ULTRA LONG-TAIL - for very specific searches)

**MANDATORY PATTERNS TO INCLUDE**:
1. Brand + Product Type (e.g., "EPTM Cargo Pants") - HIGHEST PRIORITY
2. Brand + Specific Product Name (e.g., "EPTM Freeway Pants") - if product has unique name
3. Brand + Gender + Product Type (e.g., "EPTM Men's Cargo Pants")
4. Brand + Style + Product Type (e.g., "EPTM Baggy Cargo Pants")
5. Brand alone (e.g., "EPTM") - ONLY 1 keyword for baseline testing

**CRITICAL REQUIREMENTS**:
1. **BRAND MANDATORY**: ALL 10 keywords MUST include the brand name "${params.brand}"
2. **PRIORITIZE 3-4 WORD KEYWORDS**: At least 7 out of 10 keywords should be 3-4 words (long-tail)
3. **NATURAL SEARCH PATTERNS**: Use real searches people would type (not SEO jargon)
4. **NO COLOR IN KEYWORDS**: Don't include color unless it's a signature/iconic colorway
5. **PRODUCT TYPE SINGULAR**: Use "Hoodie" not "Hoodies", "Pant" not "Pants" (sounds more natural)

Generate EXACTLY 10 unique branded keyword variations that we'll test with Google Trends API to find the highest search volume.

Return ONLY the 10 keywords, one per line, numbered 1-10. No explanations, no extra text.

Example 1 (Running Shoes):
1. Nike Running Shoes
2. Nike Men's Running Shoes
3. Men's Nike Air Max
4. Nike Air Max Running Shoes
5. Nike Athletic Shoes Men
6. Men's Nike Sneakers
7. Nike Running Footwear
8. Nike Air Max Shoes
9. Air Max Nike Men
10. Nike Performance Running Shoes

Example 2 (HOODIE product with "Sweatshirts & Hoodies" category - showing CORRECT category extraction):
❌ WRONG: "Roku Studio Sweatshirts & Hoodies" (unnatural, no one searches this way)
✅ CORRECT variations:
1. Roku Studio
2. Roku Studio Hoodie
3. Men's Roku Studio Hoodie
4. Roku Studio Men's Hoodie
5. Roku Studio Fleece Hoodie
6. Roku Studio Boxy Hoodie
7. Men's Roku Studio Sweatshirt
8. Roku Studio Hoodies for Men
9. Roku Studio Ruthless Hoodie
10. Roku Studio Men's Sweatshirt

Now generate 10 keywords for the product above:`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse numbered list
    const keywords = text
      .split('\n')
      .filter(line => /^\d+\./.test(line.trim()))
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .slice(0, 10);

    if (keywords.length === 0) {
      throw new Error('No keyword variations generated.');
    }

    // Verify all keywords contain the brand
    const brandLower = params.brand.toLowerCase();
    const validKeywords = keywords.filter(kw => kw.toLowerCase().includes(brandLower));

    if (validKeywords.length < keywords.length) {
      console.warn(`⚠️  Some keywords missing brand name, filtered from ${keywords.length} to ${validKeywords.length}`);
    }

    // ALWAYS include the bare brand name(s) as first keywords (highest search volume potential)
    const finalKeywords = [params.brand];

    // Also include shortened brand name if brand contains common product line suffixes
    // e.g., "Hasta Muerte Elite" -> also test "Hasta Muerte"
    const productLineSuffixes = ['elite', 'premium', 'signature', 'collection', 'essentials', 'pro', 'sport', 'performance'];
    const brandWords = params.brand.toLowerCase().split(/\s+/);

    if (brandWords.length > 1) {
      const lastWord = brandWords[brandWords.length - 1];
      if (productLineSuffixes.includes(lastWord)) {
        const shortenedBrand = brandWords.slice(0, -1).join(' ');
        // Add shortened brand with original casing
        const originalWords = params.brand.split(/\s+/);
        const shortenedBrandOriginal = originalWords.slice(0, -1).join(' ');
        finalKeywords.push(shortenedBrandOriginal);
      }
    }

    // Add Gemini-generated variations (excluding duplicates of brand names)
    const brandNamesLower = finalKeywords.map(b => b.toLowerCase().trim());
    const uniqueKeywords = validKeywords.filter(kw =>
      !brandNamesLower.includes(kw.toLowerCase().trim())
    );
    finalKeywords.push(...uniqueKeywords);

    // If we don't have enough, pad with basic variations
    while (finalKeywords.length < 10) {
      const categoryTerm = params.googleCategory?.name || params.category || params.productName;
      finalKeywords.push(`${params.brand} ${categoryTerm}`);
    }

    return finalKeywords.slice(0, 10);
  } catch (error: any) {
    throw handleGeminiError(error, 'generate keyword variations');
  }
}

/**
 * Clean HTML for AI processing to reduce token usage
 * Removes unnecessary elements and limits content size
 */
function cleanHtmlForAI(html: string): string {
  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and their content
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove common navigation/header/footer elements
  html = html.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  html = html.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  html = html.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

  // Remove comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Collapse multiple whitespace
  html = html.replace(/\s+/g, ' ');

  // Limit to first 15,000 characters to reduce tokens (roughly 3,750 tokens)
  // This leaves room for the prompt and response within typical limits
  if (html.length > 15000) {
    html = html.substring(0, 15000) + '...[content truncated]';
  }

  return html.trim();
}

/**
 * Extract product data from HTML using AI (Phase 2 - Layer 3 Fallback)
 *
 * This function uses Gemini AI to extract structured product data from any HTML page.
 * It's used as a fallback when Shopify JSON API and Generic HTML scraper both fail.
 *
 * @param html - Raw HTML content from the product page
 * @param productUrl - Full URL to the product page
 * @param searchCriteria - Product identifiers to help AI locate correct data
 * @returns EnrichedProductData with extracted product information
 *
 * @example
 * const data = await extractProductDataWithAI(
 *   htmlContent,
 *   'https://www.ethika.com/products/staple-happy-daze',
 *   { styleNumber: 'staple-happy-daze', productName: 'Staple Happy Daze', color: 'Multi' }
 * );
 */
export async function extractProductDataWithAI(
  html: string,
  productUrl: string,
  searchCriteria: {
    styleNumber: string;
    productName?: string;
    color?: string;
  }
): Promise<any> { // Using 'any' to match EnrichedProductData interface from shopify-scraper.service.ts
  if (!genAI) {
    throw new Error('⚠️  Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  console.log(`🤖 Starting AI extraction for: ${productUrl}`);

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash', // Free tier, fast, multimodal
  });

  // Clean HTML to reduce tokens
  const cleanedHtml = cleanHtmlForAI(html);
  console.log(`   Cleaned HTML: ${html.length} → ${cleanedHtml.length} characters`);

  const prompt = `You are a product data extraction expert. Extract structured product information from this HTML page.

**Product to Find:**
- Style Number: ${searchCriteria.styleNumber}
- Product Name: ${searchCriteria.productName || 'Unknown'}
- Color: ${searchCriteria.color || 'Unknown'}

**HTML Content:**
${cleanedHtml}

**IMPORTANT INSTRUCTIONS:**
1. Look for the MAIN product information (title, description, images)
2. Extract material composition if mentioned (e.g., "100% Cotton", "95% Polyester 5% Spandex")
3. Extract care instructions if found (e.g., "Machine wash cold", "Tumble dry low")
4. Extract key product features as a list (e.g., "Stretchy waistband", "Breathable fabric")
5. Find ALL product images (look for img tags with product photos)
6. Extract variants if available (sizes, colors with SKUs and prices)

**CRITICAL: Return ONLY valid JSON (no markdown, no code fences, no explanation):**

{
  "title": "Exact product title from page",
  "description": "Full product description with all details",
  "materialComposition": "Material details or null if not found",
  "careInstructions": "Care instructions or null if not found",
  "features": ["feature 1", "feature 2", "feature 3"],
  "images": [
    {"url": "https://full-image-url.jpg", "width": 0, "height": 0, "alt": "alt text or empty", "isPrimary": false}
  ],
  "variants": [
    {"sku": "SKU123 or null", "size": "M", "price": "29.99", "available": true}
  ],
  "sizeChartImageUrl": "https://size-chart-url.jpg or null"
}

Return ONLY the JSON object. No additional text.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    console.log(`   AI response received: ${text.length} characters`);

    // Remove markdown code fences (common in AI responses)
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

    // Parse JSON response
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('   ❌ Failed to parse AI response as JSON:', text.substring(0, 500));
      throw new Error('AI returned invalid JSON format');
    }

    // Validate and structure the response according to EnrichedProductData interface
    const enrichedData = {
      styleNumber: searchCriteria.styleNumber,
      productName: parsed.title || searchCriteria.productName || '',
      color: searchCriteria.color,
      brandProductUrl: productUrl,
      brandProductTitle: parsed.title || undefined,
      brandDescription: parsed.description || '',
      materialComposition: parsed.materialComposition || undefined,
      careInstructions: parsed.careInstructions || undefined,
      features: Array.isArray(parsed.features) ? parsed.features : [],
      images: Array.isArray(parsed.images) ? parsed.images.map((img: any) => ({
        url: img.url || '',
        width: img.width || 0,
        height: img.height || 0,
        alt: img.alt || '',
        isPrimary: img.isPrimary || false,
      })) : [],
      variants: Array.isArray(parsed.variants) ? parsed.variants.map((v: any) => ({
        sku: v.sku || null,
        size: v.size || '',
        price: v.price || '0',
        available: v.available !== false, // Default to true
      })) : [],
      sizeChartImageUrl: parsed.sizeChartImageUrl || undefined,
      scrapedAt: new Date(),
      scrapingSuccess: false, // Will be set to true if validation passes
      scrapingError: undefined as string | undefined, // Will be set if validation fails
    };

    // Validate that we actually found meaningful product data
    // Success requires: a title AND (images OR description)
    const hasTitle = enrichedData.brandProductTitle && enrichedData.brandProductTitle.toLowerCase() !== 'not found';
    const hasImages = enrichedData.images.length > 0;
    const hasDescription = enrichedData.brandDescription.length > 50; // At least 50 chars of meaningful description

    if (hasTitle && (hasImages || hasDescription)) {
      enrichedData.scrapingSuccess = true;
      enrichedData.scrapingError = undefined;
      console.log(`   ✅ AI extraction successful:`);
    } else {
      enrichedData.scrapingSuccess = false;
      enrichedData.scrapingError = `Product not found on page (Title: ${hasTitle ? 'Found' : 'Not found'}, Images: ${hasImages ? 'Found' : 'None'}, Description: ${hasDescription ? 'Found' : 'Too short'})`;
      console.log(`   ⚠️ AI extraction failed validation:`);
    }

    console.log(`      - Title: ${enrichedData.brandProductTitle || 'Not found'}`);
    console.log(`      - Description: ${enrichedData.brandDescription.length} chars`);
    console.log(`      - Images: ${enrichedData.images.length}`);
    console.log(`      - Features: ${enrichedData.features.length}`);
    console.log(`      - Variants: ${enrichedData.variants.length}`);
    console.log(`      - Success: ${enrichedData.scrapingSuccess}`);

    return enrichedData;
  } catch (error: any) {
    console.error('   ❌ AI extraction error:', error.message);
    throw handleGeminiError(error, 'extract product data with AI');
  }
}

/**
 * Check if Gemini API is available
 */
export function isGeminiAvailable(): boolean {
  return genAI !== null;
}

/**
 * Generate alt text for a product image using Gemini Vision
 * Analyzes the actual image content to create accurate, accessible alt text
 *
 * @param params - Image URL and product context
 * @returns Generated alt text (80-125 characters recommended)
 */
export async function generateAltTextWithVision(params: {
  imageUrl: string;
  productTitle: string;
  brandName?: string;
  category?: string;
  imagePosition?: number;
}): Promise<string> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const { imageUrl, productTitle, brandName, category, imagePosition } = params;

  console.log(`🖼️ Generating alt text with Vision for: ${imageUrl.substring(0, 100)}...`);

  try {
    // Validate URL to prevent SSRF attacks
    if (!isValidExternalImageUrl(imageUrl)) {
      throw new Error('Invalid image URL: must be a valid external HTTP/HTTPS URL');
    }

    // Fetch image with timeout and convert to base64
    console.log(`   Fetching image...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let imageResponse: Response;
    try {
      imageResponse = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Image fetch timed out after 30 seconds');
      }
      throw fetchError;
    }

    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    // Check content length to prevent memory exhaustion (10MB limit)
    const contentLength = imageResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      throw new Error('Image too large: maximum size is 10MB');
    }

    const imageBuffer = await imageResponse.arrayBuffer();

    // Double-check actual size after download (in case content-length was missing/incorrect)
    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      throw new Error('Image too large: maximum size is 10MB');
    }

    const base64Image = Buffer.from(imageBuffer).toString('base64');

    // Detect mime type from URL or content-type header
    let mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const urlLower = imageUrl.toLowerCase();
    if (urlLower.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (urlLower.endsWith('.webp')) {
      mimeType = 'image/webp';
    } else if (urlLower.endsWith('.gif')) {
      mimeType = 'image/gif';
    }

    console.log(`   Image fetched (${(imageBuffer.byteLength / 1024).toFixed(1)}KB, ${mimeType})`);

    const prompt = `You are an e-commerce accessibility specialist creating alt text for a product image.

Product: ${productTitle}
${brandName ? `Brand: ${brandName}` : ''}
${category ? `Category: ${category}` : ''}
Image Position: ${imagePosition === 1 ? 'Primary/Hero image' : `Image ${imagePosition || 1}`}

Analyze this product image and generate concise, accessible alt text.

CRITICAL RULES:
1. Length: 80-125 characters (screen readers prefer concise text)
2. Start with the product type (NOT "Image of" or "Photo of")
3. Include visible color, material, and key distinguishing features
4. Use natural language a customer would use to describe the item
5. DO NOT use subjective adjectives (beautiful, stunning, amazing)
6. If this is a secondary image, describe what angle/detail it shows

Example good alt text:
- "Navy blue cotton polo shirt with white collar trim and three-button placket"
- "Black leather ankle boots with silver buckle strap, side zipper, 2-inch heel"
- "Back view of olive cargo pants showing large rear pockets and belt loops"

Return ONLY the alt text, no quotes, no explanation.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash" // Supports vision
    });

    console.log(`   Sending to Gemini Vision API...`);
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
    ]);

    const response = await result.response;
    let altText = response.text().trim();

    // Clean up the response - remove quotes if present
    altText = altText.replace(/^["']|["']$/g, '');

    // Validate length and warn if outside recommended range
    if (altText.length < 50) {
      console.warn(`   ⚠️ Alt text is short (${altText.length} chars): "${altText}"`);
    } else if (altText.length > 200) {
      console.warn(`   ⚠️ Alt text is long (${altText.length} chars), truncating...`);
      // Truncate at last complete word before 200 chars
      const truncated = altText.substring(0, 200);
      const lastSpace = truncated.lastIndexOf(' ');
      altText = lastSpace > 150 ? truncated.substring(0, lastSpace) : truncated;
    }

    console.log(`   ✅ Generated alt text (${altText.length} chars): "${altText.substring(0, 80)}..."`);

    return altText;
  } catch (error: any) {
    console.error('   ❌ Error generating alt text with vision:', error.message);
    throw handleGeminiError(error, 'generate alt text with vision');
  }
}

// ============================================================================
// COLLECTION DESCRIPTION GENERATION
// ============================================================================

export interface GenerateCollectionDescriptionParams {
  collectionName: string;
  collectionHandle: string;
  existingDescription?: string;
  productCount?: number;
  collectionType?: string;
  sampleProductTitles: string[];
  sampleBrands: string[];
  focusKeyword: string;
  tone?: 'professional' | 'casual' | 'luxury';
}

/**
 * Generates an SEO-optimized collection description, meta title, and meta description.
 * Unlike product descriptions (300-500+ words with detailed structure), collection
 * descriptions are shorter (100-250 words) and target upper-funnel browsing intent.
 */
export async function generateCollectionDescription(params: GenerateCollectionDescriptionParams): Promise<{
  description: string;
  metaTitle: string;
  metaDescription: string;
}> {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please set GEMINI_API_KEY in environment.');
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const keyword = params.focusKeyword || params.collectionName;
  const tone = params.tone || 'professional';

  const toneDescriptions: Record<string, string> = {
    professional: 'authoritative, informative, industry-aware',
    casual: 'friendly, conversational, approachable',
    luxury: 'sophisticated, exclusive, aspirational'
  };

  const prompt = `You are an expert e-commerce SEO copywriter specializing in Shopify collection pages for a fashion/denim retailer.

Collection Information:
- Collection Name: "${params.collectionName}"
- URL Handle: /collections/${params.collectionHandle}
- Focus Keyword: "${keyword}"
- Product Count: ${params.productCount || 'Unknown'}
- Collection Type: ${params.collectionType || 'manual'}
- Tone: ${toneDescriptions[tone]}
${params.sampleProductTitles.length > 0 ? `- Sample Products in Collection:\n${params.sampleProductTitles.slice(0, 8).map(t => `  * ${t}`).join('\n')}` : ''}
${params.sampleBrands.length > 0 ? `- Brands Featured: ${params.sampleBrands.join(', ')}` : ''}
${params.existingDescription ? `- Existing Description (improve this): ${params.existingDescription}` : ''}

You must generate THREE things. Return them in this EXACT format:

COLLECTION_DESCRIPTION:
[HTML description here]

META_TITLE: [meta title here]

META_DESCRIPTION: [meta description here]

=== COLLECTION DESCRIPTION RULES ===

1. **Length**: STRICTLY 150-250 characters (NOT words). Count every character including spaces. NEVER exceed 250 characters. This is a collection/category page, not a product page. Keep it concise - 2-3 short sentences maximum.
2. **Search Intent**: Upper-funnel browsing intent. Shoppers are exploring options, not ready to buy a specific item.
3. **Structure** (HTML):
   - Single <p> tag wrapping the entire description (NO multiple paragraphs - keep it to 1 paragraph)
   - Include "${keyword}" in the first 10 words
   - 2-3 short sentences describing the collection and what shoppers will find
   - End with a soft CTA using "Shop", "Browse", "Explore", or "Discover". Do NOT use hard-sell language.
   - NO bullet lists, NO multiple paragraphs - the 250 character limit is too short for those.

4. **Keyword Usage**:
   - Use exact focus keyword "${keyword}" 1-2 times total (not more - the description is only 250 chars)
   - Keep it natural, do not force keywords

5. **HTML Format**:
   - Wrap entire description in a single <p> tag
   - Use <strong> sparingly (1 use max for the keyword)
   - NO <h1>, <h2>, <h3>, <ul>, <li>, <details>, <summary> tags
   - The entire output must be under 250 characters including HTML tags

6. **Tone and Voice**:
   - Use "you" language directed at the shopper
   - Active voice only
   - Short sentences (max 15 words each)
   - No jargon, no filler phrases, no generic category definitions
   - Do NOT mention specific product prices
   - Be specific to this collection, not generic text

7. **CRITICAL CHARACTER COUNT**:
   - Count the final HTML output including tags
   - MUST be between 150-250 characters total
   - If it exceeds 250 characters, shorten it before returning

=== META TITLE RULES ===

- Length: 50-60 characters exactly (count every character including spaces)
- Format: [Primary Keyword] - [Differentiator] | [Store Name]
- Include focus keyword "${keyword}" within the first 5 words
- Must be compelling for click-through from search results
- Use Title Case

=== META DESCRIPTION RULES ===

- Length: 120-156 characters exactly (count every character including spaces)
- Include focus keyword "${keyword}" in the first sentence
- MUST include a CTA verb: "Shop", "Browse", "Discover", "Explore", or "Find"
- Mention 1 key differentiator (variety, brands, quality, styles)
- Use sentence case (normal capitalization)
- Must entice clicks from the search results page

Return ONLY in the specified format. No markdown code fences, no explanations, no extra text.`;

  try {
    console.log(`🎨 Generating collection description for: "${params.collectionName}"`);
    console.log(`   Keyword: "${keyword}", Products: ${params.productCount || 'unknown'}, Brands: ${params.sampleBrands.length}`);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the structured response
    const descMatch = text.match(/COLLECTION_DESCRIPTION:\s*([\s\S]*?)(?=META_TITLE:)/i);
    const titleMatch = text.match(/META_TITLE:\s*(.+)/i);
    const metaDescMatch = text.match(/META_DESCRIPTION:\s*(.+)/i);

    let description = descMatch ? descMatch[1].trim() : '';
    const metaTitle = titleMatch ? titleMatch[1].trim() : '';
    const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : '';

    // Clean up description - remove markdown code fences if present
    description = description.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

    if (!description) {
      throw new Error('Failed to parse collection description from AI response.');
    }

    // If meta fields are missing, generate reasonable defaults
    const finalMetaTitle = metaTitle || `${params.collectionName} | Shop Now`;
    const finalMetaDescription = metaDescription || `Browse our ${params.collectionName.toLowerCase()} collection. Shop ${params.sampleBrands.slice(0, 2).join(' & ') || 'premium styles'} today.`;

    console.log(`   ✅ Collection description generated (${description.split(/\s+/).length} words)`);
    console.log(`   ✅ Meta title: "${finalMetaTitle}" (${finalMetaTitle.length} chars)`);
    console.log(`   ✅ Meta description: "${finalMetaDescription}" (${finalMetaDescription.length} chars)`);

    return {
      description,
      metaTitle: finalMetaTitle,
      metaDescription: finalMetaDescription,
    };
  } catch (error: any) {
    throw handleGeminiError(error, 'generate collection description');
  }
}
