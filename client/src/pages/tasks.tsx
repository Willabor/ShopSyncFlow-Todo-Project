import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layouts";
import { TaskCard } from "@/components/task-card";
import { TaskDetailModal } from "@/components/task-detail-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, ListTodo, CheckSquare } from "lucide-react";
import type { TaskWithDetails } from "@shared/schema";

export default function TasksPage() {
  const { user } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const { data: tasks = [], isLoading } = useQuery<TaskWithDetails[]>({
    queryKey: ["/api/tasks"],
    enabled: !!user,
  });

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (task.product?.vendor || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesAssignee = assigneeFilter === "all" ||
                           (assigneeFilter === "unassigned" && !task.assignedTo) ||
                           (assigneeFilter === "me" && task.assignedTo === user?.id) ||
                           task.assignedTo === assigneeFilter;

    return matchesSearch && matchesStatus && matchesAssignee;
  });

  const getTasksByStatus = () => {
    const tasksByStatus: Record<string, TaskWithDetails[]> = {};
    filteredTasks.forEach(task => {
      if (!tasksByStatus[task.status]) {
        tasksByStatus[task.status] = [];
      }
      tasksByStatus[task.status].push(task);
    });
    return tasksByStatus;
  };

  const tasksByStatus = getTasksByStatus();
  const statuses = ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "READY_FOR_REVIEW", "PUBLISHED", "QA_APPROVED", "DONE"];

  return (
    <MainLayout
      title="Task Management"
      subtitle="Manage and track all product workflow tasks across the system"
    >
      <div className="p-8">
        <div className="max-w-7xl mx-auto">

            {/* Filters */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Filter className="mr-2 h-5 w-5" />
                  Filters & Search
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tasks..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-tasks"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger data-testid="select-status-filter">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statuses.map(status => (
                        <SelectItem key={status} value={status}>
                          {status.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger data-testid="select-assignee-filter">
                      <SelectValue placeholder="All Assignees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignees</SelectItem>
                      <SelectItem value="me">My Tasks</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center text-sm text-muted-foreground">
                    <ListTodo className="mr-2 h-4 w-4" />
                    {filteredTasks.length} tasks found
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tasks Content */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                        <div className="flex justify-between pt-3">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-20" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <Card>
                <CardHeader className="text-center py-16">
                  <CheckSquare className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <CardTitle className="text-muted-foreground">No Tasks Found</CardTitle>
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== "all" || assigneeFilter !== "all"
                      ? "No tasks match your current filters. Try adjusting your search criteria."
                      : "No tasks have been created yet. Create a new product to get started."
                    }
                  </p>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-8">
                {statuses.map(status => {
                  const statusTasks = tasksByStatus[status] || [];
                  if (statusTasks.length === 0) return null;

                  return (
                    <div key={status}>
                      <div className="flex items-center mb-4">
                        <h2 className="text-xl font-semibold text-foreground">
                          {status.replace('_', ' ')}
                        </h2>
                        <Badge variant="secondary" className="ml-3">
                          {statusTasks.length}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {statusTasks.map(task => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => setSelectedTaskId(task.id)}
                            onStatusChange={(newStatus) => {
                              // Status change handled by TaskCard
                            }}
                            allTasks={tasks}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </MainLayout>
  );
}