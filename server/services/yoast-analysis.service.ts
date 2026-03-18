/**
 * Yoast SEO Analysis Service
 *
 * Uses the official yoastseo npm package to analyze content and provide
 * real Yoast SEO scores for readability and SEO optimization.
 */

import pkg from "yoastseo";
const { Researcher, Paper } = pkg;

export interface YoastAnalysisResult {
  overallScore: number;
  seoChecks: {
    keywordInTitle: { score: number; text: string };
    keywordInMeta: { score: number; text: string };
    keywordInIntro: { score: number; text: string };
    keywordDensity: { score: number; text: string; density: number };
    contentLength: { score: number; text: string; wordCount: number };
  };
  readabilityChecks: {
    fleschScore: { score: number; text: string; fleschValue: number };
    paragraphLength: { score: number; text: string; issues: number };
    sentenceLength: { score: number; text: string; percentage: number };
    transitionWords: { score: number; text: string; percentage: number };
    passiveVoice: { score: number; text: string; percentage: number };
    consecutiveSentences: { score: number; text: string; issues: number };
    listsPresent: { score: number; text: string; hasLists: boolean };
  };
}

/**
 * Strip HTML tags from content for plain text analysis
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if HTML contains lists
 */
function hasLists(html: string): boolean {
  const ulMatch = html.match(/<ul[^>]*>[\s\S]*?<\/ul>/gi);
  const olMatch = html.match(/<ol[^>]*>[\s\S]*?<\/ol>/gi);
  return !!(ulMatch && ulMatch.length > 0) || !!(olMatch && olMatch.length > 0);
}

/**
 * Analyze content with Yoast SEO
 */
