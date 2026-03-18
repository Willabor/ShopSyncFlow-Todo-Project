/**
 * Template Gallery Component (T22)
 *
 * Displays a browsable gallery of prompt templates with search and filters.
 * Shows both platform templates (read-only) and tenant templates (editable).
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  FileText,
  Edit2,
  Copy,
  Trash2,
  Lock,
  Sparkles,
  Tag
} from "lucide-react";

export interface TemplateVariable {
  name: string;
  type: "text" | "textarea" | "number" | "select" | "boolean";
  required: boolean;
  default?: string;
  description?: string;
  options?: string[];
}

export interface PromptTemplate {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category: string;
  templateContent: string;
  systemPrompt?: string;
  variables?: TemplateVariable[];
  defaultModel?: string;
  defaultTemperature?: string;
  maxTokens?: number;
  outputFormat?: "text" | "json" | "markdown" | "html";
  isActive: boolean;
  version?: string;
  usageCount?: number;
  source: "platform" | "tenant";
  parentTemplateId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TemplateGalleryProps {
  onSelectTemplate: (template: PromptTemplate) => void;
  onCreateNew: () => void;
  onCustomize: (template: PromptTemplate) => void;
  onDelete: (template: PromptTemplate) => void;
}

// Category metadata
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  content: { label: "Content", color: "bg-blue-100 text-blue-800" },
  seo: { label: "SEO", color: "bg-green-100 text-green-800" },
  extraction: { label: "Extraction", color: "bg-purple-100 text-purple-800" },
  analysis: { label: "Analysis", color: "bg-orange-100 text-orange-800" },
  other: { label: "Other", color: "bg-gray-100 text-gray-800" }
};

function TemplateCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TemplateGallery({
  onSelectTemplate,
  onCreateNew,
  onCustomize,
  onDelete
}: TemplateGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ["/api/ai/templates", { category: categoryFilter !== "all" ? categoryFilter : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/ai/templates?${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    }
  });

  // Fetch categories for filter
  const { data: categoriesData } = useQuery({
    queryKey: ["/api/ai/templates/categories"],
    queryFn: async () => {
      const res = await fetch("/api/ai/templates/categories");
      if (!res.ok) return { categories: [] };
      return res.json();
    }
  });

  const templates: PromptTemplate[] = templatesData?.templates || [];
  const categories: string[] = categoriesData?.categories || [];

  // Filter templates based on search and source
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          template.name.toLowerCase().includes(query) ||
          template.slug.toLowerCase().includes(query) ||
          template.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Source filter
      if (sourceFilter !== "all" && template.source !== sourceFilter) {
        return false;
      }

      return true;
    });
  }, [templates, searchQuery, sourceFilter]);

  // Separate into platform and tenant templates
  const platformTemplates = filteredTemplates.filter((t) => t.source === "platform");
  const tenantTemplates = filteredTemplates.filter((t) => t.source === "tenant");

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search templates"
          />
        </div>
        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_META[cat]?.label || cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by source">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="platform">Platform</SelectItem>
              <SelectItem value="tenant">My Templates</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredTemplates.length === 0 && (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No templates found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery
              ? "Try adjusting your search or filters"
              : "Get started by creating your first template"}
          </p>
          <Button onClick={onCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </Card>
      )}

      {/* Platform Templates Section */}
      {!isLoading && platformTemplates.length > 0 && (sourceFilter === "all" || sourceFilter === "platform") && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Platform Templates</h3>
            <Badge variant="secondary" className="ml-2">
              {platformTemplates.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platformTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => onSelectTemplate(template)}
                onCustomize={() => onCustomize(template)}
                isPlatform
              />
            ))}
          </div>
        </div>
      )}

      {/* Tenant Templates Section */}
      {!isLoading && (sourceFilter === "all" || sourceFilter === "tenant") && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold">My Templates</h3>
              {tenantTemplates.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {tenantTemplates.length}
                </Badge>
              )}
            </div>
            <Button size="sm" onClick={onCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Create New
            </Button>
          </div>
          {tenantTemplates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tenantTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => onSelectTemplate(template)}
                  onEdit={() => onSelectTemplate(template)}
                  onDelete={() => onDelete(template)}
                />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center border-dashed">
              <p className="text-muted-foreground mb-4">
                You haven't created any custom templates yet.
                <br />
                Customize a platform template or create your own.
              </p>
              <Button variant="outline" onClick={onCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// Individual template card component
interface TemplateCardProps {
  template: PromptTemplate;
  onSelect: () => void;
  onCustomize?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isPlatform?: boolean;
}

function TemplateCard({
  template,
  onSelect,
  onCustomize,
  onEdit,
  onDelete,
  isPlatform
}: TemplateCardProps) {
  const categoryMeta = CATEGORY_META[template.category] || CATEGORY_META.other;

  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all focus-within:ring-2 focus-within:ring-ring"
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h4 className="font-medium text-foreground line-clamp-1" title={template.name}>
            {template.name}
          </h4>
          <Badge className={categoryMeta.color} variant="secondary">
            {categoryMeta.label}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[40px]">
          {template.description || "No description"}
        </p>

        {/* Metadata */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {/* Variable Tags */}
          {template.variables && template.variables.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {template.variables.slice(0, 2).map((v) => (
                <span key={v.name} className="variable-tag">
                  {v.name}
                </span>
              ))}
              {template.variables.length > 2 && (
                <span className="text-xs text-muted-foreground">
                  +{template.variables.length - 2}
                </span>
              )}
            </div>
          )}
          {template.version && (
            <Badge variant="outline" className="text-xs">
              v{template.version}
            </Badge>
          )}
          {template.usageCount !== undefined && template.usageCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {template.usageCount} uses
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            {isPlatform ? "View" : "Edit"}
          </Button>
          {isPlatform && onCustomize && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onCustomize();
              }}
              title="Create a custom version"
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {!isPlatform && onDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              title="Delete template"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TemplateGallery;
