import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { VariantEditorHeader, type SaveStatus } from "./VariantEditorHeader";
import { VariantEditorSidebar } from "./VariantEditorSidebar";
import { VariantEditorForm } from "./VariantEditorForm";
import { SaveStatusFooter } from "./SaveStatusFooter";
import type { ProductVariant } from "@shared/schema";

interface VariantEditorDialogProps {
  productId: string;
  variantId: string | null; // null = closed
  onClose: () => void;
}

export function VariantEditorDialog({
  productId,
  variantId,
  onClose,
}: VariantEditorDialogProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(variantId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Update selectedVariantId when variantId prop changes
  useEffect(() => {
    if (variantId) {
      setSelectedVariantId(variantId);
    }
  }, [variantId]);

  // Fetch all variants
  const { data: variants = [], isLoading } = useQuery<ProductVariant[]>({
    queryKey: ["variants", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch variants");
      return res.json();
    },
    enabled: !!productId && !!variantId,
  });

  // Get selected variant
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId),
    [variants, selectedVariantId]
  );

  // Navigation
  const currentIndex = useMemo(
    () => variants.findIndex((v) => v.id === selectedVariantId),
    [variants, selectedVariantId]
  );

  const canGoToPrevious = currentIndex > 0;
  const canGoToNext = currentIndex < variants.length - 1;

  const goToPrevious = () => {
    if (canGoToPrevious) {
      setSelectedVariantId(variants[currentIndex - 1].id);
    }
  };

  const goToNext = () => {
    if (canGoToNext) {
      setSelectedVariantId(variants[currentIndex + 1].id);
    }
  };

  // Handle save status changes
  const handleSaveStatusChange = (status: SaveStatus) => {
    setSaveStatus(status);
    if (status === "saved") {
      setLastSavedAt(new Date());
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!variantId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "ArrowRight") {
        e.preventDefault();
        goToNext();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [variantId, onClose, currentIndex, variants.length]);

  if (!variantId || !selectedVariant) {
    return null;
  }

  return (
    <Dialog open={!!variantId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-7xl h-[90vh] p-0 gap-0">
        {/* Header */}
        <VariantEditorHeader
          variant={selectedVariant}
          productId={productId}
          saveStatus={saveStatus}
          onBack={onClose}
        />

        {/* Main content: Sidebar + Form */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <VariantEditorSidebar
            variants={variants}
            selectedVariantId={selectedVariantId}
            onSelectVariant={setSelectedVariantId}
            onClose={onClose}
          />

          {/* Form */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <VariantEditorForm
              variant={selectedVariant}
              productId={productId}
              onSaveStatusChange={handleSaveStatusChange}
              canGoToPrevious={canGoToPrevious}
              canGoToNext={canGoToNext}
              onGoToPrevious={goToPrevious}
              onGoToNext={goToNext}
            />

            {/* Footer */}
            <SaveStatusFooter lastSavedAt={lastSavedAt} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
