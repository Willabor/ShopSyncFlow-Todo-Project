/**
 * Collection Health System - Type Definitions
 *
 * Types for duplicate detection, navigation conflicts, and health check results.
 */

import type { Collection, NavigationMenu, NavigationItem } from "@shared/schema";

// =============================================================================
// Issue Types
// =============================================================================

export type IssueType = 'duplicate' | 'nav_conflict' | 'orphan' | 'no_products' | 'handle_mismatch';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'resolved' | 'ignored';

// =============================================================================
// Duplicate Detection Types
// =============================================================================

export interface DuplicateCollection {
  id: string;
  name: string;
  slug: string;
  shopifyCollectionId: string | null;
  shopifyHandle: string | null;
  productCount: number;
  createdByType: string | null;
  createdByName: string | null;
  createdAt: Date;
  inNavigation: boolean;
  navigationMenus: string[]; // Menu titles where this collection appears
}

export interface DuplicateRecommendation {
  keepId: string;
  deleteIds: string[];
  reason: string;
}

export interface DuplicateGroup {
  id: string; // UUID for the group
  name: string; // Common collection name
  collections: DuplicateCollection[];
  recommendation: DuplicateRecommendation;
}

// =============================================================================
// Navigation Conflict Types
// =============================================================================

export type NavConflictType = 'switch_required' | 'remove_link' | 'block_delete' | 'orphan_link';

export interface NavigationConflict {
  collectionId: string;
  collectionName: string;
  menuId: string | null;
  menuTitle: string;
  itemTitle: string;
  severity: IssueSeverity;
  message: string;
  action: string;
  // Enhanced fields for switch recommendations
  conflictType: NavConflictType;
  currentInNav: {
    id: string;
    handle: string;
    shopifyId: string | null;
    productCount: number;
  } | null;
  switchTo: {
    id: string;
    handle: string;
    shopifyId: string | null;
    productCount: number;
  } | null;
}

// =============================================================================
// Handle Mismatch Types
// =============================================================================

export interface HandleMismatch {
  collectionId: string;
  collectionName: string;
  actualHandle: string;
  expectedHandle: string;
  productCount: number;
  severity: IssueSeverity;
  message: string;
  recommendation: string;
}

// =============================================================================
// Health Check Result Types
// =============================================================================

export interface HealthCheckResult {
  scanDate: Date;
  totalCollections: number;
  healthyCollections: number;
  duplicateGroups: DuplicateGroup[];
  navigationConflicts: NavigationConflict[];
  handleMismatches: HandleMismatch[];
  issueCount: number;
  summary: HealthSummary;
}

export interface HealthSummary {
  duplicateCount: number;
  conflictCount: number;
  mismatchCount: number;
  orphanCount: number;
  emptyCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

// =============================================================================
// Detection Options
// =============================================================================

export interface DuplicateDetectionOptions {
  /** Include collections with zero products */
  includeEmpty?: boolean;
  /** Check navigation menus for conflicts */
  checkNavigation?: boolean;
  /** Tenant ID for filtering */
  tenantId: string;
}

export interface HealthCheckOptions {
  /** Run duplicate detection */
  checkDuplicates?: boolean;
  /** Run navigation conflict detection */
  checkNavConflicts?: boolean;
  /** Run handle mismatch detection */
  checkHandleMismatches?: boolean;
  /** Run orphan detection (collections not in Shopify) */
  checkOrphans?: boolean;
  /** Run empty collection detection */
  checkEmpty?: boolean;
  /** Tenant ID for filtering */
  tenantId: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface HealthCheckResponse {
  success: boolean;
  result: HealthCheckResult;
  duration: number; // milliseconds
}

export interface HealthIssueCreateData {
  tenantId: string;
  issueType: IssueType;
  severity: IssueSeverity;
  collectionId?: string;
  relatedCollectionId?: string;
  menuId?: string;
  title: string;
  description: string;
  recommendation?: string;
  recommendedAction?: string;
  metadata?: Record<string, unknown>;
}
