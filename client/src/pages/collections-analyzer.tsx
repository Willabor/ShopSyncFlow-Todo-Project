import React, { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  WrenchIcon,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Edit,
  Tag,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { GoogleCategoryModal, type GoogleCategory } from "@/components/google-category-modal";

// ============================================================================
// TYPES (matching backend)
// ============================================================================

interface CollectionRule {
  column: string;
  relation: string;
  condition: string;
}

interface AffectedCollection {
  id: string;
  name: string;
  shopifyCollectionId: string | null;
  shopifyHandle: string | null;
  productCount: number;
  currentRules: {
    rules: CollectionRule[];
    appliedDisjunctively: boolean;
  };
  typeRule: CollectionRule | null;
  recommendedFix: {
    newTypeValue: string;
    suggestedTags: string[];
    explanation: string;

    // Google Product Taxonomy
    categoryId: string | null;
    categoryGid: string | null;
    categoryPath: string | null;
    categoryName: string | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    source: 'database' | 'ai' | 'fallback';
    reasoning?: string;
  } | null;
  requiresUpdate: boolean;

  // Product migration status
  productsMigrated: boolean;
  productsNeedingMigration: number;

  // Migration workflow status
  migrationStatus: 'needs_rules_fix' | 'needs_product_migration' | 'complete';
}

interface AnalysisReport {
  timestamp: string;
  totalCollections: number;
  totalSmartCollections: number;
  collectionsWithTypeRules: number;
  affectedCollections: number;

  // Migration progress stats
  collectionsFullyMigrated: number;
  collectionsAwaitingMigration: number;

  affected: AffectedCollection[];
  readyForMigration: boolean;
  warnings: string[];
  recommendations: string[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CollectionsAnalyzer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedCollection, setSelectedCollection] = useState<AffectedCollection | null>(null);
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Manual override state
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideProductType, setOverrideProductType] = useState("");
  const [overrideTags, setOverrideTags] = useState("");
  const [overrideGoogleCategory, setOverrideGoogleCategory] = useState<GoogleCategory | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Filtering and sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_rules_fix' | 'needs_product_migration' | 'complete'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'productCount' | 'productsNeedingMigration'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Fetch analysis report (disabled by default - only runs when button clicked)
  const {
    data: report,
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery<AnalysisReport>({
    queryKey: ["/api/categories/migration/analyze-collections"],
    queryFn: async () => {
      const response = await fetch("/api/categories/migration/analyze-collections", {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to analyze collections");
      }

      return response.json();
    },
    enabled: false, // Don't auto-fetch on mount - wait for button click
    staleTime: 30 * 1000, // 30 seconds
  });

  // Fix collection rules mutation
  const fixRulesMutation = useMutation({
    mutationFn: async ({ collectionId, newRules, appliedDisjunctively }: {
      collectionId: string;
      newRules: CollectionRule[];
      appliedDisjunctively: boolean;
    }) => {

      const response = await fetch("/api/categories/migration/fix-collection-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ collectionId, newRules, appliedDisjunctively }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error('❌ Fix rules error:', errorData);
        throw new Error(errorData.error || errorData.message || "Failed to fix collection rules");
      }

      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Collection rules updated in local database. Shopify will be synced later during migration.",
      });
      setShowFixDialog(false);
      setSelectedCollection(null);
      queryClient.invalidateQueries({ queryKey: ["/api/categories/migration/analyze-collections"] });
    },
    onError: (error: Error) => {
      console.error('❌ Fix rules mutation error:', error);
      toast({
        title: "Failed to Fix Collection Rules",
        description: error.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Migrate products mutation
  const migrateProductsMutation = useMutation({
    mutationFn: async ({ collectionId }: { collectionId: string }) => {

      const response = await fetch(`/api/categories/migration/migrate-collection-products/${collectionId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error('❌ Migrate products error:', errorData);
        throw new Error(errorData.error || errorData.message || "Failed to migrate products");
      }

      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Migrated ${data.productsUpdated} products in local database. Shopify will be synced later.`,
      });
      // Re-fetch analysis to update product migration status
      queryClient.invalidateQueries({ queryKey: ["/api/categories/migration/analyze-collections"] });
    },
    onError: (error: Error) => {
      console.error('❌ Migrate products mutation error:', error);
      toast({
        title: "Failed to Migrate Products",
        description: error.message || "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const handleFixRules = (collection: AffectedCollection) => {
    setSelectedCollection(collection);
    setShowFixDialog(true);
  };

  const handleMigrateProducts = (collection: AffectedCollection) => {
    // Confirm with user
    if (!confirm(`Migrate ${collection.productsNeedingMigration} products in "${collection.name}"?\n\nThis will update product types and add category tags in your local database only.`)) {
      return;
    }

    migrateProductsMutation.mutate({ collectionId: collection.id });
  };

  const handleOpenOverride = (collection: AffectedCollection) => {
    setSelectedCollection(collection);
    // Pre-fill with AI recommendation
    if (collection.recommendedFix) {
      setOverrideProductType(collection.recommendedFix.newTypeValue);
      setOverrideTags(collection.recommendedFix.suggestedTags.join(', '));
      setOverrideGoogleCategory(null); // Will be set via modal
    }
    setShowOverrideDialog(true);
  };

  const handleSelectGoogleCategory = (category: GoogleCategory) => {
    setOverrideGoogleCategory(category);

    // Intelligently extract product type from Google category path
    // For example: "Apparel & Accessories > ... > Cross Body Bags" → "Bags"
    const segments = category.path.split(' > ');
    let productType = category.name; // Default to category name

    // Try to extract a more general product type
    // Use the last segment (category name) unless it's too specific
    if (segments.length >= 2) {
      const lastSegment = segments[segments.length - 1];
      const secondLast = segments[segments.length - 2];

      // For apparel/accessories, try to use a broader category
      // Example: "Cross Body Bags" → "Bags", "T-Shirts" → "Shirts"
      if (lastSegment.includes('Bags')) {
        productType = 'Bags';
      } else if (lastSegment.includes('Shirt') || lastSegment.includes('Shirts')) {
        productType = 'Shirts';
      } else if (lastSegment.includes('Pant') || lastSegment.includes('Pants')) {
        productType = 'Pants';
      } else if (lastSegment.includes('Dress')) {
        productType = 'Dresses';
      } else if (lastSegment.includes('Jacket') || lastSegment.includes('Coat')) {
        productType = 'Jackets';
      } else if (lastSegment.includes('Shoe') || lastSegment.includes('Footwear')) {
        productType = 'Footwear';
      } else if (lastSegment.includes('Hat') || lastSegment.includes('Cap')) {
        productType = 'Headwear';
      } else {
        // Otherwise use the category name as-is
        productType = lastSegment;
      }
    }

    setOverrideProductType(productType);

    toast({
      title: "Google Category Selected",
      description: `Product Type set to: ${productType}`,
    });
  };

  const handleApplyOverride = () => {
    if (!selectedCollection) return;

    // Use the manual override values
    const customRecommendation = {
      newTypeValue: overrideProductType,
      suggestedTags: overrideTags.split(',').map(t => t.trim()).filter(t => t),
      categoryPath: overrideGoogleCategory?.path || null,
      categoryId: overrideGoogleCategory?.id || null,
      categoryGid: overrideGoogleCategory?.gid || null,
      categoryName: overrideGoogleCategory?.name || null,
    };

    // Close override dialog
    setShowOverrideDialog(false);

    // Store the custom recommendation temporarily
    const collectionWithOverride = {
      ...selectedCollection,
      recommendedFix: {
        ...selectedCollection.recommendedFix!,
        newTypeValue: customRecommendation.newTypeValue,
        suggestedTags: customRecommendation.suggestedTags,
        categoryPath: customRecommendation.categoryPath,
        categoryId: customRecommendation.categoryId,
        categoryGid: customRecommendation.categoryGid,
        categoryName: customRecommendation.categoryName,
      }
    };

    // Update selectedCollection and show fix dialog
    setSelectedCollection(collectionWithOverride);
    setShowFixDialog(true);
  };

  const confirmFixRules = () => {
    if (!selectedCollection || !selectedCollection.recommendedFix) return;

    const currentRules = selectedCollection.currentRules.rules;
    const typeRuleIndex = currentRules.findIndex(r => r.column === 'TYPE' || r.column === 'PRODUCT_TYPE');

    // Build new rules: replace TYPE rule + add TAG rules
    const newRules: CollectionRule[] = [];

    // Add all non-TYPE rules
    currentRules.forEach((rule, index) => {
      if (index !== typeRuleIndex) {
        newRules.push(rule);
      }
    });

    // Add new TYPE rule with clean value
    newRules.push({
      column: 'TYPE',
      relation: 'EQUALS',
      condition: selectedCollection.recommendedFix.newTypeValue,
    });

    // Add TAG rules for suggested tags
    selectedCollection.recommendedFix.suggestedTags.forEach(tag => {
      newRules.push({
        column: 'TAG',
        relation: 'EQUALS',
        condition: tag,
      });
    });

    fixRulesMutation.mutate({
      collectionId: selectedCollection.id,
      newRules,
      appliedDisjunctively: selectedCollection.currentRules.appliedDisjunctively,
    });
  };

  // Filter and sort collections
  const filteredAndSortedCollections = React.useMemo(() => {
    if (!report) return [];

    let filtered = report.affected;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(query));
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.migrationStatus === statusFilter);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'productCount':
          comparison = a.productCount - b.productCount;
          break;
        case 'productsNeedingMigration':
          comparison = a.productsNeedingMigration - b.productsNeedingMigration;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [report, searchQuery, statusFilter, sortBy, sortOrder]);

  const toggleRowExpand = (collectionId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(collectionId)) {
      newExpanded.delete(collectionId);
    } else {
      newExpanded.add(collectionId);
    }
    setExpandedRows(newExpanded);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <MainLayout
      title="Collections Analyzer"
      subtitle="Analyze smart collections to identify which ones will break during category migration"
      actions={
        <Button
          onClick={() => refetch()}
          disabled={isFetching}
          variant="outline"
        >
          {isFetching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Run Analysis
            </>
          )}
        </Button>
      }
    >
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Failed to analyze collections"}
              </AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {isLoading && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                  <p className="text-muted-foreground">Analyzing collections...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Initial State - No Report Yet */}
          {!report && !isLoading && !error && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Ready to Analyze Collections</h3>
                    <p className="text-muted-foreground">
                      Click "Run Analysis" to identify collections that will break during category migration
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analysis Report */}
          {report && (
            <>
              {/* Status Card */}
              <Card className={report.readyForMigration ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    {report.readyForMigration ? (
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-8 w-8 text-amber-600" />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-xl">
                        {report.readyForMigration ? "✅ Ready for Migration" : "⚠️ Not Ready for Migration"}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {report.readyForMigration
                          ? "All collections are safe! You can proceed with category migration."
                          : `${report.affectedCollections} collections will BREAK during migration and must be fixed first.`
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Collections</CardDescription>
                    <CardTitle className="text-3xl">{report.totalCollections}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Smart Collections</CardDescription>
                    <CardTitle className="text-3xl">{report.totalSmartCollections}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>With TYPE Rules</CardDescription>
                    <CardTitle className="text-3xl">{report.collectionsWithTypeRules}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className={report.affectedCollections > 0 ? "border-amber-500" : "border-green-500"}>
                  <CardHeader className="pb-2">
                    <CardDescription>Affected by Migration</CardDescription>
                    <CardTitle className={`text-3xl ${report.affectedCollections > 0 ? "text-amber-600" : "text-green-600"}`}>
                      {report.affectedCollections}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="border-green-500">
                  <CardHeader className="pb-2">
                    <CardDescription>✅ Fully Migrated</CardDescription>
                    <CardTitle className="text-3xl text-green-600">
                      {report.collectionsFullyMigrated}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className={report.collectionsAwaitingMigration > 0 ? "border-amber-500" : "border-green-500"}>
                  <CardHeader className="pb-2">
                    <CardDescription>⏳ Awaiting Migration</CardDescription>
                    <CardTitle className={`text-3xl ${report.collectionsAwaitingMigration > 0 ? "text-amber-600" : "text-green-600"}`}>
                      {report.collectionsAwaitingMigration}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Warnings */}
              {report.warnings.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Warnings</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      {report.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Recommendations</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                      {report.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Affected Collections Table */}
              {report.affected.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Affected Collections ({report.affected.length})</CardTitle>
                    <CardDescription>
                      Collections needing rules fixes or product migration
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Filter and Search Controls */}
                    <div className="flex gap-4 mb-4 flex-wrap items-center">
                      {/* Search */}
                      <div className="flex-1 min-w-[200px]">
                        <Input
                          placeholder="Search collections..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="max-w-sm"
                        />
                      </div>

                      {/* Status Filter */}
                      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                        <TabsList>
                          <TabsTrigger value="all">All ({report.affected.length})</TabsTrigger>
                          <TabsTrigger value="needs_rules_fix">
                            🔧 Rules ({report.affected.filter(c => c.migrationStatus === 'needs_rules_fix').length})
                          </TabsTrigger>
                          <TabsTrigger value="needs_product_migration">
                            📦 Products ({report.affected.filter(c => c.migrationStatus === 'needs_product_migration').length})
                          </TabsTrigger>
                          <TabsTrigger value="complete">
                            ✅ Complete ({report.collectionsFullyMigrated})
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      {/* Sort Control */}
                      <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Sort by Name</SelectItem>
                          <SelectItem value="productCount">Sort by Products</SelectItem>
                          <SelectItem value="productsNeedingMigration">Sort by Needs Migration</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Sort Order */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      >
                        {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                      </Button>
                    </div>

                    {/* Results Count */}
                    <div className="text-sm text-muted-foreground mb-2">
                      Showing {filteredAndSortedCollections.length} of {report.affected.length} collections
                    </div>

                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Collection Name</TableHead>
                            <TableHead>Products</TableHead>
                            <TableHead>Current TYPE Value</TableHead>
                            <TableHead>Recommended Fix</TableHead>
                            <TableHead>Products Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAndSortedCollections.map((collection) => (
                            <Fragment key={collection.id}>
                              <TableRow className="cursor-pointer hover:bg-muted/50">
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleRowExpand(collection.id)}
                                  >
                                    {expandedRows.has(collection.id) ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-medium">{collection.name}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{collection.productCount}</Badge>
                                </TableCell>
                                <TableCell>
                                  <code className="text-sm bg-muted px-2 py-1 rounded">
                                    {collection.typeRule?.condition || 'N/A'}
                                  </code>
                                </TableCell>
                                <TableCell>
                                  {collection.recommendedFix && (
                                    <div className="text-sm space-y-1">
                                      {/* Product Type */}
                                      <div className="font-medium text-green-600">
                                        TYPE: "{collection.recommendedFix.newTypeValue}"
                                      </div>

                                      {/* Google Category Path */}
                                      {collection.recommendedFix.categoryPath && (
                                        <div className="text-xs text-blue-600 flex items-center gap-1">
                                          <span className="font-mono">📂</span>
                                          <span className="truncate max-w-[200px]" title={collection.recommendedFix.categoryPath}>
                                            {collection.recommendedFix.categoryPath}
                                          </span>
                                        </div>
                                      )}

                                      {/* Suggested Tags */}
                                      {collection.recommendedFix.suggestedTags.length > 0 && (
                                        <div className="text-xs text-muted-foreground">
                                          + Tags: {collection.recommendedFix.suggestedTags.join(', ')}
                                        </div>
                                      )}

                                      {/* Confidence & Source Badges */}
                                      <div className="flex gap-1 mt-1">
                                        {/* Confidence Badge */}
                                        {collection.recommendedFix.confidence !== 'none' && (
                                          <Badge
                                            variant="outline"
                                            className={
                                              collection.recommendedFix.confidence === 'high'
                                                ? 'bg-green-50 text-green-700 border-green-200 text-xs'
                                                : collection.recommendedFix.confidence === 'medium'
                                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200 text-xs'
                                                : 'bg-orange-50 text-orange-700 border-orange-200 text-xs'
                                            }
                                          >
                                            {collection.recommendedFix.confidence === 'high' && '✓ '}
                                            {collection.recommendedFix.confidence}
                                          </Badge>
                                        )}

                                        {/* Source Badge */}
                                        <Badge
                                          variant="outline"
                                          className={
                                            collection.recommendedFix.source === 'database'
                                              ? 'bg-blue-50 text-blue-700 border-blue-200 text-xs'
                                              : collection.recommendedFix.source === 'ai'
                                              ? 'bg-purple-50 text-purple-700 border-purple-200 text-xs'
                                              : 'bg-gray-50 text-gray-700 border-gray-200 text-xs'
                                          }
                                        >
                                          {collection.recommendedFix.source === 'database' && '🗄️ '}
                                          {collection.recommendedFix.source === 'ai' && '🤖 '}
                                          {collection.recommendedFix.source}
                                        </Badge>
                                      </div>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {collection.migrationStatus === 'complete' ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                      ✅ Complete
                                    </Badge>
                                  ) : collection.migrationStatus === 'needs_rules_fix' ? (
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                      🔧 Rules need fixing
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                      📦 {collection.productsNeedingMigration} products need migration
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex gap-2 justify-end">
                                    {/* Show Edit button to override AI recommendation */}
                                    {collection.migrationStatus === 'needs_rules_fix' && collection.recommendedFix && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleOpenOverride(collection)}
                                      >
                                        <Edit className="mr-2 h-4 w-4" />
                                        Edit
                                      </Button>
                                    )}

                                    {/* Show Fix Rules button only if rules need fixing */}
                                    {collection.migrationStatus === 'needs_rules_fix' && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleFixRules(collection)}
                                        disabled={fixRulesMutation.isPending}
                                      >
                                        <WrenchIcon className="mr-2 h-4 w-4" />
                                        Fix Rules
                                      </Button>
                                    )}

                                    {/* Show Migrate Products button if products need migration OR complete */}
                                    {(collection.migrationStatus === 'needs_product_migration' || collection.migrationStatus === 'needs_rules_fix') && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => handleMigrateProducts(collection)}
                                        disabled={
                                          collection.migrationStatus === 'needs_rules_fix' || // Disable if rules not fixed yet
                                          collection.productsNeedingMigration === 0 ||
                                          migrateProductsMutation.isPending
                                        }
                                      >
                                        {migrateProductsMutation.isPending ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Migrating...
                                          </>
                                        ) : (
                                          <>
                                            <ArrowRight className="mr-2 h-4 w-4" />
                                            Migrate Products
                                          </>
                                        )}
                                      </Button>
                                    )}

                                    {/* Show completion badge if complete */}
                                    {collection.migrationStatus === 'complete' && (
                                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                                        ✓ Fully Migrated
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>

                              {/* Expanded Row Details */}
                              {expandedRows.has(collection.id) && (
                                <TableRow>
                                  <TableCell colSpan={7} className="bg-muted/30">
                                    <div className="p-4 space-y-3">
                                      <div>
                                        <h4 className="font-semibold mb-2">Current Rules:</h4>
                                        <div className="space-y-1">
                                          {collection.currentRules.rules.map((rule, i) => (
                                            <div key={i} className="text-sm font-mono bg-background px-3 py-2 rounded">
                                              {rule.column} {rule.relation} "{rule.condition}"
                                            </div>
                                          ))}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-2">
                                          Applied {collection.currentRules.appliedDisjunctively ? 'disjunctively (OR)' : 'conjunctively (AND)'}
                                        </div>
                                      </div>

                                      {collection.recommendedFix && (
                                        <div>
                                          <h4 className="font-semibold mb-2">Explanation:</h4>
                                          <p className="text-sm text-muted-foreground">
                                            {collection.recommendedFix.explanation}
                                          </p>
                                        </div>
                                      )}

                                      {collection.shopifyHandle && (
                                        <div className="text-xs text-muted-foreground">
                                          Shopify Handle: <code>{collection.shopifyHandle}</code>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Last Updated */}
              <div className="text-sm text-muted-foreground text-center">
                Last analyzed: {new Date(report.timestamp).toLocaleString()}
              </div>
            </>
          )}
        </div>

        {/* Fix Rules Confirmation Dialog */}
        <Dialog open={showFixDialog} onOpenChange={setShowFixDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fix Collection Rules (Local Database Only)</DialogTitle>
              <DialogDescription>
                This will update the collection rules in your <strong>local dev database only</strong>.
                Shopify will be synced later during the full migration.
              </DialogDescription>
            </DialogHeader>

            {selectedCollection && (
              <div className="space-y-4 py-4">
                <div>
                  <h4 className="font-semibold mb-2">Collection:</h4>
                  <p className="text-sm">{selectedCollection.name}</p>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Current TYPE Rule:</h4>
                  <code className="text-sm bg-muted px-2 py-1 rounded block">
                    TYPE = "{selectedCollection.typeRule?.condition}"
                  </code>
                </div>

                {selectedCollection.recommendedFix && (
                  <>
                    <div>
                      <h4 className="font-semibold mb-2">New TYPE Rule:</h4>
                      <code className="text-sm bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded block text-green-700 dark:text-green-400">
                        TYPE = "{selectedCollection.recommendedFix.newTypeValue}"
                      </code>
                    </div>

                    {selectedCollection.recommendedFix.suggestedTags.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Additional TAG Rules:</h4>
                        <div className="space-y-1">
                          {selectedCollection.recommendedFix.suggestedTags.map((tag, i) => (
                            <code key={i} className="text-sm bg-blue-100 dark:bg-blue-900/20 px-2 py-1 rounded block text-blue-700 dark:text-blue-400">
                              TAG = "{tag}"
                            </code>
                          ))}
                        </div>
                      </div>
                    )}

                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>
                        {selectedCollection.recommendedFix.explanation}
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowFixDialog(false);
                  setSelectedCollection(null);
                }}
                disabled={fixRulesMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmFixRules}
                disabled={fixRulesMutation.isPending}
              >
                {fixRulesMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fixing...
                  </>
                ) : (
                  <>
                    <WrenchIcon className="mr-2 h-4 w-4" />
                    Fix Rules
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manual Override Dialog */}
        <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Override AI Recommendation</DialogTitle>
              <DialogDescription>
                Manually edit the product type, tags, and category recommendation.
              </DialogDescription>
            </DialogHeader>

            {selectedCollection && (
              <div className="space-y-4 py-4">
                <div>
                  <h4 className="font-semibold mb-2">Collection:</h4>
                  <p className="text-sm">{selectedCollection.name}</p>
                </div>

                {/* AI Recommendation (Read-only) */}
                {selectedCollection.recommendedFix && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>AI Recommendation</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <div className="text-sm">
                        <strong>Product Type:</strong> {selectedCollection.recommendedFix.newTypeValue}
                      </div>
                      {selectedCollection.recommendedFix.suggestedTags.length > 0 && (
                        <div className="text-sm">
                          <strong>Tags:</strong> {selectedCollection.recommendedFix.suggestedTags.join(', ')}
                        </div>
                      )}
                      {selectedCollection.recommendedFix.categoryPath && (
                        <div className="text-sm">
                          <strong>Google Category:</strong> {selectedCollection.recommendedFix.categoryPath}
                        </div>
                      )}
                      {selectedCollection.recommendedFix.reasoning && (
                        <div className="text-sm italic text-muted-foreground">
                          {selectedCollection.recommendedFix.reasoning}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Editable Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Product Type <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={overrideProductType}
                      onChange={(e) => setOverrideProductType(e.target.value)}
                      placeholder="e.g., Bags, Dresses, Jackets"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Tags (comma-separated)
                    </label>
                    <Input
                      value={overrideTags}
                      onChange={(e) => setOverrideTags(e.target.value)}
                      placeholder="e.g., Accessories, Women, Casual"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">
                        Google Product Category (optional)
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCategoryModal(true)}
                        className="h-7 text-xs"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        Search Category
                      </Button>
                    </div>

                    {overrideGoogleCategory ? (
                      <div className="p-3 bg-primary/10 border border-primary rounded-md">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-primary">
                                {overrideGoogleCategory.name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                Level {overrideGoogleCategory.level}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {overrideGoogleCategory.path}
                            </p>
                          </div>
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
                        No category selected. Click "Search Category" to browse Google Product Categories.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowOverrideDialog(false);
                  setOverrideProductType('');
                  setOverrideTags('');
                  setOverrideGoogleCategory(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApplyOverride}
                disabled={!overrideProductType.trim()}
              >
                Apply Override
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Google Category Search Modal */}
        <GoogleCategoryModal
          open={showCategoryModal}
          onOpenChange={setShowCategoryModal}
          onSelectCategory={handleSelectGoogleCategory}
          currentCategory={overrideGoogleCategory}
        />
      </div>
    </MainLayout>
  );
}
