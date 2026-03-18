import { useState } from "react";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layouts";
import {
  useHealthIssues,
  useRunHealthCheck,
  useCollectionsInNavigation,
  useSyncNavigation,
  useDeleteCollection,
  type HealthIssue,
  type CollectionInNavigation,
} from "@/hooks/use-health-check";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Folder,
  AlertCircle,
  Clock,
  Package,
  Navigation,
  Lightbulb,
  Menu,
  BookOpen,
  HelpCircle,
  User,
  Calendar,
  Info,
  FileText,
  Printer,
} from "lucide-react";
import { ConflictCard, type NavigationConflictDisplay } from "@/components/health/ConflictCard";
import { PrintReport } from "@/components/health/PrintReport";

// Tab type
type TabType = "action" | "duplicates" | "navigation" | "handles";

// Collection type for display
interface CollectionInfo {
  id: string;
  name: string;
  slug: string;
  shopifyHandle: string | null;
  shopifyCollectionId: string | null;
  productCount: number;
  image: string | null;
  createdAt: string;
  shopifyCreatedAt: string | null; // Actual creation date from Shopify
  createdByType: string | null;
  createdByName: string | null;
}

// Group health issues by duplicate_group_id
interface DuplicateGroupDisplay {
  groupId: string;
  name: string;
  issues: HealthIssue[];
  collections: CollectionInfo[];
  severity: string;
}

// Handle mismatch pattern analysis
interface HandlePatternGroup {
  pattern: string;
  count: number;
  severity: string;
  description: string;
  issues: HealthIssue[];
}

// Extract collection name from description
function extractNameFromDescription(description: string): string {
  const match = description.match(/Collection "([^"]+)"/);
  return match ? match[1] : "Unknown";
}

function groupIssuesByDuplicateGroup(
  issues: HealthIssue[],
  allCollections: CollectionInfo[]
): DuplicateGroupDisplay[] {
  const groups = new Map<string, DuplicateGroupDisplay>();

  // Create a map of collections by name (lowercase for case-insensitive matching)
  const collectionsByName = new Map<string, CollectionInfo[]>();
  allCollections.forEach(col => {
    const nameLower = col.name.toLowerCase();
    const existing = collectionsByName.get(nameLower) || [];
    existing.push(col);
    collectionsByName.set(nameLower, existing);
  });

  issues
    .filter(issue => issue.issueType === "duplicate" && issue.status === "open")
    .forEach(issue => {
      const groupId = issue.metadata?.groupId || issue.id;
      const name = extractNameFromDescription(issue.description);
      const nameLower = name.toLowerCase();

      // Find ALL collections with this name (both the duplicate and the original)
      const matchingCollections = collectionsByName.get(nameLower) || [];

      const existing = groups.get(groupId);

      if (existing) {
        existing.issues.push(issue);
        // Use highest severity in group
        if (getSeverityOrder(issue.severity) < getSeverityOrder(existing.severity)) {
          existing.severity = issue.severity;
        }
      } else {
        groups.set(groupId, {
          groupId,
          name,
          issues: [issue],
          collections: matchingCollections,
          severity: issue.severity,
        });
      }
    });

  // Sort by severity
  return Array.from(groups.values()).sort(
    (a, b) => getSeverityOrder(a.severity) - getSeverityOrder(b.severity)
  );
}

// Group handle mismatch issues by pattern
function groupHandleMismatchByPattern(issues: HealthIssue[]): HandlePatternGroup[] {
  const handleIssues = issues.filter(
    i => i.issueType === "handle_mismatch" && i.status === "open"
  );

  const patterns: Record<string, HandlePatternGroup> = {};

  handleIssues.forEach(issue => {
    const actualHandle = issue.metadata?.actualHandle as string || "";
    let pattern = "other";
    let description = "Various handle mismatches";

    if (actualHandle.startsWith("color-")) {
      pattern = "color";
      description = "Color prefix (color-red → red)";
    } else if (actualHandle.startsWith("size-")) {
      pattern = "size";
      description = "Size prefix (size-small → small)";
    } else if (actualHandle.startsWith("vendor-")) {
      pattern = "vendor";
      description = "Vendor prefix (vendor-nike → nike)";
    } else if (actualHandle.startsWith("price-")) {
      pattern = "price";
      description = "Price prefix (price-20-40 → 20-40)";
    } else if (actualHandle.startsWith("type-")) {
      pattern = "type";
      description = "Type prefix (type-shirts → shirts)";
    } else if (actualHandle.endsWith("-collection")) {
      pattern = "collection-suffix";
      description = "Collection suffix (name-collection)";
    }

    if (!patterns[pattern]) {
      patterns[pattern] = {
        pattern,
        count: 0,
        severity: issue.severity,
        description,
        issues: [],
      };
    }

    patterns[pattern].count++;
    patterns[pattern].issues.push(issue);
    // Keep highest severity
    if (getSeverityOrder(issue.severity) < getSeverityOrder(patterns[pattern].severity)) {
      patterns[pattern].severity = issue.severity;
    }
  });

  return Object.values(patterns).sort((a, b) => b.count - a.count);
}

