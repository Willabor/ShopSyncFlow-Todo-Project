import { useState, useEffect, useRef } from 'react';

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

/**
 * Hook to listen to Server-Sent Events for sync progress
 */
export function useSyncProgress(sessionId: string | null) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setProgress(null);
      setIsConnected(false);
      return;
    }

    // Create EventSource for SSE
    const eventSource = new EventSource(`/api/sync-progress/${sessionId}`, {
      withCredentials: true,
    });

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Ignore connection messages
        if (data.type === 'connected') {
          return;
        }

        setProgress(data);

        // Close connection when sync is done
        if (data.status === 'completed' || data.status === 'failed') {
          setTimeout(() => {
            eventSource.close();
            setIsConnected(false);
          }, 1000);
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setIsConnected(false);
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [sessionId]);

  return { progress, isConnected };
}
