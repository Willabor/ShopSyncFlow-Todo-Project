import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SyncProgressIndicator } from "@/components/SyncProgressIndicator";
import { useLocation } from "wouter";
import {
  Package,
  LayoutDashboard,
  CheckSquare,
  Plus,
  Store,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  ListOrdered,
  Sparkles,
  Settings,
  Link2,
  FileImage,
  HeartPulse,
  Menu,
  BookOpen,
  Layers,
  Scale,
  Brain
} from "lucide-react";
import { useHealthIssueCount } from "@/hooks/use-health-check";

export function Sidebar() {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const healthIssueCount = useHealthIssueCount();

  // Auto-expand sections based on current location
  useEffect(() => {
    const newExpanded: string[] = [];

    // Expand Products section for products-related pages
    if (location.startsWith('/products') || location.startsWith('/categories') || location.startsWith('/tags')) {
      newExpanded.push('products');
    }

    // Expand Collections section for collections-related pages
    if (location.startsWith('/collections')) {
      newExpanded.push('collections');
    }

    // Expand Settings section for settings-related pages
    if (location.startsWith('/settings')) {
      newExpanded.push('settings');
    }

    setExpandedSections(newExpanded);
  }, [location]);

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  if (!user) return null;

  const getInitials = (firstName?: string, lastName?: string, username?: string) => {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    if (username) {
      return username.slice(0, 2).toUpperCase();
    }
    return "U";
  };

  const navigationItems: Array<{
    icon?: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    roles: string[];
    indent?: boolean;
    parentSection?: string;
    badge?: number;
  }> = [
    {
      icon: LayoutDashboard,
      label: "Dashboard",
      href: "/dashboard",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      icon: CheckSquare,
      label: "Tasks",
      href: "/tasks",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      icon: Store,
      label: "Vendors",
      href: "/vendors",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      icon: Package,
      label: "Products",
      href: "/products",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      label: "Product Insights",
      href: "/products/insights",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"],
      indent: true,
      parentSection: "products"
    },
    {
      label: "Product URLs",
      href: "/products/urls",
      roles: ["SuperAdmin", "WarehouseManager", "Editor"],
      indent: true,
      parentSection: "products"
    },
    {
      label: "Categories",
      href: "/categories",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"],
      indent: true,
      parentSection: "products"
    },
    {
      label: "Tags",
      href: "/tags",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"],
      indent: true,
      parentSection: "products"
    },
    {
      icon: Layers,
      label: "Collections",
      href: "/collections",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      label: "Collections Analyzer",
      href: "/collections-analyzer",
      roles: ["SuperAdmin", "WarehouseManager", "Editor"],
      indent: true,
      parentSection: "collections"
    },
    {
      label: "Collection Health",
      href: "/collections/health",
      roles: ["SuperAdmin", "WarehouseManager", "Editor"],
      indent: true,
      parentSection: "collections",
      badge: healthIssueCount > 0 ? healthIssueCount : undefined
    },
    {
      icon: Menu,
      label: "Navigation",
      href: "/navigation",
      roles: ["SuperAdmin", "WarehouseManager", "Editor"]
    },
    {
      icon: BookOpen,
      label: "Education",
      href: "/education",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      icon: FileImage,
      label: "Files",
      href: "/files",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      icon: ListOrdered,
      label: "Templates",
      href: "/templates",
      roles: ["SuperAdmin", "WarehouseManager"]
    },
    {
      icon: Sparkles,
      label: "Content Studio",
      href: "/content-studio",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    {
      icon: Scale,
      label: "Weight Rules",
      href: "/weight-rules",
      roles: ["SuperAdmin", "WarehouseManager"]
    },
    {
      icon: Settings,
      label: "Settings",
      href: "/settings",
      roles: ["SuperAdmin", "Auditor"]
    },
    {
      icon: Brain,
      label: "AI Settings",
      href: "/settings/ai",
      roles: ["SuperAdmin", "WarehouseManager"],
      indent: true,
      parentSection: "settings"
    },
  ];

  const visibleItems = navigationItems.filter(item => {
    // Check role permission
    if (!item.roles.includes(user.role)) return false;

    // In collapsed mode, hide sub-items (shown in flyouts instead)
    if (isCollapsed && item.parentSection) return false;

    // If item has a parent section, only show if that section is expanded
    if (item.parentSection) {
      return expandedSections.includes(item.parentSection);
    }

    return true;
  });

  // Build flyout sub-items for collapsed mode
  const getChildItems = (sectionName: string) =>
    navigationItems.filter(item =>
      item.parentSection === sectionName && item.roles.includes(user.role)
    );

  return (
    <aside
      className={`${isCollapsed ? 'w-16' : 'w-64'} bg-card border-r border-border flex flex-col transition-all duration-300 sticky top-0 h-screen`}
      data-testid="sidebar"
    >
      {/* Header */}
      <div className={`${isCollapsed ? 'p-3' : 'p-6'} border-b border-border`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Package className="h-6 w-6 text-primary" />
            </div>
            {!isCollapsed && (
              <div className="ml-3 min-w-0">
                <h2 className="text-lg font-semibold text-foreground">Workflow</h2>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-user-role">
                  {user.role === "SuperAdmin" ? "Super Admin" : user.role}
                </p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isCollapsed ? 'ml-0' : ''}`}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-4'} overflow-y-auto`}>
        <ul className="space-y-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            const isProductsItem = item.label === "Products";
            const isCollectionsItem = item.label === "Collections";
            const isSettingsItem = item.label === "Settings";
            const sectionName = isProductsItem ? "products" : isCollectionsItem ? "collections" : isSettingsItem ? "settings" : null;
            const children = sectionName ? getChildItems(sectionName) : [];

            const navButton = (
              <button
                onClick={() => {
                  if (sectionName) toggleSection(sectionName);
                  setLocation(item.href);
                }}
                className={`w-full flex items-center justify-between ${isCollapsed ? 'justify-center px-2 py-2' : (item.indent ? 'px-3 py-2 pl-11' : 'px-3 py-2')} text-sm ${item.indent ? 'font-normal' : 'font-medium'} rounded-md transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  isActive
                    ? "bg-primary text-primary-foreground sidebar-link active"
                    : "hover:bg-accent sidebar-link text-foreground"
                }`}
                data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                title={isCollapsed ? item.label : undefined}
                aria-label={isCollapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                aria-expanded={sectionName ? expandedSections.includes(sectionName) : undefined}
              >
                <span className="flex items-center">
                  {Icon && <Icon className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'} ${item.indent && !isCollapsed ? 'w-4 h-4' : ''}`} />}
                  {!isCollapsed && item.label}
                </span>
                <span className="flex items-center gap-1">
                  {!isCollapsed && item.badge && item.badge > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                  {!isCollapsed && sectionName && (
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        expandedSections.includes(sectionName) ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </span>
              </button>
            );

            // Collapsed mode with children: show popover flyout
            if (isCollapsed && children.length > 0) {
              return (
                <li key={item.label}>
                  <Popover>
                    <PopoverTrigger asChild>
                      {navButton}
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-48 p-1" sideOffset={8}>
                      <div className="space-y-0.5">
                        <button
                          onClick={() => setLocation(item.href)}
                          className={`w-full px-3 py-2 text-sm font-medium rounded-md text-left transition-colors ${
                            isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
                          }`}
                        >
                          {item.label}
                        </button>
                        <div className="border-t border-border my-1" />
                        {children.map(child => (
                          <button
                            key={child.label}
                            onClick={() => setLocation(child.href)}
                            className={`w-full px-3 py-2 text-sm rounded-md text-left transition-colors flex items-center justify-between ${
                              location === child.href ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
                            }`}
                          >
                            {child.label}
                            {child.badge && child.badge > 0 && (
                              <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full ml-2">
                                {child.badge}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </li>
              );
            }

            return (
              <li key={item.label}>
                {navButton}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sync Progress Indicator */}
      <SyncProgressIndicator />

      {/* User Profile */}
      <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-border`}>
        {isCollapsed ? (
          <div className="flex flex-col items-center space-y-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/profile")}
              className="w-10 h-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              title="Profile"
              aria-label="View profile"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {getInitials(user.firstName || undefined, user.lastName || undefined, user.username)}
                </AvatarFallback>
              </Avatar>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              className="text-muted-foreground hover:text-foreground w-10 h-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="button-logout"
              title="Logout"
              aria-label="Log out of account"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation("/profile")}
              className="flex items-center flex-1 min-w-0 hover:bg-accent rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              title="View Profile"
              aria-label="View profile"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {getInitials(user.firstName || undefined, user.lastName || undefined, user.username)}
                </AvatarFallback>
              </Avatar>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate" data-testid="text-user-name">
                  {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
                </p>
                <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
                  {user.email}
                </p>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              className="text-muted-foreground hover:text-foreground flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="button-logout"
              title="Logout"
              aria-label="Log out of account"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
