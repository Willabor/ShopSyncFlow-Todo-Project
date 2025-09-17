import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProductForm({ isOpen, onClose }: ProductFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    // Product data
    title: "",
    vendor: "",
    description: "",
    category: "",
    sku: "",
    price: "",
    
    // Task data
    orderNumber: "",
    priority: "medium",
    receivedDate: new Date().toISOString().split('T')[0],
    assignedTo: "",
    notes: "",
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/products", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Product Created",
        description: "New product task has been created successfully.",
      });
      onClose();
      // Reset form
      setFormData({
        title: "",
        vendor: "",
        description: "",
        category: "",
        sku: "",
        price: "",
        orderNumber: "",
        priority: "medium",
        receivedDate: new Date().toISOString().split('T')[0],
        assignedTo: "",
        notes: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create product task.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const productData = {
      title: formData.title,
      vendor: formData.vendor,
      description: formData.description,
      category: formData.category,
      sku: formData.sku,
      price: formData.price,
    };

    const taskData = {
      orderNumber: formData.orderNumber,
      priority: formData.priority,
      receivedDate: formData.receivedDate,
      assignedTo: formData.assignedTo || undefined,
      notes: formData.notes,
    };

    createProductMutation.mutate({
      product: productData,
      task: taskData,
    });
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="product-form-modal">
        <DialogHeader>
          <DialogTitle>Create New Product Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          
          {/* Product Intake Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Product Intake Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vendor">Vendor Name *</Label>
                <Input
                  id="vendor"
                  type="text"
                  placeholder="e.g., Apple Inc."
                  value={formData.vendor}
                  onChange={(e) => updateFormData("vendor", e.target.value)}
                  required
                  data-testid="input-vendor"
                />
              </div>
              <div>
                <Label htmlFor="orderNumber">Order Number</Label>
                <Input
                  id="orderNumber"
                  type="text"
                  placeholder="e.g., PO-2024-001"
                  value={formData.orderNumber}
                  onChange={(e) => updateFormData("orderNumber", e.target.value)}
                  data-testid="input-order-number"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="receivedDate">Received Date *</Label>
                <Input
                  id="receivedDate"
                  type="date"
                  value={formData.receivedDate}
                  onChange={(e) => updateFormData("receivedDate", e.target.value)}
                  required
                  data-testid="input-received-date"
                />
              </div>
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => updateFormData("priority", value)}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Product Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Product Details</h3>
            
            <div>
              <Label htmlFor="title">Product Name *</Label>
              <Input
                id="title"
                type="text"
                placeholder="e.g., iPhone 15 Pro Max"
                value={formData.title}
                onChange={(e) => updateFormData("title", e.target.value)}
                required
                data-testid="input-product-title"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  type="text"
                  placeholder="e.g., IPH15PM-256"
                  value={formData.sku}
                  onChange={(e) => updateFormData("sku", e.target.value)}
                  data-testid="input-sku"
                />
              </div>
              <div>
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="text"
                  placeholder="e.g., $1,199.00"
                  value={formData.price}
                  onChange={(e) => updateFormData("price", e.target.value)}
                  data-testid="input-price"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={formData.category} onValueChange={(value) => updateFormData("category", value)}>
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="electronics">Electronics</SelectItem>
                  <SelectItem value="clothing">Clothing</SelectItem>
                  <SelectItem value="home">Home & Garden</SelectItem>
                  <SelectItem value="sports">Sports & Outdoors</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="description">Product Description</Label>
              <Textarea
                id="description"
                className="h-24"
                placeholder="Brief description of the product..."
                value={formData.description}
                onChange={(e) => updateFormData("description", e.target.value)}
                data-testid="textarea-description"
              />
            </div>
          </div>
          
          {/* Assignment */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Assignment</h3>
            
            <div>
              <Label htmlFor="assignedTo">Assign to Editor (Optional)</Label>
              <Select value={formData.assignedTo} onValueChange={(value) => updateFormData("assignedTo", value)}>
                <SelectTrigger data-testid="select-assignee">
                  <SelectValue placeholder="Leave unassigned (triage first)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Leave unassigned (triage first)</SelectItem>
                  {/* Note: In a real app, these would be fetched from the API */}
                  <SelectItem value="sarah-miller">Sarah Miller</SelectItem>
                  <SelectItem value="john-doe">John Doe</SelectItem>
                  <SelectItem value="alex-lee">Alex Lee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="notes">Notes for Editor</Label>
              <Textarea
                id="notes"
                className="h-20"
                placeholder="Any special instructions or notes..."
                value={formData.notes}
                onChange={(e) => updateFormData("notes", e.target.value)}
                data-testid="textarea-notes"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4 border-t border-border">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              data-testid="button-cancel-product"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createProductMutation.isPending}
              data-testid="button-create-product"
            >
              {createProductMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
