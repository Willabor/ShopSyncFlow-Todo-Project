import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskCard } from "@/components/task-card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TaskWithDetails, DashboardStats } from "@shared/schema";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

interface KanbanBoardProps {
  onTaskClick: (taskId: string) => void;
}

const STATUSES = [
  { value: "NEW", label: "NEW", color: "bg-secondary/50", badgeVariant: "secondary" as const },
  { value: "TRIAGE", label: "TRIAGE", color: "bg-warning/20", badgeVariant: "secondary" as const },
  { value: "ASSIGNED", label: "ASSIGNED", color: "bg-primary/20", badgeVariant: "default" as const },
  { value: "IN_PROGRESS", label: "IN PROGRESS", color: "bg-accent", badgeVariant: "secondary" as const },
  { value: "READY_FOR_REVIEW", label: "READY FOR REVIEW", color: "bg-warning/30", badgeVariant: "secondary" as const },
  { value: "PUBLISHED", label: "PUBLISHED", color: "bg-success/20", badgeVariant: "secondary" as const },
  { value: "QA_APPROVED", label: "QA APPROVED", color: "bg-success/30", badgeVariant: "secondary" as const },
  { value: "DONE", label: "DONE", color: "bg-success/30", badgeVariant: "secondary" as const },
];

export function KanbanBoard({ onTaskClick }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");

  const getQueryParams = () => {
    switch (filter) {
      case "my":
        return { assignedTo: user?.id };
      case "high":
        return { priority: "high" };
      case "overdue":
        // This would need backend support for overdue filtering
        return {};
      default:
        return {};
    }
  };

  const queryParams = getQueryParams();
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
      return response.json();
    },
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string, status: string }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status });
      const result = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Task Updated",
        description: "Task status has been updated successfully.",
      });
      return result;
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

  const getTasksForStatus = (status: string): TaskWithDetails[] => {
    return tasks.filter(task => task.status === status);
  };

  const getTaskCount = (status: string): number => {
    return stats?.kanbanCounts[status] || 0;
  };

  const handleTaskMove = (taskId: string, newStatus: string) => {
    moveTaskMutation.mutate({ taskId, status: newStatus });
  };

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
    <Card data-testid="kanban-board">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Workflow Board</CardTitle>
          <div className="flex items-center space-x-4">
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
        <div className="kanban-container flex gap-6 overflow-x-auto pb-4">
          {STATUSES.map((status) => {
            const statusTasks = getTasksForStatus(status.value);
            const taskCount = getTaskCount(status.value);

            return (
              <div key={status.value} className="kanban-column flex-shrink-0">
                <div className={`${status.color} rounded-t-lg p-3 border-b border-border`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">{status.label}</h3>
                    <Badge variant={status.badgeVariant} data-testid={`badge-${status.value.toLowerCase().replace('_', '-')}-count`}>
                      {taskCount}
                    </Badge>
                  </div>
                </div>
                <div 
                  className={`${status.color.replace('/50', '/20').replace('/30', '/15')} min-h-[500px] p-3 space-y-3 rounded-b-lg`}
                  data-testid={`column-${status.value.toLowerCase().replace('_', '-')}`}
                >
                  {statusTasks.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      No tasks in {status.label.toLowerCase()}
                    </div>
                  ) : (
                    statusTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => onTaskClick(task.id)}
                        onStatusChange={(newStatus) => handleTaskMove(task.id, newStatus)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
