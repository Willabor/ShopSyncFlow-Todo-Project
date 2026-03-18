import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskCard } from "@/components/task-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RefreshCw, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TaskWithDetails, DashboardStats } from "@shared/schema";
import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { designTokens } from "@/lib/design-tokens";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import "../styles/kanban.css";

interface KanbanBoardProps {
  onTaskClick: (taskId: string) => void;
}

const STATUSES = [
  {
    value: "NEW",
    label: "NEW",
    color: "bg-status-new-bg",
    borderColor: designTokens.colors.status.new.border,
    textColor: designTokens.colors.status.new.text,
    badgeVariant: "secondary" as const,
  },
  {
    value: "TRIAGE",
    label: "TRIAGE",
    color: "bg-status-triage-bg",
    borderColor: designTokens.colors.status.triage.border,
    textColor: designTokens.colors.status.triage.text,
    badgeVariant: "secondary" as const,
  },
  {
    value: "ASSIGNED",
    label: "ASSIGNED",
    color: "bg-status-assigned-bg",
    borderColor: designTokens.colors.status.assigned.border,
    textColor: designTokens.colors.status.assigned.text,
    badgeVariant: "default" as const,
  },
  {
    value: "IN_PROGRESS",
    label: "IN PROGRESS",
    color: "bg-status-inprogress-bg",
    borderColor: designTokens.colors.status.inProgress.border,
    textColor: designTokens.colors.status.inProgress.text,
    badgeVariant: "secondary" as const,
  },
  {
    value: "READY_FOR_REVIEW",
    label: "READY FOR REVIEW",
    color: "bg-status-review-bg",
    borderColor: designTokens.colors.status.readyForReview.border,
    textColor: designTokens.colors.status.readyForReview.text,
    badgeVariant: "secondary" as const,
  },
  {
    value: "PUBLISHED",
    label: "PUBLISHED",
    color: "bg-status-published-bg",
    borderColor: designTokens.colors.status.published.border,
    textColor: designTokens.colors.status.published.text,
    badgeVariant: "secondary" as const,
  },
  {
    value: "QA_APPROVED",
    label: "QA APPROVED",
    color: "bg-status-qa-bg",
    borderColor: designTokens.colors.status.qaApproved.border,
    textColor: designTokens.colors.status.qaApproved.text,
    badgeVariant: "secondary" as const,
  },
  {
    value: "DONE",
    label: "DONE",
    color: "bg-status-done-bg",
    borderColor: designTokens.colors.status.done.border,
    textColor: designTokens.colors.status.done.text,
    badgeVariant: "secondary" as const,
  },
];

// Draggable Task Wrapper
interface DraggableTaskProps {
  task: TaskWithDetails;
  onClick: () => void;
  isDragging: boolean;
  canDrag: boolean;
  allTasks: TaskWithDetails[];
}

function DraggableTask({ task, onClick, isDragging, canDrag, allTasks }: DraggableTaskProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    disabled: !canDrag,
  });

  const style = {
    // Hide the original element when dragging (DragOverlay will show instead)
    opacity: isDragging ? 0 : 1,
    // Don't apply transform - let DragOverlay handle the visual feedback
    cursor: canDrag ? 'grab' : 'default',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="mb-3 transition-opacity duration-200"
    >
      <TaskCard
        task={task}
        onClick={onClick}
        onStatusChange={() => {}}
        isDragging={false} // Always false here since DragOverlay shows the dragging state
        draggable={canDrag}
        allTasks={allTasks}
      />
    </div>
  );
}

// Droppable Column
interface DroppableColumnProps {
  status: typeof STATUSES[number];
  tasks: TaskWithDetails[];
  taskCount: number;
  onTaskClick: (taskId: string) => void;
  activeId: string | null;
  canDragTask: (task: TaskWithDetails) => boolean;
  allTasks: TaskWithDetails[];
}

