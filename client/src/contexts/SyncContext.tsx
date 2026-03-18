/**
 * SyncContext - Global Sync State Management
 *
 * Manages persistent sync state across navigation with:
 * - Single SSE connection for real-time progress
 * - localStorage persistence for page refresh survival
 * - Browser notifications on completion
 * - One sync at a time enforcement
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';

// Re-export the SyncProgress type from useSyncProgress
export interface SyncProgress {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep: 'products' | 'vendors' | 'collections' | 'fileSizes' | 'product_counts' | 'done';
  steps: {
    products: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      total: number;
      processed: number;
      imported: number;
      updated: number;
      skipped: number;
      failed: number;
    };
    vendors: {
      status: 'pending' | 'in_progress' | 'completed';
      created: number;
    };
    collections: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      total: number;
      processed: number;
      synced: number;
      created: number;
      updated: number;
    };
    fileSizes: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      total: number;
      processed: number;
      updated: number;
      failed: number;
      skipped: number;
    };
  };
  errors: string[];
  startedAt: string;
  completedAt?: string;
}

interface SyncSessionData {
  sessionId: string;
  startedAt: string;
  expiresAt: string;
}

interface SyncContextValue {
  // State
  sessionId: string | null;
  syncProgress: SyncProgress | null;
  isSyncing: boolean;
  isConnected: boolean;

  // Actions
  startSync: (sessionId: string) => void;
  clearSync: () => void;

  // Computed
  overallProgress: number;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

const STORAGE_KEY = 'shopify-sync-session';
const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour
const COMPLETED_DISPLAY_DURATION_MS = 5000; // 5 seconds

// ===================================================================
// Helper Functions
// ===================================================================

/**
 * Save sync session to localStorage
 */
function saveSyncSession(sessionId: string): void {
  const session: SyncSessionData = {
    sessionId,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save sync session to localStorage:', error);
  }
}

/**
 * Load sync session from localStorage
 */
function loadSyncSession(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const session: SyncSessionData = JSON.parse(stored);

    // Check if session has expired
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return session.sessionId;
  } catch (error) {
    console.error('Failed to load sync session from localStorage:', error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Clear sync session from localStorage
 */
function clearSyncSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear sync session from localStorage:', error);
  }
}

/**
 * Calculate overall sync progress percentage
 * Now accounts for progress within each step, not just completed steps
 *
 * Weight distribution (based on typical sync times):
 * - Products: 70% (majority of data)
 * - Vendors: 5% (auto-created with products)
 * - Collections: 15% (moderate data)
 * - File Sizes: 10% (quick HEAD requests)
 */
function calculateOverallProgress(progress: SyncProgress | null): number {
  if (!progress) return 0;

  // Define step weights (should sum to 100)
  const WEIGHTS = {
    products: 70,
    vendors: 5,
    collections: 15,
    fileSizes: 10,
  };

  let totalProgress = 0;

  // Products progress
  if (progress.steps.products.status === 'completed') {
    totalProgress += WEIGHTS.products;
  } else if (progress.steps.products.status === 'in_progress' && progress.steps.products.total > 0) {
    const productProgress = progress.steps.products.processed / progress.steps.products.total;
    totalProgress += WEIGHTS.products * productProgress;
  }

  // Vendors progress (completed with products)
  if (progress.steps.vendors.status === 'completed') {
    totalProgress += WEIGHTS.vendors;
  } else if (progress.steps.products.status === 'in_progress') {
    // Vendors are created during product import, so estimate from product progress
    const productProgress = progress.steps.products.total > 0
      ? progress.steps.products.processed / progress.steps.products.total
      : 0;
    totalProgress += WEIGHTS.vendors * productProgress;
  }

  // Collections progress
  if (progress.steps.collections.status === 'completed') {
    totalProgress += WEIGHTS.collections;
  } else if (progress.steps.collections.status === 'in_progress' && progress.steps.collections.total > 0) {
    const collectionProgress = progress.steps.collections.processed / progress.steps.collections.total;
    totalProgress += WEIGHTS.collections * collectionProgress;
  }

  // File sizes progress
  if (progress.steps.fileSizes.status === 'completed') {
    totalProgress += WEIGHTS.fileSizes;
  } else if (progress.steps.fileSizes.status === 'in_progress' && progress.steps.fileSizes.total > 0) {
    const fileSizeProgress = progress.steps.fileSizes.processed / progress.steps.fileSizes.total;
    totalProgress += WEIGHTS.fileSizes * fileSizeProgress;
  }

  return Math.round(totalProgress);
}

/**
 * Request browser notification permission (if not already granted)
 */
async function requestNotificationPermission(): Promise<void> {
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.error('Failed to request notification permission:', error);
    }
  }
}

/**
 * Show browser notification
 */
function showNotification(title: string, body: string, success: boolean): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: success ? '/favicon.ico' : undefined,
        tag: 'shopify-sync', // Replace existing notification with same tag
      });
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }
}

// ===================================================================
// Provider Component
// ===================================================================

