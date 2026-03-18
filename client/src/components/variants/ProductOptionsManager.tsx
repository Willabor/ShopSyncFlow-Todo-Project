import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OptionRow } from "./OptionRow";
import { AddOptionDialog } from "./AddOptionDialog";
import type { ProductOption } from "@shared/schema";

interface ProductOptionsManagerProps {
  productId: string;
}

export function ProductOptionsManager({ productId }: ProductOptionsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Fetch options
  const { data: options = [], isLoading } = useQuery<ProductOption[]>({
    queryKey: ["options", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/options`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch options");
      return res.json();
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (optionIds: string[]) => {
      const res = await fetch(`/api/products/${productId}/options/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ optionIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["options", productId] });
      toast({ title: "Options reordered" });
    },
    onError: () => {
      toast({ title: "Failed to reorder", variant: "destructive" });
    },
  });

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = options.findIndex((o) => o.id === active.id);
    const newIndex = options.findIndex((o) => o.id === over.id);

    const newOrder = [...options];
    const [removed] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, removed);

    // Optimistically update UI
    queryClient.setQueryData(["options", productId], newOrder);

    // Save to server
    reorderMutation.mutate(newOrder.map((o) => o.id));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Variants</CardTitle>
        {options.length < 3 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add variant
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading options...
          </div>
        ) : options.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No options yet. Add your first option to create variants.
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={options.map((o) => o.id)}
              strategy={verticalListSortingStrategy}
            >
              {options.map((option) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  productId={productId}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}

        {options.length > 0 && options.length < 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add another option
          </Button>
        )}
      </CardContent>

      <AddOptionDialog
        productId={productId}
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        currentPosition={options.length + 1}
      />
    </Card>
  );
}
