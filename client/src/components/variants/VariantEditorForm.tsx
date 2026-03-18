import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { VariantImageSection } from "./VariantImageSection";
import type { ProductVariant, LocationInventory } from "@shared/schema";
import type { SaveStatus } from "./VariantEditorHeader";

interface VariantEditorFormProps {
  variant: ProductVariant;
  productId: string;
  onSaveStatusChange: (status: SaveStatus) => void;
  canGoToPrevious: boolean;
  canGoToNext: boolean;
  onGoToPrevious: () => void;
  onGoToNext: () => void;
}

export function VariantEditorForm({
  variant,
  productId,
  onSaveStatusChange,
  canGoToPrevious,
  canGoToNext,
  onGoToPrevious,
  onGoToNext,
}: VariantEditorFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for all fields
  const [price, setPrice] = useState(variant.price);
  const [compareAtPrice, setCompareAtPrice] = useState(variant.compareAtPrice || "");
  const [cost, setCost] = useState(variant.cost || "");
  const [sku, setSku] = useState(variant.sku || "");
  const [barcode, setBarcode] = useState(variant.barcode || "");
  const [quantity, setQuantity] = useState(variant.inventoryQuantity.toString());
  const [inventoryPolicy, setInventoryPolicy] = useState(variant.inventoryPolicy || "deny");
  const [weight, setWeight] = useState(variant.weight || "");
  const [weightUnit, setWeightUnit] = useState(variant.weightUnit || "lb");
  const [requiresShipping, setRequiresShipping] = useState(variant.requiresShipping ?? true);

  // Track which field was just saved for animation
  const [justSavedField, setJustSavedField] = useState<string | null>(null);

  // Fetch per-location inventory breakdown
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
  });

  // Get this variant's location inventory
  const variantLocationInventory = useMemo(() => {
    if (!locationData?.variantInventory || !variant.sku) return [];
    return locationData.variantInventory[variant.sku] || [];
  }, [locationData, variant.sku]);

  const locationTotal = useMemo(() => {
    return variantLocationInventory.reduce((sum, loc) => sum + loc.qty, 0);
  }, [variantLocationInventory]);

  // Update form state when variant prop changes (when switching between variants)
  useEffect(() => {
    setPrice(variant.price);
    setCompareAtPrice(variant.compareAtPrice || "");
    setCost(variant.cost || "");
    setSku(variant.sku || "");
    setBarcode(variant.barcode || "");
    setQuantity(variant.inventoryQuantity.toString());
    setInventoryPolicy(variant.inventoryPolicy || "deny");
    setWeight(variant.weight || "");
    setWeightUnit(variant.weightUnit || "lb");
    setRequiresShipping(variant.requiresShipping ?? true);
  }, [variant]);

  // Calculate profit
  const profit = useMemo(() => {
    const priceNum = parseFloat(price);
    const costNum = parseFloat(cost);
    if (isNaN(priceNum) || isNaN(costNum) || !cost) {
      return null;
    }
    const profitAmount = priceNum - costNum;
    const margin = priceNum > 0 ? (profitAmount / priceNum) * 100 : 0;
    return { amount: profitAmount, margin };
  }, [price, cost]);

  // Update mutation with field tracking
  const updateMutation = useMutation({
    mutationFn: async ({ updates, fieldName }: { updates: Partial<ProductVariant>, fieldName: string }) => {
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
      return { data: await res.json(), fieldName };
    },
    onMutate: () => {
      onSaveStatusChange("saving");
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      onSaveStatusChange("saved");

      // Show field-level success animation
      setJustSavedField(result.fieldName);
      setTimeout(() => setJustSavedField(null), 2000);

      setTimeout(() => onSaveStatusChange("idle"), 2000);
    },
    onError: (error: Error) => {
      onSaveStatusChange("error");
      toast({
        title: "Failed to save changes",
        description: error.message,
        variant: "destructive",
      });
      setTimeout(() => onSaveStatusChange("idle"), 3000);
    },
  });

  // Auto-save handlers
  const handlePriceBlur = () => {
    if (price !== variant.price) {
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
      updateMutation.mutate({ updates: { price }, fieldName: "price" });
    }
  };

  const handleCompareAtPriceBlur = () => {
    if (compareAtPrice !== (variant.compareAtPrice || "")) {
      if (compareAtPrice) {
        const compareNum = parseFloat(compareAtPrice);
        const priceNum = parseFloat(price);
        if (isNaN(compareNum) || compareNum < 0) {
          toast({
            title: "Invalid compare at price",
            description: "Price must be a positive number",
            variant: "destructive",
          });
          setCompareAtPrice(variant.compareAtPrice || "");
          return;
        }
        if (compareNum < priceNum) {
          toast({
            title: "Invalid compare at price",
            description: "Compare at price should be greater than price",
            variant: "destructive",
          });
          setCompareAtPrice(variant.compareAtPrice || "");
          return;
        }
      }
      updateMutation.mutate({ updates: { compareAtPrice: compareAtPrice || null }, fieldName: "compareAtPrice" });
    }
  };

  const handleCostBlur = () => {
    if (cost !== (variant.cost || "")) {
      if (cost && (isNaN(parseFloat(cost)) || parseFloat(cost) < 0)) {
        toast({
          title: "Invalid cost",
          description: "Cost must be a positive number",
          variant: "destructive",
        });
        setCost(variant.cost || "");
        return;
      }
      updateMutation.mutate({ updates: { cost: cost || null }, fieldName: "cost" });
    }
  };

  const handleSkuBlur = () => {
    if (sku !== (variant.sku || "")) {
      updateMutation.mutate({ updates: { sku: sku || null }, fieldName: "sku" });
    }
  };

  const handleBarcodeBlur = () => {
    if (barcode !== (variant.barcode || "")) {
      updateMutation.mutate({ updates: { barcode: barcode || null }, fieldName: "barcode" });
    }
  };

  const handleQuantityBlur = () => {
    const newQuantity = parseInt(quantity, 10);
    if (newQuantity !== variant.inventoryQuantity) {
      if (isNaN(newQuantity) || newQuantity < 0) {
        toast({
          title: "Invalid quantity",
          description: "Quantity must be a non-negative integer",
          variant: "destructive",
        });
        setQuantity(variant.inventoryQuantity.toString());
        return;
      }
      updateMutation.mutate({ updates: { inventoryQuantity: newQuantity }, fieldName: "quantity" });
    }
  };

  const handleInventoryPolicyChange = (value: string) => {
    setInventoryPolicy(value);
    updateMutation.mutate({ updates: { inventoryPolicy: value }, fieldName: "inventoryPolicy" });
  };

  const handleWeightBlur = () => {
    if (weight !== (variant.weight || "")) {
      if (weight && (isNaN(parseFloat(weight)) || parseFloat(weight) <= 0)) {
        toast({
          title: "Invalid weight",
          description: "Weight must be a positive number",
          variant: "destructive",
        });
        setWeight(variant.weight || "");
        return;
      }
      updateMutation.mutate({ updates: { weight: weight || null }, fieldName: "weight" });
    }
  };

  const handleWeightUnitChange = (value: string) => {
    setWeightUnit(value);
    updateMutation.mutate({ updates: { weightUnit: value }, fieldName: "weightUnit" });
  };

  const handleRequiresShippingChange = (checked: boolean) => {
    setRequiresShipping(checked);
    updateMutation.mutate({ updates: { requiresShipping: checked }, fieldName: "requiresShipping" });
  };

  const variantTitle = [variant.option1, variant.option2, variant.option3]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Variant title */}
          <div>
            <h2 className="text-2xl font-bold">Variant: {variantTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Edit all properties for this variant
            </p>
          </div>

          {/* Pricing Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="price">
                    Price <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="price"
                      type="text"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      onBlur={handlePriceBlur}
                      placeholder="0.00"
                      className={justSavedField === "price" ? "pr-10" : ""}
                    />
                    {justSavedField === "price" && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="compareAtPrice">Compare at price</Label>
                  <div className="relative">
                    <Input
                      id="compareAtPrice"
                      type="text"
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      onBlur={handleCompareAtPriceBlur}
                      placeholder="0.00"
                      className={justSavedField === "compareAtPrice" ? "pr-10" : ""}
                    />
                    {justSavedField === "compareAtPrice" && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Show a sale price
                  </p>
                </div>
                <div>
                  <Label htmlFor="cost">Cost per item</Label>
                  <div className="relative">
                    <Input
                      id="cost"
                      type="text"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      onBlur={handleCostBlur}
                      placeholder="0.00"
                      className={justSavedField === "cost" ? "pr-10" : ""}
                    />
                    {justSavedField === "cost" && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Not visible to customers
                  </p>
                </div>
              </div>

              {/* Profit calculation */}
              {profit && (
                <div className="pt-2 border-t">
                  <Label>Profit</Label>
                  <p
                    className={`text-lg font-semibold ${
                      profit.amount >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    ${profit.amount.toFixed(2)} ({profit.margin.toFixed(1)}% margin)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inventory Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg">Inventory</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="inventory-tracked" className="text-sm text-muted-foreground font-normal cursor-pointer">
                  Inventory tracked
                </Label>
                <Switch
                  id="inventory-tracked"
                  checked={inventoryPolicy === "deny"}
                  onCheckedChange={(checked) => handleInventoryPolicyChange(checked ? "deny" : "continue")}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Location inventory table */}
              {variantLocationInventory.length > 0 ? (
                <div>
                  <div className="flex items-center gap-4 mb-3 border-b">
                    <button className="text-sm font-medium pb-2 border-b-2 border-primary text-foreground -mb-px">
                      All
                    </button>
                    <button className="text-sm pb-2 border-b-2 border-transparent text-muted-foreground -mb-px cursor-default">
                      Incoming
                    </button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Locations</th>
                          <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Available</th>
                          <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">On hand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantLocationInventory.map((loc) => (
                          <tr key={loc.code} className="border-b last:border-0">
                            <td className="py-2.5 px-3">{loc.name}</td>
                            <td className="text-right py-2.5 px-3 tabular-nums">{loc.qty}</td>
                            <td className="text-right py-2.5 px-3 tabular-nums">{loc.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div>
                  <Label htmlFor="quantity">Available</Label>
                  <div className="relative">
                    <Input
                      id="quantity"
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onBlur={handleQuantityBlur}
                      min="0"
                      className={justSavedField === "quantity" ? "pr-10" : ""}
                    />
                    {justSavedField === "quantity" && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current inventory quantity
                  </p>
                </div>
              )}

              {/* SKU + Barcode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <div className="relative">
                    <Input
                      id="sku"
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      onBlur={handleSkuBlur}
                      placeholder="Enter SKU"
                      className={justSavedField === "sku" ? "pr-10" : ""}
                    />
                    {justSavedField === "sku" && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Stock Keeping Unit
                  </p>
                </div>
                <div>
                  <Label htmlFor="barcode">Barcode</Label>
                  <div className="relative">
                    <Input
                      id="barcode"
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onBlur={handleBarcodeBlur}
                      placeholder="ISBN, UPC, GTIN, etc."
                      className={justSavedField === "barcode" ? "pr-10" : ""}
                    />
                    {justSavedField === "barcode" && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                    )}
                  </div>
                </div>
              </div>

              {/* Sell when out of stock */}
              <div className="flex items-center gap-2 text-sm pt-1">
                <span className="text-muted-foreground">Sell when out of stock</span>
                <span className="font-medium">{inventoryPolicy === "continue" ? "On" : "Off"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="requiresShipping"
                  checked={requiresShipping}
                  onCheckedChange={handleRequiresShippingChange}
                />
                <Label htmlFor="requiresShipping" className="font-normal cursor-pointer">
                  This is a physical product
                </Label>
              </div>

              {requiresShipping && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="weight">Weight</Label>
                    <div className="flex gap-2 mt-1">
                      <div className="relative flex-1">
                        <Input
                          id="weight"
                          type="text"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          onBlur={handleWeightBlur}
                          placeholder="0.0"
                          className={justSavedField === "weight" ? "pr-10" : ""}
                        />
                        {justSavedField === "weight" && (
                          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600 animate-in fade-in zoom-in duration-200" />
                        )}
                      </div>
                      <Select value={weightUnit} onValueChange={handleWeightUnitChange}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lb">lb</SelectItem>
                          <SelectItem value="oz">oz</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="g">g</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Image Section */}
          <VariantImageSection
            variant={variant}
            productId={productId}
            onSaveStatusChange={onSaveStatusChange}
          />

          {/* Metadata Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Created</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(variant.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label>Updated</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(variant.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation Footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={onGoToPrevious}
              disabled={!canGoToPrevious}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous variant
            </Button>
            <Button
              variant="outline"
              onClick={onGoToNext}
              disabled={!canGoToNext}
            >
              Next variant
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
