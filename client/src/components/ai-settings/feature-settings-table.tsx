/**
 * Feature Settings Table Component
 *
 * Displays AI settings for each feature (Product Description, Bullet Points, Size Chart Analysis)
 * with provider and template assignment information.
 */

import { LucideIcon, FileText, List, Ruler, Check, Pencil, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ===================================================================
// Types
// ===================================================================

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  provider: string;
  template: 'custom' | 'platform';
  isActive: boolean;
}

export interface FeatureSettingsTableProps {
  onEditTemplate?: (featureId: string) => void;
  onCustomize?: (featureId: string) => void;
}

// ===================================================================
// Mock Data (until API is wired)
// ===================================================================

const AI_FEATURES: FeatureConfig[] = [
  {
    id: 'product_description',
    name: 'Product Description',
    description: 'SEO-optimized descriptions',
    icon: FileText,
    provider: 'gemini',
    template: 'custom',
    isActive: true,
  },
  {
    id: 'bullet_points',
    name: 'Bullet Points',
    description: 'Sales points for listings',
    icon: List,
    provider: 'gemini',
    template: 'platform',
    isActive: true,
  },
  {
    id: 'size_chart',
    name: 'Size Chart Analysis',
    description: 'Extract from images',
    icon: Ruler,
    provider: 'gemini',
    template: 'platform',
    isActive: true,
  },
];

// ===================================================================
// Helper Components
// ===================================================================

function ProviderBadge({ provider }: { provider: string }) {
  const providerStyles: Record<string, string> = {
    gemini: 'bg-blue-100 text-blue-800 border-blue-200',
    openai: 'bg-green-100 text-green-800 border-green-200',
    anthropic: 'bg-orange-100 text-orange-800 border-orange-200',
    mistral: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const providerNames: Record<string, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    mistral: 'Mistral',
  };

  return (
    <Badge
      variant="outline"
      className={providerStyles[provider] || 'bg-gray-100 text-gray-800 border-gray-200'}
    >
      {providerNames[provider] || provider}
    </Badge>
  );
}

function TemplateBadge({ template }: { template: 'custom' | 'platform' }) {
  if (template === 'custom') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">
        Custom
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-gray-100 text-gray-600">
      Platform Default
    </Badge>
  );
}

function StatusIndicator({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <div className="flex items-center gap-1.5 text-green-600">
        <Check className="h-4 w-4" />
        <span className="text-sm font-medium">Active</span>
      </div>
    );
  }
  return (
    <span className="text-sm text-muted-foreground">Inactive</span>
  );
}

// ===================================================================
// Main Component
// ===================================================================

export function FeatureSettingsTable({
  onEditTemplate,
  onCustomize
}: FeatureSettingsTableProps) {
  return (
    <div className="bg-white rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Feature
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Provider
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Template
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Status
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {AI_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <TableRow
                key={feature.id}
                className="hover:bg-muted/50 transition-colors"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{feature.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {feature.description}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <ProviderBadge provider={feature.provider} />
                </TableCell>
                <TableCell>
                  <TemplateBadge template={feature.template} />
                </TableCell>
                <TableCell>
                  <StatusIndicator isActive={feature.isActive} />
                </TableCell>
                <TableCell className="text-right">
                  {feature.template === 'custom' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditTemplate?.(feature.id)}
                      className="gap-1.5"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit Template
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCustomize?.(feature.id)}
                      className="gap-1.5"
                    >
                      <Settings2 className="h-4 w-4" />
                      Customize
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
