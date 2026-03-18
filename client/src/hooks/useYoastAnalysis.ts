/**
 * React Hook for YoastSEO Content Analysis
 *
 * Usage:
 * const { analyze, analyzing, result } = useYoastAnalysis();
 *
 * await analyze({
 *   title: "Product Title",
 *   metaDescription: "Meta description...",
 *   description: "Full product description...",
 *   keyword: "target keyword"
 * });
 */

import { useState, useCallback } from 'react';
import { analyzeContent, type YoastAnalysisResult, type AnalyzeContentParams } from '../utils/yoast-analyzer';

export function useYoastAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<YoastAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (params: AnalyzeContentParams) => {
    setAnalyzing(true);
    setError(null);

    try {
      const analysis = await analyzeContent(params);
      setResult(analysis);
      return analysis;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze content';
      setError(errorMessage);
      console.error('Yoast analysis error:', err);
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    analyze,
    analyzing,
    result,
    error,
    reset
  };
}
