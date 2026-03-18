/**
 * Keyword Research Panel
 *
 * Displays Google Trends keyword analysis and suggestions for SEO optimization.
 * Shows keyword variations, search interest, and trending terms.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, TrendingUp, Search, Lightbulb, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, CirclePlus, HelpCircle, Award } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface KeywordComparison {
  keyword: string;
  relativeInterest: number; // For Google Trends (0-100%)
  monthlySearches?: number; // For Google Ads API (actual monthly searches)
  competition?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'; // Google Ads competition level
  competitionIndex?: number; // 0-100 competition index
  isHighest: boolean;
  keywordType?: 'short-tail' | 'long-tail' | 'ultra-long-tail'; // Keyword length classification
}

interface KeywordSuggestion {
  original: string;
  variations: KeywordComparison[];
  recommended: string;
  recommendedScore: number;
}

interface FocusKeywordSuggestion {
  focusKeyword: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

interface KeywordResearchPanelProps {
  productName: string;
  brand?: string;
  category?: string;
  googleCategory?: { name: string; path?: string; fullPath?: string; gender?: string } | null;
  description?: string;
  material?: string;
  color?: string;
  onSelectKeyword?: (keyword: string) => void;
}

// Helper function to classify keyword by length
function classifyKeywordType(keyword: string): 'short-tail' | 'long-tail' | 'ultra-long-tail' {
  const wordCount = keyword.trim().split(/\s+/).length;

  if (wordCount <= 2) {
    return 'short-tail';
  } else if (wordCount <= 4) {
    return 'long-tail'; // OPTIMAL for conversion (2.5x higher)
  } else {
    return 'ultra-long-tail';
  }
}

export function KeywordResearchPanel({
  productName,
  brand,
  category,
  googleCategory,
  description,
  material,
  color,
  onSelectKeyword
}: KeywordResearchPanelProps) {
  const { toast } = useToast();
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [variationsExpanded, setVariationsExpanded] = useState(true);

  // Suggest focus keyword based on Google Trends (AI-powered with Gemini)
  const suggestMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/keywords/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          brand,
          category,
          googleCategory,
          description,
          material,
          color
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to suggest keyword');
      }

      return response.json() as Promise<FocusKeywordSuggestion>;
    }
  });

  // Compare keyword variations (AI-powered with Gemini)
  const compareMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/keywords/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          brand,
          category,
          googleCategory,
          description,
          material,
          color
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to compare keywords');
      }

      return response.json() as Promise<KeywordSuggestion>;
    }
  });

  // Get related queries for selected keyword
  const { data: relatedData } = useQuery({
    queryKey: ['related-keywords', selectedKeyword],
    queryFn: async () => {
      if (!selectedKeyword) return null;

      const response = await fetch(`/api/keywords/related/${encodeURIComponent(selectedKeyword)}`, {
        credentials: "include",
      });

      if (!response.ok) return null;

      return response.json() as Promise<{ keyword: string; related: string[] }>;
    },
    enabled: !!selectedKeyword
  });

  // Auto-suggest only when Google category changes (user has confirmed correct category)
  // Do NOT auto-run on initial file upload (let user review data first)
  const [previousGoogleCategory, setPreviousGoogleCategory] = useState<string | null>(null);

  useEffect(() => {
    const currentCategory = googleCategory?.fullPath || null;

    // Only trigger if:
    // 1. Google category has changed (not initial load)
    // 2. User has selected a Google category (not auto-detected category)
    if (currentCategory && previousGoogleCategory !== null && currentCategory !== previousGoogleCategory) {
      suggestMutation.mutate();
      compareMutation.mutate();
    }

    setPreviousGoogleCategory(currentCategory);
  }, [googleCategory]);

  // Auto-select the suggested keyword when AI returns a suggestion
  useEffect(() => {
    if (suggestMutation.data && suggestMutation.data.focusKeyword) {
      setSelectedKeyword(suggestMutation.data.focusKeyword);
      onSelectKeyword?.(suggestMutation.data.focusKeyword);
    }
  }, [suggestMutation.data]);

  const handleAnalyzeVariations = () => {
    // Run both suggestion and comparison for complete analysis
    suggestMutation.mutate();
    compareMutation.mutate();
  };

  const handleSelectKeyword = (keyword: string) => {
    setSelectedKeyword(keyword);
    onSelectKeyword?.(keyword);

    // Auto-collapse variations panel after selection
    setVariationsExpanded(false);

    // Show confirmation toast
    toast({
      title: "Focus Keyword Updated",
      description: `Using "${keyword}" for SEO analysis`,
    });
  };

  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return <Badge variant="default" className="bg-green-500">High Confidence</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium Confidence</Badge>;
      case 'low':
        return <Badge variant="outline">Low Confidence</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Keyword Research
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-md p-4" side="right">
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">🎯 Focus Keyword Strategy</h4>
                  <div className="space-y-2 text-xs">
                    <p><strong>What is a Focus Keyword?</strong></p>
                    <p className="text-muted-foreground">
                      The main search term you want this product page to rank for. It's a writing tool that helps optimize your content - it doesn't directly affect SEO, but the keywords in your content do!
                    </p>

                    <p><strong>Branded vs. Non-Branded:</strong></p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li><strong>Branded</strong> (e.g., "EPTM Cargo Pants"): Higher conversion (25-40% boost), 50%+ CTR, ready-to-buy customers</li>
                      <li><strong>Non-Branded</strong> (e.g., "Baggy Cargo Pants"): More traffic, wider reach, research-phase customers</li>
                    </ul>

                    <p><strong>Best Formula:</strong></p>
                    <p className="text-muted-foreground">
                      <strong>Brand + Product Type</strong> (3-4 words)<br/>
                      ✅ "EPTM Freeway Pants"<br/>
                      ✅ "Ethika Sport Boxers"<br/>
                      ❌ "EPTM" (too broad)<br/>
                      ❌ "Men's Black Cargo Pants Size 32" (too specific)
                    </p>

                    <p><strong>Keyword Density:</strong></p>
                    <p className="text-muted-foreground">
                      Use focus keyword 3-4 times in 300 words (0.5-1.5% density). Over 3% = keyword stuffing penalty!
                    </p>

                    <p className="text-green-600 font-medium">💡 Long-tail branded keywords = 2.5x higher conversion!</p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>
          Google Trends analysis for SEO optimization
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* SELECTED FOCUS KEYWORD - PROMINENT DISPLAY AT TOP */}
        {selectedKeyword && (
          <div className="space-y-3 mb-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-6 w-6" />
                Your Selected Focus Keyword
              </h3>
            </div>
            <div className="p-8 bg-blue-50 dark:bg-blue-950 rounded-xl border-4 border-blue-500 shadow-lg">
              <div className="text-center">
                <code className="text-5xl font-black text-blue-600 dark:text-blue-400 tracking-wide">
                  {selectedKeyword}
                </code>
              </div>
              <p className="text-base text-center text-muted-foreground mt-4 font-medium">
                This keyword will be used for SEO analysis and optimization
              </p>
            </div>
          </div>
        )}

        {/* Focus Keyword Suggestion */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Suggested Focus Keyword
            </h3>
            {suggestMutation.data && getConfidenceBadge(suggestMutation.data.confidence)}
          </div>

          {suggestMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing search trends...
            </div>
          )}

          {suggestMutation.data && (
            <div className="space-y-2">
              <div className="p-6 bg-primary/5 rounded-lg border-2 border-primary">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {suggestMutation.data.focusKeyword}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSelectKeyword(suggestMutation.data!.focusKeyword)}
                    variant={selectedKeyword === suggestMutation.data!.focusKeyword ? "default" : "outline"}
                    disabled={selectedKeyword === suggestMutation.data!.focusKeyword}
                  >
                    <CirclePlus className="h-4 w-4 mr-1" />
                    {selectedKeyword === suggestMutation.data!.focusKeyword ? "Selected" : "Use This"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {suggestMutation.data.reasoning}
                </p>
              </div>
            </div>
          )}

          {suggestMutation.isError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {suggestMutation.error.message}
            </div>
          )}
        </div>

        {/* Keyword Variation Analysis */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Search className="h-4 w-4" />
              Keyword Variations
            </h3>
            <div className="flex gap-2">
              {compareMutation.data && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setVariationsExpanded(!variationsExpanded)}
                >
                  {variationsExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Collapse
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Expand
                    </>
                  )}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleAnalyzeVariations}
                disabled={compareMutation.isPending || suggestMutation.isPending}
              >
                {(compareMutation.isPending || suggestMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Run Full Analysis'
                )}
              </Button>
            </div>
          </div>

          {compareMutation.data && variationsExpanded && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              <p className="text-xs text-muted-foreground mb-3">
                Testing {compareMutation.data.variations.length} keyword variations to find optimal search terms
              </p>
              {compareMutation.data.variations.map((variation, idx) => {
                // Categorize keyword type (branded vs generic)
                const isGeneric = !variation.keyword.toLowerCase().includes(brand?.toLowerCase() || '___');
                const keywordType = isGeneric ? 'Generic' : 'Branded';

                // Check if this is the AI-recommended keyword
                const isRecommended = suggestMutation.data?.focusKeyword === variation.keyword;

                // Classify keyword length type (use backend value or calculate)
                const lengthType = variation.keywordType || classifyKeywordType(variation.keyword);

                // Get badge styling for keyword length type
                const getLengthTypeBadge = () => {
                  switch (lengthType) {
                    case 'short-tail':
                      return { label: 'Short-tail', className: 'bg-orange-50 text-orange-700 border-orange-300' };
                    case 'long-tail':
                      return { label: 'Long-tail ⭐', className: 'bg-green-50 text-green-700 border-green-300 font-semibold' };
                    case 'ultra-long-tail':
                      return { label: 'Ultra long-tail', className: 'bg-gray-50 text-gray-700 border-gray-300' };
                  }
                };

                const lengthBadge = getLengthTypeBadge();

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-md border ${
                      isRecommended
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md'
                        : variation.isHighest
                        ? 'border-green-500 bg-green-50 dark:bg-green-950'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{variation.keyword}</span>
                        {isRecommended && (
                          <Badge variant="default" className="bg-blue-600 text-white">
                            <Award className="h-3 w-3 mr-1" />
                            Recommended
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {keywordType}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs ${lengthBadge.className}`}
                          title={lengthType === 'long-tail' ? '2.5x higher conversion rate!' : ''}
                        >
                          {lengthBadge.label}
                        </Badge>
                        {variation.competition && variation.competition !== 'UNSPECIFIED' && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              variation.competition === 'LOW' ? 'bg-green-50 text-green-700 border-green-300' :
                              variation.competition === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700 border-yellow-300' :
                              'bg-red-50 text-red-700 border-red-300'
                            }`}
                          >
                            {variation.competition}
                          </Badge>
                        )}
                      </div>
                      {variation.isHighest && !isRecommended && (
                        <Badge variant="default" className="bg-green-500">
                          Highest
                        </Badge>
                      )}
                    </div>

                  {/* Interest Bar */}
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full ${
                        isRecommended ? 'bg-blue-600' :
                        variation.isHighest ? 'bg-green-500' : 'bg-primary'
                      }`}
                      style={{ width: `${variation.relativeInterest}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      {variation.monthlySearches !== undefined ? (
                        `${variation.monthlySearches.toLocaleString()} searches/month`
                      ) : (
                        `Search Interest: ${variation.relativeInterest}%`
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant={selectedKeyword === variation.keyword ? "default" : "ghost"}
                      className="h-6 text-xs"
                      onClick={() => handleSelectKeyword(variation.keyword)}
                      disabled={selectedKeyword === variation.keyword}
                    >
                      {selectedKeyword === variation.keyword ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Selected
                        </>
                      ) : (
                        'Select'
                      )}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Collapsed Summary */}
          {compareMutation.data && !variationsExpanded && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                Analyzed {compareMutation.data.variations.length} variations.
                Top result: <span className="font-semibold text-foreground">{compareMutation.data.recommended}</span> ({compareMutation.data.recommendedScore}% interest)
              </p>
            </div>
          )}
        </div>

        {/* Related Queries */}
        {selectedKeyword && relatedData && relatedData.related.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Related Queries</h3>
            <div className="flex flex-wrap gap-2">
              {relatedData.related.map((query, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80"
                  onClick={() => handleSelectKeyword(query)}
                >
                  {query}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Info Note */}
        <div className="p-3 bg-muted rounded-md text-xs text-muted-foreground">
          <p>
            💡 <strong>Tip:</strong> Google Trends data shows relative search interest over the last 90 days.
            Higher scores indicate more popular search terms. Use the recommended keyword for better SEO performance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
