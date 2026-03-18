import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_COLORS } from "@/lib/colorUtils";
import type { Vendor } from "@shared/schema";

interface VendorSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function VendorSelect({ value, onValueChange }: VendorSelectProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const createVendorMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string | null }) => {
      const response = await apiRequest("POST", "/api/vendors", { name, color });
      return response.json();
    },
    onSuccess: (newVendor: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      onValueChange(newVendor.name);
      setNewVendorName("");
      setSelectedColor(null);
      setIsDialogOpen(false);
      toast({
        title: "Vendor Created",
        description: `${newVendor.name} has been added to the vendor list.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create vendor.",
        variant: "destructive",
      });
    },
  });

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVendorName.trim()) {
      createVendorMutation.mutate({
        name: newVendorName.trim(),
        color: selectedColor
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select value={value || undefined} onValueChange={onValueChange} disabled={isLoading}>
            <SelectTrigger data-testid="select-vendor">
              <SelectValue placeholder={isLoading ? "Loading vendors..." : "Select vendor"} />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.name}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Add new vendor"
              data-testid="button-add-vendor"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
              <DialogDescription>
                Create a new vendor to add to your vendor list.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateVendor} className="space-y-4">
              <div>
                <Label htmlFor="vendorName">Vendor Name</Label>
                <Input
                  id="vendorName"
                  type="text"
                  placeholder="e.g., Apple Inc."
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  required
                  data-testid="input-new-vendor-name"
                />
              </div>

              <div>
                <Label>Color (Optional)</Label>
                <div className="grid grid-cols-6 gap-2 mt-2">
                  {VENDOR_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`w-10 h-10 rounded-md border-2 transition-all ${
                        selectedColor === color.value
                          ? 'border-primary ring-2 ring-primary ring-offset-2'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setSelectedColor(color.value)}
                      title={color.name}
                      data-testid={`color-${color.name.toLowerCase()}`}
                    />
                  ))}
                </div>
                {selectedColor && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground mt-2"
                    onClick={() => setSelectedColor(null)}
                  >
                    Clear color
                  </button>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setNewVendorName("");
                    setSelectedColor(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createVendorMutation.isPending || !newVendorName.trim()}
                  data-testid="button-create-vendor"
                >
                  {createVendorMutation.isPending ? "Creating..." : "Create Vendor"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}