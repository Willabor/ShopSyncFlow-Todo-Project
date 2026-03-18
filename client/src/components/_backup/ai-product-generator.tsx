import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Sparkles, CheckCircle } from "lucide-react";

/**
 * AI Product Generator Component
 *
 * Reusable AI generation panel extracted from Content Studio.
 * Generates SEO-optimized product content using existing API endpoints.
 *
 * Features:
 * - Title generation (5 variations)
 * - Description generation (150-300 words)
 * - Meta title + description generation
 * - Keyword/tag suggestions
 *
 * @example
 * <AIProductGenerator
 *   productName="Nike Air Jordan 1"
 *   vendor="Nike"
 *   category="Footwear"
 *   onTitleSelected={(title) => setProductTitle(title)}
 *   onDescriptionGenerated={(desc) => setProductDescription(desc)}
 * />
 */

interface AIProductGeneratorProps {
  // Product context for AI
  productName: string;
  vendor: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  price?: string;
  color?: string;
  features?: string[];

  // Callbacks to update parent component
  onTitleSelected?: (title: string) => void;
  onDescriptionGenerated?: (description: string) => void;
  onMetaGenerated?: (metaTitle: string, metaDescription: string) => void;
  onKeywordsGenerated?: (keywords: string[]) => void;

  // Optional: Pre-filled values (for edit mode)
  initialTitle?: string;
  initialDescription?: string;

  // Optional: Control what features to show
  enabledFeatures?: {
    title?: boolean;
    description?: boolean;
    meta?: boolean;
    keywords?: boolean;
  };

  // Optional: Custom styling
  className?: string;
}

