/**
 * Provider Cards Component (T20)
 *
 * Displays a grid of AI provider cards with status indicators.
 * Shows connection status, whether using platform default or BYOK.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings2,
  Sparkles
} from "lucide-react";

// Provider metadata with display names and colors
const PROVIDER_META: Record<string, { displayName: string; color: string; gradient?: string; description: string }> = {
  gemini: {
    displayName: "Google Gemini",
    color: "bg-blue-500",
    gradient: "bg-gradient-to-br from-blue-500 to-purple-600",
    description: "Google's multimodal AI model"
  },
  openai: {
    displayName: "OpenAI",
    color: "bg-gray-900",
    description: "GPT-4 and ChatGPT models"
  },
  anthropic: {
    displayName: "Anthropic",
    color: "bg-amber-500",
    description: "Claude AI assistant"
  },
  mistral: {
    displayName: "Mistral AI",
    color: "bg-orange-500",
    description: "Open-weight AI models"
  },
  cohere: {
    displayName: "Cohere",
    color: "bg-pink-500",
    description: "Enterprise AI platform"
  },
  bedrock: {
    displayName: "AWS Bedrock",
    color: "bg-yellow-600",
    description: "AWS managed AI service"
  },
  azure_openai: {
    displayName: "Azure OpenAI",
    color: "bg-cyan-600",
    description: "Microsoft Azure hosted OpenAI"
  }
};

// SVG Icon components for providers
function GeminiIcon() {
  return (
    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729z"/>
    </svg>
  );
}

function LetterIcon({ letter }: { letter: string }) {
  return (
    <span className="text-white font-bold text-lg" aria-hidden="true">
      {letter}
    </span>
  );
}

// Provider icon component that renders the appropriate icon based on provider
function ProviderIcon({ provider, displayName }: { provider: string; displayName: string }) {
  switch (provider) {
    case "gemini":
      return <GeminiIcon />;
    case "openai":
      return <OpenAIIcon />;
    case "anthropic":
      return <LetterIcon letter="A" />;
    case "mistral":
      return <LetterIcon letter="M" />;
    default:
      return <LetterIcon letter={displayName.charAt(0)} />;
  }
}

export interface ProviderConfig {
  provider: string;
  isEnabled: boolean;
  usePlatformDefault: boolean;
  hasKey: boolean;
  lastTestedAt?: string;
  lastTestStatus?: string;
  lastTestError?: string;
  isDefault?: boolean;
}

interface ProviderCardsProps {
  providers: ProviderConfig[];
  isLoading?: boolean;
  onConfigureProvider: (provider: string) => void;
  defaultProvider?: string;
}

type ConnectionStatus = "connected" | "not_configured" | "error" | "platform_default";

function getConnectionStatus(config: ProviderConfig): ConnectionStatus {
  if (config.usePlatformDefault && config.isEnabled) {
    return "platform_default";
  }
  if (!config.hasKey && !config.usePlatformDefault) {
    return "not_configured";
  }
  if (config.lastTestStatus === "error") {
    return "error";
  }
  if (config.isEnabled && (config.hasKey || config.usePlatformDefault)) {
    return "connected";
  }
  return "not_configured";
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  switch (status) {
    case "connected":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 status-dot" aria-hidden="true" />
          <CheckCircle className="w-3 h-3 mr-1" />
          Connected
        </Badge>
      );
    case "platform_default":
      return (
        <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
          <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5 status-dot" aria-hidden="true" />
          <Sparkles className="w-3 h-3 mr-1" />
          Platform Key
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    case "not_configured":
    default:
      return (
        <Badge variant="secondary">
          <AlertCircle className="w-3 h-3 mr-1" />
          Not Configured
        </Badge>
      );
  }
}

function ProviderCardSkeleton() {
  return (
    <Card className="relative">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div>
              <Skeleton className="h-5 w-32 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ProviderCards({
  providers,
  isLoading,
  onConfigureProvider,
  defaultProvider
}: ProviderCardsProps) {
  // Get all provider keys to display (even unconfigured ones)
  const allProviders = Object.keys(PROVIDER_META);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <ProviderCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Create a map of configured providers
  const configuredMap = new Map(providers.map(p => [p.provider, p]));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {allProviders.map((providerKey) => {
        const meta = PROVIDER_META[providerKey];
        const config = configuredMap.get(providerKey);
        const isConfigured = !!config;
        const status = config ? getConnectionStatus(config) : "not_configured";
        const isDefault = config?.isDefault || defaultProvider === providerKey;

        return (
          <Card
            key={providerKey}
            className={`relative cursor-pointer transition-all hover:shadow-md hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
              isDefault ? "border-primary border-2" : ""
            }`}
          >
            <button
              onClick={() => onConfigureProvider(providerKey)}
              className="w-full text-left focus:outline-none"
              aria-pressed={isDefault}
              aria-label={`Configure ${meta.displayName}. Status: ${status.replace("_", " ")}${isDefault ? ". Default provider" : ""}`}
            >
              <CardContent className="p-6">
                {/* Default indicator */}
                {isDefault && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="outline" className="text-xs border-primary text-primary">
                      Default
                    </Badge>
                  </div>
                )}

                {/* Provider header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${meta.gradient || meta.color} rounded-lg flex items-center justify-center`}>
                      <ProviderIcon provider={providerKey} displayName={meta.displayName} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{meta.displayName}</h3>
                      <p className="text-sm text-muted-foreground">{meta.description}</p>
                    </div>
                  </div>
                </div>

                {/* Status and action */}
                <div className="flex items-center justify-between">
                  <StatusBadge status={status} />
                  <span className="text-sm text-primary flex items-center gap-1">
                    <Settings2 className="w-4 h-4" />
                    Configure
                  </span>
                </div>

                {/* Error message if any */}
                {config?.lastTestError && status === "error" && (
                  <p className="mt-3 text-xs text-destructive truncate" title={config.lastTestError}>
                    {config.lastTestError}
                  </p>
                )}
              </CardContent>
            </button>
          </Card>
        );
      })}
    </div>
  );
}

export default ProviderCards;
