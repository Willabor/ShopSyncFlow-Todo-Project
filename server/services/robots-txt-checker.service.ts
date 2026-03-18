/**
 * Robots.txt Compliance Checker
 *
 * Checks if web scraping is allowed according to robots.txt directives.
 * Ensures ethical scraping practices and compliance with website policies.
 */

interface RobotsTxtRule {
  userAgent: string;
  disallow: string[];
  allow: string[];
  crawlDelay?: number;
}

export interface RobotsCheckResult {
  allowed: boolean;
  reason?: string;
  crawlDelay?: number; // in seconds
  robotsTxtUrl?: string;
  rulesFound: boolean;
}

/**
 * Check if scraping is allowed for a given URL based on robots.txt
 *
 * @param baseUrl - Base URL of the website (e.g., 'https://example.com')
 * @param userAgent - User agent string to check rules for
 * @param specificPath - Specific path to check (default: '/products')
 * @returns Promise with permission result
 */
export async function isScrapingAllowed(
  baseUrl: string,
  userAgent: string = 'NexusClothing-Enricher/1.0',
  specificPath: string = '/products'
): Promise<RobotsCheckResult> {
  try {
    // Normalize base URL
    const normalizedBase = normalizeUrl(baseUrl);
    const robotsTxtUrl = `${normalizedBase}/robots.txt`;

    console.log(`🤖 Checking robots.txt: ${robotsTxtUrl}`);

    // Fetch robots.txt with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(robotsTxtUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
        },
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Network error or timeout - assume allowed
      console.log('⚠️  robots.txt fetch failed, assuming allowed:', fetchError instanceof Error ? fetchError.message : 'Unknown error');
      return {
        allowed: true,
        reason: 'No robots.txt found (network error)',
        rulesFound: false,
        robotsTxtUrl,
      };
    }

    clearTimeout(timeoutId);

    // If robots.txt doesn't exist (404), scraping is allowed by default
    if (response.status === 404) {
      console.log('✅ No robots.txt found - scraping allowed by default');
      return {
        allowed: true,
        reason: 'No robots.txt file found',
        rulesFound: false,
        robotsTxtUrl,
      };
    }

    // If other error (500, 403, etc.), be conservative and allow
    if (!response.ok) {
      console.log(`⚠️  robots.txt returned ${response.status}, assuming allowed`);
      return {
        allowed: true,
        reason: `robots.txt unavailable (HTTP ${response.status})`,
        rulesFound: false,
        robotsTxtUrl,
      };
    }

    // Parse robots.txt content
    const robotsTxt = await response.text();
    const rules = parseRobotsTxt(robotsTxt);

    console.log(`📋 Found ${rules.length} user-agent rule(s) in robots.txt`);

    // Find applicable rule (specific user-agent or wildcard)
    const specificRule = rules.find(r =>
      r.userAgent.toLowerCase() === userAgent.toLowerCase().split('/')[0]
    );
    const wildcardRule = rules.find(r => r.userAgent === '*');
    const applicableRule = specificRule || wildcardRule;

    if (!applicableRule) {
      console.log('✅ No applicable rules found - scraping allowed');
      return {
        allowed: true,
        reason: 'No rules for this user-agent',
        rulesFound: true,
        robotsTxtUrl,
      };
    }

    // Check if the specific path is disallowed
    const isPathDisallowed = isPathBlocked(
      specificPath,
      applicableRule.disallow,
      applicableRule.allow
    );

    if (isPathDisallowed) {
      console.log(`❌ Path "${specificPath}" is disallowed by robots.txt`);
      return {
        allowed: false,
        reason: `Path "${specificPath}" disallowed by robots.txt`,
        crawlDelay: applicableRule.crawlDelay,
        rulesFound: true,
        robotsTxtUrl,
      };
    }

    console.log(`✅ Path "${specificPath}" is allowed by robots.txt`);
    return {
      allowed: true,
      reason: 'Allowed by robots.txt',
      crawlDelay: applicableRule.crawlDelay,
      rulesFound: true,
      robotsTxtUrl,
    };

  } catch (error) {
    console.error('❌ robots.txt check failed:', error);

    // On error, be conservative and allow (but log the error)
    return {
      allowed: true,
      reason: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      rulesFound: false,
    };
  }
}

