import { useState } from "react";
import { MainLayout } from "@/components/layouts";
import {
  useNavigationMenus,
  useSyncNavigationMenus,
  useBrokenNavigationLinks,
  countCollectionLinks,
  countTotalItems,
  type NavigationItem,
  type NavigationMenu,
  type BrokenLink,
} from "@/hooks/use-navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Menu,
  ExternalLink,
  Folder,
  Link as LinkIcon,
  FileText,
  Globe,
  Clock,
  AlertTriangle,
  Unlink,
  CheckCircle,
} from "lucide-react";

// MenuItem Component - renders a single menu item with its children
function MenuItemComponent({
  item,
  depth = 0,
}: {
  item: NavigationItem;
  depth?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = item.children && item.children.length > 0;

  // Get icon based on item type
  const getTypeIcon = () => {
    switch (item.type) {
      case "COLLECTION":
        return <Folder className="h-4 w-4 text-blue-500" />;
      case "PAGE":
        return <FileText className="h-4 w-4 text-green-500" />;
      case "BLOG":
        return <Globe className="h-4 w-4 text-purple-500" />;
      default:
        return <LinkIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  // Get badge color based on type
  const getTypeBadge = () => {
    switch (item.type) {
      case "COLLECTION":
        return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Collection</Badge>;
      case "PAGE":
        return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Page</Badge>;
      case "BLOG":
        return <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">Blog</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Link</Badge>;
    }
  };

  return (
    <div className="border-l border-gray-200 ml-2">
      <div
        className={`flex items-center gap-2 py-2 px-3 hover:bg-gray-50 cursor-pointer ${
          depth === 0 ? "font-medium" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}
        {getTypeIcon()}
        <span className="flex-1 truncate">{item.title}</span>
        {getTypeBadge()}
        {item.targetUrl && (
          <a
            href={item.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-gray-600"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {item.children.map((child) => (
            <MenuItemComponent key={child.id} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// MenuTree Component - renders a complete menu with all its items
function MenuTree({ menu }: { menu: NavigationMenu }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const collectionCount = countCollectionLinks(menu.items);
  const totalItems = countTotalItems(menu.items);

  return (
    <Card className="mb-4">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronRight className="h-5 w-5 text-gray-400" />
            )}
            <Menu className="h-5 w-5 text-gray-600" />
            <div>
              <CardTitle className="text-base">{menu.title}</CardTitle>
              <CardDescription className="text-xs">
                {menu.handle} • {totalItems} items
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {collectionCount > 0 && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                {collectionCount} collections
              </Badge>
            )}
            <Badge variant="outline">{menu.items.length} top-level</Badge>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          {menu.items.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              {menu.items.map((item) => (
                <MenuItemComponent key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No items in this menu
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Stats Cards
function StatsCards({
  menus,
  brokenLinksCount,
  isLoadingBrokenLinks
}: {
  menus: NavigationMenu[];
  brokenLinksCount: number;
  isLoadingBrokenLinks: boolean;
}) {
  const totalMenus = menus.length;
  const totalItems = menus.reduce((sum, menu) => sum + countTotalItems(menu.items), 0);
  const totalCollections = menus.reduce((sum, menu) => sum + countCollectionLinks(menu.items), 0);

  return (
    <div className="grid gap-4 md:grid-cols-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Menus</CardTitle>
          <Menu className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalMenus}</div>
          <p className="text-xs text-muted-foreground">navigation menus</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Items</CardTitle>
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalItems}</div>
          <p className="text-xs text-muted-foreground">menu items</p>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Collection Links</CardTitle>
          <Folder className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">{totalCollections}</div>
          <p className="text-xs text-muted-foreground">links to collections</p>
        </CardContent>
      </Card>

      <Card className={brokenLinksCount > 0 ? "border-red-200 bg-red-50/50" : "border-green-200 bg-green-50/50"}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Broken Links</CardTitle>
          {brokenLinksCount > 0 ? (
            <Unlink className="h-4 w-4 text-red-600" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-600" />
          )}
        </CardHeader>
        <CardContent>
          {isLoadingBrokenLinks ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Checking...</span>
            </div>
          ) : (
            <>
              <div className={`text-2xl font-bold ${brokenLinksCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {brokenLinksCount}
              </div>
              <p className="text-xs text-muted-foreground">
                {brokenLinksCount > 0 ? 'links to deleted collections' : 'all links valid'}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Broken Links Alert Component
function BrokenLinksAlert({ brokenLinks }: { brokenLinks: BrokenLink[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (brokenLinks.length === 0) return null;

  return (
    <Card className="border-red-300 bg-red-50 mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <CardTitle className="text-red-700">
              {brokenLinks.length} Broken Navigation Link{brokenLinks.length > 1 ? 's' : ''} Detected
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {isExpanded ? 'Hide' : 'Show'} Details
          </Button>
        </div>
        <CardDescription className="text-red-600">
          These menu items link to collections that no longer exist. They will show broken pages to customers.
        </CardDescription>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <div className="space-y-2">
            {brokenLinks.map((link) => (
              <div
                key={link.itemId}
                className="flex items-center justify-between p-3 bg-white rounded border border-red-200"
              >
                <div className="flex items-center gap-3">
                  <Unlink className="h-4 w-4 text-red-500" />
                  <div>
                    <div className="font-medium text-gray-900">{link.itemTitle}</div>
                    <div className="text-sm text-gray-500">
                      In menu: <span className="font-medium">{link.menuTitle}</span> ({link.menuHandle})
                    </div>
                  </div>
                </div>
                {link.targetUrl && (
                  <Badge variant="outline" className="text-red-600 border-red-300">
                    {link.targetUrl.split('/').pop()}
                  </Badge>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded">
            <p className="text-sm text-amber-800">
              <strong>To fix:</strong> Go to Shopify Admin → Online Store → Navigation,
              and either remove these links or point them to valid collections.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Main Navigation Page Component
export default function NavigationPage() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useNavigationMenus();
  const { data: brokenLinksData, isLoading: isLoadingBrokenLinks, refetch: refetchBrokenLinks } = useBrokenNavigationLinks();
  const syncNavigation = useSyncNavigationMenus();

  const menus = data?.menus || [];
  const brokenLinks = brokenLinksData?.brokenLinks || [];
  const brokenLinksCount = brokenLinksData?.brokenLinksCount || 0;

  const handleSync = async () => {
    try {
      const result = await syncNavigation.mutateAsync();
      // Also refresh broken links check after sync
      refetchBrokenLinks();
      toast({
        title: "Navigation Sync Complete",
        description: `Synced ${result.menusCount} menus with ${result.itemsCount} items (${result.collectionItemsCount} collection links)`,
      });
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync navigation",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = () => {
    refetch();
    refetchBrokenLinks();
  };

  if (error) {
    return (
      <MainLayout
        title="Navigation Menus"
        subtitle="View Shopify navigation structure"
      >
        <div className="p-8">
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Navigation</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load navigation data"}
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
      title="Navigation Menus"
      subtitle="View Shopify navigation structure (read-only)"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading || isLoadingBrokenLinks}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading || isLoadingBrokenLinks ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncNavigation.isPending}
          >
            {syncNavigation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync from Shopify
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="p-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading navigation menus...</span>
          </div>
        ) : (
          <>
            <StatsCards
              menus={menus}
              brokenLinksCount={brokenLinksCount}
              isLoadingBrokenLinks={isLoadingBrokenLinks}
            />

            {/* Show broken links alert if any detected */}
            <BrokenLinksAlert brokenLinks={brokenLinks} />

            {menus.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Menu className="h-5 w-5" />
                    Menus ({menus.length})
                  </h3>
                  {menus[0]?.syncedAt && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Last synced: {new Date(menus[0].syncedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {menus.map((menu) => (
                  <MenuTree key={menu.id} menu={menu} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Menu className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-gray-700 mb-2">No Navigation Menus</h4>
                  <p className="text-gray-500 mb-4">
                    Click "Sync from Shopify" to load your navigation menus.
                  </p>
                  <Button onClick={handleSync} disabled={syncNavigation.isPending}>
                    {syncNavigation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync from Shopify
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
