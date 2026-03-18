/**
 * Shared OpenRouter Fallback Utility
 *
 * Provides text and vision fallback functions when Gemini API quota is exhausted.
 * Used across all AI services as a consistent fallback mechanism.
 */

/**
 * Check if an error is a Gemini quota/rate-limit/overload error
 */
export function isGeminiQuotaError(error: any): boolean {
  const msg = error?.message || '';
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Daily Limit') || msg.includes('503') || msg.includes('overloaded') ||
    msg === 'GEMINI_TIMEOUT';
}

/**
 * Default model for OpenRouter text fallback.
 * Using google/gemini-2.0-flash-001 - fast, reliable, non-thinking model.
 * Avoid "thinking" models (kimi-k2.5, deepseek-r1) as they consume tokens
 * on internal reasoning and often return empty content.
 */
const DEFAULT_TEXT_MODEL = 'google/gemini-2.0-flash-001';
const OPENROUTER_TIMEOUT_MS = 30000; // 30-second timeout

/**
 * Call OpenRouter API with a text prompt
 */
export async function callOpenRouterText(prompt: string, maxTokens: number = 2000): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter fallback not configured. Set OPENROUTER_API_KEY in environment.');
  }

  const model = process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_TEXT_MODEL;
  console.log(`[OpenRouter] Calling model=${model}, max_tokens=${maxTokens}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://tasks.nexusdenim.com',
        'X-Title': 'ShopSyncFlow',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenRouter API error: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      console.warn('[OpenRouter] API returned empty content. finish_reason:', data.choices?.[0]?.finish_reason);
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call OpenRouter API with a vision prompt (image + text)
 */
export async function callOpenRouterVision(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  maxTokens: number = 8192
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter fallback not configured. Set OPENROUTER_API_KEY in environment.');
  }

  // Use a vision-capable model via OpenRouter
  const model = 'google/gemini-2.0-flash-001';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tasks.nexusdenim.com',
      'X-Title': 'ShopSyncFlow',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt }
        ]
      }]
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter Vision API error: ${errData.error?.message || response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    console.warn('[OpenRouter Vision] API returned empty content');
  }
  return content;
}
