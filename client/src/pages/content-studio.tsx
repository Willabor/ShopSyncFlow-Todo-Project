import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { sanitizeHtml } from "@/lib/sanitize";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CharacterCounter } from "@/components/ui/character-counter";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Upload, FileText, Copy, Loader2, CheckCircle, Sparkles, Tag, Store, RefreshCw, Info, AlertTriangle, Clock, ImageIcon } from "lucide-react";
import { parseOrderCSV, type ParsedProduct, type CSVParseResult } from "@/utils/csv-parser";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useYoastAnalysis } from "@/hooks/useYoastAnalysis";
import { KeywordResearchPanel } from "@/components/keyword-research-panel";
import { GoogleCategoryModal, type GoogleCategory } from "@/components/google-category-modal";
import { VendorSelect } from "@/components/vendor-select";
import { BrandWebsiteModal } from "@/components/brand-website-modal";
import { EnrichedDataDisplay } from "@/components/enriched-data-display";
import { LayerProgressIndicator } from "@/components/layer-progress-indicator";
import { SizeChartDisplay } from "@/components/size-chart-display";
import { useProductEnrichment } from "@/hooks/use-product-enrichment";
import { ProductDuplicateDialog } from "@/components/product-duplicate-dialog";
import { ProductMatchSelector } from "@/components/ProductMatchSelector";
import { ComparisonCard } from "@/components/ComparisonCard";
import type { ProductMatch } from "@/hooks/use-product-enrichment";

