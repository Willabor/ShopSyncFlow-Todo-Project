import DOMPurify from 'dompurify';

/**
 * Sanitize HTML string to prevent XSS attacks.
 * Use this for all dangerouslySetInnerHTML calls.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'em', 'strong', 'u', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'table', 'thead',
      'tbody', 'tr', 'th', 'td', 'blockquote', 'pre', 'code', 'img', 'hr',
      'sup', 'sub', 'small',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class', 'style', 'src', 'alt', 'width',
      'height', 'colspan', 'rowspan',
    ],
  });
}
