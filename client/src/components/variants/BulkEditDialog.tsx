import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface BulkEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  productId: string;
}

type FieldType = "price" | "compareAtPrice" | "cost" | "inventoryQuantity" | "sku" | "barcode" | "weight" | "inventoryPolicy";

export function BulkEditDialog({
  isOpen,
  onClose,
  selectedIds,
  productId,
}: BulkEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedField, setSelectedField] = useState<FieldType>("price");
  const [value, setValue] = useState("");

  const bulkEditMutation = useMutation({
    mutationFn: async () => {
      const errors: string[] = [];

      for (const id of selectedIds) {
        try {
          const updates: Record<string, any> = {};

          // Convert value to appropriate type based on field
          if (selectedField === "inventoryQuantity") {
            const qty = parseInt(value, 10);
            if (isNaN(qty) || qty < 0) {
              throw new Error("Invalid quantity");
            }
            updates[selectedField] = qty;
          } else if (selectedField === "price" || selectedField === "compareAtPrice" || selectedField === "cost") {
            const numValue = parseFloat(value);
            if (isNaN(numValue) || numValue < 0) {
              throw new Error("Invalid price");
            }
            updates[selectedField] = value;
          } else if (selectedField === "weight") {
            const weightNum = parseFloat(value);
            if (isNaN(weightNum) || weightNum <= 0) {
              throw new Error("Invalid weight");
            }
            updates[selectedField] = value;
          } else {
            // String fields (sku, barcode, inventoryPolicy)
            updates[selectedField] = value;
          }

          const res = await fetch(`/api/products/${productId}/variants/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
          });

          if (!res.ok) {
            errors.push(id);
          }
        } catch (error) {
          errors.push(id);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} variant(s)`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({
        title: "Variants updated",
        description: `Updated ${selectedIds.length} variant(s)`,
      });
      setValue("");
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update variants",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!value.trim()) {
      toast({
        title: "Invalid value",
        description: "Please enter a value",
        variant: "destructive",
      });
      return;
    }

    bulkEditMutation.mutate();
  };

  const fieldOptions = [
    { value: "price", label: "Price" },
    { value: "compareAtPrice", label: "Compare at price" },
    { value: "cost", label: "Cost" },
    { value: "inventoryQuantity", label: "Quantity" },
    { value: "sku", label: "SKU" },
    { value: "barcode", label: "Barcode" },
    { value: "weight", label: "Weight" },
    { value: "inventoryPolicy", label: "Inventory policy" },
  ];

  const isNumberField = ["price", "compareAtPrice", "cost", "inventoryQuantity", "weight"].includes(selectedField);
  const isPolicyField = selectedField === "inventoryPolicy";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk edit variants</DialogTitle>
          <DialogDescription>
            Update {selectedIds.length} selected variant{selectedIds.length > 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field">Field to update</Label>
            <Select
              value={selectedField}
              onValueChange={(val) => {
                setSelectedField(val as FieldType);
                setValue("");
              }}
            >
              <SelectTrigger id="field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fieldOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="value">New value</Label>
            {isPolicyField ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger id="value">
                  <SelectValue placeholder="Select policy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deny">Deny when out of stock</SelectItem>
                  <SelectItem value="continue">Continue selling</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="value"
                type={isNumberField ? "number" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Enter ${fieldOptions.find(f => f.value === selectedField)?.label.toLowerCase()}`}
                step={isNumberField ? "any" : undefined}
                min={isNumberField ? "0" : undefined}
                disabled={bulkEditMutation.isPending}
              />
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={bulkEditMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={bulkEditMutation.isPending || !value.trim()}>
              {bulkEditMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update {selectedIds.length} variant{selectedIds.length > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
