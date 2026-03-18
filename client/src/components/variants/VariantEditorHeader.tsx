import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProductVariant } from "@shared/schema";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface VariantEditorHeaderProps {
  variant: ProductVariant;
  productId: string;
  saveStatus: SaveStatus;
  onBack: () => void;
}

export function VariantEditorHeader({
  variant,
  productId,
  saveStatus,
  onBack,
}: VariantEditorHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete variant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Variant deleted" });
      onBack();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete variant",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    const variantTitle = [variant.option1, variant.option2, variant.option3]
      .filter(Boolean)
      .join(" / ");

    const confirmed = window.confirm(
      `Delete variant "${variantTitle}"? This cannot be undone.`
    );

    if (confirmed) {
      deleteMutation.mutate();
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between border-b px-6 py-4 bg-background sticky top-0 z-10">
        {/* Left: Back button */}
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to variants
        </Button>

        {/* Center: Save status - More prominent */}
        <div className="flex items-center gap-3">
          {saveStatus === "saving" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Saving changes...</span>
            </div>
          )}
          {saveStatus === "saved" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 border border-green-200 animate-in fade-in duration-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">All changes saved</span>
            </div>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">Error saving changes</span>
            </div>
          )}
          {saveStatus === "idle" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border cursor-help">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Auto-save enabled</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-sm">
                  Changes save automatically when you edit fields. No need to click a save button.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Right: Delete button */}
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </>
          )}
        </Button>
      </div>
    </TooltipProvider>
  );
}
