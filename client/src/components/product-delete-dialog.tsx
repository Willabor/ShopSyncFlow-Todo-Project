import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";

interface ProductDeleteDialogProps {
  productId: string | null;
  productTitle: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProductDeleteDialog({
  productId,
  productTitle,
  isOpen,
  onClose,
  onSuccess,
}: ProductDeleteDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("No product ID");
      const response = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete product");
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate queries to refetch product list and stats
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });

      toast({
        title: "✅ Product Deleted",
        description: `"${productTitle}" has been permanently deleted.`,
      });

      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            Delete Product
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Are you sure you want to delete <strong>"{productTitle}"</strong>?
            </p>
            <p className="text-red-600 dark:text-red-400">
              This action cannot be undone. The product will be permanently removed from
              the database.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Product
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
