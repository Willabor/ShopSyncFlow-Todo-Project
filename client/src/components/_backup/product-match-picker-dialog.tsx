/**
 * Product Match Picker Dialog
 *
 * Shows multiple product matches from a brand website when enriching a product.
 * User can select which product to map to their internal style number.
 *
 * Example scenario:
 * - User has style number "PD-T-003 3D TOPPER" from Excel
 * - System finds multiple matches on Premium Disaster website:
 *   1. "MENS CLASSIC ULTRA STRETCH DENIM - JET BLACK 3D (PD-T-003)" (95% confidence, matched "PD-T-003")
 *   2. "MENS TOPPER DENIM - BLACK (PDT003)" (75% confidence, matched "PDT003")
 * - User selects the correct one
 * - Mapping is saved for future enrichments
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, ExternalLink, Info } from "lucide-react";
import { useState } from "react";

export interface ProductMatchOption {
  // Product identifiers
  brandProductHandle: string;
  brandProductTitle: string;
  brandProductUrl: string;

  // Match metadata
  matchedBy: 'SKU' | 'Style in Title' | 'Style Variation in Title' | 'Name + Color' | 'Name Only';
  matchedVariation?: string; // Which style number variation matched
  confidence: number; // 0-1 (1.0 = 100%)

  // Product preview data
  imageUrl?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
}

interface ProductMatchPickerDialogProps {
  isOpen: boolean;
  ourStyleNumber: string; // "PD-T-003 3D TOPPER"
  productName: string; // "Mens Classic Denim"
  matches: ProductMatchOption[];
  onSelectMatch: (selectedMatch: ProductMatchOption) => void;
  onCreateNew: () => void; // User wants to create new product (no mapping)
  onCancel: () => void;
}

export function ProductMatchPickerDialog({
  isOpen,
  ourStyleNumber,
  productName,
  matches,
  onSelectMatch,
  onCreateNew,
  onCancel,
}: ProductMatchPickerDialogProps) {
  const [selectedHandle, setSelectedHandle] = useState<string | null>(
    matches.length > 0 ? matches[0].brandProductHandle : null
  );

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.95) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (confidence >= 0.85) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    if (confidence >= 0.75) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.95) return 'Excellent';
    if (confidence >= 0.85) return 'Good';
    if (confidence >= 0.75) return 'Fair';
    return 'Uncertain';
  };

  const handleConfirm = () => {
    const selected = matches.find(m => m.brandProductHandle === selectedHandle);
    if (selected) {
      onSelectMatch(selected);
    }
  };

  if (matches.length === 0) {
    return null; // Should not happen, but safeguard
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onCancel}>
      <AlertDialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Multiple Products Found
          </AlertDialogTitle>
          <AlertDialogDescription>
            Found {matches.length} product{matches.length > 1 ? 's' : ''} matching style number "{ourStyleNumber}" on the brand website.
            Select which product you want to map to "{productName}".
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Product Matches List */}
        <div className="space-y-4">
          <RadioGroup value={selectedHandle || ""} onValueChange={setSelectedHandle}>
            {matches.map((match, index) => (
              <div key={match.brandProductHandle} className="relative">
                <div
                  className={`
                    flex items-start gap-4 p-4 border rounded-lg cursor-pointer transition-all
                    ${selectedHandle === match.brandProductHandle
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'}
                  `}
                  onClick={() => setSelectedHandle(match.brandProductHandle)}
                >
                  {/* Radio Button */}
                  <div className="pt-1">
                    <RadioGroupItem
                      value={match.brandProductHandle}
                      id={`match-${index}`}
                      className="cursor-pointer"
                    />
                  </div>

                  {/* Product Image (if available) */}
                  {match.imageUrl && (
                    <div className="flex-shrink-0">
                      <img
                        src={match.imageUrl}
                        alt={match.brandProductTitle}
                        className="w-24 h-24 object-cover rounded border border-gray-200 dark:border-gray-700"
                      />
                    </div>
                  )}

                  {/* Product Details */}
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`match-${index}`}
                      className="cursor-pointer font-medium text-gray-900 dark:text-gray-100"
                    >
                      {match.brandProductTitle}
                    </Label>

                    {/* Metadata Badges */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge className={getConfidenceColor(match.confidence)}>
                        {getConfidenceText(match.confidence)} ({Math.round(match.confidence * 100)}%)
                      </Badge>

                      <Badge variant="outline" className="text-xs">
                        Matched: {match.matchedVariation || match.matchedBy}
                      </Badge>

                      <Badge variant="outline" className="text-xs">
                        {match.matchedBy}
                      </Badge>
                    </div>

                    {/* Product Link */}
                    <a
                      href={match.brandProductUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View on brand website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {/* Top Match Indicator */}
                  {index === 0 && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Best Match
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Info Box */}
        <Separator />
        <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
            What happens next?
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Your selection will be saved as a mapping. Future enrichments for "{ourStyleNumber}"
            will automatically use the selected product without asking again.
          </p>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onCancel}>
            Cancel
          </AlertDialogCancel>

          <Button
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              onCreateNew();
            }}
          >
            None of these (Create New)
          </Button>

          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!selectedHandle}
            className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
          >
            Confirm & Save Mapping
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