export function AIProductGenerator({
  productName,
  vendor,
  category,
  description,
  imageUrl,
  price,
  color,
  features: productFeatures,
  onTitleSelected,
  onDescriptionGenerated,
  onMetaGenerated,
  onKeywordsGenerated,
  initialTitle,
  initialDescription,
  enabledFeatures = {
    title: true,
    description: true,
    meta: true,
    keywords: true,
  },
  className,
}: AIProductGeneratorProps) {
  const { toast } = useToast();

  // Title generation state
  const [titleVariations, setTitleVariations] = useState<string[]>([]);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null);
  const [showTitleSelector, setShowTitleSelector] = useState(false);

  // Generated content state
  const [generatedDescription, setGeneratedDescription] = useState<string>(initialDescription || "");
  const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
  const [generatedMeta, setGeneratedMeta] = useState<{
    metaTitle: string;
    metaDescription: string;
  } | null>(null);

  // Computed: selected title
  const selectedTitle = selectedTitleIndex !== null && titleVariations.length > 0
    ? titleVariations[selectedTitleIndex]
    : initialTitle || "";

  // ========================================
  // API MUTATIONS
  // ========================================

  const generateTitleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          category,
          brand: vendor,
          color,
          price,
          keyFeatures: productFeatures,
          vendorDescription: description,
          imageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate titles");
      }

      const data = await response.json();
      return data.titles;
    },
    onSuccess: (titles: string[]) => {
      setTitleVariations(titles);
      setShowTitleSelector(true);
      setSelectedTitleIndex(null);
      toast({
        title: `${titles.length} Titles Generated`,
        description: "Select your preferred variation below",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Title Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateDescriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          category,
          brand: vendor,
          price,
          keyFeatures: productFeatures,
          vendorDescription: description,
          selectedTitle: selectedTitle, // Use selected title for context
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate description");
      }

      const data = await response.json();
      return data.description;
    },
    onSuccess: (description: string) => {
      setGeneratedDescription(description);
      if (onDescriptionGenerated) {
        onDescriptionGenerated(description);
      }
      toast({
        title: "Description Generated",
        description: `${description.length} characters`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Description Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateMetaMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          category,
          brand: vendor,
          selectedTitle: selectedTitle,
          generatedDescription: generatedDescription,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate meta data");
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data: { metaTitle: string; metaDescription: string }) => {
      setGeneratedMeta(data);
      if (onMetaGenerated) {
        onMetaGenerated(data.metaTitle, data.metaDescription);
      }
      toast({
        title: "SEO Meta Generated",
        description: "Meta title and description created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Meta Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateKeywordsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          category,
          brand: vendor,
          description: generatedDescription,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate keywords");
      }

      const data = await response.json();
      return data.keywords;
    },
    onSuccess: (keywords: string[]) => {
      setGeneratedKeywords(keywords);
      if (onKeywordsGenerated) {
        onKeywordsGenerated(keywords);
      }
      toast({
        title: "Keywords Generated",
        description: `${keywords.length} keywords created`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Keyword Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ========================================
  // EVENT HANDLERS
  // ========================================

  const handleTitleSelection = (index: number) => {
    setSelectedTitleIndex(index);
    if (onTitleSelected && titleVariations[index]) {
      onTitleSelected(titleVariations[index]);
    }
  };

  const handleGenerateAll = async () => {
    // Sequential generation: Title → Description → Meta → Keywords
    try {
      await generateTitleMutation.mutateAsync();
      // Wait for user to select title before continuing
      toast({
        title: "Step 1 Complete",
        description: "Select a title to continue",
      });
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleContinueWithTitle = async () => {
    if (!selectedTitle) {
      toast({
        title: "No Title Selected",
        description: "Please select a title variation first",
        variant: "destructive",
      });
      return;
    }

    // Continue with description → meta → keywords
    try {
      await generateDescriptionMutation.mutateAsync();
      await generateMetaMutation.mutateAsync();
      await generateKeywordsMutation.mutateAsync();
      toast({
        title: "All Content Generated!",
        description: "Review and edit as needed",
      });
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Content Generator
        </CardTitle>
        <CardDescription>
          Generate SEO-optimized product content using AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* TITLE GENERATION */}
        {enabledFeatures.title && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Product Title</Label>
              {selectedTitle && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Selected
                </Badge>
              )}
            </div>

            <Button
              onClick={() => generateTitleMutation.mutate()}
              disabled={generateTitleMutation.isPending}
              className="w-full"
              variant={titleVariations.length > 0 ? "outline" : "default"}
            >
              {generateTitleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Titles...
                </>
              ) : titleVariations.length > 0 ? (
                "Regenerate Titles"
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Title Variations
                </>
              )}
            </Button>

            {/* Title Selector */}
            {showTitleSelector && titleVariations.length > 0 && (
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <Label className="text-sm font-medium">
                  Select your preferred title:
                </Label>
                <RadioGroup
                  value={selectedTitleIndex !== null ? String(selectedTitleIndex) : undefined}
                  onValueChange={(value) => handleTitleSelection(parseInt(value))}
                >
                  {titleVariations.map((title, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <RadioGroupItem value={String(index)} id={`title-${index}`} />
                      <label
                        htmlFor={`title-${index}`}
                        className="text-sm font-medium leading-relaxed cursor-pointer flex-1"
                      >
                        {title}
                        <span className="text-xs text-muted-foreground ml-2">
                          ({title.length} chars)
                        </span>
                      </label>
                    </div>
                  ))}
                </RadioGroup>

                {selectedTitleIndex !== null && (
                  <Button
                    onClick={handleContinueWithTitle}
                    className="w-full mt-4"
                    disabled={
                      generateDescriptionMutation.isPending ||
                      generateMetaMutation.isPending ||
                      generateKeywordsMutation.isPending
                    }
                  >
                    {generateDescriptionMutation.isPending ||
                    generateMetaMutation.isPending ||
                    generateKeywordsMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Content...
                      </>
                    ) : (
                      "Continue with Selected Title →"
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* DESCRIPTION GENERATION */}
        {enabledFeatures.description && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Product Description</Label>
              {generatedDescription && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Generated
                </Badge>
              )}
            </div>

            {generatedDescription && (
              <Textarea
                value={generatedDescription}
                onChange={(e) => {
                  setGeneratedDescription(e.target.value);
                  if (onDescriptionGenerated) {
                    onDescriptionGenerated(e.target.value);
                  }
                }}
                rows={8}
                className="font-sans"
              />
            )}

            <Button
              onClick={() => generateDescriptionMutation.mutate()}
              disabled={!selectedTitle || generateDescriptionMutation.isPending}
              className="w-full"
              variant={generatedDescription ? "outline" : "default"}
            >
              {generateDescriptionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Description...
                </>
              ) : generatedDescription ? (
                "Regenerate Description"
              ) : (
                "Generate Description"
              )}
            </Button>
          </div>
        )}

        {/* META GENERATION */}
        {enabledFeatures.meta && generatedMeta && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">SEO Meta Data</Label>

            <div className="space-y-2">
              <Label className="text-sm">Meta Title</Label>
              <Input
                value={generatedMeta.metaTitle}
                onChange={(e) => {
                  setGeneratedMeta({
                    ...generatedMeta,
                    metaTitle: e.target.value,
                  });
                  if (onMetaGenerated) {
                    onMetaGenerated(e.target.value, generatedMeta.metaDescription);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {generatedMeta.metaTitle.length} / 60 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Meta Description</Label>
              <Textarea
                value={generatedMeta.metaDescription}
                onChange={(e) => {
                  setGeneratedMeta({
                    ...generatedMeta,
                    metaDescription: e.target.value,
                  });
                  if (onMetaGenerated) {
                    onMetaGenerated(generatedMeta.metaTitle, e.target.value);
                  }
                }}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {generatedMeta.metaDescription.length} / 160 characters
              </p>
            </div>
          </div>
        )}

        {/* KEYWORDS GENERATION */}
        {enabledFeatures.keywords && generatedKeywords.length > 0 && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">Keywords / Tags</Label>
            <div className="flex flex-wrap gap-2">
              {generatedKeywords.map((keyword, index) => (
                <Badge key={index} variant="secondary">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* QUICK ACTION: Generate All */}
        {!titleVariations.length && (
          <Button
            onClick={handleGenerateAll}
            className="w-full"
            size="lg"
            disabled={generateTitleMutation.isPending}
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Generate All Content
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
