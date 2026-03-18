import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Search,
  Wand2,
  Check,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Upload,
  ExternalLink,
} from "lucide-react";
import type { Product } from "@shared/schema";

type FilterStatus = "all" | "missing" | "needs-improvement";

export default function ProductURLsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch tenant store URL for product links
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
      : 'https://your-store.myshopify.com';

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  // Fetch products
  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["/api/products/list", searchQuery, currentPage, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      params.append("offset", String(currentPage * pageSize));
      params.append("limit", String(pageSize));

      const response = await fetch(`/api/products/list?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  const products: Product[] = productsData?.products || [];
  const totalCount = productsData?.total || 0;

  // Fetch URL analytics
  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ["/api/products/url-analytics"],
    queryFn: async () => {
      const response = await fetch("/api/products/url-analytics", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  // Generate handles mutation
  const generateHandlesMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const response = await fetch("/api/products/batch-generate-handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate handles");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/url-analytics"] });
      toast({
        title: "Success",
        description: `Generated ${data.generated} handles successfully`
      });
      setSelectedProductIds([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Update handles mutation
  const updateHandlesMutation = useMutation({
    mutationFn: async (updates: Array<{ productId: string; handle: string }>) => {
      const response = await fetch("/api/products/batch-update-handles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update handles");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/url-analytics"] });
      toast({
        title: "Success",
        description: `Updated ${data.updated} handles successfully`
      });
      setSelectedProductIds([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Sync to Shopify mutation
  const syncToShopifyMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const response = await fetch("/api/products/batch/handle/sync-to-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sync handles");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Synced ${data.success} handles to Shopify`
      });
      setSelectedProductIds([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (filterStatus === "missing") return !p.handle;
    if (filterStatus === "needs-improvement") {
      return p.handle && (p.handle.length > 60 || calculateSEOScore(p.handle, p.title) < 50);
    }
    return true;
  });

  // Handlers
  const handleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map((p) => p.id));
    }
  };

  const handleGenerateSelected = () => {
    if (selectedProductIds.length === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }
    generateHandlesMutation.mutate(selectedProductIds);
  };

  const handleSyncToShopify = () => {
    if (selectedProductIds.length === 0) {
      toast({ title: "Error", description: "No products selected", variant: "destructive" });
      return;
    }
    syncToShopifyMutation.mutate(selectedProductIds);
  };

  return (
    <MainLayout
      title="Product URL Management"
      subtitle="Manage and optimize product URLs for better SEO"
      actions={
        <Button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
            queryClient.invalidateQueries({ queryKey: ["/api/products/url-analytics"] });
          }}
          variant="outline"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      }
    >
      <div className="max-w-7xl mx-auto p-8">
        <Card>

            {/* Analytics Cards */}
            {analytics && !isLoadingAnalytics && (
              <div className="px-6 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{analytics.total}</div>
                      <p className="text-xs text-muted-foreground">Total Products</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-amber-600">{analytics.withoutHandle}</div>
                      <p className="text-xs text-muted-foreground">Missing URLs</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-orange-600">{analytics.tooLong}</div>
                      <p className="text-xs text-muted-foreground">Too Long (&gt;60 chars)</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-red-600">{analytics.lowSEOScore}</div>
                      <p className="text-xs text-muted-foreground">Low SEO Score</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Filters & Bulk Actions */}
            <div className="px-6 pb-4 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterStatus} onValueChange={(v: FilterStatus) => setFilterStatus(v)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="missing">Missing URLs</SelectItem>
                    <SelectItem value="needs-improvement">Needs Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedProductIds.length > 0 && (
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-muted-foreground py-2">
                    {selectedProductIds.length} selected
                  </span>
                  <Button
                    size="sm"
                    onClick={handleGenerateSelected}
                    disabled={generateHandlesMutation.isPending}
                  >
                    {generateHandlesMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-2 h-4 w-4" />
                    )}
                    Generate URLs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncToShopify}
                    disabled={syncToShopifyMutation.isPending}
                  >
                    {syncToShopifyMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Sync to Shopify
                  </Button>
                </div>
              )}
            </div>

            {/* Products Table */}
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Current URL</TableHead>
                    <TableHead className="text-center">Length</TableHead>
                    <TableHead className="text-center">SEO Score</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingProducts ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No products found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProductIds.includes(product.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedProductIds([...selectedProductIds, product.id]);
                              } else {
                                setSelectedProductIds(selectedProductIds.filter((id) => id !== product.id));
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{product.title}</TableCell>
                        <TableCell>
                          {product.handle ? (
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {product.handle}
                            </code>
                          ) : (
                            <span className="text-xs text-muted-foreground">No URL</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {product.handle ? (
                            <span className={product.handle.length > 60 ? "text-orange-600 font-medium" : ""}>
                              {product.handle.length}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {product.handle ? (
                            <ScoreBadge score={calculateSEOScore(product.handle, product.title)} />
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {!product.handle ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              Missing
                            </span>
                          ) : product.handle.length > 60 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                              <AlertTriangle className="h-3 w-3" />
                              Too Long
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <Check className="h-3 w-3" />
                              OK
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {product.handle && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                window.open(`${storeBaseUrl}/products/${product.handle}`, '_blank');
                              }}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalCount > pageSize && (
                <div className="flex items-center justify-between px-2 py-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount} products
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={(currentPage + 1) * pageSize >= totalCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
  );
}

// Helper component for SEO score badge
function ScoreBadge({ score }: { score: number }) {
  let color = "text-green-600 bg-green-50";
  if (score < 50) color = "text-red-600 bg-red-50";
  else if (score < 75) color = "text-orange-600 bg-orange-50";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${color}`}>
      <TrendingUp className="h-3 w-3" />
      {score}
    </span>
  );
}

// Helper function to calculate SEO score (simplified)
function calculateSEOScore(handle: string, title: string): number {
  let score = 100;

  // Length scoring
  if (handle.length > 75) score -= 30;
  else if (handle.length > 60) score -= 15;
  else if (handle.length < 20) score -= 10;

  // Penalty for SKU-like patterns
  if (/\d{4,}/.test(handle)) score -= 20;

  // Penalty for too many numbers
  const numberCount = (handle.match(/\d/g) || []).length;
  if (numberCount > 3) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}
