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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

interface AddOptionDialogProps {
  productId: string;
  isOpen: boolean;
  onClose: () => void;
  currentPosition: number;
}

const RECOMMENDED_OPTIONS = [
  { name: "Color", values: ["Black", "White", "Gray", "Navy", "Red"] },
  { name: "Size", values: ["Small", "Medium", "Large", "X-Large", "XX-Large"] },
  { name: "Material", values: ["Cotton", "Polyester", "Wool", "Silk", "Blend"] },
  { name: "Style", values: ["Regular", "Slim", "Relaxed", "Athletic"] },
];

export function AddOptionDialog({
  productId,
  isOpen,
  onClose,
  currentPosition,
}: AddOptionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [newValue, setNewValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Create option mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${productId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          position: currentPosition,
          values,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["options", productId] });
      toast({ title: "Option added" });
      handleClose();
    },
    onError: () => {
      toast({ title: "Failed to add option", variant: "destructive" });
    },
  });

  const handleClose = () => {
    setName("");
    setValues([]);
    setNewValue("");
    setSearchTerm("");
    onClose();
  };

  const handleSelectRecommended = (option: typeof RECOMMENDED_OPTIONS[0]) => {
    setName(option.name);
    setValues(option.values);
  };

  const handleAddValue = () => {
    if (newValue.trim() && !values.includes(newValue.trim())) {
      setValues([...values, newValue.trim()]);
      setNewValue("");
    }
  };

  const handleRemoveValue = (value: string) => {
    setValues(values.filter((v) => v !== value));
  };

  const handleCreate = () => {
    if (!name.trim() || values.length === 0) {
      toast({
        title: "Validation error",
        description: "Option name and at least one value are required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  const filteredRecommended = RECOMMENDED_OPTIONS.filter((opt) =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add product option</DialogTitle>
          <DialogDescription>
            Select from recommended options or create a custom one
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <Input
            placeholder="Search options..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {/* Recommended Options */}
          {searchTerm === "" && filteredRecommended.length > 0 && (
            <div>
              <Label className="text-sm text-muted-foreground mb-2">
                Recommended
              </Label>
              <div className="grid gap-2">
                {filteredRecommended.map((option) => (
                  <Button
                    key={option.name}
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => handleSelectRecommended(option)}
                  >
                    <div className="text-left">
                      <div className="font-medium">{option.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.values.slice(0, 3).join(", ")}
                        {option.values.length > 3 && "..."}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Option Form */}
          <div className="space-y-4 pt-4 border-t">
            <div>
              <Label htmlFor="name">Option name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Color, Size, Material"
              />
            </div>

            <div>
              <Label>Option values</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {values.map((value) => (
                  <Badge key={value} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                    {value}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveValue(value)}
                      className="h-4 w-4 p-0 hover:bg-transparent"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add value..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddValue();
                    }
                  }}
                />
                <Button onClick={handleAddValue} type="button">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Adding..." : "Add option"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
