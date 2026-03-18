import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { PriorityBadge } from "@/components/ui/priority-badge";
import type { TaskWithDetails } from "@shared/schema";
import { formatDistanceToNow, isAfter } from "date-fns";
import { memo } from "react";
import { motion } from "framer-motion";
import { getVendorColor } from "@/lib/colorUtils";

interface TaskCardProps {
  task: TaskWithDetails;
  onClick: () => void;
  onStatusChange: (newStatus: string) => void;
  isDragging?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  allTasks?: TaskWithDetails[]; // For calculating workload
}

const TaskCard = memo(function TaskCard({
  task,
  onClick,
  onStatusChange,
  isDragging = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  allTasks = []
}: TaskCardProps) {
  // Calculate workload for assigned user
  const getAssigneeWorkload = () => {
    if (!task.assignee || !allTasks.length) return null;
    const assignedCount = allTasks.filter(
      t => t.assignedTo === task.assignee?.id && t.status === 'ASSIGNED'
    ).length;
    return { count: assignedCount, limit: 2 };
  };

  // Calculate time in ASSIGNED and remaining time
  const getAssignedTimeInfo = () => {
    if (task.status !== 'ASSIGNED' || !task.assignedAt) return null;

    const assignedAt = new Date(task.assignedAt);
    const now = new Date();
    const hoursInAssigned = (now.getTime() - assignedAt.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = 48 - hoursInAssigned;

    return {
      hoursInAssigned: Math.round(hoursInAssigned),
      hoursRemaining: Math.round(hoursRemaining),
      isWarning: hoursRemaining < 24 && hoursRemaining > 0,
      isCritical: hoursRemaining < 6 && hoursRemaining > 0
    };
  };

  const workload = getAssigneeWorkload();
  const assignedInfo = getAssignedTimeInfo();

  const handleDragStart = (e: React.DragEvent) => {
    // Set the task ID in dataTransfer for the drop handler to use
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    // Don't call parent's onDragStart if it would set data again
    if (onDragStart) {
      onDragStart(e);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (onDragEnd) {
      onDragEnd(e);
    }
  };
  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case "high": return "destructive" as const;
      case "medium": return "secondary" as const;
      case "low": return "outline" as const;
      default: return "secondary" as const;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "NEW": return "bg-secondary";
      case "TRIAGE": return "bg-warning/20";
      case "ASSIGNED": return "bg-primary";
      case "IN_PROGRESS": return "bg-accent";
      case "READY_FOR_REVIEW": return "bg-warning/30";
      case "PUBLISHED": return "bg-success/20";
      case "QA_APPROVED": return "bg-success/30";
      case "DONE": return "bg-success";
      default: return "bg-muted";
    }
  };

  const getInitials = (user?: { firstName?: string; lastName?: string; username: string }) => {
    if (!user) return "--";
    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    return user.username.slice(0, 2).toUpperCase();
  };

  const isOverdue = task.slaDeadline && isAfter(new Date(), new Date(task.slaDeadline));
  
  // Calculate progress based on status
  const getProgress = (status: string) => {
    const statusOrder = ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "READY_FOR_REVIEW", "PUBLISHED", "QA_APPROVED", "DONE"];
    const currentIndex = statusOrder.indexOf(status);
    return Math.round((currentIndex / (statusOrder.length - 1)) * 100);
  };

  const progress = getProgress(task.status);

  // Get color based on vendor (for product tasks) or priority (for general tasks)
  const getCardColor = () => {
    if (task.product && (task.product as any).vendorColor) {
      return getVendorColor((task.product as any).vendorColor);
    }
    // Fallback to priority-based color for tasks without products
    switch (task.priority) {
      case "high": return "#ef4444"; // red
      case "medium": return "#f59e0b"; // amber
      case "low": return "#10b981"; // green
      default: return "#6b7280"; // gray
    }
  };

  const cardColor = getCardColor();

  return (
    <motion.div
      className={`task-card bg-card border border-border rounded-lg p-4 transition-all duration-200 ease-out will-change-transform ${
        isDragging
          ? 'dragging opacity-50 scale-105 rotate-2 shadow-2xl border-primary bg-card/90 backdrop-blur-sm'
          : draggable
          ? 'cursor-pointer'
          : 'cursor-default opacity-75'
      }`}
      style={{
        pointerEvents: 'auto',
        position: 'relative',
        zIndex: 1,
        cursor: draggable ? 'grab' : 'pointer',
        borderLeft: `4px solid ${cardColor}`
      }}
      onClick={(e) => {
        // Don't trigger click during drag operations
        if (!isDragging) {
          onClick();
        }
      }}
      data-testid={`task-card-${task.id}`}
      draggable={draggable}
      // Native HTML5 drag handlers - use type assertion to override Framer Motion types
      onDragStart={handleDragStart as any}
      onDragEnd={handleDragEnd as any}
      // Framer Motion hover animations
      whileHover={draggable ? {
        y: -4,
        scale: 1.02,
        boxShadow: "0 12px 24px -6px rgba(0, 0, 0, 0.12), 0 6px 12px -3px rgba(0, 0, 0, 0.08)",
      } : undefined}
      transition={{
        duration: 0.2,
        ease: "easeOut"
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-medium text-foreground text-sm line-clamp-2" title={task.title}>
          {task.title}
        </h4>
        <div className="flex flex-col gap-1 ml-2">
          <PriorityBadge
            priority={task.priority === "high" ? "High" : task.priority === "medium" ? "Medium" : "Low"}
            size="sm"
          />
          {isOverdue && (
            <Badge variant="destructive" className="text-xs">
              Overdue
            </Badge>
          )}
        </div>
      </div>
      
      {/* Task Description */}
      {task.description && (
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
          {task.description}
        </p>
      )}

      <div className="space-y-1 mb-3">
        {/* Category or Product Info */}
        {task.category && (
          <p className="text-xs text-muted-foreground" data-testid={`task-category-${task.id}`}>
            📁 {task.category}
          </p>
        )}
        {task.product && (
          <p className="text-xs text-muted-foreground" data-testid={`task-product-vendor-${task.id}`}>
            📦 {task.product.vendor}
          </p>
        )}
        {task.vendor && (
          <div className="flex items-center gap-1.5" data-testid={`task-vendor-${task.id}`}>
            {task.vendor.color && (
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: task.vendor.color }}
              />
            )}
            <p className="text-xs text-muted-foreground">
              🏭 {task.vendor.name}
            </p>
          </div>
        )}
        {task.orderNumber && (
          <p className="text-xs text-muted-foreground font-mono">
            🔢 {task.orderNumber}
          </p>
        )}
      </div>

      {/* Checklist Progress */}
      {task.steps && task.steps.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Checklist</span>
            <span className={`font-medium ${
              task.steps.every(s => s.completed) ? 'text-success' : 'text-muted-foreground'
            }`}>
              {task.steps.filter(s => s.completed).length}/{task.steps.length}
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${
                task.steps.every(s => s.completed) ? 'bg-success' : 'bg-primary'
              }`}
              style={{
                width: `${(task.steps.filter(s => s.completed).length / task.steps.length) * 100}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Workload Indicator for ASSIGNED tasks */}
      {task.status === 'ASSIGNED' && task.assignee && workload && (
        <div className="mb-3 p-2 bg-muted/50 rounded-md">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Assigned to: <span className="font-medium text-foreground">
                {task.assignee.firstName && task.assignee.lastName
                  ? `${task.assignee.firstName} ${task.assignee.lastName}`
                  : task.assignee.username}
              </span>
            </span>
            <Badge
              variant={workload.count === workload.limit ? "secondary" : "outline"}
              className="text-xs"
            >
              {workload.count}/{workload.limit} tasks
            </Badge>
          </div>
        </div>
      )}

      {/* Time Warning for ASSIGNED tasks */}
      {task.status === 'ASSIGNED' && assignedInfo && (
        <div className={`mb-3 p-2 rounded-md ${
          assignedInfo.isCritical
            ? 'bg-destructive/10 border border-destructive/20'
            : assignedInfo.isWarning
            ? 'bg-warning/10 border border-warning/20'
            : 'bg-muted/30'
        }`}>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${
                assignedInfo.isCritical ? 'text-destructive' :
                assignedInfo.isWarning ? 'text-warning' :
                'text-muted-foreground'
              }`}>
                {assignedInfo.isCritical ? '🚨 Critical' :
                 assignedInfo.isWarning ? '⏰ Warning' :
                 '📋 Reserved'}
              </span>
              <span className="text-muted-foreground">
                {assignedInfo.hoursRemaining}h remaining
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {assignedInfo.isCritical
                ? 'Task will return to TRIAGE soon! Start now.'
                : assignedInfo.isWarning
                ? 'Move to IN_PROGRESS within 24 hours or task returns to TRIAGE'
                : `In ASSIGNED for ${assignedInfo.hoursInAssigned}h`}
            </p>
          </div>
        </div>
      )}

      {/* Workload Indicator for other assigned tasks */}
      {task.status !== 'ASSIGNED' && task.status !== 'TRIAGE' && task.status !== 'NEW' && task.assignee && workload && (
        <div className="mb-2">
          <p className="text-xs text-muted-foreground">
            Working on: <span className="font-medium text-foreground">
              {task.assignee.firstName && task.assignee.lastName
                ? `${task.assignee.firstName} ${task.assignee.lastName}`
                : task.assignee.username}
            </span>
          </p>
        </div>
      )}

      {/* Progress Bar for In Progress tasks */}
      {task.status === "IN_PROGRESS" && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="text-muted-foreground" data-testid={`task-progress-${task.id}`}>
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {/* Checklist completion for Ready for Review */}
      {task.status === "READY_FOR_REVIEW" && (
        <div className="mb-3">
          <div className="text-xs text-success mb-1">
            <span className="inline-block w-2 h-2 bg-success rounded-full mr-2"></span>
            All checklist items completed
          </div>
        </div>
      )}

      {/* Published indicator */}
      {task.status === "PUBLISHED" && (
        <div className="mb-3">
          <div className="text-xs text-success mb-1">
            <span className="inline-block w-2 h-2 bg-success rounded-full mr-2"></span>
            {task.product ? "Live on Shopify" : "Published"}
          </div>
        </div>
      )}

      {/* QA Approved indicator */}
      {task.status === "QA_APPROVED" && (
        <div className="mb-3">
          <div className="text-xs text-success mb-1">
            <span className="inline-block w-2 h-2 bg-success rounded-full mr-2"></span>
            QA Approved
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground" data-testid={`task-time-${task.id}`}>
          {task.status === "IN_PROGRESS" && task.startedAt
            ? `Working ${formatDistanceToNow(new Date(task.startedAt))}`
            : task.status === "READY_FOR_REVIEW"
            ? `Submitted ${formatDistanceToNow(new Date(task.updatedAt))} ago`
            : task.status === "PUBLISHED" && task.publishedAt
            ? `Published ${formatDistanceToNow(new Date(task.publishedAt))} ago`
            : task.status === "DONE" && task.completedAt
            ? `Completed ${formatDistanceToNow(new Date(task.completedAt))} ago`
            : `Created ${formatDistanceToNow(new Date(task.createdAt))} ago`}
        </span>
        <div className="flex items-center">
          <Avatar className="w-6 h-6">
            <AvatarFallback 
              className={`${getStatusColor(task.status)} text-xs font-medium ${
                task.assignee ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {getInitials(task.assignee ? {
                firstName: task.assignee.firstName || undefined,
                lastName: task.assignee.lastName || undefined, 
                username: task.assignee.username
              } : undefined)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </motion.div>
  );
});

export { TaskCard };
