import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { ProductDetailModal } from "@/components/product-detail-modal";
import { ProductDeleteDialog } from "@/components/product-delete-dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Package,
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Upload,
  RefreshCw,
  Filter,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Product } from "@shared/schema";

type StatusFilter = "all" | "local_draft" | "draft" | "active" | "archived";
type ViewMode = "table" | "grid";

const statusConfig = {
  local_draft: { label: "Local Draft", color: "bg-purple-500", icon: "🟣" },
  draft: { label: "Draft", color: "bg-yellow-500", icon: "🟡" },
  active: { label: "Active", color: "bg-green-500", icon: "🟢" },
  archived: { label: "Archived", color: "bg-gray-500", icon: "⚫" },
};

const publishStatusConfig = {
  not_published: { label: "Not Published", color: "bg-gray-400", icon: "⚪", textColor: "text-gray-700" },
  publishing: { label: "Publishing...", color: "bg-blue-500 animate-pulse", icon: "🔄", textColor: "text-white" },
  published: { label: "Published", color: "bg-green-500", icon: "🟢", textColor: "text-white" },
  failed: { label: "Failed", color: "bg-red-500", icon: "🔴", textColor: "text-white" },
};

// Hoisted to module scope to prevent re-mount on parent re-render
const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
  return (
    <Badge className={`${config.color} text-white`}>
      {config.icon} {config.label}
    </Badge>
  );
};

const PublishStatusBadge = ({ status }: { status: string }) => {
  const config = publishStatusConfig[status as keyof typeof publishStatusConfig] || publishStatusConfig.not_published;
  return (
    <Badge variant="outline" className={`${config.color} ${config.textColor} border-0`}>
      <span className="mr-1">{config.icon}</span>
      {config.label}
    </Badge>
  );
};

