import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  History,
  Search,
  Filter,
  ArrowRight,
  Package,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  Layers,
  FileText,
  Image,
  Tag,
  DollarSign,
  Box,
} from "lucide-react";

interface ChangelogEntry {
  id: string;
  tenantId: string;
  syncLogId: string | null;
  productId: string | null;
  shopifyProductId: string | null;
  productTitle: string;
  variantId: string | null;
  shopifyVariantId: string | null;
  variantTitle: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changeType: string;
  createdAt: string;
}

interface ChangelogResponse {
  changelog: ChangelogEntry[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface SyncSession {
  id: string;
  syncType: string;
  status: string;
  productsProcessed: number;
  productsCreated: number;
  productsUpdated: number;
  errorCount: number;
  duration: number | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

interface SyncSessionsResponse {
  sessions: SyncSession[];
  total: number;
  hasMore: boolean;
}

interface FieldBreakdown {
  field: string;
  count: number;
}

interface SyncInsights {
  session: SyncSession | null;
  fieldBreakdown: FieldBreakdown[];
  totalChanges: number;
  productsAffected: number;
}

// Field options for filtering
const fieldOptions = [
  { value: "all", label: "All Fields" },
  { value: "bulletPoints", label: "Bullet Points" },
  { value: "price", label: "Price" },
  { value: "compareAtPrice", label: "Compare At Price" },
  { value: "cost", label: "Cost" },
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
  { value: "status", label: "Status" },
  { value: "inventoryQuantity", label: "Inventory" },
  { value: "sku", label: "SKU" },
  { value: "barcode", label: "Barcode" },
  { value: "weight", label: "Weight" },
  { value: "images", label: "Product Images" },
  { value: "imageUrl", label: "Variant Image" },
  { value: "handle", label: "Handle" },
  { value: "vendor", label: "Vendor" },
  { value: "tags", label: "Tags" },
  { value: "productType", label: "Product Type" },
  { value: "shopifyCategoryPath", label: "Category" },
  { value: "styleNumber", label: "Style Number" },
];

// Get icon for field type
function getFieldIcon(field: string) {
  const fieldLower = field.toLowerCase();
  if (fieldLower.includes("price") || fieldLower.includes("cost")) return DollarSign;
  if (fieldLower.includes("image")) return Image;
  if (fieldLower.includes("tag")) return Tag;
  if (fieldLower.includes("bullet")) return FileText;
  if (fieldLower.includes("status")) return AlertCircle;
  return Box;
}

// Get badge color based on field type
function getFieldBadgeColor(field: string): string {
  const fieldLower = field.toLowerCase();

  // Pricing fields - green
  if (fieldLower.includes("price") || fieldLower.includes("cost")) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }
  // Inventory fields - blue
  if (fieldLower.includes("inventory") || fieldLower.includes("quantity")) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  }
  // Content fields (title, description, bulletPoints) - purple
  if (fieldLower.includes("title") || fieldLower.includes("description") || fieldLower.includes("bullet")) {
    return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
  }
  // Image fields - pink
  if (fieldLower.includes("image")) {
    return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400";
  }
  // Status fields - gray
  if (fieldLower.includes("status")) {
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
  // Organization fields (vendor, category, tags, productType) - orange
  if (fieldLower.includes("vendor") || fieldLower.includes("category") ||
      fieldLower.includes("tags") || fieldLower.includes("producttype")) {
    return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
  }
  // Identifier fields (handle, styleNumber, sku, barcode) - yellow
  if (fieldLower.includes("handle") || fieldLower.includes("stylenumber") ||
      fieldLower.includes("sku") || fieldLower.includes("barcode")) {
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  }
  // Default - cyan
  return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
}

// Format value for display
function formatValue(value: string | null, field: string): string {
  if (value === null || value === "") return "—";

  // Format price fields
  if (field.toLowerCase().includes("price") || field.toLowerCase().includes("cost")) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return `$${num.toFixed(2)}`;
    }
  }

