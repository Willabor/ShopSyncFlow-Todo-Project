/**
 * Seed Script: Platform AI Templates
 *
 * Creates default platform-level prompt templates for all tenants.
 * Run with: npx tsx scripts/seed-ai-templates.ts
 */

import { db } from "../server/db";
import { platformPromptTemplates } from "../shared/schema";
import { eq } from "drizzle-orm";

// Platform default templates
const DEFAULT_TEMPLATES = [
  {
    slug: "product-description",
    name: "Product Description Generator",
    description: "Generates compelling product descriptions for e-commerce listings",
    category: "content",
    templateContent: `Write a compelling product description for the following item:

Product Name: {{product_name}}
Brand: {{brand | default("Unknown")}}
Category: {{category}}
Key Features: {{features | default("N/A")}}
Material: {{material | default("N/A")}}
Target Audience: {{target_audience | default("General consumers")}}

Requirements:
- Write 2-3 paragraphs
- Highlight key benefits and features
- Use persuasive, engaging language
- Include relevant keywords naturally
- End with a subtle call-to-action`,
    systemPrompt: "You are an expert e-commerce copywriter specializing in fashion and apparel. Write product descriptions that are engaging, SEO-friendly, and conversion-focused. Use a professional but approachable tone.",
    variables: JSON.stringify([
      { name: "product_name", type: "text", required: true, description: "The name of the product" },
      { name: "brand", type: "text", required: false, default: "", description: "Brand name" },
      { name: "category", type: "text", required: true, description: "Product category" },
      { name: "features", type: "textarea", required: false, description: "Key product features" },
      { name: "material", type: "text", required: false, description: "Material composition" },
      { name: "target_audience", type: "text", required: false, description: "Target customer segment" }
    ]),
    defaultModel: "gemini-1.5-flash",
    defaultTemperature: "0.7",
    maxTokens: 1000,
    outputFormat: "text" as const
  },
  {
    slug: "bullet-points",
    name: "SEO Bullet Points Generator",
    description: "Creates SEO-optimized bullet points highlighting product features",
    category: "seo",
    templateContent: `Generate 5-7 SEO-optimized bullet points for this product:

Product: {{product_name}}
Category: {{category}}
Features: {{features}}
Benefits: {{benefits | default("N/A")}}

Requirements:
- Start each bullet with a strong action word or benefit
- Include relevant keywords naturally
- Keep each bullet under 150 characters
- Focus on customer benefits, not just features
- Make them scannable and easy to read`,
    systemPrompt: "You are an SEO specialist creating bullet points for e-commerce product listings. Focus on search visibility while maintaining readability and conversion potential.",
    variables: JSON.stringify([
      { name: "product_name", type: "text", required: true, description: "Product name" },
      { name: "category", type: "text", required: true, description: "Product category" },
      { name: "features", type: "textarea", required: true, description: "List of product features" },
      { name: "benefits", type: "textarea", required: false, description: "Key customer benefits" }
    ]),
    defaultModel: "gemini-1.5-flash",
    defaultTemperature: "0.5",
    maxTokens: 500,
    outputFormat: "text" as const
  },
  {
    slug: "meta-title",
    name: "SEO Meta Title Generator",
    description: "Creates optimized meta titles for product pages",
    category: "seo",
    templateContent: `Generate an SEO-optimized meta title for this product page:

Product: {{product_name}}
Brand: {{brand}}
Category: {{category}}
Primary Keyword: {{keyword | default("")}}

Requirements:
- Maximum 60 characters
- Include the brand name
- Include primary keyword if provided
- Make it compelling and click-worthy
- Follow SEO best practices`,
    systemPrompt: "You are an SEO expert specializing in e-commerce meta tags. Create concise, keyword-rich titles that maximize click-through rates from search results.",
    variables: JSON.stringify([
      { name: "product_name", type: "text", required: true },
      { name: "brand", type: "text", required: true },
      { name: "category", type: "text", required: true },
      { name: "keyword", type: "text", required: false }
    ]),
    defaultModel: "gemini-1.5-flash",
    defaultTemperature: "0.3",
    maxTokens: 100,
    outputFormat: "text" as const
  },
  {
    slug: "meta-description",
    name: "SEO Meta Description Generator",
    description: "Creates compelling meta descriptions for product pages",
    category: "seo",
    templateContent: `Generate an SEO-optimized meta description for this product:

Product: {{product_name}}
Brand: {{brand}}
Category: {{category}}
Key Selling Point: {{selling_point | default("Quality and style")}}

Requirements:
- 150-160 characters
- Include a call-to-action
- Highlight the main benefit
- Use active voice
- Be compelling enough to drive clicks`,
    systemPrompt: "You are an SEO copywriter creating meta descriptions that drive clicks from search results. Balance keyword optimization with compelling copy that converts.",
    variables: JSON.stringify([
      { name: "product_name", type: "text", required: true },
      { name: "brand", type: "text", required: true },
      { name: "category", type: "text", required: true },
      { name: "selling_point", type: "text", required: false }
    ]),
    defaultModel: "gemini-1.5-flash",
    defaultTemperature: "0.5",
    maxTokens: 200,
    outputFormat: "text" as const
  },
  {
    slug: "size-chart-extraction",
    name: "Size Chart Data Extractor",
    description: "Extracts structured size chart data from images or text",
    category: "extraction",
    templateContent: `Extract size chart information from the following content:

{{content}}

Instructions:
1. Identify all size options (XS, S, M, L, XL, etc. or numeric sizes)
2. Extract measurements for each size
3. Identify the measurement unit (inches, cm, etc.)
4. Note any fit recommendations

Output as structured JSON with:
- sizes: array of size labels
- measurements: object with measurement types and values per size
- unit: measurement unit
- fit_notes: any fit recommendations found`,
    systemPrompt: "You are a data extraction specialist. Parse size charts accurately and output clean, structured JSON data. Handle variations in formatting and measurement systems.",
    variables: JSON.stringify([
      { name: "content", type: "textarea", required: true, description: "Size chart content (text or OCR output)" }
    ]),
    defaultModel: "gemini-1.5-flash",
    defaultTemperature: "0.1",
    maxTokens: 1000,
    outputFormat: "json" as const
  },
  {
    slug: "category-recommendation",
    name: "Category Recommendation",
    description: "Suggests appropriate product categories based on product details",
    category: "analysis",
    templateContent: `Analyze this product and recommend the most appropriate categories:

Product Name: {{product_name}}
Description: {{description}}
Brand: {{brand | default("Unknown")}}
Material: {{material | default("Unknown")}}

Available Categories:
{{available_categories}}

Instructions:
1. Recommend the primary category
2. Suggest up to 3 secondary categories
3. Explain your reasoning briefly
4. Consider SEO implications

Output format:
- primary_category: string
- secondary_categories: array of strings
- reasoning: brief explanation`,
    systemPrompt: "You are a product categorization expert for an e-commerce platform. Make accurate category recommendations that improve product discoverability and SEO.",
    variables: JSON.stringify([
      { name: "product_name", type: "text", required: true },
      { name: "description", type: "textarea", required: true },
      { name: "brand", type: "text", required: false },
      { name: "material", type: "text", required: false },
      { name: "available_categories", type: "textarea", required: true, description: "List of available categories" }
    ]),
    defaultModel: "gemini-1.5-flash",
    defaultTemperature: "0.3",
    maxTokens: 500,
    outputFormat: "json" as const
  },
  {
    slug: "brand-about-extraction",
    name: "Brand About Section Extractor",
    description: "Extracts brand information from website content for vendor profiles",
    category: "extraction",
    templateContent: `Extract brand information from the following website content:

{{content}}

Extract and structure:
1. Brand story/history
2. Mission or values statement
3. Key brand attributes (sustainability, craftsmanship, etc.)
4. Target audience description
5. Notable achievements or certifications

Format as a cohesive brand profile paragraph suitable for a vendor page.`,
    systemPrompt: "You are a brand analyst extracting and synthesizing brand information. Create professional, engaging brand profiles that capture the essence of each brand.",
    variables: JSON.stringify([
      { name: "content", type: "textarea", required: true, description: "Scraped website content" }
    ]),
    defaultModel: "gemini-1.5-pro",
    defaultTemperature: "0.5",
    maxTokens: 800,
    outputFormat: "text" as const
  }
];

