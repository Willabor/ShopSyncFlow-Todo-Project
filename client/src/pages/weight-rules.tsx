import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Scale,
  Plus,
  Search,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Settings,
  RefreshCw,
} from "lucide-react";

// Type Definitions
interface WeightCategory {
  id: string;
  categoryName: string;
  weightValue: string;
  weightUnit: string;
  source: "manual" | "excel_import";
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface WeightMapping {
  id: string;
  productType: string;
  weightCategoryId: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  // Joined fields from category
  category?: WeightCategory;
}

interface WeightDiscrepancy {
  id: string;
  productId: string;
  variantId?: string | null;
  productTitle: string | null;
  variantTitle?: string | null;
  sku?: string | null;
  productType: string | null;
  currentWeight: string | null;
  expectedWeight: string | null;
  actualWeight?: string | null;
  actualUnit?: string | null;
  expectedUnit?: string | null;
  weightCategoryId: string | null;
  categoryId?: string | null;
  status: "pending" | "fixed" | "ignored";
  fixedAt: string | null;
  fixedBy: string | null;
  detectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DiscrepancyStats {
  total: number;
  pending: number;
  fixed: number;
  ignored: number;
}

interface UnmappedType {
  productType: string;
  productCount: number;
}

// Combined view for displaying all product types (mapped + unmapped) in one table
interface ProductTypeRow {
  productType: string;
  isMapped: boolean;
  productCount?: number;
  mapping?: WeightMapping;
  category?: WeightCategory;
}

type MappingSortField = "productType" | "categoryName" | "weightValue";
type DiscrepancySortField = "productTitle" | "productType" | "expectedWeight" | "currentWeight";
type SortDirection = "asc" | "desc";

// Helper function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

export default function WeightRulesPage() {
  const queryClient = useQueryClient();

  // UI State
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [manageCategoriesMode, setManageCategoriesMode] = useState(false);
  const [mappingsSearchQuery, setMappingsSearchQuery] = useState("");
  const [discrepanciesSearchQuery, setDiscrepanciesSearchQuery] = useState("");
  const [mappingSortField, setMappingSortField] = useState<MappingSortField>("productType");
  const [mappingSortDirection, setMappingSortDirection] = useState<SortDirection>("asc");
  const [discrepancySortField, setDiscrepancySortField] = useState<DiscrepancySortField>("productTitle");
  const [discrepancySortDirection, setDiscrepancySortDirection] = useState<SortDirection>("asc");
  const [weightRangeFilter, setWeightRangeFilter] = useState<string>("all");
  const [fixingDiscrepancyId, setFixingDiscrepancyId] = useState<string | null>(null);
  const [ignoringDiscrepancyId, setIgnoringDiscrepancyId] = useState<string | null>(null);

  // Modal State
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isEditCategoryOpen, setIsEditCategoryOpen] = useState(false);
  const [isDeleteCategoryOpen, setIsDeleteCategoryOpen] = useState(false);
  const [isAddMappingOpen, setIsAddMappingOpen] = useState(false);
  const [isEditMappingOpen, setIsEditMappingOpen] = useState(false);
  const [isDeleteMappingOpen, setIsDeleteMappingOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newMappingProductType, setNewMappingProductType] = useState<string>("");

  // Import preview state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    sheets: string[];
    selectedSheet: string;
    preview: Array<{ categoryName: string; weightValue: string; weightUnit: string }>;
    rowCount: number;
    errorCount: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [importSelectedSheet, setImportSelectedSheet] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Selected items for modals
  const [selectedCategory, setSelectedCategory] = useState<WeightCategory | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<WeightMapping | null>(null);

  // Error State (for inline errors instead of toasts)
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [discrepancyError, setDiscrepancyError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Query: Weight Categories
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesQueryError,
  } = useQuery<WeightCategory[]>({
    queryKey: ["/api/weight-categories"],
    queryFn: async () => {
      const response = await fetch("/api/weight-categories", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch weight categories");
      }
      const data = await response.json();
      return data.categories || [];
    },
  });

  // Query: Weight Mappings
  const {
    data: mappings = [],
    isLoading: mappingsLoading,
    error: mappingsQueryError,
  } = useQuery<WeightMapping[]>({
    queryKey: ["/api/weight-mappings"],
    queryFn: async () => {
      const response = await fetch("/api/weight-mappings", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch weight mappings");
      }
      const data = await response.json();
      return data.mappings || [];
    },
  });

  // Query: Weight Discrepancies
  const {
    data: discrepancies = [],
    isLoading: discrepanciesLoading,
    error: discrepanciesQueryError,
  } = useQuery<WeightDiscrepancy[]>({
    queryKey: ["/api/weight-discrepancies"],
    queryFn: async () => {
      const response = await fetch("/api/weight-discrepancies", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch weight discrepancies");
      }
      const data = await response.json();
      return data.discrepancies || [];
    },
  });

  // Query: Discrepancy Stats
  const { data: discrepancyStats } = useQuery<DiscrepancyStats>({
    queryKey: ["/api/weight-discrepancies/stats"],
    queryFn: async () => {
      const response = await fetch("/api/weight-discrepancies/stats", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch discrepancy stats");
      }
      const data = await response.json();
      return data.stats || { total: 0, pending: 0, fixed: 0, ignored: 0 };
    },
  });

