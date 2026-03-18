import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./hooks/use-auth";
import { SystemProvider } from "@/contexts/SystemContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute } from "./lib/protected-route";
import { Loader2 } from "lucide-react";

// Eager-loaded pages (needed immediately)
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import AuthPage from "@/pages/auth-page";

// Lazy-loaded pages (code-split chunks)
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password-page"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password-page"));
const RegisterPage = lazy(() => import("@/pages/register-page"));
const ProfilePage = lazy(() => import("@/pages/profile-page"));
const CompleteProfile = lazy(() => import("@/pages/complete-profile"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const TasksPage = lazy(() => import("@/pages/tasks"));
const VendorsPage = lazy(() => import("@/pages/vendors"));
const TemplateManagement = lazy(() => import("@/pages/template-management"));
const ContentStudio = lazy(() => import("@/pages/content-studio"));
const ProductsPage = lazy(() => import("@/pages/products"));
const ProductEditPage = lazy(() => import("@/pages/product-edit"));
const BulkEditPage = lazy(() => import("@/pages/BulkEditPage"));
const ProductInsights = lazy(() => import("@/pages/product-insights"));
const ProductURLsPage = lazy(() => import("@/pages/product-urls"));
const CategoriesPage = lazy(() => import("@/pages/categories"));
const TagsPage = lazy(() => import("@/pages/tags"));
const CollectionsPage = lazy(() => import("@/pages/collections"));
const CollectionEditPage = lazy(() => import("@/pages/collection-edit"));
const CollectionsAnalyzer = lazy(() => import("@/pages/collections-analyzer"));
const CollectionHealthPage = lazy(() => import("@/pages/collection-health"));
const NavigationPage = lazy(() => import("@/pages/navigation"));
const EducationPage = lazy(() => import("@/pages/education"));
const FilesPage = lazy(() => import("@/pages/files"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const WeightRulesPage = lazy(() => import("@/pages/weight-rules"));
const AISettingsPage = lazy(() => import("@/pages/ai-settings"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-border" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/login" component={AuthPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/register" component={RegisterPage} />
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/complete-profile" component={CompleteProfile} />
        <ProtectedRoute path="/tasks" component={TasksPage} />
        <ProtectedRoute path="/vendors" component={VendorsPage} />
        <ProtectedRoute path="/products" component={ProductsPage} />
        <ProtectedRoute path="/products/insights" component={ProductInsights} />
        <ProtectedRoute path="/products/urls" component={ProductURLsPage} />
        <ProtectedRoute path="/products/new" component={ProductEditPage} />
        <ProtectedRoute path="/products/:id/bulk-edit" component={BulkEditPage} />
        <ProtectedRoute path="/products/:id/edit" component={ProductEditPage} />
        <ProtectedRoute path="/categories" component={CategoriesPage} />
        <ProtectedRoute path="/tags" component={TagsPage} />
        <ProtectedRoute path="/collections" component={CollectionsPage} />
        <ProtectedRoute path="/collections/health" component={CollectionHealthPage} />
        <ProtectedRoute path="/collections/:id/edit" component={CollectionEditPage} />
        <ProtectedRoute path="/collections-analyzer" component={CollectionsAnalyzer} />
        <ProtectedRoute path="/navigation" component={NavigationPage} />
        <ProtectedRoute path="/education" component={EducationPage} />
        <ProtectedRoute path="/files" component={FilesPage} />
        <ProtectedRoute path="/templates" component={TemplateManagement} />
        <ProtectedRoute path="/content-studio" component={ContentStudio} />
        <ProtectedRoute path="/weight-rules" component={WeightRulesPage} />
        <ProtectedRoute path="/settings" component={SettingsPage} />
        <ProtectedRoute path="/settings/ai" component={AISettingsPage} />
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SystemProvider>
          <SyncProvider>
            <NotificationProvider>
              <TooltipProvider>
                <Toaster />
                <Router />
              </TooltipProvider>
            </NotificationProvider>
          </SyncProvider>
        </SystemProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
