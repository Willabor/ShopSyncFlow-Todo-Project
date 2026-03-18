/**
 * AI Settings Page
 *
 * Main page for managing AI configuration, providers, templates, and usage.
 * Includes tabs for Providers, Templates, and Usage & Billing.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Brain,
  Sparkles,
  Settings,
  Key,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Zap,
  BarChart3,
  FileText,
  ArrowUpRight,
  Shield,
  TrendingUp,
} from "lucide-react";
import { TemplateGallery, TemplateEditorModal, FeatureSettingsTable } from "@/components/ai-settings";
import type { PromptTemplate } from "@/components/ai-settings";

// ===================================================================
// Types
// ===================================================================

interface AIConfig {
  tier: 'free' | 'pro' | 'enterprise';
  defaultProvider: string;
  fallbackProvider: string | null;
  monthlyTokenLimit: number | null;
}

interface UsageStatus {
  tier: 'free' | 'pro' | 'enterprise';
  usageToday: number;
  dailyLimit: number | null;
  percentUsed: number;
  remainingRequests: number | null;
}

interface AIProvider {
  provider: string;
  displayName: string;
  isConfigured: boolean;
  isEnabled: boolean;
  isDefault: boolean;
  usePlatformDefault: boolean;
  hasOwnKey: boolean;
  maskedKey: string | null;
  additionalConfig: any;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  platformEnabled: boolean;
  platformRateLimitFree: number | null;
  platformRateLimitPro: number | null;
  models: Array<{ id: string; name: string; maxTokens: number }>;
  defaultModel: string | null;
}

interface UsageStats {
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    estimated: number;
    currency: string;
  };
  performance: {
    avgDurationMs: number;
  };
  byProvider: Record<string, number>;
  byFeature: Record<string, number>;
}

// ===================================================================
// Component: ProviderCard
// ===================================================================

interface ProviderCardProps {
  provider: AIProvider;
  onConfigure: (provider: AIProvider) => void;
  onTest: (provider: string) => void;
  isTesting: boolean;
}

function ProviderCard({ provider, onConfigure, onTest, isTesting }: ProviderCardProps) {
  const getProviderIcon = (name: string) => {
    const icons: Record<string, string> = {
      gemini: '🔮',
      openai: '🤖',
      anthropic: '🧠',
      mistral: '⚡',
    };
    return icons[name] || '✨';
  };

  const getStatusBadge = () => {
    if (provider.hasOwnKey) {
      return <Badge className="bg-green-100 text-green-800">Your Key</Badge>;
    }
    if (provider.usePlatformDefault && provider.platformEnabled) {
      return <Badge variant="secondary">Platform Default</Badge>;
    }
    return <Badge variant="outline">Not Configured</Badge>;
  };

  const getTestStatusIcon = () => {
    if (provider.lastTestStatus === 'success') {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    if (provider.lastTestStatus === 'error') {
      return <X className="h-4 w-4 text-red-500" />;
    }
    return null;
  };

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        provider.isDefault ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => onConfigure(provider)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getProviderIcon(provider.provider)}</span>
            <CardTitle className="text-lg">{provider.displayName}</CardTitle>
          </div>
          {provider.isDefault && (
            <Badge className="bg-primary text-primary-foreground">Default</Badge>
          )}
        </div>
        <CardDescription className="flex items-center gap-2">
          {getStatusBadge()}
          {getTestStatusIcon()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {provider.hasOwnKey && provider.maskedKey && (
            <div className="text-xs text-muted-foreground font-mono">
              {provider.maskedKey}
            </div>
          )}
          {provider.lastTestStatus === 'error' && provider.lastTestError && (
            <div className="text-xs text-red-500 truncate" title={provider.lastTestError}>
              {provider.lastTestError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {provider.models.length} model{provider.models.length !== 1 ? 's' : ''} available
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onTest(provider.provider);
              }}
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1">Test</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===================================================================
// Component: ProviderConfigModal
// ===================================================================

interface ProviderConfigModalProps {
  provider: AIProvider | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: string, data: any) => Promise<void>;
  onTest: (provider: string) => Promise<{ success: boolean; message: string; responseTimeMs?: number }>;
  isTesting: boolean;
}

interface TestResult {
  success: boolean;
  message: string;
  responseTimeMs?: number;
  testedAt?: string;
}

function ProviderConfigModal({ provider, isOpen, onClose, onSave, onTest, isTesting }: ProviderConfigModalProps) {
  const [usePlatformDefault, setUsePlatformDefault] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (provider) {
      setUsePlatformDefault(provider.usePlatformDefault);
      setApiKey('');
      setShowApiKey(false);
      setSelectedModel(provider.defaultModel || '');
      // Clear test result when provider changes
      setTestResult(null);
    }
  }, [provider]);

  // Clear test result when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTestResult(null);
    }
  }, [isOpen]);

  const handleTest = async () => {
    if (!provider) return;
    try {
      const result = await onTest(provider.provider);
      setTestResult({
        success: result.success,
        message: result.message,
        responseTimeMs: result.responseTimeMs,
        testedAt: new Date().toLocaleString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      setTestResult({
        success: false,
        message,
        testedAt: new Date().toLocaleString(),
      });
    }
  };

  const handleSave = async () => {
    if (!provider) return;
    setIsSaving(true);
    try {
      await onSave(provider.provider, {
        usePlatformDefault,
        apiKey: usePlatformDefault ? undefined : apiKey,
        additionalConfig: {
          defaultModel: selectedModel || undefined,
        },
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!provider) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Configure {provider.displayName}
          </DialogTitle>
          <DialogDescription>
            Set up your API key for {provider.displayName} or use the platform default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Platform Default Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="platform-default">Use Platform Default</Label>
              <p className="text-xs text-muted-foreground">
                {provider.platformEnabled
                  ? 'Rate limited based on your plan'
                  : 'Platform key not available'}
              </p>
            </div>
            <Switch
              id="platform-default"
              checked={usePlatformDefault}
              onCheckedChange={setUsePlatformDefault}
              disabled={!provider.platformEnabled}
            />
          </div>

          {/* API Key Input */}
          {!usePlatformDefault && (
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider.maskedKey || 'Enter your API key'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your key is encrypted and stored securely. Leave blank to keep existing key.
              </p>
            </div>
          )}

          {/* Model Selection */}
          {provider.models.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="model">Default Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {provider.models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Rate Limit Info */}
          {usePlatformDefault && provider.platformEnabled && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Rate Limits Apply</AlertTitle>
              <AlertDescription>
                Free: {provider.platformRateLimitFree} req/day |
                Pro: {provider.platformRateLimitPro} req/day
              </AlertDescription>
            </Alert>
          )}

          {/* Connection Test Result */}
          {testResult && (
            <div className={`p-4 rounded-lg border ${
              testResult.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <Check className="h-5 w-5 text-green-500 mt-0.5" />
                ) : (
                  <X className="h-5 w-5 text-red-500 mt-0.5" />
                )}
                <div className="flex-1">
                  <h4 className={`text-sm font-medium ${
                    testResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {testResult.success ? 'Connection Verified' : 'Connection Failed'}
                  </h4>
                  <p className={`text-sm ${
                    testResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {testResult.message}
                  </p>
                  {testResult.responseTimeMs && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Response time: {testResult.responseTimeMs}ms
                      {testResult.testedAt && ` | Last tested: ${testResult.testedAt}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || (!provider.hasOwnKey && !provider.usePlatformDefault)}
            className="sm:mr-auto"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Configuration
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
// Component: UsageDashboard
// ===================================================================

interface UsageDashboardProps {
  stats: UsageStats | null;
  quota: UsageStatus | null;
  isLoading: boolean;
}

function UsageDashboard({ stats, quota, isLoading }: UsageDashboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!stats || !quota) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No usage data</AlertTitle>
        <AlertDescription>
          Usage statistics will appear here once you start using AI features.
        </AlertDescription>
      </Alert>
    );
  }

  const formatNumber = (num: number) => num.toLocaleString();
  const formatCurrency = (num: number) => `$${num.toFixed(4)}`;

  return (
    <div className="space-y-6">
      {/* Quota Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Daily Usage</CardTitle>
            <Badge variant={quota.tier === 'free' ? 'secondary' : quota.tier === 'pro' ? 'default' : 'outline'}>
              {quota.tier.charAt(0).toUpperCase() + quota.tier.slice(1)} Plan
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{formatNumber(quota.usageToday)} requests used</span>
              <span>
                {quota.dailyLimit ? `${formatNumber(quota.dailyLimit)} limit` : 'Unlimited'}
              </span>
            </div>
            <Progress value={quota.percentUsed} className="h-2" />
            {quota.remainingRequests !== null && (
              <p className="text-xs text-muted-foreground">
                {formatNumber(quota.remainingRequests)} requests remaining today
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatNumber(stats.summary.totalRequests)}</div>
            <p className="text-xs text-muted-foreground">Total Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatNumber(stats.tokens.total)}</div>
            <p className="text-xs text-muted-foreground">Tokens Used</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.performance.avgDurationMs}ms</div>
            <p className="text-xs text-muted-foreground">Avg Response Time</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.summary.successRate}%</div>
            <p className="text-xs text-muted-foreground">Success Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Estimate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Cost Estimate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatCurrency(stats.cost.estimated)}</div>
          <p className="text-sm text-muted-foreground">
            Based on {formatNumber(stats.tokens.input)} input + {formatNumber(stats.tokens.output)} output tokens
          </p>
        </CardContent>
      </Card>

      {/* Usage by Provider & Feature */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.byProvider).length === 0 ? (
              <p className="text-sm text-muted-foreground">No provider data yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.byProvider).map(([provider, count]) => (
                  <div key={provider} className="flex justify-between">
                    <span className="text-sm capitalize">{provider}</span>
                    <span className="text-sm font-medium">{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Feature</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.byFeature).length === 0 ? (
              <p className="text-sm text-muted-foreground">No feature data yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.byFeature).map(([feature, count]) => (
                  <div key={feature} className="flex justify-between">
                    <span className="text-sm">{feature.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-medium">{formatNumber(count)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===================================================================
// Main Component: AISettingsPage
// ===================================================================

export default function AISettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('providers');
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  // Rate limit banner dismissal state (session only)
  const RATE_LIMIT_BANNER_KEY = 'shopsyncflow_rate_limit_banner_dismissed';
  const [rateLimitBannerDismissed, setRateLimitBannerDismissed] = useState(() => {
    return sessionStorage.getItem(RATE_LIMIT_BANNER_KEY) === 'true';
  });

  const dismissRateLimitBanner = () => {
    setRateLimitBannerDismissed(true);
    sessionStorage.setItem(RATE_LIMIT_BANNER_KEY, 'true');
  };

  // Template management state
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [templateEditorMode, setTemplateEditorMode] = useState<'view' | 'edit' | 'create' | 'customize'>('view');

  // Delete template confirmation state
  const [deleteTemplateDialogOpen, setDeleteTemplateDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<PromptTemplate | null>(null);

  // Fetch AI config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: async () => {
      const res = await fetch('/api/ai/config');
      if (!res.ok) throw new Error('Failed to fetch AI config');
      return res.json();
    },
  });

  // Fetch providers
  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const res = await fetch('/api/ai/providers');
      if (!res.ok) throw new Error('Failed to fetch providers');
      return res.json();
    },
  });

  // Fetch usage stats
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: async () => {
      const res = await fetch('/api/ai/usage?period=month');
      if (!res.ok) throw new Error('Failed to fetch usage');
      return res.json();
    },
  });

  // Fetch quota
  const { data: quotaData, isLoading: quotaLoading } = useQuery({
    queryKey: ['ai-quota'],
    queryFn: async () => {
      const res = await fetch('/api/ai/quota');
      if (!res.ok) throw new Error('Failed to fetch quota');
      return res.json();
    },
  });

  // Save provider config mutation
  const saveProviderMutation = useMutation({
    mutationFn: async ({ provider, data }: { provider: string; data: any }) => {
      const res = await fetch(`/api/ai/providers/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save provider');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast({
        title: 'Provider saved',
        description: 'Your provider configuration has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Test provider mutation
  const testProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch(`/api/ai/providers/${provider}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.result?.error || 'Connection test failed');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast({
        title: 'Connection successful',
        description: `${data.result?.message || 'Provider is working correctly'} (${data.result?.responseTimeMs}ms)`,
      });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast({
        title: 'Connection failed',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setTestingProvider(null);
    },
  });

  const handleConfigureProvider = (provider: AIProvider) => {
    setSelectedProvider(provider);
    setConfigModalOpen(true);
  };

  const handleTestProvider = (provider: string) => {
    setTestingProvider(provider);
    testProviderMutation.mutate(provider);
  };

  // Async version for modal that returns test result
  const handleTestProviderAsync = async (provider: string): Promise<{ success: boolean; message: string; responseTimeMs?: number }> => {
    setTestingProvider(provider);
    try {
      const res = await fetch(`/api/ai/providers/${provider}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });

      if (!res.ok || !data.success) {
        const errorMessage = data.message || data.result?.error || 'Connection test failed';
        return { success: false, message: errorMessage };
      }

      return {
        success: true,
        message: data.result?.message || 'Provider is working correctly',
        responseTimeMs: data.result?.responseTimeMs,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      return { success: false, message };
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveProvider = async (provider: string, data: any) => {
    await saveProviderMutation.mutateAsync({ provider, data });
  };

  const providers = providersData?.providers || [];
  const config = configData?.config as AIConfig | undefined;
  const usage = configData?.usage as UsageStatus | undefined;

  // Template handling functions
  const handleSelectTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setTemplateEditorMode(template.source === 'platform' ? 'view' : 'edit');
    setTemplateEditorOpen(true);
  };

  const handleCreateTemplate = () => {
    setSelectedTemplate(null);
    setTemplateEditorMode('create');
    setTemplateEditorOpen(true);
  };

  const handleCustomizeTemplate = (template: PromptTemplate) => {
    setSelectedTemplate(template);
    setTemplateEditorMode('customize');
    setTemplateEditorOpen(true);
  };

  const handleDeleteTemplate = (template: PromptTemplate) => {
    setTemplateToDelete(template);
    setDeleteTemplateDialogOpen(true);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      const res = await fetch(`/api/ai/templates/${templateToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete template');
      queryClient.invalidateQueries({ queryKey: ['/api/ai/templates'] });
      toast({
        title: 'Template deleted',
        description: `"${templateToDelete.name}" has been removed.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Delete failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDeleteTemplateDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const handleCloseTemplateEditor = () => {
    setTemplateEditorOpen(false);
    setSelectedTemplate(null);
  };

  return (
    <MainLayout title="AI Settings" subtitle="Configure AI providers, manage templates, and monitor usage.">
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6" />
              AI Settings
            </h1>
            <p className="text-muted-foreground">
              Configure AI providers, manage templates, and monitor usage.
            </p>
          </div>
          {config && (
            <Badge
              variant={config.tier === 'free' ? 'secondary' : config.tier === 'pro' ? 'default' : 'outline'}
              className="text-sm"
            >
              <Shield className="h-3 w-3 mr-1" />
              {config.tier.charAt(0).toUpperCase() + config.tier.slice(1)} Plan
            </Badge>
          )}
        </div>

        {/* Daily Usage Sidebar */}
        {usage && usage.dailyLimit && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium">
                      {usage.usageToday} / {usage.dailyLimit} requests today
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {usage.remainingRequests} remaining
                    </p>
                  </div>
                </div>
                <Progress value={usage.percentUsed} className="w-32 h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="usage" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Usage & Billing
            </TabsTrigger>
          </TabsList>

          {/* Providers Tab */}
          <TabsContent value="providers" className="mt-6">
            {/* Rate Limit Warning Banner */}
            {usage && usage.percentUsed >= 80 && config?.tier !== 'enterprise' && !rateLimitBannerDismissed && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl" role="alert">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-amber-800">Rate Limit Warning</h3>
                    <p className="mt-1 text-sm text-amber-700">
                      You've used {usage.percentUsed}% of your daily API requests. Consider upgrading to Pro or adding your own API key for unlimited access.
                    </p>
                  </div>
                  <button
                    onClick={dismissRateLimitBanner}
                    className="ml-4 text-amber-500 hover:text-amber-700"
                    aria-label="Dismiss warning"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {providersLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {providers.map((provider: AIProvider) => (
                  <ProviderCard
                    key={provider.provider}
                    provider={provider}
                    onConfigure={handleConfigureProvider}
                    onTest={handleTestProvider}
                    isTesting={testingProvider === provider.provider}
                  />
                ))}
              </div>
            )}

            {/* Feature-Specific AI Settings */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4">Feature-Specific AI Settings</h2>
              <FeatureSettingsTable
                onEditTemplate={(_featureId) => {
                  // TODO: Navigate to template editor for this feature
                  setActiveTab('templates');
                }}
                onCustomize={(_featureId) => {
                  // TODO: Open customization modal for this feature
                  setActiveTab('templates');
                }}
              />
            </div>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="mt-6">
            <TemplateGallery
              onSelectTemplate={handleSelectTemplate}
              onCreateNew={handleCreateTemplate}
              onCustomize={handleCustomizeTemplate}
              onDelete={handleDeleteTemplate}
            />
          </TabsContent>

          {/* Usage & Billing Tab */}
          <TabsContent value="usage" className="mt-6">
            <UsageDashboard
              stats={usageData?.usage || null}
              quota={quotaData?.quota || null}
              isLoading={usageLoading || quotaLoading}
            />
          </TabsContent>
        </Tabs>

        {/* Provider Config Modal */}
        <ProviderConfigModal
          provider={selectedProvider}
          isOpen={configModalOpen}
          onClose={() => {
            setConfigModalOpen(false);
            setSelectedProvider(null);
          }}
          onSave={handleSaveProvider}
          onTest={handleTestProviderAsync}
          isTesting={testingProvider === selectedProvider?.provider}
        />

        {/* Template Editor Modal */}
        <TemplateEditorModal
          template={selectedTemplate}
          isOpen={templateEditorOpen}
          onClose={handleCloseTemplateEditor}
          mode={templateEditorMode}
        />

        {/* Delete Template Confirmation Dialog */}
        <AlertDialog open={deleteTemplateDialogOpen} onOpenChange={setDeleteTemplateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteTemplate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
