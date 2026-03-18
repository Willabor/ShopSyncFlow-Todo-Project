import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import {
  BarChart3,
  RefreshCcw,
  Package,
  CheckCircle2,
  FileEdit,
  Archive,
  AlertTriangle,
  ImageOff,
  FileText,
  Building2,
  DollarSign,
  Tag,
  Zap,
  XCircle,
  Clock,
} from "lucide-react";
import { Link } from "wouter";

interface StatusOverview {
  total: number;
  active: { count: number; percentage: number };
  draft: { count: number; percentage: number };
  archived: { count: number; percentage: number };
  localDraft: { count: number; percentage: number };
}

interface DataQuality {
  missingImages: number;
  missingDescriptions: number;
  missingVendors: number;
  duplicateSKUs: number;
  zeroPrice: number;
}

interface DuplicateSkusResponse {
  duplicates: Array<{
    sku: string;
    count: number;
    products: Array<{
      id: string;
      title: string;
      vendor: string;
      status: string;
    }>;
  }>;
}

interface IssueProductsResponse {
  products: Array<{
    id: string;
    title: string;
    vendor: string;
    status: string;
    sku?: string;
  }>;
  total: number;
}

interface VendorStat {
  id: string;
  name: string;
  productCount: number;
  activeCount: number;
  draftCount: number;
  archivedCount: number;
  color: string | null;
}

interface ArchiveAgeMetrics {
  lessThan1Month: number;
  oneToThreeMonths: number;
  threeToSixMonths: number;
  sixToTwelveMonths: number;
  oneToTwoYears: number;
  overTwoYears: number;
  totalArchived: number;
}

interface DashboardData {
  statusOverview: StatusOverview;
  dataQuality: DataQuality;
  topVendors: VendorStat[];
  archiveAge: ArchiveAgeMetrics;
  lastUpdated: string;
}