function DroppableColumn({ status, tasks, taskCount, onTaskClick, activeId, canDragTask, allTasks }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.value,
  });

  return (
    <div className="kanban-column flex-shrink-0 w-full md:w-80">
      <div
        className={`${status.color} rounded-t-lg p-3`}
        style={{
          borderTop: `4px solid ${status.borderColor}`,
        }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="font-bold text-sm uppercase tracking-wider"
            style={{ color: status.textColor }}
          >
            {status.label}
          </h3>
          <span
            className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: status.borderColor }}
            data-testid={`badge-${status.value.toLowerCase().replace('_', '-')}-count`}
          >
            {taskCount}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`${status.color.replace('/50', '/20').replace('/30', '/15')} rounded-b-lg transition-all duration-200 ${
          isOver
            ? 'bg-primary/10 ring-2 ring-primary ring-opacity-50'
            : ''
        }`}
        style={{
          minHeight: '500px',
          padding: '12px',
        }}
        data-testid={`column-${status.value.toLowerCase().replace('_', '-')}`}
      >
        {tasks.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No tasks in {status.label.toLowerCase()}
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task.id)}
              isDragging={activeId === task.id}
              canDrag={canDragTask(task)}
              allTasks={allTasks}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({ onTaskClick }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileColumn, setMobileColumn] = useState(0);
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; message: string; validMoves: string[] }>({
    open: false,
    title: "",
    message: "",
    validMoves: []
  });

  // Fetch vendors for filtering
  const { data: vendors = [] } = useQuery<Array<{ id: string; name: string; color?: string }>>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const response = await fetch("/api/vendors", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch vendors");
      return response.json();
    },
  });

  // Configure sensors for drag interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 3px movement required to start drag (reduced for responsiveness)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {};

    // Apply general filter
    switch (filter) {
      case "my":
        params.assignedTo = user?.id || '';
        break;
      case "high":
        params.priority = "high";
        break;
      case "overdue":
        // This would need backend support for overdue filtering
        break;
    }

    // Apply vendor filter
    if (vendorFilter && vendorFilter !== "all") {
      params.vendorId = vendorFilter;
    }

    return params;
  }, [filter, vendorFilter, user?.id]);
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<TaskWithDetails[]>({
    queryKey: ["/api/tasks", queryParams],
    queryFn: async () => {
      // Build URL with query parameters
      const url = new URL('/api/tasks', window.location.origin);
      if (queryParams && Object.keys(queryParams).length > 0) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        });
      }
      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      return result;
    },
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, status, oldStatus }: { taskId: string, status: string, oldStatus?: string }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // Only invalidate stats, not tasks (we already did optimistic update)
      // This prevents flickering while keeping stats accurate
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

      // Show specific message for TRIAGE → ASSIGNED
      if (oldStatus === "TRIAGE" && status === "ASSIGNED") {
        toast({
          title: "Task Claimed Successfully!",
          description: "This task has been assigned to you. You have 48 hours to move it to IN PROGRESS or it will automatically return to TRIAGE.",
          duration: 8000,
        });
      } else {
        toast({
          title: "Task Updated",
          description: "Task status has been updated successfully.",
        });
      }
      return result;
    },
    onError: (error: Error) => {
      console.error("Failed to update task status:", error);

      // Check if it's a task limit error
      if (error.message.includes("Task Limit Reached") || error.message.includes("already have 2 tasks")) {
        setErrorDialog({
          open: true,
          title: "Task Limit Reached",
          message: "You already have 2 tasks assigned to you. To claim this task, you need to either:\n\n• Return one of your assigned tasks back to TRIAGE (if you don't want to work on it)\n• Complete one of your current tasks by moving it to IN PROGRESS and finishing it\n\nThis limit helps ensure tasks are distributed fairly and work progresses steadily.",
          validMoves: []
        });
      } else {
        toast({
          title: "Update Failed",
          description: error.message || "Failed to update task status. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Refreshed",
        description: "Data has been refreshed successfully.",
      });
    },
  });

  const getTasksForStatus = useCallback((status: string): TaskWithDetails[] => {
    return tasks.filter(task => task.status === status);
  }, [tasks]);

  const getTaskCount = useCallback((status: string): number => {
    return stats?.kanbanCounts[status] || 0;
  }, [stats]);

  // Status transition rules matching server-side validation
  const getValidTransitions = useCallback((currentStatus: string, role: string): string[] => {
    const transitions: Record<string, Record<string, string[]>> = {
      NEW: {
        SuperAdmin: ["TRIAGE", "ASSIGNED", "DONE"],
        WarehouseManager: ["TRIAGE", "ASSIGNED"],
        Editor: [],
        Auditor: []
      },
      TRIAGE: {
        SuperAdmin: ["ASSIGNED", "NEW", "DONE"],
        WarehouseManager: ["ASSIGNED", "NEW"],
        Editor: ["ASSIGNED"],
        Auditor: []
      },
      ASSIGNED: {
        SuperAdmin: ["IN_PROGRESS", "TRIAGE", "DONE"],
        WarehouseManager: ["IN_PROGRESS", "TRIAGE"],
        Editor: ["IN_PROGRESS", "TRIAGE"],
        Auditor: []
      },
      IN_PROGRESS: {
        SuperAdmin: ["READY_FOR_REVIEW", "ASSIGNED", "DONE"],
        WarehouseManager: ["READY_FOR_REVIEW", "ASSIGNED"],
        Editor: ["READY_FOR_REVIEW", "ASSIGNED"],
        Auditor: []
      },
      READY_FOR_REVIEW: {
        SuperAdmin: ["PUBLISHED", "IN_PROGRESS", "QA_APPROVED"],
        WarehouseManager: ["PUBLISHED", "IN_PROGRESS"],
        Editor: [],
        Auditor: ["IN_PROGRESS"]
      },
      PUBLISHED: {
        SuperAdmin: ["QA_APPROVED", "READY_FOR_REVIEW", "DONE"],
        WarehouseManager: ["QA_APPROVED"],
        Editor: [],
        Auditor: ["QA_APPROVED", "READY_FOR_REVIEW"]
      },
      QA_APPROVED: {
        SuperAdmin: ["DONE", "PUBLISHED"],
        WarehouseManager: [],
        Editor: [],
        Auditor: ["DONE"]
      },
      DONE: {
        SuperAdmin: ["QA_APPROVED", "PUBLISHED", "IN_PROGRESS"],
        WarehouseManager: ["QA_APPROVED", "PUBLISHED"],
        Editor: [],
        Auditor: []
      }
    };

    return transitions[currentStatus]?.[role] || [];
  }, []);

  // Helper function to check if a task can be dragged
  const canDragTask = useCallback((task: TaskWithDetails): boolean => {
    if (!user) return false;

    // Check if there are any valid transitions for this task
    const validTransitions = getValidTransitions(task.status, user.role);
    return validTransitions.length > 0;
  }, [user, getValidTransitions]);

  // Memoize task groups for better performance
  const tasksByStatus = useMemo(() => {
    const groups: Record<string, TaskWithDetails[]> = {};
    STATUSES.forEach(status => {
      groups[status.value] = getTasksForStatus(status.value);
    });
    return groups;
  }, [getTasksForStatus]);

  // Get the actively dragged task for DragOverlay
  const activeTask = useMemo(() => {
    if (!activeId) return null;
    return tasks.find(t => t.id === activeId);
  }, [activeId, tasks]);

  // @dnd-kit drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const taskId = active.id as string;
    const newStatus = over.id as string;

    // Find the task
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      setActiveId(null);
      toast({
        title: "Task Not Found",
        description: `The task you're trying to move could not be found.`,
        variant: "destructive",
      });
      return;
    }

    // Don't move if it's the same status
    if (task.status === newStatus) {
      setActiveId(null);
      return;
    }

    // Validate status transition
    if (!user) {
      setActiveId(null);
      toast({
        title: "Authentication Required",
        description: "You must be logged in to move tasks.",
        variant: "destructive",
      });
      return;
    }

    const validTransitions = getValidTransitions(task.status, user.role);
    if (!validTransitions.includes(newStatus)) {
      setActiveId(null);

      // Helper function to get readable status labels
      const getStatusLabel = (status: string): string => {
        const statusObj = STATUSES.find(s => s.value === status);
        return statusObj?.label || status;
      };

      // Build helpful error message
      let errorMessage = `Cannot move task from ${getStatusLabel(task.status)} to ${getStatusLabel(newStatus)}.`;

      // Add specific guidance based on the attempted transition
      if (task.status === 'ASSIGNED' && newStatus === 'NEW') {
        errorMessage = 'Once a task is assigned, it cannot be moved back to NEW to maintain workflow integrity. If you need to re-assign this task, please move it to TRIAGE first.';
      } else if (task.status === 'IN_PROGRESS' && newStatus === 'NEW') {
        errorMessage = 'Tasks that are in progress cannot be moved back to NEW. If you need to restart the workflow, move it back to ASSIGNED or TRIAGE first.';
      } else if (task.status === 'DONE' && validTransitions.length === 0) {
        errorMessage = 'Completed tasks cannot be reopened based on your role permissions. Only SuperAdmin and WarehouseManager can reopen completed tasks.';
      } else if (task.status === 'DONE' && !validTransitions.includes(newStatus)) {
        errorMessage = 'This completed task can only be reopened to specific statuses for corrections or review.';
      } else if (newStatus === 'NEW' && task.status !== 'TRIAGE') {
        errorMessage = 'Tasks can only be moved back to NEW from TRIAGE status.';
      }

      // Get valid transition labels
      const validLabels = validTransitions.length > 0
        ? validTransitions.map(getStatusLabel)
        : [];

      // Show error dialog
      setErrorDialog({
        open: true,
        title: `Cannot move from ${getStatusLabel(task.status)} to ${getStatusLabel(newStatus)}`,
        message: errorMessage,
        validMoves: validLabels
      });
      return;
    }

    // Optimistic update: Update the cache immediately
    queryClient.setQueryData<TaskWithDetails[]>(
      ["/api/tasks", queryParams],
      (oldTasks) => {
        if (!oldTasks) return oldTasks;
        return oldTasks.map(t => {
          if (t.id === taskId) {
            // When moving from TRIAGE to ASSIGNED, auto-assign to current user
            if (t.status === "TRIAGE" && newStatus === "ASSIGNED") {
              return {
                ...t,
                status: newStatus as TaskWithDetails['status'],
                assignedTo: user.id,
                assignedToUser: {
                  id: user.id,
                  username: user.username,
                  email: user.email,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  role: user.role
                }
              };
            }
            // For other transitions, just update status
            return { ...t, status: newStatus as TaskWithDetails['status'] };
          }
          return t;
        });
      }
    );

    // Clear activeId after a short delay to allow drop animation
    setTimeout(() => setActiveId(null), 100);

    // Move the task via API
    moveTaskMutation.mutate(
      { taskId, status: newStatus, oldStatus: task.status },
      {
        onError: () => {
          // Revert optimistic update on error
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        }
      }
    );
  }, [tasks, user, toast, moveTaskMutation, queryClient, queryParams, getValidTransitions]);

  if (tasksLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Workflow Board</CardTitle>
            <div className="flex items-center space-x-4">
              <Skeleton className="w-32 h-8" />
              <Skeleton className="w-20 h-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="kanban-container flex gap-6 overflow-x-auto pb-4">
            {STATUSES.map((status) => (
              <div key={status.value} className="kanban-column flex-shrink-0">
                <div className={`${status.color} rounded-t-lg p-3 border-b border-border`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">{status.label}</h3>
                    <Skeleton className="w-8 h-6 rounded-full" />
                  </div>
                </div>
                <div className={`${status.color.replace('/50', '/20').replace('/30', '/15')} min-h-[500px] p-3 space-y-3 rounded-b-lg`}>
                  {[...Array(2)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Card data-testid="kanban-board">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Workflow Board</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <label className="text-sm text-muted-foreground">Filter:</label>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tasks</SelectItem>
                    <SelectItem value="my">My Tasks</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-muted-foreground">Vendor:</label>
                <Select value={vendorFilter} onValueChange={setVendorFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        <div className="flex items-center gap-2">
                          {vendor.color && (
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: vendor.color }}
                            />
                          )}
                          <span>{vendor.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                data-testid="button-refresh-board"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Mobile: column selector + single column view */}
          <div className="md:hidden">
            <div className="flex gap-1 overflow-x-auto pb-3 mb-3 border-b">
              {STATUSES.map((status, idx) => (
                <button
                  key={status.value}
                  onClick={() => setMobileColumn(idx)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    mobileColumn === idx
                      ? 'text-white'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                  style={mobileColumn === idx ? { backgroundColor: status.borderColor } : undefined}
                >
                  {status.label} ({getTaskCount(status.value)})
                </button>
              ))}
            </div>
            <DroppableColumn
              status={STATUSES[mobileColumn]}
              tasks={tasksByStatus[STATUSES[mobileColumn].value] || []}
              taskCount={getTaskCount(STATUSES[mobileColumn].value)}
              onTaskClick={onTaskClick}
              activeId={activeId}
              canDragTask={canDragTask}
              allTasks={tasks}
            />
          </div>

          {/* Desktop: horizontal scroll with all columns */}
          <div className="hidden md:block overflow-x-auto">
            <div className="kanban-container flex gap-6 pb-4" style={{ width: 'max-content', minWidth: '100%' }}>
              {STATUSES.map((status) => (
                <DroppableColumn
                  key={status.value}
                  status={status}
                  tasks={tasksByStatus[status.value] || []}
                  taskCount={getTaskCount(status.value)}
                  onTaskClick={onTaskClick}
                  activeId={activeId}
                  canDragTask={canDragTask}
                  allTasks={tasks}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drag Overlay for better visual feedback */}
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}
      >
        {activeTask ? (
          <div
            style={{
              width: '320px',
              cursor: 'grabbing',
              transform: 'scale(1.05) rotate(2deg)',
              transition: 'transform 200ms ease',
            }}
            className="shadow-2xl"
          >
            <TaskCard
              task={activeTask}
              onClick={() => {}}
              onStatusChange={() => {}}
              isDragging={true}
              allTasks={tasks}
            />
          </div>
        ) : null}
      </DragOverlay>

      {/* Error Dialog for invalid transitions */}
      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <AlertDialogTitle className="text-left">{errorDialog.title}</AlertDialogTitle>
              </div>
            </div>
          </AlertDialogHeader>

          <AlertDialogDescription className="text-left space-y-4">
            <p className="text-foreground font-medium whitespace-pre-line">{errorDialog.message}</p>

            {errorDialog.validMoves.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-sm font-medium text-foreground mb-2">Valid moves from this status:</p>
                <div className="flex flex-wrap gap-2">
                  {errorDialog.validMoves.map((move, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {move}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </AlertDialogDescription>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialog({ ...errorDialog, open: false })}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}
