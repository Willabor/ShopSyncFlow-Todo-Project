import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/sidebar";
import { StatsCards } from "@/components/stats-cards";
import { KanbanBoard } from "@/pages/kanban-board";
import { ProductForm } from "@/pages/product-form";
import { TaskDetailModal } from "@/components/task-detail-modal";
import { Button } from "@/components/ui/button";
import { Plus, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Notification } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  const [showProductForm, setShowProductForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch notifications
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const canCreateProduct = user?.role && ["SuperAdmin", "WarehouseManager", "Editor"].includes(user.role);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
                Dashboard
              </h1>
              <p className="text-muted-foreground">
                Product workflow overview and management
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNotifications(!showNotifications)}
                  data-testid="button-notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span 
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs flex items-center justify-center"
                      data-testid="text-notification-count"
                    >
                      {unreadCount}
                    </span>
                  )}
                </Button>

                {/* Notification Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-popover border border-border rounded-md shadow-lg z-50">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold text-foreground">Notifications</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          No notifications
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-3 border-b border-border hover:bg-accent cursor-pointer ${
                              !notification.read ? 'bg-primary/5' : ''
                            }`}
                          >
                            <div className="flex items-start">
                              <div className={`w-2 h-2 rounded-full mt-2 mr-3 ${
                                !notification.read ? 'bg-primary' : 'bg-muted'
                              }`} />
                              <div className="flex-1">
                                <p className="text-sm text-foreground font-medium">
                                  {notification.title}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(notification.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {canCreateProduct && (
                <Button 
                  onClick={() => setShowProductForm(true)}
                  data-testid="button-new-product"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Product
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto">
          <StatsCards />
          <div className="px-6 pb-6">
            <KanbanBoard onTaskClick={setSelectedTaskId} />
          </div>
        </div>
      </main>

      {/* Modals */}
      {showProductForm && (
        <ProductForm 
          isOpen={showProductForm}
          onClose={() => setShowProductForm(false)}
        />
      )}
      
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
