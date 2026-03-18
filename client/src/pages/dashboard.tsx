import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layouts";
import { StatsCards } from "@/components/stats-cards";
import { KanbanBoard } from "@/pages/kanban-board";
import { TaskForm } from "@/components/task-form";
import { TaskDetailModal } from "@/components/task-detail-modal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const canCreateTask = user?.role && ["SuperAdmin", "WarehouseManager", "Editor"].includes(user.role);

  return (
    <MainLayout
      title="Dashboard"
      subtitle="Task workflow overview and management"
      actions={
        canCreateTask && (
          <Button
            onClick={() => setShowTaskForm(true)}
            data-testid="button-new-task"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        )
      }
    >
      {/* Dashboard Content */}
      <div className="flex-1 overflow-auto">
        <StatsCards />
        <div className="px-6 pb-6">
          <KanbanBoard onTaskClick={setSelectedTaskId} />
        </div>
      </div>

      {/* Modals */}
      {showTaskForm && (
        <TaskForm
          isOpen={showTaskForm}
          onClose={() => setShowTaskForm(false)}
        />
      )}

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
