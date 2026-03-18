import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { ProductVariant } from "@shared/schema";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Column {
  id: string;
  label: string;
  field: string | null;
  editable: boolean;
  type: "text" | "number" | "select" | "checkbox";
  options?: string[];
  format?: (variant: ProductVariant) => string;
}

interface EditableCellProps {
  variant: ProductVariant;
  productId: string;
  column: Column;
  isEditing: boolean;
  isFocused: boolean;
  onEdit: (value: any) => void;
  onFocus: () => void;
  onSaveStatusChange: (status: "idle" | "saving" | "saved" | "error") => void;
}

export function EditableCell({
  variant,
  productId,
  column,
  isEditing,
  isFocused,
  onEdit,
  onFocus,
  onSaveStatusChange,
}: EditableCellProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state
  const currentValue = column.field ? variant[column.field as keyof ProductVariant] : null;

  // Convert current value to string for editing
  const currentValueAsString = currentValue !== null && currentValue !== undefined
    ? String(currentValue)
    : "";

  const [localValue, setLocalValue] = useState(currentValueAsString);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync local value with variant changes
  useEffect(() => {
    setLocalValue(currentValueAsString);
    setIsDirty(false);
  }, [currentValueAsString]);

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
    onMutate: () => {
      onSaveStatusChange("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      onSaveStatusChange("saved");
      setTimeout(() => onSaveStatusChange("idle"), 2000);
      setIsDirty(false);
      setError(null);
    },
    onError: (error: Error) => {
      onSaveStatusChange("error");
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
      setTimeout(() => onSaveStatusChange("idle"), 3000);
      // Revert to original value
      setLocalValue(currentValueAsString);
      setIsDirty(false);
    },
  });

  // Validation function
  function validate(value: any): string | null {
    if (!column.field) return null;

    switch (column.field) {
      case "price":
        const priceNum = parseFloat(value);
        if (isNaN(priceNum)) return "Must be a number";
        if (priceNum < 0) return "Must be positive";
        return null;

      case "compareAtPrice":
        if (!value) return null; // Optional
        const compareNum = parseFloat(value);
        if (isNaN(compareNum)) return "Must be a number";
        if (compareNum < 0) return "Must be positive";
        const priceValue = parseFloat(variant.price);
        if (compareNum < priceValue) return "Must be greater than price";
        return null;

      case "cost":
        if (!value) return null; // Optional
        const costNum = parseFloat(value);
        if (isNaN(costNum)) return "Must be a number";
        if (costNum < 0) return "Must be positive";
        return null;

      case "inventoryQuantity":
        const qty = parseInt(value, 10);
        if (isNaN(qty)) return "Must be a number";
        if (qty < 0) return "Must be non-negative";
        return null;

      case "weight":
        if (!value) return null; // Optional
        const weightNum = parseFloat(value);
        if (isNaN(weightNum)) return "Must be a number";
        if (weightNum <= 0) return "Must be positive";
        return null;

      default:
        return null;
    }
  }

  // Handle blur - save changes
  async function handleBlur() {
    if (!isDirty || !column.field) {
      return;
    }

    // Validate
    const validationError = validate(localValue);
    if (validationError) {
      setError(validationError);
      toast({
        title: "Invalid value",
        description: validationError,
        variant: "destructive",
      });
      return; // Keep in edit mode
    }

    // Clear error
    setError(null);

    // Prepare update
    const updates: Partial<ProductVariant> = {};

    // Convert value to appropriate type
    if (column.type === "number") {
      if (localValue === "") {
        updates[column.field as keyof ProductVariant] = null as any;
      } else {
        updates[column.field as keyof ProductVariant] = (
          column.field === "inventoryQuantity"
            ? parseInt(localValue as string, 10)
            : localValue
        ) as any;
      }
    } else {
      updates[column.field as keyof ProductVariant] = (localValue || null) as any;
    }

    // Save
    onEdit(updates[column.field as keyof ProductVariant]);
    updateMutation.mutate(updates);
  }

  // Handle checkbox change
  function handleCheckboxChange(checked: boolean) {
    if (!column.field) return;

    const updates: Partial<ProductVariant> = {
      [column.field]: checked,
    };

    onEdit(checked);
    updateMutation.mutate(updates as Partial<ProductVariant>);
  }

  // Handle select change
  function handleSelectChange(value: string) {
    if (!column.field) return;

    const updates: Partial<ProductVariant> = {
      [column.field]: value,
    };

    onEdit(value);
    updateMutation.mutate(updates as Partial<ProductVariant>);
  }

  // Render based on column type
  if (column.type === "checkbox") {
    return (
      <div className="px-2 py-1">
        <Checkbox
          checked={!!currentValue}
          onCheckedChange={handleCheckboxChange}
        />
      </div>
    );
  }

  if (column.type === "select" && column.options) {
    return (
      <Select value={currentValue as string} onValueChange={handleSelectChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {column.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "deny" ? "Deny when out of stock" : "Continue selling"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Text/Number input
  if (isEditing) {
    return (
      <Input
        type={column.type === "number" ? "text" : "text"}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          setIsDirty(true);
          setError(null);
        }}
        onBlur={handleBlur}
        autoFocus
        className={cn("h-8 text-sm", error && "border-red-500")}
      />
    );
  }

  // Display mode
  const displayValue = column.format
    ? column.format(variant)
    : currentValue !== null && currentValue !== undefined
    ? String(currentValue)
    : "—";

  return (
    <button
      className={cn(
        "w-full h-full px-2 py-1 text-left text-sm hover:bg-muted rounded",
        isFocused && "ring-2 ring-primary",
        error && "text-red-600 bg-red-50"
      )}
      onClick={onFocus}
      onDoubleClick={onFocus}
    >
      {displayValue}
    </button>
  );
}
