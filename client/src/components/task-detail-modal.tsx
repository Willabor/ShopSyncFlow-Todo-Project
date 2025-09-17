import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle, 
  Edit, 
  UserPlus, 
  Clock,
  AlertCircle,
  CheckCheck
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { TaskWithDetails, AuditLog } from "@shared/schema";

interface TaskDetailModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TaskDetailModal({ taskId, isOpen, onClose }: TaskDetailModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    price: "",
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
        title: task.product.title,
        price: task.product.price || "",
        description: task.product.description || "",
        notes: task.notes || "",
      });
    }
  }, [task]);

  const { data: auditLog = [] } = useQuery<AuditLog[]>({
    queryKey: ["/api/tasks", taskId, "audit"],
    enabled: isOpen && !!taskId && ["SuperAdmin", "Auditor"].includes(user?.role || ""),
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

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48 mt-2" />
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
          </DialogHeader>
          <p>The requested task could not be found.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const getInitials = (user?: { firstName?: string; lastName?: string; username: string }) => {
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
               (user?.role === "Editor" && task.assignedTo === user.id);

  const canApprove = user?.role === "SuperAdmin" || user?.role === "WarehouseManager";
  const canSendBack = user?.role === "SuperAdmin" || user?.role === "Auditor";

  const handleSave = () => {
    updateTaskMutation.mutate({
      product: {
        title: formData.title,
        price: formData.price,
        description: formData.description,
      },
      notes: formData.notes,
    });
  };

  const handleStatusChange = (newStatus: string) => {
    updateStatusMutation.mutate(newStatus);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="task-detail-modal">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold" data-testid="task-detail-title">
                {task.product.title}
              </DialogTitle>
              <p className="text-muted-foreground" data-testid="task-detail-vendor">
                Vendor: {task.product.vendor} | SKU: {task.product.sku || 'N/A'}
              </p>
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
                    <h3 className="font-semibold text-foreground">Product Information</h3>
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
                    <div>
                      <Label>Product Title</Label>
                      {editMode ? (
                        <Input
                          value={formData.title}
                          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                          className="mt-1"
                        />
                      ) : (
                        <p className="mt-1 px-3 py-2 bg-background rounded-md">{task.product.title}</p>
                      )}
                    </div>
                    <div>
                      <Label>Price</Label>
                      {editMode ? (
                        <Input
                          value={formData.price}
                          onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                          className="mt-1"
                        />
                      ) : (
                        <p className="mt-1 px-3 py-2 bg-background rounded-md">{task.product.price || 'Not set'}</p>
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
                          {task.product.description || 'No description provided'}
                        </p>
                      )}
                    </div>
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
                      <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
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
              <h3 className="font-semibold text-foreground mb-4">Quality Checklist</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Checkbox id="title" checked />
                  <Label htmlFor="title" className="text-sm">Product title and description complete</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox id="images" checked />
                  <Label htmlFor="images" className="text-sm">Product images uploaded (minimum 3)</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox id="pricing" checked />
                  <Label htmlFor="pricing" className="text-sm">Pricing and inventory information</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox id="seo" checked />
                  <Label htmlFor="seo" className="text-sm">SEO metadata and tags</Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox id="variants" />
                  <Label htmlFor="variants" className="text-sm">Product variants and options</Label>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-md">
                <div className="text-sm text-success flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  4 of 5 checklist items completed (80%)
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <div className="bg-secondary/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-4">Activity Log</h3>
              <div className="space-y-3 text-sm max-h-96 overflow-y-auto">
                {auditLog.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No audit log available for this task.
                  </div>
                ) : (
                  auditLog.map((entry) => (
                    <div key={entry.id} className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-foreground">{entry.action}</p>
                        {entry.fromStatus && entry.toStatus && (
                          <p className="text-muted-foreground text-xs">
                            Changed from {entry.fromStatus} to {entry.toStatus}
                          </p>
                        )}
                        <p className="text-muted-foreground text-xs">
                          {formatDistanceToNow(new Date(entry.timestamp))} ago
                        </p>
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
                {canApprove && task.status === "READY_FOR_REVIEW" && (
                  <Button 
                    className="w-full" 
                    onClick={() => handleStatusChange("PUBLISHED")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-approve-task"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve & Publish
                  </Button>
                )}
                
                {canSendBack && ["READY_FOR_REVIEW", "PUBLISHED"].includes(task.status) && (
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

                {user?.role === "SuperAdmin" && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    data-testid="button-reassign-task"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Reassign Task
                  </Button>
                )}

                {task.status === "PUBLISHED" && ["SuperAdmin", "Auditor"].includes(user?.role || "") && (
                  <Button 
                    className="w-full"
                    onClick={() => handleStatusChange("QA_APPROVED")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-qa-approve"
                  >
                    <CheckCheck className="mr-2 h-4 w-4" />
                    QA Approve
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