  // Truncate long text
  if (value.length > 50) {
    return value.substring(0, 47) + "...";
  }

  return value;
}

// Value change display component
function ValueChangeDisplay({
  oldValue,
  newValue,
  field
}: {
  oldValue: string | null;
  newValue: string | null;
  field: string;
}) {
  const isPriceField = field.toLowerCase().includes("price") || field.toLowerCase().includes("cost");

  // Calculate price change
  let priceChange = null;
  let priceChangePercent = null;
  if (isPriceField && oldValue && newValue) {
    const oldNum = parseFloat(oldValue);
    const newNum = parseFloat(newValue);
    if (!isNaN(oldNum) && !isNaN(newNum) && oldNum !== 0) {
      priceChange = newNum - oldNum;
      priceChangePercent = ((priceChange / oldNum) * 100).toFixed(1);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-muted-foreground line-through text-sm">
        {formatValue(oldValue, field)}
      </span>
      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="font-medium text-sm">
        {formatValue(newValue, field)}
      </span>
      {priceChange !== null && (
        <Badge
          variant="outline"
          className={`text-xs ${priceChange > 0 ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'}`}
        >
          {priceChange > 0 ? (
            <TrendingUp className="h-3 w-3 mr-1" />
          ) : (
            <TrendingDown className="h-3 w-3 mr-1" />
          )}
          {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent}%)
        </Badge>
      )}
    </div>
  );
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

// Format duration (seconds to human readable)
function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

// Get status badge variant
function getStatusBadge(status: string) {
  switch (status.toUpperCase()) {
    case "SUCCESS":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    case "FAILED":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "IN_PROGRESS":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          In Progress
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">{status}</Badge>
      );
  }
}

