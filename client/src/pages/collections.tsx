import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { ManageProductsModal } from "@/components/manage-products-modal";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
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
  Folder,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  FolderOpen,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  TrendingUp,
  ImageOff,
  FileX,
  Info,
} from "lucide-react";
import type { Collection, InsertCollection } from "@shared/schema";
import { generateHandle } from "@/lib/handle-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SmartCollectionRulesBuilder,
  createEmptyRulesStructure,
  validateRules,
  type SmartCollectionRules,
} from "@/components/SmartCollectionRulesBuilder";

type ActiveFilter = "all" | "active" | "inactive";

interface DuplicateCollection {
  id: string;
  shopifyCollectionId: string;
  name: string;
  shopifyHandle: string;
  shopifyType: string;
  description: string | null;
  productsCount: number;
  existingCollectionId: string;
  status: string;
  detectedAt: string;
}

function DuplicateCollectionsCard() {
  const [showDialog, setShowDialog] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/collections/duplicates"],
    queryFn: async () => {
      const response = await fetch("/api/collections/duplicates", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch duplicate collections");
      }

      return response.json() as Promise<{ duplicates: DuplicateCollection[]; count: number }>;
    },
  });

  const duplicates = data?.duplicates || [];
  const count = data?.count || 0;

  // Don't show the card if there are no duplicates
  if (isLoading || count === 0) {
    return null;
  }

  return (
    <>
      <Card
        className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 cursor-pointer hover:border-amber-300 transition-colors"
        onClick={() => setShowDialog(true)}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base text-amber-900 dark:text-amber-100">
                Duplicate Collection Names Detected
              </CardTitle>
              <CardDescription className="text-amber-700 dark:text-amber-300 mt-1">
                {count} collection{count !== 1 ? 's' : ''} from Shopify could not be synced due to duplicate names.
                Click to view details.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Duplicate Collections ({count})
            </DialogTitle>
            <DialogDescription>
              These collections exist in Shopify but have the same name as collections already in your local database.
              Shopify allows multiple collections with the same name, but our system requires unique names.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collection Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead>Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates.map((dup) => (
                  <TableRow key={dup.id}>
                    <TableCell className="font-medium">{dup.name}</TableCell>
                    <TableCell>
                      <Badge variant={dup.shopifyType === 'smart' ? 'default' : 'secondary'}>
                        {dup.shopifyType || 'manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>{dup.productsCount}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {dup.shopifyHandle}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(dup.detectedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                What does this mean?
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                Shopify allows multiple collections to share the same name (distinguished by their unique IDs).
                However, this system requires each collection to have a unique name for clarity and management purposes.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Recommendation:</strong> Rename the duplicate collections in Shopify to have unique names, then sync again.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CollectionsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Sorting state
  type SortColumn = "name" | "productCount" | "createdAt" | "isActive";
  type SortDirection = "asc" | "desc";
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showManageProductsModal, setShowManageProductsModal] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

  // Insights panel state
  const [showInsights, setShowInsights] = useState(false);

  // Form state
  // Extended form data type for create modal
  type CreateFormData = Partial<InsertCollection> & {
    shopifyType?: "manual" | "smart";
    rules?: SmartCollectionRules;
  };

  const [formData, setFormData] = useState<CreateFormData>({
    name: "",
    slug: "",
    description: "",
    isActive: true,
    displayOrder: 0,
    shopifyType: "manual",
    rules: createEmptyRulesStructure(),
  });

  // Reset page to 0 when search query or filter changes
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, activeFilter, pageSize]);

  // Fetch collections with server-side filters, search, pagination, and sorting
  const { data: collectionData, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/collections", activeFilter, searchQuery, currentPage, pageSize, sortColumn, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (activeFilter === "active") {
        params.append("isActive", "true");
      } else if (activeFilter === "inactive") {
        params.append("isActive", "false");
      }

      if (searchQuery) {
        params.append("search", searchQuery);
      }

      params.append("limit", String(pageSize));
      params.append("offset", String(currentPage * pageSize));

      // Add sorting parameters
      if (sortColumn) {
        params.append("sortBy", sortColumn);
        params.append("sortOrder", sortDirection);
      }

      const url = `/api/collections?${params}`;

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch collections");
      }

      const data = await response.json();

      // Update total count for pagination
      if (data.total !== undefined) {
        setTotalCount(data.total);
      }

      return data;
    },
  });

  // Fetch analytics data
  const { data: analyticsData } = useQuery({
    queryKey: ["/api/collections/analytics"],
    queryFn: async () => {
      const response = await fetch("/api/collections/analytics", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      return response.json();
    },
    enabled: showInsights, // Only fetch when insights panel is open
  });

  // Extract collections array from response (already sorted by server)
  const collections = collectionData?.collections || [];

  // Sorting functions
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  // Create collection mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertCollection>) => {
      // Filter out empty slug - server will auto-generate from name
      const payload = { ...data };
      if (payload.slug === "" || payload.slug === undefined) {
        delete payload.slug;
      }

      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create collection");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({
        title: "✅ Collection Created",
        description: "Collection created successfully.",
      });
      setShowCreateModal(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Create Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update collection mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Collection> }) => {
      const response = await fetch(`/api/collections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update collection");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({
        title: "✅ Collection Updated",
        description: "Collection updated successfully.",
      });
      setShowEditModal(false);
      setSelectedCollection(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete collection mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/collections/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete collection");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({
        title: "✅ Collection Deleted",
        description: "Collection deleted successfully.",
      });
      setShowDeleteDialog(false);
      setSelectedCollection(null);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form handlers
  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      isActive: true,
      displayOrder: 0,
      shopifyType: "manual",
      rules: createEmptyRulesStructure(),
    });
  };

  const handleCreate = () => {
    setShowCreateModal(true);
    resetForm();
  };

  const handleEdit = (collection: Collection) => {
    // Navigate to full edit page instead of modal
    navigate(`/collections/${collection.id}/edit`);
    /* OLD MODAL CODE - Keeping for reference
    setSelectedCollection(collection);
    setFormData({
      name: collection.name,
      slug: collection.slug,
      description: collection.description || "",
      isActive: collection.isActive,
      displayOrder: collection.displayOrder,
    });
    setShowEditModal(true);
    */
  };

  const handleDelete = (collection: Collection) => {
    setSelectedCollection(collection);
    setShowDeleteDialog(true);
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate smart collection rules if smart type is selected
    if (formData.shopifyType === "smart" && formData.rules) {
      // Must have at least one rule for smart collections
      if (formData.rules.rules.length === 0) {
        toast({
          title: "Validation Error",
          description: "Smart collections require at least one condition.",
          variant: "destructive",
        });
        return;
      }

      const validation = validateRules(formData.rules);
      if (!validation.valid) {
        toast({
          title: "Validation Error",
          description: validation.errors[0],
          variant: "destructive",
        });
        return;
      }
    }

    // Prepare payload - include rules only for smart collections
    const payload: CreateFormData = {
      ...formData,
      rules: formData.shopifyType === "smart" ? formData.rules : undefined,
    };

    createMutation.mutate(payload);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCollection) {
      updateMutation.mutate({ id: selectedCollection.id, data: formData });
    }
  };

  const handleConfirmDelete = () => {
    if (selectedCollection) {
      deleteMutation.mutate(selectedCollection.id);
    }
  };

  if (error) {
    return (
      <MainLayout title="Collections" subtitle="Organize products into collections for better management">
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Collections</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load collections"}
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
      title="Collections"
      subtitle="Organize products into collections for better management"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Collection
          </Button>
        </div>
      }
    >
      <div className="p-8 space-y-6">

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {searchQuery || activeFilter !== "all" ? "Showing Collections" : "Total Collections"}
                </CardTitle>
                <Folder className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {collections.length} / {totalCount.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {searchQuery || activeFilter !== "all" ? "filtered results" : "in catalog"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <FolderOpen className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {collections.filter((c: Collection) => c.isActive).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inactive</CardTitle>
                <Folder className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {collections.filter((c: Collection) => !c.isActive).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {collections.reduce((sum: number, c: Collection) => sum + c.productCount, 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Duplicate Collections Warning */}
          <DuplicateCollectionsCard />

          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Status Tabs */}
                <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as ActiveFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">
                      All ({collections.length})
                    </TabsTrigger>
                    <TabsTrigger value="active">
                      Active ({collections.filter((c: Collection) => c.isActive).length})
                    </TabsTrigger>
                    <TabsTrigger value="inactive">
                      Inactive ({collections.filter((c: Collection) => !c.isActive).length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Search */}
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search collections..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>

            {/* Insights Panel */}
            <div className="border-t">
              <button
                onClick={() => setShowInsights(!showInsights)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Collection Insights</span>
                  {analyticsData && (
                    <span className="text-xs text-muted-foreground">
                      {analyticsData.emptyCollections.age90Days > 0 && (
                        <span className="text-amber-600">
                          {analyticsData.emptyCollections.age90Days} cleanup candidates
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {showInsights ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {showInsights && analyticsData && (
                <div className="px-6 pb-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Quick Stats */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Quick Stats
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Collections:</span>
                          <span className="font-semibold">{analyticsData.total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">With Products:</span>
                          <span className="font-semibold text-green-600">{analyticsData.withProducts}</span>
                        </div>
                        <div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Empty:</span>
                            <span className="font-semibold text-amber-600">{analyticsData.withoutProducts}</span>
                          </div>
                          {analyticsData.withoutProducts > 0 && analyticsData.withoutProductsList && (
                            <div className="mt-2">
                              <details className="group">
                                <summary className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                                  <Info className="h-3 w-3" />
                                  View {Math.min(20, analyticsData.withoutProducts)} collections
                                </summary>
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                  {analyticsData.withoutProductsList.map((col: any) => (
                                    <div key={col.id} className="text-xs p-2 bg-muted rounded">
                                      <span className="truncate">{col.name}</span>
                                    </div>
                                  ))}
                                  {analyticsData.withoutProducts > 20 && (
                                    <p className="text-xs text-muted-foreground italic">
                                      +{analyticsData.withoutProducts - 20} more...
                                    </p>
                                  )}
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <span className="text-muted-foreground">From Shopify:</span>
                          <span className="font-semibold">{analyticsData.fromShopify}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Local Only:</span>
                          <span className="font-semibold">{analyticsData.localOnly}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Data Quality Issues */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          Data Issues
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <ImageOff className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Missing Images:</span>
                              <span className={analyticsData.missingImages > 0 ? "font-semibold text-amber-600" : "font-semibold text-green-600"}>
                                {analyticsData.missingImages}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Collections with products but no image
                            </p>
                            {analyticsData.missingImages > 0 && analyticsData.missingImagesList && (
                              <div className="mt-2">
                                <details className="group">
                                  <summary className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    View {Math.min(20, analyticsData.missingImages)} collections
                                  </summary>
                                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                    {analyticsData.missingImagesList.map((col: any) => (
                                      <div key={col.id} className="text-xs p-2 bg-muted rounded flex justify-between items-center">
                                        <span className="truncate flex-1">{col.name}</span>
                                        <span className="text-muted-foreground ml-2">{col.productCount} items</span>
                                      </div>
                                    ))}
                                    {analyticsData.missingImages > 20 && (
                                      <p className="text-xs text-muted-foreground italic">
                                        +{analyticsData.missingImages - 20} more...
                                      </p>
                                    )}
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 pt-2 border-t">
                          <FileX className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Missing SEO:</span>
                              <span className={analyticsData.missingSEO > 0 ? "font-semibold text-amber-600" : "font-semibold text-green-600"}>
                                {analyticsData.missingSEO}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Shopify collections without SEO metadata
                            </p>
                            {analyticsData.missingSEO > 0 && analyticsData.missingSEOList && (
                              <div className="mt-2">
                                <details className="group">
                                  <summary className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    View {Math.min(20, analyticsData.missingSEO)} collections
                                  </summary>
                                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                    {analyticsData.missingSEOList.map((col: any) => (
                                      <div key={col.id} className="text-xs p-2 bg-muted rounded flex justify-between items-center">
                                        <span className="truncate flex-1">{col.name}</span>
                                        <span className="text-muted-foreground ml-2">{col.productCount} items</span>
                                      </div>
                                    ))}
                                    {analyticsData.missingSEO > 20 && (
                                      <p className="text-xs text-muted-foreground italic">
                                        +{analyticsData.missingSEO - 20} more...
                                      </p>
                                    )}
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        </div>
                        {analyticsData.smartCollections > 0 && (
                          <div className="pt-2 border-t">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Smart Collections:</span>
                              <span className="font-semibold">{analyticsData.smartCollections}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Manual Collections:</span>
                              <span className="font-semibold">{analyticsData.manualCollections}</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Cleanup Candidates */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Trash2 className="h-4 w-4 text-red-600" />
                          Cleanup Candidates
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Empty 30+ days:</span>
                          <span className="font-semibold">{analyticsData.emptyCollections.age30Days}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Empty 60+ days:</span>
                          <span className="font-semibold">{analyticsData.emptyCollections.age60Days}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Empty 90+ days:</span>
                          <span className="font-semibold text-amber-600">{analyticsData.emptyCollections.age90Days}</span>
                        </div>
                        <div className="flex justify-between pb-2">
                          <span className="text-muted-foreground">Empty 180+ days:</span>
                          <span className="font-semibold text-red-600">{analyticsData.emptyCollections.age180Days}</span>
                        </div>

                        {analyticsData.emptyCollections.age90Days > 0 && (
                          <div className="pt-2 border-t">
                            <details className="group">
                              <summary className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                View {analyticsData.emptyCollections.age90Days} collections (90+ days)
                              </summary>
                              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                {analyticsData.emptyCollections.age90DaysList.slice(0, 10).map((col: any) => (
                                  <div key={col.id} className="text-xs p-2 bg-muted rounded flex justify-between items-center">
                                    <span className="truncate flex-1">{col.name}</span>
                                    <span className="text-muted-foreground ml-2">{col.daysOld}d</span>
                                  </div>
                                ))}
                                {analyticsData.emptyCollections.age90DaysList.length > 10 && (
                                  <p className="text-xs text-muted-foreground italic">
                                    +{analyticsData.emptyCollections.age90DaysList.length - 10} more...
                                  </p>
                                )}
                              </div>
                            </details>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>

            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">Loading collections...</span>
                </div>
              ) : collections.length === 0 ? (
                <div className="text-center py-12">
                  <Folder className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mt-4 text-lg font-semibold">No collections found</h3>
                  <p className="text-muted-foreground mt-2">
                    {searchQuery
                      ? `No collections match "${searchQuery}"`
                      : activeFilter !== "all"
                      ? `No ${activeFilter} collections`
                      : "Create your first collection to get started"
                    }
                  </p>
                  {!searchQuery && activeFilter === "all" && (
                    <Button className="mt-4" onClick={handleCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Collection
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <button
                            onClick={() => handleSort("name")}
                            className="flex items-center hover:text-foreground transition-colors font-medium"
                          >
                            Name
                            {getSortIcon("name")}
                          </button>
                        </TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>
                          <button
                            onClick={() => handleSort("productCount")}
                            className="flex items-center hover:text-foreground transition-colors font-medium"
                          >
                            Products
                            {getSortIcon("productCount")}
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            onClick={() => handleSort("isActive")}
                            className="flex items-center hover:text-foreground transition-colors font-medium"
                          >
                            Status
                            {getSortIcon("isActive")}
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            onClick={() => handleSort("createdAt")}
                            className="flex items-center hover:text-foreground transition-colors font-medium"
                          >
                            Created
                            {getSortIcon("createdAt")}
                          </button>
                        </TableHead>
                        <TableHead className="w-[70px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collections.map((collection: Collection) => (
                        <TableRow
                          key={collection.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleEdit(collection)}
                        >
                          <TableCell>
                            <div className="font-medium flex items-center gap-3">
                              {collection.image ? (
                                <img
                                  src={collection.image}
                                  alt={collection.name}
                                  className="h-10 w-10 rounded object-cover border"
                                  onError={(e) => {
                                    // Fallback to folder icon if image fails to load
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                              ) : null}
                              {collection.isActive ? (
                                <FolderOpen className={`h-4 w-4 text-green-600 ${collection.image ? 'hidden' : ''}`} />
                              ) : (
                                <Folder className={`h-4 w-4 text-gray-400 ${collection.image ? 'hidden' : ''}`} />
                              )}
                              <div>
                                <div>{collection.name}</div>
                                {collection.shopifyCollectionId && (
                                  <div className="text-xs text-muted-foreground">
                                    {collection.shopifyType === 'smart' ? '🤖 Smart' : '📁 Manual'} Collection
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {collection.slug}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-md truncate text-sm text-muted-foreground">
                              {collection.description || "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {collection.productCount} products
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={collection.isActive ? "bg-green-500" : "bg-gray-400"}>
                              {collection.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {new Date(collection.createdAt).toLocaleDateString()}
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
                                <DropdownMenuItem onClick={() => handleEdit(collection)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                  setSelectedCollection(collection);
                                  setShowManageProductsModal(true);
                                }}>
                                  <Package className="mr-2 h-4 w-4" />
                                  Manage Products
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDelete(collection)}
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
                  {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount} collections
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

        {/* Create Collection Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Collection</DialogTitle>
              <DialogDescription>
                Add a new collection to organize your products
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitCreate}>
              <div className="space-y-4 py-4">
                {/* Collection Type Selector */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Collection Type *</Label>
                  <RadioGroup
                    value={formData.shopifyType || "manual"}
                    onValueChange={(value: "manual" | "smart") =>
                      setFormData({ ...formData, shopifyType: value })
                    }
                    className="grid grid-cols-2 gap-4"
                  >
                    <div className="relative">
                      <RadioGroupItem
                        value="manual"
                        id="type-manual"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="type-manual"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                      >
                        <Package className="mb-3 h-6 w-6" />
                        <span className="font-semibold">Manual</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          Hand-pick products to include
                        </span>
                      </Label>
                    </div>
                    <div className="relative">
                      <RadioGroupItem
                        value="smart"
                        id="type-smart"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="type-smart"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                      >
                        <RefreshCw className="mb-3 h-6 w-6" />
                        <span className="font-semibold">Smart</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          Auto-include matching products
                        </span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    placeholder="e.g., Summer Collection"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                  {/* Handle Preview */}
                  {formData.name && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="text-blue-800 font-medium">Handle Preview</p>
                          <p className="text-blue-700 mt-1">
                            URL will be: <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-xs">/collections/{generateHandle(formData.name || "")}</code>
                          </p>
                          <p className="text-blue-600 text-xs mt-2">
                            This handle is <strong>permanent</strong>. Changing the name later will NOT change the URL.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Smart Collection Rules Builder */}
                {formData.shopifyType === "smart" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Conditions *</Label>
                    <SmartCollectionRulesBuilder
                      value={formData.rules || createEmptyRulesStructure()}
                      onChange={(rules) => setFormData({ ...formData, rules })}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom Slug (Optional)</label>
                  <Input
                    placeholder={formData.name ? generateHandle(formData.name) : "Auto-generated from name"}
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  />
                  {/* Warning if custom slug differs from auto-generated */}
                  {formData.slug && formData.name && formData.slug !== generateHandle(formData.name) && (
                    <Alert variant="default" className="mt-2 border-amber-200 bg-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertTitle className="text-amber-800">Custom Slug Differs</AlertTitle>
                      <AlertDescription className="text-amber-700 text-xs">
                        Your custom slug "<strong>{formData.slug}</strong>" differs from the auto-generated "<strong>{generateHandle(formData.name)}</strong>".
                        Make sure this is intentional - apps may expect the standard handle format.
                      </AlertDescription>
                    </Alert>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the auto-generated handle shown above
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    placeholder="Optional description"
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <label htmlFor="isActive" className="text-sm font-medium">
                    Active
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Collection"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Collection Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Collection</DialogTitle>
              <DialogDescription>
                Update collection details
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitEdit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    placeholder="e.g., Summer Collection"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Slug *</label>
                  <Input
                    placeholder="summer-collection"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    placeholder="Optional description"
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActiveEdit"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <label htmlFor="isActiveEdit" className="text-sm font-medium">
                    Active
                  </label>
                </div>

                {/* Shopify Synced Data (Read-Only) */}
                {selectedCollection?.shopifyCollectionId && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Shopify Data (Read-Only)
                    </h4>
                    <div className="space-y-3 bg-muted/50 p-3 rounded-lg text-sm">
                      {selectedCollection.image && (
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground min-w-[100px]">Image:</span>
                          <img
                            src={selectedCollection.image}
                            alt={selectedCollection.name}
                            className="h-20 w-20 rounded object-cover border"
                          />
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <span className="text-muted-foreground min-w-[100px]">Type:</span>
                        <span className="font-medium">
                          {selectedCollection.shopifyType === 'smart' ? '🤖 Smart Collection' : '📁 Manual Collection'}
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-muted-foreground min-w-[100px]">Product Count:</span>
                        <span className="font-medium">{selectedCollection.productCount} products</span>
                      </div>
                      {selectedCollection.metaTitle && (
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground min-w-[100px]">SEO Title:</span>
                          <span className="flex-1">{selectedCollection.metaTitle}</span>
                        </div>
                      )}
                      {selectedCollection.metaDescription && (
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground min-w-[100px]">SEO Desc:</span>
                          <span className="flex-1 text-xs">{selectedCollection.metaDescription}</span>
                        </div>
                      )}
                      {selectedCollection.syncedAt && (
                        <div className="flex items-start gap-3">
                          <span className="text-muted-foreground min-w-[100px]">Last Synced:</span>
                          <span>{new Date(selectedCollection.syncedAt).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <span className="text-muted-foreground min-w-[100px]">Shopify Handle:</span>
                        <code className="text-xs bg-background px-2 py-1 rounded">{selectedCollection.shopifyHandle}</code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Collection"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Collection</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{selectedCollection?.name}"? This will remove all product
                associations but will NOT delete the products themselves.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Collection"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Products Modal */}
        <ManageProductsModal
          collection={selectedCollection}
          isOpen={showManageProductsModal}
          onClose={() => setShowManageProductsModal(false)}
        />
    </MainLayout>
  );
}
