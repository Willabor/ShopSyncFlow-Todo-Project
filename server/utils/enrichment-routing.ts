/**
 * Brand-enrichment layer routing helpers.
 *
 * The enrichment pipeline selects a pre-chosen product differently per layer:
 *   - Layer 1 (Shopify JSON API): productHandle is a Shopify slug, e.g. "p001-electric".
 *   - Layer 2 (generic scraper):  productHandle is a full URL, e.g.
 *     "https://brand.com/products/p001-electric".
 *
 * When a Shopify-typed vendor's matches were actually produced by Layer 2, the
 * selected handle is a full URL. Routing it into Layer 1's exact-slug matcher
 * fails with "Product with handle ... not found" instead of falling through to
 * Layer 2. These helpers centralize that routing decision so it stays testable.
 */

/**
 * A productHandle that is a full URL (starts with http/https) is a Layer 2
 * selection, not a Shopify slug.
 */
export function isFullUrlHandle(productHandle?: string | null): boolean {
  return !!productHandle && productHandle.startsWith("http");
}

/**
 * Layer 1 (Shopify JSON API) should run only for Shopify-typed vendors AND only
 * when productHandle is a Shopify slug — never for a full-URL (Layer 2) handle.
 */
export function shouldRunShopifyLayer(
  websiteType: string | null | undefined,
  productHandle?: string | null,
): boolean {
  return websiteType === "shopify" && !isFullUrlHandle(productHandle);
}
