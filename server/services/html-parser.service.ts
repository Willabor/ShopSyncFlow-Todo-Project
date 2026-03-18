/**
 * HTML Parser Service
 *
 * Parses product description HTML from brand websites to extract:
 * - Material composition (e.g., "98% Cotton, 2% Lycra")
 * - Care instructions (e.g., "Machine wash cold")
 * - Feature lists (bullet points)
 * - Model information
 */

interface ParsedProductData {
  description: string;           // Plain text description
  materialComposition?: string;  // "98% Cotton, 2% Lycra"
  careInstructions?: string;     // "Machine wash cold, tumble dry low"
  features: string[];            // ["Relaxed Flare Fit", "Elastic Waistband"]
  modelInfo?: string;            // "Model is 6' with 32\" waist, wears size M"
}

/**
 * Parse HTML product description into structured data
 */
export function parseProductDescription(htmlContent: string): ParsedProductData {
  if (!htmlContent) {
    return {
      description: '',
      features: []
    };
  }

  // Remove HTML tags for plain text description
  const plainText = stripHtml(htmlContent);

  // Extract material composition
  const materialComposition = extractMaterialComposition(htmlContent);

  // Extract care instructions
  const careInstructions = extractCareInstructions(htmlContent);

  // Extract features from list items
  const features = extractFeatures(htmlContent);

  // Extract model information
  const modelInfo = extractModelInfo(htmlContent);

  return {
    description: plainText,
    materialComposition,
    careInstructions,
    features,
    modelInfo
  };
}

/**
 * Strip HTML tags and decode entities
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // Remove styles
    .replace(/<[^>]+>/g, ' ')                                            // Remove HTML tags
    .replace(/&nbsp;/g, ' ')                                             // Decode nbsp
    .replace(/&amp;/g, '&')                                              // Decode &
    .replace(/&lt;/g, '<')                                               // Decode <
    .replace(/&gt;/g, '>')                                               // Decode >
    .replace(/&quot;/g, '"')                                             // Decode "
    .replace(/&#39;/g, "'")                                              // Decode '
    .replace(/\s+/g, ' ')                                                // Collapse whitespace
    .trim();
}

/**
 * Extract material composition (e.g., "98% Cotton, 2% Lycra")
 *
 * Patterns:
 * - "98% Cotton, 2% Lycra"
 * - "100% Polyester"
 * - "Cotton/Polyester blend"
 */
function extractMaterialComposition(html: string): string | undefined {
  const patterns = [
    // Pattern 1: Percentage-based (98% Cotton, 2% Lycra)
    /(\d+%\s*[A-Za-z]+(?:\s*,\s*\d+%\s*[A-Za-z]+)*)/,

    // Pattern 2: "100% Material"
    /(100%\s*[A-Za-z]+)/,

    // Pattern 3: "Material/Material blend"
    /([A-Za-z]+\/[A-Za-z]+\s+blend)/i,

    // Pattern 4: "Made of Material"
    /made\s+(?:of|from|with)\s+([^<\n.]+(?:cotton|polyester|lycra|elastane|nylon|wool|silk|linen)[^<\n.]*)/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Extract care instructions
 *
 * Patterns:
 * - "Machine wash cold"
 * - "Hand wash only"
 * - "Dry clean only"
 */
function extractCareInstructions(html: string): string | undefined {
  const carePatterns = [
    /(?:machine wash|hand wash|dry clean|wash cold|wash warm|tumble dry|line dry|do not bleach|iron low)[^<\n.]*/gi
  ];

  const instructions: string[] = [];

  for (const pattern of carePatterns) {
    const matchesArray = Array.from(html.matchAll(pattern));
    for (const match of matchesArray) {
      const instruction = match[0].trim();
      if (instruction && !instructions.includes(instruction)) {
        instructions.push(instruction);
      }
    }
  }

  return instructions.length > 0 ? instructions.join(', ') : undefined;
}

/**
 * Extract features from list items (<li> tags)
 * Also extracts from <br>-separated lines
 */
function extractFeatures(html: string): string[] {
  const features: string[] = [];

  // Method 1: Extract from <li> tags
  const liPattern = /<li[^>]*>(.*?)<\/li>/gi;
  let match;
  while ((match = liPattern.exec(html)) !== null) {
    const feature = stripHtml(match[1]).trim();
    if (feature && feature.length > 3 && feature.length < 200) {
      features.push(feature);
    }
  }

  // Method 2: Extract from <br>-separated lines (common in Shopify)
  if (features.length === 0) {
    const paragraphs = html.match(/<p[^>]*>(.*?)<\/p>/gi) || [];

    for (const paragraph of paragraphs) {
      const lines = paragraph.split(/<br\s*\/?>/i);

      for (const line of lines) {
        const cleanLine = stripHtml(line).trim();

        // Filter out intro text and keep feature-like lines
        if (cleanLine &&
            cleanLine.length > 5 &&
            cleanLine.length < 150 &&
            !cleanLine.toLowerCase().startsWith('the ') &&
            !cleanLine.toLowerCase().startsWith('this ') &&
            !cleanLine.toLowerCase().includes('model is')) {
          features.push(cleanLine);
        }
      }
    }
  }

  // Remove duplicates and limit to 15 features
  return Array.from(new Set(features)).slice(0, 15);
}

/**
 * Extract model information
 *
 * Patterns:
 * - "Model is 6' with 32\" waist and wears size M"
 * - "Model wears size L"
 */
function extractModelInfo(html: string): string | undefined {
  const patterns = [
    /Model\s+is\s+[^<\n.]+/i,
    /Model\s+wears\s+[^<\n.]+/i,
    /\*\s*[A-Z][a-z]+\s+is\s+\d['"][\d"]+[^<\n.]+/  // "* Cozy is 6'1\" and weighs 170 lbs..."
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return stripHtml(match[0]).trim();
    }
  }

  return undefined;
}

/**
 * Extract clean product description (first paragraph, no features)
 */
export function extractCleanDescription(html: string): string {
  // Find first <p> tag that's not a feature list
  const paragraphs = html.match(/<p[^>]*>(.*?)<\/p>/gi) || [];

  for (const paragraph of paragraphs) {
    const text = stripHtml(paragraph).trim();

    // Skip if it's a feature list (contains too many <br> or is too structured)
    if (text.length > 50 &&
        text.length < 500 &&
        !text.includes('\n') &&
        !paragraph.includes('<br')) {
      return text;
    }
  }

  // Fallback: first 300 characters
  const plainText = stripHtml(html);
  return plainText.substring(0, 300).trim();
}

/**
 * Detect if HTML contains a size chart
 */
export function hasSizeChart(html: string): boolean {
  const sizeChartIndicators = [
    /<table[^>]*>/i,
    /size\s+chart/i,
    /sizing\s+guide/i,
    /measurement/i
  ];

  return sizeChartIndicators.some(pattern => pattern.test(html));
}

/**
 * Parse size chart table from HTML
 * Returns structured size chart data if found
 */
export function parseSizeChartTable(html: string): any {
  // TODO: Implement table parsing logic
  // This would use a more sophisticated HTML parser like cheerio
  // For now, return null (will be implemented in Phase 3)
  return null;
}
