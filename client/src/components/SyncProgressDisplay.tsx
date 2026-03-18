import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, XCircle, Package, Users, Folder, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SyncProgress } from "@/hooks/useSyncProgress";

interface SyncProgressDisplayProps {
  progress: SyncProgress;
}

export function SyncProgressDisplay({ progress }: SyncProgressDisplayProps) {
  const [showAllErrors, setShowAllErrors] = useState(false);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getProgressPercentage = (processed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((processed / total) * 100);
  };

  // Calculate overall progress with weighted steps
  // Products: 70%, Vendors: 5%, Collections: 15%, File Sizes: 10%
  const calculateOverallProgress = () => {
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

    // Vendors progress (completed alongside products)
    if (progress.steps.vendors.status === 'completed') {
      totalProgress += WEIGHTS.vendors;
    } else if (progress.steps.products.status === 'in_progress') {
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
  };

  return (
    <div className="space-y-4">
      {/* Overall Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">
            {progress.status === 'completed' ? 'Sync Complete!' : 'Syncing...'}
          </h4>
          <span className="text-sm text-muted-foreground">
            {calculateOverallProgress()}%
          </span>
        </div>
        <Progress value={calculateOverallProgress()} className="h-2" />
      </div>

      {/* Products Step */}
      <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStepIcon(progress.steps.products.status)}
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Products & Media</span>
          </div>
          {progress.steps.products.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {progress.steps.products.processed} / {progress.steps.products.total}
            </span>
          )}
        </div>

        {progress.steps.products.status === 'in_progress' && progress.steps.products.total > 0 && (
          <Progress
            value={getProgressPercentage(progress.steps.products.processed, progress.steps.products.total)}
            className="h-1.5"
          />
        )}

        {progress.steps.products.status === 'completed' && (
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Imported:</span>
              <span className="ml-1 font-semibold text-green-600">{progress.steps.products.imported}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Updated:</span>
              <span className="ml-1 font-semibold text-orange-600">{progress.steps.products.updated}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Skipped:</span>
              <span className="ml-1 font-semibold text-gray-600">{progress.steps.products.skipped}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Failed:</span>
              <span className="ml-1 font-semibold text-red-600">{progress.steps.products.failed}</span>
            </div>
          </div>
        )}
      </div>

      {/* Vendors Step */}
      <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStepIcon(progress.steps.vendors.status)}
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Vendors</span>
          </div>
          {progress.steps.vendors.status === 'completed' && (
            <span className="text-xs font-semibold text-blue-600">
              +{progress.steps.vendors.created} created
            </span>
          )}
        </div>
      </div>

      {/* Collections Step */}
      <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStepIcon(progress.steps.collections.status)}
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Collections</span>
          </div>
          {progress.steps.collections.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {progress.steps.collections.processed} / {progress.steps.collections.total}
            </span>
          )}
        </div>

        {progress.steps.collections.status === 'in_progress' && progress.steps.collections.total > 0 && (
          <Progress
            value={getProgressPercentage(progress.steps.collections.processed, progress.steps.collections.total)}
            className="h-1.5"
          />
        )}

        {progress.steps.collections.status === 'completed' && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Synced:</span>
              <span className="ml-1 font-semibold text-purple-600">{progress.steps.collections.synced}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-1 font-semibold text-green-600">{progress.steps.collections.created}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Updated:</span>
              <span className="ml-1 font-semibold text-orange-600">{progress.steps.collections.updated}</span>
            </div>
          </div>
        )}
      </div>

      {/* Image Sizes Step */}
      <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStepIcon(progress.steps.fileSizes.status)}
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Media File Sizes</span>
          </div>
          {progress.steps.fileSizes.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {progress.steps.fileSizes.processed} / {progress.steps.fileSizes.total}
            </span>
          )}
        </div>

        {progress.steps.fileSizes.status === 'in_progress' && progress.steps.fileSizes.total > 0 && (
          <Progress
            value={getProgressPercentage(progress.steps.fileSizes.processed, progress.steps.fileSizes.total)}
            className="h-1.5"
          />
        )}

        {progress.steps.fileSizes.status === 'completed' && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Updated:</span>
              <span className="ml-1 font-semibold text-green-600">{progress.steps.fileSizes.updated}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Skipped:</span>
              <span className="ml-1 font-semibold text-gray-600">{progress.steps.fileSizes.skipped}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Failed:</span>
              <span className="ml-1 font-semibold text-red-600">{progress.steps.fileSizes.failed}</span>
            </div>
          </div>
        )}
      </div>

      {/* Errors */}
      {progress.errors.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {progress.errors.length} Non-Critical {progress.errors.length === 1 ? 'Warning' : 'Warnings'}
              </span>
            </div>
            {progress.errors.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllErrors(!showAllErrors)}
                className="h-auto p-1 text-xs text-amber-700 hover:text-amber-900"
              >
                {showAllErrors ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Show All ({progress.errors.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Error explanation */}
          {progress.errors.some(e => e.includes('Failed to fetch size')) && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2 italic">
              ℹ️ Some image files could not be accessed (likely deleted from Shopify CDN). This doesn't affect your products.
            </p>
          )}

          {/* Error list */}
          <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1 max-h-64 overflow-y-auto">
            {(showAllErrors ? progress.errors : progress.errors.slice(0, 5)).map((error, idx) => (
              <li key={idx} className="font-mono break-all">{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
