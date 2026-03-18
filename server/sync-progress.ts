/**
 * Sync Progress Tracker
 *
 * Manages real-time progress updates for Shopify sync operations
 * Uses in-memory storage for progress state
 */

export interface SyncProgress {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  currentStep: 'products' | 'vendors' | 'collections' | 'fileSizes' | 'navigation' | 'health' | 'product_counts' | 'done';
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
    navigation: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      menus: number;
      items: number;
      collectionLinks: number;
    };
    health: {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      issuesFound: number;
      duplicates: number;
      navConflicts: number;
    };
  };
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}

// In-memory storage for sync progress (per session)
const progressStore = new Map<string, SyncProgress>();

// SSE clients subscribed to progress updates (Express Response objects)
const sseClients = new Map<string, any[]>();

// Heartbeat intervals for each session (to prevent SSE timeout)
const heartbeatIntervals = new Map<string, NodeJS.Timeout>();

// Tenant-to-active-session mapping (prevents concurrent syncs per tenant)
const tenantSyncMap = new Map<string, string>();

// Heartbeat interval in milliseconds (15 seconds to prevent HTTP/2 timeout)
const HEARTBEAT_INTERVAL_MS = 15000;

export class SyncProgressTracker {
  /**
   * Initialize a new sync session
   */
  static initSession(sessionId: string): SyncProgress {
    const progress: SyncProgress = {
      sessionId,
      status: 'pending',
      currentStep: 'products',
      steps: {
        products: {
          status: 'pending',
          total: 0,
          processed: 0,
          imported: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        },
        vendors: {
          status: 'pending',
          created: 0,
        },
        collections: {
          status: 'pending',
          total: 0,
          processed: 0,
          synced: 0,
          created: 0,
          updated: 0,
        },
        fileSizes: {
          status: 'pending',
          total: 0,
          processed: 0,
          updated: 0,
          failed: 0,
          skipped: 0,
        },
        navigation: {
          status: 'pending',
          menus: 0,
          items: 0,
          collectionLinks: 0,
        },
        health: {
          status: 'pending',
          issuesFound: 0,
          duplicates: 0,
          navConflicts: 0,
        },
      },
      errors: [],
      startedAt: new Date(),
    };

    progressStore.set(sessionId, progress);
    return progress;
  }

  /**
   * Get progress for a session
   */
  static getProgress(sessionId: string): SyncProgress | undefined {
    return progressStore.get(sessionId);
  }

  /**
   * Update progress and notify SSE clients
   */
  static updateProgress(sessionId: string, updates: Partial<SyncProgress>): void {
    const current = progressStore.get(sessionId);
    if (!current) return;

    const updated = { ...current, ...updates };
    progressStore.set(sessionId, updated);

    // Notify all SSE clients subscribed to this session
    this.notifyClients(sessionId, updated);
  }

  /**
   * Update a specific step's progress
   */
  static updateStep(
    sessionId: string,
    step: 'products' | 'vendors' | 'collections' | 'fileSizes' | 'navigation' | 'health',
    updates: Partial<SyncProgress['steps'][typeof step]>
  ): void {
    const current = progressStore.get(sessionId);
    if (!current) return;

    current.steps[step] = { ...current.steps[step], ...updates } as any;
    current.currentStep = step;
    progressStore.set(sessionId, current);

    this.notifyClients(sessionId, current);
  }

  /**
   * Update a step's data WITHOUT changing currentStep.
   * Use this for secondary step updates that happen alongside the primary step
   * (e.g., vendor counts updated during product import).
   */
  static updateStepData(
    sessionId: string,
    step: 'products' | 'vendors' | 'collections' | 'fileSizes' | 'navigation' | 'health',
    updates: Partial<SyncProgress['steps'][typeof step]>
  ): void {
    const current = progressStore.get(sessionId);
    if (!current) return;

    current.steps[step] = { ...current.steps[step], ...updates } as any;
    // Do NOT change currentStep - let the primary step keep focus
    progressStore.set(sessionId, current);

    this.notifyClients(sessionId, current);
  }

  /**
   * Mark sync as completed
   */
  static completeSync(sessionId: string, success: boolean): void {
    const current = progressStore.get(sessionId);
    if (!current) return;

    current.status = success ? 'completed' : 'failed';
    current.currentStep = 'done';
    current.completedAt = new Date();
    progressStore.set(sessionId, current);

    this.notifyClients(sessionId, current);

    // Close all SSE connections for this session
    setTimeout(() => {
      this.closeSSEConnections(sessionId);
      // Clean up after 5 minutes
      setTimeout(() => progressStore.delete(sessionId), 5 * 60 * 1000);
    }, 1000);
  }

