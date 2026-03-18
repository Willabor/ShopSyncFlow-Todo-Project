/**
 * Bullet Point Generator Service
 *
 * Uses Google Gemini API to generate SEO-optimized bullet points (Sales Points)
 * for product listings. These map to Shopify metafields: custom.custom_sales_point_1
 * through custom.custom_sales_point_5
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================================================
// Types
// ============================================================================

export interface BulletPointGenerationRequest {
  /** Product title */
  title: string;
  /** Product description (HTML allowed) */
  description?: string;
  /** SEO focus keyword */
  focusKeyword?: string;
  /** Product type (e.g., "T-Shirt", "Jacket") */
  productType?: string;
  /** Brand name */
  vendor?: string;
  /** Product tags */
  tags?: string[];
  /** Existing bullet points to improve/replace */
  existingBulletPoints?: string[];
  /** Number of bullet points to generate (default 5, max 5) */
  count?: number;
}

export interface BulletPointGenerationResult {
  success: boolean;
  bulletPoints?: string[];
  error?: string;
  tokensUsed?: number;
}

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate SEO-optimized bullet points for a product
 */
export async function generateBulletPoints(
  request: BulletPointGenerationRequest
): Promise<BulletPointGenerationResult> {
  try {
    console.log(`[Bullet Points] Generating bullet points for: ${request.title}`);

    // Validate required fields
    if (!request.title || request.title.trim().length === 0) {
      return {
        success: false,
        error: "Product title is required",
      };
    }

    // Check if Gemini API key is available
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[Bullet Points] GEMINI_API_KEY not found in environment");
      return {
        success: false,
        error:
          "AI service not configured. Please set GEMINI_API_KEY environment variable.",
      };
    }

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build the prompt
    const prompt = buildPrompt(request);

    console.log("[Bullet Points] Sending request to Gemini API...");

    // Call Gemini API
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log("[Bullet Points] Received response from Gemini");

    // Parse the response
    const bulletPoints = parseResponse(text, request.count || 5);

    if (!bulletPoints || bulletPoints.length === 0) {
      return {
        success: false,
        error: "Failed to parse AI response. Please try again.",
      };
    }

    // Validate bullet points
    const validatedBulletPoints = bulletPoints.map((bp) =>
      validateAndTruncate(bp, 250)
    );

    console.log(
      `[Bullet Points] Generated ${validatedBulletPoints.length} bullet points`
    );

    return {
      success: true,
      bulletPoints: validatedBulletPoints,
    };
  } catch (error: any) {
    console.error("[Bullet Points] Error during generation:", error);
    return {
      success: false,
      error: `AI generation failed: ${error.message}`,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the generation prompt following Amazon/SEO best practices
 * See: /volume1/docker/planning/05-shopsyncflow/Bullet-Points-Metafields/RESEARCH.md
 */
function buildPrompt(request: BulletPointGenerationRequest): string {
  const count = Math.min(request.count || 5, 5);

  // Clean HTML from description
  const cleanDescription = request.description
    ? stripHtml(request.description)
    : "";

  // Determine the focus keyword
  const focusKeyword = request.focusKeyword || request.title;

  return `You are an expert e-commerce copywriter specializing in SEO-optimized product descriptions for clothing and apparel.

Generate ${count} SEO-optimized bullet points for this product listing.

PRODUCT INFORMATION:
- Title: ${request.title}
- Brand: ${request.vendor || "Not specified"}
- Category: ${request.productType || "General"}
- Tags: ${request.tags?.slice(0, 10).join(", ") || "None"}
- Description excerpt: ${cleanDescription.substring(0, 400)}

TARGET KEYWORD: "${focusKeyword}"

STRICT REQUIREMENTS:
1. Start EACH bullet with a 2-3 word HEADER IN ALL CAPS followed by a dash " - "
2. Keep each bullet between 150-200 characters total (MAXIMUM 230 characters - do NOT exceed)
3. The FIRST bullet MUST include "${focusKeyword}" naturally in the sentence
4. Focus on customer BENEFITS, not just features
5. Use power words: premium, guaranteed, exclusive, effortless, comfortable, durable
6. Address a different customer need/benefit in each bullet
7. NO emojis, special symbols, or HTML
8. End EACH bullet with a period
9. Tone: professional and benefit-focused
10. Be CONCISE - aim for 180-200 characters, never exceed 230

CORRECT FORMAT EXAMPLES:
PREMIUM QUALITY - Crafted from genuine full-grain leather that develops a rich patina over time, ensuring your ${focusKeyword} looks better with age.
PERFECT FIT - True-to-size design with modern slim cut flatters all body types while maintaining comfort for all-day wear.
EASY CARE - Machine washable and tumble dry low, this garment maintains its shape and color wash after wash.
VERSATILE STYLE - Pairs effortlessly with jeans, chinos, or dress pants for any occasion from casual to semi-formal.
SATISFACTION GUARANTEED - Backed by our 30-day hassle-free return policy for complete peace of mind with every purchase.

WRONG FORMAT (DO NOT DO THIS):
- "Premium cotton blend" (too short, no header)
- "comfortable fabric" (no caps header, too short)
- "Best quality!" (no header, too short, no period)

OUTPUT FORMAT:
Return ONLY a JSON array of ${count} strings. Each string must follow the HEADER - description format.
No markdown, no explanation, just the JSON array:
["HEADER ONE - Full description here ending with period.", "HEADER TWO - Full description here ending with period."]

Generate ${count} bullet points now:`;
}

/**
 * Parse the AI response to extract bullet points
 */
function parseResponse(text: string, expectedCount: number): string[] | null {
  try {
    // Clean the response
    let cleanText = text.trim();

    // Remove markdown code blocks if present
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.slice(7);
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.slice(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.slice(0, -3);
    }

    cleanText = cleanText.trim();

    // Try to parse as JSON array
    const parsed = JSON.parse(cleanText);

    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => typeof item === "string" && item.trim().length > 0)
        .slice(0, expectedCount);
    }

    // If parsed is an object with a bulletPoints or similar property
    if (parsed.bulletPoints && Array.isArray(parsed.bulletPoints)) {
      return parsed.bulletPoints
        .filter((item: any) => typeof item === "string" && item.trim().length > 0)
        .slice(0, expectedCount);
    }

    return null;
  } catch (error) {
    console.error("[Bullet Points] Failed to parse response:", error);

    // Try to extract bullet points from plain text
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith("```"))
      .filter((line) => !line.startsWith("[") && !line.startsWith("]"))
      .map((line) => {
        // Remove leading numbers, dashes, bullets
        return line.replace(/^[\d\-\*\•\.]+\s*/, "").trim();
      })
      .filter((line) => line.length > 10 && line.length <= 300);

    if (lines.length >= 1) {
      return lines.slice(0, expectedCount);
    }

    return null;
  }
}

/**
 * Validate and truncate a bullet point to max length
 */
function validateAndTruncate(text: string, maxLength: number): string {
  // Clean the text
  let cleaned = text.trim();

  // Remove quotes if the entire string is wrapped
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Truncate if too long
  if (cleaned.length > maxLength) {
    // Try to truncate at a word boundary
    const truncated = cleaned.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + "...";
    }
    return truncated + "...";
  }

  return cleaned;
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
