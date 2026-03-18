/**
 * Product Enrichment Hook
 *
 * Handles fetching enriched product data from brand websites
 */

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface LayerStatus {
  attempted: boolean;
  success: boolean;
  method: string;
}

export interface LayerProgress {
  layer1: LayerStatus;
  layer2: LayerStatus;
  layer3: LayerStatus;
  layer4: LayerStatus;
  successfulLayer: number | null;
}

export interface ProductMatch {
  index: number;
  title: string;
  matchedBy: 'SKU' | 'Style in Title' | 'Style Variation in Title' | 'Name + Color' | 'Name Only';
  confidence: number;
  matchedVariation?: string;
  imageUrl: string | null;
  handle: string;
}

export interface MultipleMatchesData {
  matches: ProductMatch[];
  message: string;
}

export interface EnrichmentData {
  cached: boolean;
  data: {
    styleNumber: string;
    productName: string;
    color?: string;
    brandProductUrl: string;
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
    scrapedAt: Date;
    scrapingSuccess: boolean;
    scrapingError?: string;
  };
  layerProgress?: LayerProgress;
}

export function useProductEnrichment() {
  const [enrichedData, setEnrichedData] = useState<EnrichmentData | null>(null);
  const [layerProgress, setLayerProgress] = useState<LayerProgress | null>(null);
  const [multipleMatches, setMultipleMatches] = useState<MultipleMatchesData | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const { toast} = useToast();

  // AbortController to cancel ongoing requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const enrichProduct = async ({
    vendorId,
    styleNumber,
    productName,
    color,
    forceRefresh = false,
    productHandle
  }: {
    vendorId: string;
    styleNumber: string;
    productName?: string;
    color?: string;
    forceRefresh?: boolean;
    productHandle?: string;
  }) => {
    try {
      // Cancel any ongoing enrichment request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsEnriching(true);
      setLayerProgress(null);
      setEnrichedData(null);
      setMultipleMatches(null); // Clear previous multi-match dialog when starting new enrichment

      const response = await fetch('/api/products/enrich/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: abortController.signal,
        body: JSON.stringify({
          vendorId,
          styleNumber,
          productName,
          color,
          forceRefresh,
          productHandle
        }),
      });

      if (!response.ok) {
        // Try to extract error message from JSON response
        let errorMsg = `Enrichment request failed (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch {
          // Response might not be JSON
        }
        throw new Error(errorMsg);
      }

      // Verify we got an SSE response
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/event-stream')) {
        throw new Error(`Unexpected response type: ${contentType}. Server may have returned an error.`);
      }

      // Track if we received a terminal event
      let receivedComplete = false;

      // Shared SSE event handler
      const handleSSEEvent = (event: string, data: any) => {
        if (event === 'layer-progress') {
          setLayerProgress(data);
        } else if (event === 'multiple-matches') {
          receivedComplete = true; // Treat as terminal - user needs to select
          const matchesData = data as MultipleMatchesData;
          setMultipleMatches(matchesData);
          toast({
            title: "Multiple Products Found",
            description: matchesData.message,
          });
        } else if (event === 'complete') {
          receivedComplete = true;
          const finalData = data as EnrichmentData;
          setEnrichedData(finalData);
          setMultipleMatches(null);

          if (finalData?.data?.scrapingSuccess) {
            toast({
              title: finalData.cached ? "Using Cached Data" : "Product Enriched!",
              description: `Found product on brand website${finalData.cached ? ' (using 7-day cache)' : ''}`,
            });
          } else {
            toast({
              title: "Product Not Found",
              description: finalData?.data?.scrapingError || "Could not find product on brand website",
              variant: "destructive",
            });
          }
        } else if (event === 'error') {
          throw new Error(data.message || 'Enrichment failed');
        }
      };

      // Parse SSE event+data pair from lines
      const parseEventData = (eventName: string, dataLine: string): boolean => {
        try {
          const data = JSON.parse(dataLine.slice(6));
          handleSSEEvent(eventName, data);
          return true;
        } catch (e) {
          console.error(`[SSE] Failed to parse ${eventName} event data:`, dataLine.slice(0, 200), e);
          return false;
        }
      };

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      let buffer = '';
      let pendingEvent: string | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (buffer.trim()) {
            const finalLines = buffer.split('\n');
            for (let i = 0; i < finalLines.length; i++) {
              if (finalLines[i].startsWith('event: ') && finalLines[i + 1]?.startsWith('data: ')) {
                parseEventData(finalLines[i].slice(7), finalLines[i + 1]);
                i++;
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (pendingEvent && line.startsWith('data: ')) {
            parseEventData(pendingEvent, line);
            pendingEvent = null;
            continue;
          }

          if (line.startsWith('event: ')) {
            const event = line.slice(7);
            const nextLine = lines[i + 1];

            if (nextLine?.startsWith('data: ')) {
              parseEventData(event, nextLine);
              i++;
            } else {
              pendingEvent = event;
            }
          }
        }
      }

      // If stream ended without a complete or multiple-matches event, show error
      if (!receivedComplete) {
        toast({
          title: "Enrichment Failed",
          description: "Connection closed without results. Check server logs for details.",
          variant: "destructive",
        });
      }

      // Clear the abort controller after successful completion
      abortControllerRef.current = null;
    } catch (error: any) {
      // Don't show error toast for aborted requests (user-initiated cancellation)
      if (error.name === 'AbortError') {
        return;
      }

      console.error('Enrichment error:', error);
      toast({
        title: "Enrichment Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsEnriching(false);
    }
  };

  const clearEnrichment = () => {
    setEnrichedData(null);
    setLayerProgress(null);
    setMultipleMatches(null);
  };

  return {
    enrichedData,
    layerProgress,
    multipleMatches,
    enrichProduct,
    isEnriching,
    clearEnrichment,
  };
}
