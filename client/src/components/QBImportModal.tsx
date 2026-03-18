/**
 * QuickBooks Import Modal
 *
 * Allows users to search QB inventory and import variants into a product
 * With ability to select which colors and sizes to import
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Package, Tag, ChevronRight, CheckCircle, X, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationInventoryBreakdown } from "@/components/variants/LocationInventoryBreakdown";
import type { LocationInventory } from "@shared/schema";

interface QBSearchResult {
  style: string;
  vendorName: string;
  category: string;
  gender: string;
  description: string;
  variantCount: number;
  colors: string[];
  sizes: string[];
  minPrice: string;
  maxPrice: string;
  totalQty: string;
}

interface DuplicateItem {
  itemNumber: string;
  description: string | null;
  quantityOnHand: string | null;
  costPrice: string | null;
  retailPrice: string | null;
  locationInventory?: LocationInventory[];
}

interface DuplicateGroup {
  color: string | null;
  size: string | null;
  key: string;
  items: DuplicateItem[];
}

interface QBStyleDetails {
  style: string;
  vendorName: string;
  category: string;
  gender: string;
  description: string;
  colors: string[];
  sizes: string[];
  locations: string[];
  items: any[];
  duplicates: DuplicateGroup[];
  summary: {
    variantCount: number;
    colorCount: number;
    sizeCount: number;
    totalInventory: number;
    duplicateCount: number;
  };
}

interface QBImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onImportComplete?: () => void;
}

export function QBImportModal({ open, onOpenChange, productId, onImportComplete }: QBImportModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);

  // Selection state for colors and sizes
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());

  // For duplicate resolution: maps duplicate group key to the SKU user wants to KEEP
  const [selectedSkuForDuplicates, setSelectedSkuForDuplicates] = useState<Map<string, string>>(new Map());

  // Fetch filter options
  const { data: filters } = useQuery({
    queryKey: ["qb-inventory-filters"],
    queryFn: async () => {
      const response = await fetch("/api/qb-inventory/filters", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch filters");
      return response.json();
    },
    enabled: open,
  });

  // Search QB inventory
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["qb-inventory-search", searchQuery, vendorFilter, categoryFilter, genderFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (vendorFilter && vendorFilter !== "all") params.set("vendor", vendorFilter);
      if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
      if (genderFilter && genderFilter !== "all") params.set("gender", genderFilter);
      params.set("limit", "100");

      const response = await fetch(`/api/qb-inventory/search?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to search");
      return response.json();
    },
    enabled: open,
  });

  // Fetch style details when selected
  const { data: styleDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["qb-inventory-style", selectedStyle],
    queryFn: async () => {
      const response = await fetch(`/api/qb-inventory/styles/${selectedStyle}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch style details");
      return response.json() as Promise<QBStyleDetails>;
    },
    enabled: !!selectedStyle,
  });

  // Initialize selections when style details load
  useEffect(() => {
    if (styleDetails) {
      setSelectedColors(new Set(styleDetails.colors));
      setSelectedSizes(new Set(styleDetails.sizes));

      // Clear duplicate selections - user must manually select which SKU to keep
      setSelectedSkuForDuplicates(new Map());
    }
  }, [styleDetails]);

  // Calculate excluded SKUs based on duplicate selections
  const excludedSkus = useMemo(() => {
    if (!styleDetails?.duplicates) return [];

    const excluded: string[] = [];
    for (const dup of styleDetails.duplicates) {
      const selectedSku = selectedSkuForDuplicates.get(dup.key);
      for (const item of dup.items) {
        if (item.itemNumber !== selectedSku) {
          excluded.push(item.itemNumber);
        }
      }
    }
    return excluded;
  }, [styleDetails?.duplicates, selectedSkuForDuplicates]);

  // Check if all duplicates have been resolved
  const hasDuplicates = styleDetails?.duplicates && styleDetails.duplicates.length > 0;
  const allDuplicatesResolved = !hasDuplicates || styleDetails.duplicates.every(
    dup => selectedSkuForDuplicates.has(dup.key)
  );

  // Calculate filtered variant count based on selections and excluded SKUs
  const filteredVariantCount = useMemo(() => {
    if (!styleDetails?.items) return 0;

    return styleDetails.items.filter(item => {
      const colorMatch = !item.attribute || selectedColors.has(item.attribute);
      const sizeMatch = !item.size || selectedSizes.has(item.size);
      const notExcluded = !item.itemNumber || !excludedSkus.includes(item.itemNumber);
      return colorMatch && sizeMatch && notExcluded;
    }).length;
  }, [styleDetails?.items, selectedColors, selectedSizes, excludedSkus]);

  // Function to select a SKU for a duplicate group
  const selectSkuForDuplicate = (duplicateKey: string, sku: string) => {
    setSelectedSkuForDuplicates(prev => {
      const next = new Map(prev);
      next.set(duplicateKey, sku);
      return next;
    });
  };

  // Toggle color selection
  const toggleColor = (color: string) => {
    setSelectedColors(prev => {
      const next = new Set(prev);
      if (next.has(color)) {
        next.delete(color);
      } else {
        next.add(color);
      }
      return next;
    });
  };

  // Toggle size selection
  const toggleSize = (size: string) => {
    setSelectedSizes(prev => {
      const next = new Set(prev);
      if (next.has(size)) {
        next.delete(size);
      } else {
        next.add(size);
      }
      return next;
    });
  };

  // Select/Deselect all colors
  const toggleAllColors = () => {
    if (selectedColors.size === styleDetails?.colors.length) {
      setSelectedColors(new Set());
    } else {
      setSelectedColors(new Set(styleDetails?.colors || []));
    }
  };

  // Select/Deselect all sizes
  const toggleAllSizes = () => {
    if (selectedSizes.size === styleDetails?.sizes.length) {
      setSelectedSizes(new Set());
    } else {
      setSelectedSizes(new Set(styleDetails?.sizes || []));
    }
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (style: string) => {
      const response = await fetch(`/api/products/${productId}/import-qb-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          style,
          replaceExisting,
          selectedColors: Array.from(selectedColors),
          selectedSizes: Array.from(selectedSizes),
          excludedSkus,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Import failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import Successful",
        description: `Imported ${data.summary.variantsCreated} variants (${data.summary.colors} colors, ${data.summary.sizes} sizes)`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/variants`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/options`] });
      onOpenChange(false);
      onImportComplete?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reset selection when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedStyle(null);
      setSelectedColors(new Set());
      setSelectedSizes(new Set());
      setSelectedSkuForDuplicates(new Map());
    }
  }, [open]);

  const handleImport = () => {
    if (selectedStyle && filteredVariantCount > 0 && allDuplicatesResolved) {
      importMutation.mutate(selectedStyle);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Variants from QuickBooks</DialogTitle>
          <DialogDescription>
            Search QB inventory by style number, vendor, or description. Click colors/sizes to include or exclude them from import.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Left Panel - Search & Results */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search */}
            <div className="space-y-3 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by style, vendor, description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {filters?.vendors?.map((v: string) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {filters?.categories?.map((c: string) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {filters?.genders?.map((g: string) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results */}
            <ScrollArea className="flex-1 border rounded-md">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults?.results?.length > 0 ? (
                <div className="divide-y">
                  {searchResults.results.map((result: QBSearchResult) => (
                    <button
                      key={result.style}
                      onClick={() => setSelectedStyle(result.style)}
                      className={`w-full p-3 text-left hover:bg-accent transition-colors ${
                        selectedStyle === result.style ? "bg-accent" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-sm">{result.style}</span>
                            <Badge variant="outline" className="text-xs">
                              {result.variantCount} variants
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {result.vendorName} - {result.description}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{result.colors?.length || 0} colors</span>
                            <span>{result.sizes?.length || 0} sizes</span>
                            <span>${result.minPrice} - ${result.maxPrice}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mb-2" />
                  <p className="text-sm">No products found</p>
                  <p className="text-xs">Try adjusting your search or filters</p>
                </div>
              )}
            </ScrollArea>
            <div className="text-xs text-muted-foreground mt-2">
              {searchResults?.count || 0} products found
            </div>
          </div>

          {/* Right Panel - Preview with Selection */}
          <div className="w-96 flex flex-col border-l pl-4">
            {selectedStyle && styleDetails ? (
              <ScrollArea className="flex-1">
                <div className="space-y-3 pr-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Style Number</Label>
                    <p className="font-mono font-semibold text-lg">{styleDetails.style}</p>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Vendor</Label>
                    <p className="font-medium">{styleDetails.vendorName}</p>
                  </div>

                  <div className="flex gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Category</Label>
                      <p className="text-sm">{styleDetails.category || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Gender</Label>
                      <p className="text-sm">{styleDetails.gender || "-"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-3 border-y">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{filteredVariantCount}</p>
                      <p className="text-xs text-muted-foreground">
                        {filteredVariantCount !== styleDetails.summary.variantCount && (
                          <span className="line-through mr-1">{styleDetails.summary.variantCount}</span>
                        )}
                        Variants
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{styleDetails.summary.totalInventory}</p>
                      <p className="text-xs text-muted-foreground">Total Qty</p>
                      {styleDetails.items?.[0]?.locationInventory && (
                        <div className="mt-1">
                          <LocationInventoryBreakdown
                            locationInventory={
                              // Aggregate per-location totals across all items
                              (styleDetails.locations || []).map((code: string) => {
                                const qty = styleDetails.items.reduce((sum: number, item: any) => {
                                  const loc = (item.locationInventory || []).find((l: LocationInventory) => l.code === code);
                                  return sum + (loc?.qty || 0);
                                }, 0);
                                const loc = styleDetails.items[0].locationInventory.find((l: LocationInventory) => l.code === code);
                                return { code, name: loc?.name || code, qty };
                              })
                            }
                            compact={false}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Duplicate Warning - Show at top so user notices it */}
                  {hasDuplicates && (
                    <div className="border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 rounded-md p-3">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {styleDetails.duplicates.length} Duplicate{styleDetails.duplicates.length > 1 ? 's' : ''} Detected
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        The following color/size combinations have multiple SKUs. Select which SKU to keep for each:
                      </p>
                      <div className="space-y-3">
                        {styleDetails.duplicates.map((dup) => (
                          <div key={dup.key} className="bg-background rounded border p-2">
                            <p className="text-xs font-medium mb-2">
                              {dup.color || 'No Color'} / {dup.size || 'No Size'}
                            </p>
                            <div className="space-y-1">
                              {dup.items.map((item) => {
                                const isSelected = selectedSkuForDuplicates.get(dup.key) === item.itemNumber;
                                return (
                                  <button
                                    key={item.itemNumber}
                                    onClick={() => selectSkuForDuplicate(dup.key, item.itemNumber)}
                                    className={cn(
                                      "w-full text-left p-2 rounded text-xs transition-colors",
                                      isSelected
                                        ? "bg-primary/10 border border-primary"
                                        : "bg-muted/50 hover:bg-muted border border-transparent"
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className={cn(
                                          "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                          isSelected ? "border-primary bg-primary" : "border-muted-foreground"
                                        )}>
                                          {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                                        </div>
                                        <span className="font-mono">{item.itemNumber}</span>
                                      </div>
                                      {item.locationInventory && item.locationInventory.length > 0 ? (
                                        <LocationInventoryBreakdown
                                          locationInventory={item.locationInventory}
                                          compact={true}
                                          className="text-muted-foreground"
                                        />
                                      ) : (
                                        <span className="text-muted-foreground">
                                          Qty: {item.quantityOnHand || 0}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Colors Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">
                        Colors ({selectedColors.size}/{styleDetails.colors.length})
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={toggleAllColors}
                      >
                        {selectedColors.size === styleDetails.colors.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {styleDetails.colors.map((color) => {
                        const isSelected = selectedColors.has(color);
                        return (
                          <Badge
                            key={color}
                            variant={isSelected ? "default" : "outline"}
                            className={cn(
                              "text-xs cursor-pointer transition-all",
                              isSelected
                                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                                : "text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100"
                            )}
                            onClick={() => toggleColor(color)}
                          >
                            {isSelected && <Check className="h-3 w-3 mr-1" />}
                            {color}
                            {!isSelected && <X className="h-3 w-3 ml-1 opacity-50" />}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sizes Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs text-muted-foreground">
                        Sizes ({selectedSizes.size}/{styleDetails.sizes.length})
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={toggleAllSizes}
                      >
                        {selectedSizes.size === styleDetails.sizes.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {styleDetails.sizes.map((size) => {
                        const isSelected = selectedSizes.has(size);
                        return (
                          <Badge
                            key={size}
                            variant={isSelected ? "default" : "outline"}
                            className={cn(
                              "text-xs cursor-pointer transition-all",
                              isSelected
                                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                                : "text-muted-foreground hover:text-foreground opacity-50 hover:opacity-100"
                            )}
                            onClick={() => toggleSize(size)}
                          >
                            {isSelected && <Check className="h-3 w-3 mr-1" />}
                            {size}
                            {!isSelected && <X className="h-3 w-3 ml-1 opacity-50" />}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </ScrollArea>
            ) : isLoadingDetails ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                <Tag className="h-8 w-8 mb-2" />
                <p className="text-sm text-center">Select a product to preview variants</p>
              </div>
            )}

            {/* Import Controls - Fixed at bottom */}
            {selectedStyle && styleDetails && (
              <div className="pt-4 border-t mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="replaceExisting"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="replaceExisting" className="text-sm cursor-pointer">
                    Replace existing variants
                  </Label>
                </div>

                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || filteredVariantCount === 0 || !allDuplicatesResolved}
                  className="w-full"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : !allDuplicatesResolved ? (
                    <>
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Resolve duplicates first
                    </>
                  ) : filteredVariantCount === 0 ? (
                    <>
                      <X className="mr-2 h-4 w-4" />
                      Select colors/sizes to import
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Import {filteredVariantCount} Variants
                    </>
                  )}
                </Button>

                {filteredVariantCount > 0 && filteredVariantCount !== styleDetails.summary.variantCount && (
                  <p className="text-xs text-muted-foreground text-center">
                    Importing {selectedColors.size} colors and {selectedSizes.size} sizes
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
