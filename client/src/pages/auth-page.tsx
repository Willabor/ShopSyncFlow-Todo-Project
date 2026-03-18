import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, Link } from "wouter";
import { Loader2, Package, Building2, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Type for tenant lookup response
interface TenantInfo {
  id: string;
  companyName: string;
  subdomain: string;
}

interface TenantLookupResponse {
  tenants: TenantInfo[];
}

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();

  // MULTI-TENANT: Two-step login flow
  // Step 1: User enters email → system looks up their tenant
  // Step 2: User sees THEIR company name → enters password
  const [loginStep, setLoginStep] = useState<"email" | "password">("email");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [selectedTenant, setSelectedTenant] = useState<TenantInfo | null>(null);

  const [registerData, setRegisterData] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "Editor" as const,
  });
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");

  // MULTI-TENANT: Tenant lookup mutation (replaces hardcoded tenant query)
  const tenantLookupMutation = useMutation({
    mutationFn: async (email: string): Promise<TenantLookupResponse> => {
      const response = await apiRequest("POST", "/api/auth/lookup-tenant", { email });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.tenants.length > 0) {
        // User found - show their tenant and proceed to password step
        setSelectedTenant(data.tenants[0]);
        setLoginStep("password");
        setLoginError("");
      } else {
        // Security: Don't reveal if email exists - use generic message
        setLoginError("Unable to continue. Please check your email or contact support.");
      }
    },
    onError: (error: Error) => {
      setLoginError(error.message || "Unable to verify email");
    },
  });

  // Redirect if already logged in - moved after all hooks
  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // Capture login errors
  useEffect(() => {
    if (loginMutation.error) {
      setLoginError(loginMutation.error.message);
    }
  }, [loginMutation.error]);

  // Capture registration errors
  useEffect(() => {
    if (registerMutation.error) {
      setRegisterError(registerMutation.error.message);
    }
  }, [registerMutation.error]);

  // Clear form on successful registration
  useEffect(() => {
    if (registerMutation.isSuccess) {
      setRegisterData({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        role: "Editor" as const,
      });
      setRegisterError("");
    }
  }, [registerMutation.isSuccess]);

  // Early return after all hooks
  if (user) {
    return null;
  }

  // MULTI-TENANT: Handle email lookup (Step 1)
  const handleEmailLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginData.email.trim()) {
      setLoginError("Please enter your email");
      return;
    }
    tenantLookupMutation.mutate(loginData.email.trim().toLowerCase());
  };

  // MULTI-TENANT: Handle login with tenant context (Step 2)
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginData.password) {
      setLoginError("Please enter your password");
      return;
    }
    // Include tenant ID in login request for validation
    loginMutation.mutate({
      email: loginData.email.trim().toLowerCase(),
      password: loginData.password,
      tenantId: selectedTenant?.id,
    });
  };

  // MULTI-TENANT: Go back to email step
  const handleBackToEmail = () => {
    setLoginStep("email");
    setSelectedTenant(null);
    setLoginData(prev => ({ ...prev, password: "" }));
    setLoginError("");
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(""); // Clear previous errors
    registerMutation.mutate(registerData);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/10">
      <div className="grid grid-cols-1 lg:grid-cols-2 w-full max-w-6xl mx-4 gap-8">
        
        {/* Left Column - Auth Forms */}
        <Card className="w-full max-w-md justify-self-center lg:justify-self-end">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Workflow Manager</h1>
              <p className="text-muted-foreground mt-2">Shopify Product Management System</p>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" data-testid="tab-login">Sign In</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                {/* MULTI-TENANT: Step 1 - Email entry */}
                {loginStep === "email" && (
                  <form onSubmit={handleEmailLookup} className="space-y-4">
                    <div>
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="Enter your email"
                        value={loginData.email}
                        onChange={(e) => {
                          setLoginData(prev => ({ ...prev, email: e.target.value }));
                          setLoginError("");
                        }}
                        required
                        autoFocus
                        data-testid="input-login-email"
                        className={loginError ? "border-red-500" : ""}
                      />
                      {loginError && (
                        <p className="text-sm text-red-500 mt-1">{loginError}</p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={tenantLookupMutation.isPending}
                      data-testid="button-continue"
                    >
                      {tenantLookupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Continue
                    </Button>
                    <div className="text-center pt-2 space-y-2">
                      <Link href="/forgot-password" className="text-sm text-primary hover:underline block">
                        Forgot password?
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        New company?{" "}
                        <Link href="/register" className="text-primary hover:underline">
                          Create a workspace
                        </Link>
                      </p>
                    </div>
                  </form>
                )}

                {/* MULTI-TENANT: Step 2 - Tenant confirmation + Password */}
                {loginStep === "password" && selectedTenant && (
                  <form onSubmit={handleLogin} className="space-y-4">
                    {/* Show tenant info (user's actual company, not hardcoded) */}
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Signing in to</p>
                          <p className="font-medium text-primary">{selectedTenant.companyName}</p>
                        </div>
                      </div>
                    </div>

                    {/* Email display (readonly) */}
                    <div>
                      <Label htmlFor="login-email-display">Email</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="login-email-display"
                          type="email"
                          value={loginData.email}
                          disabled
                          className="flex-1 bg-muted"
                          data-testid="input-login-email-display"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleBackToEmail}
                          className="shrink-0"
                          data-testid="button-change-user"
                        >
                          <ArrowLeft className="h-4 w-4 mr-1" />
                          Change
                        </Button>
                      </div>
                    </div>

                    {/* Password input */}
                    <div>
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="Enter your password"
                        value={loginData.password}
                        onChange={(e) => {
                          setLoginData(prev => ({ ...prev, password: e.target.value }));
                          setLoginError("");
                        }}
                        required
                        autoFocus
                        data-testid="input-login-password"
                        className={loginError ? "border-red-500" : ""}
                      />
                      {loginError && (
                        <p className="text-sm text-red-500 mt-1">{loginError}</p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loginMutation.isPending}
                      data-testid="button-login"
                    >
                      {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign In
                    </Button>
                    <div className="text-center pt-2">
                      <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="register-firstName">First Name</Label>
                      <Input
                        id="register-firstName"
                        type="text"
                        placeholder="John"
                        value={registerData.firstName}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, firstName: e.target.value }))}
                        data-testid="input-register-firstname"
                      />
                    </div>
                    <div>
                      <Label htmlFor="register-lastName">Last Name</Label>
                      <Input
                        id="register-lastName"
                        type="text"
                        placeholder="Doe"
                        value={registerData.lastName}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, lastName: e.target.value }))}
                        data-testid="input-register-lastname"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      type="text"
                      placeholder="johndoe"
                      value={registerData.username}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                      required
                      data-testid="input-register-username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="john@company.com"
                      value={registerData.email}
                      onChange={(e) => {
                        setRegisterData(prev => ({ ...prev, email: e.target.value }));
                        setRegisterError(""); // Clear error when user types
                      }}
                      required
                      data-testid="input-register-email"
                      className={registerError ? "border-red-500" : ""}
                    />
                    {registerError && (
                      <p className="text-sm text-red-500 mt-1">{registerError}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="••••••••"
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      required
                      data-testid="input-register-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={registerMutation.isPending}
                    data-testid="button-register"
                  >
                    {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right Column - Hero Section */}
        <div className="flex items-center justify-center lg:justify-start">
          <div className="max-w-md text-center lg:text-left">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Streamline Your Product Workflow
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Manage your Shopify product uploads with role-based access control, 
              automated workflows, and comprehensive audit trails.
            </p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-card/50 rounded-lg p-4">
                <div className="font-semibold text-foreground mb-2">State Machine</div>
                <p className="text-muted-foreground">Enforced workflow transitions from NEW to DONE</p>
              </div>
              <div className="bg-card/50 rounded-lg p-4">
                <div className="font-semibold text-foreground mb-2">Role-Based Access</div>
                <p className="text-muted-foreground">Customized dashboards for each user role</p>
              </div>
              <div className="bg-card/50 rounded-lg p-4">
                <div className="font-semibold text-foreground mb-2">Time Tracking</div>
                <p className="text-muted-foreground">Lead time and cycle time calculations</p>
              </div>
              <div className="bg-card/50 rounded-lg p-4">
                <div className="font-semibold text-foreground mb-2">Audit Trail</div>
                <p className="text-muted-foreground">Complete logging of all actions</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