export default function ProductInsights() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  const { data: dashboardData, isLoading, refetch, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ["/api/products/insights/dashboard"],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    staleTime: 4 * 60 * 1000, // Consider stale after 4 minutes
  });

  // Query for products with specific quality issue
  const { data: issueProducts, isLoading: isLoadingIssue } = useQuery<IssueProductsResponse>({
    queryKey: ["/api/products/insights/quality", selectedIssue],
    enabled: !!selectedIssue && selectedIssue !== "duplicate-skus",
  });

  // Query for duplicate SKUs
  const { data: duplicateSkus, isLoading: isLoadingDuplicates } = useQuery<DuplicateSkusResponse>({
    queryKey: ["/api/products/insights/duplicate-skus"],
    enabled: selectedIssue === "duplicate-skus",
  });

  // Force refresh mutation (clears server cache)
  const forceRefreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/products/insights/clear-cache", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to clear cache");
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch after clearing cache
      queryClient.invalidateQueries({ queryKey: ["/api/products/insights/dashboard"] });
      refetch();
      toast({
        title: "✅ Cache Cleared",
        description: "Fetching fresh data from database...",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Failed to Clear Cache",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cacheAge = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : 0;
  const isCacheOld = cacheAge > 240; // Older than 4 minutes

  if (isLoading) {
    return (
      <MainLayout title="Product Insights" subtitle="Loading...">
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCcw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading insights...</p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!dashboardData) {
    return (
      <MainLayout title="Product Insights" subtitle="Data unavailable">
        <div className="p-8">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Failed to load insights data
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const { statusOverview, dataQuality, topVendors, archiveAge, lastUpdated } = dashboardData;
  const hasQualityIssues =
    dataQuality.missingImages > 0 ||
    dataQuality.missingDescriptions > 0 ||
    dataQuality.missingVendors > 0 ||
    dataQuality.duplicateSKUs > 0 ||
    dataQuality.zeroPrice > 0;

  const hasOldArchives = archiveAge ? (archiveAge.oneToTwoYears > 0 || archiveAge.overTwoYears > 0) : false;

  return (
    <MainLayout
      title="Product Insights"
      subtitle={`Last updated: ${new Date(lastUpdated).toLocaleString()}${cacheAge > 0 ? ` (cached ${cacheAge}s ago)` : ''}`}
      actions={
        <div className="flex gap-2">
          <Button
            onClick={() => forceRefreshMutation.mutate()}
            variant="outline"
            disabled={forceRefreshMutation.isPending}
          >
            {forceRefreshMutation.isPending ? (
              <>
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                Clearing Cache...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Force Refresh
              </>
            )}
          </Button>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="p-8 space-y-6">
        {/* Back Link */}
        <div className="flex items-center gap-2">
          <Link href="/products">
            <Button variant="ghost" size="sm">
              ← Back to Products
            </Button>
          </Link>
        </div>

          {/* Status Overview Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statusOverview.total}</div>
                <p className="text-xs text-muted-foreground mt-1">All products</p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-900">Active</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-900">
                  {statusOverview.active.count}
                </div>
                <p className="text-xs text-green-700 mt-1">
                  {statusOverview.active.percentage}% of total
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-900">Draft</CardTitle>
                <FileEdit className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900">
                  {statusOverview.draft.count}
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  {statusOverview.draft.percentage}% of total
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-gray-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-900">Archived</CardTitle>
                <Archive className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">
                  {statusOverview.archived.count}
                </div>
                <p className="text-xs text-gray-700 mt-1">
                  {statusOverview.archived.percentage}% of total
                </p>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-900">
                  Local Draft
                </CardTitle>
                <FileEdit className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-900">
                  {statusOverview.localDraft.count}
                </div>
                <p className="text-xs text-purple-700 mt-1">
                  {statusOverview.localDraft.percentage}% of total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Data Quality Issues */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {hasQualityIssues ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                    Data Quality Issues
                  </CardTitle>
                  <CardDescription>
                    {hasQualityIssues
                      ? "Issues detected that may affect product quality"
                      : "No data quality issues found"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {hasQualityIssues ? (
                <div className="space-y-3">
                  {dataQuality.missingImages > 0 && (
                    <div
                      className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50 cursor-pointer hover:bg-yellow-100 transition-colors"
                      onClick={() => setSelectedIssue("missing-images")}
                    >
                      <div className="flex items-center gap-3">
                        <ImageOff className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-sm">Missing Images</p>
                          <p className="text-xs text-muted-foreground">
                            {dataQuality.missingImages} products without images
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {dataQuality.missingImages}
                      </Badge>
                    </div>
                  )}

                  {dataQuality.missingDescriptions > 0 && (
                    <div
                      className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50 cursor-pointer hover:bg-yellow-100 transition-colors"
                      onClick={() => setSelectedIssue("missing-descriptions")}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-sm">Missing Descriptions</p>
                          <p className="text-xs text-muted-foreground">
                            {dataQuality.missingDescriptions} products without descriptions
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {dataQuality.missingDescriptions}
                      </Badge>
                    </div>
                  )}

                  {dataQuality.missingVendors > 0 && (
                    <div
                      className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50 cursor-pointer hover:bg-yellow-100 transition-colors"
                      onClick={() => setSelectedIssue("missing-vendors")}
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-sm">Missing Vendors</p>
                          <p className="text-xs text-muted-foreground">
                            {dataQuality.missingVendors} products without vendors
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {dataQuality.missingVendors}
                      </Badge>
                    </div>
                  )}

                  {dataQuality.duplicateSKUs > 0 && (
                    <div
                      className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
                      onClick={() => setSelectedIssue("duplicate-skus")}
                    >
                      <div className="flex items-center gap-3">
                        <Tag className="h-5 w-5 text-red-600" />
                        <div>
                          <p className="font-medium text-sm">Duplicate SKUs</p>
                          <p className="text-xs text-muted-foreground">
                            {dataQuality.duplicateSKUs} SKUs used by multiple products
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-red-100 text-red-800">
                        {dataQuality.duplicateSKUs}
                      </Badge>
                    </div>
                  )}

                  {dataQuality.zeroPrice > 0 && (
                    <div
                      className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50 cursor-pointer hover:bg-yellow-100 transition-colors"
                      onClick={() => setSelectedIssue("zero-price")}
                    >
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-5 w-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-sm">Zero/Missing Price</p>
                          <p className="text-xs text-muted-foreground">
                            {dataQuality.zeroPrice} products with $0 or missing price
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
                        {dataQuality.zeroPrice}
                      </Badge>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                  <p className="text-sm font-medium">All products have good data quality</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No missing images, descriptions, or duplicate SKUs
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Archive Management */}
          {archiveAge && (
            <Card className="border-orange-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-orange-600" />
                      Archive Management
                    </CardTitle>
                    <CardDescription>
                      Age-based cleanup recommendations for archived products
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Archive Age Distribution */}
                <div className="space-y-3 mb-4">
                  <p className="text-sm font-medium">Archive Age Distribution</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-green-50 border border-green-200 rounded">
                      <p className="text-green-900 font-medium">{"< 1 month"}</p>
                      <p className="text-green-700">{archiveAge.lessThan1Month} products</p>
                    </div>
                    <div className="p-2 bg-green-50 border border-green-200 rounded">
                      <p className="text-green-900 font-medium">1-3 months</p>
                      <p className="text-green-700">{archiveAge.oneToThreeMonths} products</p>
                    </div>
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-blue-900 font-medium">3-6 months</p>
                      <p className="text-blue-700">{archiveAge.threeToSixMonths} products</p>
                    </div>
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-yellow-900 font-medium">6-12 months</p>
                      <p className="text-yellow-700">{archiveAge.sixToTwelveMonths} products</p>
                    </div>
                    <div className="p-2 bg-orange-50 border border-orange-200 rounded">
                      <p className="text-orange-900 font-medium">1-2 years</p>
                      <p className="text-orange-700">{archiveAge.oneToTwoYears} products</p>
                    </div>
                    <div className="p-2 bg-red-50 border border-red-200 rounded">
                      <p className="text-red-900 font-medium">{"2+ years"}</p>
                      <p className="text-red-700">{archiveAge.overTwoYears} products</p>
                    </div>
                  </div>
                </div>

                {/* Action Items */}
                {hasOldArchives ? (
                  <div className="space-y-3">
                    {archiveAge.oneToTwoYears > 0 && (
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-sm">Review Candidates</p>
                            <p className="text-xs text-muted-foreground">
                              {archiveAge.oneToTwoYears} archived products over 1 year old - unlikely to return
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="mt-2 w-full">
                          Review Products (1-2 years old)
                        </Button>
                      </div>
                    )}

                    {archiveAge.overTwoYears > 0 && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-sm">Delete Candidates</p>
                            <p className="text-xs text-muted-foreground">
                              {archiveAge.overTwoYears} archived products over 2 years old - not returning
                            </p>
                          </div>
                        </div>
                        <Button variant="destructive" size="sm" className="mt-2 w-full">
                          Review for Deletion (2+ years old)
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-medium">No old archives found</p>
                    <p className="text-xs text-muted-foreground">
                      All archived products are less than 1 year old - store is actively maintained
                    </p>
                  </div>
                )}

                {/* Info note */}
                <div className="mt-4 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                  <p className="font-medium mb-1">📝 Note: Age based on Shopify's last update time</p>
                  <p className="text-blue-700">
                    Products archived over 1 year ago are unlikely to return. Products over 2 years old
                    should be reviewed for permanent deletion to free up storage.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Vendors */}
          <Card>
            <CardHeader>
              <CardTitle>Top Vendors by Product Count</CardTitle>
              <CardDescription>Showing top {topVendors.length} vendors</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topVendors.map((vendor, index) => {
                  const maxCount = topVendors[0]?.productCount || 1;
                  const barWidth = (vendor.productCount / maxCount) * 100;

                  return (
                    <div key={vendor.id} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: vendor.color || "#94a3b8",
                            }}
                          />
                          <span className="font-medium">{vendor.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="text-green-600">{vendor.activeCount} active</span>
                          <span className="text-blue-600">{vendor.draftCount} draft</span>
                          <span className="text-gray-600">
                            {vendor.archivedCount} archived
                          </span>
                          <span className="font-semibold text-foreground">
                            {vendor.productCount} total
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

      {/* Products with Quality Issues Modal */}
      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedIssue === "missing-images" && "Products Missing Images"}
              {selectedIssue === "missing-descriptions" && "Products Missing Descriptions"}
              {selectedIssue === "missing-vendors" && "Products Missing Vendors"}
              {selectedIssue === "zero-price" && "Products with Zero/Missing Price"}
              {selectedIssue === "duplicate-skus" && "Duplicate SKUs"}
            </DialogTitle>
            <DialogDescription>
              {selectedIssue === "duplicate-skus"
                ? "SKUs that are used by multiple products"
                : `List of products with this data quality issue`}
            </DialogDescription>
          </DialogHeader>

          {isLoadingIssue || isLoadingDuplicates ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCcw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : selectedIssue === "duplicate-skus" && duplicateSkus ? (
            <div className="space-y-4">
              {duplicateSkus.duplicates?.map((dup) => (
                <div key={dup.sku} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-red-600" />
                      <p className="font-medium">SKU: {dup.sku}</p>
                    </div>
                    <Badge variant="destructive">{dup.count} products</Badge>
                  </div>
                  <div className="space-y-2 mt-3">
                    {dup.products.map((product) => (
                      <Link key={product.id} href={`/products/${product.id}`}>
                        <div className="flex items-center justify-between p-2 rounded bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
                          <div>
                            <p className="text-sm font-medium">{product.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.vendor} • {product.status}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : issueProducts && issueProducts.products ? (
            <div className="space-y-2">
              {issueProducts.products.map((product) => (
                <Link key={product.id} href={`/products/${product.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex-1">
                      <p className="font-medium">{product.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-muted-foreground">{product.vendor}</p>
                        <span className="text-muted-foreground">•</span>
                        <Badge variant="outline" className="text-xs">
                          {product.status}
                        </Badge>
                        {product.sku && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {issueProducts.total > issueProducts.products.length && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Showing {issueProducts.products.length} of {issueProducts.total} products
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No products found
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
