/**
 * Product Match Selector Dialog
 *
 * Displays when multiple products match a search, allowing user to select the correct one
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import type { ProductMatch, MultipleMatchesData } from "@/hooks/use-product-enrichment";

interface ProductMatchSelectorProps {
  multipleMatches: MultipleMatchesData | null;
  onSelectMatch: (match: ProductMatch) => void;
  onClose: () => void;
  isEnriching: boolean;
}

export function ProductMatchSelector({
  multipleMatches,
  onSelectMatch,
  onClose,
  isEnriching
}: ProductMatchSelectorProps) {
  if (!multipleMatches) return null;

  const handleSelect = (match: ProductMatch) => {
    onSelectMatch(match);
  };

  return (
    <Dialog open={!!multipleMatches && !isEnriching} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Multiple Products Found</DialogTitle>
          <DialogDescription>
            {multipleMatches.message}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {multipleMatches.matches.map((match, index) => (
            <button
              key={match.handle}
              onClick={() => handleSelect(match)}
              className="w-full p-4 border rounded-lg hover:bg-accent hover:border-primary transition-colors text-left group relative"
            >
              <div className="flex gap-4">
                {/* Product Image */}
                {match.imageUrl ? (
                  <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                    <img
                      src={match.imageUrl}
                      alt={match.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to placeholder if image fails to load
                        e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23e5e7eb" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 flex-shrink-0 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                    No Image
                  </div>
                )}

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-1 pr-8">{match.title}</div>

                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Match Type Badge */}
                    <Badge variant="secondary" className="text-xs">
                      {match.matchedBy}
                    </Badge>

                    {/* Confidence Score */}
                    <Badge
                      variant={match.confidence >= 90 ? "default" : "outline"}
                      className="text-xs"
                    >
                      {Math.round(match.confidence)}% match
                    </Badge>

                    {/* Matched Variation (if applicable) */}
                    {match.matchedVariation && (
                      <span className="text-xs text-muted-foreground">
                        Found: "{match.matchedVariation}"
                      </span>
                    )}
                  </div>

                  {/* Product Handle (for debugging) */}
                  <div className="text-xs text-muted-foreground mt-1">
                    Handle: {match.handle}
                  </div>
                </div>

                {/* Hover indicator */}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Check className="w-5 h-5 text-primary" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose} className="w-full">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
