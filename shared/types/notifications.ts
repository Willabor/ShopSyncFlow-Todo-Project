/**
 * Notification Types for Global Notification Bell Feature
 *
 * This file contains TypeScript interfaces and types for the notification system.
 * These types are used by both the backend API and frontend components.
 */

import type { Notification, NotificationCategory, NotificationSeverity, NotificationSourceType } from "../schema";

// Re-export base types from schema for convenience
export type { NotificationCategory, NotificationSeverity, NotificationSourceType };

/**
 * Aggregated notification counts by category
 * Used for badge display and summary views
 */
export interface NotificationCounts {
  /** Total unread notifications */
  total: number;
  /** Count breakdown by category */
  byCategory: {
    health: number;
    sync: number;
    quality: number;
    system: number;
  };
  /** Number of critical severity notifications (unread) */
  criticalCount: number;
}

/**
 * Category group for displaying notifications in accordion sections
 */
export interface NotificationGroup {
  /** Category identifier */
  category: NotificationCategory;
  /** Human-readable label for UI display */
  label: string;
  /** Lucide icon name for the category */
  icon: string;
  /** Number of unread notifications in this category */
  count: number;
  /** List of notifications in this category */
  notifications: Notification[];
}

/**
 * Data structure for creating aggregated notifications
 * Used by the notification aggregator service
 */
export interface AggregatedNotificationData {
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** Notification category */
  category: NotificationCategory;
  /** Severity level */
  severity: NotificationSeverity;
  /** Notification title (displayed prominently) */
  title: string;
  /** Detailed message content */
  message: string;
  /** Type of source that triggered this notification */
  sourceType: NotificationSourceType;
  /** Optional ID reference to the source record */
  sourceId?: string;
  /** Deep link URL for navigation when clicked */
  actionUrl: string;
  /** Additional metadata (e.g., count of issues, affected items) */
  metadata?: Record<string, unknown>;
  /** Optional expiration timestamp */
  expiresAt?: Date;
}

/**
 * Category display configuration
 * Maps category IDs to their UI representation
 */
export const CATEGORY_CONFIG: Record<NotificationCategory, { label: string; icon: string; color: string }> = {
  health: {
    label: "Inventory Health",
    icon: "AlertTriangle",
    color: "orange"
  },
  sync: {
    label: "Sync Status",
    icon: "RefreshCw",
    color: "blue"
  },
  quality: {
    label: "Quality Alerts",
    icon: "CheckCircle",
    color: "green"
  },
  system: {
    label: "System",
    icon: "Info",
    color: "gray"
  }
};

/**
 * Severity display configuration
 */
export const SEVERITY_CONFIG: Record<NotificationSeverity, { label: string; color: string; dotColor: string }> = {
  critical: {
    label: "Critical",
    color: "red",
    dotColor: "bg-red-500"
  },
  warning: {
    label: "Warning",
    color: "orange",
    dotColor: "bg-orange-500"
  },
  info: {
    label: "Info",
    color: "blue",
    dotColor: "bg-blue-500"
  }
};

/**
 * Threshold configuration for generating aggregated notifications
 * Used by the notification aggregator service to determine severity
 */
export const NOTIFICATION_THRESHOLDS = {
  collectionHealth: {
    warning: 10,   // > 10 issues = warning
    critical: 25   // > 25 issues = critical
  },
  weightDiscrepancies: {
    warning: 1000,  // > 1000 discrepancies = warning
    critical: 2500  // > 2500 discrepancies = critical
  },
  syncFailures: {
    warning: 1,     // Any failure = warning
    critical: 1     // Any failure = critical (sync errors are always urgent)
  },
  qualityScore: {
    warning: 80,    // < 80% = warning
    critical: 70    // < 70% = critical
  }
} as const;

/**
 * API response type for notification endpoints
 */
export interface NotificationApiResponse {
  notifications: Notification[];
  counts: NotificationCounts;
}

/**
 * Filter options for fetching notifications
 */
export interface NotificationFilters {
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  read?: boolean;
  dismissed?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Result of a bulk notification operation
 */
export interface BulkNotificationResult {
  success: boolean;
  affectedCount: number;
  message?: string;
}
