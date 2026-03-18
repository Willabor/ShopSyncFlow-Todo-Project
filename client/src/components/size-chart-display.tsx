/**
 * Size Chart Display Component
 *
 * Shows size chart data scraped from brand website
 */

import React, { useState, useRef } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ruler, ExternalLink, AlertCircle, Copy, RefreshCw, Upload, X, FileImage, Loader2, Link } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SizeChartDisplayProps {
  vendorId: string;
  vendorName: string;
  category?: string; // "Bottoms", "Tops", etc.
  productName?: string;
  productDescription?: string;
}

/**
 * Auto-detect product category from name/description when no category is set.
 * Mirrors server-side detectProductCategory logic.
 */
function detectProductCategory(productName: string, description: string = ''): string | null {
  const combined = `${productName} ${description}`.toLowerCase();

  if (/\b(suit|tuxedo|suit\s*jacket|dress\s*suit)\b/.test(combined)) return 'Suits';
  if (/\b(swim|swimwear|trunks?|boardshorts?|swim\s*suit)\b/.test(combined)) return 'Swimwear';
  if (/\b(underwear|boxers?|briefs?|undershirt)\b/.test(combined)) return 'Underwear';
  if (/\b(activewear|athletic|sportswear|workout|gym|performance|track\s*suit)\b/.test(combined)) return 'Activewear';
  if (/\b(pants?|jeans?|shorts?|trousers?|joggers?|sweatpants?|chinos?|slacks?|leggings?)\b/.test(combined)) return 'Bottoms';
  if (/\b(shirt|t-shirt|tee|dress\s*shirt|polo|button[\s-]*down|henley|tank|tank\s*top|camisole|blouse|sweater|sweatshirt|crewneck|pullover|hoodie|cardigan|crop\s*top|tunic|tube\s*top|halter\s*top)\b/.test(combined)) return 'Tops';
  if (/\b(jacket|coat|blazer|vest|parka|windbreaker)\b/.test(combined)) return 'Outerwear';
  if (/\b(shoe|sneaker|boot|sandal|slipper|footwear)\b/.test(combined)) return 'Shoes';
  if (/\b(belt|bag|wallet|accessory|hat|cap|beanie|snapback|headwear|jewelry)\b/.test(combined)) return 'Accessories';

  return null;
}

