/**
 * YoastSEO Content Analyzer
 *
 * Analyzes product content for SEO compliance using Yoast SEO best practices.
 * Provides red/orange/green traffic light scoring for titles, descriptions, keywords, etc.
 *
 * Enhanced with case-insensitive and word-form flexible matching (like Yoast Premium)
 */

/**
 * Normalize text for keyword matching (like Google does)
 * - Lowercase everything
 * - Remove apostrophes and possessives ('s)
 * - Remove special characters
 * - Normalize whitespace
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/['`']/g, '') // Remove apostrophes
    .replace(/[^\w\s-]/g, ' ') // Remove special chars except hyphens
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if keyword appears in text (flexible matching like Yoast Premium)
 * Handles case insensitivity, word forms, and word order
 */
function keywordMatches(text: string, keyword: string): boolean {
  const normalizedText = normalizeForMatching(text);
  const normalizedKeyword = normalizeForMatching(keyword);

  // Check for exact phrase match first
  if (normalizedText.includes(normalizedKeyword)) {
    return true;
  }

  // Check if all words from keyword appear in text (any order)
  const keywordWords = normalizedKeyword.split(/\s+/).filter(w => w.length > 2); // Ignore short words like "a", "of"
  const textWords = normalizedText.split(/\s+/);

  // At least 80% of keyword words must appear in text
  const matchedWords = keywordWords.filter(kw =>
    textWords.some(tw => tw.includes(kw) || kw.includes(tw))
  );

  return matchedWords.length >= Math.ceil(keywordWords.length * 0.8);
}

/**
 * Get percentage of keyword words that appear in text
 */
function getKeywordCoverage(text: string, keyword: string): number {
  const normalizedText = normalizeForMatching(text);
  const keywordWords = normalizeForMatching(keyword).split(/\s+/).filter(w => w.length > 2);
  const textWords = normalizedText.split(/\s+/);

  if (keywordWords.length === 0) return 0;

  const matchedWords = keywordWords.filter(kw =>
    textWords.some(tw => tw.includes(kw) || kw.includes(tw))
  );

  return (matchedWords.length / keywordWords.length) * 100;
}

export interface YoastAnalysisResult {
  overallScore: 'red' | 'orange' | 'green';
  seoScore: number; // 0-100
  readabilityScore: number; // 0-100
  checks: YoastCheck[];
}

export interface YoastCheck {
  id: string;
  name: string;
  score: 'red' | 'orange' | 'green';
  text: string; // Feedback message
  category: 'seo' | 'readability';
}

export interface AnalyzeContentParams {
  title: string;
  metaDescription: string;
  description: string; // Can be HTML or plain text
  keyword: string;
  slug?: string;
  contentType?: 'product' | 'collection'; // Defaults to 'product'
}

/**
 * Strip HTML tags from text (for word counts and text analysis)
 * Like the real Yoast SEO.js, we accept HTML but parse it for text analysis
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '') // Remove style tags and content
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags and content
    .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Analyzes product content and returns Yoast-style SEO scoring
 * Following real Yoast SEO behavior: accepts HTML, parses for structure detection
 */
