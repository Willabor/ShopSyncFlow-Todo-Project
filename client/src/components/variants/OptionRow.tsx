import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GripVertical, Plus, X, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProductOption, ProductVariant } from "@shared/schema";

interface OptionRowProps {
  option: ProductOption;
  productId: string;
}

export function OptionRow({ option, productId }: OptionRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(option.name);
  const [values, setValues] = useState(option.values);
  const [newValue, setNewValue] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [showDeleteOptionDialog, setShowDeleteOptionDialog] = useState(false);
  const [valueToRemove, setValueToRemove] = useState<string | null>(null);

  // Fetch variants to show count in warnings
  const { data: variants = [] } = useQuery<ProductVariant[]>({
    queryKey: ["variants", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch variants");
      return res.json();
    },
  });

  // Drag and drop setup
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Update option mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<ProductOption>) => {
      const res = await fetch(
        `/api/products/${productId}/options/${option.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(updates),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["options", productId] });
      toast({ title: "Option updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  // Delete option mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/products/${productId}/options/${option.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["options", productId] });
      toast({ title: "Option deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  // Update name
  const handleNameUpdate = () => {
    if (name !== option.name && name.trim()) {
      updateMutation.mutate({ name: name.trim() });
    }
    setIsEditingName(false);
  };

  // Add value
  const handleAddValue = () => {
    if (newValue.trim() && !values.includes(newValue.trim())) {
      const updatedValues = [...values, newValue.trim()];
      setValues(updatedValues);
      updateMutation.mutate({ values: updatedValues });
      setNewValue("");
    }
  };

  // Calculate how many variants use a specific option value
  const getVariantsUsingValue = (value: string): number => {
    if (!variants.length) return 0;

    // Determine which option position this is (1, 2, or 3)
    const optionField = option.position === 1 ? "option1" :
                       option.position === 2 ? "option2" : "option3";

    return variants.filter((v) => v[optionField] === value).length;
  };

  // Show confirmation dialog before removing value
  const handleRemoveValueClick = (value: string) => {
    setValueToRemove(value);
  };

  // Actually remove the value after confirmation
  const confirmRemoveValue = () => {
    if (!valueToRemove) return;

    const updatedValues = values.filter((v) => v !== valueToRemove);
    setValues(updatedValues);
    updateMutation.mutate({ values: updatedValues });
    setValueToRemove(null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 p-3 border rounded-lg bg-card"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing pt-2"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3">
        {/* Option Name */}
        <div className="flex items-center gap-2">
          {isEditingName ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameUpdate}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameUpdate();
                if (e.key === "Escape") {
                  setName(option.name);
                  setIsEditingName(false);
                }
              }}
              autoFocus
              className="h-8 max-w-[200px]"
            />
          ) : (
            <div
              onClick={() => setIsEditingName(true)}
              className="font-medium cursor-pointer hover:text-primary"
            >
              {name}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteOptionDialog(true)}
            className="h-8 w-8"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        {/* Option Values */}
        <div className="flex flex-wrap gap-2 items-center">
          {values.map((value) => (
            <Badge
              key={value}
              variant="secondary"
              className="pl-2 pr-1 py-1 gap-1"
            >
              {value}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveValueClick(value)}
                className="h-4 w-4 p-0 hover:bg-transparent"
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}

          {/* Add Value Input */}
          <div className="flex items-center gap-1">
            <Input
              placeholder="Add value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddValue();
              }}
              className="h-7 w-32"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAddValue}
              className="h-7 w-7"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Option Warning Dialog */}
      <AlertDialog open={showDeleteOptionDialog} onOpenChange={setShowDeleteOptionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete option "{name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-destructive">
                WARNING: This will delete ALL {variants.length} variant{variants.length !== 1 ? 's' : ''} for this product.
              </p>
              <p>
                Deleting an option invalidates the variant structure. All existing variants
                will be permanently deleted and cannot be recovered.
              </p>
              <p>This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteOptionDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete option and all variants
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Value Warning Dialog */}
      <AlertDialog open={!!valueToRemove} onOpenChange={(open) => !open && setValueToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove "{valueToRemove}" from {name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {valueToRemove && getVariantsUsingValue(valueToRemove) > 0 ? (
                <>
                  <p className="font-semibold text-destructive">
                    WARNING: {getVariantsUsingValue(valueToRemove)} variant{getVariantsUsingValue(valueToRemove) !== 1 ? 's' : ''} use this value.
                  </p>
                  <p>
                    Removing this value will leave those variants with invalid option values.
                    You should manually delete or update those variants before removing this value.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Note: In a future update, we'll automatically clean up affected variants.
                  </p>
                </>
              ) : (
                <p>
                  This value is not currently used by any variants, so it's safe to remove.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveValue}
              className={valueToRemove && getVariantsUsingValue(valueToRemove) > 0
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""}
            >
              {valueToRemove && getVariantsUsingValue(valueToRemove) > 0
                ? "Remove anyway"
                : "Remove value"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
