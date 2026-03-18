import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: {
    url: string;
    altText?: string;
    index: number;
  } | null;
  productContext: {
    productId?: string;
    productTitle: string;
    brandName?: string;
    category?: string;
  };
  onSave: (altText: string) => Promise<void>;
  onGenerateAltText: (imageUrl: string) => Promise<string>;
}

export function ImageDetailModal({
  open,
  onOpenChange,
  image,
  productContext,
  onSave,
  onGenerateAltText,
}: ImageDetailModalProps) {
  const [altText, setAltText] = useState(image?.altText || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when image changes, with cleanup for unmount
  useEffect(() => {
    let isMounted = true;

    if (image && isMounted) {
      setAltText(image.altText || "");
      setError(null);
    }

    return () => {
      isMounted = false;
    };
  }, [image]);

  const handleGenerateAltText = async () => {
    if (!image) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await onGenerateAltText(image.url);
      setAltText(generated);
    } catch (err: any) {
      console.error("Failed to generate alt text:", err);
      setError(err.message || "Failed to generate alt text. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(altText);
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to save alt text:", err);
      setError(err.message || "Failed to save alt text. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const charCount = altText.length;
  const getCharCountColor = () => {
    if (charCount >= 80 && charCount <= 125) return "text-green-600";
    if (charCount >= 50 && charCount <= 200) return "text-yellow-600";
    return "text-red-600";
  };

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Image Details</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 overflow-y-auto">
          {/* Image Preview */}
          <div className="flex items-center justify-center bg-muted rounded-lg overflow-hidden min-h-[200px]">
            <img
              src={image.url}
              alt={altText || "Product image preview"}
              className="max-w-full max-h-[400px] object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23f0f0f0' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EImage Error%3C/text%3E%3C/svg%3E";
              }}
            />
          </div>

          {/* Info Panel */}
          <div className="space-y-4">
            {/* Alt Text */}
            <div className="space-y-2">
              <Label htmlFor="alt-text">Alt Text</Label>
              <Textarea
                id="alt-text"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder="Describe this image for accessibility and SEO..."
                className="min-h-[120px] resize-none"
                maxLength={512}
              />
              <div className="flex justify-between items-center text-xs">
                <span className={cn("font-medium", getCharCountColor())}>
                  {charCount}/512 characters
                </span>
                <span className="text-muted-foreground">
                  Recommended: 80-125 chars
                </span>
              </div>
            </div>

            {/* Generate with AI Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateAltText}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing image...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate with AI
                </>
              )}
            </Button>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            {/* Image Details */}
            <div className="border rounded-lg p-3 bg-muted/50 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4" />
                Image Details
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Position: {image.index === 0 ? "Primary" : `Image ${image.index + 1}`}</p>
                <p className="truncate" title={image.url}>URL: {image.url}</p>
                {productContext.productTitle && (
                  <p>Product: {productContext.productTitle}</p>
                )}
                {productContext.brandName && (
                  <p>Brand: {productContext.brandName}</p>
                )}
              </div>
            </div>

            {/* Alt Text Guidelines */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Alt Text Best Practices:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Start with the product type (not "Image of")</li>
                <li>Include color, material, and key features</li>
                <li>Keep it concise (80-125 characters)</li>
                <li>Use natural language</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center w-full sm:w-auto">
            Note: Alt text is stored locally during this editing session.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
