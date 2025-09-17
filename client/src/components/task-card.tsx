import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import type { TaskWithDetails } from "@shared/schema";
import { formatDistanceToNow, isAfter } from "date-fns";

interface TaskCardProps {
  task: TaskWithDetails;
  onClick: () => void;
  onStatusChange: (newStatus: string) => void;
}

export function TaskCard({ task, onClick, onStatusChange }: TaskCardProps) {
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

  return (
    <div
      className="task-card bg-card border border-border rounded-lg p-4 cursor-pointer"
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-medium text-foreground text-sm line-clamp-2" title={task.title}>
          {task.title}
        </h4>
        <div className="flex flex-col gap-1 ml-2">
          <Badge variant={getPriorityBadgeVariant(task.priority)} className="text-xs">
            {task.priority === "high" ? "High" : task.priority === "medium" ? "Medium" : "Low"}
          </Badge>
          {isOverdue && (
            <Badge variant="destructive" className="text-xs">
              Overdue
            </Badge>
          )}
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground mb-3" data-testid={`task-vendor-${task.id}`}>
        Vendor: {task.product.vendor}
      </p>
      
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
            Live on Shopify
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
    </div>
  );
}
