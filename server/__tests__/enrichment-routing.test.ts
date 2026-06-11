import { describe, it, expect } from 'vitest';
import { isFullUrlHandle, shouldRunShopifyLayer } from '../utils/enrichment-routing';

describe('enrichment-routing', () => {
  describe('isFullUrlHandle', () => {
    it('treats a full https URL as a Layer 2 handle', () => {
      expect(isFullUrlHandle('https://purple-brand.com/products/p001-electric')).toBe(true);
    });

    it('treats a plain http URL as a Layer 2 handle', () => {
      expect(isFullUrlHandle('http://brand.com/products/p001')).toBe(true);
    });

    it('treats a Shopify slug as NOT a full-URL handle', () => {
      expect(isFullUrlHandle('p001-electric')).toBe(false);
    });

    it('returns false for empty / nullish handles', () => {
      expect(isFullUrlHandle('')).toBe(false);
      expect(isFullUrlHandle(undefined)).toBe(false);
      expect(isFullUrlHandle(null)).toBe(false);
    });
  });

  describe('shouldRunShopifyLayer', () => {
    // Regression: a Shopify vendor whose match came from Layer 2 carries a full
    // URL handle. Layer 1 must be skipped so it falls through to Layer 2 instead
    // of failing with "Product with handle ... not found".
    it('does NOT run Layer 1 for a Shopify vendor when the handle is a full URL', () => {
      expect(
        shouldRunShopifyLayer('shopify', 'https://purple-brand.com/products/p001-electric'),
      ).toBe(false);
    });

    it('runs Layer 1 for a Shopify vendor with a real slug handle', () => {
      expect(shouldRunShopifyLayer('shopify', 'p001-electric')).toBe(true);
    });

    it('runs Layer 1 for a Shopify vendor with no pre-selected handle', () => {
      expect(shouldRunShopifyLayer('shopify', undefined)).toBe(true);
      expect(shouldRunShopifyLayer('shopify', '')).toBe(true);
    });

    it('never runs Layer 1 for a non-Shopify vendor', () => {
      expect(shouldRunShopifyLayer('custom', 'p001-electric')).toBe(false);
      expect(shouldRunShopifyLayer(null, 'p001-electric')).toBe(false);
      expect(shouldRunShopifyLayer(undefined, 'p001-electric')).toBe(false);
    });
  });
});
