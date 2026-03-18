/**
 * Size Chart AI Analyzer Service
 *
 * Uses Google Gemini Vision API to analyze uploaded size chart images
 * and extract structured measurement data.
 */

import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================================================
// Types
// ============================================================================

export interface SizeChartAnalysisResult {
  success: boolean;
  parsedTables?: Record<string, string>; // HTML tables by category
  fitGuidance?: string;
  confidence?: number;
  warnings?: string[];
  error?: string;
  rawAIResponse?: any; // Store full AI response for debugging
}

interface AIExtractedData {
  sizes: string[];
  measurements: Record<string, string[]>;
  unit: string;
  fitGuidance?: string;
  confidence?: number;
  warnings?: string[];
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze a size chart image using Gemini Vision API
 *
 * @param imageFilePath - Absolute path to the uploaded image file
 * @param category - Category (Tops, Bottoms, Outerwear, etc.)
 * @returns Structured size chart data
 */
export async function analyzeSizeChartImage(
  imageFilePath: string,
  category: string
): Promise<SizeChartAnalysisResult> {
  try {
    console.log(`[AI Analyzer] Starting analysis for category: ${category}`);
    console.log(`[AI Analyzer] Image path: ${imageFilePath}`);

    // 1. Validate file exists
    if (!fs.existsSync(imageFilePath)) {
      return {
        success: false,
        error: 'Image file not found'
      };
    }

    // 2. Read image as base64
    const imageBuffer = fs.readFileSync(imageFilePath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = getMimeType(imageFilePath);

    console.log(`[AI Analyzer] Image loaded, size: ${imageBuffer.length} bytes, type: ${mimeType}`);

    // 3. Build the prompt
    const prompt = buildAnalysisPrompt(category);

    // 4. Try Gemini first, fall back to OpenRouter if quota exhausted
    let text: string | undefined;

    const geminiKey = process.env.GEMINI_API_KEY;
    let geminiError: string | null = null;

    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        console.log('[AI Analyzer] Sending request to Gemini Vision API...');

        const result = await model.generateContent([
          { inlineData: { mimeType, data: imageBase64 } },
          prompt
        ]);

        text = result.response.text();
        console.log('[AI Analyzer] Received response from Gemini');
      } catch (gemErr: any) {
        geminiError = gemErr.message || 'Unknown Gemini error';
        const isQuotaError = geminiError!.includes('429') || geminiError!.includes('quota') ||
          geminiError!.includes('RESOURCE_EXHAUSTED') || geminiError!.includes('503') ||
          geminiError!.includes('overloaded');

        if (!isQuotaError) {
          // Non-quota error, don't fallback
          return { success: false, error: `AI analysis failed: ${geminiError}` };
        }

        console.log(`[AI Analyzer] Gemini quota exceeded, trying OpenRouter fallback...`);
      }
    }

    // 5. OpenRouter vision fallback
    if (!text) {
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterKey) {
        return {
          success: false,
          error: geminiError
            ? `Gemini quota exceeded and no OpenRouter fallback configured. Set OPENROUTER_API_KEY.`
            : 'No AI service configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY.'
        };
      }

      console.log('[AI Analyzer] Sending request to OpenRouter Vision API...');

      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://tasks.nexusdenim.com',
          'X-Title': 'ShopSyncFlow',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          max_tokens: 8192,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              { type: 'text', text: prompt }
            ]
          }]
        }),
      });

      if (!openRouterResponse.ok) {
        const errData = await openRouterResponse.json().catch(() => ({}));
        return {
          success: false,
          error: `OpenRouter Vision API error: ${errData.error?.message || openRouterResponse.status}`
        };
      }

      const orData = await openRouterResponse.json();
      text = orData.choices?.[0]?.message?.content || '';

      if (!text) {
        console.warn('[AI Analyzer] OpenRouter returned empty content');
        return { success: false, error: 'OpenRouter Vision returned empty response' };
      }

      console.log(`[AI Analyzer] Received response from OpenRouter (${text.length} chars)`);
    }

    console.log('[AI Analyzer] Response length:', text.length, 'characters');
    console.log('[AI Analyzer] Full AI Response:');
    console.log('==================');
    console.log(text);
    console.log('==================');

    // 6. Parse the AI response
    const extractedData = parseAIResponse(text);

    if (!extractedData) {
      return {
        success: false,
        error: 'Failed to parse AI response. The image may be too complex or unclear.',
        rawAIResponse: text
      };
    }

    // 7. Validate extracted data
    const validation = validateExtractedData(extractedData);
    if (!validation.valid) {
      return {
        success: false,
        error: `Data validation failed: ${validation.errors?.join(', ')}`,
        warnings: extractedData.warnings,
        rawAIResponse: text
      };
    }

    // 8. Convert to HTML table format
    const htmlTable = generateHTMLTable(extractedData, category);

    console.log('[AI Analyzer] Analysis completed successfully');

    return {
      success: true,
      parsedTables: {
        [category]: htmlTable
      },
      fitGuidance: extractedData.fitGuidance,
      confidence: extractedData.confidence || 0.8,
      warnings: extractedData.warnings || [],
      rawAIResponse: extractedData
    };

  } catch (error: any) {
    console.error('[AI Analyzer] Error during analysis:', error);
    return {
      success: false,
      error: `AI analysis failed: ${error.message}`
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the analysis prompt for Gemini
 */
function buildAnalysisPrompt(category: string): string {
  return `You are analyzing a clothing size chart image for the "${category}" category.

**Your task:** Extract ALL size information from this image as structured JSON data.

**IMPORTANT - CHILDREN'S vs ADULT SIZING:**
- **ADULT sizes**: XS, S, M, L, XL, 2XL, 3XL OR numeric waist sizes (28, 30, 32, 34)
- **CHILDREN'S sizes**: Age-based numbers (2, 3, 4, 5, 6, 7 for toddlers/kids; 8, 10, 12, 14, 16 for youth/boys/girls)
- **Children's measurements**: May include Height (total body height) - this is NORMAL for kids' sizing
- **Multiple tables**: If image shows multiple size ranges (e.g., "KIDS SIZES" + "BOYS SIZES"), extract BOTH tables

**Instructions:**
1. Identify all size labels:
   - ADULT: XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL OR numeric sizes like 28, 30, 32
   - CHILDREN: Age numbers 2-16 (check for labels like "KIDS SIZES", "BOYS SIZES", "GIRLS SIZES", "TODDLER SIZES")
2. Extract ALL measurement types shown - **EVEN IF THERE'S ONLY ONE ROW OF MEASUREMENTS**
   Common measurements:
   - ADULT: waist, hip, length, chest, inseam, sleeve, shoulder, neck, rise, thigh, leg opening
   - CHILDREN: waist, hip, chest, leg length, height (total body height is VALID for kids)
3. Extract the numeric values for EACH size and EACH measurement type
4. Detect the measurement unit (inches or cm) - default to inches if not specified
5. **CRITICAL - DIAGRAMS**: If there's a diagram/illustration showing measurement points:
   - **ONLY** extract letter labels if they ACTUALLY EXIST in the image (e.g., "A", "B", "C")
   - **DO NOT** create letter labels if the diagram uses actual measurement names (e.g., "CHEST", "WAIST")
   - If letter labels exist, identify what they represent by looking at where the arrows point
   - Include explanation in fitGuidance ONLY if letter labels are present: "Measurement Guide: A = [description], B = [description]"
   - **IMPORTANT**: Do not hallucinate or make up letter labels that are not in the image
6. **CRITICAL**: Extract ALL text from the image, including:
   - Fit guidance (e.g., "True to size", "Relaxed fit", "Runs small")
   - Notes and disclaimers (often marked with * or in smaller font)
   - Measurement context (e.g., "body measurements", "garment measurements", "Measurements shown in size guide refer to body measurements and not garment measurements")
   - Any other text that provides sizing guidance
7. Provide a confidence score (0.0 to 1.0) based on image clarity
8. Note any warnings if the image is unclear or data is ambiguous
9. **MULTIPLE TABLES**: If the image contains multiple size tables (e.g., "Kids" and "Boys"), extract BOTH tables and indicate which is which

**TABLE STRUCTURE EXAMPLES:**

**Example 1: Simple 2-row table (SIZE + ONE measurement)**
If you see:
SIZE | S   | M   | L   | XL
HIP  | 37  | 39  | 41  | 44½

Extract as:
{
  "sizes": ["S", "M", "L", "XL"],
  "measurements": {
    "hip": ["37", "39", "41", "44½"]
  },
  ...
}

**Example 2: Multi-row table (SIZE + MULTIPLE measurements)**
If you see:
SIZE   | S  | M  | L  | XL
WAIST  | 30 | 32 | 34 | 36
LENGTH | 28 | 29 | 30 | 31

Extract as:
{
  "sizes": ["S", "M", "L", "XL"],
  "measurements": {
    "waist": ["30", "32", "34", "36"],
    "length": ["28", "29", "30", "31"]
  },
  ...
}

**Example 3: Table with letter labels AND diagram**
If you see:
- A diagram showing a garment with measurement points labeled A, B, C
- Table with headers: SIZE | A | B | C
- The diagram shows: A pointing to waist, B pointing to inseam, C pointing to hip

Extract as:
{
  "sizes": ["XS", "S", "M", "L"],
  "measurements": {
    "a": ["27-28\"", "29-30\"", "31-32\"", "33-34\""],
    "b": ["31-33\"", "31-33\"", "31-33\"", "31-33\""],
    "c": ["38", "40", "42", "44"]
  },
  "unit": "inches",
  "fitGuidance": "Measurement Guide: A = Waist (measure around natural waistline), B = Inseam (inside leg from crotch to ankle), C = Hip (measure around fullest part of hips). All measurements in inches.",
  ...
}

**Example 4: CHILDREN'S SIZE CHART (multiple tables in one image)**
If you see:
- KIDS SIZES header with columns: Size | 2 | 3 | 4 | 5 | 6 | 7
- BOYS SIZES header with columns: Size | 8 | 10 | 12 | 14 | 16
- Measurement rows: Chest, Waist, Leg length, Height
- Diagram showing child with measurement points labeled "CHEST", "WAIST", "LEG LENGTH" (NOT A, B, C)
- Note: "Measurements shown in size guide refer to body measurements and not garment measurements."

Extract as:
{
  "sizes": ["2", "3", "4", "5", "6", "7", "8", "10", "12", "14", "16"],
  "measurements": {
    "chest": ["20½", "21", "22", "23", "24", "25½", "26½", "27½", "28½", "30½", "32"],
    "waist": ["21", "21½", "22", "22½", "23", "23½", "24½", "25½", "26½", "28", "29½"],
    "leg_length": ["14", "15⅝", "17⅛", "18¾", "20¼", "23¼", "24¼", "25½", "27⅜", "29¾", "31"],
    "height": ["35", "38", "41", "44", "46½", "49½", "52", "55½", "58½", "61½", "64"]
  },
  "unit": "inches",
  "fitGuidance": "Measurements shown in size guide refer to body measurements and not garment measurements.",
  "confidence": 0.95,
  "warnings": []
}

**IMPORTANT NOTE FOR CHILDREN'S CHARTS:**
- Age-based sizes (2, 3, 4... 16) are VALID - do not reject them
- Height measurement is NORMAL for children's sizing - do not flag as error
- Multiple size ranges (Kids + Boys) should be COMBINED into one unified output
- Keep all measurements across both tables - they should align perfectly

**IMPORTANT:**
- Return ONLY valid JSON, no markdown code blocks or extra text
- All measurement arrays MUST have the same length as the sizes array
- If a cell is empty or unclear, use "N/A" as the value
- Be precise with numbers, preserve fractions like ½, ¼, ¾ exactly as shown
- **ALWAYS extract measurement row labels** (HIP, WAIST, CHEST, A, B, C, etc.) - these become keys in the measurements object
- **ALWAYS extract ALL rows**, even if there's only one measurement row
- **ALWAYS extract text notes** - look for asterisks (*), smaller font, or text below/around the table
- **ALWAYS check for diagrams/illustrations** - if you see a garment diagram with labeled measurement points (A, B, C, etc.), explain what each letter represents in the fitGuidance field
- Combine all text notes and diagram explanations into the fitGuidance field

**Output format (JSON only):**
{
  "sizes": ["S", "M", "L", "XL"],
  "measurements": {
    "waist": ["30", "32", "34", "36"],
    "hip": ["37", "39", "41", "44"]
  },
  "unit": "inches",
  "fitGuidance": "Measurements are body measurements, not garment measurements.",
  "confidence": 0.95,
  "warnings": []
}

**Begin analysis now. Look carefully at EVERY row in the table. Return only the JSON object.**`;
}

/**
 * Normalize measurement values to fix common OCR errors
 */
function normalizeMeasurementValue(value: string): string {
  return value
    // Common OCR errors for ½ (half)
    .replace(/%/g, '½')        // % often confused with ½
    .replace(/⅝/g, '½')        // ⅝ confused with ½
    .replace(/⅜/g, '½')        // ⅜ confused with ½
    // Keep valid fractions as-is
    .replace(/¼/g, '¼')        // Quarter
    .replace(/¾/g, '¾')        // Three quarters
    // Handle decimal alternatives
    .replace(/\.5/g, '½')      // Convert .5 to ½ for consistency
    .trim();
}

/**
 * Parse the AI response text to extract structured data
 */
function parseAIResponse(text: string): AIExtractedData | null {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.trim();

    // Remove ```json and ``` markers
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.slice(0, -3);
    }

    cleanText = cleanText.trim();

    // Parse JSON
    const data = JSON.parse(cleanText);

    // Validate required fields
    if (!data.sizes || !Array.isArray(data.sizes)) {
      console.error('[AI Analyzer] Missing or invalid sizes array');
      return null;
    }

    if (!data.measurements || typeof data.measurements !== 'object') {
      console.error('[AI Analyzer] Missing or invalid measurements object');
      return null;
    }

    // Normalize measurement values to fix common OCR errors
    const normalizedMeasurements: Record<string, string[]> = {};
    for (const [measurementType, values] of Object.entries(data.measurements)) {
      normalizedMeasurements[measurementType] = (values as string[]).map(normalizeMeasurementValue);
    }

    return {
      sizes: data.sizes,
      measurements: normalizedMeasurements,
      unit: data.unit || 'inches',
      fitGuidance: data.fitGuidance,
      confidence: data.confidence,
      warnings: data.warnings || []
    };

  } catch (error: any) {
    console.error('[AI Analyzer] Failed to parse AI response:', error.message);
    console.error('[AI Analyzer] Response text:', text.substring(0, 500));
    return null;
  }
}

