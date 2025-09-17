import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Loader2, Package } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  
  // Redirect if already logged in
  if (user) {
    setLocation("/");
    return null;
  }

  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "Editor" as const,
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
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
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                      id="login-username"
                      type="text"
                      placeholder="Enter your username"
                      value={loginData.username}
                      onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                      required
                      data-testid="input-login-username"
                    />
                  </div>
                  <div>
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginData.password}
                      onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      required
                      data-testid="input-login-password"
                    />
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
                </form>
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
                      onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                      required
                      data-testid="input-register-email"
                    />
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

            {/* Demo Account Information */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Demo Accounts:</p>
                <div className="space-y-1 text-xs">
                  <div>Super Admin: admin / password</div>
                  <div>Warehouse Mgr: warehouse / password</div>
                  <div>Editor: editor / password</div>
                  <div>Auditor: auditor / password</div>
                </div>
              </div>
            </div>
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
