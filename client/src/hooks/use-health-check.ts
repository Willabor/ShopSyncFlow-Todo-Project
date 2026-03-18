import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types for health check data
export interface DuplicateCollection {
  id: string;
  name: string;
  slug: string;
  shopifyCollectionId: string | null;
  shopifyHandle: string | null;
  productCount: number;
  createdByType: string | null;
  createdByName: string | null;
  createdAt: string;
  inNavigation: boolean;
  image: string | null;
}

export interface DuplicateGroup {
  id: string;
  name: string;
  collections: DuplicateCollection[];
  recommendation: {
    keepId: string;
    deleteIds: string[];
    reason: string;
  };
  severity: "critical" | "high" | "medium" | "low";
}

export interface NavigationConflict {
  collectionId: string;
  collectionName: string;
  menuName: string;
  menuPath: string;
}

export interface HealthCheckResult {
  scanDate: string;
  totalCollections: number;
  healthyCollections: number;
  duplicateGroups: DuplicateGroup[];
  navigationConflicts: NavigationConflict[];
  issueCount: number;
  summary: {
    duplicates: number;
    navConflicts: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface HealthIssue {
  id: string;
  issueType: string;  // Changed from 'type' to match API response
  severity: string;
  collectionId: string | null;
  relatedCollectionId: string | null;
  menuId: string | null;
  title: string | null;
  description: string;
  recommendation: string | null;
  status: string;
  metadata: Record<string, any> | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

// Hook to fetch current health status
export function useHealthStatus() {
  return useQuery({
    queryKey: ["/api/collections/health"],
    queryFn: async (): Promise<HealthCheckResult> => {
      const response = await fetch("/api/collections/health", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch health status");
      }

      return response.json();
    },
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchOnWindowFocus: true,
  });
}

// Hook to run a new health check
export function useRunHealthCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<HealthCheckResult> => {
      const response = await fetch("/api/collections/health/run", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to run health check");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate health-related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/collections/health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections/health-issues"] });
    },
  });
}

// Hook to fetch stored health issues
export function useHealthIssues() {
  return useQuery({
    queryKey: ["/api/collections/health-issues"],
    queryFn: async (): Promise<HealthIssue[]> => {
      const response = await fetch("/api/collections/health-issues", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch health issues");
      }

      const data = await response.json();
      // API returns { issues, openCount }, extract the issues array
      return data.issues || [];
    },
    staleTime: 30000,
  });
}

// Hook to get issue count for sidebar badge
export function useHealthIssueCount() {
  const { data } = useHealthIssues();

  return data?.filter(issue => issue.status === "open").length ?? 0;
}

// Navigation types
export interface CollectionInNavigation {
  shopifyCollectionId: string;
  menuTitle: string;
  itemTitle: string;
}

// Hook to fetch collections in navigation
export function useCollectionsInNavigation() {
  return useQuery({
    queryKey: ["/api/navigation/collections"],
    queryFn: async (): Promise<CollectionInNavigation[]> => {
      const response = await fetch("/api/navigation/collections", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch collections in navigation");
      }

      const data = await response.json();
      return data.collectionsInNavigation || [];
    },
    staleTime: 60000, // Cache for 1 minute
  });
}

// Hook to sync navigation menus from Shopify
export function useSyncNavigation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{
      success: boolean;
      menusCount: number;
      itemsCount: number;
      collectionItemsCount: number;
      errors: string[];
    }> => {
      const response = await fetch("/api/navigation/sync", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to sync navigation menus");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate navigation queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/navigation/collections"] });
    },
  });
}

// Hook to delete a collection
export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collectionId: string): Promise<{
      success: boolean;
      message: string;
      deletedFromShopify?: boolean;
      error?: string;
      inNavigation?: boolean;
      menuTitle?: string;
    }> => {
      const response = await fetch(`/api/collections/${collectionId}/delete-permanently`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete collection");
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections/health-issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections/all-for-health"] });
    },
  });
}