  // Query: Unmapped Types
  const { data: unmappedTypes = [] } = useQuery<UnmappedType[]>({
    queryKey: ["/api/weight-mappings/unmapped-types"],
    queryFn: async () => {
      const response = await fetch("/api/weight-mappings/unmapped-types", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch unmapped types");
      }
      const data = await response.json();
      return data.productTypes || [];
    },
  });

  // Mutation: Create Category
  const createCategoryMutation = useMutation({
    mutationFn: async (data: { categoryName: string; weightValue: string; weightUnit: string }) => {
      const response = await fetch("/api/weight-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-categories"] });
      setIsAddCategoryOpen(false);
      setCategoryError(null);
    },
    onError: (error: Error) => {
      setCategoryError(error.message);
    },
  });

  // Mutation: Update Category
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { categoryName: string; weightValue: string; weightUnit: string } }) => {
      const response = await fetch(`/api/weight-categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings"] });
      setIsEditCategoryOpen(false);
      setSelectedCategory(null);
      setCategoryError(null);
    },
    onError: (error: Error) => {
      setCategoryError(error.message);
    },
  });

  // Mutation: Delete Category
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/weight-categories/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings"] });
      setIsDeleteCategoryOpen(false);
      setSelectedCategory(null);
      setCategoryError(null);
    },
    onError: (error: Error) => {
      setCategoryError(error.message);
    },
  });

  // Mutation: Create Mapping
  const createMappingMutation = useMutation({
    mutationFn: async (data: { productType: string; weightCategoryId: string }) => {
      const response = await fetch("/api/weight-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create mapping");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings/unmapped-types"] });
      setIsAddMappingOpen(false);
      setMappingError(null);
    },
    onError: (error: Error) => {
      setMappingError(error.message);
    },
  });

  // Mutation: Update Mapping
  const updateMappingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { weightCategoryId: string } }) => {
      const response = await fetch(`/api/weight-mappings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update mapping");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings"] });
      setIsEditMappingOpen(false);
      setSelectedMapping(null);
      setMappingError(null);
    },
    onError: (error: Error) => {
      setMappingError(error.message);
    },
  });

  // Mutation: Delete Mapping
  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/weight-mappings/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete mapping");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-mappings/unmapped-types"] });
      setIsDeleteMappingOpen(false);
      setSelectedMapping(null);
      setMappingError(null);
    },
    onError: (error: Error) => {
      setMappingError(error.message);
    },
  });

  // Mutation: Fix Discrepancy
  const fixDiscrepancyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/weight-discrepancies/${id}/fix`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fix discrepancy");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies/stats"] });
      setDiscrepancyError(null);
    },
    onError: (error: Error) => {
      setDiscrepancyError(error.message);
    },
    onSettled: () => {
      setFixingDiscrepancyId(null);
    },
  });

  // Mutation: Ignore Discrepancy
  const ignoreDiscrepancyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/weight-discrepancies/${id}/ignore`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to ignore discrepancy");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies/stats"] });
      setDiscrepancyError(null);
    },
    onError: (error: Error) => {
      setDiscrepancyError(error.message);
    },
    onSettled: () => {
      setIgnoringDiscrepancyId(null);
    },
  });

  // Mutation: Fix All Discrepancies (accepts specific IDs)
  // Progressive bulk fix with progress modal
  const [fixProgress, setFixProgress] = useState<{
    isOpen: boolean;
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    cancelled: boolean;
    errors: Array<{ id: string; product: string; message: string }>;
    currentItem?: string;
  } | null>(null);
  const fixCancelledRef = useRef(false);

  const startBulkFix = async (discrepancies: any[]) => {
    fixCancelledRef.current = false;
    setFixProgress({
      isOpen: true,
      total: discrepancies.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      cancelled: false,
      errors: [],
    });

    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ id: string; product: string; message: string }> = [];

    for (let i = 0; i < discrepancies.length; i++) {
      const disc = discrepancies[i];
      if (fixCancelledRef.current) break;

      setFixProgress(prev => prev ? {
        ...prev,
        currentItem: disc.productTitle || disc.sku || disc.id,
      } : null);

      try {
        const res = await fetch(`/api/weight-discrepancies/${disc.id}/fix`, {
          method: "POST",
          credentials: "include",
        });
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          if (contentType.includes("application/json")) {
            const errData = await res.json().catch(() => null);
            if (errData?.error) msg = errData.error;
          }
          throw new Error(msg);
        }
        succeeded++;
      } catch (err: any) {
        failed++;
        errors.push({
          id: disc.id,
          product: disc.productTitle || disc.sku || "",
          message: err.message || "Network error",
        });
      }

      setFixProgress(prev => prev ? {
        ...prev,
        processed: prev.processed + 1,
        succeeded,
        failed,
        errors,
      } : null);

      // Small delay to avoid Shopify API rate limiting (max ~2 req/sec)
      if (i < discrepancies.length - 1 && !fixCancelledRef.current) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Refresh data after completion
    queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies"] });
    queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies/stats"] });
  };

  // Mutation: Scan for Discrepancies
  const scanDiscrepanciesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/weight-discrepancies/scan", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to scan for discrepancies");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-discrepancies/stats"] });
      setDiscrepancyError(null);
      // Show success message via the error display (could make a success state later)
      if (data.message) {
        setDiscrepancyError(data.message);
      }
    },
    onError: (error: Error) => {
      setDiscrepancyError(error.message);
    },
  });

  // Mutation: Import Categories
  const importCategoriesMutation = useMutation({
    mutationFn: async ({ file, sheet }: { file: File; sheet?: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (sheet) {
        formData.append("sheet", sheet);
      }
      const response = await fetch("/api/weight-categories/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to import categories");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-categories"] });
      setIsImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      setImportSelectedSheet("");
      setActionError(null);
    },
    onError: (error: Error) => {
      setActionError(error.message);
    },
  });

  // Function: Preview file sheets and data
  const handleFilePreview = async (file: File, sheet?: string) => {
    setIsLoadingPreview(true);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (sheet) {
        formData.append("sheet", sheet);
      }
      const response = await fetch("/api/weight-categories/preview", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to preview file");
      }
      const data = await response.json();
      setImportPreview(data);
      setImportSelectedSheet(data.selectedSheet);
    } catch (error: any) {
      setActionError(error.message);
      setImportPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle file selection in import dialog
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      handleFilePreview(file);
    }
  };

  // Handle sheet change in import dialog
  const handleSheetChange = (sheet: string) => {
    setImportSelectedSheet(sheet);
    if (importFile) {
      handleFilePreview(importFile, sheet);
    }
  };

  // Reset import dialog state when closing
  const handleImportClose = () => {
    setIsImportOpen(false);
    setImportFile(null);
    setImportPreview(null);
    setImportSelectedSheet("");
    setActionError(null);
  };

  // Combine mapped and unmapped product types into a single list
  const allProductTypes = useMemo((): ProductTypeRow[] => {
    // Convert mappings to ProductTypeRow format
    const mappedRows: ProductTypeRow[] = mappings.map((m) => ({
      productType: m.productType,
      isMapped: true,
      mapping: m,
      category: m.category,
    }));

    // Convert unmapped types to ProductTypeRow format
    const unmappedRows: ProductTypeRow[] = unmappedTypes.map((u) => ({
      productType: typeof u === 'string' ? u : u.productType,
      isMapped: false,
      productCount: typeof u === 'string' ? undefined : u.productCount,
    }));

    return [...mappedRows, ...unmappedRows];
  }, [mappings, unmappedTypes]);

  // Filter and sort ALL product types (mapped + unmapped)
  const filteredProductTypes = useMemo(() => {
    let filtered = [...allProductTypes];

    // Apply search filter
    if (mappingsSearchQuery.trim()) {
      const query = mappingsSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (row) =>
          row.productType.toLowerCase().includes(query) ||
          row.category?.categoryName?.toLowerCase().includes(query)
      );
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
        case "categoryName":
          // Unmapped items sort to the end when sorting by category
          aVal = a.isMapped ? (a.category?.categoryName || "").toLowerCase() : "zzz";
          bVal = b.isMapped ? (b.category?.categoryName || "").toLowerCase() : "zzz";
          break;
        case "weightValue":
          aVal = a.isMapped ? parseFloat(a.category?.weightValue || "0") : -1;
          bVal = b.isMapped ? parseFloat(b.category?.weightValue || "0") : -1;
          break;
      }

      if (mappingSortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [allProductTypes, mappingsSearchQuery, mappingSortField, mappingSortDirection]);

  // Filter and sort discrepancies (only pending ones)
  const filteredDiscrepancies = useMemo(() => {
    let filtered = discrepancies.filter((d) => d.status === "pending");

    // Apply search filter
    if (discrepanciesSearchQuery.trim()) {
      const query = discrepanciesSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          (d.productTitle || "").toLowerCase().includes(query) ||
          (d.productType || "").toLowerCase().includes(query) ||
          d.productId.toLowerCase().includes(query)
      );
    }

    // Apply weight range filter based on actualWeight (or currentWeight as fallback)
    if (weightRangeFilter !== "all") {
      filtered = filtered.filter((d) => {
        const weight = parseFloat(d.actualWeight || d.currentWeight || "0");
        const isZeroOrNull = !d.actualWeight && !d.currentWeight || weight === 0;

        switch (weightRangeFilter) {
          case "0":
            return isZeroOrNull;
          case "0-1":
            return !isZeroOrNull && weight > 0 && weight < 1;
          case "1-2":
            return weight >= 1 && weight < 2;
          case "2-3":
            return weight >= 2 && weight < 3;
          case "3-4":
            return weight >= 3 && weight < 4;
          case "4-5":
            return weight >= 4 && weight < 5;
          case "5-10":
            return weight >= 5 && weight < 10;
          case "10+":
            return weight >= 10;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (discrepancySortField) {
        case "productTitle":
          aVal = (a.productTitle || "").toLowerCase();
          bVal = (b.productTitle || "").toLowerCase();
          break;
        case "productType":
          aVal = (a.productType || "").toLowerCase();
          bVal = (b.productType || "").toLowerCase();
          break;
        case "expectedWeight":
          aVal = parseFloat(a.expectedWeight || "0");
          bVal = parseFloat(b.expectedWeight || "0");
          break;
        case "currentWeight":
          aVal = parseFloat(a.currentWeight || "0");
          bVal = parseFloat(b.currentWeight || "0");
          break;
      }

      if (discrepancySortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [discrepancies, discrepanciesSearchQuery, discrepancySortField, discrepancySortDirection, weightRangeFilter]);

  // Toggle sort for mappings
  const handleMappingSort = (field: MappingSortField) => {
    if (mappingSortField === field) {
      setMappingSortDirection(mappingSortDirection === "asc" ? "desc" : "asc");
    } else {
      setMappingSortField(field);
      setMappingSortDirection("asc");
    }
  };

  // Toggle sort for discrepancies
  const handleDiscrepancySort = (field: DiscrepancySortField) => {
    if (discrepancySortField === field) {
      setDiscrepancySortDirection(discrepancySortDirection === "asc" ? "desc" : "asc");
    } else {
      setDiscrepancySortField(field);
      setDiscrepancySortDirection("asc");
    }
  };

  // Handle download template - downloads Excel file with instructions from server
  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/api/weight-categories/template", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to download template");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "weight-categories-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download template:", error);
      setActionError("Failed to download template. Please try again.");
    }
  };

  // Get category tags for collapsed view
  const categoryTags = useMemo(() => {
    const maxDisplay = 8;
    const displayed = categories.slice(0, maxDisplay);
    const remaining = categories.length - maxDisplay;
    return { displayed, remaining };
  }, [categories]);

  const pendingDiscrepanciesCount = discrepancyStats?.pending || 0;

  return (
    <MainLayout
      title="Weight Rules"
      subtitle="Manage product weight categories and mappings"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <Button onClick={() => setIsAddMappingOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Mapping
          </Button>
        </div>
      }
    >
      <div className="p-8 space-y-6">
        {/* Info Banner */}
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100">
                  How Weight Rules Work
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Weight categories define standard weights for product types. When you map a product type to a category,
                  all products of that type will use the category's weight. Discrepancies are flagged when a product's
                  actual weight differs from its expected weight based on the mapping.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Action Error */}
        {actionError && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 text-red-800 dark:text-red-200">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{actionError}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setActionError(null)}
                >
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weight Categories Section */}
        <Collapsible open={categoriesExpanded} onOpenChange={setCategoriesExpanded}>
          <Card>
            <CardHeader className="bg-green-50 dark:bg-green-950/20 border-b">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {categoriesExpanded ? (
                      <ChevronDown className="h-5 w-5 text-green-700 dark:text-green-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-green-700 dark:text-green-400" />
                    )}
                    <Scale className="h-5 w-5 text-green-700 dark:text-green-400" />
                    <CardTitle className="text-green-900 dark:text-green-100">
                      Weight Categories
                    </CardTitle>
                    <Badge variant="secondary" className="ml-2">
                      {categories.length} saved
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <div className="flex items-center gap-2">
                  {categoriesExpanded && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManageCategoriesMode(!manageCategoriesMode)}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      {manageCategoriesMode ? "Done" : "Manage Categories"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setIsAddCategoryOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Category
                  </Button>
                </div>
              </div>

              {/* Collapsed View - Category Tags */}
              {!categoriesExpanded && categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {categoryTags.displayed.map((cat) => (
                    <Badge
                      key={cat.id}
                      variant="outline"
                      className="bg-white dark:bg-gray-900"
                    >
                      {cat.categoryName}: {cat.weightValue} {cat.weightUnit}
                    </Badge>
                  ))}
                  {categoryTags.remaining > 0 && (
                    <Badge variant="secondary">
                      +{categoryTags.remaining} more
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>

            <CollapsibleContent>
              <CardContent className="p-0">
                {/* Category Error */}
                {categoryError && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-3 text-red-800 dark:text-red-200">
                      <AlertTriangle className="h-5 w-5" />
                      <p className="text-sm">{categoryError}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => setCategoryError(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}

                {categoriesLoading ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : categoriesQueryError ? (
                  <div className="p-6 text-center text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <p>Failed to load categories</p>
                  </div>
                ) : categories.length === 0 ? (
                  <div className="p-12 text-center">
                    <Scale className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      No weight categories
                    </h3>
                    <p className="text-gray-500 mb-4">
                      Create your first weight category to start mapping products
                    </p>
                    <Button onClick={() => setIsAddCategoryOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Category
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Mappings</TableHead>
                        <TableHead>Added</TableHead>
                        {manageCategoriesMode && (
                          <TableHead className="text-right">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell className="font-medium">{category.categoryName}</TableCell>
                          <TableCell>
                            {category.weightValue} {category.weightUnit}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={category.source === "manual" ? "outline" : "secondary"}
                            >
                              {category.source === "manual" ? "Manual" : "Imported"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {mappings.filter(m => m.weightCategoryId === category.id).length}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {new Date(category.createdAt).toLocaleDateString()}
                          </TableCell>
                          {manageCategoriesMode && (
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedCategory(category);
                                      setIsEditCategoryOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => {
                                      setSelectedCategory(category);
                                      setIsDeleteCategoryOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Mappings Table Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Product Type Mappings
                <Badge variant="secondary">{allProductTypes.length} types</Badge>
                <Badge className="bg-green-100 text-green-800">{mappings.length} mapped</Badge>
                {unmappedTypes.length > 0 && (
                  <Badge variant="destructive">{unmappedTypes.length} unmapped</Badge>
                )}
              </CardTitle>
            </div>
          </CardHeader>

          {/* Mapping Error */}
          {mappingError && (
            <div className="px-6 pb-4">
              <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3 text-red-800 dark:text-red-200">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="text-sm">{mappingError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setMappingError(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="px-6 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search product types or categories..."
                value={mappingsSearchQuery}
                onChange={(e) => setMappingsSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <CardContent className="p-0">
            {mappingsLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : mappingsQueryError ? (
              <div className="p-6 text-center text-red-600 dark:text-red-400">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p>Failed to load mappings</p>
              </div>
            ) : filteredProductTypes.length === 0 ? (
              <div className="p-12 text-center">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {mappingsSearchQuery ? "No product types found" : "No product types yet"}
                </h3>
                <p className="text-gray-500 mb-4">
                  {mappingsSearchQuery
                    ? "Try a different search term"
                    : "Sync products from Shopify to populate product types"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
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
                    <TableHead className="w-12 text-center">
                      <ArrowRight className="h-4 w-4 mx-auto text-gray-400" />
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleMappingSort("categoryName")}
                      >
                        Weight Category
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleMappingSort("weightValue")}
                      >
                        Weight
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProductTypes.map((row) => (
                    <TableRow
                      key={row.isMapped ? row.mapping?.id : `unmapped-${row.productType}`}
                      className={!row.isMapped ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}
                    >
                      <TableCell className="font-medium">{row.productType}</TableCell>
                      <TableCell className="text-center">
                        <ArrowRight className="h-4 w-4 mx-auto text-gray-400" />
                      </TableCell>
                      <TableCell>
                        {row.isMapped ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {row.category?.categoryName}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 italic">Not mapped</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.isMapped && row.category ? (
                          `${row.category.weightValue} ${row.category.weightUnit}`
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.isMapped ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Mapped
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Unmapped
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.isMapped && row.mapping ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedMapping(row.mapping!);
                                  setIsEditMappingOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Mapping
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedMapping(row.mapping!);
                                  setIsDeleteMappingOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove Mapping
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              setNewMappingProductType(row.productType);
                              setIsAddMappingOpen(true);
                            }}
                          >
                            Map
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Discrepancies Section */}
        <section>
          {/* Section Header (outside card) */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-foreground">Weight Discrepancies</h2>
              {pendingDiscrepanciesCount > 0 && (
                <Badge variant="destructive">{pendingDiscrepanciesCount}</Badge>
              )}
            </div>
            {/* Scan Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => scanDiscrepanciesMutation.mutate()}
              disabled={scanDiscrepanciesMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${scanDiscrepanciesMutation.isPending ? 'animate-spin' : ''}`} />
              {scanDiscrepanciesMutation.isPending ? "Scanning..." : "Scan Products"}
            </Button>
          </div>

          {/* Search Bar and Weight Filter (outside card, above it) */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name or SKU..."
                value={discrepanciesSearchQuery}
                onChange={(e) => setDiscrepanciesSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={weightRangeFilter}
              onChange={(e) => setWeightRangeFilter(e.target.value)}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm min-w-[140px]"
            >
              <option value="all">All Weights</option>
              <option value="0">0 lb</option>
              <option value="0-1">0-1 lb</option>
              <option value="1-2">1-2 lb</option>
              <option value="2-3">2-3 lb</option>
              <option value="3-4">3-4 lb</option>
              <option value="4-5">4-5 lb</option>
              <option value="5-10">5-10 lb</option>
              <option value="10+">10+ lb</option>
            </select>
          </div>

          {/* Discrepancy Message/Error */}
          {discrepancyError && (
            <div className="mb-4">
              <div className={`p-3 rounded-md border ${
                discrepancyError.includes('Found') || discrepancyError.includes('Scanned')
                  ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
              }`}>
                <div className="flex items-center gap-3">
                  <Info className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm flex-1">{discrepancyError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDiscrepancyError(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  Discrepancies Found ({filteredDiscrepancies.length})
                </CardTitle>
                {filteredDiscrepancies.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (window.confirm(
                          `Are you sure you want to fix ${filteredDiscrepancies.length} discrepancies?\n\n` +
                          `⚠️ This will update weights in BOTH:\n` +
                          `• Shopify (live store)\n` +
                          `• Local database\n\n` +
                          `This action cannot be undone.`
                        )) {
                          startBulkFix(filteredDiscrepancies);
                        }
                      }}
                      disabled={!!fixProgress?.isOpen}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {fixProgress?.isOpen ? "Fixing..." : `Fix All (${filteredDiscrepancies.length})`}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const ids = filteredDiscrepancies.map(d => d.id);
                        if (window.confirm(`Are you sure you want to ignore ${ids.length} discrepancies?`)) {
                          setDiscrepancyError("Ignore all functionality will be connected to backend");
                        }
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Ignore All
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {discrepanciesLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : discrepanciesQueryError ? (
                <div className="p-6 text-center text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p>Failed to load discrepancies</p>
                </div>
              ) : filteredDiscrepancies.length === 0 ? (
                <div className="p-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    No discrepancies found
                  </h3>
                  <p className="text-muted-foreground">
                    {discrepanciesSearchQuery
                      ? "Try a different search term"
                      : "Click \"Scan Products\" to check for weight mismatches"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 -ml-3"
                            onClick={() => handleDiscrepancySort("productTitle")}
                          >
                            Product
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 -ml-3"
                            onClick={() => handleDiscrepancySort("productType")}
                          >
                            Product Type
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>Mapped Category</TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 -ml-3"
                            onClick={() => handleDiscrepancySort("expectedWeight")}
                          >
                            Expected
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 -ml-3"
                            onClick={() => handleDiscrepancySort("currentWeight")}
                          >
                            Actual
                            <ArrowUpDown className="h-3 w-3" />
                          </Button>
                        </TableHead>
                        <TableHead>Detected</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDiscrepancies.map((discrepancy) => (
                        <TableRow key={discrepancy.id}>
                          <TableCell>
                            <div className="max-w-[200px]">
                              <div className="font-medium truncate">
                                {discrepancy.productTitle || "Unknown Product"}
                                {discrepancy.variantTitle && discrepancy.variantTitle !== "Default Title" && (
                                  <span className="text-muted-foreground"> - {discrepancy.variantTitle}</span>
                                )}
                              </div>
                              {discrepancy.sku && (
                                <div className="text-xs text-muted-foreground">SKU: {discrepancy.sku}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {discrepancy.productType || "-"}
                          </TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-primary/10 text-primary rounded text-sm">
                              {/* Find the mapped category name - using the category relationship */}
                              {categories.find(c => c.id === discrepancy.categoryId)?.categoryName || "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-green-600 dark:text-green-400 font-mono">
                              {discrepancy.expectedWeight} {discrepancy.expectedUnit}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-red-600 dark:text-red-400 font-mono">
                              {discrepancy.actualWeight || "0"} {discrepancy.actualUnit || "lb"}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {discrepancy.detectedAt
                              ? formatRelativeTime(new Date(discrepancy.detectedAt))
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setFixingDiscrepancyId(discrepancy.id);
                                  fixDiscrepancyMutation.mutate(discrepancy.id);
                                }}
                                disabled={fixingDiscrepancyId === discrepancy.id}
                              >
                                {fixingDiscrepancyId === discrepancy.id ? "Fixing..." : "Fix"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIgnoringDiscrepancyId(discrepancy.id);
                                  ignoreDiscrepancyMutation.mutate(discrepancy.id);
                                }}
                                disabled={ignoringDiscrepancyId === discrepancy.id}
                              >
                                {ignoringDiscrepancyId === discrepancy.id ? "..." : "Ignore"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Add Category Dialog */}
      <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Weight Category</DialogTitle>
            <DialogDescription>
              Create a new weight category to group products by weight.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createCategoryMutation.mutate({
                categoryName: formData.get("categoryName") as string,
                weightValue: formData.get("weightValue") as string,
                weightUnit: formData.get("weightUnit") as string || "lb",
              });
            }}
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="categoryName">Category Name</Label>
                <Input id="categoryName" name="categoryName" placeholder="e.g., T-Shirt" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weightValue">Weight</Label>
                  <Input
                    id="weightValue"
                    name="weightValue"
                    type="number"
                    step="0.01"
                    placeholder="0.25"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="weightUnit">Unit</Label>
                  <select
                    id="weightUnit"
                    name="weightUnit"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    defaultValue="lb"
                  >
                    <option value="lb">Pounds (lb)</option>
                    <option value="oz">Ounces (oz)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddCategoryOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createCategoryMutation.isPending}>
                {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={isEditCategoryOpen} onOpenChange={setIsEditCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Weight Category</DialogTitle>
            <DialogDescription>
              Update the weight category details.
            </DialogDescription>
          </DialogHeader>
          {selectedCategory && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                updateCategoryMutation.mutate({
                  id: selectedCategory.id,
                  data: {
                    categoryName: formData.get("categoryName") as string,
                    weightValue: formData.get("weightValue") as string,
                    weightUnit: formData.get("weightUnit") as string || "lb",
                  },
                });
              }}
            >
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-categoryName">Category Name</Label>
                  <Input
                    id="edit-categoryName"
                    name="categoryName"
                    defaultValue={selectedCategory.categoryName}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-weightValue">Weight</Label>
                    <Input
                      id="edit-weightValue"
                      name="weightValue"
                      type="number"
                      step="0.01"
                      defaultValue={selectedCategory.weightValue}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-weightUnit">Unit</Label>
                    <select
                      id="edit-weightUnit"
                      name="weightUnit"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background"
                      defaultValue={selectedCategory.weightUnit}
                    >
                      <option value="lb">Pounds (lb)</option>
                      <option value="oz">Ounces (oz)</option>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="g">Grams (g)</option>
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditCategoryOpen(false);
                    setSelectedCategory(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateCategoryMutation.isPending}>
                  {updateCategoryMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Category Dialog */}
      <AlertDialog open={isDeleteCategoryOpen} onOpenChange={setIsDeleteCategoryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Weight Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedCategory?.categoryName}"? This will also
              remove all mappings using this category. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedCategory(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedCategory && deleteCategoryMutation.mutate(selectedCategory.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteCategoryMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Mapping Dialog */}
      <Dialog open={isAddMappingOpen} onOpenChange={(open) => {
        setIsAddMappingOpen(open);
        if (!open) setNewMappingProductType(""); // Clear pre-filled value on close
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Weight Mapping</DialogTitle>
            <DialogDescription>
              {newMappingProductType
                ? `Assign a weight category to "${newMappingProductType}".`
                : "Map a product type to a weight category."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createMappingMutation.mutate({
                productType: formData.get("productType") as string,
                weightCategoryId: formData.get("weightCategoryId") as string,
              });
            }}
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="productType">Product Type</Label>
                {newMappingProductType ? (
                  <>
                    <Input
                      id="productType"
                      name="productType"
                      value={newMappingProductType}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Pre-filled from unmapped product type
                    </p>
                  </>
                ) : (
                  <Input
                    id="productType"
                    name="productType"
                    placeholder="e.g., T-Shirts"
                    required
                  />
                )}
              </div>
              <div>
                <Label htmlFor="weightCategoryId">Weight Category</Label>
                <select
                  id="weightCategoryId"
                  name="weightCategoryId"
                  className="w-full h-10 px-3 border rounded-md bg-background"
                  required
                >
                  <option value="">Select a category...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.categoryName} ({cat.weightValue} {cat.weightUnit})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddMappingOpen(false);
                  setNewMappingProductType("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMappingMutation.isPending}>
                {createMappingMutation.isPending ? "Creating..." : "Create Mapping"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Mapping Dialog */}
      <Dialog open={isEditMappingOpen} onOpenChange={setIsEditMappingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Weight Mapping</DialogTitle>
            <DialogDescription>
              Change the weight category for "{selectedMapping?.productType}".
            </DialogDescription>
          </DialogHeader>
          {selectedMapping && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                updateMappingMutation.mutate({
                  id: selectedMapping.id,
                  data: {
                    weightCategoryId: formData.get("weightCategoryId") as string,
                  },
                });
              }}
            >
              <div className="space-y-4">
                <div>
                  <Label>Product Type</Label>
                  <Input value={selectedMapping.productType} disabled className="bg-muted" />
                </div>
                <div>
                  <Label htmlFor="edit-weightCategoryId">Weight Category</Label>
                  <select
                    id="edit-weightCategoryId"
                    name="weightCategoryId"
                    className="w-full h-10 px-3 border rounded-md bg-background"
                    defaultValue={selectedMapping.weightCategoryId || ""}
                    required
                  >
                    <option value="">Select a category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.categoryName} ({cat.weightValue} {cat.weightUnit})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditMappingOpen(false);
                    setSelectedMapping(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMappingMutation.isPending}>
                  {updateMappingMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Mapping Dialog */}
      <AlertDialog open={isDeleteMappingOpen} onOpenChange={setIsDeleteMappingOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Weight Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the mapping for "{selectedMapping?.productType}"?
              Products of this type will no longer have an assigned weight.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedMapping(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedMapping && deleteMappingMutation.mutate(selectedMapping.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMappingMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={handleImportClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Import Weight Categories</DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx) or CSV file with weight categories.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {/* File Selection */}
            <div>
              <Label htmlFor="import-file">Select File</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImportFileChange}
                className="mt-1"
              />
            </div>

            {/* Loading State */}
            {isLoadingPreview && (
              <div className="flex items-center justify-center p-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Analyzing file...</span>
              </div>
            )}

            {/* Error State */}
            {actionError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">{actionError}</p>
              </div>
            )}

            {/* Preview Section */}
            {importPreview && !isLoadingPreview && (
              <>
                {/* Sheet Selector */}
                {importPreview.sheets.length > 1 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <Label htmlFor="sheet-select" className="text-blue-800 dark:text-blue-200 font-medium">
                      Select Sheet to Import
                    </Label>
                    <select
                      id="sheet-select"
                      value={importSelectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border rounded-md bg-background"
                    >
                      {importPreview.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>
                          {sheet} {sheet === importPreview.selectedSheet ? "(auto-detected)" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                      Found {importPreview.sheets.length} sheets. Currently using: "{importSelectedSheet}"
                    </p>
                  </div>
                )}

                {/* Preview Summary */}
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {importPreview.rowCount} categories found
                  </Badge>
                  {importPreview.errorCount > 0 && (
                    <Badge variant="destructive">
                      {importPreview.errorCount} errors
                    </Badge>
                  )}
                </div>

                {/* Preview Table */}
                {importPreview.preview.length > 0 && (
                  <div className="border rounded-md overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2 text-sm font-medium border-b">
                      All {importPreview.rowCount} categories to import:
                    </div>
                    <div className="max-h-[400px] overflow-y-auto relative">
                      <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0 z-10 shadow-sm">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium bg-muted border-b w-12">#</th>
                            <th className="px-3 py-2 text-left font-medium bg-muted border-b">Category Name</th>
                            <th className="px-3 py-2 text-left font-medium bg-muted border-b w-24">Weight</th>
                            <th className="px-3 py-2 text-left font-medium bg-muted border-b w-16">Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.preview.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{idx + 1}</td>
                              <td className="px-3 py-2">{row.categoryName}</td>
                              <td className="px-3 py-2">{row.weightValue}</td>
                              <td className="px-3 py-2">
                                <span className="font-mono text-green-600 dark:text-green-400">{row.weightUnit}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Errors Preview */}
                {importPreview.errors && importPreview.errors.length > 0 && (
                  <div className="border border-orange-200 dark:border-orange-800 rounded-md overflow-hidden">
                    <div className="bg-orange-50 dark:bg-orange-950/20 px-3 py-2 text-sm font-medium text-orange-800 dark:text-orange-200 border-b border-orange-200 dark:border-orange-800">
                      Parsing Errors
                    </div>
                    <div className="p-2 text-sm">
                      {importPreview.errors.map((err, idx) => (
                        <div key={idx} className="text-orange-700 dark:text-orange-300">
                          Row {err.row}: {err.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Help Text (shown when no file selected) */}
            {!importFile && !isLoadingPreview && (
              <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
                <p className="font-medium">Required Columns:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  <li><span className="font-mono text-xs">Category Name</span> - Name for the weight category</li>
                  <li><span className="font-mono text-xs">Weight Value</span> - Numeric weight (e.g., 0.5, 1.25)</li>
                  <li><span className="font-mono text-xs">Weight Unit</span> - Unit: lb, oz, kg, or g</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Tip: Download the template for proper formatting
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleImportClose}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (importFile) {
                  importCategoriesMutation.mutate({
                    file: importFile,
                    sheet: importSelectedSheet || undefined
                  });
                }
              }}
              disabled={!importFile || !importPreview || importPreview.rowCount === 0 || importCategoriesMutation.isPending}
            >
              {importCategoriesMutation.isPending ? "Importing..." : `Import ${importPreview?.rowCount || 0} Categories`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progressive Fix Progress Modal */}
      <Dialog open={!!fixProgress?.isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {fixProgress?.processed === fixProgress?.total && (fixProgress?.total ?? 0) > 0
                ? "Weight Fix Complete"
                : "Fixing Weight Discrepancies"}
            </DialogTitle>
          </DialogHeader>

          <Progress value={(fixProgress?.processed || 0) / (fixProgress?.total || 1) * 100} className="w-full" />

          <div className="text-sm text-center text-muted-foreground">
            {fixProgress?.processed || 0} / {fixProgress?.total || 0} processed
          </div>

          <div className="flex justify-center gap-4 text-sm">
            <span className="text-green-600 font-medium">{fixProgress?.succeeded || 0} fixed</span>
            {(fixProgress?.failed || 0) > 0 && (
              <span className="text-red-600 font-medium">{fixProgress?.failed} failed</span>
            )}
          </div>

          {fixProgress?.currentItem && (fixProgress?.processed || 0) < (fixProgress?.total || 0) && (
            <p className="text-xs text-muted-foreground text-center truncate">
              Fixing: {fixProgress.currentItem}
            </p>
          )}

          {fixProgress?.cancelled && (fixProgress?.processed || 0) < (fixProgress?.total || 0) && (
            <p className="text-center text-sm text-orange-600 font-medium">Cancelled</p>
          )}

          {fixProgress?.processed === fixProgress?.total && (fixProgress?.total ?? 0) > 0 && (
            <p className="text-center font-medium text-green-600">
              All done! {fixProgress?.succeeded} variant{fixProgress?.succeeded !== 1 ? "s" : ""} fixed.
            </p>
          )}

          {(fixProgress?.errors?.length || 0) > 0 && (
            <div className="max-h-32 overflow-y-auto text-xs text-red-600 space-y-1 border rounded p-2">
              <p className="font-medium mb-1">Errors:</p>
              {fixProgress?.errors.map((e, i) => (
                <div key={i}>{e.product}: {e.message}</div>
              ))}
            </div>
          )}

          <DialogFooter>
            {(fixProgress?.processed || 0) < (fixProgress?.total || 0) && !fixProgress?.cancelled ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  fixCancelledRef.current = true;
                  setFixProgress(prev => prev ? { ...prev, cancelled: true } : null);
                }}
              >
                Cancel
              </Button>
            ) : (
              <Button onClick={() => setFixProgress(null)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
