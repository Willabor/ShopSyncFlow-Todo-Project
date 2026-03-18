import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, MoreVertical, Trash2, Edit } from "lucide-react";
import type { ProductVariant } from "@shared/schema";

interface VariantRowProps {
  variant: ProductVariant;
  productId: string;
  isSelected: boolean;
  isExpanded: boolean;
  selectionMode: boolean;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onEdit?: () => void;
}

export function VariantRow({
  variant,
  productId,
  isSelected,
  isExpanded,
  selectionMode,
  onToggleSelect,
  onToggleExpand,
  onEdit,
}: VariantRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for inline editing
  const [price, setPrice] = useState(variant.price);
  const [quantity, setQuantity] = useState(variant.inventoryQuantity.toString());
  const [sku, setSku] = useState(variant.sku || "");

  // Editing state
  const [editingField, setEditingField] = useState<string | null>(null);

  // Construct title from option values
  const title = [variant.option1, variant.option2, variant.option3]
    .filter(Boolean)
    .join(" / ");

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<ProductVariant>) => {
      const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update variant");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Variant updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update variant",
        description: error.message,
        variant: "destructive",
      });
      // Revert to original values
      setPrice(variant.price);
      setQuantity(variant.inventoryQuantity.toString());
      setSku(variant.sku || "");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete variant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Variant deleted" });
    },
    onError: () => {
      toast({
        title: "Failed to delete variant",
        variant: "destructive",
      });
    },
  });

  // Handle price update
  const handlePriceBlur = () => {
    setEditingField(null);
    if (price !== variant.price) {
      // Validate price
      const numPrice = parseFloat(price);
      if (isNaN(numPrice) || numPrice < 0) {
        toast({
          title: "Invalid price",
          description: "Price must be a positive number",
          variant: "destructive",
        });
        setPrice(variant.price);
        return;
      }
      updateMutation.mutate({ price });
    }
  };

  // Handle quantity update
  const handleQuantityBlur = () => {
    setEditingField(null);
    const newQuantity = parseInt(quantity, 10);
    if (newQuantity !== variant.inventoryQuantity) {
      // Validate quantity
      if (isNaN(newQuantity) || newQuantity < 0) {
        toast({
          title: "Invalid quantity",
          description: "Quantity must be a non-negative integer",
          variant: "destructive",
        });
        setQuantity(variant.inventoryQuantity.toString());
        return;
      }
      updateMutation.mutate({ inventoryQuantity: newQuantity });
    }
  };

  // Handle SKU update
  const handleSkuBlur = () => {
    setEditingField(null);
    if (sku !== (variant.sku || "")) {
      updateMutation.mutate({ sku: sku || null });
    }
  };

  // Handle key press (Enter to save, Escape to cancel)
  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (field === "price") handlePriceBlur();
      if (field === "quantity") handleQuantityBlur();
      if (field === "sku") handleSkuBlur();
    } else if (e.key === "Escape") {
      setEditingField(null);
      // Revert values
      setPrice(variant.price);
      setQuantity(variant.inventoryQuantity.toString());
      setSku(variant.sku || "");
    }
  };

  // Handle delete
  const handleDelete = () => {
    if (confirm(`Delete variant "${title}"? This cannot be undone.`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 border-b hover:bg-muted/50 transition-colors relative ${
        isExpanded ? "bg-muted/30" : ""
      }`}
    >
      {/* Expand/Collapse Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => onToggleExpand(variant.id)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </Button>

      {/* Checkbox (selection mode only) */}
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(variant.id)}
        />
      )}

      {/* Title */}
      <div className="min-w-[200px] font-medium text-sm">
        {title || "Untitled variant"}
      </div>

      {/* Price (inline edit) */}
      <div className="min-w-[100px]">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">$</span>
          {editingField === "price" ? (
            <Input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={handlePriceBlur}
              onKeyDown={(e) => handleKeyDown(e, "price")}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <button
              className="text-sm hover:bg-muted px-2 py-1 rounded"
              onClick={() => setEditingField("price")}
            >
              {price}
            </button>
          )}
        </div>
      </div>

      {/* Quantity (inline edit) */}
      <div className="min-w-[100px]">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">QTY:</span>
          {editingField === "quantity" ? (
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={handleQuantityBlur}
              onKeyDown={(e) => handleKeyDown(e, "quantity")}
              className="h-7 text-sm w-20"
              autoFocus
            />
          ) : (
            <button
              className="text-sm hover:bg-muted px-2 py-1 rounded"
              onClick={() => setEditingField("quantity")}
            >
              {quantity}
            </button>
          )}
        </div>
      </div>

      {/* SKU (inline edit) */}
      <div className="min-w-[120px] flex-1">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">SKU:</span>
          {editingField === "sku" ? (
            <Input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onBlur={handleSkuBlur}
              onKeyDown={(e) => handleKeyDown(e, "sku")}
              className="h-7 text-sm"
              placeholder="Enter SKU"
              autoFocus
            />
          ) : (
            <button
              className="text-sm hover:bg-muted px-2 py-1 rounded truncate"
              onClick={() => setEditingField("sku")}
            >
              {sku || "—"}
            </button>
          )}
        </div>
      </div>

      {/* Actions Menu - Always visible on the right */}
      <div className="ml-auto shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit variant
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete variant
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Loading indicator */}
      {updateMutation.isPending && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