export async function analyzeContent(params: AnalyzeContentParams): Promise<YoastAnalysisResult> {
  const checks: YoastCheck[] = [];

  // For text analysis (word counts, sentences), strip HTML
  const plainText = stripHtml(params.description);

  // ============================================================================
  // SEO CHECKS (9 total)
  // ============================================================================

  // 1. SEO Title Length (50-60 chars optimal)
  const titleLength = params.title.length;
  checks.push({
    id: 'title-length',
    name: 'SEO Title Length',
    score: titleLength >= 50 && titleLength <= 60
      ? 'green'
      : titleLength >= 40 && titleLength < 50 || titleLength > 60 && titleLength <= 70
      ? 'orange'
      : 'red',
    text: titleLength >= 50 && titleLength <= 60
      ? `Perfect! Title is ${titleLength} characters (optimal: 50-60).`
      : titleLength < 50
      ? `Title is ${titleLength} characters. Add ${50 - titleLength} more for better visibility.`
      : `Title is ${titleLength} characters. Remove ${titleLength - 60} to avoid truncation in search results.`,
    category: 'seo'
  });

  // 2. Meta Description Length (120-156 chars optimal)
  const metaLength = params.metaDescription.length;
  checks.push({
    id: 'meta-length',
    name: 'Meta Description Length',
    score: metaLength >= 120 && metaLength <= 156
      ? 'green'
      : metaLength >= 100 && metaLength < 120 || metaLength > 156 && metaLength <= 170
      ? 'orange'
      : 'red',
    text: metaLength >= 120 && metaLength <= 156
      ? `Perfect! Meta is ${metaLength} characters (optimal: 120-156).`
      : metaLength < 120
      ? `Meta is ${metaLength} characters. Add ${120 - metaLength} more for better CTR.`
      : `Meta is ${metaLength} characters. Remove ${metaLength - 156} to avoid truncation.`,
    category: 'seo'
  });

  // 3. Keyword in Title (Enhanced with flexible matching)
  const keywordInTitle = keywordMatches(params.title, params.keyword);
  const titleCoverage = getKeywordCoverage(params.title, params.keyword);
  const titleWords = normalizeForMatching(params.title).split(/\s+/);
  const keywordWords = normalizeForMatching(params.keyword).split(/\s+/).filter(w => w.length > 2);
  const keywordAtStart = titleWords.slice(0, 5).some(word =>
    keywordWords.some(kw => word.includes(kw) || kw.includes(word))
  );

  checks.push({
    id: 'keyword-in-title',
    name: 'Keyword in Title',
    score: keywordInTitle && keywordAtStart ? 'green' : keywordInTitle ? 'orange' : titleCoverage >= 60 ? 'orange' : 'red',
    text: keywordInTitle && keywordAtStart
      ? `Excellent! Focus keyword "${params.keyword}" appears at the beginning of the title (${titleCoverage.toFixed(0)}% match).`
      : keywordInTitle
      ? `Good! Focus keyword "${params.keyword}" found in title (${titleCoverage.toFixed(0)}% match). Move it closer to the start for better SEO.`
      : titleCoverage >= 60
      ? `Partial match (${titleCoverage.toFixed(0)}%): Most keyword words found in title. Add remaining words for better rankings.`
      : `Focus keyword "${params.keyword}" not found in title. Add it for better rankings.`,
    category: 'seo'
  });

  // 4. Keyword in Meta Description (Enhanced with flexible matching)
  const keywordInMeta = keywordMatches(params.metaDescription, params.keyword);
  const metaCoverage = getKeywordCoverage(params.metaDescription, params.keyword);
  const metaWords = normalizeForMatching(params.metaDescription).split(/\s+/);
  const keywordInFirst10 = metaWords.slice(0, 10).some(word =>
    keywordWords.some(kw => word.includes(kw) || kw.includes(word))
  );

  checks.push({
    id: 'keyword-in-meta',
    name: 'Keyword in Meta Description',
    score: keywordInMeta && keywordInFirst10 ? 'green' : keywordInMeta ? 'orange' : metaCoverage >= 60 ? 'orange' : 'red',
    text: keywordInMeta && keywordInFirst10
      ? `Great! Focus keyword "${params.keyword}" appears in first 10 words of meta (${metaCoverage.toFixed(0)}% match).`
      : keywordInMeta
      ? `Focus keyword "${params.keyword}" found in meta (${metaCoverage.toFixed(0)}% match). Move it to the first 10 words for better CTR.`
      : metaCoverage >= 60
      ? `Partial match (${metaCoverage.toFixed(0)}%): Most keyword words in meta. Add remaining words for better CTR.`
      : `Focus keyword "${params.keyword}" not in meta description. Add it for better click-through rates.`,
    category: 'seo'
  });

  // 5. Keyword in First Paragraph (first 100 words) - Enhanced with flexible matching
  const words = plainText.split(/\s+/).filter(w => w.trim().length > 0);
  const first100Words = words.slice(0, 100).join(' ');
  const keywordInIntro = keywordMatches(first100Words, params.keyword);
  const introCoverage = getKeywordCoverage(first100Words, params.keyword);

  checks.push({
    id: 'keyword-in-intro',
    name: 'Keyword in Introduction',
    score: keywordInIntro ? 'green' : introCoverage >= 60 ? 'orange' : 'red',
    text: keywordInIntro
      ? `Perfect! Focus keyword appears in the first 100 words (${introCoverage.toFixed(0)}% match).`
      : introCoverage >= 60
      ? `Partial match (${introCoverage.toFixed(0)}%): Most keyword words in intro. Add remaining for better SEO.`
      : `Focus keyword not found in introduction. Add "${params.keyword}" to the first paragraph for better SEO.`,
    category: 'seo'
  });

  // 6. Keyword Density (0.5-2.5% optimal) - Enhanced with flexible matching
  const contentType = params.contentType || 'product';
  const normalizedDescription = normalizeForMatching(plainText);
  const normalizedKeywordPhrase = normalizeForMatching(params.keyword);
  const keywordRegex = new RegExp(normalizedKeywordPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const keywordOccurrences = normalizedDescription.match(keywordRegex);
  const keywordCount = keywordOccurrences ? keywordOccurrences.length : 0;
  const totalWords = words.length;
  const keywordDensity = totalWords > 0 ? (keywordCount / totalWords) * 100 : 0;

  // Collection descriptions are short (~25-40 words), so keyword density is naturally higher
  const densityLimits = contentType === 'collection'
    ? { greenMin: 0.5, greenMax: 5.0, orangeMax: 7.0 }
    : { greenMin: 0.5, greenMax: 2.5, orangeMax: 3.5 };

  checks.push({
    id: 'keyword-density',
    name: 'Keyword Density',
    score: keywordDensity >= densityLimits.greenMin && keywordDensity <= densityLimits.greenMax
      ? 'green'
      : keywordDensity >= 0.3 && keywordDensity < densityLimits.greenMin || keywordDensity > densityLimits.greenMax && keywordDensity <= densityLimits.orangeMax
      ? 'orange'
      : 'red',
    text: keywordDensity >= densityLimits.greenMin && keywordDensity <= densityLimits.greenMax
      ? `Perfect! Keyword density is ${keywordDensity.toFixed(1)}% (${keywordCount} times in ${totalWords} words).`
      : keywordDensity < densityLimits.greenMin
      ? `Keyword density is ${keywordDensity.toFixed(1)}%. Use "${params.keyword}" ${Math.ceil((densityLimits.greenMin * totalWords / 100) - keywordCount)} more times.`
      : `Keyword density is ${keywordDensity.toFixed(1)}%. Remove ${Math.floor(keywordCount - (densityLimits.greenMax * totalWords / 100))} instances to avoid over-optimization.`,
    category: 'seo'
  });

  // 7. Content Length (content-type-aware thresholds)
  const lengthThresholds = contentType === 'collection'
    ? { green: 25, orange: 15, label: 'collection pages' }
    : { green: 300, orange: 150, label: 'product pages' };

  checks.push({
    id: 'content-length',
    name: 'Content Length',
    score: totalWords >= lengthThresholds.green ? 'green' : totalWords >= lengthThresholds.orange ? 'orange' : 'red',
    text: totalWords >= lengthThresholds.green
      ? `Excellent! Content is ${totalWords} words (${lengthThresholds.green}+ recommended for ${lengthThresholds.label}).`
      : totalWords >= lengthThresholds.orange
      ? `Content is ${totalWords} words. Add ${lengthThresholds.green - totalWords} more for better SEO depth.`
      : `Content is only ${totalWords} words. Add ${lengthThresholds.green - totalWords} for adequate ${lengthThresholds.label} information.`,
    category: 'seo'
  });

  // 8. Keyword in URL Slug (if provided)
  if (params.slug) {
    const keywordInSlug = params.slug.toLowerCase().includes(params.keyword.toLowerCase().replace(/\s+/g, '-'));
    checks.push({
      id: 'keyword-in-slug',
      name: 'Keyword in URL',
      score: keywordInSlug ? 'green' : 'orange',
      text: keywordInSlug
        ? `Great! Focus keyword appears in the URL slug.`
        : `Consider including "${params.keyword.replace(/\s+/g, '-')}" in the URL for better SEO.`,
      category: 'seo'
    });
  }

  // 9. Has Lists (bullet points improve readability for e-commerce)
  const hasPlainTextBullets = /[•\-\*]\s/.test(params.description) || /^\d+\.\s/m.test(params.description);
  const hasHTMLLists = /<ul[\s>]|<ol[\s>]|<li[\s>]/.test(params.description);
  const hasBulletPoints = hasPlainTextBullets || hasHTMLLists;
  const listsMessage = contentType === 'collection'
    ? 'Optional for collection descriptions. Add bullet points to highlight key differentiators.'
    : 'Consider adding bullet points to highlight product features for better readability.';
  checks.push({
    id: 'has-lists',
    name: 'Lists/Bullet Points',
    score: hasBulletPoints ? 'green' : 'orange',
    text: hasBulletPoints
      ? `Good! Content includes lists or bullet points for easy scanning.`
      : listsMessage,
    category: 'seo'
  });

  // Collection-specific: CTA in meta description
  if (contentType === 'collection') {
    const ctaWords = ['shop', 'browse', 'discover', 'explore', 'find', 'view', 'see', 'check out'];
    const metaLower = params.metaDescription.toLowerCase();
    const hasCta = ctaWords.some(cta => metaLower.includes(cta));
    checks.push({
      id: 'meta-cta',
      name: 'CTA in Meta Description',
      score: hasCta ? 'green' : 'orange',
      text: hasCta
        ? 'Good! Meta description includes a call-to-action for better CTR.'
        : 'Add a CTA like "Shop", "Browse", or "Discover" to your meta description for better click-through rates.',
      category: 'seo'
    });
  }

  // Collection-specific: Internal links present
  if (contentType === 'collection') {
    const hasInternalLinks = /<a\s[^>]*href=["'][^"']*\/collections\/[^"']*["'][^>]*>/i.test(params.description);
    checks.push({
      id: 'internal-links',
      name: 'Internal Links',
      score: hasInternalLinks ? 'green' : 'orange',
      text: hasInternalLinks
        ? 'Good! Description includes internal links to related collections.'
        : 'Consider adding a link to a related collection for better SEO and cross-navigation.',
      category: 'seo'
    });
  }

  // ============================================================================
  // READABILITY CHECKS (7 total)
  // ============================================================================

  // 1. Sentence Length (avg <20 words, max 25% over 20 words)
  const sentences = plainText
    .split(/[.!?]+/)
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  const avgSentenceLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length || 0;
  const longSentences = sentenceLengths.filter(len => len > 20).length;
  const longSentencePercentage = (longSentences / sentences.length) * 100;

  checks.push({
    id: 'sentence-length',
    name: 'Sentence Length',
    score: longSentencePercentage < 25 ? 'green' : longSentencePercentage < 40 ? 'orange' : 'red',
    text: longSentencePercentage < 25
      ? `Good! Only ${longSentencePercentage.toFixed(0)}% of sentences are over 20 words (avg: ${avgSentenceLength.toFixed(1)} words).`
      : `${longSentencePercentage.toFixed(0)}% of sentences are over 20 words. Shorten ${longSentences} sentences for better readability.`,
    category: 'readability'
  });

  // 2. Paragraph Length (max 150 words per paragraph)
  const paragraphs = plainText.split(/\n\n+/).filter(p => p.trim().length > 0);
  const longParagraphs = paragraphs.filter(p => p.split(/\s+/).length > 150).length;
  const paragraphScore = longParagraphs === 0 ? 'green' : longParagraphs <= 2 ? 'orange' : 'red';

  checks.push({
    id: 'paragraph-length',
    name: 'Paragraph Length',
    score: paragraphScore,
    text: longParagraphs === 0
      ? `Perfect! All ${paragraphs.length} paragraphs are under 150 words.`
      : `${longParagraphs} paragraphs exceed 150 words. Break them up for easier reading.`,
    category: 'readability'
  });

  // 3. Transition Words (should be >20% of sentences)
  const transitionWords = [
    'however', 'therefore', 'furthermore', 'moreover', 'additionally',
    'also', 'besides', 'meanwhile', 'consequently', 'thus',
    'because', 'since', 'although', 'while', 'unless',
    'first', 'second', 'finally', 'next', 'then', 'instead',
    'otherwise', 'likewise', 'similarly', 'conversely', 'nevertheless',
    'nonetheless', 'accordingly', 'hence', 'indeed', 'rather'
  ];

  // Count how many sentences contain at least one transition word
  const sentencesWithTransitions = sentences.filter(sentence => {
    const sentenceLower = sentence.toLowerCase();
    return transitionWords.some(word => {
      // Use word boundary regex to match whole words only
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(sentenceLower);
    });
  }).length;

  const transitionPercentage = sentences.length > 0
    ? (sentencesWithTransitions / sentences.length) * 100
    : 0;

  checks.push({
    id: 'transition-words',
    name: 'Transition Words',
    score: transitionPercentage >= 30 ? 'green' : transitionPercentage >= 20 ? 'orange' : 'red',
    text: transitionPercentage >= 30
      ? `Good! ${transitionPercentage.toFixed(0)}% of sentences use transition words (${sentencesWithTransitions} of ${sentences.length}).`
      : `Only ${transitionPercentage.toFixed(0)}% of sentences use transition words (${sentencesWithTransitions} of ${sentences.length}). Add words like "however," "therefore," or "additionally."`,
    category: 'readability'
  });

  // 4. Passive Voice Detection (<10% recommended)
  const passiveIndicators = ['is', 'are', 'was', 'were', 'been', 'being', 'be'];
  const passiveSentences = sentences.filter(s => {
    const lowerS = s.toLowerCase();
    return passiveIndicators.some(indicator =>
      new RegExp(`\\b${indicator}\\s+\\w+ed\\b|\\b${indicator}\\s+being\\b`).test(lowerS)
    );
  });
  const passivePercentage = (passiveSentences.length / sentences.length) * 100;

  checks.push({
    id: 'passive-voice',
    name: 'Passive Voice',
    score: passivePercentage < 10 ? 'green' : passivePercentage < 20 ? 'orange' : 'red',
    text: passivePercentage < 10
      ? `Excellent! Only ${passivePercentage.toFixed(0)}% passive voice (${passiveSentences.length} sentences).`
      : `${passivePercentage.toFixed(0)}% passive voice detected (${passiveSentences.length} sentences). Rewrite to active voice for better engagement.`,
    category: 'readability'
  });

  // 5. Consecutive Sentence Beginnings (shouldn't repeat)
  const sentenceStarts = sentences.map(s => s.split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
  const consecutiveRepeats = sentenceStarts.filter((start, i) => i > 0 && start === sentenceStarts[i - 1]).length;

  checks.push({
    id: 'consecutive-starts',
    name: 'Consecutive Sentence Beginnings',
    score: consecutiveRepeats === 0 ? 'green' : consecutiveRepeats <= 2 ? 'orange' : 'red',
    text: consecutiveRepeats === 0
      ? `Perfect! No consecutive sentences start with the same word.`
      : `${consecutiveRepeats} consecutive sentences start with the same word. Vary your sentence beginnings.`,
    category: 'readability'
  });

  // 6. Flesch Reading Ease Score (60-70 is optimal for blog/product content)
  const fleschScore = calculateFleschScore(plainText);

  checks.push({
    id: 'flesch-score',
    name: 'Flesch Reading Ease',
    score: fleschScore >= 60 && fleschScore <= 80 ? 'green' : fleschScore >= 50 || fleschScore > 80 ? 'orange' : 'red',
    text: fleschScore >= 60 && fleschScore <= 80
      ? `Perfect! Flesch score is ${fleschScore.toFixed(0)} (easy to read for general audience).`
      : fleschScore < 60
      ? `Flesch score is ${fleschScore.toFixed(0)} (fairly difficult). Simplify sentences and words.`
      : `Flesch score is ${fleschScore.toFixed(0)} (very easy). Content might be too simple for product descriptions.`,
    category: 'readability'
  });

  // 7. Lists Present (for product features)
  const hasNumberedList = /^\d+\.\s/m.test(params.description) || /<ol[\s>]/.test(params.description);
  const hasBulletList = /^[•\-\*]\s/m.test(params.description) || /<ul[\s>]|<li[\s>]/.test(params.description);

  checks.push({
    id: 'lists-present',
    name: 'Lists Present',
    score: hasNumberedList || hasBulletList ? 'green' : 'orange',
    text: hasNumberedList || hasBulletList
      ? `Good! Content includes ${hasNumberedList ? 'numbered' : 'bullet'} lists for easy scanning.`
      : `Add bullet or numbered lists to highlight key product features.`,
    category: 'readability'
  });

  // ============================================================================
  // CALCULATE OVERALL SCORES
  // ============================================================================

  const seoChecks = checks.filter(c => c.category === 'seo');
  const readabilityChecks = checks.filter(c => c.category === 'readability');

  const seoScore = calculateScore(seoChecks);
  const readabilityScore = calculateScore(readabilityChecks);
  const overallScore = determineOverallScore(seoScore, readabilityScore);

  return {
    overallScore,
    seoScore,
    readabilityScore,
    checks,
  };
}

/**
 * Calculate Flesch Reading Ease score
 * Formula: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
 */
function calculateFleschScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);

  return Math.max(0, Math.min(100, score)); // Clamp between 0-100
}

/**
 * Count syllables in a word (simple heuristic)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  const vowels = 'aeiouy';
  let syllableCount = 0;
  let previousWasVowel = false;

  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i]);
    if (isVowel && !previousWasVowel) {
      syllableCount++;
    }
    previousWasVowel = isVowel;
  }

  // Adjust for silent 'e' at end
  if (word.endsWith('e')) {
    syllableCount--;
  }

  return Math.max(1, syllableCount);
}

/**
 * Calculate score from checks (0-100)
 */
function calculateScore(checks: YoastCheck[]): number {
  if (checks.length === 0) return 0;

  const scoreMap = { green: 100, orange: 60, red: 30 };
  const total = checks.reduce((sum, check) => sum + scoreMap[check.score], 0);
  return Math.round(total / checks.length);
}

/**
 * Determine overall traffic light color
 */
function determineOverallScore(seoScore: number, readabilityScore: number): 'red' | 'orange' | 'green' {
  const avg = (seoScore + readabilityScore) / 2;
  if (avg >= 80) return 'green';
  if (avg >= 60) return 'orange';
  return 'red';
}