async function seedTemplates() {
  console.log("Starting platform template seeding...\n");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const template of DEFAULT_TEMPLATES) {
    try {
      // Check if template already exists
      const existing = await db
        .select()
        .from(platformPromptTemplates)
        .where(eq(platformPromptTemplates.slug, template.slug))
        .limit(1);

      if (existing.length > 0) {
        // Update existing template
        await db
          .update(platformPromptTemplates)
          .set({
            name: template.name,
            description: template.description,
            category: template.category,
            templateContent: template.templateContent,
            systemPrompt: template.systemPrompt,
            variables: template.variables,
            defaultModel: template.defaultModel,
            defaultTemperature: template.defaultTemperature,
            maxTokens: template.maxTokens,
            outputFormat: template.outputFormat,
            updatedAt: new Date()
          })
          .where(eq(platformPromptTemplates.slug, template.slug));

        console.log(`  Updated: ${template.name} (${template.slug})`);
        updated++;
      } else {
        // Insert new template
        await db.insert(platformPromptTemplates).values({
          slug: template.slug,
          name: template.name,
          description: template.description,
          category: template.category,
          templateContent: template.templateContent,
          systemPrompt: template.systemPrompt,
          variables: template.variables,
          defaultModel: template.defaultModel,
          defaultTemperature: template.defaultTemperature,
          maxTokens: template.maxTokens,
          outputFormat: template.outputFormat,
          isActive: true,
          version: "1.0.0"
        });

        console.log(`  Created: ${template.name} (${template.slug})`);
        created++;
      }
    } catch (error) {
      console.error(`  Error with ${template.slug}:`, error);
      skipped++;
    }
  }

  console.log("\n========================================");
  console.log(`Seeding complete!`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log("========================================\n");

  process.exit(0);
}

// Run if called directly
seedTemplates().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
