import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Common country codes for international phone numbers
const COUNTRY_CODES = [
  { code: "+1", country: "United States", flag: "🇺🇸" },
  { code: "+20", country: "Egypt", flag: "🇪🇬" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "+971", country: "UAE", flag: "🇦🇪" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+91", country: "India", flag: "🇮🇳" },
];

export default function CompleteProfile() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");

  const completeProfileMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {

      const res = await fetch("/api/user/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phoneNumber }),
      });


      // Clone the response so we can read it multiple times
      const clonedResponse = res.clone();
      const responseText = await clonedResponse.text();

      if (!res.ok) {
        let errorMessage = "Failed to complete profile";
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          console.error("Failed to parse error response:", e);
          errorMessage = res.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Parse the JSON response
      try {
        const data = JSON.parse(responseText);
        return data;
      } catch (e) {
        console.error("Failed to parse response:", e);
        console.error("Response text was:", responseText);
        throw new Error("Invalid response from server");
      }
    },
    onSuccess: (updatedUser) => {
      // Update user in cache
      queryClient.setQueryData(["/api/user"], updatedUser);

      toast({
        title: "Profile Completed!",
        description: "Your profile has been set up successfully.",
      });

      // Redirect to dashboard
      setLocation("/");
    },
    onError: (error: Error) => {
      setError(error.message);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Basic validation
    if (!phoneNumber.trim()) {
      setError("Phone number is required");
      return;
    }

    // Remove any non-digit characters for validation
    const digitsOnly = phoneNumber.replace(/\D/g, '');

    if (digitsOnly.length < 7) {
      setError("Phone number must be at least 7 digits");
      return;
    }

    // Combine country code with phone number
    const fullPhoneNumber = `${countryCode} ${phoneNumber}`;
    completeProfileMutation.mutate(fullPhoneNumber);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/10">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>
            Welcome! Please complete your profile to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="phoneNumber">
                Phone Number <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2 mt-1">
                <Select
                  value={countryCode}
                  onValueChange={setCountryCode}
                  disabled={completeProfileMutation.isPending}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <span className="flex items-center gap-2">
                          <span>{country.flag}</span>
                          <span>{country.code}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phoneNumber"
                    type="tel"
                    placeholder="555-123-4567"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setError("");
                    }}
                    className={`pl-10 ${error ? "border-destructive" : ""}`}
                    required
                    autoFocus
                    disabled={completeProfileMutation.isPending}
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive mt-1">{error}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Your phone number will be used for future WhatsApp notifications.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={completeProfileMutation.isPending}
            >
              {completeProfileMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Complete Profile
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Note:</strong> This information is required to set up your account. You can update it later in your profile settings.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
