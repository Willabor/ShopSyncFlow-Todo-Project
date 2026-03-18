import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // If profile is not completed and trying to access any page other than /complete-profile, redirect
  if (!user.profileCompleted && path !== "/complete-profile") {
    return (
      <Route path={path}>
        <Redirect to="/complete-profile" />
      </Route>
    );
  }

  // If profile is already completed and trying to access /complete-profile, redirect to dashboard
  if (user.profileCompleted && path === "/complete-profile") {
    return (
      <Route path={path}>
        <Redirect to="/dashboard" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      <Component />
    </Route>
  )
}
