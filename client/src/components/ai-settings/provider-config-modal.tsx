/**
 * Provider Configuration Modal (T21)
 *
 * Modal for configuring individual AI providers with BYOK support.
 * Includes API key input, model selection, and connection testing.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Zap
} from "lucide-react";

// Provider metadata
const PROVIDER_META: Record<string, { displayName: string; keyPlaceholder: string; additionalFields?: { key: string; label: string; placeholder: string }[] }> = {
  gemini: {
    displayName: "Google Gemini",
    keyPlaceholder: "AIza..."
  },
  openai: {
    displayName: "OpenAI",
    keyPlaceholder: "sk-...",
    additionalFields: [
      { key: "organizationId", label: "Organization ID (optional)", placeholder: "org-..." }
    ]
  },
  anthropic: {
    displayName: "Anthropic",
    keyPlaceholder: "sk-ant-..."
  },
  mistral: {
    displayName: "Mistral AI",
    keyPlaceholder: "..."
  },
  cohere: {
    displayName: "Cohere",
    keyPlaceholder: "..."
  },
  bedrock: {
    displayName: "AWS Bedrock",
    keyPlaceholder: "AKIA...",
    additionalFields: [
      { key: "secretKey", label: "AWS Secret Key", placeholder: "..." },
      { key: "region", label: "AWS Region", placeholder: "us-east-1" }
    ]
  },
  azure_openai: {
    displayName: "Azure OpenAI",
    keyPlaceholder: "...",
    additionalFields: [
      { key: "endpoint", label: "Azure Endpoint", placeholder: "https://your-resource.openai.azure.com/" },
      { key: "deploymentName", label: "Deployment Name", placeholder: "gpt-4" }
    ]
  }
};

interface ProviderConfigModalProps {
  provider: string | null;
  isOpen: boolean;
  onClose: () => void;
  existingConfig?: {
    isEnabled: boolean;
    usePlatformDefault: boolean;
    hasKey: boolean;
    isDefault: boolean;
    additionalConfig?: Record<string, string>;
  };
}

interface TestResult {
  success: boolean;
  message: string;
  models?: string[];
}

export function ProviderConfigModal({
  provider,
  isOpen,
  onClose,
  existingConfig
}: ProviderConfigModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [usePlatformDefault, setUsePlatformDefault] = useState(existingConfig?.usePlatformDefault ?? true);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [isDefault, setIsDefault] = useState(existingConfig?.isDefault ?? false);
  const [additionalConfig, setAdditionalConfig] = useState<Record<string, string>>(
    existingConfig?.additionalConfig ?? {}
  );
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Reset form when provider changes
  useEffect(() => {
    if (isOpen && provider) {
      setUsePlatformDefault(existingConfig?.usePlatformDefault ?? true);
      setApiKey("");
      setShowApiKey(false);
      setSelectedModel("");
      setIsDefault(existingConfig?.isDefault ?? false);
      setAdditionalConfig(existingConfig?.additionalConfig ?? {});
      setTestResult(null);

      // Focus first input after dialog opens
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, provider, existingConfig]);

  // Fetch available models when API key is provided
  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ["/api/ai/providers", provider, "models"],
    queryFn: async () => {
      if (!provider) return null;
      const res = await fetch(`/api/ai/providers/${provider}/models`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isOpen && !!provider && !usePlatformDefault
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("No provider selected");

      const res = await fetch(`/api/ai/providers/${provider}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: usePlatformDefault ? undefined : apiKey,
          usePlatformDefault,
          additionalConfig
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Connection test failed");
      return data;
    },
    onSuccess: (data) => {
      setTestResult({
        success: true,
        message: data.message || "Connection successful!",
        models: data.models
      });
    },
    onError: (error: Error) => {
      setTestResult({
        success: false,
        message: error.message
      });
    }
  });

  // Save provider configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("No provider selected");

      const res = await fetch(`/api/ai/providers/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: usePlatformDefault ? undefined : apiKey || undefined,
          usePlatformDefault,
          isEnabled: true,
          isDefault,
          additionalConfig: Object.keys(additionalConfig).length > 0 ? additionalConfig : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save configuration");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/config"] });
      toast({
        title: "Provider configured",
        description: `${PROVIDER_META[provider!]?.displayName || provider} has been configured successfully.`
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Configuration failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete provider configuration mutation
  const deleteConfigMutation = useMutation({
    mutationFn: async () => {
      if (!provider) throw new Error("No provider selected");

      const res = await fetch(`/api/ai/providers/${provider}`, {
        method: "DELETE"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete configuration");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/config"] });
      toast({
        title: "Provider removed",
        description: `${PROVIDER_META[provider!]?.displayName || provider} configuration has been removed.`
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (!provider) return null;

  const meta = PROVIDER_META[provider] || { displayName: provider, keyPlaceholder: "..." };
  const models = modelsData?.models || testResult?.models || [];
  const isSaving = saveConfigMutation.isPending;
  const isTesting = testConnectionMutation.isPending;
  const isDeleting = deleteConfigMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[500px]"
        aria-labelledby="provider-config-title"
        aria-describedby="provider-config-description"
      >
        <DialogHeader>
          <DialogTitle id="provider-config-title">
            Configure {meta.displayName}
          </DialogTitle>
          <DialogDescription id="provider-config-description">
            Set up your AI provider configuration. You can use platform defaults or provide your own API key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Platform Default Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="platform-default">Use Platform Default</Label>
              <p className="text-sm text-muted-foreground">
                Use the shared platform API key (rate limited)
              </p>
            </div>
            <Switch
              id="platform-default"
              checked={usePlatformDefault}
              onCheckedChange={setUsePlatformDefault}
              aria-checked={usePlatformDefault}
              role="switch"
            />
          </div>

          {/* BYOK Section */}
          {!usePlatformDefault && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <div className="relative">
                  <Input
                    ref={firstInputRef}
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder={meta.keyPlaceholder}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-10"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {existingConfig?.hasKey && !apiKey && (
                  <p className="text-sm text-muted-foreground">
                    An API key is already configured. Leave blank to keep the existing key.
                  </p>
                )}
              </div>

              {/* Additional fields for specific providers */}
              {meta.additionalFields?.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type="text"
                    placeholder={field.placeholder}
                    value={additionalConfig[field.key] || ""}
                    onChange={(e) =>
                      setAdditionalConfig((prev) => ({
                        ...prev,
                        [field.key]: e.target.value
                      }))
                    }
                  />
                </div>
              ))}

              {/* Model Selection */}
              {models.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="model">Preferred Model</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model: string) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Set as Default Toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-0.5">
              <Label htmlFor="is-default">Set as Default Provider</Label>
              <p className="text-sm text-muted-foreground">
                Use this provider for all AI features
              </p>
            </div>
            <Switch
              id="is-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
              aria-checked={isDefault}
              role="switch"
            />
          </div>

          {/* Test Connection Button */}
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => testConnectionMutation.mutate()}
              disabled={isTesting || (!usePlatformDefault && !apiKey && !existingConfig?.hasKey)}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Test Connection
                </>
              )}
            </Button>

            {/* Test Result */}
            {testResult && (
              <Alert
                className={`mt-3 ${testResult.success ? "border-green-500" : "border-destructive"}`}
                role="status"
                aria-live="polite"
              >
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <AlertDescription className={testResult.success ? "text-green-700" : ""}>
                  {testResult.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {existingConfig?.hasKey && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteConfigMutation.mutate()}
              disabled={isDeleting || isSaving}
              className="sm:mr-auto"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Configuration
                </>
              )}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveConfigMutation.mutate()}
            disabled={isSaving || (!usePlatformDefault && !apiKey && !existingConfig?.hasKey)}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Configuration"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProviderConfigModal;
