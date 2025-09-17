import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Package, 
  LayoutDashboard, 
  CheckSquare, 
  Plus, 
  Users, 
  BarChart3, 
  History,
  LogOut
} from "lucide-react";

export function Sidebar() {
  const { user, logoutMutation } = useAuth();

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

  const navigationItems = [
    { 
      icon: LayoutDashboard, 
      label: "Dashboard", 
      href: "/",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"],
      active: true
    },
    { 
      icon: CheckSquare, 
      label: "Tasks", 
      href: "/tasks",
      roles: ["SuperAdmin", "WarehouseManager", "Editor", "Auditor"]
    },
    { 
      icon: Plus, 
      label: "New Product", 
      href: "/products/new",
      roles: ["SuperAdmin", "WarehouseManager", "Editor"]
    },
    { 
      icon: Users, 
      label: "Team", 
      href: "/team",
      roles: ["SuperAdmin", "WarehouseManager"]
    },
    { 
      icon: BarChart3, 
      label: "Analytics", 
      href: "/analytics",
      roles: ["SuperAdmin"]
    },
    { 
      icon: History, 
      label: "Audit Log", 
      href: "/audit",
      roles: ["SuperAdmin", "Auditor"]
    },
  ];

  const visibleItems = navigationItems.filter(item => 
    item.roles.includes(user.role)
  );

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div className="ml-3">
            <h2 className="text-lg font-semibold text-foreground">Workflow</h2>
            <p className="text-sm text-muted-foreground" data-testid="text-user-role">
              {user.role === "SuperAdmin" ? "Super Admin" : user.role}
            </p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {visibleItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <a 
                  href={item.href}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    item.active 
                      ? "bg-primary text-primary-foreground sidebar-link active"
                      : "hover:bg-accent sidebar-link"
                  }`}
                  data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      
      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logoutMutation.mutate()}
            className="text-muted-foreground hover:text-foreground"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
