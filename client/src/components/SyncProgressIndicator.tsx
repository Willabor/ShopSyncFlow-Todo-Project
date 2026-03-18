/**
 * SyncProgressIndicator - Sidebar Sync Progress Component
 *
 * Displays a compact progress indicator in the sidebar showing:
 * - Overall sync progress percentage
 * - Current sync step
 * - Status (syncing, completed, failed)
 * - Idle-state "Sync from Shopify" trigger button for eligible roles
 *
 * Features:
 * - Auto-hides when on /settings page (to avoid duplication)
 * - SuperAdmin/Auditor click navigates to /settings for detailed view
 * - Editor/WarehouseManager click opens a detail dialog
 * - Smooth slide-up animation on appear
 * - Auto-fades after 5 seconds on completion
 * - Adapts to collapsed sidebar mode
 */

import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { useSyncContext } from '@/contexts/SyncContext';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SyncProgressDisplay } from '@/components/SyncProgressDisplay';
import { RefreshCw, CheckCircle, XCircle, Package, Users, Folder, ImageIcon } from 'lucide-react';

const SYNC_ELIGIBLE_ROLES = ['SuperAdmin', 'WarehouseManager', 'Editor'];
const SETTINGS_ROLES = ['SuperAdmin', 'Auditor'];

export function SyncProgressIndicator() {
  const [location, setLocation] = useLocation();
  const { syncProgress, isSyncing, isConnected, overallProgress, startSync } = useSyncContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const canSync = user && SYNC_ELIGIBLE_ROLES.includes(user.role);
  const canAccessSettings = user && SETTINGS_ROLES.includes(user.role);

  // Sync trigger mutation (same as settings.tsx)
  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sync-all-from-shopify", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      // 409 = sync already in progress (started by another user)
      if (response.status === 409 && data.sessionId) {
        return { ...data, alreadyRunning: true };
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to sync from Shopify");
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.alreadyRunning && data.sessionId) {
        // Another user already started a sync - connect to it
        startSync(data.sessionId);
        toast({
          title: "Sync Already Running",
          description: "Another team member started a sync. Connecting to progress...",
        });
      } else if (data.sessionId) {
        startSync(data.sessionId);
        toast({
          title: "Sync Started",
          description: "Syncing products, vendors, and collections from Shopify...",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isActive = isSyncing || syncProgress?.status === 'completed' || syncProgress?.status === 'failed';

  // Determine if indicator should be visible
  const shouldShow = useMemo(() => {
    // Hide on settings page (settings has its own sync UI)
    if (location === '/settings') return false;

    // Show if actively syncing or recently completed/failed
    if (isActive) return true;

    // Show idle trigger for roles that can sync
    if (canSync && !isSyncing) return true;

    return false;
  }, [location, isActive, canSync, isSyncing]);

  // Get current step name and icon
  const getCurrentStepInfo = useMemo(() => {
    if (!syncProgress) return { label: 'Syncing...', icon: RefreshCw };

    switch (syncProgress.currentStep) {
      case 'products':
        return { label: 'Syncing products & media', icon: Package };
      case 'vendors':
        return { label: 'Creating vendors', icon: Users };
      case 'collections':
        return { label: 'Syncing collections', icon: Folder };
      case 'fileSizes':
        return { label: 'Fetching media file sizes', icon: ImageIcon };
      case 'done':
        return { label: 'Finalizing', icon: CheckCircle };
      default:
        return { label: 'Syncing...', icon: RefreshCw };
    }
  }, [syncProgress]);

  // Get status color and icon
  const getStatusDisplay = useMemo(() => {
    if (!syncProgress) {
      return {
        bgColor: 'bg-blue-50 dark:bg-blue-950/20',
        borderColor: 'border-blue-200 dark:border-blue-800',
        icon: RefreshCw,
        iconColor: 'text-blue-600',
        progressColor: 'bg-blue-600',
      };
    }

    switch (syncProgress.status) {
      case 'completed':
        return {
          bgColor: 'bg-green-50 dark:bg-green-950/20',
          borderColor: 'border-green-200 dark:border-green-800',
          icon: CheckCircle,
          iconColor: 'text-green-600',
          progressColor: 'bg-green-600',
        };
      case 'failed':
        return {
          bgColor: 'bg-red-50 dark:bg-red-950/20',
          borderColor: 'border-red-200 dark:border-red-800',
          icon: XCircle,
          iconColor: 'text-red-600',
          progressColor: 'bg-red-600',
        };
      default:
        return {
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          icon: RefreshCw,
          iconColor: 'text-blue-600',
          progressColor: 'bg-blue-600',
        };
    }
  }, [syncProgress]);

  if (!shouldShow) return null;

  const StatusIcon = getStatusDisplay.icon;
  const StepIcon = getCurrentStepInfo.icon;

  // Get display text
  const getDisplayText = () => {
    if (!syncProgress) return 'Starting sync...';

    if (syncProgress.status === 'completed') {
      return 'Sync complete!';
    }

    if (syncProgress.status === 'failed') {
      return 'Sync failed';
    }

    return getCurrentStepInfo.label;
  };

  // Handle click on the progress indicator
  const handleProgressClick = () => {
    if (canAccessSettings) {
      setLocation('/settings');
    } else {
      setShowDetailDialog(true);
    }
  };

  // Handle sync trigger
  const handleTriggerSync = () => {
    if (!isSyncing && !syncMutation.isPending) {
      syncMutation.mutate();
    }
  };

  // ─── Idle state: show sync trigger button ───
  if (!isActive && canSync) {
    return (
      <button
        onClick={handleTriggerSync}
        disabled={syncMutation.isPending}
        className={`
          w-full p-3 border-t border-gray-200 dark:border-gray-800
          bg-gray-50 dark:bg-gray-900
          hover:bg-blue-50 dark:hover:bg-blue-950/30
          transition-all duration-200
          cursor-pointer
          disabled:opacity-50 disabled:cursor-not-allowed
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        `}
        title="Sync all data from Shopify"
        aria-label="Sync all data from Shopify"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 text-blue-600 flex-shrink-0 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          <span className="text-xs font-medium text-foreground">
            {syncMutation.isPending ? 'Starting sync...' : 'Sync from Shopify'}
          </span>
        </div>
      </button>
    );
  }

  // ─── Active/completed state: show progress ───
  return (
    <>
      <button
        onClick={handleProgressClick}
        className={`
          w-full p-3 border-t ${getStatusDisplay.borderColor} ${getStatusDisplay.bgColor}
          hover:bg-opacity-80 dark:hover:bg-opacity-80 transition-all duration-200
          animate-in slide-in-from-bottom-4 fade-in duration-300
          cursor-pointer
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        `}
        title="Click to view detailed sync progress"
        aria-label={`Sync progress: ${overallProgress}%. ${getDisplayText()}. Click to view details.`}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isSyncing ? (
              <StepIcon className={`h-4 w-4 ${getStatusDisplay.iconColor} animate-pulse flex-shrink-0`} />
            ) : (
              <StatusIcon className={`h-4 w-4 ${getStatusDisplay.iconColor} flex-shrink-0`} />
            )}
            <span className="text-xs font-medium text-foreground truncate">
              {getDisplayText()}
            </span>
          </div>
          <span className="text-xs font-semibold text-foreground ml-2 flex-shrink-0">
            {overallProgress}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full ${getStatusDisplay.progressColor} transition-all duration-200 ease-in-out`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Connection Status (only show if disconnected while syncing) */}
        {isSyncing && !isConnected && (
          <div className="mt-2 flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-400">Reconnecting...</span>
          </div>
        )}
      </button>

      {/* Detail Dialog for non-Settings users */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Shopify Sync Progress</DialogTitle>
          </DialogHeader>
          {syncProgress && (
            <SyncProgressDisplay progress={syncProgress} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
