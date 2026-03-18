/**
 * NotificationItem Component
 *
 * Renders a single notification with:
 * - Severity indicator dot
 * - Title, message, timestamp
 * - Click to navigate to action URL
 * - Dismiss button on hover
 */

import { useLocation } from "wouter";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schema";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

const severityColors = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
} as const;

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
  onClose,
}: NotificationItemProps) {
  const [, setLocation] = useLocation();
  const severity = (notification.severity || "info") as keyof typeof severityColors;

  const handleClick = () => {
    // Mark as read
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }

    // Navigate to action URL if present
    if (notification.actionUrl) {
      setLocation(notification.actionUrl);
      onClose();
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(notification.id);
  };

  return (
    <div
      className={cn(
        "group relative p-3 border-b border-border hover:bg-accent/50 cursor-pointer transition-colors",
        !notification.read && "bg-accent/30"
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleClick();
        }
      }}
    >
      <div className="flex items-start gap-3 pr-6">
        {/* Severity indicator */}
        <div
          className={cn(
            "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
            severityColors[severity]
          )}
          aria-label={`${severity} severity`}
        />

        <div className="flex-1 min-w-0">
          {/* Title */}
          <p
            className={cn(
              "text-sm font-medium truncate",
              !notification.read && "text-foreground",
              notification.read && "text-muted-foreground"
            )}
          >
            {notification.title}
          </p>

          {/* Message */}
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {notification.message}
          </p>

          {/* Timestamp */}
          <p className="text-xs text-muted-foreground mt-1">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
      </div>

      {/* Dismiss button - shown on hover */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
