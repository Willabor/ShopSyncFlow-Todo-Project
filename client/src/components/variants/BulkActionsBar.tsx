import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Hash, Trash2, X } from "lucide-react";

interface BulkActionsBarProps {
  selectedIds: string[];
  productId: string;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedIds,
  productId,
  onClearSelection,
}: BulkActionsBarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog state
  const [showSetPrice, setShowSetPrice] = useState(false);
  const [showSetQuantity, setShowSetQuantity] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form values
  const [priceValue, setPriceValue] = useState("");
  const [quantityValue, setQuantityValue] = useState("");

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string | number }) => {
      const errors = [];

      for (const id of selectedIds) {
        try {
          const res = await fetch(`/api/products/${productId}/variants/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ [field]: value }),
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
      onClearSelection();
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const errors = [];

      for (const id of selectedIds) {
        try {
          const res = await fetch(`/api/products/${productId}/variants/${id}`, {
            method: "DELETE",
            credentials: "include",
          });

          if (!res.ok) {
            errors.push(id);
          }
        } catch (error) {
          errors.push(id);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Failed to delete ${errors.length} variant(s)`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({
        title: "Variants deleted",
        description: `Deleted ${selectedIds.length} variant(s)`,
      });
      onClearSelection();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle set price
  const handleSetPrice = () => {
    const numPrice = parseFloat(priceValue);
    if (isNaN(numPrice) || numPrice < 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price (0 or greater)",
        variant: "destructive",
      });
      return;
    }

    bulkUpdateMutation.mutate({ field: "price", value: priceValue });
    setShowSetPrice(false);
    setPriceValue("");
  };

  // Handle set quantity
  const handleSetQuantity = () => {
    const numQuantity = parseInt(quantityValue, 10);
    if (isNaN(numQuantity) || numQuantity < 0) {
      toast({
        title: "Invalid quantity",
        description: "Please enter a valid quantity (0 or greater)",
        variant: "destructive",
      });
      return;
    }

    bulkUpdateMutation.mutate({ field: "inventoryQuantity", value: numQuantity });
    setShowSetQuantity(false);
    setQuantityValue("");
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate();
    setShowDeleteConfirm(false);
  };

  return (
    <>
      {/* Bulk Actions Bar */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="font-medium text-sm">
            {selectedIds.length} selected
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSetPrice(true)}
            disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Set price
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSetQuantity(true)}
            disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
          >
            <Hash className="mr-2 h-4 w-4" />
            Set quantity
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearSelection}
            disabled={bulkUpdateMutation.isPending || bulkDeleteMutation.isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Set Price Dialog */}
      <Dialog open={showSetPrice} onOpenChange={setShowSetPrice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set price for {selectedIds.length} variant(s)</DialogTitle>
            <DialogDescription>
              This will update the price for all selected variants
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="bulkPrice">New price</Label>
            <Input
              id="bulkPrice"
              type="text"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetPrice(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetPrice} disabled={bulkUpdateMutation.isPending}>
              {bulkUpdateMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Quantity Dialog */}
      <Dialog open={showSetQuantity} onOpenChange={setShowSetQuantity}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set quantity for {selectedIds.length} variant(s)</DialogTitle>
            <DialogDescription>
              This will update the inventory quantity for all selected variants
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="bulkQuantity">New quantity</Label>
            <Input
              id="bulkQuantity"
              type="number"
              value={quantityValue}
              onChange={(e) => setQuantityValue(e.target.value)}
              placeholder="0"
              min="0"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetQuantity(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetQuantity} disabled={bulkUpdateMutation.isPending}>
              {bulkUpdateMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.length} variant(s)?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The selected variants will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
