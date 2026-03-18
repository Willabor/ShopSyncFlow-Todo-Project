import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VendorSelect } from "@/components/vendor-select";
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
    orderLink: "",
    priority: "medium",
    receivedDate: new Date().toISOString().split('T')[0],
    assignedTo: "unassigned",
    notes: "",
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/products", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
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
        orderLink: "",
        priority: "medium",
        receivedDate: new Date().toISOString().split('T')[0],
        assignedTo: "unassigned",
        notes: "",
      });
    },
    onError: (error: any) => {
      console.error("Task creation error:", error);
      const errorMessage = error.details || error.message || "Failed to create product task.";
      toast({
        title: "Creation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.title.trim()) {
      toast({
        title: "Validation Error",
        description: "Product title is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.vendor.trim()) {
      toast({
        title: "Validation Error",
        description: "Vendor name is required.",
        variant: "destructive",
      });
      return;
    }

    const productData = {
      title: formData.title.trim(),
      vendor: formData.vendor.trim(),
      description: formData.description?.trim() || "",
      category: formData.category?.trim() || "",
      sku: formData.sku?.trim() || "",
      price: formData.price?.trim() || "",
    };

    const taskData = {
      orderNumber: formData.orderNumber?.trim() || "",
      orderLink: formData.orderLink?.trim() || "",
      priority: formData.priority,
      receivedDate: formData.receivedDate ? new Date(formData.receivedDate).toISOString() : new Date().toISOString(),
      ...(formData.assignedTo !== "unassigned" && formData.assignedTo ? { assignedTo: formData.assignedTo } : {}),
      notes: formData.notes?.trim() || "",
    };

    console.log("Submitting product data:", productData);
    console.log("Submitting task data:", taskData);

    createProductMutation.mutate({
      product: productData,
      task: taskData,
    });
  };

  const normalizeUrl = (url: string): string => {
    if (!url.trim()) return url;

    // If it already has a protocol, return as-is
    if (url.match(/^https?:\/\//i)) {
      return url;
    }

    // If it looks like a URL but missing protocol, add https://
    if (url.includes('.') && !url.includes(' ')) {
      return `https://${url}`;
    }

    // Return as-is for other cases
    return url;
  };

  const updateFormData = (field: string, value: string) => {
    // Normalize order link URLs automatically
    if (field === 'orderLink' && value) {
      value = normalizeUrl(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="product-form-modal">
        <DialogHeader>
          <DialogTitle>Create New Product Task</DialogTitle>
          <DialogDescription>
            Fill in the product details and task information to create a new workflow item.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          
          {/* Product Intake Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Product Intake Information</h3>
            
            <div>
              <Label htmlFor="vendor">Vendor Name *</Label>
              <VendorSelect
                value={formData.vendor}
                onValueChange={(value) => updateFormData("vendor", value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div>
                <Label htmlFor="orderLink">Order Link (Reference)</Label>
                <Input
                  id="orderLink"
                  type="text"
                  placeholder="e.g., nexusclothing.com/orders/12345 or www.vendor.com"
                  value={formData.orderLink}
                  onChange={(e) => updateFormData("orderLink", e.target.value)}
                  data-testid="input-order-link"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  💡 URLs will automatically get https:// added if needed
                </p>
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
                  <SelectItem value="unassigned">Leave unassigned (triage first)</SelectItem>
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
