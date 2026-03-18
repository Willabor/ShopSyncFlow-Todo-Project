import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useSyncContext } from "@/contexts/SyncContext";
import { SyncProgressDisplay } from "@/components/SyncProgressDisplay";
import { MainLayout } from "@/components/layouts";
import { GoogleAdsIntegration } from "@/components/GoogleAdsIntegration";
import { ClaudeIntegration } from "@/components/ClaudeIntegration";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Switch } from "@/components/ui/switch";
import {
  Settings as SettingsIcon,
  Store,
  Plus,
  Edit,
  Trash2,
  Loader2,
  ShieldAlert,
  ExternalLink,
  CheckCircle,
  RefreshCw,
  Folder,
  AlertCircle,
  Plug,
  History,
  Users,
  BarChart3,
  Shield,
} from "lucide-react";
import { SyncHistoryTab } from "@/components/sync-history/SyncHistoryTab";
import { TeamTabContent } from "@/components/settings/TeamTabContent";
import { AnalyticsTabContent } from "@/components/settings/AnalyticsTabContent";
import { AuditLogTabContent } from "@/components/settings/AuditLogTabContent";

interface ShopifyStore {
  id: string;
  name: string;
  shopDomain: string;
  isActive: boolean;
  webhookSecret?: string;
  createdAt: string;
  updatedAt: string;
}