function getSeverityOrder(severity: string): number {
  switch (severity) {
    case "critical": return 0;
    case "high": return 1;
    case "medium": return 2;
    case "low": return 3;
    default: return 4;
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-500";
    case "high": return "bg-orange-500";
    case "medium": return "bg-yellow-500";
    case "low": return "bg-blue-500";
    default: return "bg-gray-500";
  }
}

function getSeverityBgColor(severity: string): string {
  switch (severity) {
    case "critical": return "bg-red-50 border-red-200";
    case "high": return "bg-orange-50 border-orange-200";
    case "medium": return "bg-yellow-50 border-yellow-200";
    case "low": return "bg-blue-50 border-blue-200";
    default: return "bg-gray-50 border-gray-200";
  }
}

// Format creator info
function formatCreator(type: string | null, name: string | null): string {
  if (!type && !name) return "Unknown";
  if (type === "app") return name || "App";
  if (type === "staff") return name || "Staff";
  return name || type || "Unknown";
}

// Stats Cards Component - REDESIGNED
function StatsCards({
  issues,
  totalCollections,
  activeTab,
  onTabChange,
}: {
  issues: HealthIssue[];
  totalCollections: number;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  const openIssues = issues.filter(i => i.status === "open");
  const duplicates = openIssues.filter(i => i.issueType === "duplicate").length;
  const navConflicts = openIssues.filter(i => i.issueType === "nav_conflict").length;
  const handleMismatches = openIssues.filter(i => i.issueType === "handle_mismatch").length;

  // Action required = duplicates + nav conflicts (not handle mismatches)
  const actionRequired = duplicates + navConflicts;

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Collections</CardTitle>
          <Folder className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCollections.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">in database</p>
        </CardContent>
      </Card>

      <Card
        className={`cursor-pointer transition-all ${
          activeTab === "action"
            ? "ring-2 ring-red-500 border-red-500"
            : actionRequired > 0
              ? "border-red-200 bg-red-50/50 hover:bg-red-100/50"
              : "border-green-200 bg-green-50/50"
        }`}
        onClick={() => onTabChange("action")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Action Required</CardTitle>
          {actionRequired > 0 ? (
            <AlertTriangle className="h-4 w-4 text-red-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${actionRequired > 0 ? "text-red-600" : "text-green-600"}`}>
            {actionRequired}
          </div>
          <p className="text-xs text-muted-foreground">critical + high priority</p>
        </CardContent>
      </Card>

      <Card
        className={`cursor-pointer transition-all ${
          activeTab === "duplicates"
            ? "ring-2 ring-yellow-500 border-yellow-500"
            : duplicates > 0
              ? "border-yellow-200 bg-yellow-50/50 hover:bg-yellow-100/50"
              : ""
        }`}
        onClick={() => onTabChange("duplicates")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
          <Package className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${duplicates > 0 ? "text-yellow-600" : ""}`}>
            {duplicates}
          </div>
          <p className="text-xs text-muted-foreground">groups to review</p>
        </CardContent>
      </Card>

      <Card
        className={`cursor-pointer transition-all ${
          activeTab === "navigation"
            ? "ring-2 ring-orange-500 border-orange-500"
            : navConflicts > 0
              ? "border-orange-200 bg-orange-50/50 hover:bg-orange-100/50"
              : ""
        }`}
        onClick={() => onTabChange("navigation")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Nav Conflicts</CardTitle>
          <Navigation className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${navConflicts > 0 ? "text-orange-600" : ""}`}>
            {navConflicts}
          </div>
          <p className="text-xs text-muted-foreground">require fixing</p>
        </CardContent>
      </Card>

      <Card
        className={`cursor-pointer transition-all ${
          activeTab === "handles"
            ? "ring-2 ring-gray-500 border-gray-500"
            : "border-gray-200 bg-gray-50/50 hover:bg-gray-100/50"
        }`}
        onClick={() => onTabChange("handles")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Handle Notes</CardTitle>
          <FileText className="h-4 w-4 text-gray-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-600">
            {handleMismatches.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">mostly app-generated</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Tab Navigation Component
function TabNavigation({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  counts: { action: number; duplicates: number; navigation: number; handles: number };
}) {
  return (
    <div className="border-b border-gray-200 bg-white rounded-t-lg">
      <div className="flex">
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "action"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
          onClick={() => onTabChange("action")}
        >
          Action Required ({counts.action})
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "duplicates"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
          onClick={() => onTabChange("duplicates")}
        >
          All Duplicates ({counts.duplicates})
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "navigation"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
          onClick={() => onTabChange("navigation")}
        >
          Nav Conflicts ({counts.navigation})
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "handles"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
          onClick={() => onTabChange("handles")}
        >
          Handle Analysis ({counts.handles.toLocaleString()})
        </button>
      </div>
    </div>
  );
}

// Simplified Duplicate Group Card - NO images, compact, with creator info
function DuplicateGroupCard({
  group,
  collectionsInNav,
  onDelete,
  isDeleting,
}: {
  group: DuplicateGroupDisplay;
  collectionsInNav: CollectionInNavigation[];
  onDelete: (collectionId: string, collectionName: string) => void;
  isDeleting: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Create a set of Shopify IDs that are in navigation for quick lookup
  const navShopifyIds = new Set(collectionsInNav.map(c => c.shopifyCollectionId));

  // Find the ID of the collection to KEEP from the backend recommendation
  const keepCollectionId = group.issues[0]?.relatedCollectionId;

  // Convert to display format
  const collectionsData = group.collections.map(collection => {
    const relatedIssue = group.issues.find(i => i.collectionId === collection.id);
    const inNav = collection.shopifyCollectionId ? navShopifyIds.has(collection.shopifyCollectionId) : false;
    const navInfo = inNav ? collectionsInNav.find(c => c.shopifyCollectionId === collection.shopifyCollectionId) : null;

    const isKeep = keepCollectionId
      ? collection.id === keepCollectionId
      : !relatedIssue;

    return {
      id: collection.id,
      name: collection.name,
      handle: collection.slug || collection.shopifyHandle || "unknown",
      productCount: relatedIssue?.metadata?.productCount ?? collection.productCount ?? 0,
      inNavigation: inNav,
      navMenuTitle: navInfo?.menuTitle,
      isRecommendedKeep: isKeep,
      createdAt: collection.createdAt,
      shopifyCreatedAt: collection.shopifyCreatedAt, // Actual Shopify creation date
      createdByType: collection.createdByType,
      createdByName: collection.createdByName,
      shopifyCollectionId: collection.shopifyCollectionId,
    };
  });

  // Sort: keep collection first
  const sortedCollections = [...collectionsData].sort((a, b) => {
    if (a.isRecommendedKeep && !b.isRecommendedKeep) return -1;
    if (!a.isRecommendedKeep && b.isRecommendedKeep) return 1;
    return 0;
  });

  const keepCollection = sortedCollections.find(c => c.isRecommendedKeep);
  const deleteCollections = sortedCollections.filter(c => !c.isRecommendedKeep);

  return (
    <div className={`border rounded-lg ${getSeverityBgColor(group.severity)}`}>
      <div
        className="p-4 cursor-pointer hover:bg-opacity-80"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-semibold">{group.name}</span>
            <span className="text-sm text-muted-foreground">
              {sortedCollections.length} collections
            </span>
            {keepCollection && (
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                Keep: {keepCollection.handle}
              </Badge>
            )}
            {deleteCollections.some(c => c.inNavigation) && (
              <Badge variant="destructive" className="text-xs">
                ⚠️ In Navigation
              </Badge>
            )}
          </div>
          <Badge className={getSeverityColor(group.severity)}>
            {group.severity}
          </Badge>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Keep Collection */}
          {keepCollection && (
            <div className="border-2 border-green-500 rounded-lg p-3 bg-green-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-700">KEEP</span>
                </div>
                {keepCollection.shopifyCollectionId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      const shopifyId = keepCollection.shopifyCollectionId?.replace("gid://shopify/Collection/", "");
                      window.open(`https://admin.shopify.com/store/nexus-clothes/collections/${shopifyId}`, "_blank");
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Shopify
                  </Button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Handle:</span>
                  <div className="font-mono text-xs">{keepCollection.handle}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Products:</span>
                  <div className="font-medium">{keepCollection.productCount}</div>
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Created by:</span>
                  <span>{formatCreator(keepCollection.createdByType, keepCollection.createdByName)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span>{keepCollection.shopifyCreatedAt
                    ? new Date(keepCollection.shopifyCreatedAt).toLocaleDateString()
                    : keepCollection.createdAt
                      ? new Date(keepCollection.createdAt).toLocaleDateString()
                      : "Unknown"}</span>
                </div>
              </div>
              {keepCollection.inNavigation && (
                <div className="mt-2 text-xs text-green-700">
                  <Navigation className="h-3 w-3 inline mr-1" />
                  In navigation: {keepCollection.navMenuTitle}
                </div>
              )}
            </div>
          )}

          {/* Delete Collections */}
          {deleteCollections.map((collection, idx) => (
            <div key={idx} className="border-2 border-red-300 rounded-lg p-3 bg-red-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-red-700">DELETE</span>
                </div>
                <div className="flex gap-2">
                  {collection.shopifyCollectionId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        const shopifyId = collection.shopifyCollectionId?.replace("gid://shopify/Collection/", "");
                        window.open(`https://admin.shopify.com/store/nexus-clothes/collections/${shopifyId}`, "_blank");
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={collection.inNavigation || isDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(collection.id, collection.name);
                    }}
                  >
                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                  </Button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Handle:</span>
                  <div className="font-mono text-xs">{collection.handle}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Products:</span>
                  <div className="font-medium">{collection.productCount}</div>
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Created by:</span>
                  <span>{formatCreator(collection.createdByType, collection.createdByName)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Created:</span>
                  <span>{collection.shopifyCreatedAt
                    ? new Date(collection.shopifyCreatedAt).toLocaleDateString()
                    : collection.createdAt
                      ? new Date(collection.createdAt).toLocaleDateString()
                      : "Unknown"}</span>
                </div>
              </div>
              {collection.inNavigation && (
                <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-800">
                  <Navigation className="h-3 w-3 inline mr-1" />
                  <strong>BLOCKED:</strong> In navigation "{collection.navMenuTitle}" - remove from nav first
                </div>
              )}
            </div>
          ))}

          {/* Education link */}
          <div className="flex items-center gap-2 pt-2">
            <HelpCircle className="h-4 w-4 text-indigo-500" />
            <a
              href="/education"
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
            >
              Why did this happen? Learn about collection handles
              <BookOpen className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Handle Analysis Tab Content
function HandleAnalysisTab({ issues }: { issues: HealthIssue[] }) {
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const patternGroups = groupHandleMismatchByPattern(issues);
  const totalHandleMismatches = patternGroups.reduce((sum, g) => sum + g.count, 0);

  if (totalHandleMismatches === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h4 className="text-lg font-semibold text-gray-800">No handle mismatches detected</h4>
        <p className="text-muted-foreground">All collection handles match their expected format.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {patternGroups.slice(0, 4).map(group => (
          <Card
            key={group.pattern}
            className={`cursor-pointer transition-all ${
              expandedPattern === group.pattern ? "ring-2 ring-blue-500" : "hover:shadow-md"
            }`}
            onClick={() => setExpandedPattern(expandedPattern === group.pattern ? null : group.pattern)}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-700">{group.count.toLocaleString()}</div>
              <div className="text-sm font-medium capitalize">{group.pattern.replace("-", " ")}</div>
              <div className="text-xs text-muted-foreground mt-1">{group.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-blue-800">Why do these exist?</div>
            <p className="text-sm text-blue-700 mt-1">
              Most handle mismatches are created by apps like <strong>Power Tools Filter Menu</strong>.
              When creating filter collections, the app adds prefixes (color-, size-) to handles for organization.
              This is <strong>expected behavior</strong> and usually doesn't require action.
            </p>
            <p className="text-sm text-blue-700 mt-2">
              <strong>When to fix:</strong> Only if a collection with a mismatched handle is linked in navigation
              or referenced by external systems expecting a specific URL pattern.
            </p>
          </div>
        </div>
      </div>

      {/* Expanded Pattern Details */}
      {expandedPattern && (
        <div className="border rounded-lg">
          <div className="p-4 bg-gray-50 border-b">
            <h4 className="font-semibold capitalize">
              {expandedPattern.replace("-", " ")} Pattern Details
            </h4>
            <p className="text-sm text-muted-foreground">
              Showing first 20 of {patternGroups.find(g => g.pattern === expandedPattern)?.count || 0} issues
            </p>
          </div>
          <div className="divide-y max-h-96 overflow-auto">
            {patternGroups
              .find(g => g.pattern === expandedPattern)
              ?.issues.slice(0, 20)
              .map((issue, idx) => (
                <div key={idx} className="p-3 text-sm hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{issue.title?.replace("Handle Mismatch: ", "")}</div>
                      <div className="text-muted-foreground text-xs mt-1">
                        <span className="font-mono">{issue.metadata?.actualHandle as string}</span>
                        <span className="mx-2">→</span>
                        <span className="font-mono">{issue.metadata?.expectedHandle as string}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {issue.metadata?.productCount || 0} products
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Other patterns expandable */}
      {patternGroups.find(g => g.pattern === "other") && (
        <div className="text-sm">
          <button
            className="text-blue-600 hover:underline flex items-center gap-1"
            onClick={() => setExpandedPattern(expandedPattern === "other" ? null : "other")}
          >
            {expandedPattern === "other" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Show all {patternGroups.find(g => g.pattern === "other")?.count || 0} "Other" pattern mismatches (may need review)
          </button>
        </div>
      )}
    </div>
  );
}

// Nav Conflicts Tab Content
function NavConflictsTab({ conflicts }: { conflicts: NavigationConflictDisplay[] }) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  // Count by conflict type
  const switchRequired = conflicts.filter(c => c.conflictType === 'switch_required');
  const removeLink = conflicts.filter(c => c.conflictType === 'remove_link');
  const orphanLink = conflicts.filter(c => c.conflictType === 'orphan_link');
  const blockDelete = conflicts.filter(c => c.conflictType === 'block_delete' || !c.conflictType);

  if (conflicts.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h4 className="text-lg font-semibold text-gray-800">No navigation conflicts</h4>
        <p className="text-muted-foreground">All collection links in navigation are healthy.</p>
      </div>
    );
  }

  const conflictTypes = [
    {
      key: 'switch_required',
      label: 'Switch Required',
      items: switchRequired,
      color: 'orange',
      description: 'Navigation pointing to wrong duplicate - needs to be updated'
    },
    {
      key: 'remove_link',
      label: 'Remove Link',
      items: removeLink,
      color: 'red',
      description: 'Both duplicates have 0 products - remove from navigation'
    },
    {
      key: 'orphan_link',
      label: 'Orphan Link',
      items: orphanLink,
      color: 'purple',
      description: 'Navigation links to deleted/missing collection'
    },
    {
      key: 'block_delete',
      label: 'Blocking Delete',
      items: blockDelete,
      color: 'red',
      description: 'Collection in navigation - remove link before deleting'
    },
  ].filter(t => t.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {conflictTypes.map(type => (
          <Card
            key={type.key}
            className={`cursor-pointer transition-all ${
              expandedType === type.key
                ? `ring-2 ring-${type.color}-500`
                : `hover:shadow-md border-${type.color}-200 bg-${type.color}-50/50`
            }`}
            onClick={() => setExpandedType(expandedType === type.key ? null : type.key)}
          >
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold text-${type.color}-600`}>{type.items.length}</div>
              <div className="text-sm font-medium">{type.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{type.description}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-blue-800">What are navigation conflicts?</div>
            <p className="text-sm text-blue-700 mt-1">
              Navigation conflicts occur when your store's navigation menus link to collections that are duplicates,
              deleted, or pointing to the wrong version. These need to be fixed in Shopify Admin → Online Store → Navigation.
            </p>
          </div>
        </div>
      </div>

      {/* Expanded Conflict Type Details */}
      {expandedType && (
        <div className="border rounded-lg">
          <div className="p-4 bg-gray-50 border-b">
            <h4 className="font-semibold">
              {conflictTypes.find(t => t.key === expandedType)?.label} Details
            </h4>
            <p className="text-sm text-muted-foreground">
              {conflictTypes.find(t => t.key === expandedType)?.items.length} conflicts to resolve
            </p>
          </div>
          <div className="divide-y">
            {conflictTypes
              .find(t => t.key === expandedType)
              ?.items.map((conflict, idx) => (
                <div key={idx} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{conflict.collectionName}</div>
                      <div className="text-sm text-gray-500 font-mono">/{conflict.collectionHandle}</div>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                        <Menu className="h-4 w-4" />
                        <span>In menu: <strong>{conflict.menuTitle}</strong></span>
                      </div>

                      {/* Switch recommendation */}
                      {conflict.conflictType === 'switch_required' && conflict.currentInNav && conflict.switchTo && (
                        <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-orange-800">
                              Change from <span className="font-mono">/{conflict.currentInNav.handle}</span>
                              {' → '}
                              <span className="font-mono text-green-700">/{conflict.switchTo.handle}</span>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Action text */}
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Action:</strong> {conflict.action}
                      </div>
                    </div>

                    {conflict.shopifyCollectionId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const shopifyId = conflict.shopifyCollectionId?.replace("gid://shopify/Collection/", "");
                          window.open(`https://admin.shopify.com/store/nexus-clothes/collections/${shopifyId}`, "_blank");
                        }}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Shopify
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Show all if none expanded */}
      {!expandedType && (
        <div className="border rounded-lg">
          <div className="p-4 bg-gray-50 border-b">
            <h4 className="font-semibold flex items-center gap-2">
              <Navigation className="h-5 w-5 text-orange-500" />
              All Navigation Conflicts ({conflicts.length})
            </h4>
            <p className="text-sm text-muted-foreground">Click a summary card above to filter by type</p>
          </div>
          <div className="divide-y max-h-[500px] overflow-auto">
            {conflicts.map((conflict, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{conflict.collectionName}</span>
                      <Badge
                        className={
                          conflict.conflictType === 'switch_required' ? 'bg-orange-500' :
                          conflict.conflictType === 'orphan_link' ? 'bg-purple-500' :
                          'bg-red-500'
                        }
                      >
                        {conflict.conflictType === 'switch_required' ? 'Switch' :
                         conflict.conflictType === 'remove_link' ? 'Remove' :
                         conflict.conflictType === 'orphan_link' ? 'Orphan' : 'Blocking'}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 font-mono">/{conflict.collectionHandle}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      <Menu className="h-3 w-3 inline mr-1" />
                      {conflict.menuTitle}
                    </div>
                  </div>

                  {conflict.shopifyCollectionId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        const shopifyId = conflict.shopifyCollectionId?.replace("gid://shopify/Collection/", "");
                        window.open(`https://admin.shopify.com/store/nexus-clothes/collections/${shopifyId}`, "_blank");
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How to resolve */}
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-green-800">How to resolve these conflicts</div>
            <ol className="text-sm text-green-700 mt-2 list-decimal list-inside space-y-1">
              <li>Go to Shopify Admin → Online Store → Navigation</li>
              <li>Find the menu(s) listed in each conflict</li>
              <li>Update or remove the collection links as recommended</li>
              <li>Save the menu and return here to verify</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState({ lastChecked }: { lastChecked?: string }) {
  return (
    <div className="p-12 text-center bg-white rounded-lg border">
      <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
      <h4 className="text-xl font-bold text-gray-800 mb-2">All collections are healthy!</h4>
      <p className="text-gray-500">No duplicates or navigation conflicts detected.</p>
      {lastChecked && (
        <p className="text-sm text-gray-400 mt-4 flex items-center justify-center gap-1">
          <Clock className="h-4 w-4" />
          Last checked: {new Date(lastChecked).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// Main Component
export default function CollectionHealthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("action");

  // State for delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    collectionId: string;
    collectionName: string;
  }>({ open: false, collectionId: "", collectionName: "" });

  // State for print report dialog
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  // Fetch health issues
  const { data: issues = [], isLoading, error, refetch } = useHealthIssues();

  // Run health check mutation
  const runHealthCheck = useRunHealthCheck();

  // Navigation hooks
  const { data: collectionsInNav = [] } = useCollectionsInNavigation();
  const syncNavigation = useSyncNavigation();
  const deleteCollection = useDeleteCollection();

  // Fetch total collection count
  const { data: collectionsData } = useQuery({
    queryKey: ["/api/collections", "count-only"],
    queryFn: async () => {
      const response = await fetch("/api/collections?limit=1", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch collections");
      return response.json();
    },
  });

  const totalCollections = collectionsData?.total || 0;

  // Fetch tenant info for print report (multi-tenant)
  const { data: tenantInfo } = useQuery<{
    id: string;
    companyName: string;
    subdomain: string;
    shopifyStoreUrl: string | null;
    planTier: string;
  }>({
    queryKey: ["/api/tenant/info"],
    queryFn: async () => {
      const response = await fetch("/api/tenant/info", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tenant info");
      return response.json();
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch ALL collections for name matching
  const { data: collectionsDetails } = useQuery({
    queryKey: ["/api/collections/all-for-health"],
    queryFn: async () => {
      const response = await fetch(`/api/collections?limit=3000`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch collections");
      const data = await response.json();
      return data.collections || [];
    },
    enabled: issues.length > 0,
    staleTime: 60000,
  });

  // Convert collections to CollectionInfo array
  const allCollections: CollectionInfo[] = (collectionsDetails || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    shopifyHandle: c.shopifyHandle,
    shopifyCollectionId: c.shopifyCollectionId,
    productCount: c.productCount || 0,
    image: c.image,
    createdAt: c.createdAt,
    shopifyCreatedAt: c.shopifyCreatedAt, // Actual Shopify creation date
    createdByType: c.createdByType,
    createdByName: c.createdByName,
  }));

  // Group duplicates
  const duplicateGroups = groupIssuesByDuplicateGroup(issues, allCollections);

  // Extract navigation conflicts
  const navigationConflicts: NavigationConflictDisplay[] = issues
    .filter(issue => issue.issueType === "nav_conflict" && issue.status === "open")
    .map(issue => {
      const collection = allCollections.find(c => c.id === issue.collectionId);
      const metadata = issue.metadata as Record<string, unknown> | undefined;
      return {
        collectionId: issue.collectionId || "",
        collectionName: collection?.name || (metadata?.collectionName as string) || "Unknown",
        collectionHandle: collection?.slug || collection?.shopifyHandle || "unknown",
        shopifyCollectionId: collection?.shopifyCollectionId || null,
        menuTitle: (metadata?.menuTitle as string) || "Navigation Menu",
        itemTitle: (metadata?.itemTitle as string) || "",
        severity: issue.severity,
        message: issue.description,
        action: issue.recommendation || "Update navigation before deleting",
        conflictType: (metadata?.conflictType as 'switch_required' | 'remove_link' | 'block_delete' | 'orphan_link') || undefined,
        currentInNav: metadata?.currentInNav as NavigationConflictDisplay['currentInNav'],
        switchTo: metadata?.switchTo as NavigationConflictDisplay['switchTo'],
      };
    });

  // Calculate counts for tabs
  const openIssues = issues.filter(i => i.status === "open");
  const tabCounts = {
    action: duplicateGroups.filter(g => g.severity === "critical" || g.severity === "high").length,
    duplicates: duplicateGroups.length,
    navigation: openIssues.filter(i => i.issueType === "nav_conflict").length,
    handles: openIssues.filter(i => i.issueType === "handle_mismatch").length,
  };

  // Calculate handle patterns for print report
  const handlePatterns = groupHandleMismatchByPattern(issues);

  // Handle run health check
  const handleRunHealthCheck = async () => {
    try {
      await runHealthCheck.mutateAsync();
      toast({
        title: "Health Check Complete",
        description: "Collection health check has been completed.",
      });
    } catch (error) {
      toast({
        title: "Health Check Failed",
        description: error instanceof Error ? error.message : "Failed to run health check",
        variant: "destructive",
      });
    }
  };

  // Handle sync navigation
  const handleSyncNavigation = async () => {
    try {
      const result = await syncNavigation.mutateAsync();
      toast({
        title: "Navigation Sync Complete",
        description: `Synced ${result.menusCount} menus, ${result.itemsCount} items (${result.collectionItemsCount} collection links)`,
      });
    } catch (error) {
      toast({
        title: "Navigation Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync navigation",
        variant: "destructive",
      });
    }
  };

  // Handle delete confirmation
  const handleDeleteClick = (collectionId: string, collectionName: string) => {
    setDeleteDialog({ open: true, collectionId, collectionName });
  };

  // Handle confirmed delete
  const handleConfirmDelete = async () => {
    try {
      await deleteCollection.mutateAsync(deleteDialog.collectionId);
      toast({
        title: "Collection Deleted",
        description: `"${deleteDialog.collectionName}" has been deleted from Shopify and marked as inactive locally.`,
      });
      setDeleteDialog({ open: false, collectionId: "", collectionName: "" });
      refetch();
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete collection",
        variant: "destructive",
      });
    }
  };

  if (error) {
    return (
      <MainLayout
        title="Collection Health"
        subtitle="Monitor and fix collection issues"
      >
        <div className="p-8">
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Error Loading Health Data
              </CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load health data"}
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
      title="Collection Health Dashboard"
      subtitle="Monitor and fix duplicate collections and navigation conflicts"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setPrintDialogOpen(true)}
            disabled={isLoading}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Report
          </Button>
          <Button
            variant="outline"
            onClick={handleSyncNavigation}
            disabled={syncNavigation.isPending}
          >
            {syncNavigation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Menu className="mr-2 h-4 w-4" />
                Sync Navigation
              </>
            )}
          </Button>
          <Button
            onClick={handleRunHealthCheck}
            disabled={runHealthCheck.isPending}
          >
            {runHealthCheck.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run Health Check
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="p-8 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading health data...</span>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <StatsCards
              issues={issues}
              totalCollections={totalCollections}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* Tab Navigation */}
            <TabNavigation
              activeTab={activeTab}
              onTabChange={setActiveTab}
              counts={tabCounts}
            />

            {/* Tab Content */}
            <div className="bg-white rounded-b-lg border border-t-0 border-gray-200 p-6">
              {activeTab === "action" && (
                <div className="space-y-6">
                  {/* Duplicates needing attention (critical/high only) */}
                  {duplicateGroups.filter(g => g.severity === "critical" || g.severity === "high").length > 0 ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Package className="h-5 w-5 text-orange-500" />
                        Duplicates Needing Attention ({duplicateGroups.filter(g => g.severity === "critical" || g.severity === "high").length})
                      </h3>
                      {duplicateGroups
                        .filter(g => g.severity === "critical" || g.severity === "high")
                        .map(group => (
                          <DuplicateGroupCard
                            key={group.groupId}
                            group={group}
                            collectionsInNav={collectionsInNav}
                            onDelete={handleDeleteClick}
                            isDeleting={deleteCollection.isPending}
                          />
                        ))}
                    </div>
                  ) : (
                    <EmptyState lastChecked={issues[0]?.detectedAt} />
                  )}
                </div>
              )}

              {activeTab === "duplicates" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Package className="h-5 w-5 text-yellow-500" />
                    All Duplicate Collections ({duplicateGroups.length} groups)
                  </h3>
                  {duplicateGroups.length > 0 ? (
                    duplicateGroups.map(group => (
                      <DuplicateGroupCard
                        key={group.groupId}
                        group={group}
                        collectionsInNav={collectionsInNav}
                        onDelete={handleDeleteClick}
                        isDeleting={deleteCollection.isPending}
                      />
                    ))
                  ) : (
                    <EmptyState lastChecked={issues[0]?.detectedAt} />
                  )}
                </div>
              )}

              {activeTab === "navigation" && (
                <NavConflictsTab conflicts={navigationConflicts} />
              )}

              {activeTab === "handles" && (
                <HandleAnalysisTab issues={issues} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, collectionId: "", collectionName: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteDialog.collectionName}" from Shopify and mark it as inactive in the local database.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteCollection.isPending}
            >
              {deleteCollection.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Collection"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print Report Dialog */}
      <PrintReport
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        stats={{
          total: totalCollections,
          actionRequired: tabCounts.action,
          duplicates: tabCounts.duplicates,
          navConflicts: tabCounts.navigation,
          handleMismatches: tabCounts.handles,
        }}
        duplicateGroups={duplicateGroups}
        navigationConflicts={navigationConflicts}
        handlePatterns={handlePatterns}
        collectionsInNav={collectionsInNav}
        allCollections={allCollections}
        storeInfo={tenantInfo ? {
          companyName: tenantInfo.companyName,
          shopifyStoreUrl: tenantInfo.shopifyStoreUrl || tenantInfo.subdomain + ".myshopify.com",
        } : undefined}
      />
    </MainLayout>
  );
}
