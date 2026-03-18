import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Step 1: Email Entry
function EmailStep({
  onNext
}: {
  onNext: (email: string) => void
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.status === 429) {
        throw new Error("Too many attempts. Please try again later.");
      }

      if (!res.ok) {
        throw new Error(data.message || "Failed to send verification code");
      }

      onNext(email);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          data-testid="input-register-email"
        />
        <p className="text-sm text-muted-foreground">
          We'll send a verification code to this email
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading || !email} data-testid="button-send-code">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

// Step 2: Verify Code
function VerifyStep({
  email,
  onNext,
  onBack
}: {
  email: string;
  onNext: (token: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Invalid verification code");
      }

      onNext(data.tempToken);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        toast({
          title: "Code sent!",
          description: "Check your email for the new verification code.",
        });
      } else {
        throw new Error("Failed to resend");
      }
    } catch (err) {
      toast({
        title: "Failed to resend",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to
        </p>
        <p className="font-medium">{email}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">Verification Code</Label>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="text-center text-2xl tracking-widest"
          autoFocus
          required
          data-testid="input-verify-code"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={loading || code.length !== 6}
        data-testid="button-verify-code"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying...
          </>
        ) : (
          <>
            Verify Code
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} data-testid="button-back-step2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={handleResend}
          disabled={resending}
          data-testid="button-resend-code"
        >
          {resending ? "Sending..." : "Resend code"}
        </Button>
      </div>
    </form>
  );
}

// Step 3: Company Details
function DetailsStep({
  tempToken,
  onNext,
  onBack
}: {
  tempToken: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [formData, setFormData] = useState({
    companyName: "",
    subdomain: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  });
  const [subdomainStatus, setSubdomainStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Check subdomain availability (debounced)
  const checkSubdomain = async (subdomain: string) => {
    if (subdomain.length < 3) {
      setSubdomainStatus("idle");
      return;
    }

    setSubdomainStatus("checking");

    try {
      const res = await fetch(`/api/tenants/check-subdomain/${subdomain}`);
      const data = await res.json();

      if (data.available) {
        setSubdomainStatus("available");
        setSuggestions([]);
      } else {
        setSubdomainStatus("taken");
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      setSubdomainStatus("idle");
    }
  };

  // Debounce subdomain check with proper cleanup
  const handleSubdomainChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setFormData({ ...formData, subdomain: normalized });
    setSubdomainStatus("idle");

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new timeout for subdomain check
    if (normalized.length >= 3) {
      debounceRef.current = setTimeout(() => checkSubdomain(normalized), 500);
    }
  };

  // Password validation
  const passwordErrors = (): string[] => {
    const errors: string[] = [];
    if (formData.password.length < 8) errors.push("At least 8 characters");
    if (!/[a-z]/.test(formData.password)) errors.push("Lowercase letter");
    if (!/[A-Z]/.test(formData.password)) errors.push("Uppercase letter");
    if (!/[0-9]/.test(formData.password)) errors.push("Number");
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const pwErrors = passwordErrors();
    if (pwErrors.length > 0) {
      setError("Password requirements not met");
      return;
    }

    if (subdomainStatus !== "available") {
      setError("Please choose an available subdomain");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempToken,
          companyName: formData.companyName,
          subdomain: formData.subdomain,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      onNext();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="companyName">Company Name</Label>
        <Input
          id="companyName"
          placeholder="ABC Corporation"
          value={formData.companyName}
          onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
          required
          autoFocus
          data-testid="input-company-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subdomain">Workspace ID</Label>
        <p className="text-xs text-muted-foreground">A unique identifier for your organization</p>
        <div className="flex items-center gap-2">
          <Input
            id="subdomain"
            placeholder="abc-corp"
            value={formData.subdomain}
            onChange={(e) => handleSubdomainChange(e.target.value)}
            className="flex-1"
            required
            data-testid="input-subdomain"
          />
        </div>
        {subdomainStatus === "checking" && (
          <p className="text-sm text-muted-foreground">Checking availability...</p>
        )}
        {subdomainStatus === "available" && (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Available!
          </p>
        )}
        {subdomainStatus === "taken" && (
          <div className="text-sm text-red-600">
            <p>This subdomain is taken. Try:</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFormData({ ...formData, subdomain: s });
                    checkSubdomain(s);
                  }}
                  data-testid={`button-suggestion-${s}`}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            placeholder="John"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
            data-testid="input-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            placeholder="Doe"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
            data-testid="input-last-name"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          data-testid="input-password"
        />
        <div className="text-sm space-y-1">
          {["At least 8 characters", "Lowercase letter", "Uppercase letter", "Number"].map((req, i) => {
            const met =
              (i === 0 && formData.password.length >= 8) ||
              (i === 1 && /[a-z]/.test(formData.password)) ||
              (i === 2 && /[A-Z]/.test(formData.password)) ||
              (i === 3 && /[0-9]/.test(formData.password));
            return (
              <p key={i} className={met ? "text-green-600" : "text-muted-foreground"}>
                {met ? "+" : "o"} {req}
              </p>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          required
          data-testid="input-confirm-password"
        />
        {formData.confirmPassword && formData.password !== formData.confirmPassword && (
          <p className="text-sm text-red-600">Passwords do not match</p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={loading || subdomainStatus !== "available"}
        data-testid="button-create-account"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            Create Account
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>

      <Button type="button" variant="ghost" onClick={onBack} className="w-full" data-testid="button-back-step3">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
    </form>
  );
}

// Step 4: Success
function SuccessStep() {
  const [, navigate] = useLocation();

  return (
    <div className="text-center space-y-4">
      <div className="flex justify-center">
        <div className="bg-green-100 dark:bg-green-900/20 rounded-full p-4">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
      </div>
      <div>
        <h3 className="text-xl font-semibold">Account Created!</h3>
        <p className="text-muted-foreground mt-1">
          Your account is ready. Let's get started.
        </p>
      </div>
      <Button className="w-full" onClick={() => navigate("/dashboard")} data-testid="button-go-dashboard">
        Go to Dashboard
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// Main Registration Page
export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [tempToken, setTempToken] = useState("");

  const stepTitles: Record<number, string> = {
    1: "Create your account",
    2: "Verify your email",
    3: "Set up your workspace",
    4: "Welcome!",
  };

  const stepDescriptions: Record<number, string> = {
    1: "Enter your work email to get started",
    2: "We sent you a verification code",
    3: "Tell us about your company",
    4: "You're all set",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <Progress value={(step / 4) * 100} className="h-2" />
          <div>
            <CardTitle>{stepTitles[step]}</CardTitle>
            <CardDescription>
              {stepDescriptions[step]}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <EmailStep
              onNext={(email) => {
                setEmail(email);
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <VerifyStep
              email={email}
              onNext={(token) => {
                setTempToken(token);
                setStep(3);
              }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <DetailsStep
              tempToken={tempToken}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && <SuccessStep />}
        </CardContent>
      </Card>
    </div>
  );
}