// Tab visibility rules based on user role
const TAB_VISIBILITY: Record<string, string[]> = {
  'shopify': ['SuperAdmin'],
  'integrations': ['SuperAdmin'],
  'sync-history': ['SuperAdmin'],
  'team': ['SuperAdmin'],
  'analytics': ['SuperAdmin'],
  'audit': ['SuperAdmin', 'Auditor'],
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get default tab based on role
  const getDefaultTab = () => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');

    // If user is Auditor, they can only see the audit tab
    if (user?.role === 'Auditor') {
      return 'audit';
    }

    // For SuperAdmin, use URL param or default to shopify
    return tabParam || 'shopify';
  };

  // Get active tab from URL params with role-based default
  const [activeTab, setActiveTab] = useState(getDefaultTab);

  // Global sync context (replaces local sync state)
  const { syncProgress, startSync, isSyncing, isConnected } = useSyncContext();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<ShopifyStore | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    shopDomain: "",
    accessToken: "",
    webhookSecret: "",
    isActive: false,
  });

  // Comprehensive sync state
  const [lastSyncResult, setLastSyncResult] = useState<{
    timestamp: Date;
    products?: {
      imported: number;
      updated: number;
      skipped: number;
      failed: number;
    };
    vendors?: {
      created: number;
    };
    collections?: {
      synced: number;
      created: number;
      updated: number;
    };
    fileSizes?: {
      updated: number;
      skipped: number;
      failed: number;
    };
    // Legacy fields for backwards compatibility
    synced: number;
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);

  // Handle sync completion
  useEffect(() => {
    if (syncProgress && (syncProgress.status === 'completed' || syncProgress.status === 'failed')) {
      // Update lastSyncResult with final results
      setLastSyncResult({
        timestamp: new Date(syncProgress.completedAt || new Date()),
        products: {
          imported: syncProgress.steps.products.imported,
          updated: syncProgress.steps.products.updated,
          skipped: syncProgress.steps.products.skipped,
          failed: syncProgress.steps.products.failed,
        },
        vendors: {
          created: syncProgress.steps.vendors.created,
        },
        collections: {
          synced: syncProgress.steps.collections.synced,
          created: syncProgress.steps.collections.created,
          updated: syncProgress.steps.collections.updated,
        },
        fileSizes: {
          updated: syncProgress.steps.fileSizes.updated,
          skipped: syncProgress.steps.fileSizes.skipped,
          failed: syncProgress.steps.fileSizes.failed,
        },
        // Legacy fields
        synced: syncProgress.steps.collections.synced,
        created: syncProgress.steps.collections.created,
        updated: syncProgress.steps.collections.updated,
        errors: syncProgress.errors,
      });

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections/duplicates"] });

      // Show completion toast
      if (syncProgress.status === 'completed') {
        toast({
          title: "✅ Sync Complete",
          description: `Synced ${syncProgress.steps.products.imported} products, ${syncProgress.steps.vendors.created} vendors, ${syncProgress.steps.collections.synced} collections, and ${syncProgress.steps.fileSizes.updated} media file sizes from Shopify`,
        });
      } else {
        toast({
          title: "⚠️ Sync Completed with Errors",
          description: `Sync encountered ${syncProgress.errors.length} errors. Check the sync report for details.`,
          variant: "destructive",
        });
      }

      // Note: No need to clear session - SyncContext handles cleanup automatically
    }
  }, [syncProgress, queryClient, toast]);

  // Fetch Shopify stores
  const { data: stores = [], isLoading: storesLoading } = useQuery<ShopifyStore[]>({
    queryKey: ["/api/shopify/stores"],
    enabled: !!user && user.role === "SuperAdmin",
    queryFn: async () => {
      const response = await fetch("/api/shopify/stores", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch Shopify stores");
      }

      return response.json();
    },
  });

  // Create store mutation
  const createStoreMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/shopify/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create Shopify store");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/stores"] });
      setAddDialogOpen(false);
      resetForm();
      toast({
        title: "✅ Shopify Store Connected",
        description: "Your Shopify store has been successfully connected.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update store mutation
  const updateStoreMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ShopifyStore> }) => {
      const response = await fetch(`/api/shopify/stores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update Shopify store");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/stores"] });
      setEditDialogOpen(false);
      setSelectedStore(null);
      toast({
        title: "✅ Store Updated",
        description: "Shopify store settings have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Unified sync mutation - syncs Products, Vendors, Collections
  const syncCollectionsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sync-all-from-shopify", {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      // 409 = sync already in progress (started by another user)
      if (response.status === 409 && data.sessionId) {
        return { ...data, alreadyRunning: true };
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to sync from Shopify");
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.alreadyRunning && data.sessionId) {
        // Another user already started a sync - connect to it
        startSync(data.sessionId);
        toast({
          title: "Sync Already Running",
          description: "Another team member started a sync. Connecting to progress...",
        });
      } else if (data.sessionId) {
        startSync(data.sessionId);
        toast({
          title: "Sync Started",
          description: "Syncing products, vendors, and collections from Shopify...",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      shopDomain: "",
      accessToken: "",
      webhookSecret: "",
      isActive: false,
    });
  };

  const handleAddStore = () => {
    if (!formData.name || !formData.shopDomain || !formData.accessToken) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Validate shop domain format
    if (!formData.shopDomain.includes(".myshopify.com")) {
      toast({
        title: "⚠️ Invalid Domain",
        description: "Shop domain must be in format: your-store.myshopify.com",
        variant: "destructive",
      });
      return;
    }

    createStoreMutation.mutate(formData);
  };

  const handleEditStore = () => {
    if (!selectedStore) return;

    const updates: Partial<ShopifyStore> = {
      name: formData.name,
      webhookSecret: formData.webhookSecret,
      isActive: formData.isActive,
    };

    updateStoreMutation.mutate({ id: selectedStore.id, updates });
  };

  const handleToggleActive = (store: ShopifyStore) => {
    updateStoreMutation.mutate({
      id: store.id,
      updates: { isActive: !store.isActive },
    });
  };

  const openEditDialog = (store: ShopifyStore) => {
    setSelectedStore(store);
    setFormData({
      name: store.name,
      shopDomain: store.shopDomain,
      accessToken: "", // Never populate access token
      webhookSecret: store.webhookSecret || "",
      isActive: store.isActive,
    });
    setEditDialogOpen(true);
  };

  const activeStore = stores.find(s => s.isActive);

  // Check if user has access to Settings page (SuperAdmin or Auditor)
  const allowedRoles = ["SuperAdmin", "Auditor"];
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <MainLayout title="Settings" subtitle="Configure application settings">
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-96">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                Access Denied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                You don't have permission to access system settings.
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  // Helper function to check if a tab is visible for the current user
  const isTabVisible = (tabId: string) => {
    return TAB_VISIBILITY[tabId]?.includes(user.role) ?? false;
  };

  return (
    <MainLayout
      title="Settings"
      subtitle="Manage system configuration and integrations"
    >
      <div className="p-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList>
              {isTabVisible('shopify') && (
                <TabsTrigger value="shopify" className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Shopify Integration
                </TabsTrigger>
              )}
              {isTabVisible('integrations') && (
                <TabsTrigger value="integrations" className="flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  Integrations
                </TabsTrigger>
              )}
              {isTabVisible('sync-history') && (
                <TabsTrigger value="sync-history" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Sync History
                </TabsTrigger>
              )}
              {isTabVisible('team') && (
                <TabsTrigger value="team" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Team
                </TabsTrigger>
              )}
              {isTabVisible('analytics') && (
                <TabsTrigger value="analytics" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
              )}
              {isTabVisible('audit') && (
                <TabsTrigger value="audit" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Audit Log
                </TabsTrigger>
              )}
            </TabsList>

            {/* Shopify Integration Tab */}
            <TabsContent value="shopify" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Shopify Stores</CardTitle>
                      <CardDescription className="mt-2">
                        Connect your Shopify store to enable product and collection sync
                      </CardDescription>
                    </div>
                    <Button onClick={() => setAddDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Store
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Active Store Indicator */}
                  {activeStore && (
                    <div className="mb-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="font-medium text-green-900 dark:text-green-100">
                            Active Store: {activeStore.name}
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            {activeStore.shopDomain}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stores Table */}
                  {storesLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : stores.length === 0 ? (
                    <div className="text-center py-12">
                      <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Shopify Stores Connected</h3>
                      <p className="text-muted-foreground mb-4">
                        Connect your first Shopify store to start syncing products and collections
                      </p>
                      <Button onClick={() => setAddDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Your First Store
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Store Name</TableHead>
                          <TableHead>Shop Domain</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Webhook Secret</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stores.map((store) => (
                          <TableRow key={store.id}>
                            <TableCell className="font-medium">{store.name}</TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {store.shopDomain}
                              </code>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={store.isActive}
                                  onCheckedChange={() => handleToggleActive(store)}
                                  disabled={updateStoreMutation.isPending}
                                />
                                <Badge variant={store.isActive ? "default" : "secondary"}>
                                  {store.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              {store.webhookSecret ? (
                                <Badge variant="outline">Configured</Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(store)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {/* Help Section */}
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Getting Your Shopify Credentials
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Access token requires read permissions for: products, collections</li>
                      <li>Admin API access tokens start with <code className="text-xs">shpat_</code> or <code className="text-xs">shpca_</code></li>
                      <li>Shop domain format: <code className="text-xs">your-store.myshopify.com</code></li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Sync Data Section */}
              {activeStore && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5" />
                      Sync All Data from Shopify
                    </CardTitle>
                    <CardDescription>
                      Pull products, vendors, categories, collections, and insights from your Shopify store
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Unified Sync */}
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-primary/5">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-5 w-5 text-primary" />
                          <h4 className="font-medium">Sync Everything</h4>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Synchronize products, vendors, categories, collections, and insights from {activeStore.name}
                        </p>
                      </div>
                      <Button
                        onClick={() => syncCollectionsMutation.mutate()}
                        disabled={syncCollectionsMutation.isPending || isSyncing}
                      >
                        {syncCollectionsMutation.isPending || isSyncing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Sync Now
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Real-time Sync Progress */}
                    {syncProgress && (
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <SyncProgressDisplay progress={syncProgress} />
                      </div>
                    )}

                    {/* Last Sync Result */}
                    {lastSyncResult && !syncProgress && (
                      <div className={`p-4 rounded-lg border ${
                        lastSyncResult.errors.length > 0
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                          : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                      }`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {lastSyncResult.errors.length > 0 ? (
                              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className={`font-medium ${
                              lastSyncResult.errors.length > 0
                                ? 'text-amber-900 dark:text-amber-100'
                                : 'text-green-900 dark:text-green-100'
                            }`}>
                              Last Sync: {lastSyncResult.timestamp.toLocaleString()}
                            </h5>

                            {/* Comprehensive Sync Results */}
                            <div className="mt-3 space-y-3">
                              {/* Products */}
                              {lastSyncResult.products && (
                                <div className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                  <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Products</p>
                                  <div className="grid grid-cols-4 gap-3 text-sm">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Imported</p>
                                      <p className="font-semibold text-green-600 dark:text-green-400">{lastSyncResult.products.imported}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Updated</p>
                                      <p className="font-semibold text-orange-600 dark:text-orange-400">{lastSyncResult.products.updated || 0}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Skipped</p>
                                      <p className="font-semibold text-gray-600 dark:text-gray-400">{lastSyncResult.products.skipped}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Failed</p>
                                      <p className="font-semibold text-red-600 dark:text-red-400">{lastSyncResult.products.failed}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Vendors */}
                              {lastSyncResult.vendors && (
                                <div className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                  <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Vendors</p>
                                  <div className="text-sm">
                                    <p className="text-xs text-muted-foreground">Created</p>
                                    <p className="font-semibold text-blue-600 dark:text-blue-400">{lastSyncResult.vendors.created}</p>
                                  </div>
                                </div>
                              )}

                              {/* Collections */}
                              {lastSyncResult.collections && (
                                <div className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                  <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Collections</p>
                                  <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Synced</p>
                                      <p className="font-semibold text-purple-600 dark:text-purple-400">{lastSyncResult.collections.synced}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Created</p>
                                      <p className="font-semibold text-green-600 dark:text-green-400">{lastSyncResult.collections.created}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Updated</p>
                                      <p className="font-semibold text-orange-600 dark:text-orange-400">{lastSyncResult.collections.updated}</p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Media File Sizes */}
                              {lastSyncResult.fileSizes && (
                                <div className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                  <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Media File Sizes</p>
                                  <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Updated</p>
                                      <p className="font-semibold text-green-600 dark:text-green-400">{lastSyncResult.fileSizes.updated}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Skipped</p>
                                      <p className="font-semibold text-gray-600 dark:text-gray-400">{lastSyncResult.fileSizes.skipped}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Failed</p>
                                      <p className="font-semibold text-red-600 dark:text-red-400">{lastSyncResult.fileSizes.failed}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            {lastSyncResult.errors.length > 0 && (
                              <div className="mt-3">
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                  {lastSyncResult.errors.length} {lastSyncResult.errors.length === 1 ? 'Error' : 'Errors'}:
                                </p>
                                <ul className="mt-1 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                                  {lastSyncResult.errors.slice(0, 3).map((err, idx) => (
                                    <li key={idx}>{err}</li>
                                  ))}
                                  {lastSyncResult.errors.length > 3 && (
                                    <li className="italic">...and {lastSyncResult.errors.length - 3} more</li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Help Text */}
                    <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                      <p className="font-medium mb-1">What happens during sync?</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li><strong>Products:</strong> Product data, media (images & videos), variants, and metadata are updated</li>
                        <li><strong>Vendors:</strong> Product vendors/brands are synced</li>
                        <li><strong>Categories:</strong> Product categorization is refreshed</li>
                        <li><strong>Collections:</strong> All collections are synced (duplicates tracked separately)</li>
                        <li><strong>Media File Sizes:</strong> File sizes are fetched for all product media (images, videos, etc.)</li>
                        <li><strong>Relationships:</strong> Product-collection associations are updated</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Integrations Tab */}
            <TabsContent value="integrations" className="space-y-6">
              {/* AI Providers */}
              <ClaudeIntegration />

              {/* Advertising Platforms */}
              <GoogleAdsIntegration />

              {/* Future integrations can be added here */}
              {/* <FacebookAdsIntegration /> */}
              {/* <TikTokAdsIntegration /> */}
            </TabsContent>

            {/* Sync History Tab */}
            <TabsContent value="sync-history" className="space-y-6">
              <SyncHistoryTab />
            </TabsContent>

            {/* Team Tab */}
            <TabsContent value="team" className="space-y-6">
              <TeamTabContent />
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-6">
              <AnalyticsTabContent />
            </TabsContent>

            {/* Audit Log Tab */}
            <TabsContent value="audit" className="space-y-6">
              <AuditLogTabContent />
            </TabsContent>
          </Tabs>

          {/* Add Store Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Shopify Store</DialogTitle>
            <DialogDescription>
              Connect your Shopify store with API credentials. Access token requires read permissions for products and collections.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Store Name *</Label>
              <Input
                id="name"
                placeholder="My Shopify Store"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="shopDomain">Shop Domain *</Label>
              <Input
                id="shopDomain"
                placeholder="your-store.myshopify.com"
                value={formData.shopDomain}
                onChange={(e) => setFormData({ ...formData, shopDomain: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: your-store.myshopify.com
              </p>
            </div>

            <div>
              <Label htmlFor="accessToken">Access Token *</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="shpat_..."
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Admin API access token (starts with shpat_ or shpca_)
              </p>
            </div>

            <div>
              <Label htmlFor="webhookSecret">Webhook Secret (Optional)</Label>
              <Input
                id="webhookSecret"
                type="password"
                placeholder="Optional"
                value={formData.webhookSecret}
                onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive">Set as active store</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddStore}
              disabled={createStoreMutation.isPending}
            >
              {createStoreMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Store
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Store Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shopify Store</DialogTitle>
            <DialogDescription>
              Update store settings. Access token cannot be changed for security.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Store Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="edit-shopDomain">Shop Domain</Label>
              <Input
                id="edit-shopDomain"
                value={formData.shopDomain}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Domain cannot be changed
              </p>
            </div>

            <div>
              <Label htmlFor="edit-webhookSecret">Webhook Secret</Label>
              <Input
                id="edit-webhookSecret"
                type="password"
                placeholder="Optional"
                value={formData.webhookSecret}
                onChange={(e) => setFormData({ ...formData, webhookSecret: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="edit-isActive">Active store</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setSelectedStore(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditStore}
              disabled={updateStoreMutation.isPending}
            >
              {updateStoreMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Store"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </MainLayout>
  );
}
