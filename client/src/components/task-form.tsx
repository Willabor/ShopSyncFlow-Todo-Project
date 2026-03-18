import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import type { StepTemplate } from "@shared/schema";

interface TaskFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TaskForm({ isOpen, onClose }: TaskFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    vendorId: "",
    priority: "medium",
    orderNumber: "",
    orderLink: "",
    notes: "",
    receivedDate: new Date().toISOString().split('T')[0],
  });

  // Fetch available vendors
  const { data: vendors = [] } = useQuery<Array<{ id: string; name: string; color?: string }>>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/vendors");
      if (!response.ok) throw new Error("Failed to fetch vendors");
      return response.json();
    },
  });

  // Fetch available categories
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/step-templates/categories"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/step-templates/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  // Fetch template steps for selected category
  const { data: templateSteps = [] } = useQuery<StepTemplate[]>({
    queryKey: ["/api/step-templates/by-category", formData.category],
    queryFn: async () => {
      if (!formData.category) return [];
      const response = await apiRequest("GET", `/api/step-templates/by-category/${encodeURIComponent(formData.category)}`);
      if (!response.ok) throw new Error("Failed to fetch template steps");
      return response.json();
    },
    enabled: !!formData.category,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      // First create the task
      const taskResponse = await apiRequest("POST", "/api/tasks", data.task);
      if (!taskResponse.ok) {
        const errorData = await taskResponse.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${taskResponse.status}`);
      }
      const task = await taskResponse.json();

      // Then apply template steps if category is selected
      if (data.category) {
        const stepsResponse = await apiRequest(
          "POST",
          `/api/tasks/${task.id}/steps/from-template`,
          { category: data.category }
        );
        if (!stepsResponse.ok) {
          console.error("Failed to apply template steps, but task was created");
        }
      }

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Task Created",
        description: "New task has been created successfully.",
      });
      onClose();
      // Reset form
      setFormData({
        title: "",
        description: "",
        category: "",
        vendorId: "",
        priority: "medium",
        orderNumber: "",
        orderLink: "",
        notes: "",
        receivedDate: new Date().toISOString().split('T')[0],
      });
    },
    onError: (error: any) => {
      console.error("Task creation error:", error);
      const errorMessage = error.details || error.message || "Failed to create task.";
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
        description: "Task title is required.",
        variant: "destructive",
      });
      return;
    }

    const taskData = {
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      category: formData.category || null,
      vendorId: formData.vendorId || null,
      priority: formData.priority,
      orderNumber: formData.orderNumber?.trim() || null,
      orderLink: formData.orderLink?.trim() || null,
      notes: formData.notes?.trim() || null,
      receivedDate: formData.receivedDate ? new Date(formData.receivedDate).toISOString() : new Date().toISOString(),
      createdBy: user?.id,
      status: "NEW", // All new tasks start in NEW status
    };


    createTaskMutation.mutate({
      task: taskData,
      category: formData.category,
    });
  };

  const updateFormData = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="task-form-modal">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Create a new task with automated checklist based on category.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">

          {/* Basic Task Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Task Information</h3>

            <div>
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                type="text"
                placeholder="e.g., Edit product images for Spring Collection"
                value={formData.title}
                onChange={(e) => updateFormData("title", e.target.value)}
                required
                data-testid="input-task-title"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                className="h-24"
                placeholder="Brief description of what needs to be done..."
                value={formData.description}
                onChange={(e) => updateFormData("description", e.target.value)}
                data-testid="textarea-task-description"
              />
            </div>

            <div>
              <Label htmlFor="category">Task Category</Label>
              <Select value={formData.category} onValueChange={(value) => updateFormData("category", value)}>
                <SelectTrigger data-testid="select-task-category">
                  <SelectValue placeholder="Select a category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.category && (
                <p className="text-xs text-muted-foreground mt-1">
                  ✓ {templateSteps.length} checklist step(s) will be automatically added
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="vendor">Vendor/Supplier</Label>
              <Select value={formData.vendorId} onValueChange={(value) => updateFormData("vendorId", value)}>
                <SelectTrigger data-testid="select-task-vendor">
                  <SelectValue placeholder="Select a vendor (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      <div className="flex items-center gap-2">
                        {vendor.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: vendor.color }}
                          />
                        )}
                        <span>{vendor.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vendors.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No vendors available. Add vendors from the Vendors page.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => updateFormData("priority", value)}>
                  <SelectTrigger data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>
          </div>

          {/* Template Steps Preview */}
          {formData.category && templateSteps.length > 0 && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Checklist Preview ({templateSteps.length} steps)
              </h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {templateSteps.map((step, idx) => (
                  <div key={step.id} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground/60">{idx + 1}.</span>
                    <span className="flex-1">
                      {step.title}
                      {step.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Additional Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="orderNumber">Order/Reference Number</Label>
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
                <Label htmlFor="orderLink">Reference Link</Label>
                <Input
                  id="orderLink"
                  type="text"
                  placeholder="e.g., https://example.com/order/123"
                  value={formData.orderLink}
                  onChange={(e) => updateFormData("orderLink", e.target.value)}
                  data-testid="input-order-link"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
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
              data-testid="button-cancel-task"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTaskMutation.isPending}
              data-testid="button-create-task"
            >
              {createTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
