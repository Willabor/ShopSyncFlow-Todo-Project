import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSystem } from "@/contexts/SystemContext";
import { formatDateTime } from "@/lib/dateUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  Edit,
  UserPlus,
  Clock,
  AlertCircle,
  CheckCheck,
  ArrowRight,
  Play,
  Eye,
  Globe,
  Plus,
  Trash2,
  User,
  Link as LinkIcon,
  Upload,
  FileText,
  Download,
  Image as ImageIcon,
  ExternalLink,
  ListOrdered
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { TaskWithDetails, AuditLog, User as UserType, TaskStep, StepTemplate } from "@shared/schema";
import { PDFViewer } from "./pdf-viewer";

interface TaskDetailModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TaskDetailModal({ taskId, isOpen, onClose }: TaskDetailModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { systemInfo } = useSystem();

  const [editMode, setEditMode] = useState(false);
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [showAddStepForm, setShowAddStepForm] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [newLink, setNewLink] = useState({ name: "", url: "" });
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ id: string; name: string } | null>(null);
  const [stepToDelete, setStepToDelete] = useState<{ id: number; title: string } | null>(null);
  const [showDeleteAllStepsDialog, setShowDeleteAllStepsDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    notes: "",
  });

  const { data: task, isLoading } = useQuery<TaskWithDetails>({
    queryKey: ["/api/tasks", taskId],
    enabled: isOpen && !!taskId,
  });

  // Update form data when task data changes
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || "",
        description: task.description || "",
        notes: task.notes || "",
      });
    }
  }, [task]);

  const { data: auditLog = [] } = useQuery<AuditLog[]>({
    queryKey: ["/api/tasks", taskId, "audit"],
    enabled: isOpen && !!taskId,
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "SuperAdmin" || user?.role === "WarehouseManager",
  });

  // Fetch task steps
  const { data: taskSteps = [], isLoading: stepsLoading } = useQuery<TaskStep[]>({
    queryKey: ["/api/tasks", taskId, "steps"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/tasks/${taskId}/steps`);
      if (!response.ok) throw new Error("Failed to fetch task steps");
      return response.json();
    },
    enabled: isOpen && !!taskId,
  });

  // Fetch step template categories
  const { data: templateCategories = [] } = useQuery<string[]>({
    queryKey: ["/api/step-templates/categories"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/step-templates/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
    enabled: showLoadTemplateDialog,
  });

  // Fetch step templates
  const { data: stepTemplates = [] } = useQuery<StepTemplate[]>({
    queryKey: ["/api/step-templates"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/step-templates");
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
    enabled: showLoadTemplateDialog,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: any) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task Updated",
        description: "Task has been updated successfully.",
      });
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update task.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Status Updated",
        description: "Task status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Status Update Failed",
        description: error.message || "Failed to update task status.",
        variant: "destructive",
      });
    },
  });

  const reassignTaskMutation = useMutation({
    mutationFn: async (assignedTo: string) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, { assignedTo });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setShowReassignDialog(false);
      setSelectedUserId("");
      toast({
        title: "Task Reassigned",
        description: "Task has been reassigned successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reassignment Failed",
        description: error.message || "Failed to reassign task.",
        variant: "destructive",
      });
    },
  });

  // Toggle step completion
  const toggleStepMutation = useMutation({
    mutationFn: async ({ stepId, completed }: { stepId: number; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}/steps/${stepId}`, { completed });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "steps"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update step.",
        variant: "destructive",
      });
    },
  });

  // Add new step
  const addStepMutation = useMutation({
    mutationFn: async (stepTitle: string) => {
      const maxOrder = taskSteps.length > 0 ? Math.max(...taskSteps.map(s => s.order)) : 0;
      const response = await apiRequest("POST", `/api/tasks/${taskId}/steps`, {
        title: stepTitle,
        order: maxOrder + 1,
        required: false,
        completed: false,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "steps"] });
      setNewStepTitle("");
      setShowAddStepForm(false);
      toast({
        title: "Step Added",
        description: "New checklist step has been added.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Step",
        description: error.message || "Failed to add checklist step.",
        variant: "destructive",
      });
    },
  });

  // Delete step
  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: number) => {
      const response = await apiRequest("DELETE", `/api/tasks/${taskId}/steps/${stepId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "steps"] });
      toast({
        title: "Step Deleted",
        description: "Checklist step has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete Step",
        description: error.message || "Failed to delete checklist step.",
        variant: "destructive",
      });
    },
  });

  // Delete all steps
  const deleteAllStepsMutation = useMutation({
    mutationFn: async () => {
      // Delete all steps in parallel
      const promises = taskSteps.map(step =>
        apiRequest("DELETE", `/api/tasks/${taskId}/steps/${step.id}`).then(response => {
          if (!response.ok) throw new Error(`Failed to delete step ${step.id}`);
          return response.json();
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "steps"] });
      toast({
        title: "All Steps Deleted",
        description: `Successfully deleted ${taskSteps.length} checklist step(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete All Steps",
        description: error.message || "Failed to delete all checklist steps.",
        variant: "destructive",
      });
    },
  });

  // Load template steps
  const loadTemplateMutation = useMutation({
    mutationFn: async (category: string) => {
      const templates = stepTemplates.filter(t => t.category === category);
      const maxOrder = taskSteps.length > 0 ? Math.max(...taskSteps.map(s => s.order)) : 0;

      // Create all steps from template
      const promises = templates.map((template, index) =>
        apiRequest("POST", `/api/tasks/${taskId}/steps`, {
          title: template.title,
          description: template.description,
          order: maxOrder + index + 1,
          required: template.required,
          completed: false,
        }).then(response => {
          if (!response.ok) throw new Error("Failed to add step");
          return response.json();
        })
      );

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "steps"] });
      setShowLoadTemplateDialog(false);
      setSelectedCategory("");
      toast({
        title: "Template Loaded",
        description: "Checklist template has been applied successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Load Template",
        description: error.message || "Failed to load checklist template.",
        variant: "destructive",
      });
    },
  });

  // Upload file
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/tasks/${taskId}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || "Failed to upload file");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      toast({
        title: "File Uploaded",
        description: "File has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file.",
        variant: "destructive",
      });
    },
  });

  // Add link
  const addLinkMutation = useMutation({
    mutationFn: async (link: { name: string; url: string }) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/links`, link);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || "Failed to add link");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      setShowAddLinkForm(false);
      setNewLink({ name: "", url: "" });
      toast({
        title: "Link Added",
        description: "Link has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Link",
        description: error.message || "Failed to add link.",
        variant: "destructive",
      });
    },
  });

  // Delete attachment
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest("DELETE", `/api/tasks/${taskId}/attachments/${attachmentId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || "Failed to delete attachment");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      toast({
        title: "Attachment Deleted",
        description: "Attachment has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete",
        description: error.message || "Failed to delete attachment.",
        variant: "destructive",
      });
    },
  });

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading Task Details</DialogTitle>
            <DialogDescription>Please wait while we load the task information.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!task) {
    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Task Not Found</DialogTitle>
            <DialogDescription>The requested task could not be found.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const getInitials = (user?: { firstName?: string | null; lastName?: string | null; username: string }) => {
    if (!user) return "--";
    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    return user.username.slice(0, 2).toUpperCase();
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "NEW": return "secondary" as const;
      case "TRIAGE": return "secondary" as const;
      case "ASSIGNED": return "default" as const;
      case "IN_PROGRESS": return "secondary" as const;
      case "READY_FOR_REVIEW": return "secondary" as const;
      case "PUBLISHED": return "secondary" as const;
      case "QA_APPROVED": return "secondary" as const;
      case "DONE": return "secondary" as const;
      default: return "secondary" as const;
    }
  };

  const canEdit = user?.role === "SuperAdmin" ||
               (user?.role === "WarehouseManager") ||
               (user?.role === "Editor" && (task.assignedTo === user.id || task.createdBy === user.id));

  const canApprove = user?.role === "SuperAdmin" || user?.role === "WarehouseManager";
  const canSendBack = user?.role === "SuperAdmin" || user?.role === "Auditor";

  const handleSave = () => {
    const updates: any = {
      title: formData.title,
      description: formData.description,
      notes: formData.notes,
    };

    updateTaskMutation.mutate(updates);
  };

  const handleStatusChange = (newStatus: string) => {
    updateStatusMutation.mutate(newStatus);
  };

  const handleReassignTask = () => {
    if (selectedUserId) {
      reassignTaskMutation.mutate(selectedUserId);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "File size must be less than 10MB.",
          variant: "destructive",
        });
        return;
      }
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Only images (JPEG, PNG, GIF) and PDF files are allowed.",
          variant: "destructive",
        });
        return;
      }
      uploadFileMutation.mutate(file);
    }
    // Reset input
    event.target.value = '';
  };

  const handleAddLink = () => {
    if (!newLink.name.trim() || !newLink.url.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide both name and URL.",
        variant: "destructive",
      });
      return;
    }
    // Basic URL validation - automatically add https:// if missing protocol
    try {
      let urlToValidate = newLink.url.trim();
      // If the URL doesn't start with http:// or https://, add https://
      if (!/^https?:\/\//i.test(urlToValidate)) {
        urlToValidate = 'https://' + urlToValidate;
      }
      new URL(urlToValidate);
      // Update the link with the full URL
      addLinkMutation.mutate({ ...newLink, url: urlToValidate });
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid URL (e.g., www.example.com or https://example.com).",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAttachment = (attachmentId: string, attachmentName: string) => {
    setAttachmentToDelete({ id: attachmentId, name: attachmentName });
  };

  const confirmDeleteAttachment = () => {
    if (attachmentToDelete) {
      deleteAttachmentMutation.mutate(attachmentToDelete.id);
      setAttachmentToDelete(null);
    }
  };

  const confirmDeleteStep = () => {
    if (stepToDelete) {
      deleteStepMutation.mutate(stepToDelete.id);
      setStepToDelete(null);
    }
  };

  const confirmDeleteAllSteps = () => {
    deleteAllStepsMutation.mutate();
    setShowDeleteAllStepsDialog(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getNextStatuses = () => {
    const statusFlow = {
      "NEW": ["TRIAGE"],
      "TRIAGE": ["ASSIGNED"],
      "ASSIGNED": ["IN_PROGRESS"],
      "IN_PROGRESS": ["READY_FOR_REVIEW"],
      "READY_FOR_REVIEW": ["PUBLISHED", "IN_PROGRESS"],
      "PUBLISHED": ["QA_APPROVED", "IN_PROGRESS"],
      "QA_APPROVED": ["DONE"],
      "DONE": []
    };
    return statusFlow[task?.status as keyof typeof statusFlow] || [];
  };

  const getStatusButtonConfig = (status: string) => {
    const configs = {
      "TRIAGE": { label: "Move to Triage", icon: ArrowRight, variant: "default" as const },
      "ASSIGNED": { label: "Assign Task", icon: UserPlus, variant: "default" as const },
      "IN_PROGRESS": { label: "Start Work", icon: Play, variant: "default" as const },
      "READY_FOR_REVIEW": { label: "Ready for Review", icon: Eye, variant: "default" as const },
      "PUBLISHED": { label: "Publish", icon: Globe, variant: "default" as const },
      "QA_APPROVED": { label: "QA Approve", icon: CheckCheck, variant: "default" as const },
      "DONE": { label: "Mark Complete", icon: CheckCircle, variant: "default" as const }
    };
    return configs[status as keyof typeof configs] || { label: status, icon: ArrowRight, variant: "default" as const };
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="task-detail-modal">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold" data-testid="task-detail-title">
                {task.title}
              </DialogTitle>
              <DialogDescription data-testid="task-detail-vendor">
                {task.product ? (
                  <>Vendor: {task.product.vendor}</>
                ) : (
                  task.category || 'General Task'
                )}
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-3">
              <Badge variant={getStatusBadgeVariant(task.status)} data-testid="task-detail-status">
                {task.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        </DialogHeader>
        
        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
            <TabsTrigger value="checklist" data-testid="tab-checklist">Checklist</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
            <TabsTrigger value="actions" data-testid="tab-actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-secondary/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Task Information</h3>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditMode(!editMode)}
                        data-testid="button-edit-task"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        {editMode ? "Cancel" : "Edit"}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Task Title</Label>
                      {editMode ? (
                        <Input
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          className="mt-1"
                        />
                      ) : (
                        <p className="mt-1 px-3 py-2 bg-background rounded-md font-medium">{task.title}</p>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <Label>Description</Label>
                      {editMode ? (
                        <Textarea
                          value={formData.description}
                          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                          className="mt-1 h-24"
                        />
                      ) : (
                        <p className="mt-1 px-3 py-2 bg-background rounded-md h-24 overflow-y-auto">
                          {task.description || 'No description provided'}
                        </p>
                      )}
                    </div>
                    {task.category && (
                      <div>
                        <Label>Category</Label>
                        <p className="mt-1 px-3 py-2 bg-background rounded-md">{task.category}</p>
                      </div>
                    )}
                    {task.product && (
                      <>
                        <div>
                          <Label>Product/Vendor</Label>
                          <p className="mt-1 px-3 py-2 bg-background rounded-md">{task.product.vendor}</p>
                        </div>
                      </>
                    )}
                  </div>

                  {editMode && (
                    <div className="mt-4 flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setEditMode(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSave} disabled={updateTaskMutation.isPending}>
                        Save Changes
                      </Button>
                    </div>
                  )}
                </div>

                {/* Attachments Section */}
                <div className="bg-secondary/50 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground mb-4">Attachments & Links</h3>

                  {/* File Upload */}
                  {canEdit && (
                    <div className="mb-4">
                      <Label htmlFor="file-upload" className="cursor-pointer">
                        <div className="border-2 border-dashed border-border rounded-lg p-4 hover:border-primary transition-colors">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Upload className="w-5 h-5" />
                            <span className="text-sm">
                              Click to upload files (Images, PDFs - Max 10MB)
                            </span>
                          </div>
                          <input
                            id="file-upload"
                            type="file"
                            className="hidden"
                            accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
                            onChange={handleFileUpload}
                            disabled={uploadFileMutation.isPending}
                          />
                        </div>
                      </Label>
                    </div>
                  )}

                  {/* Add Link Form */}
                  {canEdit && (
                    <div className="mb-4">
                      {!showAddLinkForm ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddLinkForm(true)}
                          className="w-full"
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Add Link
                        </Button>
                      ) : (
                        <div className="p-3 bg-background rounded-md border border-border space-y-2">
                          <div>
                            <Label htmlFor="link-name" className="text-xs">Link Name</Label>
                            <Input
                              id="link-name"
                              placeholder="e.g., Shopify Order, Design Mockup"
                              value={newLink.name}
                              onChange={(e) => setNewLink(prev => ({ ...prev, name: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="link-url" className="text-xs">URL</Label>
                            <Input
                              id="link-url"
                              type="url"
                              placeholder="https://example.com"
                              value={newLink.url}
                              onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                              className="mt-1"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleAddLink}
                              disabled={addLinkMutation.isPending || !newLink.name.trim() || !newLink.url.trim()}
                            >
                              Add Link
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowAddLinkForm(false);
                                setNewLink({ name: "", url: "" });
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attachments List */}
                  {(task.attachments && Array.isArray(task.attachments) && task.attachments.length > 0) || task.orderLink ? (
                    <div className="space-y-2">
                      {/* Show orderLink if exists */}
                      {(task.orderLink as any) && (
                        <div
                          className="flex items-center justify-between p-3 bg-background rounded-md border border-border hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <ExternalLink className="w-5 h-5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                Order Link
                              </p>
                              <p className="text-xs text-muted-foreground truncate" title={task.orderLink as string}>
                                {task.orderLink}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <a
                              href={task.orderLink as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80"
                              title="Open link"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      )}
                      {/* Show attachments from attachments array */}
                      {task.attachments && Array.isArray(task.attachments) && task.attachments.map((attachment: any) => (
                        <div
                          key={attachment.id}
                          className="bg-background rounded-md border border-border hover:border-primary/50 transition-colors overflow-hidden"
                        >
                          {/* Image Preview */}
                          {attachment.type === 'image' && (
                            <div className="w-full bg-muted/30">
                              <img
                                src={attachment.url}
                                alt={attachment.name}
                                className="w-full h-[500px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(attachment.url, '_blank')}
                              />
                            </div>
                          )}

                          {/* PDF Preview with Custom Viewer */}
                          {attachment.type === 'pdf' && (
                            <PDFViewer url={attachment.url} filename={attachment.name} />
                          )}

                          {/* Attachment Info */}
                          <div className="flex items-center justify-between p-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {attachment.type === 'link' ? (
                                <ExternalLink className="w-5 h-5 text-primary flex-shrink-0" />
                              ) : attachment.type === 'image' ? (
                                <ImageIcon className="w-5 h-5 text-primary flex-shrink-0" />
                              ) : (
                                <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate" title={attachment.name}>
                                  {attachment.name}
                                </p>
                                {attachment.size && (
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(attachment.size)} • {formatDistanceToNow(new Date(attachment.uploadedAt))} ago
                                  </p>
                                )}
                                {attachment.type === 'link' && (
                                  <p className="text-xs text-muted-foreground truncate" title={attachment.url}>
                                    {attachment.url}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {attachment.type !== 'link' ? (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              ) : (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80"
                                  title="Open link"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAttachment(attachment.id, attachment.name)}
                                  className="h-8 w-8 p-0"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-4 text-sm">
                      No attachments or links yet.
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div className="bg-secondary/50 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground mb-4">Notes</h3>
                  {editMode ? (
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Add notes, comments, or additional details..."
                      className="min-h-32"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-background rounded-md min-h-32 whitespace-pre-wrap">
                      {task.notes || <span className="text-muted-foreground">No notes added yet.</span>}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-secondary/50 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground mb-4">Task Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={getStatusBadgeVariant(task.status)}>
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assigned to:</span>
                      <div className="flex items-center">
                        <Avatar className="w-6 h-6 mr-2">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                            {getInitials(task.assignee)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{task.assignee ? 
                          `${task.assignee.firstName || ""} ${task.assignee.lastName || ""}`.trim() || task.assignee.username 
                          : "Unassigned"}</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span>{systemInfo ? formatDateTime(new Date(task.createdAt), systemInfo) : new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                    {task.orderNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Order Number:</span>
                        <span className="font-mono text-sm">{task.orderNumber}</span>
                      </div>
                    )}
                    {task.orderLink && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Order Link:</span>
                        <a
                          href={task.orderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm truncate max-w-48"
                          title={task.orderLink}
                        >
                          View Order ↗
                        </a>
                      </div>
                    )}
                    {task.leadTimeMinutes && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lead Time:</span>
                        <span>{Math.floor(task.leadTimeMinutes / 60)}h {task.leadTimeMinutes % 60}m</span>
                      </div>
                    )}
                    {task.cycleTimeMinutes && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cycle Time:</span>
                        <span>{Math.floor(task.cycleTimeMinutes / 60)}h {task.cycleTimeMinutes % 60}m</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SLA Status:</span>
                      <span className={task.slaDeadline && new Date(task.slaDeadline) < new Date() ? "text-destructive" : "text-success"}>
                        {task.slaDeadline ? 
                          new Date(task.slaDeadline) < new Date() ? 
                            `Overdue by ${formatDistanceToNow(new Date(task.slaDeadline))}` : 
                            `${formatDistanceToNow(new Date(task.slaDeadline))} remaining`
                          : "No SLA set"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="checklist" className="mt-6">
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground">Task Checklist</h3>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowLoadTemplateDialog(true)}
                      data-testid="button-load-template"
                    >
                      <ListOrdered className="w-4 h-4 mr-2" />
                      Load Template
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddStepForm(!showAddStepForm)}
                      data-testid="button-add-step"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Step
                    </Button>
                    {taskSteps.length > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowDeleteAllStepsDialog(true)}
                        data-testid="button-delete-all-steps"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete All
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Add Step Form */}
              {showAddStepForm && (
                <div className="mb-4 p-3 bg-background rounded-md border border-border">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter step description..."
                      value={newStepTitle}
                      onChange={(e) => setNewStepTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newStepTitle.trim()) {
                          addStepMutation.mutate(newStepTitle);
                        }
                      }}
                      data-testid="input-new-step"
                    />
                    <Button
                      onClick={() => newStepTitle.trim() && addStepMutation.mutate(newStepTitle)}
                      disabled={!newStepTitle.trim() || addStepMutation.isPending}
                      size="sm"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Steps List */}
              {stepsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : taskSteps.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <p>No checklist items yet.</p>
                  {canEdit && (
                    <p className="text-sm mt-2">Click "Add Step" to create checklist items.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {taskSteps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-start space-x-3 p-3 rounded-md border ${
                        step.completed
                          ? 'bg-success/5 border-success/20'
                          : 'bg-background border-border'
                      }`}
                    >
                      <Checkbox
                        id={`step-${step.id}`}
                        checked={step.completed}
                        onCheckedChange={(checked) => {
                          if (canEdit) {
                            toggleStepMutation.mutate({
                              stepId: step.id,
                              completed: checked as boolean,
                            });
                          }
                        }}
                        disabled={!canEdit}
                        className="mt-0.5"
                        data-testid={`checkbox-step-${step.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`step-${step.id}`}
                          className={`text-sm cursor-pointer ${
                            step.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {step.title}
                          {step.required && <span className="text-red-500 ml-1">*</span>}
                        </Label>
                        {step.completed && step.completedAt && step.completedBy && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>
                              Completed {formatDistanceToNow(new Date(step.completedAt))} ago
                            </span>
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStepToDelete({ id: step.id, title: step.title })}
                          className="h-8 w-8 p-0"
                          data-testid={`button-delete-step-${step.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Summary */}
              {taskSteps.length > 0 && (
                <div className={`mt-4 p-3 rounded-md border ${
                  taskSteps.every(s => s.completed)
                    ? 'bg-success/10 border-success/20'
                    : 'bg-muted/50 border-border'
                }`}>
                  <div className={`text-sm flex items-center ${
                    taskSteps.every(s => s.completed) ? 'text-success' : 'text-muted-foreground'
                  }`}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {taskSteps.filter(s => s.completed).length} of {taskSteps.length} checklist items completed
                    ({Math.round((taskSteps.filter(s => s.completed).length / taskSteps.length) * 100)}%)
                  </div>
                  {taskSteps.some(s => s.required && !s.completed) && (
                    <p className="text-xs text-destructive mt-1">
                      * Required steps must be completed
                    </p>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <div className="bg-secondary/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-4">Movement History</h3>
              <div className="space-y-4 text-sm max-h-96 overflow-y-auto">
                {auditLog.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No movement history available for this task.
                  </div>
                ) : (
                  auditLog.map((entry: any) => (
                    <div key={entry.id} className="flex items-start space-x-3 p-3 bg-background rounded-md border border-border">
                      <div className="flex-shrink-0">
                        {entry.action === "STATUS_CHANGED" ? (
                          <ArrowRight className="w-5 h-5 text-primary mt-0.5" />
                        ) : (
                          <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {entry.action === "STATUS_CHANGED" && entry.fromStatus && entry.toStatus ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="font-mono text-xs">
                                {entry.fromStatus}
                              </Badge>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge variant="default" className="font-mono text-xs">
                                {entry.toStatus}
                              </Badge>
                            </div>
                            {entry.user && (
                              <p className="text-muted-foreground text-xs">
                                Moved by{" "}
                                <span className="font-medium text-foreground">
                                  {entry.user.firstName && entry.user.lastName
                                    ? `${entry.user.firstName} ${entry.user.lastName}`
                                    : entry.user.username}
                                </span>
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs">
                              {formatDistanceToNow(new Date(entry.timestamp))} ago
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-foreground">{entry.action}</p>
                            {entry.user && (
                              <p className="text-muted-foreground text-xs">
                                By{" "}
                                <span className="font-medium text-foreground">
                                  {entry.user.firstName && entry.user.lastName
                                    ? `${entry.user.firstName} ${entry.user.lastName}`
                                    : entry.user.username}
                                </span>
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs">
                              {formatDistanceToNow(new Date(entry.timestamp))} ago
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-6">
            <div className="bg-secondary/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-4">Actions</h3>
              <div className="space-y-3">
                {/* Next Status Buttons */}
                {getNextStatuses().map((nextStatus) => {
                  const config = getStatusButtonConfig(nextStatus);
                  const Icon = config.icon;

                  // Check permissions for each status change
                  const canChangeStatus =
                    user?.role === "SuperAdmin" ||
                    (user?.role === "WarehouseManager") ||
                    (user?.role === "Editor" && (task.assignedTo === user.id || !task.assignedTo)) ||
                    (user?.role === "Auditor" && nextStatus === "IN_PROGRESS");

                  if (!canChangeStatus) return null;

                  return (
                    <Button
                      key={nextStatus}
                      className="w-full"
                      variant={config.variant}
                      onClick={() => handleStatusChange(nextStatus)}
                      disabled={updateStatusMutation.isPending}
                      data-testid={`button-status-${nextStatus.toLowerCase()}`}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {config.label}
                    </Button>
                  );
                })}

                {/* Send Back to Previous Status */}
                {canSendBack && !["NEW", "DONE"].includes(task.status) && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleStatusChange("IN_PROGRESS")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-request-changes"
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Request Changes
                  </Button>
                )}

                {/* Reassign Task (SuperAdmin and WarehouseManager) */}
                {(user?.role === "SuperAdmin" || user?.role === "WarehouseManager") && task.status !== "DONE" && (
                  <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full"
                        data-testid="button-reassign-task"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Reassign Task
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reassign Task</DialogTitle>
                        <DialogDescription>
                          Select a user to assign this task to.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div>
                          <Label htmlFor="assignee">Assign to</Label>
                          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {users.map((user: any) => (
                                <SelectItem key={user.id} value={user.id}>
                                  <div className="flex items-center">
                                    <Avatar className="w-6 h-6 mr-2">
                                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                        {user.firstName && user.lastName
                                          ? (user.firstName[0] + user.lastName[0]).toUpperCase()
                                          : user.username.slice(0, 2).toUpperCase()
                                        }
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-medium">
                                        {user.firstName && user.lastName
                                          ? `${user.firstName} ${user.lastName}`
                                          : user.username
                                        }
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {user.role}
                                      </div>
                                    </div>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowReassignDialog(false);
                              setSelectedUserId("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleReassignTask}
                            disabled={!selectedUserId || reassignTaskMutation.isPending}
                          >
                            {reassignTaskMutation.isPending ? "Reassigning..." : "Reassign"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Mark as Complete (for any incomplete status) */}
                {task.status !== "DONE" && ["SuperAdmin", "WarehouseManager"].includes(user?.role || "") && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleStatusChange("DONE")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-mark-complete"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Mark as Complete
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Delete Attachment Confirmation Dialog */}
      <AlertDialog open={!!attachmentToDelete} onOpenChange={(open) => !open && setAttachmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attachment</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground break-all">
                  "{attachmentToDelete?.name}"
                </span>
                ?
              </p>
              <p>This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAttachment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Step Confirmation Dialog */}
      <AlertDialog open={!!stepToDelete} onOpenChange={(open) => !open && setStepToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Checklist Step</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground break-all">
                  "{stepToDelete?.title}"
                </span>
                ?
              </p>
              <p>This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteStep}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Steps Confirmation Dialog */}
      <AlertDialog open={showDeleteAllStepsDialog} onOpenChange={setShowDeleteAllStepsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Checklist Steps</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{" "}
                <span className="font-semibold text-foreground">
                  all {taskSteps.length} checklist step(s)
                </span>
                ?
              </p>
              <p className="text-destructive font-medium">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAllSteps}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAllStepsMutation.isPending}
            >
              {deleteAllStepsMutation.isPending ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Load Template Dialog */}
      <Dialog open={showLoadTemplateDialog} onOpenChange={setShowLoadTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Checklist Template</DialogTitle>
            <DialogDescription>
              Select a template category to add predefined checklist steps to this task.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-category">Template Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger id="template-category">
                  <SelectValue placeholder="Select a template category..." />
                </SelectTrigger>
                <SelectContent>
                  {templateCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview steps */}
            {selectedCategory && (
              <div className="space-y-2">
                <Label>Steps in this template:</Label>
                <div className="bg-muted/50 rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                  {stepTemplates
                    .filter(t => t.category === selectedCategory)
                    .sort((a, b) => a.order - b.order)
                    .map((template) => (
                      <div key={template.id} className="flex items-start gap-2 text-sm">
                        <div className="w-4 h-4 rounded-sm border border-border bg-background mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="text-foreground">{template.title}</span>
                          {template.required && <span className="text-red-500 ml-1">*</span>}
                          {template.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stepTemplates.filter(t => t.category === selectedCategory).length} steps will be added
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowLoadTemplateDialog(false);
                setSelectedCategory("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedCategory && loadTemplateMutation.mutate(selectedCategory)}
              disabled={!selectedCategory || loadTemplateMutation.isPending}
            >
              {loadTemplateMutation.isPending ? "Loading..." : "Load Template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