export function SizeChartDisplay({ vendorId, vendorName, category, productName, productDescription }: SizeChartDisplayProps) {
  // Auto-detect category from product name if not provided
  const effectiveCategory = category || (productName ? detectProductCategory(productName, productDescription) : null) || undefined;

  const [loading, setLoading] = useState(false);
  const [sizeChart, setSizeChart] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fitGuidance, setFitGuidance] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const { toast } = useToast();

  // Manual upload state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [autoScrapeFailed, setAutoScrapeFailed] = useState(false); // Track if auto-scrape failed
  const [isAltUrlModalOpen, setIsAltUrlModalOpen] = useState(false);
  const [alternativeUrl, setAlternativeUrl] = useState("");
  const [isAltUrlScraping, setIsAltUrlScraping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFetchSizeChart = async () => {
    if (!effectiveCategory) {
      setError("Product category not detected. Size charts are category-specific.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgressPercent(0);
    setProgressMessage("Initializing...");

    // Simulate progress updates based on expected timing
    const progressSteps = [
      { time: 0, percent: 0, message: "Initializing..." },
      { time: 5000, percent: 10, message: "Launching headless browser..." },
      { time: 15000, percent: 25, message: "Loading product page..." },
      { time: 25000, percent: 40, message: "Finding size chart button..." },
      { time: 35000, percent: 55, message: "Opening size chart modal..." },
      { time: 50000, percent: 70, message: "Extracting table data..." },
      { time: 65000, percent: 85, message: "Analyzing with AI..." },
      { time: 80000, percent: 95, message: "Finalizing..." },
    ];

    let currentStep = 0;
    const progressInterval = setInterval(() => {
      if (currentStep < progressSteps.length) {
        const step = progressSteps[currentStep];
        setProgressPercent(step.percent);
        setProgressMessage(step.message);
        currentStep++;
      }
    }, 5000); // Update every 5 seconds

    try {
      const response = await fetch(`/api/vendors/${vendorId}/scrape-size-chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ category: effectiveCategory }),
      });

      clearInterval(progressInterval);
      setProgressPercent(100);
      setProgressMessage("Complete!");

      if (!response.ok) {
        // Safely parse error response - handle HTML error pages gracefully
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to fetch size chart');
        } else {
          // Server returned HTML error page (likely 404 or server error)
          throw new Error(`Size chart not available for this brand (${response.status})`);
        }
      }

      const data = await response.json();
      setSizeChart(data);
      setFitGuidance(data.fitGuidance || "");
    } catch (err) {
      clearInterval(progressInterval);
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch size chart';
      setError(errorMsg);
      setAutoScrapeFailed(true); // Show manual upload button as fallback
    } finally {
      setTimeout(() => {
        setLoading(false);
        setProgressPercent(0);
        setProgressMessage("");
      }, 500);
    }
  };

  const handleSaveFitGuidance = async () => {
    if (!sizeChart) return;

    try {
      // TODO: Add API endpoint to update fit guidance
    } catch (err) {
      console.error('Failed to save fit guidance:', err);
    }
  };

  const handleRefreshSizeChart = async () => {
    if (!effectiveCategory) {
      setError("Product category not detected. Size charts are category-specific.");
      return;
    }

    setLoading(true);
    setError(null);
    setAutoScrapeFailed(false); // Reset on refresh attempt

    try {
      const response = await fetch(`/api/vendors/${vendorId}/scrape-size-chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ category: effectiveCategory }),
      });

      if (!response.ok) {
        // Safely parse error response - handle HTML error pages gracefully
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to refresh size chart');
        } else {
          throw new Error(`Size chart not available for this brand (${response.status})`);
        }
      }

      const data = await response.json();
      setSizeChart(data);
      setFitGuidance(data.fitGuidance || "");

      toast({
        title: "Size Chart Refreshed!",
        description: "Size chart has been re-scraped with latest parsing.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh size chart');
      setAutoScrapeFailed(true); // Show manual upload button as fallback
      toast({
        title: "Refresh Failed",
        description: err instanceof Error ? err.message : 'Failed to refresh size chart',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Manual Upload Handlers (NEW)
  // ============================================================================

  const handleFileSelect = (file: File) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a JPG, PNG, WebP, or PDF file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);

    // Generate preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null); // PDF doesn't show preview
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !effectiveCategory) {
      toast({
        title: "Missing Information",
        description: "Please select a file and ensure category is detected.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('category', effectiveCategory);

      // Simulate upload progress
      setUploadProgress(10);
      setTimeout(() => setUploadProgress(30), 500);
      setTimeout(() => setUploadProgress(50), 1000);

      const response = await fetch(`/api/vendors/${vendorId}/size-chart/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      setUploadProgress(80);

      if (!response.ok) {
        // Safely parse error response - handle HTML error pages gracefully
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.message || 'Upload failed');
        } else {
          throw new Error(`Upload failed (${response.status})`);
        }
      }

      const data = await response.json();
      setUploadProgress(100);

      // Update size chart display
      setSizeChart({
        ...data.sizeChart,
        uploadMethod: 'manual_upload',
      });
      setFitGuidance(data.sizeChart.fitGuidance || "");
      setError(null);

      toast({
        title: "Size Chart Uploaded!",
        description: `AI analyzed with ${Math.round((data.sizeChart.aiAnalysisResult?.confidence || 0) * 100)}% confidence`,
      });

      // Close modal and reset
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setAutoScrapeFailed(false); // Reset for next attempt
    } catch (err) {
      toast({
        title: "Upload Failed",
        description: err instanceof Error ? err.message : 'Failed to upload size chart',
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCancelUpload = () => {
    setIsUploadModalOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setIsUploading(false);
    setUploadProgress(0);
  };

  // ============================================================================
  // Alternative URL Handlers (NEW)
  // ============================================================================

  const handleAlternativeUrlScrape = async () => {
    if (!alternativeUrl || !effectiveCategory) {
      toast({
        title: "Missing Information",
        description: "Please enter a URL and ensure category is detected.",
        variant: "destructive",
      });
      return;
    }

    // URL validation
    try {
      const parsedUrl = new URL(alternativeUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        toast({
          title: "Invalid URL Protocol",
          description: "Please enter a URL starting with http:// or https://",
          variant: "destructive",
        });
        return;
      }
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://example.com/size-chart)",
        variant: "destructive",
      });
      return;
    }

    setIsAltUrlScraping(true);
    setError(null);

    try {
      const response = await fetch(`/api/vendors/${vendorId}/scrape-size-chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          category: effectiveCategory,
          sourceUrl: alternativeUrl
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to scrape from alternative URL');
        } else {
          throw new Error(`Scraping failed (${response.status})`);
        }
      }

      const data = await response.json();
      setSizeChart(data);
      setFitGuidance(data.fitGuidance || "");
      setError(null);
      setAutoScrapeFailed(false);
      setIsAltUrlModalOpen(false);
      setAlternativeUrl("");

      toast({
        title: "Size Chart Found!",
        description: "Successfully scraped size chart from alternative URL",
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to scrape from alternative URL';
      setError(errorMsg);
      toast({
        title: "Alternative URL Scrape Failed",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsAltUrlScraping(false);
    }
  };

  const handleCancelAltUrl = () => {
    setIsAltUrlModalOpen(false);
    setAlternativeUrl("");
    setIsAltUrlScraping(false);
  };

  // Render error state with upload modal
  const errorContent = error ? (
    <div className="space-y-2">
      <Card className="border-orange-500">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
            <AlertCircle className="h-4 w-4" />
            Size Chart Not Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>

      {/* Manual Upload Button - Show as fallback after auto-scrape fails */}
        {autoScrapeFailed && effectiveCategory && (
          <div className="space-y-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAltUrlModalOpen(true)}
              className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <Link className="h-4 w-4 mr-2" />
              Try Alternative URL
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Size Chart Manually
            </Button>
          </div>
        )}
    </div>
  ) : null;

  // Render loading/initial state
  const loadingContent = !sizeChart && !error ? (
    <div className="space-y-2">
      {/* Auto-Scrape Button */}
      <Button
        size="sm"
        variant="outline"
        onClick={handleFetchSizeChart}
        disabled={loading || !effectiveCategory}
        className="w-full"
      >
        <Ruler className="h-4 w-4 mr-2" />
        {loading ? 'Fetching Size Chart...' : 'Get Size Chart (Auto-Scrape)'}
      </Button>

      {/* Manual Upload Button - Only show after auto-scrape fails */}
      {autoScrapeFailed && !loading && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsUploadModalOpen(true)}
          disabled={!effectiveCategory}
          className="w-full border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Size Chart Manually
        </Button>
      )}

      {/* Progress Indicator */}
      {loading && progressMessage && (
        <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-700 dark:text-blue-300 font-medium">{progressMessage}</span>
            <span className="text-blue-600 dark:text-blue-400 text-xs">{progressPercent}%</span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 text-center">
            This may take up to 90 seconds for first-time extraction
          </p>
        </div>
      )}

      {!effectiveCategory && (
        <p className="text-xs text-muted-foreground text-center">
          Category detection required for size charts
        </p>
      )}
      {effectiveCategory && !category && (
        <p className="text-xs text-muted-foreground text-center">
          Auto-detected: {effectiveCategory}
        </p>
      )}
    </div>
  ) : null;

  // Determine display based on size chart type (only if sizeChart exists)
  const isImageBased = sizeChart?.sizeChartType === 'image';
  const displayCategory = isImageBased ? 'Image-Based (On Product Pages)' : effectiveCategory;

  // Render size chart content
  const sizeChartContent = sizeChart ? (
    <Card className="border-purple-500">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2 text-purple-600">
              <Ruler className="h-4 w-4" />
              Size Chart: {displayCategory}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {isImageBased ? 'Size charts on individual product pages' : `From ${vendorName} website`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isImageBased ? "default" : "secondary"} className="text-xs">
              {isImageBased ? 'Image-Based' : 'Cached'}
            </Badge>
            {sizeChart.uploadMethod === 'manual_upload' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsUploadModalOpen(true)}
                className="h-6 px-2 text-xs"
                title="Replace with a new image"
              >
                <Upload className="h-3 w-3 mr-1" />
                Re-upload
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefreshSizeChart}
              disabled={loading}
              className="h-6 px-2"
              title="Refresh size chart with latest data"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Source URL */}
        {sizeChart.sourceUrl && (
          <div>
            <a
              href={sizeChart.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View Full Size Chart
            </a>
          </div>
        )}

        {/* Fit Guidance (AI-Friendly) */}
        <div className="space-y-2">
          <Label htmlFor="fit-guidance" className="text-xs font-medium">
            Fit Guidance (for AI)
          </Label>
          <Textarea
            id="fit-guidance"
            value={fitGuidance}
            onChange={(e) => setFitGuidance(e.target.value)}
            placeholder="e.g., True to size, Relaxed fit, Runs small - size up"
            className="text-sm h-16"
          />
          <p className="text-xs text-muted-foreground">
            This guidance will be used by AI when generating product descriptions
          </p>
          {fitGuidance !== (sizeChart.fitGuidance || "") && (
            <Button size="sm" variant="outline" onClick={handleSaveFitGuidance}>
              Save Guidance
            </Button>
          )}
        </div>

        {/* Size Chart Image (if available) */}
        {sizeChart.imageUrl && (
          <div>
            <img
              src={sizeChart.imageUrl}
              alt="Size Chart"
              className="w-full rounded border"
            />
          </div>
        )}

        {/* Image-Based Size Chart Info */}
        {isImageBased && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3">
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="space-y-2 text-xs">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  📸 Image-Based Size Charts Detected
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  This brand displays size chart images on individual product pages instead of a centralized size chart page.
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  <strong>✨ How it works:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300 ml-2">
                  <li>Size chart images are automatically detected when enriching products</li>
                  <li>AI analyzes images to extract fit type, material, and measurements</li>
                  <li>Product-specific data takes priority over brand-wide defaults</li>
                  <li>All extracted data is used in AI-generated descriptions</li>
                </ul>
                <p className="text-blue-600 dark:text-blue-400 font-medium mt-2">
                  💡 No action needed - the system will handle this automatically during enrichment!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Size Chart Tables (parsed from HTML) */}
        {sizeChart.sizeChartData?.parsedTables && Object.keys(sizeChart.sizeChartData.parsedTables).length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                Parsed Size Charts ({Object.keys(sizeChart.sizeChartData.parsedTables).length} categories)
              </Label>
            </div>
            {Object.entries(sizeChart.sizeChartData.parsedTables).map(([category, tableHtml]: [string, any]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-600">{category}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(tableHtml);
                        toast({
                          title: "Table HTML Copied!",
                          description: `${category} size chart table copied to clipboard`,
                        });
                      } else {
                        // Fallback for browsers without clipboard API
                        const textarea = document.createElement('textarea');
                        textarea.value = tableHtml;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        toast({
                          title: "Table HTML Copied!",
                          description: `${category} size chart table copied to clipboard`,
                        });
                      }
                    }}
                    className="h-6 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div
                  className="size-chart-container overflow-x-auto border rounded-md p-3 bg-white dark:bg-gray-900"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(tableHtml) }}
                  style={{
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}
                />
              </div>
            ))}
            <style>{`
              .size-chart-container table {
                width: 100%;
                border-collapse: collapse;
                margin: 0;
              }
              .size-chart-container th,
              .size-chart-container td {
                border: 1px solid #e5e7eb;
                padding: 8px 12px;
                text-align: left;
                font-size: 0.875rem;
              }
              .size-chart-container th {
                background-color: #f3f4f6;
                font-weight: 600;
              }
              .dark .size-chart-container th {
                background-color: #374151;
              }
              .dark .size-chart-container th,
              .dark .size-chart-container td {
                border-color: #4b5563;
              }
            `}</style>
            <p className="text-xs text-muted-foreground">
              These tables will be automatically embedded in product descriptions for matching categories
            </p>
          </div>
        ) : sizeChart.sizeChartData?.rawHtml ? (
          <div className="space-y-2">
            <div className="p-3 border rounded-lg bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                ⚠️ Size chart needs to be refreshed
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                This size chart was scraped before the parsing feature was added. Click the refresh button above to re-scrape and parse the size chart tables.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  // Unified return - always renders Dialog
  return (
    <>
      {errorContent}
      {loadingContent}
      {sizeChartContent}

      {/* Upload Modal - Always rendered so it's available when button is clicked */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Size Chart</DialogTitle>
          <DialogDescription>
            Upload an image or PDF of the size chart for {effectiveCategory} category. AI will extract the data automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drag & Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragging ? 'border-purple-500 bg-purple-50 dark:bg-purple-950' : 'border-gray-300 hover:border-purple-400'}
              ${selectedFile ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {!selectedFile ? (
              <div className="space-y-2">
                <Upload className="h-12 w-12 mx-auto text-gray-400" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Drop size chart image here or click to browse
                </p>
                <p className="text-xs text-gray-500">
                  Supports JPG, PNG, WebP, PDF (max 10MB)
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <FileImage className="h-12 w-12 mx-auto text-green-600" />
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-green-600">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            )}
          </div>

          {/* Image Preview */}
          {previewUrl && (
            <div className="relative">
              <img
                src={previewUrl}
                alt="Size chart preview"
                className="w-full rounded-lg border max-h-64 object-contain"
              />
              <Button
                size="sm"
                variant="destructive"
                className="absolute top-2 right-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-700 dark:text-purple-300 font-medium">
                  {uploadProgress < 60 ? 'Uploading...' : 'Analyzing with AI...'}
                </span>
                <span className="text-purple-600 dark:text-purple-400 text-xs">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-purple-200 dark:bg-purple-900 rounded-full h-2">
                <div
                  className="bg-purple-600 dark:bg-purple-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancelUpload}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUploadSubmit}
            disabled={!selectedFile || isUploading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload & Analyze
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Alternative URL Modal */}
      <Dialog open={isAltUrlModalOpen} onOpenChange={setIsAltUrlModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Try Alternative URL</DialogTitle>
            <DialogDescription>
              Enter a URL to a webpage containing the size chart for {vendorName}.
              This could be a retailer site, product page, or dedicated size guide.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alt-url">Size Chart URL</Label>
              <Input
                id="alt-url"
                type="url"
                placeholder="https://example.com/pages/size-chart"
                value={alternativeUrl}
                onChange={(e) => setAlternativeUrl(e.target.value)}
                disabled={isAltUrlScraping}
              />
              <p className="text-xs text-muted-foreground">
                Tip: Look for "Size Guide" or "Fit Guide" links on retailer websites
              </p>
            </div>

            {isAltUrlScraping && (
              <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                    Scraping size chart from URL...
                  </span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  This may take up to 60 seconds
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCancelAltUrl}
              disabled={isAltUrlScraping}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAlternativeUrlScrape}
              disabled={!alternativeUrl || isAltUrlScraping}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isAltUrlScraping ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Scrape URL
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
