/**
 * Notification Context
 *
 * Provides notification state and actions for the notification bell feature.
 * - Polls for notification counts every 60s
 * - Fetches full notifications on dropdown open
 * - Stops polling when tab is hidden
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { Notification } from "@shared/schema";

interface NotificationCounts {
  total: number;
  byCategory: {
    health: number;
    sync: number;
    quality: number;
    system: number;
  };
  criticalCount: number;
}

interface NotificationContextValue {
  // Counts for badge
  counts: NotificationCounts | null;
  isLoadingCounts: boolean;

  // Full notifications (loaded on demand)
  notifications: Notification[];
  isLoadingNotifications: boolean;

  // Actions
  fetchNotifications: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: (category?: string) => void;
  dismissNotification: (id: string) => void;
  refreshAggregation: () => Promise<void>;

  // UI state
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Track tab visibility to pause polling when hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Poll for notification counts (every 60s when tab is visible)
  const {
    data: counts,
    isLoading: isLoadingCounts,
    refetch: refetchCounts,
  } = useQuery<NotificationCounts>({
    queryKey: ["/api/notifications/counts"],
    enabled: !!user && isTabVisible,
    refetchInterval: isTabVisible ? 60000 : false, // 60 seconds
    staleTime: 30000, // Consider stale after 30s
  });

  // Fetch full notifications (on demand when dropdown opens)
  const {
    data: notifications = [],
    isLoading: isLoadingNotifications,
    refetch: refetchNotifications,
  } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user && isOpen, // Only fetch when dropdown is open
    staleTime: 10000, // Consider stale after 10s
  });

  // Fetch notifications when dropdown opens
  const fetchNotifications = useCallback(() => {
    if (user) {
      refetchNotifications();
    }
  }, [user, refetchNotifications]);

  // Open dropdown and fetch notifications
  const handleSetIsOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  // Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  // Mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async (category?: string) => {
      const url = category
        ? `/api/notifications/mark-all-read?category=${category}`
        : "/api/notifications/mark-all-read";
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark all as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  // Dismiss notification
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/notifications/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to dismiss");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
    },
  });

  // Refresh aggregation (trigger re-aggregation from data sources)
  const refreshAggregation = useCallback(async () => {
    const response = await fetch("/api/notifications/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to refresh");
    // Invalidate queries to get fresh data
    await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/notifications/counts"] });
  }, [queryClient]);

  const value: NotificationContextValue = {
    counts: counts ?? null,
    isLoadingCounts,
    notifications,
    isLoadingNotifications,
    fetchNotifications,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    dismissNotification: dismissMutation.mutate,
    refreshAggregation,
    isOpen,
    setIsOpen: handleSetIsOpen,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