export default function ContentStudio() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State management
  const [view, setView] = useState<'upload' | 'products'>('upload');
  const [csvData, setCSVData] = useState<CSVParseResult | null>(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Manual mode state (from Product Edit)
  const [isManualMode, setIsManualMode] = useState(false);
  const [originalProductId, setOriginalProductId] = useState<string | null>(null);
  const [manualSourceData, setManualSourceData] = useState<any>(null);

  // Detect manual mode from Product Edit
  useEffect(() => {
    // Check URL for manual mode indicator
    const urlParams = new URLSearchParams(window.location.search);
    const isManual = urlParams.get("source") === "manual";

    if (!isManual) {
      // Clean up stale sessionStorage from previous manual navigation
      sessionStorage.removeItem("contentStudioPreFill");
      sessionStorage.removeItem("contentStudioReturnUrl");
      return;
    }

    if (isManual) {
      const preFillDataRaw = sessionStorage.getItem("contentStudioPreFill");

      if (preFillDataRaw) {
        try {
          const preFillData = JSON.parse(preFillDataRaw);

          // Store original product ID for later
          setOriginalProductId(preFillData.productId);
          setManualSourceData(preFillData);
          setIsManualMode(true);

          // Convert to Content Studio product format (ParsedProduct)
          const mockProduct: ParsedProduct = {
            styleNumber: preFillData.styleNumber || preFillData.productId || `MANUAL-${Date.now()}`,
            productName: preFillData.productName || "Unnamed Product",
            vendor: preFillData.vendor || "Unknown",
            color: preFillData.color || extractColorFromTitle(preFillData.productName) || "N/A",
            description: preFillData.description || "",
            features: [], // Empty for manual mode
            category: preFillData.category || "",
            imageUrl: preFillData.images?.[0] || "",
            msrp: parseFloat(preFillData.price) || 0,
            wholesalePrice: 0, // Not available from Product Edit
            sizes: [], // Not available from Product Edit
            skus: [],  // Not available from Product Edit
            rawData: [], // Empty for manual mode
          };

          // Create a mock CSVParseResult
          const mockCSVData: CSVParseResult = {
            success: true,
            products: [mockProduct],
            orderInfo: {
              orderNumber: "MANUAL-ENTRY",
              vendor: preFillData.vendor || "Unknown",
              totalItems: 1,
            },
          };

          // Set CSV data and switch to products view
          setCSVData(mockCSVData);
          setView('products');
          setCurrentProductIndex(0);

          toast({
            title: "Manual Data Loaded",
            description: `Using data for "${preFillData.productName}" from Product Edit`,
          });

        } catch (error) {
          console.error("Failed to parse pre-fill data:", error);
          toast({
            title: "Error",
            description: "Failed to load manual data. Please try again.",
            variant: "destructive",
          });
        }
      }
    }
  }, [toast]);

  // Helper function to extract color from title
  const extractColorFromTitle = (title: string): string | null => {
    const colorMatch = title.match(/\b(Black|White|Grey|Gray|Blue|Red|Green|Navy|Khaki|Beige|Brown|Tan|Pink|Purple|Orange|Yellow)\b/i);
    return colorMatch ? colorMatch[1] : null;
  };

  // Handle CSV upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const result = await parseOrderCSV(file);

      if (result.success && result.products.length > 0) {
        setCSVData(result);
        setView('products');
        setCurrentProductIndex(0);

        toast({
          title: "CSV Uploaded Successfully",
          description: `${result.products.length} products detected from order ${result.orderInfo.orderNumber || 'Unknown'}`,
        });
      } else {
        toast({
          title: "CSV Parse Error",
          description: result.error || "No products found in CSV",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to parse CSV file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset input to allow re-uploading same file
      event.target.value = '';
    }
  };

  // Navigate between products
  const goToNextProduct = () => {
    if (csvData && currentProductIndex < csvData.products.length - 1) {
      setCurrentProductIndex(currentProductIndex + 1);
    }
  };

  const goToPreviousProduct = () => {
    if (currentProductIndex > 0) {
      setCurrentProductIndex(currentProductIndex - 1);
    }
  };

  // Reset to upload view
  const resetToUpload = () => {
    setView('upload');
    setCSVData(null);
    setCurrentProductIndex(0);
  };

  const currentProduct = csvData?.products[currentProductIndex];

  return (
    <MainLayout
      title="Content Studio"
      subtitle="AI-powered SEO content generation with Yoast scoring"
      actions={
        view === 'products' && (
          <Button variant="outline" onClick={resetToUpload}>
            <Upload className="mr-2 h-4 w-4" />
            Upload New CSV
          </Button>
        )
      }
    >
      <div className="flex-1 overflow-auto p-6">
          {view === 'upload' && (
            <CSVUploadView
              onFileUpload={handleFileUpload}
              isUploading={isUploading}
            />
          )}

          {view === 'products' && csvData && currentProduct && (
            <>
              {/* Banner - Different for Manual Mode vs File Upload Mode */}
              {isManualMode ? (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-semibold text-blue-900">Manual Data Mode</p>
                      <p className="text-sm text-blue-700">
                        Using manually entered data from Product Edit. AI will optimize for SEO.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">
                          Order: {csvData.orderInfo.orderNumber || 'Unknown'} | Vendor: {csvData.orderInfo.vendor || 'Unknown'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {csvData.products.length} unique products detected from {csvData.orderInfo.totalItems} line items
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToPreviousProduct}
                        disabled={currentProductIndex === 0}
                      >
                        Previous
                      </Button>
                      <span className="text-sm font-medium px-3">
                        Product {currentProductIndex + 1} of {csvData.products.length}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goToNextProduct}
                        disabled={currentProductIndex === csvData.products.length - 1}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Product Editor - 3-Panel Layout */}
              <ProductEditor key={currentProduct.styleNumber} product={currentProduct} originalProductId={originalProductId} manualSourceData={manualSourceData} />
            </>
          )}
        </div>
    </MainLayout>
  );
}

// CSV Upload View Component
function CSVUploadView({ onFileUpload, isUploading }: {
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Upload Vendor Order File</CardTitle>
          <CardDescription>
            Upload a vendor order sheet to automatically extract products and generate SEO-optimized content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer"
            onClick={handleClick}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />

            <p className="text-lg font-medium mb-2">
              {isUploading ? "Processing..." : "Drag & drop order file here"}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={isUploading}
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
            >
              Browse Files
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={onFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </div>

          <div className="mt-6 space-y-2 text-sm text-muted-foreground">
            <p><strong>Supported formats:</strong> .csv, .xls, .xlsx (vendor order sheets)</p>
            <p><strong>Example:</strong> order-record-*.xls or *_BoomOrderTemplate_*.csv</p>
            <p><strong>What happens:</strong> Products are automatically grouped by Style Number + Color, images extracted, category detected, and vendor can be overridden per-product if needed</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Product Editor Component (3-panel layout)
function ProductEditor({ product, originalProductId, manualSourceData }: { product: ParsedProduct; originalProductId: string | null; manualSourceData?: any }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Comparison dialog state (for updating existing products)
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [comparisonData, setComparisonData] = useState<{
    current: any;
    new: any;
  } | null>(null);
  const [keepOriginalImages, setKeepOriginalImages] = useState(false);

  // Duplicate detection state (for Excel uploads)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateDetectionResult, setDuplicateDetectionResult] = useState<any>(null);
  const [pendingProductData, setPendingProductData] = useState<any>(null);

  // Title variation state (NEW - Phase 2)
  const [titleVariations, setTitleVariations] = useState<string[]>([]);
  const [selectedTitleIndex, setSelectedTitleIndex] = useState<number | null>(null);
  const [showTitleSelector, setShowTitleSelector] = useState<boolean>(false);

  // Computed value - derived from title variations
  const generatedTitle = React.useMemo(() => {
    if (selectedTitleIndex === null || titleVariations.length === 0) return '';
    return titleVariations[selectedTitleIndex] || '';
  }, [titleVariations, selectedTitleIndex]);

  // Meta title variation state (NEW - matching product title pattern)
  const [metaTitleVariations, setMetaTitleVariations] = useState<string[]>([]);
  const [selectedMetaTitleIndex, setSelectedMetaTitleIndex] = useState<number | null>(null);
  const [showMetaTitleSelector, setShowMetaTitleSelector] = useState<boolean>(false);

  // Computed value - derived from meta title variations
  const selectedMetaTitle = React.useMemo(() => {
    if (selectedMetaTitleIndex === null || metaTitleVariations.length === 0) return '';
    return metaTitleVariations[selectedMetaTitleIndex] || '';
  }, [metaTitleVariations, selectedMetaTitleIndex]);

  // Other generated content state
  const [generatedDescription, setGeneratedDescription] = useState<string>("");
  const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
  const [metaDescription, setMetaDescription] = useState<string>("");
  const [generatedMeta, setGeneratedMeta] = useState<{ metaTitle: string; metaDescription: string } | null>(null);
  const [focusKeyword, setFocusKeyword] = useState<string>(`${product.vendor} ${product.productName}`);
  const [googleCategory, setGoogleCategory] = useState<GoogleCategory | null>(null);

  // Pre-fill Shopify Category from product edit (must be after setGoogleCategory is defined)
  useEffect(() => {
    if (manualSourceData?.shopifyCategoryId && manualSourceData?.shopifyCategoryPath && !googleCategory) {
      setGoogleCategory({
        id: manualSourceData.shopifyCategoryId,
        gid: "",
        name: manualSourceData.shopifyCategoryPath.split(" > ").pop() || "",
        path: manualSourceData.shopifyCategoryPath,
        level: manualSourceData.shopifyCategoryPath.split(" > ").length,
      });
    }
  }, [manualSourceData]);

  const [descriptionTone, setDescriptionTone] = useState<'professional' | 'casual' | 'luxury'>('casual'); // Tone selector for description generation
  const [selectedVendor, setSelectedVendor] = useState<string>(product.vendor || '');
  const [editedDescription, setEditedDescription] = useState<string>(product.description || '');

  // Session-wide vendor selection (persists across all products in current upload)
  const [sessionVendor, setSessionVendor] = useState<string>('');

  // Save state - tracks if product has been saved
  const [savedProductId, setSavedProductId] = useState<string | null>(null);

  // Brand enrichment state (moved to parent so AI can access it)
  const { enrichedData, layerProgress, multipleMatches, enrichProduct, isEnriching, clearEnrichment } = useProductEnrichment();

  // Fetch vendors to get vendor ID
  const { data: vendors } = useQuery({
    queryKey: ['/api/vendors'],
    queryFn: async () => {
      const res = await fetch('/api/vendors', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch vendors');
      return res.json();
    }
  });

  // Find current vendor object
  const currentVendor = vendors?.find((v: any) => v.name === (selectedVendor || product.vendor));


  // Handle vendor selection - update both current product and session
  const handleVendorSelect = (vendor: string) => {
    setSelectedVendor(vendor);
    setSessionVendor(vendor); // Save for entire session
  };

  // Save product mutation
  // Helper function to build product data
  const buildProductData = () => {
    return {
      // Required fields
      title: generatedTitle,
      vendor: selectedVendor,

      // Optional but recommended
      description: generatedDescription || null,
      sku: product.skus[0] || null, // Use first SKU from array
      price: product.wholesalePrice?.toString() || product.msrp?.toString() || null,
      category: googleCategory?.name || product.category || null,

      // Product identification
      styleNumber: product.styleNumber || null, // Top-level styleNumber column

      // Images array - use ALL enriched images if available, otherwise fall back to CSV image
      images: enrichedData?.data?.images && enrichedData.data.images.length > 0
        ? enrichedData.data.images.map((img: any) => img.url)
        : product.imageUrl ? [product.imageUrl] : [],

      // Metadata (preserve CSV data)
      metadata: {
        styleNumber: product.styleNumber,
        color: product.color,
        sizes: product.sizes,
        skus: product.skus,
        msrp: product.msrp,
        wholesalePrice: product.wholesalePrice,
        productName: product.productName,
        originalVendor: product.vendor,
        features: product.features,
      },

      // Status fields (fixed values for local draft)
      status: "local_draft",
      publishStatus: "not_published",

      // SEO fields
      metaTitle: selectedMetaTitle || null,
      metaDescription: metaDescription || null,
      focusKeyword: focusKeyword || null,
      googleCategory: googleCategory ? {
        id: googleCategory.id,
        name: googleCategory.name,
        path: googleCategory.path
      } : null,
      generatedKeywords: generatedKeywords.length > 0 ? generatedKeywords : null,
    };
  };

  // Save product mutation (handles both new and update)
  const saveProductMutation = useMutation({
    mutationFn: async (productData: any) => {
      const response = await fetch("/api/products/content-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(productData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.details || "Failed to save product");
      }

      return response.json();
    },
    onSuccess: (savedProduct) => {
      setSavedProductId(savedProduct.id);

      // Redirect back to product edit
      const returnUrl = sessionStorage.getItem("contentStudioReturnUrl");

      toast({
        title: "✅ Product Saved",
        description: `"${savedProduct.title}" saved successfully!`,
      });

      // Clean up sessionStorage (always, regardless of returnUrl)
      sessionStorage.removeItem("contentStudioPreFill");
      sessionStorage.removeItem("contentStudioReturnUrl");

      // Redirect if we have a return URL
      if (returnUrl) {
        setTimeout(() => navigate(returnUrl), 1000); // Small delay to show toast
      }
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler for save button - checks if updating existing product
  const handleSaveProduct = async () => {
    try {
      // Validation
      if (!generatedTitle || generatedTitle.trim() === '') {
        toast({
          title: "Validation Error",
          description: "Please generate a product title first",
          variant: "destructive"
        });
        return;
      }
      if (!selectedVendor || selectedVendor.trim() === '') {
        toast({
          title: "Validation Error",
          description: "Please select a vendor",
          variant: "destructive"
        });
        return;
      }

      // Build new product data
      const newProductData = buildProductData();

      // Check if we're updating an existing product
      if (originalProductId) {
        // Fetch current product data and uploaded media files in parallel
        const [productResponse, mediaResponse] = await Promise.all([
          fetch(`/api/products/${originalProductId}`, { credentials: "include" }),
          fetch(`/api/products/${originalProductId}/media`, { credentials: "include" }),
        ]);

        if (!productResponse.ok) {
          throw new Error("Failed to fetch current product data");
        }

        const currentProduct = await productResponse.json();

        // Get uploaded media files (from productMedia table)
        let uploadedMediaUrls: string[] = [];
        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          // API returns { success, files, count } - extract the files array
          const mediaFiles = mediaData?.files || mediaData;
          if (Array.isArray(mediaFiles)) {
            uploadedMediaUrls = mediaFiles
              .filter((f: any) => f.cdnUrl || f.filePath)
              .map((f: any) => f.cdnUrl || `/api/files/${f.id}/serve`);
          }
        }

        // Use uploaded media as "current images" if available, fallback to products.images column
        if (uploadedMediaUrls.length > 0) {
          currentProduct.uploadedImages = uploadedMediaUrls;
        }

        // Show comparison dialog
        setComparisonData({
          current: currentProduct,
          new: newProductData
        });
        setKeepOriginalImages(true);
        setShowComparisonDialog(true);

      } else {
        // New product from Excel - Check for duplicates first
        await checkForDuplicates(newProductData);
      }

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process save",
        variant: "destructive"
      });
    }
  };

  // Handler for confirming replacement of existing product
  const confirmReplacement = async () => {
    try {
      if (!originalProductId || !comparisonData) {
        throw new Error("Missing product data");
      }

      // Build update data, respecting image choice
      const updateData = {
        ...comparisonData.new,
        aiGenerated: true,
        aiGeneratedAt: new Date().toISOString(),
      };

      // If user chose to keep original images, don't overwrite with brand images
      if (keepOriginalImages) {
        // Remove images from update to preserve whatever the product currently has
        // (uploaded media files in productMedia table + existing images column)
        delete updateData.images;
      }

      // Update existing product via PATCH
      const response = await fetch(`/api/products/${originalProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[Content Studio] Product update failed:', {
          status: response.status,
          error,
          productId: originalProductId
        });
        throw new Error(error.message || error.details || "Failed to update product");
      }

      const updatedProduct = await response.json();

      // Close dialog
      setShowComparisonDialog(false);
      setComparisonData(null);

      // Show success message
      toast({
        title: "✅ Product Updated",
        description: `"${updatedProduct.title}" has been updated successfully!`
      });

      // Get returnUrl before clearing sessionStorage
      const returnUrl = sessionStorage.getItem("contentStudioReturnUrl");

      // Clean up sessionStorage (always, regardless of returnUrl)
      sessionStorage.removeItem("contentStudioPreFill");
      sessionStorage.removeItem("contentStudioReturnUrl");

      // Redirect if we have a return URL
      if (returnUrl) {
        setTimeout(() => navigate(returnUrl), 1000); // Small delay to show toast
      }

    } catch (error: any) {
      toast({
        title: "❌ Update Failed",
        description: error.message || "Failed to update product",
        variant: "destructive"
      });
    }
  };

  // Check for duplicate products (Excel uploads only)
  const checkForDuplicates = async (productData: any) => {
    try {
      // Call duplicate detection API
      const response = await fetch("/api/products/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          vendor: productData.vendor,
          styleNumber: productData.metadata?.styleNumber,
          productName: productData.title,
          color: productData.metadata?.color,
          skus: productData.metadata?.skus || []
        })
      });

      if (!response.ok) {
        throw new Error("Failed to check for duplicates");
      }

      const result = await response.json();

      // Store pending product data and show duplicate dialog
      setPendingProductData(productData);
      setDuplicateDetectionResult(result);

      // If it's a new product (level 5), auto-proceed with creation
      if (result.level === 5) {
        saveProductMutation.mutate(productData);
      } else {
        // Show duplicate dialog for user decision
        setShowDuplicateDialog(true);
      }

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to check for duplicates",
        variant: "destructive"
      });
      // On error, proceed with creation as fallback
      saveProductMutation.mutate(productData);
    }
  };

  // Handle "Update Existing" action from duplicate dialog
  const handleDuplicateUpdate = async (existingProductId: string) => {
    try {
      if (!pendingProductData) {
        throw new Error("No product data to update");
      }

      // Update existing product via PUT
      const response = await fetch(`/api/products/${existingProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(pendingProductData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update product");
      }

      const updatedProduct = await response.json();

      // Close duplicate dialog
      setShowDuplicateDialog(false);
      setDuplicateDetectionResult(null);
      setPendingProductData(null);

      // Show success message
      toast({
        title: "✅ Product Updated",
        description: `"${updatedProduct.title}" has been updated with new data!`
      });

    } catch (error: any) {
      toast({
        title: "❌ Update Failed",
        description: error.message || "Failed to update product",
        variant: "destructive"
      });
    }
  };

  // Handle "Create New" action from duplicate dialog
  const handleDuplicateCreateNew = () => {
    if (!pendingProductData) {
      toast({
        title: "Error",
        description: "No product data to create",
        variant: "destructive"
      });
      return;
    }

    // Close duplicate dialog
    setShowDuplicateDialog(false);
    setDuplicateDetectionResult(null);

    // Proceed with creation
    saveProductMutation.mutate(pendingProductData);

    // Clear pending data
    setPendingProductData(null);
  };

  // Handle "Cancel" action from duplicate dialog
  const handleDuplicateCancel = () => {
    setShowDuplicateDialog(false);
    setDuplicateDetectionResult(null);
    setPendingProductData(null);
  };

  // Initialize product-specific state on mount
  useEffect(() => {
    // Set initial vendor (use session vendor if product vendor is empty/unknown)
    const vendorToUse = product.vendor || sessionVendor || '';
    setSelectedVendor(vendorToUse);

    // Set initial focus keyword
    setFocusKeyword(`${product.vendor} ${product.productName}`);

    // Set initial edited description
    setEditedDescription(product.description || '');
  }, []); // Only run on mount - component remounts when product changes due to key prop

  // Handle user selection from multi-match product selector
  const handleSelectProductMatch = (match: ProductMatch) => {

    if (!currentVendor) {
      toast({
        title: "Error",
        description: "No vendor selected",
        variant: "destructive"
      });
      return;
    }

    // Re-run enrichment with the selected product handle
    enrichProduct({
      vendorId: currentVendor.id,
      styleNumber: product.styleNumber,
      productName: product.productName,
      color: product.color,
      productHandle: match.handle
    });
  };

  return (
    <>
    <div className="space-y-6">
      {/* Keyword Research Panel (Top) - AI-powered with Gemini */}
      <div>
        <KeywordResearchPanel
          productName={product.productName}
          brand={selectedVendor}
          category={googleCategory?.name || product.category}
          googleCategory={googleCategory}
          description={product.description}
          material={(product as any).material || ''}
          color={product.color}
          onSelectKeyword={setFocusKeyword}
        />
      </div>

      {/* Main 3-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Product Info */}
        <div className="lg:col-span-1">
          <ProductInfoPanel
            product={product}
            googleCategory={googleCategory}
            onSelectCategory={setGoogleCategory}
            selectedVendor={selectedVendor}
            onSelectVendor={handleVendorSelect}
            editedDescription={editedDescription}
            onEditDescription={setEditedDescription}
            sessionVendorActive={!!sessionVendor && !product.vendor}
            enrichedData={enrichedData}
            enrichProduct={enrichProduct}
            isEnriching={isEnriching}
            clearEnrichment={clearEnrichment}
            layerProgress={layerProgress}
            vendors={vendors}
            currentVendor={currentVendor}
          />
        </div>

        {/* Middle Panel: AI Generator */}
        <div className="lg:col-span-1">
          <AIGeneratorPanel
            product={product}
            googleCategory={googleCategory}
            selectedVendor={selectedVendor}
            vendorId={currentVendor?.id || null}
            editedDescription={editedDescription}
            focusKeyword={focusKeyword}
            setFocusKeyword={setFocusKeyword}
            titleVariations={titleVariations}
            selectedTitleIndex={selectedTitleIndex}
            showTitleSelector={showTitleSelector}
            setTitleVariations={setTitleVariations}
            setSelectedTitleIndex={setSelectedTitleIndex}
            setShowTitleSelector={setShowTitleSelector}
            generatedTitle={generatedTitle}
            metaTitleVariations={metaTitleVariations}
            selectedMetaTitleIndex={selectedMetaTitleIndex}
            showMetaTitleSelector={showMetaTitleSelector}
            setMetaTitleVariations={setMetaTitleVariations}
            setSelectedMetaTitleIndex={setSelectedMetaTitleIndex}
            setShowMetaTitleSelector={setShowMetaTitleSelector}
            selectedMetaTitle={selectedMetaTitle}
            generatedDescription={generatedDescription}
            setGeneratedDescription={setGeneratedDescription}
            generatedKeywords={generatedKeywords}
            setGeneratedKeywords={setGeneratedKeywords}
            metaDescription={metaDescription}
            setMetaDescription={setMetaDescription}
            generatedMeta={generatedMeta}
            setGeneratedMeta={setGeneratedMeta}
            descriptionTone={descriptionTone}
            setDescriptionTone={setDescriptionTone}
            enrichedData={enrichedData}
            handleSaveProduct={handleSaveProduct}
            saveProductMutation={saveProductMutation}
            savedProductId={savedProductId}
          />
        </div>

        {/* Right Panel: SEO Analysis */}
        <div className="lg:col-span-1">
          <SEOAnalysisPanel
            product={product}
            title={generatedTitle}
            description={generatedDescription}
            metaDescription={generatedMeta?.metaDescription || ""}
            keyword={focusKeyword}
          />
        </div>
      </div>
    </div>

    {/* Product Match Selector Dialog */}
    <ProductMatchSelector
      multipleMatches={multipleMatches}
      onSelectMatch={handleSelectProductMatch}
      onClose={clearEnrichment}
      isEnriching={isEnriching}
    />

    {/* Comparison Dialog for Existing Products */}
    <Dialog open={showComparisonDialog} onOpenChange={setShowComparisonDialog}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Replace Existing Product Data?
          </DialogTitle>
          <DialogDescription>
            {originalProductId && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  Product ID: {originalProductId}
                </Badge>
                {comparisonData?.current?.styleNumber && (
                  <Badge variant="outline" className="text-xs">
                    Style #: {comparisonData.current.styleNumber}
                  </Badge>
                )}
              </div>
            )}
            <p className="mt-2">
              This product already exists in your database. Review the changes before replacing the saved data.
            </p>
          </DialogDescription>
        </DialogHeader>

        {comparisonData && (() => {
          // Calculate change statistics
          const fields = [
            { key: 'title', current: comparisonData.current.title, new: comparisonData.new.title },
            { key: 'description', current: comparisonData.current.description, new: comparisonData.new.description },
            { key: 'metaTitle', current: comparisonData.current.metaTitle, new: comparisonData.new.metaTitle },
            { key: 'metaDescription', current: comparisonData.current.metaDescription, new: comparisonData.new.metaDescription },
            { key: 'focusKeyword', current: comparisonData.current.focusKeyword, new: comparisonData.new.focusKeyword },
            { key: 'category', current: comparisonData.current.category, new: comparisonData.new.category },
            { key: 'vendor', current: comparisonData.current.vendor, new: comparisonData.new.vendor },
            { key: 'styleNumber', current: comparisonData.current.styleNumber, new: comparisonData.new.styleNumber }
          ];

          const changedFields = fields.filter(f => f.current !== f.new);
          const unchangedFields = fields.filter(f => f.current === f.new);

          return (
            <div className="py-4 space-y-4">
              {/* Summary Stats */}
              <div className="flex items-center gap-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    {changedFields.length} fields updated
                  </span>
                </div>
                <div className="text-sm text-blue-700">
                  {unchangedFields.length} unchanged
                </div>
              </div>

              {/* Warning Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-900">Warning: This action cannot be undone</p>
                    <p className="text-sm text-amber-700 mt-1">
                      This will permanently replace the saved product data with the new AI-generated content.
                      Make sure you want to proceed before confirming.
                    </p>
                  </div>
                </div>
              </div>

              {/* Vertical Comparison Cards */}
              <div className="space-y-3">
                <ComparisonCard
                  label="Title"
                  currentValue={comparisonData.current.title}
                  newValue={comparisonData.new.title}
                  changed={comparisonData.current.title !== comparisonData.new.title}
                />

                <ComparisonCard
                  label="Style Number"
                  currentValue={comparisonData.current.styleNumber}
                  newValue={comparisonData.new.styleNumber}
                  changed={comparisonData.current.styleNumber !== comparisonData.new.styleNumber}
                />

                <ComparisonCard
                  label="Description"
                  currentValue={comparisonData.current.description}
                  newValue={comparisonData.new.description}
                  changed={comparisonData.current.description !== comparisonData.new.description}
                  expandable={true}
                  stripHtml={true}
                />

                <ComparisonCard
                  label="Meta Title (SEO)"
                  currentValue={comparisonData.current.metaTitle}
                  newValue={comparisonData.new.metaTitle}
                  changed={comparisonData.current.metaTitle !== comparisonData.new.metaTitle}
                />

                <ComparisonCard
                  label="Meta Description (SEO)"
                  currentValue={comparisonData.current.metaDescription}
                  newValue={comparisonData.new.metaDescription}
                  changed={comparisonData.current.metaDescription !== comparisonData.new.metaDescription}
                  expandable={true}
                  expandThreshold={150}
                />

                <ComparisonCard
                  label="Focus Keyword"
                  currentValue={comparisonData.current.focusKeyword}
                  newValue={comparisonData.new.focusKeyword}
                  changed={comparisonData.current.focusKeyword !== comparisonData.new.focusKeyword}
                />

                <ComparisonCard
                  label="Category"
                  currentValue={comparisonData.current.category}
                  newValue={comparisonData.new.category}
                  changed={comparisonData.current.category !== comparisonData.new.category}
                />

                <ComparisonCard
                  label="Vendor"
                  currentValue={comparisonData.current.vendor}
                  newValue={comparisonData.new.vendor}
                  changed={comparisonData.current.vendor !== comparisonData.new.vendor}
                />
              </div>

              {/* Image Comparison Section */}
              {(() => {
                // Prefer uploaded media files over products.images column
                const uploadedImages: string[] = comparisonData.current.uploadedImages || [];
                const savedImages: string[] = comparisonData.current.images || [];
                const currentImages = uploadedImages.length > 0 ? uploadedImages : savedImages;
                const newImages: string[] = comparisonData.new.images || [];
                const hasUploaded = uploadedImages.length > 0;

                // Show whenever brand enrichment provided images
                if (newImages.length === 0 && currentImages.length === 0) return null;

                return (
                  <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-semibold text-purple-900">Images</span>
                        <Badge variant="outline" className="text-xs border-purple-300 text-purple-700">
                          {currentImages.length} {hasUploaded ? "uploaded" : "current"} → {newImages.length} from brand
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="keep-images-toggle"
                          className={`text-xs font-medium cursor-pointer ${keepOriginalImages ? "text-green-700" : "text-purple-700"}`}
                        >
                          {keepOriginalImages ? "Keeping original images" : "Replacing with brand images"}
                        </label>
                        <button
                          id="keep-images-toggle"
                          type="button"
                          role="switch"
                          aria-checked={keepOriginalImages}
                          onClick={() => setKeepOriginalImages(!keepOriginalImages)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            keepOriginalImages ? "bg-green-600" : "bg-purple-400"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                              keepOriginalImages ? "translate-x-4" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          {hasUploaded ? "Your Uploaded Images" : "Current Images"} ({currentImages.length})
                        </p>
                        <div className={`flex gap-1.5 flex-wrap rounded-md p-2 ${keepOriginalImages ? "ring-2 ring-green-500 bg-green-50" : "bg-white"}`}>
                          {currentImages.length > 0 ? currentImages.slice(0, 6).map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`Current ${i + 1}`}
                              className="h-16 w-16 object-cover rounded border"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )) : (
                            <p className="text-xs text-muted-foreground italic p-2">No images</p>
                          )}
                          {currentImages.length > 6 && (
                            <span className="text-xs text-muted-foreground self-end pb-1">+{currentImages.length - 6} more</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Brand Images ({newImages.length})
                        </p>
                        <div className={`flex gap-1.5 flex-wrap rounded-md p-2 ${!keepOriginalImages ? "ring-2 ring-purple-500 bg-purple-50" : "bg-white"}`}>
                          {newImages.slice(0, 6).map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt={`Brand ${i + 1}`}
                              className="h-16 w-16 object-cover rounded border"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ))}
                          {newImages.length > 6 && (
                            <span className="text-xs text-muted-foreground self-end pb-1">+{newImages.length - 6} more</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowComparisonDialog(false)}
          >
            Cancel - Keep Current Data
          </Button>
          <Button
            onClick={confirmReplacement}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Confirm - Replace with New Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Duplicate Detection Dialog (for Excel uploads) */}
    <ProductDuplicateDialog
      isOpen={showDuplicateDialog}
      result={duplicateDetectionResult}
      newProductName={generatedTitle}
      onUpdate={handleDuplicateUpdate}
      onCreateNew={handleDuplicateCreateNew}
      onCancel={handleDuplicateCancel}
    />
    </>
  );
}

// Product Info Panel (Left)
function ProductInfoPanel({
  product,
  googleCategory,
  onSelectCategory,
  selectedVendor,
  onSelectVendor,
  editedDescription,
  onEditDescription,
  sessionVendorActive = false,
  enrichedData,
  enrichProduct,
  isEnriching,
  clearEnrichment,
  layerProgress,
  vendors,
  currentVendor,
}: {
  product: ParsedProduct;
  googleCategory: GoogleCategory | null;
  onSelectCategory: (category: GoogleCategory) => void;
  selectedVendor: string;
  onSelectVendor: (vendor: string) => void;
  editedDescription: string;
  onEditDescription: (description: string) => void;
  sessionVendorActive?: boolean;
  enrichedData: any;
  enrichProduct: (params: any) => void;
  isEnriching: boolean;
  clearEnrichment: () => void;
  layerProgress: any;
  vendors: any;
  currentVendor: any;
}) {
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [tempDescription, setTempDescription] = useState(editedDescription);
  const { toast } = useToast();

  // Brand enrichment modal state
  const [brandWebsiteModalOpen, setBrandWebsiteModalOpen] = useState(false);

  // Handle product enrichment
  const handleEnrichProduct = (forceRefresh = false) => {
    if (!currentVendor) {
      toast({
        title: "Vendor Not Found",
        description: "Please select a vendor first",
        variant: "destructive",
      });
      return;
    }

    // Check if vendor has website configured
    if (!currentVendor.websiteUrl && currentVendor.hasWebsite) {
      setBrandWebsiteModalOpen(true);
      return;
    }

    if (!currentVendor.hasWebsite) {
      toast({
        title: "No Website",
        description: "This brand doesn't have a website configured",
        variant: "destructive",
      });
      return;
    }

    // Enrich the product
    enrichProduct({
      vendorId: currentVendor.id,
      styleNumber: product.styleNumber,
      productName: product.productName,
      color: product.color,
      forceRefresh
    });
  };

  const handleSelectCategory = (category: GoogleCategory) => {
    onSelectCategory(category);
    toast({
      title: "Shopify Category Mapped",
      description: `Mapped to: ${category.path}`,
    });
  };

  const handleSelectVendor = (vendor: string) => {
    onSelectVendor(vendor);
    setVendorModalOpen(false);
    toast({
      title: "Vendor Updated",
      description: `Product vendor changed to: ${vendor}`,
    });
  };

  const handleSaveDescription = () => {
    onEditDescription(tempDescription);
    setDescriptionModalOpen(false);
    toast({
      title: "Description Updated",
      description: "Product description has been updated for AI generation",
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Product Information</CardTitle>
          <CardDescription>Auto-populated from CSV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Product Image */}
          {product.imageUrl && (
            <div className="w-full">
              <label className="text-sm font-medium mb-2 block">Product Image</label>
              <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted border border-border">
                <img
                  src={product.imageUrl}
                  alt={product.productName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement!.innerHTML = '<div class="flex items-center justify-center h-full text-sm text-muted-foreground">Image failed to load</div>';
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Vendor/Brand</label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setVendorModalOpen(true)}
                className="h-7 text-xs"
              >
                <Store className="h-3 w-3 mr-1" />
                Select Vendor
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{product.vendor || 'Unknown (from file)'}</p>

            {/* Selected Vendor Display */}
            {selectedVendor && selectedVendor !== product.vendor && (
              <div className={`p-3 rounded-md border ${
                sessionVendorActive
                  ? 'bg-blue-50 dark:bg-blue-950 border-blue-500'
                  : 'bg-green-50 dark:bg-green-950 border-green-500'
              }`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold ${
                        sessionVendorActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {sessionVendorActive ? '🔗 Auto-Applied from Session' : '✓ Vendor Override'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{selectedVendor}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {sessionVendorActive
                        ? 'This vendor is being applied to all products without a vendor in this upload'
                        : `This vendor will be used instead of "${product.vendor || 'Unknown'}"`
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
            {selectedVendor && selectedVendor === product.vendor && (
              <div className="p-2 bg-muted/50 border border-muted rounded-md">
                <p className="text-xs text-muted-foreground">
                  ✓ Using vendor from file
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Product Name</label>
            <p className="text-sm text-muted-foreground">{product.productName}</p>
          </div>

          <div>
            <label className="text-sm font-medium">Style Number</label>
            <p className="text-sm text-muted-foreground">{product.styleNumber}</p>
          </div>

          <div>
            <label className="text-sm font-medium">Color</label>
            <p className="text-sm text-muted-foreground">{product.color || 'N/A'}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium">Shopify Category</label>
                <InfoTooltip
                  content={
                    <div className="space-y-2 text-xs">
                      <p className="font-semibold">What is Shopify Category?</p>
                      <p>Shopify's Standard Product Taxonomy - a standardized categorization system with 11,768+ categories.</p>

                      <p className="font-semibold mt-2">How it differs:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Product Type</strong>: Your internal organization (e.g., &quot;Men-Tops-T-Shirts&quot;)</li>
                        <li><strong>Shopify Category</strong>: Standardized e-commerce taxonomy (e.g., &quot;Shirts &gt; T-Shirts&quot;)</li>
                        <li><strong>Google Category</strong>: Simplified for Google Shopping ads (e.g., &quot;212 - Shirts &amp; Tops&quot;)</li>
                      </ul>

                      <p className="font-semibold mt-2">Why it matters:</p>
                      <p>Simprosys Google Shopping Feed reads this to auto-map products to Google Shopping categories, ensuring correct ad placement and targeting.</p>
                    </div>
                  }
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCategoryModalOpen(true)}
                className="h-7 text-xs"
              >
                <Tag className="h-3 w-3 mr-1" />
                Map Shopify Category
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              <span className="text-xs font-medium text-gray-500">Product Type: </span>
              {product.category}
            </p>

            {/* Shopify Category Display */}
            {googleCategory && (
              <div className="p-3 bg-primary/10 border border-primary rounded-md">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-primary">{googleCategory.name}</span>
                      <Badge variant="outline" className="text-xs">Level {googleCategory.level}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{googleCategory.path}</p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                </div>
              </div>
            )}
          </div>

        <div>
          <label className="text-sm font-medium">MSRP</label>
          <p className="text-sm text-muted-foreground">${product.msrp.toFixed(2)}</p>
        </div>

        {/* Vendor Description (from CSV) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Vendor Description</label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTempDescription(editedDescription);
                setDescriptionModalOpen(true);
              }}
              className="h-7 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Edit Description
            </Button>
          </div>
          {editedDescription ? (
            <div className="mt-2 p-3 bg-muted/50 rounded-md border border-muted">
              <div
                className="text-sm text-muted-foreground line-clamp-6 prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(editedDescription) }}
              />
            </div>
          ) : (
            <div className="mt-2 p-3 bg-muted/50 rounded-md border border-muted">
              <p className="text-sm text-muted-foreground italic">No description available - click "Edit Description" to add one</p>
            </div>
          )}
          {editedDescription !== product.description && editedDescription && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
              ✓ Manually edited - AI will use your custom description
            </p>
          )}
          {editedDescription === product.description && editedDescription && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              💡 Using vendor description from file - AI will use this as context
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Key Features ({product.features.length})</label>
          {product.features.length > 0 ? (
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mt-1">
              {product.features.slice(0, 5).map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic mt-1">No features extracted from description</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Sizes Available</label>
          <p className="text-sm text-muted-foreground">{product.sizes.join(', ')}</p>
        </div>

        {/* Brand Enrichment Section */}
        <div className="pt-3 border-t">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => handleEnrichProduct()}
              disabled={isEnriching || !currentVendor}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {isEnriching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Enrich from Brand Website
            </Button>

            {/* Force Refresh Button - shows when cached data exists */}
            {enrichedData && enrichedData.cached && !isEnriching && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEnrichProduct(true)}
                disabled={!currentVendor}
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
                title="Clear cache and re-select product"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
          {!currentVendor && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Select a vendor to enable enrichment
            </p>
          )}
          {enrichedData && enrichedData.cached && (
            <p className="text-xs text-orange-600 mt-2 text-center flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />
              Using cached data. Click refresh to rechoose product.
            </p>
          )}
        </div>

        {/* Display Real-Time Layer Progress */}
        {(isEnriching && layerProgress) && (
          <div className="pt-2">
            <LayerProgressIndicator layerProgress={layerProgress} isLoading={true} />
          </div>
        )}

        {/* Display Enriched Data */}
        {enrichedData && (
          <div className="pt-2">
            <EnrichedDataDisplay
              enrichedData={enrichedData}
              onRefresh={() => {
                clearEnrichment(); // Clear cached data immediately
                handleEnrichProduct(true); // Then start fresh enrichment
              }}
              onClear={clearEnrichment}
              isLoading={isEnriching}
            />
          </div>
        )}

        {/* Size Chart Section */}
        {currentVendor && (
          <div className="pt-3 border-t">
            <SizeChartDisplay
              vendorId={currentVendor.id}
              vendorName={currentVendor.name}
              category={googleCategory?.name || product.category}
              productName={product.productName}
              productDescription={product.description}
            />
          </div>
        )}
      </CardContent>
    </Card>

    {/* Shopify Category Mapper Modal */}
    <GoogleCategoryModal
      open={categoryModalOpen}
      onOpenChange={setCategoryModalOpen}
      onSelectCategory={handleSelectCategory}
      currentCategory={googleCategory}
    />

    {/* Vendor Selection Dialog */}
    <Dialog open={vendorModalOpen} onOpenChange={setVendorModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Vendor</DialogTitle>
          <DialogDescription>
            Choose the vendor for this product or add a new one
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <VendorSelect
            value={selectedVendor}
            onValueChange={handleSelectVendor}
          />
          {selectedVendor && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">Selected: {selectedVendor}</p>
              <p className="text-xs text-muted-foreground mt-1">
                This vendor will be used for keyword research and SEO content generation
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Description Editor Dialog */}
    <Dialog open={descriptionModalOpen} onOpenChange={setDescriptionModalOpen}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Edit Product Description</DialogTitle>
          <DialogDescription>
            Edit or add product description. The AI will use this for better content generation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="description-editor" className="text-sm font-medium mb-2 block">
              Product Description
            </Label>
            <Textarea
              id="description-editor"
              value={tempDescription}
              onChange={(e) => setTempDescription(e.target.value)}
              placeholder="Enter or paste product description here...&#10;&#10;Tip: Include details like:&#10;- Material and fabric details&#10;- Fit and sizing information&#10;- Care instructions&#10;- Key features and benefits&#10;- Style notes"
              className="min-h-[300px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {tempDescription.length} characters
            </p>
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTempDescription(editedDescription);
                setDescriptionModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDescription}
            >
              Save Description
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Brand Website Configuration Modal */}
    <BrandWebsiteModal
      isOpen={brandWebsiteModalOpen}
      onClose={() => setBrandWebsiteModalOpen(false)}
      brandName={selectedVendor || product.vendor}
      onSave={async (websiteUrl, hasWebsite) => {
        if (currentVendor) {
          // Update vendor with website URL
          const response = await fetch(`/api/vendors/${currentVendor.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ websiteUrl, hasWebsite })
          });

          if (!response.ok) {
            toast({
              title: "Failed to Save",
              description: "Could not update brand website",
              variant: "destructive",
            });
            return;
          }

          toast({
            title: "Website Configured",
            description: "Brand website has been saved",
          });

          setBrandWebsiteModalOpen(false);

          // If website was added, trigger enrichment
          if (websiteUrl && hasWebsite) {
            enrichProduct({
              vendorId: currentVendor.id,
              styleNumber: product.styleNumber,
              productName: product.productName,
              color: product.color
            });
          }
        }
      }}
    />
    </>
  );
}

// AI Generator Panel (Middle) - Full Implementation
interface AIGeneratorPanelProps {
  product: ParsedProduct;
  googleCategory: GoogleCategory | null;
  selectedVendor: string;
  vendorId: string | null; // Vendor ID for size chart lookup
  editedDescription: string;
  focusKeyword: string; // SEO focus keyword for Yoast
  setFocusKeyword: (keyword: string) => void; // Allow editing focus keyword
  // Title variation state (Phase 2)
  titleVariations: string[];
  selectedTitleIndex: number | null;
  showTitleSelector: boolean;
  setTitleVariations: (variations: string[]) => void;
  setSelectedTitleIndex: (index: number | null) => void;
  setShowTitleSelector: (show: boolean) => void;
  generatedTitle: string; // Computed value
  // Meta title variation state (NEW)
  metaTitleVariations: string[];
  selectedMetaTitleIndex: number | null;
  showMetaTitleSelector: boolean;
  setMetaTitleVariations: (variations: string[]) => void;
  setSelectedMetaTitleIndex: (index: number | null) => void;
  setShowMetaTitleSelector: (show: boolean) => void;
  selectedMetaTitle: string; // Computed value
  // Other generated content
  generatedDescription: string;
  setGeneratedDescription: (desc: string) => void;
  generatedKeywords: string[];
  setGeneratedKeywords: (keywords: string[]) => void;
  metaDescription: string;
  setMetaDescription: (desc: string) => void;
  generatedMeta: { metaTitle: string; metaDescription: string } | null;
  setGeneratedMeta: (meta: { metaTitle: string; metaDescription: string } | null) => void;
  enrichedData: any;
  // Tone selector for description
  descriptionTone: 'professional' | 'casual' | 'luxury';
  setDescriptionTone: (tone: 'professional' | 'casual' | 'luxury') => void;
  // Save functionality
  handleSaveProduct: () => Promise<void>;
  saveProductMutation: any; // UseMutationResult from React Query
  savedProductId: string | null;
}

function AIGeneratorPanel({
  product,
  googleCategory,
  selectedVendor,
  vendorId,
  editedDescription,
  focusKeyword,
  setFocusKeyword,
  titleVariations,
  selectedTitleIndex,
  showTitleSelector,
  setTitleVariations,
  setSelectedTitleIndex,
  setShowTitleSelector,
  generatedTitle,
  metaTitleVariations,
  selectedMetaTitleIndex,
  showMetaTitleSelector,
  setMetaTitleVariations,
  setSelectedMetaTitleIndex,
  setShowMetaTitleSelector,
  selectedMetaTitle,
  enrichedData,
  generatedDescription,
  setGeneratedDescription,
  generatedKeywords,
  setGeneratedKeywords,
  metaDescription,
  setMetaDescription,
  generatedMeta,
  setGeneratedMeta,
  descriptionTone,
  setDescriptionTone,
  handleSaveProduct,
  saveProductMutation,
  savedProductId
}: AIGeneratorPanelProps) {
  const { toast } = useToast();

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editedTitleValue, setEditedTitleValue] = React.useState('');

  // Meta title editing state
  const [isEditingMetaTitle, setIsEditingMetaTitle] = React.useState(false);
  const [editedMetaTitleValue, setEditedMetaTitleValue] = React.useState('');

  // API mutation for generating titles
  const generateTitleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName: product.productName,
          category: googleCategory?.name || product.category,
          brand: selectedVendor,
          color: product.color,
          price: product.msrp,
          keyFeatures: product.features,
          vendorDescription: product.description, // Full vendor description for context
          googleCategory: googleCategory, // Include full category object with gender
          imageUrl: product.imageUrl, // Include product image for visual analysis
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate titles");
      }

      const data = await response.json();
      return { titles: data.titles, provider: data.provider, fallback: data.fallback }; // Return titles + provider info
    },
    onSuccess: (result) => {
      const { titles, provider, fallback } = result;

      // Add brand website title as 6th option if available
      let allTitles = [...titles];
      if (enrichedData?.data?.brandProductTitle && enrichedData.data.scrapingSuccess) {
        allTitles.push(enrichedData.data.brandProductTitle);
      }

      setTitleVariations(allTitles);
      setShowTitleSelector(true);
      setSelectedTitleIndex(null); // Reset selection - user must choose

      // Show provider in toast notification
      const providerLabel = provider === 'claude' ? '🟣 Claude' : '🔵 Gemini';
      const fallbackNote = fallback ? ' (fallback)' : '';
      toast({
        title: `${allTitles.length} Titles Generated via ${providerLabel}${fallbackNote}`,
        description: enrichedData?.data?.brandProductTitle
          ? "5 AI-generated + 1 from brand website"
          : "Select your preferred variation below",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // API mutation for generating descriptions
  const generateDescriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName: product.productName,
          category: googleCategory?.name || product.category,
          brand: selectedVendor,
          price: product.msrp,
          keyFeatures: product.features,
          vendorDescription: product.description, // Full vendor description for context
          selectedTitle: generatedTitle, // Phase 4: Include selected SEO title
          targetKeyword: `${selectedVendor} ${product.productName}`,
          styleNumber: product.styleNumber,
          color: product.color,
          imageUrl: product.imageUrl, // Include product image for visual analysis
          tone: descriptionTone, // User-selected tone (professional/casual/luxury)
          // Brand enrichment data (from website scraping)
          enrichedData: enrichedData?.data ? {
            materialComposition: enrichedData.data.materialComposition,
            careInstructions: enrichedData.data.careInstructions,
            features: enrichedData.data.features,
            brandDescription: enrichedData.data.brandDescription,
          } : null,
          // Size chart data (vendor, category, sizes available)
          vendorId: vendorId || null,
          sizesAvailable: product.sizes || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate description");
      }

      const data = await response.json();
      return { description: data.description, provider: data.provider };
    },
    onSuccess: (result) => {
      const { description, provider } = result;
      setGeneratedDescription(description);
      const providerLabel = provider === 'claude' ? '🟣 Claude' : '🔵 Gemini';
      toast({
        title: `Description Generated via ${providerLabel}`,
        description: "SEO-optimized HTML description ready!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // API mutation for generating keywords
  const generateKeywordsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName: product.productName,
          category: googleCategory?.name || product.category,
          brand: selectedVendor,
          vendorDescription: product.description, // Full vendor description for context
          selectedTitle: generatedTitle, // Phase 4: Include selected SEO title
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate keywords");
      }

      const data = await response.json();
      return { keywords: data.keywords, provider: data.provider };
    },
    onSuccess: (result) => {
      const { keywords, provider } = result;
      setGeneratedKeywords(keywords);
      const providerLabel = provider === 'claude' ? '🟣 Claude' : '🔵 Gemini';
      toast({
        title: `Keywords Generated via ${providerLabel}`,
        description: `${keywords.length} SEO keywords ready!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // API mutation for generating meta tags
  const generateMetaMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ai/generate-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName: product.productName,
          category: googleCategory?.name || product.category,
          brand: selectedVendor,
          color: product.color,
          keyFeatures: product.features,
          vendorDescription: product.description, // Full vendor description for context
          selectedTitle: generatedTitle, // Phase 4: Include selected SEO title
          targetKeyword: focusKeyword, // Include focus keyword for Yoast SEO
          googleCategory: googleCategory, // Include full category object (with gender)
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate meta tags");
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data: { metaTitles: string[]; metaDescription: string }) => {
      // Set meta title variations (5 options)
      setMetaTitleVariations(data.metaTitles);
      setSelectedMetaTitleIndex(null); // Force user to select
      setShowMetaTitleSelector(true); // Show selector

      // Set meta description
      setMetaDescription(data.metaDescription);

      // Keep old format for backward compatibility (use first title as default)
      setGeneratedMeta({
        metaTitle: data.metaTitles[0] || '',
        metaDescription: data.metaDescription
      });

      toast({
        title: "Meta Tags Generated",
        description: `${data.metaTitles.length} meta title variations ready! Select one to continue.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-regenerate content when title changes (Phase 3)
  const previousTitleIndexRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    // Skip if no title is selected or this is the first selection
    if (selectedTitleIndex === null || previousTitleIndexRef.current === null) {
      previousTitleIndexRef.current = selectedTitleIndex;
      return;
    }

    // Only regenerate if the title actually changed
    if (previousTitleIndexRef.current !== selectedTitleIndex) {
      // Show initial notification
      toast({
        title: "Title Changed",
        description: "Auto-regenerating description, keywords, and meta tags...",
      });

      // Auto-regenerate description if it exists
      if (generatedDescription) {
        setTimeout(() => {
          generateDescriptionMutation.mutate();
        }, 500);
      }

      // Auto-regenerate keywords if they exist
      if (generatedKeywords.length > 0) {
        setTimeout(() => {
          generateKeywordsMutation.mutate();
        }, 1000);
      }

      // Auto-regenerate meta if it exists
      if (generatedMeta) {
        setTimeout(() => {
          generateMetaMutation.mutate();
        }, 1500);
      }

      // Update the previous title index
      previousTitleIndexRef.current = selectedTitleIndex;
    }
  }, [selectedTitleIndex, generatedDescription, generatedKeywords, generatedMeta, toast, generateDescriptionMutation, generateKeywordsMutation, generateMetaMutation]);

  // Copy to clipboard function with fallback
  const copyToClipboard = async (text: string, label: string) => {
    if (!text) {
      toast({
        title: "Nothing to Copy",
        description: `${label} is empty. Generate content first.`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Copied!",
          description: `${label} copied to clipboard`,
        });
      } else {
        // Fallback to older method
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          toast({
            title: "Copied!",
            description: `${label} copied to clipboard`,
          });
        } else {
          throw new Error("Copy command failed");
        }
      }
    } catch (error) {
      console.error("Copy failed:", error);
      toast({
        title: "Copy Failed",
        description: "Please select and copy manually (Ctrl+C or Cmd+C)",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">AI Content Generator</CardTitle>
        <CardDescription>Generate SEO-optimized content</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Focus Keyword Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="focus-keyword" className="text-sm font-semibold">Focus Keyword</Label>
            <InfoTooltip
              side="right"
              content={
                <div className="space-y-3">
                  <p className="font-semibold text-base">What is a Focus Keyword?</p>
                  <p>
                    The <strong>Focus Keyword</strong> is the ONE primary keyword or phrase that you want this product page to RANK for on Google search results.
                  </p>
                  <p className="font-semibold">Where Your Focus Keyword MUST Appear:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li><strong>Page Title (H1)</strong> - The main product title</li>
                    <li><strong>Meta Title</strong> - The SEO title shown in Google</li>
                    <li><strong>Meta Description</strong> - MUST be in the first sentence</li>
                    <li><strong>URL/Permalink</strong> - In the product URL</li>
                    <li><strong>First Paragraph</strong> - In the opening of your description</li>
                    <li><strong>Image Alt Text</strong> - For accessibility and SEO</li>
                    <li><strong>Product Title</strong> - In the actual product name</li>
                  </ol>
                  <p className="font-semibold">Yoast SEO Analysis:</p>
                  <p>
                    Yoast SEO checks if your focus keyword appears in all these critical locations. The more places it appears correctly, the better your Google ranking potential.
                  </p>
                  <p className="font-semibold">Examples:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Good:</strong> "eptm" or "eptm pants"</li>
                    <li><strong>Bad:</strong> Multiple keywords like "pants jeans trousers"</li>
                  </ul>
                  <p className="text-orange-500 font-semibold">⚠️ Important:</p>
                  <p>
                    Choose ONE focus keyword per product. Using multiple focus keywords dilutes your SEO efforts and confuses search engines.
                  </p>
                </div>
              }
            />
          </div>
          <Input
            id="focus-keyword"
            type="text"
            value={focusKeyword}
            onChange={(e) => setFocusKeyword(e.target.value)}
            placeholder="e.g., eptm or eptm pants"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            This keyword will be analyzed by Yoast SEO in the right panel
          </p>
        </div>

        {/* Product Title Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Product Title</h3>
            <Button
              size="sm"
              onClick={() => generateTitleMutation.mutate()}
              disabled={generateTitleMutation.isPending}
            >
              {generateTitleMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </div>

          {/* Title Variations Selector - Expanded View */}
          {showTitleSelector && titleVariations.length > 0 && (
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Select your preferred title variation:
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateTitleMutation.mutate()}
                  disabled={generateTitleMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Regenerate 5 New Titles
                </Button>
              </div>

              <div className="space-y-2">
                {titleVariations.map((title, index) => {
                  // Check if this is the brand website title (6th option)
                  const isBrandTitle = enrichedData?.data?.brandProductTitle &&
                    enrichedData.data.scrapingSuccess &&
                    index === titleVariations.length - 1 &&
                    title === enrichedData.data.brandProductTitle;

                  return (
                    <label
                      key={index}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/50 ${
                        selectedTitleIndex === index
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : isBrandTitle
                          ? 'border-green-500 bg-green-50 dark:bg-green-950'
                          : 'border-border'
                      }`}
                      onClick={() => {
                        setSelectedTitleIndex(index);
                        setShowTitleSelector(false); // Collapse after selection
                        toast({
                          title: "Title Selected",
                          description: isBrandTitle
                            ? "Using official brand website title"
                            : `Variation ${index + 1} is now active`,
                        });
                      }}
                    >
                      <input
                        type="radio"
                        name="title-variation"
                        checked={selectedTitleIndex === index}
                        onChange={() => {}}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm flex-1">{title}</p>
                          {isBrandTitle && (
                            <Badge className="bg-green-600 text-xs">Brand Website</Badge>
                          )}
                        </div>
                        <CharacterCounter
                          current={title.length}
                          min={55}
                          max={60}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              {selectedTitleIndex === null && (
                <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 p-2 rounded-md">
                  <span>⚠️</span>
                  <span>Please select a title variation to continue</span>
                </div>
              )}
            </div>
          )}

          {/* Title Variations Selector - Collapsed View (Read-Only or Edit Mode) */}
          {!showTitleSelector && generatedTitle && (
            <div className="space-y-2">
              <div className="relative">
                <Textarea
                  value={isEditingTitle ? editedTitleValue : generatedTitle}
                  readOnly={!isEditingTitle}
                  onChange={(e) => setEditedTitleValue(e.target.value)}
                  className={`pr-12 min-h-[60px] ${isEditingTitle ? 'border-primary ring-2 ring-primary/20' : ''}`}
                  placeholder="Edit your product title..."
                />
                {!isEditingTitle && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(generatedTitle, "Title")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Character Counter - Always Active */}
              <CharacterCounter
                current={isEditingTitle ? editedTitleValue.length : generatedTitle.length}
                min={55}
                max={60}
                label="Title"
              />

              {/* Action Buttons - Edit Mode or View Mode */}
              {isEditingTitle ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      // Save the edited title by updating the selected variation
                      if (selectedTitleIndex !== null && editedTitleValue.trim()) {
                        const updatedVariations = [...titleVariations];
                        updatedVariations[selectedTitleIndex] = editedTitleValue.trim();
                        setTitleVariations(updatedVariations);
                        setIsEditingTitle(false);
                        toast({
                          title: "Title Updated",
                          description: "Your manual edits have been saved",
                        });
                      }
                    }}
                    disabled={!editedTitleValue.trim()}
                  >
                    <CheckCircle className="mr-2 h-3 w-3" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setEditedTitleValue('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditedTitleValue(generatedTitle);
                      setIsEditingTitle(true);
                    }}
                  >
                    <FileText className="mr-2 h-3 w-3" />
                    Edit Title
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTitleSelector(true)}
                  >
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Change Title
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Description Section with Dual Tabs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Product Description</h3>
            <div className="flex items-center gap-2">
              {/* Tone Selector */}
              <select
                value={descriptionTone}
                onChange={(e) => setDescriptionTone(e.target.value as 'professional' | 'casual' | 'luxury')}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="luxury">Luxury</option>
              </select>
              <Button
                size="sm"
                onClick={() => generateDescriptionMutation.mutate()}
                disabled={generateDescriptionMutation.isPending}
              >
                {generateDescriptionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>

          {generatedDescription && (
            <Tabs defaultValue="preview" className="w-full">
              <div className="flex items-center justify-between mb-2">
                <TabsList>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                </TabsList>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => copyToClipboard(generatedDescription, "Description")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <TabsContent value="preview" className="mt-0">
                <div
                  className="prose prose-sm max-w-none p-4 border rounded-lg bg-muted/50 max-h-[400px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedDescription) }}
                />
              </TabsContent>

              <TabsContent value="html" className="mt-0">
                <pre className="p-4 border rounded-lg bg-muted/50 overflow-x-auto max-h-[400px] overflow-y-auto">
                  <code className="text-xs font-mono">{generatedDescription}</code>
                </pre>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* Product Tags (Keywords) Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Product Tags (Keywords)</h3>
              <InfoTooltip
                side="right"
                content={
                  <div className="space-y-3">
                    <p className="font-semibold text-base">What are Product Tags?</p>
                    <p>
                      Product Tags (also called Product Keywords) are multiple keyword phrases used for <strong>internal organization, filtering, and on-page content enrichment</strong> on your Shopify store.
                    </p>

                    <p className="font-semibold">How They're Different from Focus Keyword:</p>
                    <table className="text-xs border-collapse w-full mt-2">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-2">Element</th>
                          <th className="text-left py-1 pr-2">Count</th>
                          <th className="text-left py-1">Purpose</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="py-1 pr-2"><strong>Focus Keyword</strong></td>
                          <td className="py-1 pr-2">1</td>
                          <td className="py-1">Google ranking (title, meta, URL)</td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-2"><strong>Product Tags</strong></td>
                          <td className="py-1 pr-2">3-5</td>
                          <td className="py-1">Shopify tags, collections, filtering</td>
                        </tr>
                      </tbody>
                    </table>

                    <p className="font-semibold">Where Product Tags Are Used:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>Shopify Product Tags Field</strong> - For collection filtering</li>
                      <li><strong>Displayed on Product Page</strong> - If your theme shows them (adds crawlable content for Google)</li>
                      <li><strong>Internal Site Search</strong> - Helps customers find products</li>
                      <li><strong>Collection Filtering</strong> - URLs like /collections/pants/black-casual-pants</li>
                    </ul>

                    <p className="font-semibold text-green-600">✅ Optimal Count: 3-5 Tags (Green)</p>
                    <p className="text-xs ml-4">
                      3-5 tags provide the best balance between organization and SEO health. This reduces redundant pages and minimizes duplicate content issues.
                    </p>

                    <p className="font-semibold text-orange-500">⚠️ Acceptable: 6-7 Tags (Orange)</p>
                    <p className="text-xs ml-4">
                      6-7 tags are acceptable but starting to create too many auto-generated collection pages.
                    </p>

                    <p className="font-semibold text-red-600">❌ Harmful: 8+ Tags (Red)</p>
                    <p className="text-xs ml-4">
                      8 or more tags are harmful to SEO because they create too many thin content pages that waste Google's crawl budget.
                    </p>

                    <p className="font-semibold">2024 SEO Best Practices:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>Crawl Budget Waste:</strong> Every tag on a product in 8 collections creates 8 new pages. With 10 tags, that's 80 auto-generated pages that Google may never fully crawl.</li>
                      <li><strong>Thin Content:</strong> Auto-generated tag pages have no unique H1, meta description, or content - Google sees this as low quality.</li>
                      <li><strong>Keyword Stuffing Risk:</strong> If your theme displays all tags on the product page, too many can be flagged as keyword stuffing.</li>
                    </ul>

                    <p className="font-semibold">How to Choose the Right 5 Tags:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li><strong>Brand + Product Name</strong> (e.g., "eptm-freeway-pants")</li>
                      <li><strong>Style + Fit</strong> (e.g., "mens-baggy-pants")</li>
                      <li><strong>Color + Category</strong> (e.g., "black-casual-pants")</li>
                      <li><strong>Material</strong> (e.g., "nylon-ripstop-pants")</li>
                      <li><strong>Style Category</strong> (e.g., "streetwear-pants-men")</li>
                    </ol>

                    <p className="font-semibold">Format Rules:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>All lowercase</li>
                      <li>Hyphens for multi-word tags (e.g., "baggy-fit-pants")</li>
                      <li>No spaces or special characters</li>
                    </ul>
                  </div>
                }
              />
            </div>
            <Button
              size="sm"
              onClick={() => generateKeywordsMutation.mutate()}
              disabled={generateKeywordsMutation.isPending}
            >
              {generateKeywordsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </div>

          {generatedKeywords.length > 0 && (
            <div className="space-y-2">
              <div className="relative">
                <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/50">
                  {generatedKeywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={() => copyToClipboard(generatedKeywords.join(", "), "Keywords")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <CharacterCounter
                current={generatedKeywords.length}
                min={3}
                max={7}
                type="keywords"
                label="Product Tags"
              />
            </div>
          )}
        </div>

        {/* Meta Tags Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Meta Tags</h3>
            <Button
              size="sm"
              onClick={() => generateMetaMutation.mutate()}
              disabled={generateMetaMutation.isPending}
            >
              {generateMetaMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </div>

          {generatedMeta && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs font-medium text-muted-foreground">Meta Title</label>
                    <InfoTooltip
                      side="right"
                      content={
                        <div className="space-y-3">
                          <p className="font-semibold text-base">What is Meta Title?</p>
                          <p>
                            The <strong>Meta Title</strong> (also called SEO Title or Title Tag) is the clickable headline that appears in Google search results. It's one of the most important on-page SEO elements.
                          </p>

                          <p className="font-semibold">Where It Appears:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Google Search Results</strong> - The blue clickable link</li>
                            <li><strong>Browser Tab</strong> - The text shown in the tab</li>
                            <li><strong>Social Media Shares</strong> - When the page is shared on Facebook, Twitter, etc.</li>
                          </ul>

                          <p className="font-semibold text-green-600">✅ Optimal Length: 50-60 characters</p>
                          <p className="text-xs ml-4">
                            Google displays approximately 50-60 characters in search results. Anything longer gets truncated with "..."
                          </p>

                          <p className="font-semibold">What MUST Be Included:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li><strong>Brand Name</strong> - Must be in the FIRST 3 words (e.g., "EPTM")</li>
                            <li><strong>Focus Keyword</strong> - Your primary keyword for this product</li>
                            <li><strong>Gender</strong> - Men's, Women's, or Unisex (from Google Shopping category)</li>
                            <li><strong>Product Name</strong> - In Title Case (NOT ALL CAPS)</li>
                            <li><strong>Key Feature</strong> - Main attribute (e.g., "Baggy Fit")</li>
                            <li><strong>Color</strong> - Near the end, in Title Case (e.g., "Black")</li>
                          </ol>

                          <p className="font-semibold">Format Example:</p>
                          <p className="text-xs ml-4 bg-muted p-2 rounded">
                            <strong>Good:</strong> "EPTM Men's Freeway Pants - Baggy Fit - Black"<br/>
                            (Brand + Gender + Product + Feature + Color = 55 chars)
                          </p>

                          <p className="font-semibold">Why It Matters:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Click-Through Rate:</strong> A compelling meta title increases clicks from Google</li>
                            <li><strong>Google Ranking:</strong> Keywords in the meta title heavily influence search rankings</li>
                            <li><strong>User Expectations:</strong> It sets expectations for what the page is about</li>
                          </ul>

                          <p className="text-orange-500 font-semibold">⚠️ Common Mistakes:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                            <li>Using ALL CAPS (looks spammy in search results)</li>
                            <li>Exceeding 60 characters (gets cut off)</li>
                            <li>Missing the brand name or gender</li>
                            <li>Not including the focus keyword</li>
                          </ul>
                        </div>
                      }
                    />
                  </div>

                  {/* Meta Title Variations Selector - Expanded View */}
                  {showMetaTitleSelector && metaTitleVariations.length > 0 && (
                    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Select your preferred meta title variation:
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateMetaMutation.mutate()}
                          disabled={generateMetaMutation.isPending}
                        >
                          <RefreshCw className="mr-2 h-3 w-3" />
                          Regenerate 5 New Meta Titles
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {metaTitleVariations.map((title, index) => (
                          <label
                            key={index}
                            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/50 ${
                              selectedMetaTitleIndex === index
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-border'
                            }`}
                            onClick={() => {
                              setSelectedMetaTitleIndex(index);
                              setShowMetaTitleSelector(false); // Collapse after selection
                              toast({
                                title: "Meta Title Selected",
                                description: `Variation ${index + 1} is now active`,
                              });
                            }}
                          >
                            <input
                              type="radio"
                              name="meta-title-variation"
                              checked={selectedMetaTitleIndex === index}
                              onChange={() => {}}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-1">
                              <p className="text-sm">{title}</p>
                              <CharacterCounter
                                current={title.length}
                                min={50}
                                max={60}
                              />
                            </div>
                          </label>
                        ))}
                      </div>

                      {selectedMetaTitleIndex === null && (
                        <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 p-2 rounded-md">
                          <span>⚠️</span>
                          <span>Please select a meta title variation to continue</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Meta Title Variations Selector - Collapsed View (Read-Only or Edit Mode) */}
                  {!showMetaTitleSelector && selectedMetaTitle && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Textarea
                          value={isEditingMetaTitle ? editedMetaTitleValue : selectedMetaTitle}
                          readOnly={!isEditingMetaTitle}
                          onChange={(e) => setEditedMetaTitleValue(e.target.value)}
                          className={`pr-12 min-h-[50px] ${isEditingMetaTitle ? 'border-primary ring-2 ring-primary/20' : ''}`}
                          placeholder="Edit your meta title..."
                        />
                        {!isEditingMetaTitle && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-2 right-2"
                            onClick={() => copyToClipboard(selectedMetaTitle, "Meta Title")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Character Counter - Always Active */}
                      <CharacterCounter
                        current={isEditingMetaTitle ? editedMetaTitleValue.length : selectedMetaTitle.length}
                        min={50}
                        max={60}
                        label="Meta Title"
                      />

                      {/* Action Buttons - Edit Mode or View Mode */}
                      {isEditingMetaTitle ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              // Save the edited meta title by updating the selected variation
                              if (selectedMetaTitleIndex !== null && editedMetaTitleValue.trim()) {
                                const updatedVariations = [...metaTitleVariations];
                                updatedVariations[selectedMetaTitleIndex] = editedMetaTitleValue.trim();
                                setMetaTitleVariations(updatedVariations);
                                setIsEditingMetaTitle(false);
                                toast({
                                  title: "Meta Title Updated",
                                  description: "Your manual edits have been saved",
                                });
                              }
                            }}
                            disabled={!editedMetaTitleValue.trim()}
                          >
                            <CheckCircle className="mr-2 h-3 w-3" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setIsEditingMetaTitle(false);
                              setEditedMetaTitleValue('');
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditedMetaTitleValue(selectedMetaTitle);
                              setIsEditingMetaTitle(true);
                            }}
                          >
                            <FileText className="mr-2 h-3 w-3" />
                            Edit Meta Title
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowMetaTitleSelector(true)}
                          >
                            <RefreshCw className="mr-2 h-3 w-3" />
                            Change Meta Title
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs font-medium text-muted-foreground">Meta Description</label>
                    <InfoTooltip
                      side="right"
                      content={
                        <div className="space-y-3">
                          <p className="font-semibold text-base">What is Meta Description?</p>
                          <p>
                            The <strong>Meta Description</strong> is the short summary text that appears below the meta title in Google search results. It's your "sales pitch" to convince users to click your link instead of competitors.
                          </p>

                          <p className="font-semibold">Where It Appears:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Google Search Results</strong> - The gray text below the blue title link</li>
                            <li><strong>Social Media Shares</strong> - When the page is shared (if no specific social meta tags)</li>
                          </ul>

                          <p className="font-semibold text-green-600">✅ Optimal Length: 130-150 characters</p>
                          <p className="text-xs ml-4">
                            Google displays approximately 130-150 characters (155 max). Keep it under 145 characters to avoid truncation.
                          </p>

                          <p className="font-semibold">What MUST Be Included (Yoast Requirements):</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li><strong>Focus Keyword</strong> - MUST appear in the FIRST SENTENCE (Yoast checks this!)</li>
                            <li><strong>Product Name or Brand</strong> - In the first 10 words</li>
                            <li><strong>One Main Benefit</strong> - What makes this product special?</li>
                            <li><strong>One Call-to-Action</strong> - "Shop now", "Buy today", "Get yours", "Discover", etc.</li>
                            <li><strong>Color</strong> - If relevant, mention in Title Case (e.g., "Black")</li>
                          </ol>

                          <p className="font-semibold">Format Example:</p>
                          <p className="text-xs ml-4 bg-muted p-2 rounded">
                            <strong>Good:</strong> "EPTM Freeway Pants offer a perfect baggy fit with 3M reflective details. Shop now and get yours in Black today!"<br/>
                            (Focus keyword "EPTM" + benefit + CTA + color = 142 chars)
                          </p>

                          <p className="font-semibold">Why It Matters:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Click-Through Rate:</strong> A compelling meta description increases clicks by 5-10%</li>
                            <li><strong>Yoast SEO Score:</strong> Missing focus keyword = Red flag</li>
                            <li><strong>Search Intent:</strong> Tells users if this page matches what they're looking for</li>
                          </ul>

                          <p className="text-red-600 font-semibold">❌ Critical Error:</p>
                          <p className="text-xs ml-4">
                            If your focus keyword does NOT appear in the meta description, Yoast will show a RED flag for "Keyword in Meta Description" and your SEO score will drop significantly.
                          </p>

                          <p className="text-orange-500 font-semibold">⚠️ Common Mistakes:</p>
                          <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                            <li>Exceeding 150 characters (gets cut off with "...")</li>
                            <li>NOT including the focus keyword (Yoast red flag)</li>
                            <li>Using ALL CAPS or keyword stuffing</li>
                            <li>No call-to-action (lower click-through rate)</li>
                            <li>Using Title Case for every word (use sentence case)</li>
                          </ul>

                          <p className="font-semibold">Capitalization Rule:</p>
                          <p className="text-xs ml-4">
                            <strong>Use sentence case</strong> (normal capitalization), NOT Title Case For Every Word.
                          </p>
                        </div>
                      }
                    />
                  </div>
                  <Textarea
                    value={generatedMeta.metaDescription}
                    readOnly
                    className="pr-12 min-h-[70px]"
                  />
                  <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-7 right-2"
                  onClick={() => copyToClipboard(generatedMeta.metaDescription, "Meta Description")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <CharacterCounter
                current={generatedMeta.metaDescription.length}
                min={120}
                max={156}
                label="Meta Description"
              />
            </div>
            </div>
          )}
        </div>

        {/* Save Product Section */}
        <div className="pt-6 border-t">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Save Product</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Save this product as a local draft before publishing to Shopify
              </p>
            </div>

            <Button
              onClick={handleSaveProduct}
              disabled={saveProductMutation.isPending || !generatedTitle || !selectedVendor}
              className="w-full"
              size="lg"
            >
              {saveProductMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : savedProductId ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved (ID: {savedProductId.substring(0, 8)}...)
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Save as Local Draft
                </>
              )}
            </Button>

            {/* Validation Messages */}
            {!generatedTitle && !saveProductMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <span className="font-medium">⚠️</span>
                <span>Please generate a product title first</span>
              </div>
            )}
            {!selectedVendor && !saveProductMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <span className="font-medium">⚠️</span>
                <span>Please select a vendor</span>
              </div>
            )}
            {savedProductId && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span>Product saved successfully! You can continue editing or move to the next product.</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// SEO Analysis Panel (Right) - Full Yoast Integration
interface SEOAnalysisPanelProps {
  product: ParsedProduct;
  title: string;
  description: string;
  metaDescription: string;
  keyword: string;
}

function SEOAnalysisPanel({ product, title, description, metaDescription, keyword }: SEOAnalysisPanelProps) {
  const { analyze, analyzing, result } = useYoastAnalysis();

  // Analyze content whenever it changes - triggers automatically when any content is regenerated
  // Note: Component remounts when product changes (due to key prop), so analysis resets automatically
  useEffect(() => {
    if (title && description && metaDescription) {
      // Re-analyze immediately when content changes
      analyze({
        title,
        metaDescription,
        description, // Pass HTML directly - analyzer handles HTML parsing internally
        keyword
      });
    }
  }, [title, description, metaDescription, keyword]); // Removed 'analyze' to prevent infinite loops

  // No content yet
  if (!title && !description && !metaDescription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Yoast SEO Analysis</CardTitle>
          <CardDescription>Real-time SEO scoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚪</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Generate content to see SEO analysis
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Real-time Yoast scoring with traffic lights
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Analyzing...
  if (analyzing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Yoast SEO Analysis</CardTitle>
          <CardDescription>Analyzing content...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Running SEO analysis...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Display results
  if (!result) return null;

  const seoChecks = result.checks.filter(c => c.category === 'seo');
  const readabilityChecks = result.checks.filter(c => c.category === 'readability');

  const getScoreColor = (score: 'red' | 'orange' | 'green') => {
    switch (score) {
      case 'green': return 'text-green-600';
      case 'orange': return 'text-orange-500';
      case 'red': return 'text-red-600';
    }
  };

  const getScoreIcon = (score: 'red' | 'orange' | 'green') => {
    switch (score) {
      case 'green': return '🟢';
      case 'orange': return '🟠';
      case 'red': return '🔴';
    }
  };

  const getScoreBg = (score: 'red' | 'orange' | 'green') => {
    switch (score) {
      case 'green': return 'bg-green-50 border-green-200';
      case 'orange': return 'bg-orange-50 border-orange-200';
      case 'red': return 'bg-red-50 border-red-200';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Yoast SEO Analysis</CardTitle>
            <CardDescription>Real-time SEO scoring</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              analyze({
                title,
                metaDescription,
                description,
                keyword
              });
            }}
            disabled={analyzing}
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Re-analyze
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className={`p-4 rounded-lg border-2 ${getScoreBg(result.overallScore)}`}>
          <div className="text-center">
            <div className="text-4xl mb-2">
              {getScoreIcon(result.overallScore)}
            </div>
            <h3 className={`text-lg font-bold ${getScoreColor(result.overallScore)}`}>
              {result.overallScore === 'green' ? 'GOOD' : result.overallScore === 'orange' ? 'OK' : 'NEEDS WORK'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Overall Score: {Math.round((result.seoScore + result.readabilityScore) / 2)}/100
            </p>
          </div>
        </div>

        {/* SEO Checks */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center justify-between">
            <span>SEO Checks</span>
            <span className="text-xs text-muted-foreground">
              {seoChecks.filter(c => c.score === 'green').length}/{seoChecks.length}
            </span>
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {seoChecks.map((check) => (
              <div key={check.id} className="p-3 border rounded-lg bg-muted/30 text-sm">
                <div className="flex items-start space-x-2">
                  <span className="text-lg leading-none">{getScoreIcon(check.score)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs mb-1">{check.name}</p>
                    <p className="text-xs text-muted-foreground">{check.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Readability Checks */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center justify-between">
            <span>Readability</span>
            <span className="text-xs text-muted-foreground">
              {readabilityChecks.filter(c => c.score === 'green').length}/{readabilityChecks.length}
            </span>
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {readabilityChecks.map((check) => (
              <div key={check.id} className="p-3 border rounded-lg bg-muted/30 text-sm">
                <div className="flex items-start space-x-2">
                  <span className="text-lg leading-none">{getScoreIcon(check.score)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs mb-1">{check.name}</p>
                    <p className="text-xs text-muted-foreground">{check.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
