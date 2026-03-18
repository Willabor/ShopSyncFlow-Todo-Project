import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import type { ProductVariant } from "@shared/schema";

interface VariantRowExpandedProps {
  variant: ProductVariant;
  productId: string;
  onCollapse: () => void;
}

export function VariantRowExpanded({
  variant,
  productId,
  onCollapse,
}: VariantRowExpandedProps) {
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
      onCollapse();
    },
    onError: () => {
      toast({
        title: "Failed to delete variant",
        variant: "destructive",
      });
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
      updateMutation.mutate({ price });
    }
  };

  const handleCompareAtPriceBlur = () => {
    if (compareAtPrice !== (variant.compareAtPrice || "")) {
      if (compareAtPrice && (isNaN(parseFloat(compareAtPrice)) || parseFloat(compareAtPrice) < 0)) {
        toast({
          title: "Invalid compare at price",
          description: "Price must be a positive number",
          variant: "destructive",
        });
        setCompareAtPrice(variant.compareAtPrice || "");
        return;
      }
      updateMutation.mutate({ compareAtPrice: compareAtPrice || null });
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
      updateMutation.mutate({ cost: cost || null });
    }
  };

  const handleSkuBlur = () => {
    if (sku !== (variant.sku || "")) {
      updateMutation.mutate({ sku: sku || null });
    }
  };

  const handleBarcodeBlur = () => {
    if (barcode !== (variant.barcode || "")) {
      updateMutation.mutate({ barcode: barcode || null });
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
      updateMutation.mutate({ inventoryQuantity: newQuantity });
    }
  };

  const handleInventoryPolicyChange = (value: string) => {
    setInventoryPolicy(value);
    updateMutation.mutate({ inventoryPolicy: value });
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
      updateMutation.mutate({ weight: weight || null });
    }
  };

  const handleWeightUnitChange = (value: string) => {
    setWeightUnit(value);
    updateMutation.mutate({ weightUnit: value });
  };

  const handleRequiresShippingChange = (checked: boolean) => {
    setRequiresShipping(checked);
    updateMutation.mutate({ requiresShipping: checked });
  };

  const handleDelete = () => {
    const title = [variant.option1, variant.option2, variant.option3]
      .filter(Boolean)
      .join(" / ");
    if (confirm(`Delete variant "${title}"? This cannot be undone.`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <div className="bg-muted/30 p-6 border-b space-y-6">
      {/* Pricing Section */}
      <div>
        <h4 className="font-medium text-sm mb-3">Pricing</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={handlePriceBlur}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="compareAtPrice">Compare at price</Label>
            <Input
              id="compareAtPrice"
              type="text"
              value={compareAtPrice}
              onChange={(e) => setCompareAtPrice(e.target.value)}
              onBlur={handleCompareAtPriceBlur}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="cost">Cost per item</Label>
            <Input
              id="cost"
              type="text"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onBlur={handleCostBlur}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Inventory Section */}
      <div>
        <h4 className="font-medium text-sm mb-3">Inventory</h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onBlur={handleSkuBlur}
              placeholder="Enter SKU"
            />
          </div>
          <div>
            <Label htmlFor="barcode">Barcode</Label>
            <Input
              id="barcode"
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onBlur={handleBarcodeBlur}
              placeholder="Enter barcode"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onBlur={handleQuantityBlur}
              min="0"
            />
          </div>
          <div>
            <Label>Inventory policy</Label>
            <RadioGroup value={inventoryPolicy} onValueChange={handleInventoryPolicyChange}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="deny" id="deny" />
                <Label htmlFor="deny" className="font-normal cursor-pointer">
                  Deny (Don't sell when out of stock)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="continue" id="continue" />
                <Label htmlFor="continue" className="font-normal cursor-pointer">
                  Continue (Allow overselling)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </div>

      {/* Shipping Section */}
      <div>
        <h4 className="font-medium text-sm mb-3">Shipping</h4>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="col-span-2">
            <Label htmlFor="weight">Weight</Label>
            <div className="flex gap-2">
              <Input
                id="weight"
                type="text"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onBlur={handleWeightBlur}
                placeholder="0.0"
                className="flex-1"
              />
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
        <div className="flex items-center space-x-2">
          <Checkbox
            id="requiresShipping"
            checked={requiresShipping}
            onCheckedChange={handleRequiresShippingChange}
          />
          <Label htmlFor="requiresShipping" className="font-normal cursor-pointer">
            This variant requires shipping
          </Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete variant
        </Button>
        <Button variant="outline" onClick={onCollapse}>
          Collapse
        </Button>
      </div>

      {/* Loading indicator */}
      {updateMutation.isPending && (
        <div className="absolute top-4 right-4">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}