export function SyncProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  // State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs
  const eventSourceRef = useRef<EventSource | null>(null);
  const completedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const notificationShownRef = useRef(false);
  const syncProgressRef = useRef<SyncProgress | null>(null);

  // Computed
  const isSyncing = syncProgress?.status === 'in_progress' || syncProgress?.status === 'pending';
  const overallProgress = calculateOverallProgress(syncProgress);

  // ===================================================================
  // SSE Connection Management
  // ===================================================================

  /**
   * Establish SSE connection for a session
   */
  const connectToSession = useCallback((sid: string) => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }


    const eventSource = new EventSource(`/api/sync-progress/${sid}`, {
      withCredentials: true,
    });

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Skip non-progress messages (e.g., connection confirmation)
        if (!data.steps || data.type === 'connected') {
          return;
        }

        const progress: SyncProgress = data;

        setSyncProgress(progress);
        syncProgressRef.current = progress;

        // Handle completion
        if (progress.status === 'completed' || progress.status === 'failed') {
          const isSuccess = progress.status === 'completed';

          // Show browser notification (only once)
          if (!notificationShownRef.current) {
            notificationShownRef.current = true;

            const title = isSuccess ? '✅ Sync Complete' : '⚠️ Sync Failed';
            const body = isSuccess
              ? `Synced ${progress.steps.products.imported} products, ${progress.steps.vendors.created} vendors, ${progress.steps.collections.synced} collections, and ${progress.steps.fileSizes.updated} media file sizes`
              : `Sync encountered ${progress.errors.length} errors. Check the sync report for details.`;

            showNotification(title, body, isSuccess);
          }

          // Auto-cleanup after 5 seconds
          if (completedTimeoutRef.current) {
            clearTimeout(completedTimeoutRef.current);
          }

          completedTimeoutRef.current = setTimeout(() => {
            clearSync();
          }, COMPLETED_DISPLAY_DURATION_MS);
        }
      } catch (error) {
        console.error('[SyncContext] Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      // Check if this is a normal closure after successful completion
      // EventSource fires 'error' event when connection closes, even for successful completions
      const currentStatus = syncProgressRef.current?.status;

      if (currentStatus === 'completed' || currentStatus === 'failed') {
        // Normal closure - sync already completed
      } else if (eventSource.readyState === EventSource.CLOSED) {
        // Connection closed unexpectedly during sync
        console.warn('[SyncContext] SSE connection closed unexpectedly during sync');
      } else {
        // Actual error (network issues, etc.)
        console.error('[SyncContext] SSE connection error:', error);
      }

      setIsConnected(false);

      // Don't auto-reconnect - let user manually refresh if needed
      // This prevents infinite reconnection loops if session doesn't exist
      eventSource.close();
    };
  }, []);

  /**
   * Disconnect SSE connection
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }

    if (completedTimeoutRef.current) {
      clearTimeout(completedTimeoutRef.current);
      completedTimeoutRef.current = null;
    }
  }, []);

  // ===================================================================
  // Actions
  // ===================================================================

  /**
   * Start tracking a new sync session
   */
  const startSync = useCallback((newSessionId: string) => {
    // Prevent starting new sync if one is already in progress
    if (isSyncing) {
      toast({
        title: "⚠️ Sync Already Running",
        description: "Please wait for the current sync to complete before starting a new one.",
        variant: "destructive",
      });
      return;
    }


    // Save to localStorage
    saveSyncSession(newSessionId);

    // Update state
    setSessionId(newSessionId);
    setSyncProgress(null);
    syncProgressRef.current = null;
    notificationShownRef.current = false;

    // Request notification permission (non-blocking)
    requestNotificationPermission();

    // Connect to SSE
    connectToSession(newSessionId);
  }, [isSyncing, connectToSession, toast]);

  /**
   * Clear sync state
   */
  const clearSync = useCallback(() => {

    disconnect();
    clearSyncSession();

    setSessionId(null);
    setSyncProgress(null);
    syncProgressRef.current = null;
    notificationShownRef.current = false;
  }, [disconnect]);

  // ===================================================================
  // Lifecycle Management
  // ===================================================================

  /**
   * Check for active sync on the server (started by any user in the same tenant)
   */
  const checkForActiveSync = useCallback(async () => {
    // Don't reconnect if we already have an active SSE connection
    if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
      return;
    }

    try {
      const response = await fetch('/api/sync/active', { credentials: 'include' });
      if (!response.ok) return;

      const data = await response.json();
      if (data.active && data.sessionId) {
        // Another user started a sync - connect to it
        saveSyncSession(data.sessionId);
        setSessionId(data.sessionId);
        connectToSession(data.sessionId);
      }
    } catch (error) {
      // Silently ignore - this is a best-effort check
    }
  }, [connectToSession]);

  /**
   * On mount: Restore session from localStorage, or discover active sync from server
   */
  useEffect(() => {
    const storedSessionId = loadSyncSession();

    if (storedSessionId) {
      setSessionId(storedSessionId);
      connectToSession(storedSessionId);
    } else {
      // No local session - check if another user started a sync
      checkForActiveSync();
    }

    // Poll for active syncs every 5 seconds
    // checkForActiveSync already guards against reconnecting when already connected
    const pollInterval = setInterval(() => {
      checkForActiveSync();
    }, 5000);

    // Also check immediately when the tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForActiveSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Cleanup only on unmount
    return () => {
      disconnect();
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Cleanup completed timeout on unmount
   */
  useEffect(() => {
    return () => {
      if (completedTimeoutRef.current) {
        clearTimeout(completedTimeoutRef.current);
      }
    };
  }, []);

  // ===================================================================
  // Context Value
  // ===================================================================

  const value: SyncContextValue = {
    sessionId,
    syncProgress,
    isSyncing,
    isConnected,
    startSync,
    clearSync,
    overallProgress,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// ===================================================================
// Hook
// ===================================================================

/**
 * Hook to access sync context
 */
export function useSyncContext(): SyncContextValue {
  const context = useContext(SyncContext);

  if (context === undefined) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }

  return context;
}
