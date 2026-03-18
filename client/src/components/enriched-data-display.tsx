/**
 * Enriched Data Display Component
 *
 * Shows enriched product data fetched from brand website
 */

import React from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, ExternalLink, Image as ImageIcon, Package, Shirt, Droplets, RefreshCw, X } from "lucide-react";
import { LayerProgressIndicator } from "./layer-progress-indicator";
import { LayerProgress } from "@/hooks/use-product-enrichment";

interface EnrichedDataDisplayProps {
  enrichedData: {
    cached: boolean;
    data: {
      styleNumber: string;
      productName: string;
      brandProductUrl: string;
      brandProductTitle?: string;
      brandDescription: string;
      materialComposition?: string;
      careInstructions?: string;
      features: string[];
      images: Array<{
        url: string;
        width: number;
        height: number;
        isPrimary: boolean;
      }>;
      scrapingSuccess: boolean;
      scrapingError?: string;
      scrapedAt: Date;
    };
    layerProgress?: LayerProgress;
  };
  onRefresh?: () => void;
  onClear?: () => void;
  isLoading?: boolean;
}

export function EnrichedDataDisplay({ enrichedData, onRefresh, onClear, isLoading }: EnrichedDataDisplayProps) {
  const { data, cached, layerProgress } = enrichedData;

  // Handle case where data is still loading or undefined
  if (!data || !data.scrapingSuccess) {
    return (
      <div className="space-y-3">
        {/* Layer Progress Indicator (shows which layers were attempted) */}
        {layerProgress && (
          <LayerProgressIndicator layerProgress={layerProgress} isLoading={isLoading} />
        )}

        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-600">
              <X className="h-4 w-4" />
              Enrichment Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data?.scrapingError || 'Product not found on brand website'}</p>
            {onRefresh && (
              <Button size="sm" variant="outline" onClick={onRefresh} className="mt-3">
                <RefreshCw className="h-3 w-3 mr-2" />
                Try Again
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Layer Progress Indicator (shows which layer succeeded) */}
      {layerProgress && (
        <LayerProgressIndicator layerProgress={layerProgress} isLoading={isLoading} />
      )}

      <Card className="border-green-500">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                Enriched with Brand Data
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {cached ? '✓ Using cached data' : '✓ Freshly scraped from brand website'}
              </CardDescription>
            </div>
            {onClear && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
        {/* Brand Product Title */}
        {data.brandProductTitle && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Official Product Title</p>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{data.brandProductTitle}</p>
          </div>
        )}

        {/* Brand Product URL */}
        <div>
          <a
            href={data.brandProductUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            View on Brand Website
          </a>
        </div>

        {/* Brand Description */}
        {data.brandDescription && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Brand Description</p>
            <div
              className="text-sm text-amber-900 dark:text-amber-100 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.brandDescription) }}
            />
          </div>
        )}

        {/* Material Composition */}
        {data.materialComposition && (
          <div className="flex items-start gap-2">
            <Shirt className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium">Material</p>
              <p className="text-sm">{data.materialComposition}</p>
            </div>
          </div>
        )}

        {/* Care Instructions */}
        {data.careInstructions && (
          <div className="flex items-start gap-2">
            <Droplets className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium">Care</p>
              <p className="text-sm">{data.careInstructions}</p>
            </div>
          </div>
        )}

        {/* Features */}
        {data.features.length > 0 && (
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium mb-1">Features</p>
              <ul className="text-sm space-y-1">
                {data.features.slice(0, 5).map((feature, index) => (
                  <li key={index} className="text-muted-foreground">• {feature}</li>
                ))}
              </ul>
              {data.features.length > 5 && (
                <p className="text-xs text-muted-foreground mt-1">
                  +{data.features.length - 5} more features
                </p>
              )}
            </div>
          </div>
        )}

        {/* Images */}
        {data.images.length > 0 && (
          <div className="flex items-start gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium mb-2">High-Res Images</p>
              <div className="grid grid-cols-4 gap-2">
                {data.images.slice(0, 4).map((image, index) => (
                  <div key={index} className="relative aspect-square rounded border overflow-hidden bg-muted">
                    <img
                      src={image.url}
                      alt={`Product ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {image.isPrimary && (
                      <Badge className="absolute top-1 left-1 text-xs py-0 px-1">Primary</Badge>
                    )}
                  </div>
                ))}
              </div>
              {data.images.length > 4 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{data.images.length - 4} more images available
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          {onRefresh && (
            <Button size="sm" variant="outline" onClick={onRefresh} title="Force refresh - bypass 7-day cache">
              <RefreshCw className="h-3 w-3 mr-2" />
              Refresh Data
            </Button>
          )}
          {cached && (
            <p className="text-xs text-muted-foreground">
              ✓ Cached {Math.floor((new Date().getTime() - new Date(data.scrapedAt).getTime()) / (1000 * 60 * 60 * 24))} days ago
            </p>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
