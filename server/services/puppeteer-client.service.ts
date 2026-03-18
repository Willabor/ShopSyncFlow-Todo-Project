/**
 * Puppeteer Microservice Client
 *
 * HTTP client for the standalone Puppeteer microservice running on port 7000.
 * Handles size chart extraction from brand websites.
 */

const PUPPETEER_SERVICE_URL = process.env.PUPPETEER_SERVICE_URL || 'http://localhost:7000';

export interface PuppeteerSizeChartResponse {
  success: boolean;
  sizeChartUrl?: string; // Image URL (fallback)
  sizeChart?: any; // Structured data or multi-category object
  method?: string;
  error?: string;
  metadata?: {
    extractionTime: number;
    buttonText?: string;
    modalDetected?: boolean;
    fromGlobalGuide?: boolean;
    guideUrl?: string;
    guessed?: boolean;
    networkUrl?: string;
  };
}

/**
 * Extract size chart from a product URL using Puppeteer
 */
export async function extractSizeChartViaPuppeteer(
  productUrl: string
): Promise<PuppeteerSizeChartResponse> {
  try {
    console.log(`🎭 Puppeteer: Extracting size chart from ${productUrl}`);

    const response = await fetch(`${PUPPETEER_SERVICE_URL}/api/size-chart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productUrl }),
    });

    if (!response.ok) {
      throw new Error(`Puppeteer service returned ${response.status}: ${response.statusText}`);
    }

    const result: PuppeteerSizeChartResponse = await response.json();

    if (result.success) {
      console.log(`✅ Puppeteer: Size chart extracted via ${result.method}`);
      console.log(`   Extraction time: ${result.metadata?.extractionTime}ms`);

      if (result.sizeChart) {
        console.log(`   Structured data: ${Object.keys(result.sizeChart).join(', ')}`);
      } else if (result.sizeChartUrl) {
        console.log(`   Image URL: ${result.sizeChartUrl}`);
      }
    } else {
      console.log(`❌ Puppeteer: ${result.error || 'No size chart found'}`);
    }

    return result;
  } catch (error) {
    console.error('❌ Puppeteer service error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calling Puppeteer service',
    };
  }
}

/**
 * Check if Puppeteer service is available
 */
export async function checkPuppeteerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PUPPETEER_SERVICE_URL}/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const health = await response.json();
    return health.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Convert structured size chart data to HTML table
 */
function convertToHtmlTable(chartData: any): string {
  if (!chartData || !chartData.sizes) {
    return '<p>No size data available</p>';
  }

  const { sizes, measurements, note } = chartData;

  // Build table headers (Size + measurement types)
  const measurementTypes = Object.keys(measurements || {});
  const headers = ['Size', ...measurementTypes.map(t =>
    t.charAt(0).toUpperCase() + t.slice(1)
  )];

  // Build table rows
  let html = '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">\n';
  html += '  <thead>\n    <tr>\n';
  headers.forEach(header => {
    html += `      <th style="background-color: #f0f0f0; padding: 8px; text-align: left;">${header}</th>\n`;
  });
  html += '    </tr>\n  </thead>\n';

  html += '  <tbody>\n';
  sizes.forEach((size: string, index: number) => {
    html += '    <tr>\n';
    html += `      <td style="padding: 8px; border: 1px solid #ddd;"><strong>${size}</strong></td>\n`;

    measurementTypes.forEach(type => {
      const value = measurements[type]?.[index] || '-';
      html += `      <td style="padding: 8px; border: 1px solid #ddd;">${value}"</td>\n`;
    });

    html += '    </tr>\n';
  });
  html += '  </tbody>\n';
  html += '</table>\n';

  if (note) {
    html += `<p style="font-size: 0.9em; font-style: italic; margin-top: 10px;">${note}</p>\n`;
  }

  return html;
}

/**
 * Format Puppeteer size chart response for ShopSyncFlow
 * Converts Puppeteer's response format to ShopSyncFlow's expected format
 */
export function formatSizeChartForShopSync(
  puppeteerResponse: PuppeteerSizeChartResponse
): {
  rawHtml?: string;
  parsedTables?: Record<string, string>;
  note?: string;
  sampleImageUrl?: string;
  sourceUrl?: string;
  method?: string;
} {
  if (!puppeteerResponse.success) {
    return {};
  }

  // If we have structured size chart data (multi-category or single)
  if (puppeteerResponse.sizeChart) {
    const sizeChart = puppeteerResponse.sizeChart;

    // Check if it's a multi-category chart (men/women/kids)
    const hasMultipleCategories =
      typeof sizeChart === 'object' &&
      !sizeChart.sizes &&
      Object.keys(sizeChart).some(key =>
        ['men', 'women', 'kids', 'unisex', 'boys', 'girls'].includes(key.toLowerCase())
      );

    if (hasMultipleCategories) {
      // Multi-category chart: { men: {...}, women: {...} }
      const parsedTables: Record<string, string> = {};

      for (const [category, chartData] of Object.entries(sizeChart)) {
        // Convert structured chart data to HTML table
        parsedTables[category] = convertToHtmlTable(chartData);
      }

      return {
        parsedTables,
        note: puppeteerResponse.metadata?.fromGlobalGuide
          ? `Extracted from global size guide page via ${puppeteerResponse.method}`
          : `Extracted via ${puppeteerResponse.method}`,
        sourceUrl: puppeteerResponse.metadata?.guideUrl || puppeteerResponse.metadata?.networkUrl,
        method: puppeteerResponse.method,
      };
    } else {
      // Single chart with sizes array
      return {
        parsedTables: {
          'generic': convertToHtmlTable(sizeChart),
        },
        note: puppeteerResponse.sizeChart.note,
        sourceUrl: puppeteerResponse.metadata?.guideUrl || puppeteerResponse.metadata?.networkUrl,
        method: puppeteerResponse.method,
      };
    }
  }

  // If we only have an image URL (fallback)
  if (puppeteerResponse.sizeChartUrl) {
    return {
      sampleImageUrl: puppeteerResponse.sizeChartUrl,
      note: `Size chart image extracted via ${puppeteerResponse.method}`,
      method: puppeteerResponse.method,
    };
  }

  return {};
}
