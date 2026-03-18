import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sanitizeHtml } from "@/lib/sanitize";
import { useRoute, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Upload,
  X,
  Image as ImageIcon,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  AlertTriangle,
  BookOpen,
  HelpCircle,
  Sparkles,
  Search,
  Code,
  Type,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Quote,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { generateHandle } from "@/lib/handle-utils";
import { analyzeContent, type YoastAnalysisResult } from "@/utils/yoast-analyzer";
import type { Collection } from "@shared/schema";

/**
 * Collection Edit Page - Matches Shopify's design exactly
 *
 * Layout:
 * - Left column: Title/Description, Conditions (Rules), Products
 * - Right sidebar: Publishing, Image, Theme Template
 */

export default function CollectionEditPage() {
  const [, params] = useRoute("/collections/:id/edit");
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const collectionId = params?.id;

  // Form state
  const [title, setTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState(""); // Track original for warning
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<Array<{ column: string; relation: string; condition: string }>>([]);
  const [disjunctive, setDisjunctive] = useState(false); // false = AND, true = OR
  const [image, setImage] = useState<string | null>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");

  // SEO state
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [focusKeyword, setFocusKeyword] = useState("");

  // Description editor mode
  const [isHtmlMode, setIsHtmlMode] = useState(false);

  // Product selector state
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Preview state
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [previewResults, setPreviewResults] = useState<{
    totalCount: number;
    sampleProducts: Array<{
      id: string;
      title: string;
      sku: string | null;
      vendor: string;
      price: string | null;
      image: string | null;
    }>;
  } | null>(null);

  // Fetch collection data
  const { data: collection, isLoading, error } = useQuery<Collection>({
    queryKey: [`/api/collections/${collectionId}`],
    queryFn: async () => {
      const response = await fetch(`/api/collections/${collectionId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch collection");
      }
      return response.json();
    },
    enabled: !!collectionId,
  });

  // Fetch products in this collection (with pagination)
  const { data: productsData } = useQuery({
    queryKey: [`/api/collections/${collectionId}/products`, currentPage, pageSize],
    queryFn: async () => {
      const offset = (currentPage - 1) * pageSize;
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });
      const response = await fetch(`/api/collections/${collectionId}/products?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch collection products");
      }
      return response.json();
    },
    enabled: !!collectionId,
  });

  // Extract products and total from response (handle both paginated and non-paginated formats)
  const products = Array.isArray(productsData)
    ? productsData
    : (productsData?.products || []);
  const totalProducts = typeof productsData?.total === 'number'
    ? productsData.total
    : (Array.isArray(productsData) ? productsData.length : (productsData?.products?.length || 0));
  const totalPages = Math.ceil(totalProducts / pageSize);

  // Fetch available products for selector (with search)
  const { data: availableProducts, isLoading: isLoadingAvailableProducts } = useQuery({
    queryKey: [`/api/products/list`, productSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: "100",
        offset: "0",
      });
      if (productSearchQuery) {
        params.append("search", productSearchQuery);
      }
      const response = await fetch(`/api/products/list?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch available products");
      }
      const data = await response.json();
      return data.products || [];
    },
    enabled: isProductSelectorOpen,
  });

  // Initialize form with collection data
  useEffect(() => {
    if (collection) {
      setTitle(collection.name || "");
      setOriginalTitle(collection.name || ""); // Store original for warning
      setDescription(collection.description || "");
      setImage(collection.image || null);

      // Initialize SEO fields
      setMetaTitle(collection.metaTitle || "");
      setMetaDescription(collection.metaDescription || "");
      setFocusKeyword(collection.focusKeyword || "");

      // Parse rules from JSONB
      // Handle both old format (appliedDisjunctively) and new format (disjunctive)
      if (collection.rules && typeof collection.rules === 'object') {
        const ruleSet = collection.rules as any;
        setRules(ruleSet.rules || []);
        // Support both field names for backwards compatibility
        setDisjunctive(ruleSet.disjunctive ?? ruleSet.appliedDisjunctively ?? false);
      }
    }
  }, [collection]);

  // Update collection mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: title,
          description,
          image,
          metaTitle: metaTitle || null,
          metaDescription: metaDescription || null,
          focusKeyword: focusKeyword || null,
          rules: {
            rules,
            disjunctive,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update collection");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Collection updated",
        description: "Your changes have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collectionId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sync rules to Shopify mutation
  const syncToShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/collections/${collectionId}/sync-to-shopify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sync to Shopify");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Synced to Shopify",
        description: "Collection rules successfully synced to Shopify.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collectionId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Preview collection rules mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/collections/${collectionId}/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          rules,
          disjunctive,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to preview");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setPreviewResults(data);
      setIsPreviewDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Preview failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add products to collection mutation
  const addProductsMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const response = await fetch(`/api/collections/${collectionId}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ productIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add products");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Products added",
        description: "Products have been added to the collection.",
      });
      setCurrentPage(1); // Reset to first page
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collectionId}/products`] });
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collectionId}`] });
      setIsProductSelectorOpen(false);
      setSelectedProductIds(new Set());
      setProductSearchQuery("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add products",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove product from collection mutation
  const removeProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const response = await fetch(`/api/collections/${collectionId}/products`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ productIds: [productId] }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove product");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Product removed",
        description: "Product has been removed from the collection.",
      });
      // If we're on a page > 1 and removing the last item on that page, go back one page
      if (products.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collectionId}/products`] });
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collectionId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate collection description with AI
  const generateDescriptionMutation = useMutation({
    mutationFn: async () => {
      const sampleProductTitles = (products || []).slice(0, 8).map((p: any) => p.title || p.name);
      const sampleBrands = [...new Set((products || []).map((p: any) => p.vendor).filter(Boolean))] as string[];

      const response = await fetch('/api/ai/generate-collection-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          collectionName: title || collection?.name,
          collectionHandle: collection?.shopifyHandle || collection?.slug || '',
          existingDescription: description || undefined,
          productCount: totalProducts,
          collectionType: collection?.shopifyType || 'manual',
          sampleProductTitles,
          sampleBrands,
          focusKeyword: focusKeyword || title || collection?.name,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate description');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setDescription(data.description);
      if (data.metaTitle) setMetaTitle(data.metaTitle);
      if (data.metaDescription) setMetaDescription(data.metaDescription);
      toast({
        title: "Content generated",
        description: "AI-generated description and SEO fields have been applied. Review and save.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add new rule
  const addRule = () => {
    setRules([...rules, { column: "TAG", relation: "EQUALS", condition: "" }]);
  };

  // Remove rule
  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  // Update rule field
  const updateRule = (index: number, field: "column" | "relation" | "condition", value: string) => {
    const newRules = [...rules];
    newRules[index][field] = value;
    setRules(newRules);
  };

  // Image URL dialog handlers
  const handleOpenImageDialog = () => {
    setImageUrlInput(image || "");
    setIsImageDialogOpen(true);
  };

  const handleSaveImageUrl = () => {
    const url = imageUrlInput.trim();
    if (url) {
      // Basic URL validation
      try {
        new URL(url);
        setImage(url);
        setIsImageDialogOpen(false);
        toast({
          title: "Image updated",
          description: "Collection image has been updated.",
        });
      } catch (error) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid image URL",
          variant: "destructive",
        });
      }
    } else {
      setImage(null);
      setIsImageDialogOpen(false);
    }
  };

  // Product selector handlers
  const handleOpenProductSelector = () => {
    setSelectedProductIds(new Set());
    setProductSearchQuery("");
    setIsProductSelectorOpen(true);
  };

  const handleToggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProductIds);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProductIds(newSelected);
  };

  const handleAddSelectedProducts = () => {
    if (selectedProductIds.size === 0) return;
    addProductsMutation.mutate(Array.from(selectedProductIds));
  };

  // Loading state
  if (isLoading) {
    return (
      <MainLayout title="Loading..." subtitle="Fetching collection data">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <MainLayout title="Error" subtitle="Failed to load collection">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive">Failed to load collection</p>
            <Button onClick={() => navigate("/collections")} variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Collections
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title={collection?.name || "Edit Collection"}
      subtitle="Edit collection details and rules"
      actions={
        <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => navigate("/collections")}>
                  Cancel
                </Button>
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
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
                {collection?.shopifyCollectionId && collection?.shopifyType === "smart" && rules.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => syncToShopifyMutation.mutate()}
                    disabled={syncToShopifyMutation.isPending}
                  >
                    {syncToShopifyMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync to Shopify
                      </>
                    )}
                  </Button>
                )}
              </div>
      }
    >
      <div className="flex-1 overflow-auto">
        {/* 2-Column Layout */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT COLUMN - Main Content */}
            <div className="lg:col-span-2 space-y-6">

              {/* Card 1: Title & Description */}
              <Card>
                <CardHeader>
                  <CardTitle>Title and Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Men's T-Shirts"
                    />

                    {/* Name Change Warning */}
                    {originalTitle && title !== originalTitle && (
                      <Alert variant="default" className="mt-3 border-amber-300 bg-amber-50">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-amber-800">Handle Won't Change</AlertTitle>
                        <AlertDescription className="text-amber-700">
                          <p className="text-sm">
                            Changing the name from "<strong>{originalTitle}</strong>" to "<strong>{title}</strong>" will <strong>NOT</strong> change the collection's URL handle.
                          </p>
                          <div className="mt-2 p-2 bg-amber-100 rounded text-xs font-mono">
                            Handle will remain: <code className="bg-white px-1 py-0.5 rounded">/collections/{collection?.shopifyHandle || collection?.slug || generateHandle(originalTitle)}</code>
                          </div>
                          <p className="text-xs mt-2 text-amber-600">
                            Apps (like Power Tools) that create collections by expected handle may create duplicates if they expect:
                            <code className="bg-white px-1 py-0.5 rounded mx-1">/collections/{generateHandle(title)}</code>
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <HelpCircle className="h-3 w-3 text-amber-600" />
                            <a
                              href="/education"
                              className="text-xs text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1"
                            >
                              Learn more about collection handles
                              <BookOpen className="h-3 w-3" />
                            </a>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Current Handle Display */}
                    {collection?.shopifyHandle && (
                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Current handle: <code className="bg-muted px-1.5 py-0.5 rounded">{collection.shopifyHandle}</code>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="description">Description</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateDescriptionMutation.mutate()}
                        disabled={generateDescriptionMutation.isPending || !title}
                      >
                        {generateDescriptionMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-3 w-3" />
                            AI Generate
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Formatting Toolbar */}
                    <div className="flex items-center gap-1 p-1.5 border border-b-0 rounded-t-md bg-muted/30 flex-wrap">
                      {/* Heading Dropdown */}
                      <select
                        className="px-2 py-1 text-sm border rounded hover:bg-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Text format"
                        onChange={(e) => {
                          document.execCommand('formatBlock', false, e.target.value);
                          e.target.value = 'p';
                        }}
                        defaultValue="p"
                        disabled={isHtmlMode}
                      >
                        <option value="p">Paragraph</option>
                        <option value="h1">Heading 1</option>
                        <option value="h2">Heading 2</option>
                        <option value="h3">Heading 3</option>
                        <option value="h4">Heading 4</option>
                        <option value="h5">Heading 5</option>
                        <option value="h6">Heading 6</option>
                      </select>

                      <div className="w-px h-6 bg-border mx-0.5" />

                      {/* Text Styling */}
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('bold')} title="Bold" aria-label="Bold" disabled={isHtmlMode}>
                        <Bold className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('italic')} title="Italic" aria-label="Italic" disabled={isHtmlMode}>
                        <Italic className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('underline')} title="Underline" aria-label="Underline" disabled={isHtmlMode}>
                        <UnderlineIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('strikethrough')} title="Strikethrough" aria-label="Strikethrough" disabled={isHtmlMode}>
                        <Strikethrough className="h-4 w-4" />
                      </Button>

                      <div className="w-px h-6 bg-border mx-0.5" />

                      {/* Lists */}
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('insertUnorderedList')} title="Bullet List" aria-label="Bullet list" disabled={isHtmlMode}>
                        <List className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('insertOrderedList')} title="Numbered List" aria-label="Numbered list" disabled={isHtmlMode}>
                        <ListOrdered className="h-4 w-4" />
                      </Button>

                      <div className="w-px h-6 bg-border mx-0.5" />

                      {/* Alignment */}
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('justifyLeft')} title="Align Left" aria-label="Align left" disabled={isHtmlMode}>
                        <AlignLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('justifyCenter')} title="Align Center" aria-label="Align center" disabled={isHtmlMode}>
                        <AlignCenter className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('justifyRight')} title="Align Right" aria-label="Align right" disabled={isHtmlMode}>
                        <AlignRight className="h-4 w-4" />
                      </Button>

                      <div className="w-px h-6 bg-border mx-0.5" />

                      {/* Link & Quote */}
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
                      <Button variant="ghost" size="sm" onClick={() => document.execCommand('formatBlock', false, 'blockquote')} title="Blockquote" aria-label="Blockquote" disabled={isHtmlMode}>
                        <Quote className="h-4 w-4" />
                      </Button>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* HTML/Visual Toggle */}
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
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Collection description editor"
                        onInput={(e) => {
                          const html = e.currentTarget.innerHTML;
                          setDescription(html);
                        }}
                        onBlur={(e) => {
                          const html = e.currentTarget.innerHTML;
                          setDescription(html);
                        }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(description || '<p>Enter collection description...</p>') }}
                        className="h-[300px] p-4 border rounded-b-md bg-background prose prose-sm max-w-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter HTML code..."
                        className="font-mono text-sm h-[300px] resize-none rounded-t-none"
                      />
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      Supports HTML. AI will generate SEO-optimized content with meta fields.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Card: Search Engine Listing (SEO) */}
              <CollectionSEOCard
                title={title}
                description={description}
                metaTitle={metaTitle}
                setMetaTitle={setMetaTitle}
                metaDescription={metaDescription}
                setMetaDescription={setMetaDescription}
                focusKeyword={focusKeyword}
                setFocusKeyword={setFocusKeyword}
                slug={collection?.shopifyHandle || collection?.slug || ''}
              />

              {/* Card 2: Conditions (Collection Rules) */}
              <Card>
                <CardHeader>
                  <CardTitle>Conditions</CardTitle>
                  <CardDescription>
                    {collection?.shopifyType === "smart"
                      ? "Products that match these conditions will automatically be added to this collection."
                      : "This is a manual collection. Conditions are not applicable."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {collection?.shopifyType === "smart" && (
                    <>
                      {/* AND/OR Toggle */}
                      <div>
                        <Label>Products must match:</Label>
                        <RadioGroup
                          value={disjunctive ? "any" : "all"}
                          onValueChange={(value) => setDisjunctive(value === "any")}
                          className="flex gap-4 mt-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="all" id="all" />
                            <Label htmlFor="all" className="font-normal cursor-pointer">
                              all conditions
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="any" id="any" />
                            <Label htmlFor="any" className="font-normal cursor-pointer">
                              any condition
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* Rules List */}
                      <div className="space-y-3">
                        {rules.map((rule, index) => (
                          <CollectionRuleRow
                            key={index}
                            rule={rule}
                            onUpdate={(field, value) => updateRule(index, field, value)}
                            onRemove={() => removeRule(index)}
                          />
                        ))}
                      </div>

                      {/* Add Condition and Preview Buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addRule}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add another condition
                        </Button>
                        {rules.length > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => previewMutation.mutate()}
                            disabled={previewMutation.isPending}
                          >
                            {previewMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              <>
                                <Eye className="mr-2 h-4 w-4" />
                                Preview Changes
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Info Message */}
                      {rules.length > 0 && (
                        <div className="flex gap-2 p-3 bg-muted/50 rounded-md">
                          <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-muted-foreground">
                            This collection will include all products with at least one variant that matches:{" "}
                            <span className="font-medium">
                              {disjunctive ? "any" : "all"} of the conditions above
                            </span>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Products */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle>Products</CardTitle>
                      <Badge variant="secondary">{products?.length || 0}</Badge>
                    </div>
                    {collection?.shopifyType !== "smart" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenProductSelector}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add products
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    {collection?.shopifyType === "smart"
                      ? "Products matching the conditions above"
                      : "Manually added products"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {products && products.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Status</TableHead>
                          {collection?.shopifyType !== "smart" && <TableHead className="w-[50px]"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((product: any) => (
                          <TableRow key={product.id}>
                            <TableCell className="flex items-center gap-3">
                              {product.images && product.images[0] ? (
                                <img
                                  src={product.images[0]}
                                  alt={product.title}
                                  className="w-10 h-10 object-cover rounded"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <span>{product.title}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={product.status === "active" ? "default" : "secondary"}>
                                {product.status}
                              </Badge>
                            </TableCell>
                            {collection?.shopifyType !== "smart" && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeProductMutation.mutate(product.id)}
                                  disabled={removeProductMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No products in this collection</p>
                      {collection?.shopifyType !== "smart" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={handleOpenProductSelector}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add products
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {totalProducts > 0 && (
                    <div className="mt-4 flex items-center justify-between border-t pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>
                          Showing {Math.min((currentPage - 1) * pageSize + 1, totalProducts)} -{" "}
                          {Math.min(currentPage * pageSize, totalProducts)} of {totalProducts}
                        </span>
                        <span>•</span>
                        <Select
                          value={pageSize.toString()}
                          onValueChange={(value) => {
                            setPageSize(parseInt(value, 10));
                            setCurrentPage(1);
                          }}
                        >
                          <SelectTrigger className="h-8 w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 / page</SelectItem>
                            <SelectItem value="25">25 / page</SelectItem>
                            <SelectItem value="50">50 / page</SelectItem>
                            <SelectItem value="100">100 / page</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }

                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                          {totalPages > 5 && currentPage < totalPages - 2 && (
                            <>
                              <span className="text-muted-foreground">...</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => setCurrentPage(totalPages)}
                              >
                                {totalPages}
                              </Button>
                            </>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="space-y-6">

              {/* Card 4: Publishing */}
              <Card>
                <CardHeader>
                  <CardTitle>Publishing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Sales channels</span>
                      <Button variant="link" size="sm" className="h-auto p-0">
                        Manage
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm">Online Store</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 5: Collection Image */}
              <Card>
                <CardHeader>
                  <CardTitle>Image</CardTitle>
                </CardHeader>
                <CardContent>
                  {image ? (
                    <div className="space-y-2">
                      <img
                        src={image}
                        alt={title}
                        className="w-full rounded-lg border"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOpenImageDialog}
                          className="flex-1"
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Change image
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setImage(null)}
                          className="flex-1"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add an image for this collection
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={handleOpenImageDialog}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Add image from URL
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 6: Theme Template */}
              <Card>
                <CardHeader>
                  <CardTitle>Theme template</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select defaultValue="default">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default collection</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Image URL Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add image from URL</DialogTitle>
            <DialogDescription>
              Enter the URL of the image you want to use for this collection
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveImageUrl();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Paste the URL of an image from your CDN or any publicly accessible source
              </p>
            </div>
            {imageUrlInput && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border rounded-lg p-2">
                  <img
                    src={imageUrlInput}
                    alt="Preview"
                    className="w-full rounded"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "";
                      target.alt = "Invalid image URL";
                      target.className = "w-full h-32 flex items-center justify-center bg-muted rounded text-sm text-muted-foreground";
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImageDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveImageUrl}>
              {image ? "Update" : "Add"} Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Selector Dialog */}
      <Dialog open={isProductSelectorOpen} onOpenChange={setIsProductSelectorOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add Products to Collection</DialogTitle>
            <DialogDescription>
              Select products to add to this collection
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search */}
            <div>
              <Input
                placeholder="Search products by title, SKU, or vendor..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
              />
            </div>

            {/* Product List */}
            <div className="border rounded-lg max-h-[400px] overflow-y-auto">
              {isLoadingAvailableProducts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : availableProducts && availableProducts.length > 0 ? (
                <div className="divide-y">
                  {availableProducts.map((product: any) => {
                    // Check if product is already in collection
                    const isInCollection = products?.some((p: any) => p.id === product.id);
                    const isSelected = selectedProductIds.has(product.id);

                    return (
                      <div
                        key={product.id}
                        className={`flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer ${
                          isInCollection ? "opacity-50" : ""
                        } ${isSelected ? "bg-muted" : ""}`}
                        onClick={() => {
                          if (!isInCollection) {
                            handleToggleProductSelection(product.id);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isInCollection}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                        {product.images && product.images[0] ? (
                          <img
                            src={product.images[0]}
                            alt={product.title}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{product.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {product.vendor && `${product.vendor} • `}
                            {product.status || "draft"}
                            {isInCollection && " • Already in collection"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No products found</p>
                  {productSearchQuery && (
                    <p className="text-sm mt-2">Try adjusting your search</p>
                  )}
                </div>
              )}
            </div>

            {/* Selected count */}
            {selectedProductIds.size > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedProductIds.size} product{selectedProductIds.size !== 1 ? "s" : ""} selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProductSelectorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSelectedProducts}
              disabled={selectedProductIds.size === 0 || addProductsMutation.isPending}
            >
              {addProductsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>Add {selectedProductIds.size > 0 && `(${selectedProductIds.size})`}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Results Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Preview Matching Products</DialogTitle>
            <DialogDescription>
              This is an estimate based on your current rules. Actual results will come from Shopify after sync.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Total count */}
            {previewResults && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                <Info className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm">
                  <span className="font-semibold">{previewResults.totalCount}</span> products match these conditions
                  {previewResults.totalCount > 10 && " (showing first 10)"}
                </p>
              </div>
            )}

            {/* Product List */}
            {previewResults && previewResults.sampleProducts.length > 0 ? (
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewResults.sampleProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="flex items-center gap-3">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{product.title}</div>
                            {product.sku && (
                              <div className="text-xs text-muted-foreground">SKU: {product.sku}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{product.vendor}</TableCell>
                        <TableCell>{product.price ? `$${product.price}` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No products match these conditions</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsPreviewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

/**
 * Collapsible SEO Card Component
 * Focus keyword, meta title/description with counters, SERP preview, Yoast scoring
 */
interface CollectionSEOCardProps {
  title: string;
  description: string;
  metaTitle: string;
  setMetaTitle: (v: string) => void;
  metaDescription: string;
  setMetaDescription: (v: string) => void;
  focusKeyword: string;
  setFocusKeyword: (v: string) => void;
  slug: string;
}

function CollectionSEOCard({
  title,
  description,
  metaTitle,
  setMetaTitle,
  metaDescription,
  setMetaDescription,
  focusKeyword,
  setFocusKeyword,
  slug,
}: CollectionSEOCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [seoResults, setSeoResults] = useState<YoastAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Debounced SEO analysis
  useEffect(() => {
    if (!focusKeyword && !description) {
      setSeoResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const results = await analyzeContent({
          title: metaTitle || title,
          metaDescription,
          description,
          keyword: focusKeyword || title,
          slug,
          contentType: 'collection',
        });
        setSeoResults(results);
      } catch {
        // Silently fail analysis
      } finally {
        setIsAnalyzing(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [title, description, metaTitle, metaDescription, focusKeyword, slug]);

  const scoreBadgeColor = seoResults?.overallScore === 'green'
    ? 'bg-green-500'
    : seoResults?.overallScore === 'orange'
      ? 'bg-orange-500'
      : seoResults?.overallScore === 'red'
        ? 'bg-red-500'
        : 'bg-gray-300';

  const metaTitleLength = metaTitle.length;
  const metaDescLength = metaDescription.length;
  const displayTitle = metaTitle || title || 'Page Title';
  const displayDesc = metaDescription || 'Add a meta description to see how this collection will appear in search results.';
  const displayUrl = `nexusdenim.com/collections/${slug || 'collection-handle'}`;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Search Engine Listing</CardTitle>
                {seoResults && !isOpen && (
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${scoreBadgeColor}`}>
                    {seoResults.seoScore >= 70 ? '!' : seoResults.seoScore >= 40 ? '~' : '!'}
                  </span>
                )}
                {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            {/* Focus Keyword */}
            <div>
              <Label htmlFor="focusKeyword">Focus Keyword</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="focusKeyword"
                  value={focusKeyword}
                  onChange={(e) => setFocusKeyword(e.target.value)}
                  placeholder="e.g., mens slim fit jeans"
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                The main keyword you want this collection to rank for
              </p>
            </div>

            {/* Meta Title */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="metaTitle">SEO Title</Label>
                <span className={`text-xs ${metaTitleLength > 60 ? 'text-red-500 font-medium' : metaTitleLength >= 50 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {metaTitleLength}/60
                </span>
              </div>
              <Input
                id="metaTitle"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || "Collection page title"}
                className="mt-1"
                maxLength={70}
              />
              <div className="w-full bg-gray-200 rounded-full h-1 mt-1.5">
                <div
                  className={`h-1 rounded-full transition-all ${
                    metaTitleLength === 0 ? 'bg-gray-300' :
                    metaTitleLength > 60 ? 'bg-red-500' :
                    metaTitleLength >= 50 ? 'bg-green-500' :
                    metaTitleLength >= 30 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min((metaTitleLength / 60) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Meta Description */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="metaDesc">Meta Description</Label>
                <span className={`text-xs ${metaDescLength > 156 ? 'text-red-500 font-medium' : metaDescLength >= 120 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {metaDescLength}/156
                </span>
              </div>
              <Textarea
                id="metaDesc"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Write a concise summary for search engines..."
                rows={3}
                className="mt-1"
                maxLength={170}
              />
              <div className="w-full bg-gray-200 rounded-full h-1 mt-1.5">
                <div
                  className={`h-1 rounded-full transition-all ${
                    metaDescLength === 0 ? 'bg-gray-300' :
                    metaDescLength > 156 ? 'bg-red-500' :
                    metaDescLength >= 120 ? 'bg-green-500' :
                    metaDescLength >= 70 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min((metaDescLength / 156) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Google SERP Preview */}
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Search Preview</Label>
              <div className="mt-2 p-4 border rounded-lg bg-white">
                <div className="text-sm text-green-700 truncate">{displayUrl}</div>
                <div className="text-lg text-blue-700 hover:underline cursor-default truncate leading-tight mt-0.5">
                  {displayTitle}
                </div>
                <div className="text-sm text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                  {displayDesc}
                </div>
              </div>
            </div>

            {/* SEO Score Panel */}
            {seoResults && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">SEO Analysis</Label>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      seoResults.overallScore === 'green' ? 'text-green-600' :
                      seoResults.overallScore === 'orange' ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      Score: {seoResults.seoScore}/100
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {seoResults.checks
                    .filter(c => c.category === 'seo')
                    .sort((a, b) => {
                      const order = { red: 0, orange: 1, green: 2 };
                      return order[a.score] - order[b.score];
                    })
                    .map((check) => (
                      <div key={check.id} className="flex items-start gap-2 text-sm">
                        <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          check.score === 'green' ? 'bg-green-500' :
                          check.score === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                        }`} />
                        <span className="text-muted-foreground">{check.text}</span>
                      </div>
                    ))}
                </div>

                {/* Readability section */}
                {seoResults.checks.some(c => c.category === 'readability') && (
                  <div className="mt-4">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Readability</Label>
                    <div className="space-y-1.5 mt-2">
                      {seoResults.checks
                        .filter(c => c.category === 'readability')
                        .sort((a, b) => {
                          const order = { red: 0, orange: 1, green: 2 };
                          return order[a.score] - order[b.score];
                        })
                        .map((check) => (
                          <div key={check.id} className="flex items-start gap-2 text-sm">
                            <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              check.score === 'green' ? 'bg-green-500' :
                              check.score === 'orange' ? 'bg-orange-500' : 'bg-red-500'
                            }`} />
                            <span className="text-muted-foreground">{check.text}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state when no keyword */}
            {!seoResults && !isAnalyzing && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <Search className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p>Enter a focus keyword and description to see SEO analysis</p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/**
 * Individual Rule Row Component
 * Displays 3 dropdowns: Column, Relation, Condition
 */
interface CollectionRuleRowProps {
  rule: { column: string; relation: string; condition: string };
  onUpdate: (field: "column" | "relation" | "condition", value: string) => void;
  onRemove: () => void;
}

function CollectionRuleRow({ rule, onUpdate, onRemove }: CollectionRuleRowProps) {
  // Available columns (matching Shopify's exact labels)
  const columns = [
    { value: "TAG", label: "Tag" },
    { value: "TITLE", label: "Title" },
    { value: "TYPE", label: "Type" },
    { value: "VENDOR", label: "Vendor" },
    { value: "VARIANT_TITLE", label: "Variant's title" },
    { value: "VARIANT_PRICE", label: "Price" },
    { value: "VARIANT_COMPARE_AT_PRICE", label: "Compare-at price" },
    { value: "VARIANT_WEIGHT", label: "Weight" },
    { value: "VARIANT_INVENTORY", label: "Inventory stock" },
    { value: "IS_PRICE_REDUCED", label: "Price is reduced" },
    { value: "PRODUCT_METAFIELD_DEFINITION", label: "Product metafield" },
  ];

  // Available relations (operators) - matching Shopify's labels
  const relations = [
    { value: "EQUALS", label: "is equal to" },
    { value: "NOT_EQUALS", label: "is not equal to" },
    { value: "CONTAINS", label: "contains" },
    { value: "NOT_CONTAINS", label: "does not contain" },
    { value: "STARTS_WITH", label: "starts with" },
    { value: "ENDS_WITH", label: "ends with" },
    { value: "GREATER_THAN", label: "is greater than" },
    { value: "LESS_THAN", label: "is less than" },
    { value: "IS_SET", label: "is set" },
    { value: "IS_NOT_SET", label: "is not set" },
  ];

  // Check if this relation type requires a condition value
  const needsCondition = !['IS_SET', 'IS_NOT_SET'].includes(rule.relation);

  // Handle relation change - auto-clear condition for IS_SET/IS_NOT_SET
  const handleRelationChange = (value: string) => {
    onUpdate("relation", value);
    // If switching to IS_SET or IS_NOT_SET, clear the condition
    if (value === 'IS_SET' || value === 'IS_NOT_SET') {
      onUpdate("condition", "");
    }
  };

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1 grid grid-cols-3 gap-2">
        {/* Column Dropdown */}
        <Select value={rule.column} onValueChange={(value) => onUpdate("column", value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((col) => (
              <SelectItem key={col.value} value={col.value}>
                {col.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Relation Dropdown */}
        <Select value={rule.relation} onValueChange={handleRelationChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {relations.map((rel) => (
              <SelectItem key={rel.value} value={rel.value}>
                {rel.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Condition Input - only show if relation needs a value */}
        {needsCondition ? (
          <Input
            value={rule.condition}
            onChange={(e) => onUpdate("condition", e.target.value)}
            placeholder="Value..."
          />
        ) : (
          <div className="flex items-center px-3 py-2 text-sm text-muted-foreground bg-muted rounded-md">
            No value needed
          </div>
        )}
      </div>

      {/* Remove Button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
