import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types for navigation data
export interface NavigationItem {
  id: string;
  shopifyItemId: string;
  title: string;
  type: string;
  targetId: string | null;
  targetUrl: string | null;
  position: number;
  children: NavigationItem[];
}

export interface NavigationMenu {
  id: string;
  shopifyMenuId: string;
  title: string;
  handle: string;
  itemCount: number;
  syncedAt: string;
  items: NavigationItem[];
}

export interface NavigationMenusResponse {
  menus: NavigationMenu[];
  total: number;
}

// Hook to fetch all navigation menus with their items
export function useNavigationMenus() {
  return useQuery({
    queryKey: ["/api/navigation/menus"],
    queryFn: async (): Promise<NavigationMenusResponse> => {
      const response = await fetch("/api/navigation/menus", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch navigation menus");
      }

      return response.json();
    },
    staleTime: 60000, // Cache for 1 minute
  });
}

// Hook to sync navigation from Shopify
export function useSyncNavigationMenus() {
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
      queryClient.invalidateQueries({ queryKey: ["/api/navigation/menus"] });
      queryClient.invalidateQueries({ queryKey: ["/api/navigation/collections"] });
    },
  });
}

// Helper function to count collection links in a menu
export function countCollectionLinks(items: NavigationItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === "COLLECTION") {
      count++;
    }
    if (item.children && item.children.length > 0) {
      count += countCollectionLinks(item.children);
    }
  }
  return count;
}

// Helper function to count total items (including nested)
export function countTotalItems(items: NavigationItem[]): number {
  let count = items.length;
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      count += countTotalItems(item.children);
    }
  }
  return count;
}

// Types for broken links detection
export interface BrokenLink {
  itemId: string;
  itemTitle: string;
  targetId: string | null;
  targetUrl: string | null;
  menuTitle: string;
  menuHandle: string;
}

export interface BrokenLinksResponse {
  totalCollectionLinks: number;
  brokenLinksCount: number;
  healthyLinksCount: number;
  brokenLinks: BrokenLink[];
}

// Hook to detect broken navigation links (pointing to deleted collections)
export function useBrokenNavigationLinks() {
  return useQuery({
    queryKey: ["/api/navigation/broken-links"],
    queryFn: async (): Promise<BrokenLinksResponse> => {
      const response = await fetch("/api/navigation/broken-links", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to detect broken navigation links");
      }

      return response.json();
    },
    staleTime: 30000, // Cache for 30 seconds
  });
}
