import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
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
  Folder,
  Plus,
  Search,
  Package,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowUpDown,
  Wand2,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import type { Category } from "@shared/schema";
import { CategorySelector } from "@/components/ui/category-selector";

interface CategoryStats {
  total: number;
  active: number;
  withProducts: number;
  uncategorizedProducts: number;
  shopifyCategoryStats: {
    totalProducts: number;
    withValidCategory: number;
    explicitlyUncategorized: number;
    nullCategory: number;
    coveragePercent: number;
  };
  autoMappableProducts: number;
}

interface MappingInsight {
  productType: string;
  totalProducts: number;
  withShopifyCategory: number;
  withoutShopifyCategory: number;
  syncedToShopify: number;
  pendingSync: number;
  coveragePercent: number;
  syncPercent: number;
  mostCommonCategory: string | null;
  mostCommonCategoryCount: number;
  hasMultipleCategories: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  syncStatus: 'synced' | 'pending' | 'not_mapped';
}

type SortField = "name" | "slug" | "productCount" | "displayOrder";
type SortDirection = "asc" | "desc";

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Main tab state
  const [mainTab, setMainTab] = useState<"categories" | "mapping">("categories");

  // Table state (for Internal Categories tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Mapping Insights tab state
  const [mappingSearchQuery, setMappingSearchQuery] = useState("");
  const [mappingCoverageFilter, setMappingCoverageFilter] = useState<"all" | "unmapped" | "partial" | "full">("all");
  const [mappingConfidenceFilter, setMappingConfidenceFilter] = useState<"all" | "high" | "medium" | "low" | "none">("all");
  const [mappingSortField, setMappingSortField] = useState<"productType" | "totalProducts" | "coveragePercent">("productType");
  const [mappingSortDirection, setMappingSortDirection] = useState<"asc" | "desc">("asc");

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    color: "",
    isActive: true,
    displayOrder: 0,
  });

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteMode, setDeleteMode] = useState<"nullify" | "reassign" | "delete">("nullify");
  const [reassignToCategoryId, setReassignToCategoryId] = useState<string>("");

  // Mapping dialog state
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [mappingInsight, setMappingInsight] = useState<MappingInsight | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<string>("");

  // Auto-generate slug from name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  };

  // Update slug when name changes (only for new categories)
  useEffect(() => {
    if (!editingCategory && formData.name) {
      setFormData(prev => ({ ...prev, slug: generateSlug(prev.name) }));
    }
  }, [formData.name, editingCategory]);

  // Fetch category statistics
  const { data: stats, isLoading: statsLoading } = useQuery<CategoryStats>({
    queryKey: ["/api/categories/stats"],
    queryFn: async () => {
      const response = await fetch("/api/categories/stats", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch category statistics");
      }

      return response.json();
    },
  });

  // Fetch all categories
  const { data: categories = [], isLoading: categoriesLoading, error } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const response = await fetch("/api/categories", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }

      return response.json();
    },
  });

  // Fetch mapping insights
  const { data: mappingInsights = [], isLoading: mappingInsightsLoading } = useQuery<MappingInsight[]>({
    queryKey: ["/api/categories/mapping-insights"],
    queryFn: async () => {
      const response = await fetch("/api/categories/mapping-insights", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch mapping insights");
      }

      return response.json();
    },
    enabled: mainTab === "mapping", // Only fetch when on mapping tab
  });

  // Create category mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create category");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/stats"] });
      toast({
        title: "Success",
        description: "Category created successfully",
      });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update category mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update category");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/stats"] });
      toast({
        title: "Success",
        description: "Category updated successfully",
      });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete category mutation
  const deleteMutation = useMutation({
    mutationFn: async ({
      id,
      mode,
      reassignTo,
      deleteProducts,
    }: {
      id: string;
      mode: "nullify" | "reassign" | "delete";
      reassignTo?: string;
      deleteProducts?: boolean;
    }) => {
      const params = new URLSearchParams();
      if (mode === "reassign" && reassignTo) {
        params.append("reassignTo", reassignTo);
      } else if (mode === "delete") {
        params.append("deleteProducts", "true");
      }

      const url = `/api/categories/${id}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete category");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/stats"] });
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
      handleCloseDeleteDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk map products by type mutation
  const bulkMapMutation = useMutation({
    mutationFn: async ({
      productType,
      shopifyCategoryId,
      shopifyCategoryPath,
    }: {
      productType: string;
      shopifyCategoryId: string;
      shopifyCategoryPath: string;
    }) => {
      const response = await fetch("/api/categories/bulk-map-by-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productType, shopifyCategoryId, shopifyCategoryPath }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to map products");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/mapping-insights"] });
      toast({
        title: "Success",
        description: data.message || `Mapped ${data.updatedCount} products successfully`,
      });
      setIsMappingDialogOpen(false);
      setSelectedCategoryId("");
      setSelectedCategoryPath("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncToShopifyMutation = useMutation({
    mutationFn: async ({ productType }: { productType: string }) => {
      const response = await fetch("/api/categories/sync-to-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productType }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sync to Shopify");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/mapping-insights"] });
      toast({
        title: "Shopify Sync Complete",
        description: `Synced ${data.synced} products, skipped ${data.skipped}, failed ${data.failed}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = statsLoading || categoriesLoading;

  // Filter and sort categories
  const filteredCategories = useMemo(() => {
    let filtered = [...categories];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (cat) =>
          cat.name.toLowerCase().includes(query) ||
          cat.slug.toLowerCase().includes(query) ||
          cat.description?.toLowerCase().includes(query)
      );
    }

    // Apply active/inactive filter
    if (filterTab === "active") {
      filtered = filtered.filter((cat) => cat.isActive === true);
    } else if (filterTab === "inactive") {
      filtered = filtered.filter((cat) => cat.isActive === false);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "slug":
          aVal = a.slug.toLowerCase();
          bVal = b.slug.toLowerCase();
          break;
        case "productCount":
          aVal = a.productCount || 0;
          bVal = b.productCount || 0;
          break;
        case "displayOrder":
          aVal = a.displayOrder || 0;
          bVal = b.displayOrder || 0;
          break;
      }

      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [categories, searchQuery, filterTab, sortField, sortDirection]);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort mapping insights
  const filteredMappingInsights = useMemo(() => {
    let filtered = [...mappingInsights];

    // Apply search filter
    if (mappingSearchQuery.trim()) {
      const query = mappingSearchQuery.toLowerCase();
      filtered = filtered.filter((insight) =>
        insight.productType.toLowerCase().includes(query) ||
        insight.mostCommonCategory?.toLowerCase().includes(query)
      );
    }

    // Apply coverage filter
    if (mappingCoverageFilter === "unmapped") {
      filtered = filtered.filter((insight) => insight.coveragePercent === 0);
    } else if (mappingCoverageFilter === "partial") {
      filtered = filtered.filter((insight) => insight.coveragePercent > 0 && insight.coveragePercent < 100);
    } else if (mappingCoverageFilter === "full") {
      filtered = filtered.filter((insight) => insight.coveragePercent === 100);
    }

    // Apply confidence filter
    if (mappingConfidenceFilter !== "all") {
      filtered = filtered.filter((insight) => insight.confidence === mappingConfidenceFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (mappingSortField) {
        case "productType":
          aVal = a.productType.toLowerCase();
          bVal = b.productType.toLowerCase();
          break;
        case "totalProducts":
          aVal = a.totalProducts;
          bVal = b.totalProducts;
          break;
        case "coveragePercent":
          aVal = a.coveragePercent;
          bVal = b.coveragePercent;
          break;
      }

      if (mappingSortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [mappingInsights, mappingSearchQuery, mappingCoverageFilter, mappingConfidenceFilter, mappingSortField, mappingSortDirection]);

  // Toggle mapping insights sort
  const handleMappingSort = (field: typeof mappingSortField) => {
    if (mappingSortField === field) {
      setMappingSortDirection(mappingSortDirection === "asc" ? "desc" : "asc");
    } else {
      setMappingSortField(field);
      setMappingSortDirection("asc");
    }
  };

  // Open form for creating new category
  const handleCreateCategory = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      color: "",
      isActive: true,
      displayOrder: 0,
    });
    setIsFormOpen(true);
  };

  // Open form for editing existing category
  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      color: category.color || "",
      isActive: category.isActive,
      displayOrder: category.displayOrder || 0,
    });
    setIsFormOpen(true);
  };

  // Close form and reset
  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      color: "",
      isActive: true,
      displayOrder: 0,
    });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    if (!formData.slug.trim()) {
      toast({
        title: "Validation Error",
        description: "Category slug is required",
        variant: "destructive",
      });
      return;
    }

    // Submit
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Open delete dialog
  const handleDeleteCategory = (category: Category) => {
    setDeletingCategory(category);
    setDeleteMode("nullify"); // Default to safest option
    setReassignToCategoryId("");
    setIsDeleteDialogOpen(true);
  };

  // Close delete dialog and reset
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeletingCategory(null);
    setDeleteMode("nullify");
    setReassignToCategoryId("");
  };

  // Confirm deletion
  const handleConfirmDelete = () => {
    if (!deletingCategory) return;

    // Validation for reassign mode
    if (deleteMode === "reassign" && !reassignToCategoryId) {
      toast({
        title: "Validation Error",
        description: "Please select a category to reassign products to",
        variant: "destructive",
      });
      return;
    }

    deleteMutation.mutate({
      id: deletingCategory.id,
      mode: deleteMode,
      reassignTo: deleteMode === "reassign" ? reassignToCategoryId : undefined,
      deleteProducts: deleteMode === "delete",
    });
  };

  // Open mapping dialog
  const handleOpenMappingDialog = (insight: MappingInsight) => {
    setMappingInsight(insight);
    setSelectedCategoryId("");
    setSelectedCategoryPath("");
    setIsMappingDialogOpen(true);
  };

  // Close mapping dialog
  const handleCloseMappingDialog = () => {
    setIsMappingDialogOpen(false);
    setMappingInsight(null);
    setSelectedCategoryId("");
    setSelectedCategoryPath("");
  };

  // Handle category selection in mapping dialog
  const handleCategorySelect = (categoryId: string, categoryPath: string) => {
    console.log('🎯 Category selected:', { categoryId, categoryPath });
    setSelectedCategoryId(categoryId);
    setSelectedCategoryPath(categoryPath);
  };

  // Confirm mapping
  const handleConfirmMapping = () => {
    if (!mappingInsight || !selectedCategoryId || !selectedCategoryPath) {
      toast({
        title: "Validation Error",
        description: "Please select a Shopify category",
        variant: "destructive",
      });
      return;
    }

    bulkMapMutation.mutate({
      productType: mappingInsight.productType,
      shopifyCategoryId: selectedCategoryId,
      shopifyCategoryPath: selectedCategoryPath,
    });
  };

  // Sync categories to Shopify
  const handleSyncToShopify = () => {
    if (!mappingInsight) {
      toast({
        title: "Error",
        description: "No product type selected",
        variant: "destructive",
      });
      return;
    }

    syncToShopifyMutation.mutate({
      productType: mappingInsight.productType,
    });
  };

  return (
    <MainLayout
      title="Categories"
      subtitle="Manage product categories and organization"
    >
      <div className="p-8">

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* Total Categories */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Categories
                </CardTitle>
                <Folder className="h-4 w-4 text-gray-400" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.total || 0}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  All product categories
                </p>
              </CardContent>
            </Card>

            {/* Active Categories */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Active Categories
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.active || 0}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Currently in use
                </p>
              </CardContent>
            </Card>

            {/* Uncategorized Products */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Uncategorized
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.uncategorizedProducts || 0}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Products without internal category
                </p>
              </CardContent>
            </Card>

            {/* Shopify Category Coverage */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Shopify Categories
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-bold">
                      {stats?.shopifyCategoryStats?.withValidCategory || 0} / {stats?.shopifyCategoryStats?.totalProducts || 0}
                    </div>
                    <div className="text-xs font-medium text-green-600">
                      {stats?.shopifyCategoryStats?.coveragePercent || 0}% Coverage
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Products mapped to Shopify taxonomy
                </p>
              </CardContent>
            </Card>

            {/* Auto-Mappable Products */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Ready to Auto-Map
                </CardTitle>
                <Wand2 className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.autoMappableProducts || 0}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Can be automatically categorized
                </p>
              </CardContent>
            </Card>

            {/* Mapping Quality Score */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Quality Score
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="space-y-2">
                    <div className="text-2xl font-bold">
                      {stats?.shopifyCategoryStats?.coveragePercent || 0}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          (stats?.shopifyCategoryStats?.coveragePercent || 0) >= 80
                            ? 'bg-green-600'
                            : (stats?.shopifyCategoryStats?.coveragePercent || 0) >= 50
                            ? 'bg-yellow-600'
                            : 'bg-red-600'
                        }`}
                        style={{ width: `${stats?.shopifyCategoryStats?.coveragePercent || 0}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Google Shopping readiness
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="mb-6">
            <TabsList>
              <TabsTrigger value="categories">
                Internal Categories
              </TabsTrigger>
              <TabsTrigger value="mapping">
                Mapping Insights
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search and Actions Bar */}
          {mainTab === "categories" && (
            <>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button className="gap-2" onClick={handleCreateCategory}>
              <Plus className="h-4 w-4" />
              Create Category
            </Button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 text-red-800">
                  <AlertCircle className="h-5 w-5" />
                  <div>
                    <p className="font-medium">Failed to load categories</p>
                    <p className="text-sm text-red-600">
                      {error instanceof Error ? error.message : "Unknown error occurred"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success State - Categories Table */}
          {!isLoading && !error && categories.length > 0 && (
            <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as typeof filterTab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">
                  All ({categories.length})
                </TabsTrigger>
                <TabsTrigger value="active">
                  Active ({categories.filter((c) => c.isActive).length})
                </TabsTrigger>
                <TabsTrigger value="inactive">
                  Inactive ({categories.filter((c) => !c.isActive).length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value={filterTab}>
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleSort("name")}
                            >
                              Name
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleSort("slug")}
                            >
                              Slug
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          </TableHead>
                          <TableHead>Shopify Category</TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleSort("productCount")}
                            >
                              Products
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCategories.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                              <div className="text-gray-500">
                                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                <p>No categories found matching your filters</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredCategories.map((category) => (
                            <TableRow key={category.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {category.color && (
                                    <div
                                      className="w-3 h-3 rounded-full border"
                                      style={{ backgroundColor: category.color }}
                                    />
                                  )}
                                  {category.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-600">
                                {category.slug}
                              </TableCell>
                              <TableCell>
                                {category.shopifyCategoryPath ? (
                                  <div className="text-sm">
                                    <div className="font-medium text-gray-900">
                                      {category.shopifyCategoryPath.split(' > ').pop()}
                                    </div>
                                    <div className="text-xs text-gray-500 max-w-xs truncate">
                                      {category.shopifyCategoryPath}
                                    </div>
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-gray-400">
                                    Not mapped
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  {category.productCount || 0}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {category.isActive ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleEditCategory(category)}>
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-red-600"
                                      onClick={() => handleDeleteCategory(category)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Empty State */}
          {!isLoading && !error && categories.length === 0 && (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <Folder className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No categories found
                  </h3>
                  <p className="text-gray-500 mb-4">
                    Get started by creating your first category
                  </p>
                  <Button className="gap-2" onClick={handleCreateCategory}>
                    <Plus className="h-4 w-4" />
                    Create Category
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
            </>
          )}

          {/* Mapping Insights Tab */}
          {mainTab === "mapping" && (
            <>
              {/* Search and Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search product types..."
                    value={mappingSearchQuery}
                    onChange={(e) => setMappingSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={mappingCoverageFilter}
                  onChange={(e) => setMappingCoverageFilter(e.target.value as typeof mappingCoverageFilter)}
                  className="px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">All Coverage</option>
                  <option value="unmapped">Unmapped (0%)</option>
                  <option value="partial">Partial (1-99%)</option>
                  <option value="full">Full (100%)</option>
                </select>
                <select
                  value={mappingConfidenceFilter}
                  onChange={(e) => setMappingConfidenceFilter(e.target.value as typeof mappingConfidenceFilter)}
                  className="px-3 py-2 border rounded-md text-sm"
                >
                  <option value="all">All Confidence</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="none">None</option>
                </select>
              </div>

              {/* Loading State */}
              {mappingInsightsLoading && (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Mapping Insights Table */}
              {!mappingInsightsLoading && mappingInsights.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Product Type to Shopify Category Mapping</CardTitle>
                    <p className="text-sm text-gray-600">
                      Analysis of how internal product types are mapped to Shopify categories.
                      Use this data to identify gaps and improve categorization.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleMappingSort("productType")}
                            >
                              Product Type
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          </TableHead>
                          <TableHead className="text-center w-[120px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleMappingSort("totalProducts")}
                            >
                              Total Products
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          </TableHead>
                          <TableHead className="w-[300px]">Most Common Shopify Category</TableHead>
                          <TableHead className="w-[180px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleMappingSort("coveragePercent")}
                            >
                              Coverage
                              <ArrowUpDown className="h-3 w-3" />
                            </Button>
                          </TableHead>
                          <TableHead className="text-center w-[140px]">Shopify Sync</TableHead>
                          <TableHead className="text-center w-[120px]">Confidence</TableHead>
                          <TableHead className="text-right w-[150px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMappingInsights.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                              <div className="text-gray-500">
                                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                <p>No product types found matching your filters</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredMappingInsights.map((insight) => (
                          <TableRow key={insight.productType}>
                            {/* Product Type */}
                            <TableCell className="font-medium">
                              {insight.productType}
                            </TableCell>

                            {/* Total Products */}
                            <TableCell className="text-center">
                              <Badge variant="secondary">
                                {insight.totalProducts}
                              </Badge>
                            </TableCell>

                            {/* Most Common Category */}
                            <TableCell>
                              {insight.mostCommonCategory ? (
                                <div className="text-sm">
                                  <div className="font-medium text-gray-900">
                                    {insight.mostCommonCategory.split(' > ').pop()}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate max-w-xs">
                                    {insight.mostCommonCategory}
                                  </div>
                                  {insight.hasMultipleCategories && (
                                    <div className="text-xs text-orange-600 mt-1">
                                      ⚠️ Multiple categories used ({insight.mostCommonCategoryCount} products use this one)
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-gray-400">
                                  No category assigned
                                </Badge>
                              )}
                            </TableCell>

                            {/* Coverage */}
                            <TableCell>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-medium">
                                    {insight.coveragePercent}%
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {insight.withShopifyCategory}/{insight.totalProducts}
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      insight.coveragePercent >= 80
                                        ? 'bg-green-600'
                                        : insight.coveragePercent >= 50
                                        ? 'bg-yellow-600'
                                        : insight.coveragePercent > 0
                                        ? 'bg-orange-600'
                                        : 'bg-red-600'
                                    }`}
                                    style={{ width: `${insight.coveragePercent}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>

                            {/* Shopify Sync Status */}
                            <TableCell className="text-center">
                              {insight.syncStatus === 'synced' && (
                                <div className="space-y-1">
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                    ✓ Synced
                                  </Badge>
                                  <div className="text-xs text-gray-500">
                                    {insight.syncedToShopify}/{insight.withShopifyCategory}
                                  </div>
                                </div>
                              )}
                              {insight.syncStatus === 'pending' && (
                                <div className="space-y-1">
                                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                                    ⏳ Pending
                                  </Badge>
                                  <div className="text-xs text-gray-500">
                                    {insight.syncedToShopify}/{insight.withShopifyCategory}
                                  </div>
                                </div>
                              )}
                              {insight.syncStatus === 'not_mapped' && (
                                <Badge variant="outline" className="text-gray-400">
                                  Not Mapped
                                </Badge>
                              )}
                            </TableCell>

                            {/* Confidence Level */}
                            <TableCell className="text-center">
                              {insight.confidence === 'high' && (
                                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                  High
                                </Badge>
                              )}
                              {insight.confidence === 'medium' && (
                                <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                                  Medium
                                </Badge>
                              )}
                              {insight.confidence === 'low' && (
                                <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                                  Low
                                </Badge>
                              )}
                              {insight.confidence === 'none' && (
                                <Badge variant="outline" className="text-red-600 border-red-600">
                                  None
                                </Badge>
                              )}
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => handleOpenMappingDialog(insight)}
                              >
                                <Wand2 className="h-3 w-3 mr-1" />
                                Map Category
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Empty State */}
              {!mappingInsightsLoading && mappingInsights.length === 0 && (
                <Card>
                  <CardContent className="p-12">
                    <div className="text-center">
                      <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No mapping insights available
                      </h3>
                      <p className="text-gray-500 mb-4">
                        Make sure your products have internal product types assigned
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

      {/* Create/Edit Category Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Create New Category"}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? "Update the category details below."
                : "Add a new category to organize your products."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Category Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Men's T-Shirts"
                required
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug <span className="text-red-500">*</span>
              </Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value })
                }
                placeholder="e.g., mens-t-shirts"
                required
              />
              <p className="text-xs text-gray-500">
                {editingCategory
                  ? "URL-friendly version of the name"
                  : "Auto-generated from name (you can edit)"}
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description for internal use"
                rows={3}
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label htmlFor="color">Color (Optional)</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="color"
                  type="color"
                  value={formData.color || "#3b82f6"}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  className="w-20 h-10 cursor-pointer"
                />
                <span className="text-sm text-gray-500">
                  Pick a color for visual identification
                </span>
              </div>
            </div>

            {/* Display Order */}
            <div className="space-y-2">
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    displayOrder: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0"
                min="0"
              />
              <p className="text-xs text-gray-500">
                Lower numbers appear first (0 = highest priority)
              </p>
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">Active Status</Label>
                <p className="text-xs text-gray-500">
                  Inactive categories won't appear in filters
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
              />
            </div>

            {/* Form Actions */}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseForm}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingCategory
                  ? "Update Category"
                  : "Create Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Category Alert Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-[550px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <strong>{deletingCategory?.name}</strong>.
              This category has <strong>{deletingCategory?.productCount || 0} products</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <Label>What should happen to the products in this category?</Label>
            <RadioGroup value={deleteMode} onValueChange={(value) => setDeleteMode(value as typeof deleteMode)}>
              {/* Mode 1: Nullify (Safest) */}
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                <RadioGroupItem value="nullify" id="nullify" />
                <div className="flex-1">
                  <Label htmlFor="nullify" className="font-medium cursor-pointer">
                    Keep products, remove category (Recommended)
                  </Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Products will become uncategorized. You can assign them to another category later.
                  </p>
                </div>
              </div>

              {/* Mode 2: Reassign */}
              <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
                <RadioGroupItem value="reassign" id="reassign" />
                <div className="flex-1 space-y-3">
                  <Label htmlFor="reassign" className="font-medium cursor-pointer">
                    Move products to another category
                  </Label>
                  <p className="text-sm text-gray-500">
                    All {deletingCategory?.productCount || 0} products will be reassigned.
                  </p>
                  {deleteMode === "reassign" && (
                    <Select
                      value={reassignToCategoryId}
                      onValueChange={setReassignToCategoryId}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((cat) => cat.id !== deletingCategory?.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name} ({cat.productCount || 0} products)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Mode 3: Delete Products (Dangerous) */}
              <div className="flex items-start space-x-3 space-y-0 rounded-md border border-red-200 bg-red-50 p-4">
                <RadioGroupItem value="delete" id="delete" />
                <div className="flex-1">
                  <Label htmlFor="delete" className="font-medium cursor-pointer text-red-900">
                    Delete category AND all products (Danger!)
                  </Label>
                  <p className="text-sm text-red-600 mt-1">
                    ⚠️ This will permanently delete {deletingCategory?.productCount || 0} products. This action cannot be undone!
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDeleteDialog} disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className={deleteMode === "delete" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Map Category Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Map Category for "{mappingInsight?.productType}"</DialogTitle>
            <DialogDescription>
              Select a Shopify category to map to all <strong>{mappingInsight?.totalProducts}</strong> products
              with product type "{mappingInsight?.productType}".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current Mapping Info */}
            {mappingInsight && (
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Current Coverage:</span>
                  <span className="font-medium">{mappingInsight.coveragePercent}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Mapped Products:</span>
                  <span className="font-medium">{mappingInsight.withShopifyCategory} / {mappingInsight.totalProducts}</span>
                </div>
                {mappingInsight.mostCommonCategory && (
                  <div className="text-sm">
                    <span className="text-gray-600">Most Common Category:</span>
                    <div className="font-medium text-gray-900 mt-1">{mappingInsight.mostCommonCategory}</div>
                  </div>
                )}
              </div>
            )}

            {/* Category Selector */}
            <div className="space-y-2">
              <Label>Select Shopify Category</Label>
              <CategorySelector
                value={selectedCategoryId}
                onSelect={handleCategorySelect}
                placeholder="Search for a category..."
              />
              {selectedCategoryPath && (
                <div className="text-sm text-gray-600 mt-2">
                  <strong>Selected:</strong> {selectedCategoryPath}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleSyncToShopify}
              disabled={syncToShopifyMutation.isPending || !mappingInsight}
              className="mr-auto"
            >
              {syncToShopifyMutation.isPending ? "Syncing..." : "Sync to Shopify"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseMappingDialog}
                disabled={bulkMapMutation.isPending || syncToShopifyMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmMapping}
                disabled={bulkMapMutation.isPending || syncToShopifyMutation.isPending || !selectedCategoryId}
              >
                {bulkMapMutation.isPending ? "Mapping..." : `Map ${mappingInsight?.totalProducts || 0} Products`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
