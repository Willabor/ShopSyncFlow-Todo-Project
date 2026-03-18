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
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

interface BulkDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  productId: string;
}

export function BulkDeleteDialog({
  isOpen,
  onClose,
  selectedIds,
  productId,
}: BulkDeleteDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const errors: string[] = [];

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
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete variants",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    bulkDeleteMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete variants
          </DialogTitle>
          <DialogDescription className="pt-2">
            Are you sure you want to delete {selectedIds.length} variant{selectedIds.length > 1 ? "s" : ""}?
            <span className="block mt-2 text-sm font-semibold text-destructive">
              This action cannot be undone.
            </span>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={bulkDeleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={bulkDeleteMutation.isPending}
          >
            {bulkDeleteMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete {selectedIds.length} variant{selectedIds.length > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