export async function analyzeContent(
  html: string,
  keyword: string,
  title: string = '',
  metaDescription: string = ''
): Promise<YoastAnalysisResult> {
  // Strip HTML for plain text analysis
  const plainText = stripHtml(html);
  const wordCount = countWords(plainText);

  // Create Paper object
  const paper = new Paper(plainText, {
    keyword: keyword,
    title: title,
    description: metaDescription,
    locale: 'en_US'
  });

  // Create Researcher
  const researcher = new Researcher(paper);

  // Get Flesch Reading Ease score
  const fleschData = researcher.getResearch("fleschReadingEase");
  const fleschValue = fleschData || 0;

  // Determine Flesch score (0-100 scale, higher = easier)
  let fleschScore = 9; // Red
  let fleschText = `Flesch score is ${fleschValue} (very difficult). Simplify sentences and words.`;

  if (fleschValue >= 70) {
    fleschScore = 9; // Green
    fleschText = `Perfect! Flesch score is ${fleschValue} (easy to read for general audience).`;
  } else if (fleschValue >= 60) {
    fleschScore = 9; // Green
    fleschText = `Good! Flesch score is ${fleschValue} (fairly easy to read).`;
  } else if (fleschValue >= 50) {
    fleschScore = 6; // Orange
    fleschText = `Flesch score is ${fleschValue} (fairly difficult). Simplify sentences and words.`;
  } else {
    fleschScore = 3; // Red
    fleschText = `Flesch score is ${fleschValue} (very difficult). Simplify sentences and words.`;
  }

  // Check for lists
  const listsExist = hasLists(html);
  const listsScore = listsExist ? 9 : 6;
  const listsText = listsExist
    ? "Good! Content includes bullet or numbered lists."
    : "Add bullet or numbered lists to highlight key product features.";

  // Get paragraph length data
  const paragraphLengthData = researcher.getResearch("getParagraphLength");
  const longParagraphs = paragraphLengthData ? paragraphLengthData.filter((p: any) => p.length > 150).length : 0;
  const paragraphScore = longParagraphs === 0 ? 9 : longParagraphs === 1 ? 6 : 3;
  const paragraphText = longParagraphs === 0
    ? "Good! All paragraphs are under 150 words."
    : `${longParagraphs} paragraphs exceed 150 words. Break them up for easier reading.`;

  // Get sentence length data
  const sentenceLengthData = researcher.getResearch("countSentencesFromText");
  const totalSentences = sentenceLengthData ? sentenceLengthData.length : 0;
  const longSentences = sentenceLengthData ? sentenceLengthData.filter((s: any) => s.sentenceLength > 20).length : 0;
  const sentenceLengthPercentage = totalSentences > 0 ? Math.round((longSentences / totalSentences) * 100) : 0;
  const sentenceLengthScore = sentenceLengthPercentage <= 25 ? 9 : sentenceLengthPercentage <= 35 ? 6 : 3;
  const sentenceLengthText = sentenceLengthPercentage <= 25
    ? `Good! Only ${sentenceLengthPercentage}% of sentences are over 20 words (avg: ${totalSentences > 0 ? Math.round(wordCount / totalSentences) : 0} words).`
    : `${sentenceLengthPercentage}% of sentences are over 20 words. Consider shorter sentences.`;

  // Get transition words data
  const transitionWordsData = researcher.getResearch("findTransitionWords");
  const transitionSentences = transitionWordsData && transitionWordsData.transitionWordSentences ? transitionWordsData.transitionWordSentences : 0;
  const transitionPercentage = totalSentences > 0 ? Math.round((transitionSentences / totalSentences) * 100) : 0;
  const transitionScore = transitionPercentage >= 20 ? 9 : transitionPercentage >= 10 ? 6 : 3;
  const transitionText = transitionPercentage >= 20
    ? `Good! ${transitionPercentage}% of sentences use transition words.`
    : `Only ${transitionPercentage}% of sentences use transition words. Add words like "however," "therefore," or "additionally."`;

  // Get passive voice data
  const passiveVoiceData = researcher.getResearch("getPassiveVoice");
  const passiveSentences = passiveVoiceData && passiveVoiceData.passives ? passiveVoiceData.passives.total : 0;
  const passivePercentage = totalSentences > 0 ? Math.round((passiveSentences / totalSentences) * 100) : 0;
  const passiveScore = passivePercentage <= 10 ? 9 : passivePercentage <= 20 ? 6 : 3;
  const passiveText = passivePercentage === 0
    ? `Excellent! Only ${passivePercentage}% passive voice (0 sentences).`
    : passivePercentage <= 10
    ? `Good! Only ${passivePercentage}% passive voice.`
    : `${passivePercentage}% passive voice. Use more active voice.`;

  // Get consecutive sentences data
  const consecutiveSentencesData = researcher.getResearch("getSentenceBeginnings");
  const consecutiveIssues = consecutiveSentencesData && consecutiveSentencesData.total ? consecutiveSentencesData.total : 0;
  const consecutiveScore = consecutiveIssues === 0 ? 9 : consecutiveIssues <= 2 ? 6 : 3;
  const consecutiveText = consecutiveIssues === 0
    ? "Perfect! No consecutive sentences start with the same word."
    : `${consecutiveIssues} consecutive sentences start with the same word. Vary your sentence beginnings.`;

  // Check keyword in title
  const titleHasKeyword = title.toLowerCase().includes(keyword.toLowerCase());
  const keywordInTitleScore = titleHasKeyword ? 9 : 3;
  const keywordInTitleText = titleHasKeyword
    ? "Excellent! Focus keyword appears at the beginning of the title (100% match)."
    : "Focus keyword not found in title.";

  // Check keyword in meta description
  const metaHasKeyword = metaDescription.toLowerCase().includes(keyword.toLowerCase());
  const keywordInMetaScore = metaHasKeyword ? 9 : 3;
  const keywordInMetaText = metaHasKeyword
    ? "Great! Focus keyword appears in first 10 words of meta (100% match)."
    : "Focus keyword not found in meta description.";

  // Check keyword in introduction (first 100 words)
  const first100Words = plainText.split(/\s+/).slice(0, 100).join(' ');
  const introHasKeyword = first100Words.toLowerCase().includes(keyword.toLowerCase());
  const keywordInIntroScore = introHasKeyword ? 9 : 3;
  const keywordInIntroText = introHasKeyword
    ? "Perfect! Focus keyword appears in the first 100 words (100% match)."
    : "Focus keyword not found in first 100 words.";

  // Calculate keyword density
  const keywordOccurrences = (plainText.toLowerCase().match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
  const keywordDensity = wordCount > 0 ? (keywordOccurrences / wordCount) * 100 : 0;
  const densityScore = keywordDensity >= 1.0 && keywordDensity <= 2.5 ? 9 : keywordDensity >= 0.5 && keywordDensity < 1.0 ? 6 : 3;
  const densityText = keywordDensity >= 1.0 && keywordDensity <= 2.5
    ? `Perfect! Keyword density is ${keywordDensity.toFixed(1)}% (${keywordOccurrences} times in ${wordCount} words).`
    : keywordDensity < 1.0
    ? `Keyword density is ${keywordDensity.toFixed(1)}% (${keywordOccurrences} times in ${wordCount} words). Add more keyword occurrences.`
    : `Keyword density is ${keywordDensity.toFixed(1)}% (${keywordOccurrences} times in ${wordCount} words). Reduce keyword usage.`;

  // Content length check
  const lengthScore = wordCount >= 300 ? 9 : wordCount >= 200 ? 6 : 3;
  const lengthText = wordCount >= 300
    ? `Excellent! Content is ${wordCount} words (300+ recommended for product pages).`
    : `Content is ${wordCount} words. Add ${300 - wordCount} more words (minimum 300 recommended).`;

  // Calculate overall score (average of all checks)
  const allScores = [
    fleschScore, listsScore, paragraphScore, sentenceLengthScore,
    transitionScore, passiveScore, consecutiveScore,
    keywordInTitleScore, keywordInMetaScore, keywordInIntroScore,
    densityScore, lengthScore
  ];
  const overallScore = Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100 / 9);

  return {
    overallScore,
    seoChecks: {
      keywordInTitle: { score: keywordInTitleScore, text: keywordInTitleText },
      keywordInMeta: { score: keywordInMetaScore, text: keywordInMetaText },
      keywordInIntro: { score: keywordInIntroScore, text: keywordInIntroText },
      keywordDensity: { score: densityScore, text: densityText, density: keywordDensity },
      contentLength: { score: lengthScore, text: lengthText, wordCount }
    },
    readabilityChecks: {
      fleschScore: { score: fleschScore, text: fleschText, fleschValue },
      paragraphLength: { score: paragraphScore, text: paragraphText, issues: longParagraphs },
      sentenceLength: { score: sentenceLengthScore, text: sentenceLengthText, percentage: sentenceLengthPercentage },
      transitionWords: { score: transitionScore, text: transitionText, percentage: transitionPercentage },
      passiveVoice: { score: passiveScore, text: passiveText, percentage: passivePercentage },
      consecutiveSentences: { score: consecutiveScore, text: consecutiveText, issues: consecutiveIssues },
      listsPresent: { score: listsScore, text: listsText, hasLists: listsExist }
    }
  };
}