/**
 * Validate extracted data structure
 */
function validateExtractedData(data: AIExtractedData): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  // Check sizes array
  if (!data.sizes || data.sizes.length === 0) {
    errors.push('No sizes detected');
  }

  // Check measurements
  if (!data.measurements || Object.keys(data.measurements).length === 0) {
    errors.push('No measurements detected');
  }

  // Check that all measurement arrays have the same length as sizes
  const expectedLength = data.sizes.length;
  for (const [key, values] of Object.entries(data.measurements)) {
    if (values.length !== expectedLength) {
      errors.push(`Measurement "${key}" has ${values.length} values, expected ${expectedLength}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Generate HTML table from extracted data
 */
function generateHTMLTable(data: AIExtractedData, category: string): string {
  const { sizes, measurements, unit } = data;

  // Build table header
  let html = '<table class="size-chart-table">\n';
  html += '  <thead>\n';
  html += '    <tr>\n';
  html += `      <th>Size</th>\n`;

  // Add measurement headers
  for (const measurementName of Object.keys(measurements)) {
    const displayName = measurementName.charAt(0).toUpperCase() + measurementName.slice(1);
    html += `      <th>${displayName} (${unit})</th>\n`;
  }

  html += '    </tr>\n';
  html += '  </thead>\n';
  html += '  <tbody>\n';

  // Build table rows
  for (let i = 0; i < sizes.length; i++) {
    html += '    <tr>\n';
    html += `      <td><strong>${sizes[i]}</strong></td>\n`;

    // Add measurement values
    for (const values of Object.values(measurements)) {
      html += `      <td>${values[i]}</td>\n`;
    }

    html += '    </tr>\n';
  }

  html += '  </tbody>\n';
  html += '</table>\n';

  return html;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };

  return mimeTypes[ext] || 'image/jpeg';
}
