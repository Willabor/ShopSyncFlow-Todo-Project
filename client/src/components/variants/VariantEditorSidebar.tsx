import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { VariantListItem } from "./VariantListItem";
import type { ProductVariant } from "@shared/schema";

interface VariantEditorSidebarProps {
  variants: ProductVariant[];
  selectedVariantId: string | null;
  onSelectVariant: (id: string) => void;
  onClose: () => void;
}

export function VariantEditorSidebar({
  variants,
  selectedVariantId,
  onSelectVariant,
  onClose,
}: VariantEditorSidebarProps) {
  const currentIndex = useMemo(
    () => variants.findIndex((v) => v.id === selectedVariantId),
    [variants, selectedVariantId]
  );

  const canGoToPrevious = currentIndex > 0;
  const canGoToNext = currentIndex < variants.length - 1;

  const goToPrevious = () => {
    if (canGoToPrevious) {
      onSelectVariant(variants[currentIndex - 1].id);
    }
  };

  const goToNext = () => {
    if (canGoToNext) {
      onSelectVariant(variants[currentIndex + 1].id);
    }
  };

  return (
    <div className="w-60 border-r flex flex-col bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <h3 className="text-sm font-semibold">
          Variants ({variants.length})
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Variant list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {variants.map((variant) => (
            <VariantListItem
              key={variant.id}
              variant={variant}
              isActive={variant.id === selectedVariantId}
              onClick={() => onSelectVariant(variant.id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Navigation controls */}
      <div className="border-t p-3 bg-background space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={goToPrevious}
          disabled={!canGoToPrevious}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={goToNext}
          disabled={!canGoToNext}
        >
          <ChevronRight className="mr-2 h-4 w-4" />
          Next
        </Button>
      </div>
    </div>
  );
}
