/**
 * BulletPointEditor Component
 *
 * Edits product bullet points (Sales Points) for SEO-optimized product highlights.
 * Maps to Shopify metafields: custom.custom_sales_point_1 through custom_sales_point_5
 *
 * Features:
 * - 5 textarea inputs always visible
 * - Warning at 200 chars, error at 250 chars
 * - "Generate with AI" button
 * - Badge showing filled count
 */

import { useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";

export interface BulletPointEditorProps {
  /** Current bullet points array */
  value: string[];
  /** Callback when bullet points change */
  onChange: (bullets: string[]) => void;
  /** Optional focus keyword for AI generation */
  focusKeyword?: string;
  /** Callback for AI generation */
  onGenerateAI?: () => Promise<void>;
  /** Is AI generation in progress */
  isGenerating?: boolean;
  /** Maximum characters per bullet point (default 250) */
  maxChars?: number;
  /** Warning threshold for characters (default 200) */
  warnChars?: number;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Get the status of a bullet point based on character count
 */
function getBulletStatus(
  text: string,
  maxChars: number,
  warnChars: number
): {
  status: "valid" | "warning" | "error" | "empty";
  message: string;
  color: string;
  borderColor: string;
} {
  const length = text.length;

  if (length === 0) {
    return {
      status: "empty",
      message: "Empty",
      color: "text-gray-400",
      borderColor: "",
    };
  }

  if (length > maxChars) {
    return {
      status: "error",
      message: `${length - maxChars} over limit`,
      color: "text-red-600 dark:text-red-400",
      borderColor: "border-red-500 focus-visible:ring-red-500",
    };
  }

  if (length > warnChars) {
    return {
      status: "warning",
      message: "Approaching limit",
      color: "text-orange-600 dark:text-orange-400",
      borderColor: "border-orange-400 focus-visible:ring-orange-400",
    };
  }

  if (length < 50) {
    return {
      status: "warning",
      message: "Too short",
      color: "text-orange-600 dark:text-orange-400",
      borderColor: "",
    };
  }

  return {
    status: "valid",
    message: "Good length",
    color: "text-green-600 dark:text-green-400",
    borderColor: "",
  };
}

/**
 * Status icon component
 */
function StatusIcon({ status }: { status: "valid" | "warning" | "error" | "empty" }) {
  if (status === "error") {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }
  if (status === "warning") {
    return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  }
  if (status === "empty") {
    return null;
  }
  return <CheckCircle className="h-4 w-4 text-green-500" />;
}

export function BulletPointEditor({
  value,
  onChange,
  focusKeyword,
  onGenerateAI,
  isGenerating = false,
  maxChars = 250,
  warnChars = 200,
  disabled = false,
}: BulletPointEditorProps) {
  // Always ensure we have exactly 5 bullet points
  const bullets: string[] = [];
  for (let i = 0; i < 5; i++) {
    bullets[i] = value[i] || "";
  }

  // Count non-empty bullet points
  const filledCount = bullets.filter((b) => b && b.trim().length > 0).length;

  // Check for any errors
  const hasErrors = bullets.some((b) => b.length > maxChars);
  const hasWarnings = bullets.some(
    (b) => b.length > warnChars && b.length <= maxChars
  );

  // Update a single bullet point
  const updateBullet = useCallback(
    (index: number, newValue: string) => {
      const newBullets = [...bullets];
      newBullets[index] = newValue;
      onChange(newBullets);
    },
    [bullets, onChange]
  );

  return (
    <div className="w-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">Product Highlights</span>
          <Badge
            variant={
              hasErrors ? "destructive" : hasWarnings ? "secondary" : "default"
            }
            className={cn(
              "text-xs",
              !hasErrors && !hasWarnings && filledCount === 5 && "bg-green-600"
            )}
          >
            {filledCount}/5
          </Badge>
        </div>
        {onGenerateAI && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            onClick={onGenerateAI}
            disabled={isGenerating || disabled}
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isGenerating ? "Generating..." : "Generate with AI"}
          </Button>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground">
        5 SEO-optimized bullet points that highlight key product benefits. These sync to your Shopify product page.
        {focusKeyword && (
          <span className="ml-1">
            Focus keyword: <strong>"{focusKeyword}"</strong>
          </span>
        )}
      </p>

      {/* All 5 Bullet Points */}
      <div className="space-y-3">
        {bullets.map((bulletText, index) => {
          const bulletStatus = getBulletStatus(bulletText, maxChars, warnChars);

          return (
            <div key={index} className="space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor={`bullet-${index}`}
                  className="text-xs text-muted-foreground flex items-center gap-1"
                >
                  Highlight {index + 1}
                  <StatusIcon status={bulletStatus.status} />
                </Label>
                <span
                  className={cn("text-xs font-medium", bulletStatus.color)}
                  title={bulletStatus.message}
                >
                  {bulletText.length}/{maxChars}
                </span>
              </div>
              <Textarea
                id={`bullet-${index}`}
                value={bulletText}
                onChange={(e) => updateBullet(index, e.target.value)}
                placeholder={getPlaceholder(index)}
                className={cn(
                  "min-h-[60px] text-sm resize-none",
                  bulletStatus.borderColor
                )}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>

      {/* Validation Summary */}
      {(hasErrors || hasWarnings) && (
        <div
          className={cn(
            "p-2 rounded-md text-xs",
            hasErrors
              ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              : "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"
          )}
        >
          {hasErrors
            ? "Some bullet points exceed the 250 character limit. Please shorten them."
            : "Some bullet points are approaching the character limit."}
        </div>
      )}
    </div>
  );
}

/**
 * Get placeholder text for each bullet point
 */
function getPlaceholder(index: number): string {
  const placeholders = [
    "PREMIUM QUALITY - Crafted from high-quality materials ensuring long-lasting durability and comfort.",
    "PERFECT FIT - True-to-size design with modern cut flatters all body types.",
    "EASY CARE - Machine washable and maintains shape wash after wash.",
    "VERSATILE STYLE - Pairs effortlessly with any outfit for any occasion.",
    "SATISFACTION GUARANTEED - Backed by our hassle-free return policy.",
  ];
  return placeholders[index] || "Enter bullet point...";
}
