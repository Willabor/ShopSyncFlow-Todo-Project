/**
 * Layer Progress Indicator Component
 *
 * Displays the status of each scraping layer during product enrichment
 * Fixed: Added null-safe property access with optional chaining
 */

import { CheckCircle2, XCircle, Loader2, Circle } from "lucide-react";
import { LayerProgress } from "@/hooks/use-product-enrichment";
import { cn } from "@/lib/utils";

interface LayerProgressIndicatorProps {
  layerProgress: LayerProgress | null;
  isLoading?: boolean;
}

export function LayerProgressIndicator({ layerProgress, isLoading }: LayerProgressIndicatorProps) {
  // Safely access layer properties with fallback to defaults
  const layers = [
    { key: 'layer1', number: 1, ...(layerProgress?.layer1 || { attempted: false, success: false, method: 'Generic Scraper' }) },
    { key: 'layer2', number: 2, ...(layerProgress?.layer2 || { attempted: false, success: false, method: 'Headless Browser' }) },
    { key: 'layer3', number: 3, ...(layerProgress?.layer3 || { attempted: false, success: false, method: 'Gemini AI Extraction' }) },
    { key: 'layer4', number: 4, ...(layerProgress?.layer4 || { attempted: false, success: false, method: 'Shopify Scraper' }) },
  ];

  const getStatusIcon = (layer: typeof layers[0]) => {
    if (!layer.attempted) {
      return <Circle className="h-5 w-5 text-gray-300" />;
    }

    if (layer.success) {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }

    // If attempted but not successful and it's the last attempted layer while loading
    const isLastAttempted = layers
      .slice(layer.number)
      .every(l => !l.attempted);

    if (isLoading && isLastAttempted) {
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    }

    return <XCircle className="h-5 w-5 text-red-400" />;
  };

  const getStatusText = (layer: typeof layers[0]) => {
    if (!layer.attempted) {
      return 'Not Attempted';
    }

    if (layer.success) {
      return '✓ Success';
    }

    const isLastAttempted = layers
      .slice(layer.number)
      .every(l => !l.attempted);

    if (isLoading && isLastAttempted) {
      return 'In Progress...';
    }

    return '✗ Failed';
  };

  const getStatusColor = (layer: typeof layers[0]) => {
    if (!layer.attempted) return 'text-gray-400';
    if (layer.success) return 'text-green-600 font-medium';

    const isLastAttempted = layers
      .slice(layer.number)
      .every(l => !l.attempted);

    if (isLoading && isLastAttempted) return 'text-blue-600 font-medium';
    return 'text-red-500';
  };

  return (
    <div className="space-y-3 bg-gray-50 p-4 rounded-lg border">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        Scraping Method Progress
        {layerProgress?.successfulLayer && (
          <span className="ml-2 text-green-600">
            (Layer {layerProgress.successfulLayer} succeeded)
          </span>
        )}
      </h4>

      <div className="space-y-2">
        {layers.map((layer) => (
          <div
            key={layer.key}
            className={cn(
              "flex items-center gap-3 p-2 rounded transition-all",
              layer.attempted && "bg-white shadow-sm"
            )}
          >
            {getStatusIcon(layer)}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Layer {layer.number}:
                </span>
                <span className="text-sm text-gray-600">
                  {layer.method}
                </span>
              </div>

              <div className={cn("text-xs mt-0.5", getStatusColor(layer))}>
                {getStatusText(layer)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="text-xs text-gray-500 text-center pt-2 border-t">
          Attempting fallback layers automatically... (v2)
        </div>
      )}
    </div>
  );
}
