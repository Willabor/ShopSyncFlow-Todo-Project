/**
 * Predefined size order for consistent sorting across all products
 *
 * Covers all size formats used in retail:
 * - Toddler sizes (2T-10T)
 * - Range sizes (1-2T, 3-4T, etc.)
 * - Numeric sizes with decimals (1.5, 2, 2.5, etc.)
 * - Hat sizes with fractions (6 3/8, 6 1/2, etc.)
 * - Waist x Length combinations (26W X 30L, etc.)
 * - Simple inch measurements (24", 26", etc.)
 * - Standard sizing (OneSize, X-Small, Small, Medium, Large, etc.)
 */
export const SIZE_ORDER = [
  '2T', '3T', '4T', '5T', '6T', '7T', '8T', '9T', '10T',
  '1-2T', '3-4T', '5-6T', '7-8T', '10-12T',
  '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5',
  '6 3/8', '6 1/2', '6 5/8', '6 3/4', '6 7/8',
  '7', '7 1/8', '7 1/4', '7 3/8', '7.5', '7 1/2', '7 5/8', '7 3/4', '7 7/8',
  '8', '8 1/8', '8 1/4', '8 3/8', '8 1/2', '8 5/8', '8 3/4', '8.5',
  '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '13.5', '14', '15', '16', '17', '18', '19',
  '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44',
  '24"', '26"',
  '26W X 30L', '28"',
  '28W X 28L', '28W X 29L', '28W X 30L', '28W X 31L', '28W X 32L', '28W X 36L',
  '29W X 28L', '29W X 29L', '29W X 30L', '29W X 31L', '29W X 32L', '29W X 36L',
  '30"', '30W X 28L', '30W X 29L', '30W X 30L', '30W X 31L', '30W X 32L', '30W X 33L', '30W X 34L', '30W X 36L',
  '31W X 30L', '31W X 32L',
  '32"', '32W X 28L', '32W X 29L', '32W X 30L', '32W X 31L', '32W X 32L', '32W X 33L', '32W X 34L', '32W X 36L', '32W X 38L',
  '33W X 30L', '33W X 32L',
  '34"', '34W X 28L', '34W X 29L', '34W X 30L', '34W X 31L', '34W X 32L', '34W X 33L', '34W X 34L', '34W X 36L', '34W X 38L',
  '35W X 30L', '35W X 32L',
  '36W X 28L', '36W X 29L', '36W X 30L', '36W X 31L', '36W X 32L', '36W X 33L', '36W X 34L', '36W X 36L', '36W X 38L',
  '37W X 30L', '37W X 32L',
  '38W X 28L', '38W X 30L', '38W X 31L', '38W X 32L', '38W X 33L', '38W X 34L', '38W X 36L', '38W X 38L',
  '40W X 28L', '40W X 30L', '40W X 31L', '40W X 32L', '40W X 33L', '40W X 34L', '40W X 36L', '40W X 38L',
  '42W X 28L', '42W X 29L', '42W X 30L', '42W X 31L', '42W X 32L', '42W X 33L', '42W X 34L', '42W X 36L',
  '44W X 28L', '44W X 29L', '44W X 30L', '44W X 32L', '44W X 34L', '44W X 36L',
  '46W X 28L', '46W X 30L', '46W X 32L', '46W X 34L',
  '48W X 28L', '48W X 30L', '48W X 32L', '48W X 34L',
  '50W X 28L', '50W X 32L', '50W X 34L',
  '52W X 32L',
  '54W X 32L',
  '56W X 32L', '56W X 34L',
  '58W X 32L', '58W X 34L',
  '60W X 32L', '60W X 34L',
  'OneSize', 'X-Small', 'Small', 'Medium', 'Large', 'X-Large', 'XX-Large', 'XXX-Large', 'XXXX-Large', 'XXXXX-Large', 'XXXXXX-Large'
];

/**
 * Sort sizes using predefined order
 *
 * Uses SIZE_ORDER array to maintain consistent sorting across all products.
 * Sizes not in the predefined list are placed at the end in alphabetical order.
 *
 * @param sizes - Array of size strings
 * @returns Sorted array following the predefined order
 */
export function sortSizesByOrder(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const indexA = SIZE_ORDER.indexOf(a);
    const indexB = SIZE_ORDER.indexOf(b);

    // Both sizes are in the predefined order
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }

    // Only 'a' is in predefined order → 'a' comes first
    if (indexA !== -1) return -1;

    // Only 'b' is in predefined order → 'b' comes first
    if (indexB !== -1) return 1;

    // Neither is in predefined order → alphabetical fallback
    return a.localeCompare(b);
  });
}
