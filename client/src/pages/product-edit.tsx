import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productFormSchema, type ProductFormData } from "@shared/schemas/product-form.schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sanitizeHtml } from "@/lib/sanitize";
import { useRoute, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { CategorySelector } from "@/components/ui/category-selector";
import { CollectionSelector } from "@/components/ui/collection-selector";
import { VendorSelector } from "@/components/ui/vendor-selector";
import { ProductTypeSelector } from "@/components/ui/product-type-selector";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Loader2,
  Save,
  Sparkles,
  Code,
  Type,
  Bold,
  Italic,
  List,
  ListOrdered,
  X,
  Image as ImageIcon,
  Wand2,
  Table,
  Plus,
  Underline,
  Strikethrough,
  Link2,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Heading3,
  RefreshCw,
  Upload,
} from "lucide-react";
import { UnifiedVariantsCard } from "@/components/variants";
import { FilePicker } from "@/components/files/FilePicker";
import { BulletPointEditor } from "@/components/BulletPointEditor";
import { ImageDetailModal } from "@/components/image-detail-modal";
import { useYoastAnalysis } from "@/hooks/useYoastAnalysis";
import {
  generateHandle as generateHandleUtil,
  validateHandleDetailed,
  suggestShorterHandle,
  MAX_HANDLE_LENGTH,
  type HandleValidationResult
} from "@/lib/handle-utils";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function ProductEditPage() {
  const [, params] = useRoute("/products/:id/edit");
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const productId = params?.id;

  // Check if this is a new product (route is /products/new)
  const isNewProduct = location === '/products/new';

  // Fetch tenant store URL for product URL preview
  const { data: tenantInfo } = useQuery<{ shopifyStoreUrl: string | null; subdomain: string }>({
    queryKey: ["/api/tenant/info"],
    queryFn: async () => {
      const response = await fetch("/api/tenant/info", { credentials: "include" });
      if (!response.ok) return { shopifyStoreUrl: null, subdomain: "" };
      return response.json();
    },
  });
  const storeBaseUrl = tenantInfo?.shopifyStoreUrl
    ? `https://${tenantInfo.shopifyStoreUrl.replace(/^https?:\/\//, '')}`
    : tenantInfo?.subdomain
      ? `https://${tenantInfo.subdomain}.myshopify.com`
      : null;

  // Fetch product data with variants and options
  const { data: product, isLoading, error } = useQuery({
    queryKey: [`/api/products/${productId}`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch product");
      }
      return response.json();
    },
    enabled: !!productId && !isNewProduct,
  });

  // Fetch product's current collections
  const { data: productCollections } = useQuery({
    queryKey: [`/api/products/${productId}/collections`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/collections`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch product collections");
      }
      return response.json();
    },
    enabled: !!productId && !isNewProduct,
  });

  // Description HTML mode toggle
  const [isHtmlMode, setIsHtmlMode] = useState(false);

  // Content Studio warning dialog state
  const [showContentStudioWarning, setShowContentStudioWarning] = useState(false);

  // Sync from Shopify warning dialog state
  const [showSyncWarning, setShowSyncWarning] = useState(false);

  // Update confirmation dialog state
  const [showUpdateConfirmation, setShowUpdateConfirmation] = useState(false);

  // Handle publish/update button click
  const handlePublishClick = () => {
    // If product is already published, show confirmation dialog
    if (product?.publishStatus === "published") {
      setShowUpdateConfirmation(true);
    } else {
      // If not published, directly publish
      publishToShopifyMutation.mutate();
    }
  };

  // Confirm update after user agrees
  const confirmUpdate = () => {
    setShowUpdateConfirmation(false);
    publishToShopifyMutation.mutate();
  };

  // Publish to Shopify mutation
  const publishToShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/products/${productId}/publish-to-shopify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ publishAsActive: form.getValues("status") === 'active' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to publish product");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh product data
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });

      toast({
        title: data.isUpdate ? "✅ Product Updated on Shopify" : "✅ Product Published to Shopify",
        description: data.message || (data.isUpdate ? "Product successfully updated on Shopify" : "Product successfully published to Shopify"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Publish Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Media state
  const [images, setImages] = useState<string[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // Image detail modal state (replaces inline alt text editing)
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    altText?: string;
    index: number;
  } | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [localAltTexts, setLocalAltTexts] = useState<Record<string, string>>({});

  // Accessibility: Image reorder announcements for screen readers (WCAG 2.1.1)
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');

  // Accessibility: Refs for focus management after modal close (WCAG 2.4.3)
  const contentStudioTriggerRef = useRef<HTMLButtonElement>(null);
  const syncTriggerRef = useRef<HTMLButtonElement>(null);
  const publishTriggerRef = useRef<HTMLButtonElement>(null);
  const filePickerTriggerRef = useRef<HTMLButtonElement>(null);

  // Accessibility: Form validation error announcements (WCAG 3.3.1)
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Tags state (array instead of comma-separated string)
  const [tags, setTags] = useState<string[]>([]);

  // Collections state (array of collection IDs)
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [originalCollectionIds, setOriginalCollectionIds] = useState<string[]>([]);

  // Shopify Category state (Shopify Standard Product Taxonomy)
  const [shopifyCategoryId, setShopifyCategoryId] = useState<string>("");
  const [shopifyCategoryPath, setShopifyCategoryPath] = useState<string>("");

  // Bullet Points / Sales Points state (array of up to 5 bullet points)
  const [bulletPoints, setBulletPoints] = useState<string[]>([]);
  const [isGeneratingBulletPoints, setIsGeneratingBulletPoints] = useState(false);

  // Track whether user has manually edited the handle
  const [handleManuallyEdited, setHandleManuallyEdited] = useState(false);

  // Form state managed by react-hook-form
  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      title: "",
      description: "",
      styleNumber: "",
      vendor: "",
      category: "",
      productType: "",
      tags: "",
      status: "local_draft",
      handle: "",
      metaTitle: "",
      metaDescription: "",
      focusKeyword: "",
    },
  });

  // Watch all form values for reactive rendering
  const formData = form.watch();

  // Yoast SEO Analysis
  const { analyze, analyzing: analyzingYoast, result: yoastResult } = useYoastAnalysis();
  const [seoOpen, setSeoOpen] = useState(true);
  const [readabilityOpen, setReadabilityOpen] = useState(true);

  // Initialize form data when product loads
  useEffect(() => {
    if (product) {
      form.reset({
        title: product.title || "",
        description: product.description || "",
        styleNumber: product.styleNumber || "",
        vendor: product.vendor || "",
        category: product.category || "",
        productType: product.productType || "",
        tags: product.tags || "",
        status: product.status || "local_draft",
        handle: product.handle || "",
        metaTitle: product.metaTitle || "",
        metaDescription: product.metaDescription || "",
        focusKeyword: product.focusKeyword || "",
      });
      // Existing products already have a handle - don't auto-overwrite on title edit
      if (product.handle) {
        setHandleManuallyEdited(true);
      }
      // Initialize images
      if (product.images && Array.isArray(product.images)) {
        setImages(product.images);
      }
      // Initialize tags (convert comma-separated string to array)
      if (product.tags) {
        const tagsArray = product.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag);
        setTags(tagsArray);
      }
      // Initialize Shopify category
      if (product.shopifyCategoryId) {
        setShopifyCategoryId(product.shopifyCategoryId);
      }
      if (product.shopifyCategoryPath) {
        setShopifyCategoryPath(product.shopifyCategoryPath);
      }
      // Initialize bullet points / sales points
      if (product.bulletPoints && Array.isArray(product.bulletPoints)) {
        setBulletPoints(product.bulletPoints);
      }
    }
  }, [product]);

  // Initialize collections from API
  useEffect(() => {
    if (productCollections && Array.isArray(productCollections)) {
      const ids = productCollections.map((c: any) => c.id);
      setCollectionIds(ids);
      setOriginalCollectionIds(ids);
    }
  }, [productCollections]);

  // Auto-analyze content for Yoast SEO when relevant fields change
  useEffect(() => {
    // Only analyze if we have minimum content
    const hasMinimumContent = formData.title || formData.description;
    if (!hasMinimumContent) return;

    // Debounce: wait 1 second after user stops typing
    const timeoutId = setTimeout(() => {
      analyze({
        title: formData.title || "",
        metaDescription: formData.metaDescription || "",
        description: formData.description || "",
        keyword: formData.focusKeyword || "",
        slug: formData.handle || "",
      });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [formData.title, formData.description, formData.metaDescription, formData.focusKeyword, formData.handle, analyze]);

  // Update form field
  const handleChange = (field: keyof ProductFormData, value: string) => {
    form.setValue(field, value, { shouldDirty: true });

    // Auto-generate handle from title (only if handle hasn't been manually edited)
    if (field === "title" && !handleManuallyEdited) {
      const autoHandle = generateHandle(value);
      form.setValue("handle", autoHandle, { shouldDirty: true });
    }

    // Track manual handle edits
    if (field === "handle") {
      setHandleManuallyEdited(true);
    }
  };

  // Content Studio navigation handler
  const handleCreateInContentStudio = () => {
    const currentValues = form.getValues();

    // Flow 1: Empty form → Direct navigation
    const isEmpty = !currentValues.title && !currentValues.vendor;

    if (isEmpty) {
      navigate("/content-studio");
      return;
    }

    // Flow 2: Has data → Validate required fields
    const missingFields = [];
    if (!currentValues.title) missingFields.push("Title");
    if (!currentValues.vendor) missingFields.push("Vendor");
    if (!currentValues.styleNumber) missingFields.push("Style Number");

    if (missingFields.length > 0) {
      toast({
        title: "Missing Required Fields",
        description: `Please fill: ${missingFields.join(", ")} before using Content Studio`,
        variant: "destructive"
      });
      return;
    }

    // Show warning dialog
    setShowContentStudioWarning(true);
  };

  const proceedToContentStudio = () => {
    const currentValues = form.getValues();

    // Get price from first variant (typically all variants have same MSRP)
    const variantPrice = product?.variants?.[0]?.price || "0";

    // Extract color from product options (find the Color option and take its first value)
    const colorOption = product?.options?.find((o: any) => o.name?.toLowerCase() === "color");
    const extractedColor = colorOption?.values?.[0] || product?.variants?.[0]?.option1 || "";

    // Clean product name: Strip brand, gender, and color if already included
    // This prevents duplication in AI generation (e.g., "Ethika Men's Ethika Men Skeert Off...")
    let cleanProductName = currentValues.title;

    // Remove brand name from the beginning if present
    if (currentValues.vendor) {
      const brandPattern = new RegExp(`^${currentValues.vendor}\\s+`, 'i');
      cleanProductName = cleanProductName.replace(brandPattern, '').trim();
    }

    // Remove gender indicators (Men, Women, Men's, Women's, Mens, Womens) from the start
    const genderPattern = /^(Men'?s?|Women'?s?|Unisex)\s+/i;
    cleanProductName = cleanProductName.replace(genderPattern, '').trim();

    // Remove color from product name if it's in parentheses or at the end
    // Examples: "Product (black grey blue)" → "Product" or "Product - Black" → "Product"
    cleanProductName = cleanProductName.replace(/\s*[\(\-]\s*[a-z\s]+[\)]*\s*$/i, '').trim();

    // Prepare data for Content Studio
    const contentStudioData = {
      productId: productId || null,
      productName: cleanProductName, // Use cleaned name without brand/gender/color
      vendor: currentValues.vendor,
      category: currentValues.category || shopifyCategoryPath?.split(" > ").pop() || "",
      description: currentValues.description || "",
      images: images || [],
      productType: currentValues.productType || "",
      tags: tags || [],
      styleNumber: currentValues.styleNumber || "",
      price: variantPrice, // Add price from variants
      color: extractedColor, // Pass extracted color separately
      shopifyCategoryId: shopifyCategoryId || "",
      shopifyCategoryPath: shopifyCategoryPath || "",
    };

    // Store in sessionStorage
    sessionStorage.setItem("contentStudioPreFill", JSON.stringify(contentStudioData));
    sessionStorage.setItem("contentStudioReturnUrl", window.location.pathname);

    // Navigate
    navigate("/content-studio?source=manual");

    setShowContentStudioWarning(false);
  };

  // Handle generating alt text with AI (Gemini Vision)
  const handleGenerateAltText = async (imageUrl: string): Promise<string> => {
    const response = await fetch(`/api/products/${productId || 'new'}/images/generate-alt-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        imageUrl,
        productTitle: form.getValues("title"),
        brandName: form.getValues("vendor"),
        category: form.getValues("category"),
        imagePosition: selectedImage?.index === 0 ? 1 : (selectedImage?.index || 0) + 1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate alt text');
    }

    const data = await response.json();
    return data.altText;
  };

  // Handle saving alt text from the modal
  const handleSaveAltText = async (altText: string): Promise<void> => {
    if (!selectedImage) return;

    // Store locally (will be used when displaying and can be saved with product)
    setLocalAltTexts(prev => ({
      ...prev,
      [selectedImage.url]: altText,
    }));

    toast({
      title: "Alt text saved",
      description: "The alt text has been updated.",
    });
  };

  // Handle opening the image detail modal
  const handleImageClick = (imageUrl: string, index: number) => {
    setSelectedImage({
      url: imageUrl,
      altText: localAltTexts[imageUrl] || '',
      index,
    });
    setIsImageModalOpen(true);
  };

  // Save product mutation
  // Use shared handle generation utility (does NOT auto-truncate - user should be warned)
  const generateHandle = generateHandleUtil;

  const saveMutation = useMutation({
    mutationFn: async () => {
      // NEW PRODUCT: Create via POST
      if (isNewProduct) {
        const values = form.getValues();

        // Validate required fields
        if (!values.title || !values.vendor) {
          throw new Error("Title and Vendor are required to create a product");
        }

        // Generate handle from title if not provided
        const handle = values.handle || generateHandle(values.title);

        // Validate handle before sending to API
        const handleValidation = validateHandleDetailed(handle);
        if (!handleValidation.isValid) {
          // Build a user-friendly error message
          const errorLines = [
            `Product URL (handle) is invalid:`,
            ...handleValidation.errors,
            ``,
            `How to fix:`,
            ...handleValidation.suggestions
          ];
          throw new Error(errorLines.join('\n'));
        }

        const createResponse = await fetch('/api/products/content-studio', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...values,
            handle,
            images: images,
            tags: tags.join(', '),
            collections: "",
            shopifyCategoryId: shopifyCategoryId || null,
            shopifyCategoryPath: shopifyCategoryPath || null,
            bulletPoints: bulletPoints, // Include bullet points
          }),
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.message || "Failed to create product");
        }

        const newProduct = await createResponse.json();
        return { product: newProduct, isNew: true, collectionFailures: [] };
      }

      // EXISTING PRODUCT: Update via PATCH
      const values = form.getValues();
      // 1. Save product data (without collections in body - handled separately)
      const productResponse = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...values,
          images: images,
          tags: tags.join(', '),
          collections: "", // Keep empty for backward compatibility
          shopifyCategoryId: shopifyCategoryId || null,
          shopifyCategoryPath: shopifyCategoryPath || null,
          bulletPoints: bulletPoints, // Include bullet points
        }),
      });
      if (!productResponse.ok) {
        const error = await productResponse.json();
        throw new Error(error.message || "Failed to save product");
      }

      // 2. Sync collections using join table
      const collectionsToAdd = collectionIds.filter(id => !originalCollectionIds.includes(id));
      const collectionsToRemove = originalCollectionIds.filter(id => !collectionIds.includes(id));

      const failures: string[] = [];

      // Add product to new collections
      for (const collectionId of collectionsToAdd) {
        try {
          const addResponse = await fetch(`/api/collections/${collectionId}/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ productIds: [productId] }),
          });
          if (!addResponse.ok) {
            failures.push(`Failed to add to collection ${collectionId}`);
          }
        } catch (error) {
          failures.push(`Error adding to collection ${collectionId}`);
        }
      }

      // Remove product from removed collections
      for (const collectionId of collectionsToRemove) {
        try {
          const removeResponse = await fetch(`/api/collections/${collectionId}/products`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ productIds: [productId] }),
          });
          if (!removeResponse.ok) {
            failures.push(`Failed to remove from collection ${collectionId}`);
          }
        } catch (error) {
          failures.push(`Error removing from collection ${collectionId}`);
        }
      }

      // Update original collection IDs to current selection
      setOriginalCollectionIds(collectionIds);

      const result = await productResponse.json();

      // Return result with failure info
      return { ...result, isNew: false, collectionFailures: failures };
    },
    onSuccess: (data: any) => {
      // Handle new product creation - redirect to edit page
      if (data.isNew && data.product?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });

        toast({
          title: "Product Created",
          description: "Product created successfully. Redirecting to edit page...",
        });

        // Redirect to the edit page for the newly created product
        setTimeout(() => {
          navigate(`/products/${data.product.id}/edit`);
        }, 500);
        return;
      }

      // Handle existing product update
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/collections`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });

      if (data.collectionFailures && data.collectionFailures.length > 0) {
        toast({
          title: "Product Saved with Warnings",
          description: `Product saved, but ${data.collectionFailures.length} collection operation(s) failed. Please try again.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Product Saved",
          description: "Product and collections updated successfully.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle save with validation and accessible error announcements
  const handleSave = async () => {
    // Trigger react-hook-form validation (Zod schema)
    const isValid = await form.trigger();

    if (!isValid) {
      const rhfErrors = Object.values(form.formState.errors)
        .map(e => e?.message || "Validation error")
        .filter(Boolean) as string[];
      setValidationErrors(rhfErrors);
      toast({
        title: "Validation Error",
        description: rhfErrors.join('. '),
        variant: "destructive",
      });
      return;
    }

    // Additional custom validation beyond the schema
    const errors: string[] = [];
    const currentValues = form.getValues();

    if (currentValues.handle && currentValues.handle.length > MAX_HANDLE_LENGTH) {
      errors.push(`Product URL must be ${MAX_HANDLE_LENGTH} characters or less`);
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      toast({
        title: "Validation Error",
        description: errors.join('. '),
        variant: "destructive",
      });
      return;
    }

    setValidationErrors([]);
    saveMutation.mutate();
  };

  // Sync from Shopify mutation
  const syncFromShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/products/${productId}/sync-from-shopify`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sync product from Shopify");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh product data
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/collections`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });

      // Show success toast with changes (extract just field names, not full values)
      let changesText = "Product is already up to date";
      if (data.changes?.length > 0) {
        // Extract field names from changes like "description: old → new" or "title updated"
        const fieldNames = data.changes.map((change: string) => {
          // Get text before ":" or " updated" or use first word
          const colonIndex = change.indexOf(":");
          if (colonIndex > 0) {
            return change.substring(0, colonIndex).trim();
          }
          const updatedIndex = change.indexOf(" updated");
          if (updatedIndex > 0) {
            return change.substring(0, updatedIndex).trim();
          }
          // Truncate long strings
          return change.length > 30 ? change.substring(0, 30) + "..." : change;
        });
        changesText = `Updated: ${fieldNames.join(", ")}`;
      }

      toast({
        title: data.updated ? "✅ Product Synced" : "✅ Already Up to Date",
        description: changesText,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle sync from Shopify - show warning first
  const handleSyncFromShopify = () => {
    setShowSyncWarning(true);
  };

  // Confirm sync after warning
  const confirmSyncFromShopify = () => {
    setShowSyncWarning(false);
    syncFromShopifyMutation.mutate();
  };

  // Generate bullet points with AI
  const handleGenerateBulletPoints = async () => {
    const currentValues = form.getValues();
    if (!currentValues.title) {
      toast({
        title: "Title required",
        description: "Please enter a product title before generating bullet points.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingBulletPoints(true);
    try {
      const response = await fetch("/api/ai/generate-bullet-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: currentValues.title,
          description: currentValues.description,
          focusKeyword: currentValues.focusKeyword,
          productType: currentValues.productType,
          vendor: currentValues.vendor,
          tags: currentValues.tags?.split(",").map((t) => t.trim()).filter(Boolean),
          existingBulletPoints: bulletPoints.filter((bp) => bp.trim().length > 0),
          count: 5,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate bullet points");
      }

      const data = await response.json();
      if (data.bulletPoints && Array.isArray(data.bulletPoints)) {
        setBulletPoints(data.bulletPoints);
        toast({
          title: "Bullet points generated",
          description: `Generated ${data.bulletPoints.length} SEO-optimized bullet points.`,
        });
      }
    } catch (error: any) {
      console.error("Error generating bullet points:", error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate bullet points. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingBulletPoints(false);
    }
  };

  // Loading state (skip for new products)
  if (!isNewProduct && isLoading) {
    return (
      <MainLayout title="Loading..." subtitle="Fetching product data">
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading product...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Error state (skip for new products)
  if (!isNewProduct && (error || !product)) {
    return (
      <MainLayout title="Error" subtitle="Failed to load product">
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Product</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Product not found"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/products")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Products
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <a
        href="#product-form"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-14 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to product form
      </a>

      {/* Accessibility: Live region for image reorder announcements (WCAG 2.1.1) */}
      <div aria-live="polite" className="sr-only">{reorderAnnouncement}</div>

      {/* Accessibility: Live region for form validation errors (WCAG 3.3.1) */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {validationErrors.length > 0 && (
          `Form has ${validationErrors.length} error${validationErrors.length !== 1 ? 's' : ''}: ${validationErrors.join('. ')}`
        )}
      </div>

      <MainLayout
        title={isNewProduct ? "Create Product" : (product?.title || "Edit Product")}
        subtitle="Product details and publishing"
      >
        <div id="main-content" className="flex-1 overflow-y-auto">
        {/* Header with breadcrumb */}
        <div className="sticky top-0 z-10 bg-background border-b">
          <div className="px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/products")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Products
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold">
                  {isNewProduct ? "Create Product" : (product?.title || "Edit Product")}
                </h1>
                {/* Shopify Sync Status Indicator */}
                {!isNewProduct && product && (
                  <div className="flex items-center gap-2">
                    {product.publishStatus === "published" && product.shopifyProductId ? (
                      <Badge variant="outline" className="bg-green-500 text-white border-0 text-xs">
                        <span className="mr-1">🟢</span>
                        Published to Shopify
                      </Badge>
                    ) : product.publishStatus === "publishing" ? (
                      <Badge variant="outline" className="bg-blue-500 text-white border-0 text-xs animate-pulse">
                        <span className="mr-1">🔄</span>
                        Publishing...
                      </Badge>
                    ) : product.publishStatus === "failed" ? (
                      <Badge variant="outline" className="bg-red-500 text-white border-0 text-xs">
                        <span className="mr-1">🔴</span>
                        Failed to Publish
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-400 text-gray-700 border-0 text-xs">
                        <span className="mr-1">⚪</span>
                        Not Published
                      </Badge>
                    )}
                    {product.publishedAt && product.publishStatus === "published" && (
                      <span className="text-xs text-muted-foreground">
                        Last synced: {new Date(product.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                    {product.publishStatus === "failed" && product.publishError && (
                      <span className="text-xs text-red-600 max-w-md">
                        Error: {product.publishError}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Sync from Shopify button - only show for existing products with Shopify ID */}
              {!isNewProduct && product?.shopifyProductId && (
                <Button
                  ref={syncTriggerRef}
                  variant="outline"
                  onClick={handleSyncFromShopify}
                  disabled={syncFromShopifyMutation.isPending}
                >
                  {syncFromShopifyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync from Shopify
                    </>
                  )}
                </Button>
              )}

              {/* Publish to Shopify button - dynamic label based on publish status */}
              {!isNewProduct && product && (
                <Button
                  ref={publishTriggerRef}
                  variant="default"
                  onClick={handlePublishClick}
                  disabled={publishToShopifyMutation.isPending || product.publishStatus === "publishing"}
                >
                  {publishToShopifyMutation.isPending || product.publishStatus === "publishing" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {product.publishStatus === "publishing" ? "Publishing..." : "Processing..."}
                    </>
                  ) : product.publishStatus === "published" ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Update on Shopify
                    </>
                  ) : product.publishStatus === "failed" ? (
                    <>
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Retry Publish to Shopify
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Publish to Shopify
                    </>
                  )}
                </Button>
              )}

              {/* Save button */}
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT COLUMN - 2/3 width */}
            <div className="lg:col-span-2 space-y-6">
              {/* Title Section */}
              <Card id="product-form">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Title</CardTitle>
                    <Button
                      ref={contentStudioTriggerRef}
                      variant="outline"
                      size="sm"
                      onClick={handleCreateInContentStudio}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      {product?.aiGenerated ? "Update in Content Studio" : "Create in Content Studio"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div>
                    <Label htmlFor="product-title" className="sr-only">Product title</Label>
                    <Input
                      id="product-title"
                      value={formData.title}
                      onChange={(e) => handleChange("title", e.target.value)}
                      placeholder="Enter product title"
                      className="text-lg"
                      maxLength={200}
                      aria-invalid={validationErrors.some(e => e.toLowerCase().includes('title'))}
                      aria-describedby={validationErrors.some(e => e.toLowerCase().includes('title')) ? "title-error" : undefined}
                    />
                    {validationErrors.some(e => e.toLowerCase().includes('title')) && (
                      <p id="title-error" className="text-sm text-destructive mt-1">
                        Title is required
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.title.length}/200 characters
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Description Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Rich Text Formatting Toolbar - Always Visible */}
                  <div className="flex flex-wrap gap-1 border rounded-md p-2 bg-muted/30 items-center">
                    {/* Heading Dropdown */}
                    <Select
                      defaultValue="p"
                      disabled={isHtmlMode}
                      onValueChange={(value) => {
                        document.execCommand('formatBlock', false, value);
                      }}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-sm" aria-label="Text format">
                        <SelectValue placeholder="Paragraph" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="p">Paragraph</SelectItem>
                        <SelectItem value="h1">Heading 1</SelectItem>
                        <SelectItem value="h2">Heading 2</SelectItem>
                        <SelectItem value="h3">Heading 3</SelectItem>
                        <SelectItem value="h4">Heading 4</SelectItem>
                        <SelectItem value="h5">Heading 5</SelectItem>
                        <SelectItem value="h6">Heading 6</SelectItem>
                      </SelectContent>
                    </Select>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Text Styling */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('bold', false)}
                      title="Bold (Ctrl+B)"
                      aria-label="Bold"
                      disabled={isHtmlMode}
                    >
                      <Bold className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('italic', false)}
                      title="Italic (Ctrl+I)"
                      aria-label="Italic"
                      disabled={isHtmlMode}
                    >
                      <Italic className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('underline', false)}
                      title="Underline (Ctrl+U)"
                      aria-label="Underline"
                      disabled={isHtmlMode}
                    >
                      <Underline className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('strikeThrough', false)}
                      title="Strikethrough"
                      aria-label="Strikethrough"
                      disabled={isHtmlMode}
                    >
                      <Strikethrough className="h-4 w-4" />
                    </Button>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Lists */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('insertUnorderedList', false)}
                      title="Bullet List"
                      aria-label="Bullet list"
                      disabled={isHtmlMode}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('insertOrderedList', false)}
                      title="Numbered List"
                      aria-label="Numbered list"
                      disabled={isHtmlMode}
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Button>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Alignment */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('justifyLeft', false)}
                      title="Align Left"
                      aria-label="Align left"
                      disabled={isHtmlMode}
                    >
                      <AlignLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('justifyCenter', false)}
                      title="Align Center"
                      aria-label="Align center"
                      disabled={isHtmlMode}
                    >
                      <AlignCenter className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('justifyRight', false)}
                      title="Align Right"
                      aria-label="Align right"
                      disabled={isHtmlMode}
                    >
                      <AlignRight className="h-4 w-4" />
                    </Button>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Link */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const url = prompt('Enter URL:');
                        if (url) document.execCommand('createLink', false, url);
                      }}
                      title="Insert Link"
                      aria-label="Insert link"
                      disabled={isHtmlMode}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>

                    {/* Quote */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => document.execCommand('formatBlock', false, 'blockquote')}
                      title="Quote"
                      aria-label="Block quote"
                      disabled={isHtmlMode}
                    >
                      <Quote className="h-4 w-4" />
                    </Button>

                    {/* Spacer to push HTML button to the right */}
                    <div className="flex-1" />

                    <Separator orientation="vertical" className="h-8" />

                    {/* HTML Mode Toggle - Always Active */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsHtmlMode(!isHtmlMode)}
                    >
                      {isHtmlMode ? (
                        <>
                          <Type className="mr-2 h-4 w-4" />
                          Visual
                        </>
                      ) : (
                        <>
                          <Code className="mr-2 h-4 w-4" />
                          HTML
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Editor Area */}
                  {!isHtmlMode ? (
                    /* Visual Editor - ContentEditable */
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      role="textbox"
                      aria-multiline="true"
                      aria-label="Product description editor"
                      onInput={(e) => {
                        const html = e.currentTarget.innerHTML;
                        handleChange("description", html);
                      }}
                      onBlur={(e) => {
                        const html = e.currentTarget.innerHTML;
                        handleChange("description", html);
                      }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(formData.description || '<p>Enter product description...</p>') }}
                      className="h-[400px] p-4 border rounded-md bg-background prose prose-sm max-w-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    /* HTML Mode - Raw HTML Editing */
                    <Textarea
                      value={formData.description}
                      onChange={(e) => handleChange("description", e.target.value)}
                      placeholder="Enter HTML code..."
                      className="font-mono text-sm h-[400px] resize-none"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Media Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Media</CardTitle>
                  <CardDescription>Product images and videos</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Image grid with accessibility: keyboard navigation and click to edit alt text */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="list" aria-label="Product images, reorderable. Click image to edit alt text.">
                    {/* Existing Images */}
                    {images.map((imageUrl, index) => (
                      <div
                        key={imageUrl}
                        tabIndex={0}
                        role="listitem"
                        aria-label={`Image ${index + 1} of ${images.length}${index === 0 ? ', primary image' : ''}. Use arrow keys to reorder. Press Enter to edit alt text.`}
                        onClick={() => handleImageClick(imageUrl, index)}
                        onKeyDown={(e) => {
                          // Accessibility: Enter/Space to open image detail modal
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleImageClick(imageUrl, index);
                            return;
                          }
                          // Accessibility: Keyboard navigation for image reorder (WCAG 2.1.1)
                          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (index > 0) {
                              const newImages = [...images];
                              [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
                              setImages(newImages);
                              // After moving left, image is now at index-1 (0-based), so position is index (1-based)
                              setReorderAnnouncement(`Image moved to position ${index}. Now image ${index} of ${images.length}.`);
                            }
                          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (index < images.length - 1) {
                              const newImages = [...images];
                              [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
                              setImages(newImages);
                              setReorderAnnouncement(`Image moved to position ${index + 2}. Now image ${index + 2} of ${images.length}.`);
                            }
                          }
                        }}
                        className="relative group aspect-square border rounded-lg overflow-hidden bg-muted focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none cursor-pointer"
                      >
                        <img
                          src={imageUrl}
                          alt={localAltTexts[imageUrl] || `${formData.title || 'Product'} - Image ${index + 1}${index === 0 ? ' (Primary)' : ''}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImageClick(imageUrl, index);
                            }}
                          >
                            <Wand2 className="h-4 w-4 mr-1" />
                            Edit Details
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newImages = images.filter((_, i) => i !== index);
                              setImages(newImages);
                            }}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Remove
                          </Button>
                        </div>
                        {index === 0 && (
                          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                            Primary
                          </div>
                        )}
                        {/* Show alt text indicator if alt text is set */}
                        {localAltTexts[imageUrl] && (
                          <div className="absolute bottom-2 right-2 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded" title="Alt text set">
                            ALT
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add Images Button */}
                    <button
                      ref={filePickerTriggerRef}
                      type="button"
                      onClick={() => setShowFilePicker(true)}
                      className="aspect-square border-2 border-dashed rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-center cursor-pointer group focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
                    >
                      <div className="text-center">
                        <Plus className="mx-auto h-8 w-8 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <p className="mt-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                          Add images
                        </p>
                      </div>
                    </button>
                  </div>
                  {/* Accessibility: Helper text for keyboard users */}
                  <p className="text-xs text-muted-foreground mt-2">
                    Click an image to edit alt text. Use arrow keys to reorder when focused.
                  </p>

                  {/* Shopify Category */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="shopifyCategory">Shopify Category</Label>
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
                    {shopifyCategoryPath && shopifyCategoryPath !== 'Uncategorized' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {shopifyCategoryPath.split(' > ').pop()} in {shopifyCategoryPath.split(' > ').slice(-2, -1)[0]}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {shopifyCategoryPath}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShopifyCategoryId('');
                              setShopifyCategoryPath('');
                            }}
                          >
                            Change
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Synced from Shopify. Determines tax rates and adds metafields to improve search, filters, and cross-channel sales
                        </p>
                      </div>
                    ) : (
                      <>
                        <CategorySelector
                          value={shopifyCategoryId}
                          onSelect={(categoryId, categoryPath) => {
                            setShopifyCategoryId(categoryId);
                            setShopifyCategoryPath(categoryPath);
                          }}
                          placeholder="Search categories (e.g., hoodies, jeans)..."
                        />
                        <p className="text-xs text-muted-foreground">
                          Determines tax rates and adds metafields to improve search, filters, and cross-channel sales
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Unified Variants Card - Options and Variants in one card (like Shopify) */}
              {!isNewProduct && productId && (
                <UnifiedVariantsCard productId={productId} product={product} />
              )}

              {/* Product Metafields - moved here to fill space next to SEO */}
              <Card>
                <CardHeader>
                  <CardTitle>Product metafields</CardTitle>
                  <CardDescription>Custom product metadata</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="styleNumber">
                      Style Number
                      <span className="text-xs text-muted-foreground ml-1">(Product Collection)</span>
                    </Label>
                    <Input
                      id="styleNumber"
                      value={formData.styleNumber}
                      onChange={(e) => handleChange("styleNumber", e.target.value)}
                      placeholder="e.g., EP12487"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Groups related products (same design, different colors/sizes)
                    </p>
                  </div>

                  {/* Product Highlights / Sales Points */}
                  <Separator className="my-4" />
                  <BulletPointEditor
                    value={bulletPoints}
                    onChange={setBulletPoints}
                    focusKeyword={formData.focusKeyword}
                    onGenerateAI={handleGenerateBulletPoints}
                    isGenerating={isGeneratingBulletPoints}
                    disabled={saveMutation.isPending}
                  />

                  <p className="text-sm text-muted-foreground mt-4">
                    Additional metafields coming soon... (Closure Type, Amazon Parent ID, etc.)
                  </p>
                </CardContent>
              </Card>

              {/* Search Engine Listing - moved here to fill space next to SEO */}
              <Card>
                <CardHeader>
                  <CardTitle>Search engine listing</CardTitle>
                  <CardDescription>
                    Add a title and description to see how this product might appear in search engines
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="handle">Product URL (Handle)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="handle"
                        value={formData.handle}
                        onChange={(e) => {
                          // Auto-format: lowercase, replace spaces/special chars with hyphens
                          const formatted = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '');
                          handleChange("handle", formatted);
                        }}
                        placeholder="mens-leather-wallet-black"
                        maxLength={100}
                        className={`flex-1 font-mono text-sm ${
                          formData.handle && formData.handle.length > MAX_HANDLE_LENGTH
                            ? 'border-red-500 focus:ring-red-500'
                            : ''
                        }`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={async () => {
                          if (!productId || !formData.title) return;
                          try {
                            const response = await fetch(`/api/products/${productId}/handle/generate`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                            });
                            if (!response.ok) {
                              const errorData = await response.json().catch(() => ({}));
                              throw new Error(errorData.message || "Failed to generate handle");
                            }
                            const data = await response.json();
                            if (data.handle) {
                              handleChange("handle", data.handle);
                              toast({
                                title: "Handle Generated",
                                description: "SEO-optimized URL handle has been generated.",
                              });
                            }
                          } catch (error) {
                            toast({
                              title: "Generation Failed",
                              description: error instanceof Error ? error.message : "Failed to generate handle",
                              variant: "destructive",
                            });
                          }
                        }}
                        disabled={!formData.title}
                        title="Generate SEO-friendly handle from title"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Handle validation feedback */}
                    {(() => {
                      const handle = formData.handle || '';
                      const validation = handle ? validateHandleDetailed(handle) : null;
                      const isOverLimit = handle.length > MAX_HANDLE_LENGTH;
                      const charsOver = handle.length - MAX_HANDLE_LENGTH;

                      return (
                        <div className="mt-2 space-y-2">
                          {/* URL Preview */}
                          {handle.length > 0 && (
                            <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                              <span className="font-semibold text-foreground">Preview:</span>{' '}
                              <span className={isOverLimit ? 'text-red-600' : ''}>
                                {storeBaseUrl || 'https://your-store.myshopify.com'}/products/{handle}
                              </span>
                            </p>
                          )}

                          {/* Character count with visual indicator */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  isOverLimit ? 'bg-red-500' :
                                  handle.length > 50 ? 'bg-yellow-500' :
                                  handle.length > 30 ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${Math.min(100, (handle.length / MAX_HANDLE_LENGTH) * 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${isOverLimit ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {handle.length}/{MAX_HANDLE_LENGTH}
                            </span>
                          </div>

                          {/* Error state - handle too long */}
                          {isOverLimit && (
                            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md p-3 space-y-2">
                              <div className="flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                                    Handle is {charsOver} character{charsOver > 1 ? 's' : ''} too long
                                  </p>
                                  <p className="text-xs text-red-700 dark:text-red-300">
                                    Product URLs must be {MAX_HANDLE_LENGTH} characters or less for optimal SEO.
                                    Long URLs get cut off in Google search results and have lower click-through rates.
                                  </p>
                                </div>
                              </div>

                              {/* Suggested fix */}
                              {validation?.suggestions && validation.suggestions.length > 0 && (
                                <div className="pt-2 border-t border-red-200 dark:border-red-800">
                                  <p className="text-xs font-medium text-red-800 dark:text-red-200 mb-1">How to fix:</p>
                                  <ul className="text-xs text-red-700 dark:text-red-300 space-y-1 list-disc list-inside">
                                    {validation.suggestions.slice(0, 3).map((suggestion, i) => (
                                      <li key={i}>{suggestion}</li>
                                    ))}
                                  </ul>

                                  {/* One-click fix button */}
                                  {(() => {
                                    const suggested = suggestShorterHandle(handle);
                                    if (suggested !== handle && suggested.length <= MAX_HANDLE_LENGTH) {
                                      return (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="mt-2 text-xs border-red-300 hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
                                          onClick={() => handleChange("handle", suggested)}
                                        >
                                          Use suggested: <code className="ml-1 font-mono">{suggested}</code>
                                        </Button>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Success state */}
                          {!isOverLimit && handle.length > 0 && handle.length <= MAX_HANDLE_LENGTH && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              <span className="text-green-600 font-medium">
                                {handle.length >= 30 && handle.length <= 50
                                  ? 'Excellent length for SEO!'
                                  : handle.length < 30
                                    ? 'Valid - could add more keywords'
                                    : 'Valid - near maximum length'}
                              </span>
                            </div>
                          )}

                          {/* Warnings (not blocking) */}
                          {validation?.warnings && validation.warnings.length > 0 && !isOverLimit && (
                            <div className="flex items-start gap-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                              <span>{validation.warnings[0]}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <Label htmlFor="metaTitle">Meta title</Label>
                    <Input
                      id="metaTitle"
                      value={formData.metaTitle}
                      onChange={(e) => handleChange("metaTitle", e.target.value)}
                      placeholder="Enter meta title"
                      maxLength={60}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.metaTitle.length}/60 characters
                      {formData.metaTitle.length >= 50 && formData.metaTitle.length <= 60 && (
                        <span className="ml-2 text-green-600">✓ Optimal</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="metaDescription">Meta description</Label>
                    <Textarea
                      id="metaDescription"
                      value={formData.metaDescription}
                      onChange={(e) => handleChange("metaDescription", e.target.value)}
                      placeholder="Enter meta description"
                      maxLength={160}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.metaDescription.length}/160 characters
                      {formData.metaDescription.length >= 120 && formData.metaDescription.length <= 160 && (
                        <span className="ml-2 text-green-600">✓ Optimal</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="focusKeyword">Focus Keyword</Label>
                    <Input
                      id="focusKeyword"
                      value={formData.focusKeyword}
                      onChange={(e) => handleChange("focusKeyword", e.target.value)}
                      placeholder="Enter focus keyword for SEO"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Main keyword or phrase to target for this product
                    </p>
                  </div>

                  {/* Google Preview */}
                  {(formData.metaTitle || formData.metaDescription) && (
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-2">Google search preview</p>
                      <div className="space-y-1">
                        <p className="text-blue-600 text-lg font-medium">
                          {formData.metaTitle || formData.title || "Product Title"}
                        </p>
                        <p className="text-xs text-green-700">
                          {storeBaseUrl || 'https://your-store.myshopify.com'}/products/{formData.handle || product?.id || "product"}
                        </p>
                        <p className="text-sm text-gray-600">
                          {formData.metaDescription || formData.description?.substring(0, 160) || "Product description will appear here..."}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN - 1/3 width */}
            <div className="space-y-6">
              {/* Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="status">Product status</Label>
                    <select
                      id="status"
                      value={formData.status}
                      onChange={(e) => handleChange("status", e.target.value)}
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="local_draft">Local Draft</option>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formData.status === 'local_draft' && "🟣 Not yet published to Shopify"}
                    {formData.status === 'draft' && "🟡 Draft on Shopify"}
                    {formData.status === 'active' && "🟢 Active and visible"}
                    {formData.status === 'archived' && "⚫ Archived"}
                  </p>
                </CardContent>
              </Card>

              {/* Publishing Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Publishing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sales channels</span>
                      <span className="font-medium">Online Store</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span className="font-medium">
                        {product?.createdAt ? new Date(product.createdAt).toLocaleDateString() : "—"}
                      </span>
                    </div>
                    {product?.updatedAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Updated</span>
                        <span className="font-medium">
                          {new Date(product.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Product Organization Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Product Organization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="productType">Product type</Label>
                    <ProductTypeSelector
                      value={formData.productType}
                      onChange={(typeName) => handleChange("productType", typeName)}
                      placeholder="Select product type..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="vendor">Vendor</Label>
                    <VendorSelector
                      value={formData.vendor}
                      onChange={(vendorName) => handleChange("vendor", vendorName)}
                      placeholder="Select vendor..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="collections">Collections</Label>
                    <CollectionSelector
                      selectedCollectionIds={collectionIds}
                      onSelectionChange={setCollectionIds}
                      placeholder="Select collections..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Organize this product into collections for better management
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={formData.category}
                      onChange={(e) => handleChange("category", e.target.value)}
                      placeholder="e.g., Shoes"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      For internal organization
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="tags">Tags</Label>
                    <TagInput
                      value={tags}
                      onChange={setTags}
                      placeholder="Add tags..."
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Yoast SEO Panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Yoast SEO
                    {analyzingYoast && <Loader2 className="h-4 w-4 animate-spin" />}
                  </CardTitle>
                  <CardDescription>Real-time SEO analysis and optimization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!yoastResult && !analyzingYoast ? (
                    <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
                      <p>💡 Enter a title and description to see SEO analysis</p>
                    </div>
                  ) : yoastResult ? (
                    <>
                      {/* Overall Score */}
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                        <span className="text-sm font-medium">Overall Score</span>
                        <div className="flex items-center gap-2">
                          {yoastResult.overallScore === 'green' && (
                            <>
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                              <span className="text-sm font-semibold text-green-600">Good</span>
                            </>
                          )}
                          {yoastResult.overallScore === 'orange' && (
                            <>
                              <AlertCircle className="h-5 w-5 text-orange-500" />
                              <span className="text-sm font-semibold text-orange-500">OK</span>
                            </>
                          )}
                          {yoastResult.overallScore === 'red' && (
                            <>
                              <XCircle className="h-5 w-5 text-red-600" />
                              <span className="text-sm font-semibold text-red-600">Needs Work</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Scores Row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-2 border rounded-md">
                          <span className="text-xs font-medium">SEO</span>
                          <span className={`text-sm font-bold ${
                            yoastResult.seoScore >= 80 ? 'text-green-600' :
                            yoastResult.seoScore >= 60 ? 'text-orange-500' :
                            'text-red-600'
                          }`}>
                            {yoastResult.seoScore}/100
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded-md">
                          <span className="text-xs font-medium">Readability</span>
                          <span className={`text-sm font-bold ${
                            yoastResult.readabilityScore >= 80 ? 'text-green-600' :
                            yoastResult.readabilityScore >= 60 ? 'text-orange-500' :
                            'text-red-600'
                          }`}>
                            {yoastResult.readabilityScore}/100
                          </span>
                        </div>
                      </div>

                      {/* SEO Checks - Collapsible */}
                      <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
                          <span className="text-sm font-medium">SEO Analysis ({yoastResult.checks.filter(c => c.category === 'seo').length} checks)</span>
                          {seoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {yoastResult.checks
                            .filter(check => check.category === 'seo')
                            .map(check => (
                              <div key={check.id} className="flex gap-2 p-2 border rounded-md text-sm">
                                {check.score === 'green' && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />}
                                {check.score === 'orange' && <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />}
                                {check.score === 'red' && <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />}
                                <div className="flex-1">
                                  <div className="font-medium text-xs text-muted-foreground mb-0.5">{check.name}</div>
                                  <div className="text-xs">{check.text}</div>
                                </div>
                              </div>
                            ))}
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Readability Checks - Collapsible */}
                      <Collapsible open={readabilityOpen} onOpenChange={setReadabilityOpen}>
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
                          <span className="text-sm font-medium">Readability Analysis ({yoastResult.checks.filter(c => c.category === 'readability').length} checks)</span>
                          {readabilityOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {yoastResult.checks
                            .filter(check => check.category === 'readability')
                            .map(check => (
                              <div key={check.id} className="flex gap-2 p-2 border rounded-md text-sm">
                                {check.score === 'green' && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />}
                                {check.score === 'orange' && <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />}
                                {check.score === 'red' && <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />}
                                <div className="flex-1">
                                  <div className="font-medium text-xs text-muted-foreground mb-0.5">{check.name}</div>
                                  <div className="text-xs">{check.text}</div>
                                </div>
                              </div>
                            ))}
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>

        </div>

        {/* Sticky footer with save button (mobile) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background border-t p-4">
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </div>

        {/* Content Studio Warning Dialog */}
        <Dialog
          open={showContentStudioWarning}
          onOpenChange={(open) => {
            setShowContentStudioWarning(open);
            // Accessibility: Return focus to trigger button when dialog closes (WCAG 2.4.3)
            if (!open) setTimeout(() => contentStudioTriggerRef.current?.focus(), 0);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Switch to Content Studio Workflow?</DialogTitle>
              <DialogDescription>
                You'll be redirected to Content Studio to optimize this product with AI-powered SEO tools.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="text-sm">
                <p className="font-semibold mb-2">Data to be used:</p>
                <div className="space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>✓ Product Title:</span>
                    <span className="font-medium text-right ml-4">{formData.title || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>✓ Vendor:</span>
                    <span className="font-medium text-right ml-4">{formData.vendor || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>✓ Style Number:</span>
                    <span className="font-medium text-right ml-4">{formData.styleNumber || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{(product?.options?.find((o: any) => o.name?.toLowerCase() === "color")?.values?.[0] || product?.variants?.[0]?.option1) ? "✓" : "⚠"} Color:</span>
                    <span className="font-medium text-right ml-4">{product?.options?.find((o: any) => o.name?.toLowerCase() === "color")?.values?.[0] || product?.variants?.[0]?.option1 || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{(formData.category || shopifyCategoryPath) ? "✓" : "⚠"} Category:</span>
                    <span className="font-medium text-right ml-4">{formData.category || shopifyCategoryPath?.split(" > ").pop() || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{shopifyCategoryPath ? "✓" : "⚠"} Shopify Category:</span>
                    <span className="font-medium text-right ml-4">{shopifyCategoryPath || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{formData.description ? "✓" : "⚠"} Description:</span>
                    <span className="font-medium text-right ml-4">{formData.description ? "Set" : "Empty (AI will generate)"}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> AI will generate optimized title, URL, description, and meta tags based on the data above.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowContentStudioWarning(false)}>
                Fill More Data
              </Button>
              <Button onClick={proceedToContentStudio}>
                Continue to Content Studio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Update on Shopify Confirmation Dialog */}
        <Dialog
          open={showUpdateConfirmation}
          onOpenChange={(open) => {
            setShowUpdateConfirmation(open);
            // Accessibility: Return focus to trigger button when dialog closes (WCAG 2.4.3)
            if (!open) setTimeout(() => publishTriggerRef.current?.focus(), 0);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-blue-600">
                <RefreshCw className="h-5 w-5" />
                Update Product on Shopify?
              </DialogTitle>
              <DialogDescription>
                This will update the existing Shopify product with your local changes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">🔄 The following will be updated on Shopify:</p>
                <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  <li>• <strong>Title:</strong> {product?.title || "Not set"}</li>
                  <li>• <strong>Description:</strong> {product?.description ? "Updated content" : "Empty"}</li>
                  <li>• <strong>Images:</strong> {images.length} image(s)</li>
                  <li>• <strong>Vendor:</strong> {formData.vendor || "Not set"}</li>
                  <li>• <strong>Product Type:</strong> {formData.productType || "Not set"}</li>
                  <li>• <strong>Category:</strong> {formData.category || "Not set"}</li>
                  <li>• <strong>Tags:</strong> {tags.length > 0 ? tags.join(", ") : "None"}</li>
                  <li>• <strong>Style Number:</strong> {formData.styleNumber || "Not set"}</li>
                  <li>• <strong>Handle (URL):</strong> {formData.handle || "Not set"}</li>
                  {product?.variants && product.variants.length > 0 && (
                    <li>• <strong>Variants:</strong> {product.variants.length} variant(s)</li>
                  )}
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="font-semibold text-amber-900 dark:text-amber-100 mb-2">⚠️ Important Notes:</p>
                <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
                  <li>• This will <strong>overwrite</strong> the current product data on Shopify</li>
                  <li>• The product will be updated as a <strong>draft</strong> (not published live)</li>
                  <li>• Existing Shopify product ID: <code className="bg-amber-100 px-1 py-0.5 rounded">{product?.shopifyProductId}</code></li>
                  <li>• Last synced: {product?.publishedAt ? new Date(product.publishedAt).toLocaleString() : "Never"}</li>
                </ul>
              </div>

              <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="font-semibold text-green-900 dark:text-green-100 mb-2">✅ Recommended Before Updating:</p>
                <ol className="space-y-1 text-sm text-green-800 dark:text-green-200 list-decimal list-inside">
                  <li>Review your changes carefully</li>
                  <li>Ensure all required fields are filled correctly</li>
                  <li>Check that images are uploaded properly</li>
                  <li>Verify variants and options are correct</li>
                </ol>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>Pro Tip:</strong> Save your changes locally first (click "Save" button) before updating on Shopify.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpdateConfirmation(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={confirmUpdate}
                disabled={publishToShopifyMutation.isPending}
              >
                {publishToShopifyMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Confirm Update
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sync from Shopify Warning Dialog */}
        <Dialog
          open={showSyncWarning}
          onOpenChange={(open) => {
            setShowSyncWarning(open);
            // Accessibility: Return focus to trigger button when dialog closes (WCAG 2.4.3)
            if (!open) setTimeout(() => syncTriggerRef.current?.focus(), 0);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-5 w-5" />
                Warning: Data Loss Risk!
              </DialogTitle>
              <DialogDescription>
                Syncing from Shopify will overwrite your local changes with data from Shopify.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="font-semibold text-amber-900 dark:text-amber-100 mb-2">⚠️ These fields will be OVERWRITTEN:</p>
                <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-200">
                  <li>• <strong>Title</strong> - Your AI-generated or manually edited title will be lost</li>
                  <li>• <strong>Description</strong> - Your AI-generated or manually edited description will be lost</li>
                  <li>• <strong>Images</strong> - Local image changes will be lost</li>
                  <li>• <strong>Vendor</strong> - Vendor changes will be lost</li>
                  <li>• <strong>Product Type</strong> - Product type changes will be lost</li>
                  <li>• <strong>Tags</strong> - Manually added tags will be lost</li>
                  <li>• <strong>Style Number</strong> - Style number changes will be lost</li>
                  <li>• <strong>Handle (URL)</strong> - URL slug changes will be lost</li>
                  <li>• <strong>Status</strong> - Product status changes will be lost</li>
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">🔄 These fields will be SYNCED:</p>
                <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  <li>• <strong>Collections</strong> - Shopify collections will be added (existing local collections preserved)</li>
                </ul>
              </div>

              <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="font-semibold text-green-900 dark:text-green-100 mb-2">✅ These SEO fields will be PRESERVED:</p>
                <ul className="space-y-1 text-sm text-green-800 dark:text-green-200">
                  <li>• Meta Title</li>
                  <li>• Meta Description</li>
                  <li>• Focus Keyword</li>
                  <li>• Google Category</li>
                  <li>• SEO Score</li>
                </ul>
              </div>

              <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <p className="font-semibold text-purple-900 dark:text-purple-100 mb-2">💡 Recommended Workflow:</p>
                <ol className="space-y-1 text-sm text-purple-800 dark:text-purple-200 list-decimal list-inside">
                  <li>Save your local changes first (click "Save" button)</li>
                  <li>Publish to Shopify (from Product List page)</li>
                  <li>THEN sync from Shopify (your changes are now safe)</li>
                </ol>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>Only proceed if:</strong> You want to discard local changes and pull the latest data from Shopify.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSyncWarning(false)}>
                Cancel - Keep Local Changes
              </Button>
              <Button
                variant="destructive"
                onClick={confirmSyncFromShopify}
                disabled={syncFromShopifyMutation.isPending}
              >
                {syncFromShopifyMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  "I Understand - Sync from Shopify"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* File Picker */}
        <FilePicker
          isOpen={showFilePicker}
          onClose={() => {
            setShowFilePicker(false);
            // Accessibility: Return focus to trigger button when picker closes (WCAG 2.4.3)
            setTimeout(() => filePickerTriggerRef.current?.focus(), 0);
          }}
          onSelect={(files) => {
            const newImageUrls = files.map(file => file.cdnUrl);

            // Filter out duplicates
            const uniqueNewUrls = newImageUrls.filter(url => !images.includes(url));
            const duplicateCount = newImageUrls.length - uniqueNewUrls.length;

            if (uniqueNewUrls.length > 0) {
              setImages([...images, ...uniqueNewUrls]);

              if (duplicateCount > 0) {
                toast({
                  title: "Images added with duplicates skipped",
                  description: `${uniqueNewUrls.length} image(s) added, ${duplicateCount} duplicate(s) skipped`,
                });
              } else {
                toast({
                  title: "Images added",
                  description: `${uniqueNewUrls.length} image(s) added to product`,
                });
              }
            } else {
              toast({
                title: "No new images",
                description: "All selected images are already in the product",
                variant: "default",
              });
            }
          }}
          onCancel={() => {
            setShowFilePicker(false);
            // Accessibility: Return focus to trigger button when picker is cancelled (WCAG 2.4.3)
            setTimeout(() => filePickerTriggerRef.current?.focus(), 0);
          }}
          multiple={true}
          maxFiles={10}
          fileType="image"
          allowUpload={true}
          allowBrowse={true}
          defaultTab="browse"
        />

        {/* Image Detail Modal for Alt Text Editing */}
        <ImageDetailModal
          open={isImageModalOpen}
          onOpenChange={setIsImageModalOpen}
          image={selectedImage}
          productContext={{
            productId: productId || '',
            productTitle: formData.title,
            brandName: formData.vendor,
            category: formData.category,
          }}
          onSave={handleSaveAltText}
          onGenerateAltText={handleGenerateAltText}
        />
        </div>
      </MainLayout>
    </>
  );
}