export function SyncHistoryTab() {
  const [fieldFilter, setFieldFilter] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const pageSize = 25;

  // Fetch sync sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<SyncSessionsResponse>({
    queryKey: ["/api/sync-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/sync-sessions?limit=10", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch sync sessions");
      return response.json();
    },
  });

  // Fetch insights for selected session (or latest if none selected)
  const effectiveSessionId = selectedSessionId || sessionsData?.sessions?.[0]?.id || null;

  const { data: insightsData, isLoading: insightsLoading } = useQuery<SyncInsights>({
    queryKey: ["/api/sync-sessions", effectiveSessionId, "insights"],
    queryFn: async () => {
      if (!effectiveSessionId) return null;
      const response = await fetch(`/api/sync-sessions/${effectiveSessionId}/insights`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch sync insights");
      return response.json();
    },
    enabled: !!effectiveSessionId,
  });

  // Fetch changelog data
  const { data, isLoading, error } = useQuery<ChangelogResponse>({
    queryKey: ["/api/sync-changelog", fieldFilter, productSearch, currentPage, pageSize, effectiveSessionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fieldFilter !== "all") params.append("field", fieldFilter);
      if (productSearch) params.append("product", productSearch);
      if (effectiveSessionId) params.append("syncLogId", effectiveSessionId);
      params.append("limit", String(pageSize));
      params.append("offset", String(currentPage * pageSize));

      const response = await fetch(`/api/sync-changelog?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch changelog");
      return response.json();
    },
  });

  const handleSearch = () => {
    setProductSearch(searchInput);
    setCurrentPage(0);
  };

  const clearFilters = () => {
    setFieldFilter("all");
    setProductSearch("");
    setSearchInput("");
    setCurrentPage(0);
  };

  const hasFilters = fieldFilter !== "all" || productSearch !== "";

  return (
    <div className="space-y-6">
      {/* Sync Sessions Overview */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Recent Syncs
              </CardTitle>
              <CardDescription className="mt-1">
                Select a sync session to view its details
              </CardDescription>
            </div>
            {sessionsData && (
              <Badge variant="secondary">
                {sessionsData.total} total sync{sessionsData.total !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !sessionsData || sessionsData.sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No sync sessions found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sessionsData.sessions.slice(0, 8).map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    setSelectedSessionId(session.id === selectedSessionId ? null : session.id);
                    setCurrentPage(0);
                  }}
                  className={`p-3 rounded-lg border text-left transition-all hover:shadow-md ${
                    effectiveSessionId === session.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    {getStatusBadge(session.status)}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(session.startedAt)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-semibold">{session.productsProcessed}</p>
                      <p className="text-xs text-muted-foreground">Processed</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-blue-600">{session.productsUpdated}</p>
                      <p className="text-xs text-muted-foreground">Updated</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-green-600">{session.productsCreated}</p>
                      <p className="text-xs text-muted-foreground">Created</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(session.duration)}
                    </span>
                    {session.errorCount > 0 && (
                      <span className="text-red-500">{session.errorCount} errors</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Field Breakdown Insights */}
      {effectiveSessionId && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Sync Insights
                </CardTitle>
                <CardDescription className="mt-1">
                  Field-level breakdown of changes in this sync
                </CardDescription>
              </div>
              {insightsData && (
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{insightsData.totalChanges}</p>
                    <p className="text-xs text-muted-foreground">Total Changes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{insightsData.productsAffected}</p>
                    <p className="text-xs text-muted-foreground">Products</p>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {insightsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !insightsData || insightsData.fieldBreakdown.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Layers className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No changes recorded in this sync</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {insightsData.fieldBreakdown.map((item) => {
                  const Icon = getFieldIcon(item.field);
                  const badgeColor = getFieldBadgeColor(item.field);
                  const percentage = insightsData.totalChanges > 0
                    ? ((item.count / insightsData.totalChanges) * 100).toFixed(1)
                    : 0;

                  return (
                    <button
                      key={item.field}
                      onClick={() => {
                        setFieldFilter(item.field);
                        setCurrentPage(0);
                      }}
                      className={`p-3 rounded-lg border text-left transition-all hover:shadow-md ${
                        fieldFilter === item.field
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded ${badgeColor}`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <span className="text-xs font-medium truncate">{item.field}</span>
                      </div>
                      <p className="text-2xl font-bold">{item.count.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{percentage}% of changes</p>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Filters</CardTitle>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Product Search */}
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch} variant="secondary">
                Search
              </Button>
            </div>

            {/* Field Filter */}
            <Select value={fieldFilter} onValueChange={(v) => { setFieldFilter(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by field" />
              </SelectTrigger>
              <SelectContent>
                {fieldOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Change Details
              </CardTitle>
              <CardDescription className="mt-1">
                Individual field-level changes from Shopify syncs
              </CardDescription>
            </div>
            {data && (
              <Badge variant="secondary">
                {data.total} change{data.total !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Failed to load changelog. Please try again.</p>
            </div>
          ) : !data || data.changelog.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                No Changes Found
              </h3>
              <p className="text-sm text-muted-foreground">
                {hasFilters
                  ? "Try adjusting your filters to see more results."
                  : "Changes will appear here after your next Shopify sync."}
              </p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Product</TableHead>
                      <TableHead className="w-[120px]">Field</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead className="w-[100px] text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.changelog.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <Package className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate" title={entry.productTitle}>
                                {entry.productTitle}
                              </p>
                              {entry.variantTitle && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {entry.variantTitle}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${getFieldBadgeColor(entry.field)} border-0`}
                          >
                            {entry.field}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ValueChangeDisplay
                            oldValue={entry.oldValue}
                            newValue={entry.newValue}
                            field={entry.field}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm text-muted-foreground" title={new Date(entry.createdAt).toLocaleString()}>
                            {formatRelativeTime(entry.createdAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data.total > pageSize && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, data.total)} of {data.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => p + 1)}
                      disabled={!data.hasMore}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
