/**
 * NotificationPanel Component
 *
 * The main notification panel that shows in the dropdown.
 * Features:
 * - Header with title and mark all read button
 * - Category groups (accordion pattern)
 * - Loading state
 * - Empty state
 */

import { Check, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/contexts/NotificationContext";
import { CategoryGroup } from "./CategoryGroup";
import type { Notification } from "@shared/schema";

interface NotificationPanelProps {
  onClose: () => void;
}

const CATEGORY_ORDER = ["health", "sync", "quality", "system"] as const;

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const {
    notifications,
    isLoadingNotifications,
    counts,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    refreshAggregation,
  } = useNotifications();

  // Group notifications by category
  const groupedNotifications = CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = notifications.filter(
        (n) => (n.category || "system") === category
      );
      return acc;
    },
    {} as Record<(typeof CATEGORY_ORDER)[number], Notification[]>
  );

  // Check if there are any notifications
  const hasNotifications = notifications.length > 0;
  const hasUnread = counts?.total ? counts.total > 0 : false;

  // Handle refresh
  const handleRefresh = async () => {
    await refreshAggregation();
  };

  return (
    <div className="w-96 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleRefresh}
            title="Refresh notifications"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => markAllAsRead()}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="max-h-[calc(100vh-200px)]">
        <div className="p-3 space-y-2">
          {isLoadingNotifications ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasNotifications ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">
                No notifications
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                You're all caught up!
              </p>
            </div>
          ) : (
            <>
              {CATEGORY_ORDER.map((category, index) => (
                <CategoryGroup
                  key={category}
                  category={category}
                  notifications={groupedNotifications[category]}
                  onMarkAsRead={markAsRead}
                  onMarkAllAsRead={markAllAsRead}
                  onDismiss={dismissNotification}
                  onClose={onClose}
                  defaultExpanded={index === 0}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