/**
 * Check if a specific path is blocked by disallow/allow rules
 *
 * @param path - Path to check (e.g., '/products')
 * @param disallowRules - List of disallow patterns
 * @param allowRules - List of allow patterns (override disallow)
 * @returns true if path is blocked, false if allowed
 */
function isPathBlocked(
  path: string,
  disallowRules: string[],
  allowRules: string[]
): boolean {
  // Normalize path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Check if explicitly allowed (allow rules override disallow)
  for (const allowPattern of allowRules) {
    if (matchesPattern(normalizedPath, allowPattern)) {
      return false; // Explicitly allowed
    }
  }

  // Check if disallowed
  for (const disallowPattern of disallowRules) {
    if (matchesPattern(normalizedPath, disallowPattern)) {
      return true; // Blocked
    }
  }

  return false; // Not blocked
}

/**
 * Check if a path matches a robots.txt pattern
 *
 * @param path - Path to check
 * @param pattern - Pattern from robots.txt (supports * wildcard)
 * @returns true if path matches pattern
 */
function matchesPattern(path: string, pattern: string): boolean {
  if (!pattern) return false;

  // Empty pattern blocks everything
  if (pattern === '/') return true;

  // Convert robots.txt pattern to regex
  // * matches any sequence of characters
  // $ at end means exact match
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*'); // Convert * to .*

  const endsWithDollar = pattern.endsWith('$');
  const finalPattern = endsWithDollar
    ? `^${regexPattern.slice(0, -2)}$` // Exact match
    : `^${regexPattern}`; // Prefix match

  const regex = new RegExp(finalPattern);
  return regex.test(path);
}

/**
 * Parse robots.txt content into structured rules
 *
 * @param content - Raw robots.txt file content
 * @returns Array of parsed rules
 */
function parseRobotsTxt(content: string): RobotsTxtRule[] {
  const rules: RobotsTxtRule[] = [];
  let currentRule: RobotsTxtRule | null = null;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Split on first colon
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
    const value = trimmed.substring(colonIndex + 1).trim();

    if (key === 'user-agent') {
      // Start new rule block
      if (currentRule) {
        rules.push(currentRule);
      }
      currentRule = {
        userAgent: value,
        disallow: [],
        allow: [],
      };
    } else if (currentRule) {
      // Add directives to current rule
      if (key === 'disallow') {
        if (value) {
          currentRule.disallow.push(value);
        }
      } else if (key === 'allow') {
        if (value) {
          currentRule.allow.push(value);
        }
      } else if (key === 'crawl-delay') {
        const delay = parseInt(value, 10);
        if (!isNaN(delay) && delay > 0) {
          currentRule.crawlDelay = delay;
        }
      }
    }
  }

  // Push last rule
  if (currentRule) {
    rules.push(currentRule);
  }

  return rules;
}

/**
 * Normalize URL to base domain
 *
 * @param url - URL to normalize
 * @returns Base URL (protocol + domain)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    // If URL parsing fails, try to clean it up
    const cleaned = url.replace(/\/+$/, ''); // Remove trailing slashes
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      return cleaned;
    }
    return `https://${cleaned}`;
  }
}

/**
 * Get custom user agent string for NexusClothing scraper
 *
 * @param contactEmail - Contact email for website owners
 * @returns Formatted user agent string
 */
export function getNexusUserAgent(contactEmail: string = 'will@nexusclothing.com'): string {
  return `NexusClothing-Enricher/1.0 (contact: ${contactEmail}; +https://nexusclothing.com/bot-info)`;
}