  /**
   * Add error to progress
   */
  static addError(sessionId: string, error: string): void {
    const current = progressStore.get(sessionId);
    if (!current) return;

    current.errors.push(error);
    progressStore.set(sessionId, current);

    this.notifyClients(sessionId, current);
  }

  /**
   * Register an SSE client for a session
   */
  static addSSEClient(sessionId: string, res: any): void {
    const clients = sseClients.get(sessionId) || [];
    clients.push(res);
    sseClients.set(sessionId, clients);

    // Start heartbeat if not already running for this session
    if (!heartbeatIntervals.has(sessionId)) {
      const interval = setInterval(() => {
        this.sendHeartbeat(sessionId);
      }, HEARTBEAT_INTERVAL_MS);
      heartbeatIntervals.set(sessionId, interval);
    }
  }

  /**
   * Send heartbeat to all SSE clients for a session
   * This prevents HTTP/2 connection timeout
   */
  private static sendHeartbeat(sessionId: string): void {
    const clients = sseClients.get(sessionId) || [];
    if (clients.length === 0) {
      // No clients, stop heartbeat
      this.stopHeartbeat(sessionId);
      return;
    }

    // Send SSE comment (starts with colon) as heartbeat - doesn't trigger onmessage
    clients.forEach((res: any) => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (error) {
        // Client disconnected, will be cleaned up later
      }
    });
  }

  /**
   * Stop heartbeat for a session
   */
  private static stopHeartbeat(sessionId: string): void {
    const interval = heartbeatIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      heartbeatIntervals.delete(sessionId);
    }
  }

  /**
   * Send progress update to all SSE clients
   */
  private static notifyClients(sessionId: string, progress: SyncProgress): void {
    const clients = sseClients.get(sessionId) || [];
    const data = JSON.stringify(progress);

    clients.forEach((res: any) => {
      try {
        res.write(`data: ${data}\n\n`);
      } catch (error) {
        console.error('Error sending SSE update:', error);
      }
    });
  }

  /**
   * Close all SSE connections for a session
   */
  private static closeSSEConnections(sessionId: string): void {
    // Stop heartbeat first
    this.stopHeartbeat(sessionId);

    const clients = sseClients.get(sessionId) || [];
    clients.forEach((res: any) => {
      try {
        res.end();
      } catch (error) {
        // Ignore errors when closing
      }
    });
    sseClients.delete(sessionId);
  }

  /**
   * Register a sync session for a tenant (prevents concurrent syncs)
   * @returns The existing sessionId if a sync is already active, or null if registered successfully
   */
  static registerTenantSync(tenantId: string, sessionId: string): string | null {
    const existingSessionId = tenantSyncMap.get(tenantId);
    if (existingSessionId) {
      // Check if the existing sync is still active
      const existingProgress = progressStore.get(existingSessionId);
      if (existingProgress && (existingProgress.status === 'pending' || existingProgress.status === 'in_progress')) {
        return existingSessionId; // Already syncing
      }
      // Previous sync finished, clean up stale mapping
      tenantSyncMap.delete(tenantId);
    }
    tenantSyncMap.set(tenantId, sessionId);
    return null;
  }

  /**
   * Get the active sync session for a tenant (if any)
   */
  static getActiveSyncForTenant(tenantId: string): { sessionId: string; progress: SyncProgress } | null {
    const sessionId = tenantSyncMap.get(tenantId);
    if (!sessionId) return null;

    const progress = progressStore.get(sessionId);
    if (!progress || (progress.status !== 'pending' && progress.status !== 'in_progress')) {
      // Sync finished, clean up
      tenantSyncMap.delete(tenantId);
      return null;
    }

    return { sessionId, progress };
  }

  /**
   * Unregister a tenant sync (called on completion)
   */
  static unregisterTenantSync(tenantId: string): void {
    tenantSyncMap.delete(tenantId);
  }

  /**
   * Clean up old sessions (older than 1 hour)
   */
  static cleanupOldSessions(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    Array.from(progressStore.entries()).forEach(([sessionId, progress]) => {
      if (progress.startedAt < oneHourAgo) {
        progressStore.delete(sessionId);
        this.closeSSEConnections(sessionId); // This also stops heartbeat
      }
    });

    // Also clean up stale tenant mappings
    Array.from(tenantSyncMap.entries()).forEach(([tenantId, sessionId]) => {
      if (!progressStore.has(sessionId)) {
        tenantSyncMap.delete(tenantId);
      }
    });
  }

  /**
   * Remove a specific SSE client (e.g., on disconnect)
   */
  static removeSSEClient(sessionId: string, res: any): void {
    const clients = sseClients.get(sessionId) || [];
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
      sseClients.set(sessionId, clients);
    }

    // Stop heartbeat if no more clients
    if (clients.length === 0) {
      this.stopHeartbeat(sessionId);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(() => SyncProgressTracker.cleanupOldSessions(), 30 * 60 * 1000);