export default function ProductsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode] = useState<ViewMode>("table");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50); // Default 50 like Shopify

  // Modal states
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: string; title: string } | null>(null);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    total: number;
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // Reset page to 0 when search query, status filter, or page size changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, statusFilter, pageSize]);

  // Fetch products with server-side filters, search, and pagination
  // Note: ALWAYS paginate (even when searching) for consistent performance
  const { data: productData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["/api/products/list", statusFilter, searchQuery, currentPage, pageSize],
    placeholderData: keepPreviousData, // Keep previous data visible while fetching new data
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      // ALWAYS apply pagination for consistent performance
      params.append("limit", String(pageSize));
      params.append("offset", String(currentPage * pageSize));

      const response = await fetch(`/api/products/list?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      const data = await response.json();

      // Update total count for pagination
      if (data.total !== undefined) {
        setTotalCount(data.total);
      }

      return data;
    },
  });

  // Fetch product stats (total counts by status) - cached independently from pagination
  const { data: statsData, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery<{
    total: number;
    localDraft: number;
    draft: number;
    active: number;
    archived: number;
    notPublished: number;
  }>({
    queryKey: ["/api/products/stats"],
    queryFn: async () => {
      const response = await fetch("/api/products/stats", {
        credentials: "include",
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("📊 Stats fetch failed:", response.status, errorText);
        throw new Error("Failed to fetch stats");
      }
      const data = await response.json();
      return data;
    },
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache (formerly cacheTime)
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Debug: Log stats state and force refetch on mount
  useEffect(() => {
  }, [statsData, statsLoading, statsError]);

  // Force stats fetch on component mount
  useEffect(() => {
    refetchStats();
  }, [refetchStats]);

  // Extract products array from response
  const products = productData?.products || [];

  // Server-side filtering - no client-side filtering needed
  const filteredProducts = products;

  // Handle view product
  const handleViewProduct = (productId: string) => {
    setSelectedProductId(productId);
    setShowDetailModal(true);
  };

  // Handle edit product (from detail modal or table)
  const handleEditProduct = (productId: string) => {
    navigate(`/products/${productId}/edit`);
  };

  // Handle delete product (from detail modal or table)
  const handleDeleteProduct = (productId: string) => {
    const product = filteredProducts.find((p: Product) => p.id === productId);
    if (product) {
      setProductToDelete({ id: product.id, title: product.title });
      setShowDetailModal(false);
      setShowDeleteDialog(true);
    }
  };

  // Close modals
  const closeAllModals = () => {
    setShowDetailModal(false);
    setShowDeleteDialog(false);
    setSelectedProductId(null);
    setProductToDelete(null);
  };

  // Publish product to Shopify mutation
  const publishMutation = useMutation({
    mutationFn: async ({ productId, publishAsActive }: { productId: string; publishAsActive: boolean }) => {
      const response = await fetch(`/api/products/${productId}/publish-to-shopify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ publishAsActive }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "Failed to publish product");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });
      toast({
        title: "✅ Published to Shopify",
        description: `Product published successfully as ${data.shopifyProductId ? "draft" : "active"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Publish Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle publish product
  const handlePublishProduct = (productId: string, publishAsActive: boolean = false) => {
    publishMutation.mutate({ productId, publishAsActive });
  };

  // Import products from Shopify mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/shopify/import-products", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "Failed to import products");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setImportProgress(data.progress);
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });
      toast({
        title: "✅ Import Complete",
        description: `Imported ${data.progress.imported} products from Shopify. ${data.progress.skipped} skipped, ${data.progress.failed} failed.`,
      });
      // Keep modal open to show results
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Import Failed",
        description: error.message,
        variant: "destructive",
      });
      setShowImportModal(false);
      setImportProgress(null);
    },
  });

  // Handle import products
  const handleImportProducts = () => {
    setShowImportModal(true);
    setImportProgress(null);
    importMutation.mutate();
  };

  if (error) {
    return (
      <MainLayout title="Products" subtitle="Manage your product inventory and publish to Shopify">
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Products</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load products"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Products"
      subtitle="Manage your product inventory and publish to Shopify"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleImportProducts} disabled={importMutation.isPending}>
            {importMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Import from Shopify
              </>
            )}
          </Button>
          <Button onClick={() => navigate("/products/new")}>
            <Upload className="mr-2 h-4 w-4" />
            Create Product
          </Button>
        </div>
      }
    >
      <div className="p-8 space-y-6">

        {/* Stats - Uses separate stats query for stable counts */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {searchQuery || statusFilter !== "all" ? "Filtered / Total" : "Total Products"}
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading || isLoading ? "..." : (
                  searchQuery || statusFilter !== "all"
                    ? `${totalCount.toLocaleString()} / ${(statsData?.total ?? 0).toLocaleString()}`
                    : (statsData?.total ?? 0).toLocaleString()
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery || statusFilter !== "all" ? "matching / catalog" : "in catalog"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Local Drafts</CardTitle>
              <span className="text-xl">🟣</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (statsData?.localDraft ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <span className="text-xl">🟢</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (statsData?.active ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Not Published</CardTitle>
              <Upload className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsLoading ? "..." : (statsData?.notPublished ?? 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Status Tabs - Uses stats query for accurate total counts */}
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <TabsList>
                  <TabsTrigger value="all">
                    All ({statsLoading ? "..." : (statsData?.total ?? totalCount ?? "...")})
                  </TabsTrigger>
                  <TabsTrigger value="local_draft">
                    🟣 Local Draft ({statsLoading ? "..." : (statsData?.localDraft ?? "...")})
                  </TabsTrigger>
                  <TabsTrigger value="draft">
                    🟡 Draft ({statsLoading ? "..." : (statsData?.draft ?? "...")})
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    🟢 Active ({statsLoading ? "..." : (statsData?.active ?? "...")})
                  </TabsTrigger>
                  <TabsTrigger value="archived">
                    ⚫ Archived ({statsLoading ? "..." : (statsData?.archived ?? "...")})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Search */}
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products, vendors, SKUs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Loading products...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-semibold">No products found</h3>
                <p className="text-muted-foreground mt-2">
                  {searchQuery
                    ? `No products match "${searchQuery}"`
                    : statusFilter !== "all"
                    ? `No products with status "${statusFilter}"`
                    : "Create your first product"
                  }
                </p>
                {!searchQuery && statusFilter === "all" && (
                  <Button className="mt-4" onClick={() => navigate("/products/new")}>
                    <Upload className="mr-2 h-4 w-4" />
                    Create Product
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Image</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Publish Status</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Shopify Created</TableHead>
                      <TableHead className="w-[70px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product: Product) => (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/products/${product.id}/edit`)}
                      >
                        <TableCell>
                          {product.images && product.images.length > 0 ? (
                            <div className="relative h-10 w-10">
                              <img
                                src={product.images[0]}
                                alt={product.title}
                                className="h-10 w-10 rounded object-cover"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  img.style.display = "none";
                                  const placeholder = img.nextElementSibling as HTMLElement;
                                  if (placeholder) placeholder.style.display = "flex";
                                }}
                              />
                              <div className="hidden h-10 w-10 rounded bg-muted items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{product.title}</div>
                          </div>
                        </TableCell>
                        <TableCell>{product.vendor}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{product.category || "—"}</span>
                            {product.categoryMigratedAt && (() => {
                              const migratedDate = new Date(product.categoryMigratedAt);
                              const now = new Date();
                              const minutesAgo = Math.floor((now.getTime() - migratedDate.getTime()) / 60000);
                              const hoursAgo = Math.floor(minutesAgo / 60);
                              const isRecent = minutesAgo < 60; // Within last hour

                              return (
                                <Badge
                                  variant="outline"
                                  className={isRecent
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-300 animate-pulse"
                                    : "bg-green-50 text-green-600 border-green-200"
                                  }
                                >
                                  ✓ {isRecent ? `Migrated ${minutesAgo}m ago` : 'Migrated'}
                                </Badge>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={product.status} />
                        </TableCell>
                        <TableCell>
                          <PublishStatusBadge status={product.publishStatus} />
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">—</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View product details for variant pricing</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {product.shopifyCreatedAt
                              ? new Date(product.shopifyCreatedAt).toLocaleDateString()
                              : new Date(product.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewProduct(product.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditProduct(product.id)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              {/* Dynamic Shopify action based on publish status */}
                              {product.publishStatus === "not_published" ? (
                                <DropdownMenuItem onClick={() => handlePublishProduct(product.id, false)}>
                                  <Upload className="mr-2 h-4 w-4" />
                                  Publish to Shopify
                                </DropdownMenuItem>
                              ) : product.publishStatus === "published" ? (
                                <DropdownMenuItem onClick={() => handlePublishProduct(product.id, false)}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Update on Shopify
                                </DropdownMenuItem>
                              ) : product.publishStatus === "failed" ? (
                                <DropdownMenuItem onClick={() => handlePublishProduct(product.id, false)}>
                                  <AlertCircle className="mr-2 h-4 w-4" />
                                  Retry Publish to Shopify
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                onClick={() => handleDeleteProduct(product.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t pt-4 px-2">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Showing {currentPage * pageSize + 1} to{" "}
                {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount} products
                {searchQuery && ` matching "${searchQuery}"`}
              </div>

              {/* Page Size Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value))}
                >
                  <SelectTrigger className="w-[80px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {(() => {
                  const totalPages = Math.ceil(totalCount / pageSize);
                  const pages = [];
                  const maxPagesToShow = 5;

                  let startPage = Math.max(0, currentPage - Math.floor(maxPagesToShow / 2));
                  let endPage = Math.min(totalPages, startPage + maxPagesToShow);

                  if (endPage - startPage < maxPagesToShow) {
                    startPage = Math.max(0, endPage - maxPagesToShow);
                  }

                  if (startPage > 0) {
                    pages.push(
                      <Button
                        key={0}
                        variant={0 === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(0)}
                        className="w-10"
                      >
                        1
                      </Button>
                    );
                    if (startPage > 1) {
                      pages.push(<span key="ellipsis-start" className="px-2">...</span>);
                    }
                  }

                  for (let i = startPage; i < endPage; i++) {
                    pages.push(
                      <Button
                        key={i}
                        variant={i === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(i)}
                        className="w-10"
                      >
                        {i + 1}
                      </Button>
                    );
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="ellipsis-end" className="px-2">...</span>);
                    }
                    pages.push(
                      <Button
                        key={totalPages - 1}
                        variant={totalPages - 1 === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(totalPages - 1)}
                        className="w-10"
                      >
                        {totalPages}
                      </Button>
                    );
                  }

                  return pages;
                })()}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / pageSize) - 1, p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / pageSize) - 1}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
        </div>

        {/* Modals */}
        <ProductDetailModal
          productId={selectedProductId}
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onEdit={handleEditProduct}
          onDelete={handleDeleteProduct}
          onPublish={handlePublishProduct}
          isPublishing={publishMutation.isPending}
        />

        <ProductDeleteDialog
          productId={productToDelete?.id || null}
          productTitle={productToDelete?.title || null}
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onSuccess={() => {
            refetch();
            setShowDeleteDialog(false);
          }}
        />

        {/* Import Progress Modal */}
        <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Import from Shopify
              </DialogTitle>
              <DialogDescription>
                {importMutation.isPending
                  ? "Fetching products from Shopify..."
                  : importProgress
                  ? "Import complete"
                  : "Ready to import"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {importMutation.isPending && (
                <div className="flex flex-col items-center justify-center gap-4 py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    This may take a few moments...
                  </p>
                </div>
              )}

              {importProgress && (
                <div className="space-y-4">
                  {/* Success Summary */}
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                        <div>
                          <h4 className="font-semibold text-green-900">
                            {importProgress.imported} Products Imported
                          </h4>
                          <p className="text-sm text-green-700">
                            Successfully imported from Shopify
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {importProgress.imported}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Imported
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <div className="text-2xl font-bold text-yellow-600">
                          {importProgress.skipped}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Skipped
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {importProgress.failed}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Failed
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Info Cards */}
                  {importProgress.skipped > 0 && (
                    <Card className="border-yellow-200 bg-yellow-50">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                          <div>
                            <h5 className="text-sm font-semibold text-yellow-900">
                              {importProgress.skipped} Products Skipped
                            </h5>
                            <p className="text-xs text-yellow-700">
                              These products already exist in your database
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {importProgress.failed > 0 && (
                    <Card className="border-red-200 bg-red-50">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                          <div>
                            <h5 className="text-sm font-semibold text-red-900">
                              {importProgress.failed} Products Failed
                            </h5>
                            <p className="text-xs text-red-700">
                              Check server logs for error details
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Close Button */}
                  <Button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportProgress(null);
                      refetch();
                    }}
                    className="w-full"
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
    </MainLayout>
  );
}
