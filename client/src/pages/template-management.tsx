import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, ListOrdered } from "lucide-react";
import type { StepTemplate } from "@shared/schema";

export default function TemplateManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<StepTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: number; title: string; category: string } | null>(null);
  const [formData, setFormData] = useState({
    category: "",
    title: "",
    description: "",
    required: false,
  });

  // Fetch all templates
  const { data: templates = [], isLoading } = useQuery<StepTemplate[]>({
    queryKey: ["/api/step-templates"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/step-templates");
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/step-templates/categories"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/step-templates/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  // Group templates by category
  const templatesByCategory = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, StepTemplate[]>);

  // Sort templates within each category by order
  Object.keys(templatesByCategory).forEach((category) => {
    templatesByCategory[category].sort((a, b) => a.order - b.order);
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Get max order for category
      const categoryTemplates = templatesByCategory[data.category] || [];
      const maxOrder = categoryTemplates.length > 0
        ? Math.max(...categoryTemplates.map(t => t.order))
        : 0;

      const response = await apiRequest("POST", "/api/step-templates", {
        ...data,
        order: maxOrder + 1,
        active: true,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/step-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/step-templates/categories"] });
      setShowCreateDialog(false);
      setFormData({ category: "", title: "", description: "", required: false });
      toast({
        title: "Template Created",
        description: "Step template has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create template.",
        variant: "destructive",
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<StepTemplate> }) => {
      const response = await apiRequest("PATCH", `/api/step-templates/${id}`, updates);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/step-templates"] });
      setEditingTemplate(null);
      setFormData({ category: "", title: "", description: "", required: false });
      toast({
        title: "Template Updated",
        description: "Step template has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update template.",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/step-templates/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/step-templates"] });
      toast({
        title: "Template Deleted",
        description: "Step template has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete template.",
        variant: "destructive",
      });
    },
  });

  // Reorder template mutation
  const reorderTemplateMutation = useMutation({
    mutationFn: async ({ id, newOrder, category }: { id: number; newOrder: number; category: string }) => {
      const response = await apiRequest("PATCH", `/api/step-templates/${id}/reorder`, {
        newOrder,
        category,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/step-templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Reorder Failed",
        description: error.message || "Failed to reorder template.",
        variant: "destructive",
      });
    },
  });

  const handleCreateTemplate = () => {
    if (!formData.category || !formData.title) {
      toast({
        title: "Validation Error",
        description: "Category and title are required.",
        variant: "destructive",
      });
      return;
    }
    createTemplateMutation.mutate(formData);
  };

  const handleUpdateTemplate = () => {
    if (!editingTemplate || !formData.title) {
      toast({
        title: "Validation Error",
        description: "Title is required.",
        variant: "destructive",
      });
      return;
    }
    updateTemplateMutation.mutate({
      id: editingTemplate.id,
      updates: {
        title: formData.title,
        description: formData.description || null,
        required: formData.required,
      },
    });
  };

  const handleDeleteTemplate = (template: StepTemplate) => {
    setTemplateToDelete({ id: template.id, title: template.title, category: template.category });
  };

  const confirmDeleteTemplate = () => {
    if (templateToDelete) {
      deleteTemplateMutation.mutate(templateToDelete.id);
      setTemplateToDelete(null);
    }
  };

  const handleMoveTemplate = (template: StepTemplate, direction: "up" | "down") => {
    const categoryTemplates = templatesByCategory[template.category];
    const currentIndex = categoryTemplates.findIndex(t => t.id === template.id);

    if (direction === "up" && currentIndex > 0) {
      const newOrder = categoryTemplates[currentIndex - 1].order;
      reorderTemplateMutation.mutate({
        id: template.id,
        newOrder,
        category: template.category,
      });
    } else if (direction === "down" && currentIndex < categoryTemplates.length - 1) {
      const newOrder = categoryTemplates[currentIndex + 1].order;
      reorderTemplateMutation.mutate({
        id: template.id,
        newOrder,
        category: template.category,
      });
    }
  };

  const openEditDialog = (template: StepTemplate) => {
    setEditingTemplate(template);
    setFormData({
      category: template.category,
      title: template.title,
      description: template.description || "",
      required: template.required,
    });
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingTemplate(null);
    setFormData({ category: "", title: "", description: "", required: false });
  };

  // Check if user is SuperAdmin or WarehouseManager
  if (user?.role !== "SuperAdmin" && user?.role !== "WarehouseManager") {
    return (
      <MainLayout title="Access Denied" subtitle="Insufficient permissions">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
            <p className="text-muted-foreground">Only SuperAdmins and Warehouse Managers can access template management.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Step Template Management"
      subtitle="Manage global step templates for task categories"
      actions={
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      }
    >
      <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-12">Loading templates...</div>
          ) : Object.keys(templatesByCategory).length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-lg font-medium mb-2">No templates found</p>
              <p className="text-sm">Create your first template to get started.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              <Accordion type="multiple" defaultValue={[]} className="space-y-4">
                {Object.entries(templatesByCategory).map(([category, categoryTemplates]) => (
                  <AccordionItem
                    key={category}
                    value={category}
                    className="bg-card border border-border rounded-lg"
                  >
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-3">
                          <ListOrdered className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold text-foreground">{category}</h2>
                        </div>
                        <Badge variant="secondary">{categoryTemplates.length} steps</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-4">
                      <div className="space-y-2">
                        {categoryTemplates.map((template, index) => (
                          <div
                            key={template.id}
                            className="flex items-center gap-3 p-3 bg-secondary/50 rounded-md border border-border"
                          >
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleMoveTemplate(template, "up")}
                                disabled={index === 0 || reorderTemplateMutation.isPending}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => handleMoveTemplate(template, "down")}
                                disabled={index === categoryTemplates.length - 1 || reorderTemplateMutation.isPending}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {template.order}. {template.title}
                                </span>
                                {template.required && (
                                  <Badge variant="destructive" className="text-xs">Required</Badge>
                                )}
                              </div>
                              {template.description && (
                                <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(template)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTemplate(template)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || !!editingTemplate} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create New Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update the step template details."
                : "Add a new step template to a category."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {!editingTemplate && (
              <div>
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category or type new" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Or type new category name..."
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="mt-2"
                />
              </div>
            )}
            {editingTemplate && (
              <div>
                <Label>Category</Label>
                <Input value={formData.category} disabled className="mt-1 bg-muted" />
              </div>
            )}
            <div>
              <Label htmlFor="title">Step Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Download product images from vendor"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Additional details about this step..."
                className="mt-1 h-20"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="required"
                checked={formData.required}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, required: checked as boolean }))}
              />
              <Label htmlFor="required" className="text-sm cursor-pointer">
                Mark as required step
              </Label>
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-6">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
              disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
            >
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete the template{" "}
                <span className="font-semibold text-foreground break-all">
                  "{templateToDelete?.title}"
                </span>
                {" "}from category{" "}
                <span className="font-semibold text-foreground">
                  "{templateToDelete?.category}"
                </span>
                ?
              </p>
              <p>This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
