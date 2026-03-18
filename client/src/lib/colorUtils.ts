/**
 * Vendor Color Utilities
 * Predefined color palette and helper functions for vendor color-coding
 */

export interface VendorColor {
  name: string;
  value: string;
  tailwind: string; // Tailwind class for reference
}

/**
 * Predefined color palette (12 distinct, accessible colors)
 * Using Tailwind CSS color system for consistency
 */
export const VENDOR_COLORS: VendorColor[] = [
  { name: 'Blue', value: '#3b82f6', tailwind: 'blue-500' },
  { name: 'Red', value: '#ef4444', tailwind: 'red-500' },
  { name: 'Green', value: '#10b981', tailwind: 'emerald-500' },
  { name: 'Purple', value: '#a855f7', tailwind: 'purple-500' },
  { name: 'Orange', value: '#f97316', tailwind: 'orange-500' },
  { name: 'Pink', value: '#ec4899', tailwind: 'pink-500' },
  { name: 'Indigo', value: '#6366f1', tailwind: 'indigo-500' },
  { name: 'Cyan', value: '#06b6d4', tailwind: 'cyan-500' },
  { name: 'Amber', value: '#f59e0b', tailwind: 'amber-500' },
  { name: 'Lime', value: '#84cc16', tailwind: 'lime-500' },
  { name: 'Teal', value: '#14b8a6', tailwind: 'teal-500' },
  { name: 'Rose', value: '#f43f5e', tailwind: 'rose-500' },
];

/**
 * Default color for vendors without assigned color
 */
export const DEFAULT_VENDOR_COLOR = '#6b7280'; // gray-500

/**
 * Get vendor color with fallback to default
 * @param color - Hex color code or null/undefined
 * @returns Hex color code (always returns a valid color)
 */
export function getVendorColor(color?: string | null): string {
  if (!color) {
    return DEFAULT_VENDOR_COLOR;
  }

  // Validate hex color format
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }

  return DEFAULT_VENDOR_COLOR;
}

/**
 * Get a lighter version of the color for backgrounds
 * @param color - Hex color code
 * @param opacity - Opacity level (0-1), default 0.1
 * @returns RGB color with opacity
 */
export function getVendorColorBackground(color?: string | null, opacity: number = 0.1): string {
  const hexColor = getVendorColor(color);

  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Check if a color is in the predefined palette
 * @param color - Hex color code
 * @returns True if color is in palette
 */
export function isColorInPalette(color: string): boolean {
  return VENDOR_COLORS.some(c => c.value.toLowerCase() === color.toLowerCase());
}

/**
 * Get color name from hex value
 * @param color - Hex color code
 * @returns Color name or 'Custom' if not in palette
 */
export function getColorName(color?: string | null): string {
  if (!color) return 'Gray';

  const paletteColor = VENDOR_COLORS.find(c => c.value.toLowerCase() === color.toLowerCase());
  return paletteColor ? paletteColor.name : 'Custom';
}
