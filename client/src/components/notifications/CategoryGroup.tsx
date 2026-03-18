/**
 * CategoryGroup Component
 *
 * Collapsible group for a notification category with:
 * - Category icon and name
 * - Unread count badge
 * - Mark all read action
 * - List of notifications
 */

import { useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NotificationItem } from "./NotificationItem";
import type { Notification } from "@shared/schema";

interface CategoryGroupProps {
  category: "health" | "sync" | "quality" | "system";
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: (category: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
  defaultExpanded?: boolean;
}

const categoryConfig = {
  health: {
    label: "Inventory Health",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-200 dark:border-amber-800",
  },
  sync: {
    label: "Sync Status",
    icon: RefreshCw,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  quality: {
    label: "Quality Alerts",
    icon: CheckCircle,
    iconColor: "text-green-500",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-200 dark:border-green-800",
  },
  system: {
    label: "System",
    icon: Info,
    iconColor: "text-slate-500",
    bgColor: "bg-slate-50 dark:bg-slate-950/30",
    borderColor: "border-slate-200 dark:border-slate-800",
  },
} as const;

export function CategoryGroup({
  category,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onClose,
  defaultExpanded = false,
}: CategoryGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = categoryConfig[category];
  const Icon = config.icon;
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", config.borderColor)}>
      {/* Category Header */}
      <button
        className={cn(
          "w-full flex items-center justify-between p-3 text-left transition-colors",
          config.bgColor,
          "hover:opacity-90"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={`category-${category}-content`}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Icon className={cn("h-4 w-4", config.iconColor)} />
          <span className="font-medium text-sm">{config.label}</span>
          {unreadCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 min-w-[20px] px-1.5 text-xs font-medium"
            >
              {unreadCount}
            </Badge>
          )}
        </div>

        {/* Mark all read button */}
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAllAsRead(category);
            }}
          >
            <Check className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
        )}
      </button>

      {/* Notifications List */}
      {isExpanded && (
        <div
          id={`category-${category}-content`}
          className="divide-y divide-border"
        >
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
              onDismiss={onDismiss}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}
