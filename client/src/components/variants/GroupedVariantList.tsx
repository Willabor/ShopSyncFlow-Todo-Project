import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Upload, MoreVertical, Trash2, RefreshCw, MapPin } from "lucide-react";
import { ImageSelectorModal } from "./ImageSelectorModal";
import { VariantEditorDialog } from "./VariantEditorDialog";
import type { ProductVariant, LocationInventory } from "@shared/schema";
import { SIZE_ORDER } from "@shared/size-utils";

interface GroupedVariantListProps {
  productId: string;
}

interface VariantGroup {
  option1Value: string;
  variants: ProductVariant[];
  totalInventory: number;
  commonPrice: string;
  image: string | null;
}

export function GroupedVariantList({ productId }: GroupedVariantListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [imageModalGroup, setImageModalGroup] = useState<string | null>(null);
  const [imageModalVariant, setImageModalVariant] = useState<ProductVariant | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);

  // Fetch variants
  const { data: variants = [], isLoading } = useQuery<ProductVariant[]>({
    queryKey: ["variants", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch variants");
      return res.json();
    },
  });

  // Fetch per-location inventory breakdown (from QB item_levels)
  const { data: locationData } = useQuery<{
    variantInventory: Record<string, LocationInventory[]>;
    locations: Array<{ code: string; name: string }>;
  }>({
    queryKey: ["variant-location-inventory", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants/inventory-by-location`, {
        credentials: "include",
      });
      if (!res.ok) return { variantInventory: {}, locations: [] };
      return res.json();
    },
    enabled: variants.length > 0,
  });

  // Helper: get quantity for a variant based on selected location filter
  // Prefers live itemLevels data over stored productVariants.inventoryQuantity
  const getVariantQty = (variant: ProductVariant): number => {
    if (locationData?.variantInventory && variant.sku) {
      const locInv = locationData.variantInventory[variant.sku];
      if (locInv) {
        if (selectedLocation === "all") {
          return locInv.reduce((sum, l) => sum + l.qty, 0);
        }
        const loc = locInv.find(l => l.code === selectedLocation);
        return loc?.qty || 0;
      }
    }
    return variant.inventoryQuantity;
  };

  // Helper: get group total for selected location
  const getGroupQty = (group: VariantGroup): number => {
    return group.variants.reduce((sum, v) => sum + getVariantQty(v), 0);
  };

  // Group variants by option1 and sort by option2 (size)
  const groupedVariants = useMemo(() => {
    const groups: Record<string, VariantGroup> = {};

    variants.forEach((variant) => {
      const key = variant.option1 || "Default";

      if (!groups[key]) {
        groups[key] = {
          option1Value: key,
          variants: [],
          totalInventory: 0,
          commonPrice: variant.price,
          image: variant.imageUrl,
        };
      }

      groups[key].variants.push(variant);
      groups[key].totalInventory += variant.inventoryQuantity;

      // Use first variant's image if group doesn't have one
      if (!groups[key].image && variant.imageUrl) {
        groups[key].image = variant.imageUrl;
      }
    });

    // Sort variants within each group by option2 (size) using SIZE_ORDER
    Object.values(groups).forEach((group) => {
      group.variants.sort((a, b) => {
        const sizeA = a.option2 || a.option1 || "";
        const sizeB = b.option2 || b.option1 || "";

        const indexA = SIZE_ORDER.indexOf(sizeA);
        const indexB = SIZE_ORDER.indexOf(sizeB);

        // Both sizes are in the predefined order
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }

        // Only 'a' is in predefined order → 'a' comes first
        if (indexA !== -1) return -1;

        // Only 'b' is in predefined order → 'b' comes first
        if (indexB !== -1) return 1;

        // Neither is in predefined order → alphabetical fallback
        return sizeA.localeCompare(sizeB);
      });
    });

    return Object.values(groups);
  }, [variants]);

  // Toggle group expansion
  const toggleGroup = (option1Value: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(option1Value)) {
        next.delete(option1Value);
      } else {
        next.add(option1Value);
      }
      return next;
    });
  };

  // Collapse all groups
  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  // Update parent price (affects all children in group)
  const updateParentPriceMutation = useMutation({
    mutationFn: async ({ option1Value, price }: { option1Value: string; price: string }) => {
      const group = groupedVariants.find((g) => g.option1Value === option1Value);
      if (!group) throw new Error("Group not found");

      const errors: string[] = [];

      for (const variant of group.variants) {
        try {
          const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ price }),
          });

          if (!res.ok) {
            errors.push(variant.id);
          }
        } catch (error) {
          errors.push(variant.id);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} variant(s)`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Price updated for all variants" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update price",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update individual child price
  const updateChildPriceMutation = useMutation({
    mutationFn: async ({ variantId, price }: { variantId: string; price: string }) => {
      const res = await fetch(`/api/products/${productId}/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ price }),
      });

      if (!res.ok) {
        throw new Error("Failed to update price");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Price updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update price",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update individual child inventory
  const updateInventoryMutation = useMutation({
    mutationFn: async ({ variantId, quantity }: { variantId: string; quantity: number }) => {
      const res = await fetch(`/api/products/${productId}/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inventoryQuantity: quantity }),
      });

      if (!res.ok) {
        throw new Error("Failed to update inventory");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Inventory updated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update inventory",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete single variant
  const deleteVariantMutation = useMutation({
    mutationFn: async (variantId: string) => {
      const res = await fetch(`/api/products/${productId}/variants/${variantId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete variant");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Variant deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete variant",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete all variants in a group
  const deleteGroupMutation = useMutation({
    mutationFn: async (option1Value: string) => {
      const group = groupedVariants.find((g) => g.option1Value === option1Value);
      if (!group) throw new Error("Group not found");

      const errors: string[] = [];

      for (const variant of group.variants) {
        try {
          const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
            method: "DELETE",
            credentials: "include",
          });

          if (!res.ok) {
            errors.push(variant.id);
          }
        } catch (error) {
          errors.push(variant.id);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Failed to delete ${errors.length} variant(s)`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "All variants in group deleted" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete variants",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sync all variants to Shopify
  const syncAllToShopifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants/sync-to-shopify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to sync variants");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({
        title: "Variants synced to Shopify",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to sync variants",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleParentPriceBlur = (option1Value: string, price: string) => {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      toast({
        title: "Invalid price",
        description: "Price must be a positive number",
        variant: "destructive",
      });
      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[`parent-${option1Value}`];
        return next;
      });
      return;
    }

    updateParentPriceMutation.mutate({ option1Value, price });
    setEditingPrices((prev) => {
      const next = { ...prev };
      delete next[`parent-${option1Value}`];
      return next;
    });
  };

  const handleChildPriceBlur = (variantId: string, price: string) => {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      toast({
        title: "Invalid price",
        description: "Price must be a positive number",
        variant: "destructive",
      });
      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[`child-${variantId}`];
        return next;
      });
      return;
    }

    updateChildPriceMutation.mutate({ variantId, price });
    setEditingPrices((prev) => {
      const next = { ...prev };
      delete next[`child-${variantId}`];
      return next;
    });
  };

  const handleInventoryBlur = (variantId: string, quantityStr: string) => {
    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity < 0) {
      toast({
        title: "Invalid quantity",
        description: "Quantity must be a non-negative integer",
        variant: "destructive",
      });
      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[`inventory-${variantId}`];
        return next;
      });
      return;
    }

    updateInventoryMutation.mutate({ variantId, quantity });
    setEditingPrices((prev) => {
      const next = { ...prev };
      delete next[`inventory-${variantId}`];
      return next;
    });
  };

  const handleDeleteVariant = (variantId: string, title: string) => {
    if (confirm(`Delete variant "${title}"? This cannot be undone.`)) {
      deleteVariantMutation.mutate(variantId);
    }
  };

  const handleDeleteGroup = (option1Value: string, variantCount: number) => {
    if (
      confirm(
        `Delete all ${variantCount} variant(s) in "${option1Value}"? This cannot be undone.`
      )
    ) {
      deleteGroupMutation.mutate(option1Value);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading variants...</div>;
  }

  if (variants.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No variants yet. Create product options to generate variants.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Variants</CardTitle>
          <div className="flex items-center gap-2">
            {/* Location filter dropdown (Shopify-style) */}
            {locationData?.locations && locationData.locations.length > 0 && (
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <MapPin className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locationData.locations.map((loc) => (
                    <SelectItem key={loc.code} value={loc.code}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncAllToShopifyMutation.mutate()}
              disabled={syncAllToShopifyMutation.isPending}
            >
              {syncAllToShopifyMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync All to Shopify
                </>
              )}
            </Button>
            {expandedGroups.size > 0 && (
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                Collapse all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t">
          {/* Header Row */}
          <div className="grid grid-cols-[auto_1fr_120px_120px_auto] gap-4 px-4 py-2 bg-muted text-xs font-medium text-muted-foreground border-b">
            <div className="w-8"></div>
            <div>Variant</div>
            <div>Price</div>
            <div>Available</div>
            <div className="w-8"></div>
          </div>

          {/* Variant Groups */}
          {groupedVariants.map((group) => {
            const isExpanded = expandedGroups.has(group.option1Value);
            const parentPriceKey = `parent-${group.option1Value}`;
            const currentParentPrice = editingPrices[parentPriceKey] ?? group.commonPrice;

            return (
              <div key={group.option1Value}>
                {/* Parent Row */}
                <div className="grid grid-cols-[auto_1fr_120px_120px_auto] gap-4 px-4 py-3 border-b hover:bg-muted/50 transition-colors items-center">
                  {/* Expand Button + Image */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleGroup(group.option1Value)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>

                    {/* Parent Image (clickable to open selector) */}
                    <button
                      type="button"
                      className="w-12 h-12 rounded border bg-muted flex items-center justify-center overflow-hidden hover:border-primary hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer"
                      onClick={() => setImageModalGroup(group.option1Value)}
                      title="Click to select image"
                    >
                      {group.image ? (
                        <img
                          src={group.image}
                          alt={group.option1Value}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Upload className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  {/* Parent Title */}
                  <div className="font-medium text-sm">
                    {group.option1Value}
                    <span className="text-muted-foreground ml-2">
                      {group.variants.length} variant{group.variants.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Parent Price (editable, affects all children) */}
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">$</span>
                    <Input
                      type="text"
                      value={currentParentPrice}
                      onChange={(e) =>
                        setEditingPrices((prev) => ({
                          ...prev,
                          [parentPriceKey]: e.target.value,
                        }))
                      }
                      onBlur={() => handleParentPriceBlur(group.option1Value, currentParentPrice)}
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Total Inventory (filtered by selected location) */}
                  <div className="flex items-center h-8 text-sm tabular-nums">
                    {getGroupQty(group)}
                  </div>

                  {/* Parent Actions Menu */}
                  <div className="ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            handleDeleteGroup(group.option1Value, group.variants.length)
                          }
                          disabled={deleteGroupMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete all variants
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Children Rows (when expanded) */}
                {isExpanded && (
                  <div className="bg-muted/20">
                    {group.variants.map((variant) => {
                      const childPriceKey = `child-${variant.id}`;
                      const inventoryKey = `inventory-${variant.id}`;
                      const currentChildPrice = editingPrices[childPriceKey] ?? variant.price;
                      const currentInventory =
                        editingPrices[inventoryKey] ?? getVariantQty(variant).toString();

                      return (
                        <div
                          key={variant.id}
                          className="grid grid-cols-[auto_1fr_120px_120px_auto] gap-4 px-4 py-2 border-b last:border-b-0 hover:bg-muted/30 transition-colors items-center"
                        >
                          {/* Checkbox + Thumbnail (clickable) */}
                          <div className="flex items-center gap-2 pl-8">
                            <Checkbox />
                            <button
                              type="button"
                              className="w-12 h-12 rounded border bg-background flex items-center justify-center overflow-hidden hover:border-primary hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer"
                              onClick={() => setImageModalVariant(variant)}
                              title="Click to select image for this variant"
                            >
                              {variant.imageUrl ? (
                                <img
                                  src={variant.imageUrl}
                                  alt={variant.option2 || ""}
                                  className="w-full h-full object-cover"
                                />
                              ) : group.image ? (
                                <img
                                  src={group.image}
                                  alt={variant.option2 || ""}
                                  className="w-full h-full object-cover opacity-50"
                                />
                              ) : (
                                <Upload className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          </div>

                          {/* Child Title (clickable to edit) */}
                          <div className="text-sm">
                            <button
                              type="button"
                              className="text-left hover:underline cursor-pointer transition-all"
                              onClick={() => setEditingVariantId(variant.id)}
                            >
                              {variant.option2 || variant.option1}
                            </button>
                            {variant.sku && (
                              <div className="text-xs text-muted-foreground">{variant.sku}</div>
                            )}
                          </div>

                          {/* Child Price (individually editable) */}
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground text-xs">$</span>
                            <Input
                              type="text"
                              value={currentChildPrice}
                              onChange={(e) =>
                                setEditingPrices((prev) => ({
                                  ...prev,
                                  [childPriceKey]: e.target.value,
                                }))
                              }
                              onBlur={() => handleChildPriceBlur(variant.id, currentChildPrice)}
                              className="h-7 text-sm"
                            />
                          </div>

                          {/* Child Inventory (editable total only) */}
                          <div>
                            <Input
                              type="number"
                              value={currentInventory}
                              onChange={(e) =>
                                setEditingPrices((prev) => ({
                                  ...prev,
                                  [inventoryKey]: e.target.value,
                                }))
                              }
                              onBlur={() => handleInventoryBlur(variant.id, currentInventory)}
                              className="h-7 text-sm w-20"
                              min="0"
                            />
                          </div>

                          {/* Child Actions Menu */}
                          <div className="ml-auto">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    handleDeleteVariant(
                                      variant.id,
                                      variant.option2 || variant.option1 || "variant"
                                    )
                                  }
                                  disabled={deleteVariantMutation.isPending}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete variant
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}

                    {/* Total inventory footer */}
                    <div className="text-center py-2 text-sm text-muted-foreground border-t">
                      Total inventory across all locations:{" "}
                      <span className="font-medium text-foreground">{getGroupQty(group)} available</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Image Selector Modal for Parent (affects all children) */}
      {imageModalGroup !== null && (
        <ImageSelectorModal
          isOpen={true}
          onClose={() => setImageModalGroup(null)}
          productId={productId}
          variants={
            groupedVariants.find((g) => g.option1Value === imageModalGroup)?.variants || []
          }
          currentImage={
            groupedVariants.find((g) => g.option1Value === imageModalGroup)?.image || null
          }
          option1Value={imageModalGroup}
        />
      )}

      {/* Image Selector Modal for Individual Child Variant */}
      {imageModalVariant !== null && (
        <ImageSelectorModal
          isOpen={true}
          onClose={() => setImageModalVariant(null)}
          productId={productId}
          variants={[imageModalVariant]}
          currentImage={imageModalVariant.imageUrl}
          option1Value={`${imageModalVariant.option1} - ${imageModalVariant.option2 || imageModalVariant.option1}`}
        />
      )}

      {/* Variant Editor Dialog */}
      <VariantEditorDialog
        productId={productId}
        variantId={editingVariantId}
        onClose={() => setEditingVariantId(null)}
      />
    </Card>
  );
}
