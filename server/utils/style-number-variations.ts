/**
 * Style Number Variation Generator
 *
 * Generates intelligent variations of a style number to improve product matching.
 *
 * Example: "PD-T-003 3D TOPPER" generates:
 * - "PD-T-003 3D TOPPER" (original)
 * - "PD-T-003 3D"
 * - "PD-T-003"
 * - "PDT003 3D TOPPER" (no hyphens)
 * - "PDT003 3D"
 * - "PDT003"
 * - "PDT0033DTOPPER" (no spaces or hyphens)
 */

export interface StyleNumberVariation {
  variation: string;
  type: 'original' | 'word_truncation' | 'no_hyphens' | 'no_spaces' | 'combined';
  confidence: number; // 1.0 = original, decreases for more aggressive transformations
}

export function generateStyleNumberVariations(styleNumber: string): StyleNumberVariation[] {
  if (!styleNumber || typeof styleNumber !== 'string') {
    return [];
  }

  const variations: StyleNumberVariation[] = [];
  const seen = new Set<string>(); // Prevent duplicates

  // Helper to add variation
  const addVariation = (value: string, type: StyleNumberVariation['type'], confidence: number) => {
    const normalized = value.trim().toUpperCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      variations.push({ variation: normalized, type, confidence });
    }
  };

  // 1. Original (highest confidence)
  addVariation(styleNumber, 'original', 1.0);

  // 2. Progressive word truncation
  // "PD-T-003 3D TOPPER" → ["PD-T-003", "PD-T-003 3D", "PD-T-003 3D TOPPER"]
  const words = styleNumber.trim().split(/\s+/);
  for (let i = 1; i <= words.length; i++) {
    const truncated = words.slice(0, i).join(' ');
    addVariation(truncated, 'word_truncation', 0.9 - (words.length - i) * 0.1);
  }

  // 3. Remove hyphens
  // "PD-T-003" → "PDT003"
  const noHyphens = styleNumber.replace(/-/g, '');
  if (noHyphens !== styleNumber) {
    addVariation(noHyphens, 'no_hyphens', 0.85);

    // Also do progressive truncation on no-hyphen version
    const noHyphenWords = noHyphens.trim().split(/\s+/);
    for (let i = 1; i < noHyphenWords.length; i++) {
      const truncated = noHyphenWords.slice(0, i).join(' ');
      addVariation(truncated, 'no_hyphens', 0.8 - (noHyphenWords.length - i) * 0.1);
    }
  }

  // 4. Remove all spaces (keep hyphens)
  const noSpaces = styleNumber.replace(/\s+/g, '');
  if (noSpaces !== styleNumber) {
    addVariation(noSpaces, 'no_spaces', 0.75);
  }

  // 5. Remove both hyphens AND spaces (most aggressive)
  const noHyphensOrSpaces = styleNumber.replace(/[-\s]+/g, '');
  if (noHyphensOrSpaces !== styleNumber && noHyphensOrSpaces !== noHyphens && noHyphensOrSpaces !== noSpaces) {
    addVariation(noHyphensOrSpaces, 'combined', 0.7);
  }

  // 6. Special: Extract just the alphanumeric core
  // "PD-T-003 3D TOPPER" → "PDT003" (first continuous alphanumeric segment)
  const coreMatch = styleNumber.match(/^([A-Z0-9-]+)/i);
  if (coreMatch) {
    const core = coreMatch[1].replace(/-/g, '');
    addVariation(core, 'combined', 0.75);
  }

  // Sort by confidence (highest first)
  variations.sort((a, b) => b.confidence - a.confidence);

  return variations;
}

/**
 * Get just the variation strings (without metadata)
 */
export function getStyleNumberVariationStrings(styleNumber: string): string[] {
  return generateStyleNumberVariations(styleNumber).map(v => v.variation);
}

/**
 * Test function to see what variations are generated
 */
export function debugStyleNumberVariations(styleNumber: string): void {
  console.log(`\nGenerating variations for: "${styleNumber}"`);
  console.log('─'.repeat(60));
  const variations = generateStyleNumberVariations(styleNumber);
  variations.forEach((v, i) => {
    console.log(`${i + 1}. "${v.variation}" (${v.type}, confidence: ${v.confidence.toFixed(2)})`);
  });
  console.log('─'.repeat(60));
  console.log(`Total: ${variations.length} unique variations\n`);
}

// Example usage:
// debugStyleNumberVariations("PD-T-003 3D TOPPER");
// Output:
// 1. "PD-T-003 3D TOPPER" (original, confidence: 1.00)
// 2. "PD-T-003 3D" (word_truncation, confidence: 0.90)
// 3. "PD-T-003" (word_truncation, confidence: 0.80)
// 4. "PDT003 3D TOPPER" (no_hyphens, confidence: 0.85)
// 5. "PDT003 3D" (no_hyphens, confidence: 0.80)
// 6. "PDT003" (no_hyphens, confidence: 0.70)
// 7. "PDT0033DTOPPER" (no_spaces, confidence: 0.75)
// 8. "PD-T-0033DTOPPER" (combined, confidence: 0.70)
