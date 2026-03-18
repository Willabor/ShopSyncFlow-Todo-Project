/**
 * Template Editor Modal (T23)
 *
 * Full-featured prompt template editor with live preview,
 * variable insertion, and AI settings configuration.
 */

import { useState, useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Variable,
  Play,
  Save,
  Copy,
  History,
  ChevronRight,
  Plus,
  X,
  AlertCircle
} from "lucide-react";
import type { PromptTemplate, TemplateVariable } from "./template-gallery";

interface TemplateEditorModalProps {
  template: PromptTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  mode: "view" | "edit" | "create" | "customize";
}

// Category options
const CATEGORIES = [
  { value: "content", label: "Content Generation" },
  { value: "seo", label: "SEO Optimization" },
  { value: "extraction", label: "Data Extraction" },
  { value: "analysis", label: "Analysis" },
  { value: "other", label: "Other" }
];

// Output format options
const OUTPUT_FORMATS = [
  { value: "text", label: "Plain Text" },
  { value: "json", label: "JSON" },
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" }
];

// Variable type options
const VARIABLE_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "boolean", label: "Boolean" }
];

export function TemplateEditorModal({
  template,
  isOpen,
  onClose,
  mode
}: TemplateEditorModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("content");
  const [templateContent, setTemplateContent] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [outputFormat, setOutputFormat] = useState<"text" | "json" | "markdown" | "html">("text");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);

  // Preview state
  const [sampleData, setSampleData] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState("");

  // Reset form when template changes
  useEffect(() => {
    if (isOpen) {
      if (template && (mode === "edit" || mode === "view")) {
        setName(template.name);
        setSlug(template.slug);
        setDescription(template.description || "");
        setCategory(template.category);
        setTemplateContent(template.templateContent);
        setSystemPrompt(template.systemPrompt || "");
        setVariables(template.variables || []);
        setOutputFormat(template.outputFormat || "text");
        setTemperature(parseFloat(template.defaultTemperature || "0.7"));
        setMaxTokens(template.maxTokens || 2000);
        // Initialize sample data from variable defaults
        const initialSampleData: Record<string, string> = {};
        template.variables?.forEach((v) => {
          initialSampleData[v.name] = v.default || "";
        });
        setSampleData(initialSampleData);
      } else if (mode === "customize" && template) {
        // Customizing a platform template - copy with new name
        setName(`${template.name} (Custom)`);
        setSlug(`${template.slug}-custom`);
        setDescription(template.description || "");
        setCategory(template.category);
        setTemplateContent(template.templateContent);
        setSystemPrompt(template.systemPrompt || "");
        setVariables(template.variables || []);
        setOutputFormat(template.outputFormat || "text");
        setTemperature(parseFloat(template.defaultTemperature || "0.7"));
        setMaxTokens(template.maxTokens || 2000);
        const initialSampleData: Record<string, string> = {};
        template.variables?.forEach((v) => {
          initialSampleData[v.name] = v.default || "";
        });
        setSampleData(initialSampleData);
      } else {
        // Create new template
        setName("");
        setSlug("");
        setDescription("");
        setCategory("content");
        setTemplateContent("");
        setSystemPrompt("");
        setVariables([]);
        setOutputFormat("text");
        setTemperature(0.7);
        setMaxTokens(2000);
        setSampleData({});
      }
      setPreviewResult("");
    }
  }, [isOpen, template, mode]);

  // Auto-generate slug from name
  useEffect(() => {
    if (mode === "create" || mode === "customize") {
      const generatedSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setSlug(generatedSlug);
    }
  }, [name, mode]);

  // Extract variables from template content
  const extractedVariables = useMemo(() => {
    const regex = /\{\{([^}|]+)(?:\|[^}]*)?\}\}/g;
    const matches = templateContent.matchAll(regex);
    const varNames = new Set<string>();
    for (const match of matches) {
      varNames.add(match[1].trim());
    }
    return Array.from(varNames);
  }, [templateContent]);

  // Calculate token estimate (rough approximation)
  const tokenEstimate = useMemo(() => {
    const content = templateContent + (systemPrompt || "");
    return Math.ceil(content.length / 4);
  }, [templateContent, systemPrompt]);

  // Generate preview with sample data
  const generatePreview = () => {
    let preview = templateContent;
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}(?:\\|[^}]*)?\\}\\}`, "g");
      preview = preview.replace(regex, value || `[${key}]`);
    });
    // Replace any remaining variables with placeholders
    preview = preview.replace(/\{\{([^}|]+)(?:\|[^}]*)?\}\}/g, "[$1]");
    setPreviewResult(preview);
  };

  // Add a new variable
  const addVariable = () => {
    setVariables([
      ...variables,
      {
        name: "",
        type: "text",
        required: false,
        default: "",
        description: ""
      }
    ]);
  };

  // Update a variable
  const updateVariable = (index: number, updates: Partial<TemplateVariable>) => {
    const newVariables = [...variables];
    newVariables[index] = { ...newVariables[index], ...updates };
    setVariables(newVariables);
  };

  // Remove a variable
  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  // Insert variable at cursor
  const insertVariable = (varName: string) => {
    const textArea = document.getElementById("template-content") as HTMLTextAreaElement;
    if (textArea) {
      const start = textArea.selectionStart;
      const end = textArea.selectionEnd;
      const newContent =
        templateContent.substring(0, start) +
        `{{${varName}}}` +
        templateContent.substring(end);
      setTemplateContent(newContent);
      // Restore cursor position
      setTimeout(() => {
        textArea.focus();
        textArea.setSelectionRange(start + varName.length + 4, start + varName.length + 4);
      }, 0);
    }
  };

  // Save template mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        slug,
        description,
        category,
        templateContent,
        systemPrompt: systemPrompt || undefined,
        variables: variables.length > 0 ? variables : undefined,
        outputFormat,
        defaultTemperature: temperature.toString(),
        maxTokens,
        parentTemplateId: mode === "customize" ? template?.id : undefined
      };

      const url =
        mode === "edit" && template
          ? `/api/ai/templates/${template.id}`
          : "/api/ai/templates";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save template");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/templates"] });
      toast({
        title: mode === "edit" ? "Template updated" : "Template created",
        description: `"${name}" has been saved successfully.`
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Test template mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/templates/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateContent,
          systemPrompt,
          variables: sampleData
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Test failed");
      return data;
    },
    onSuccess: (data) => {
      setPreviewResult(data.result || data.output || "Test completed successfully");
    },
    onError: (error: Error) => {
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const isReadOnly = mode === "view";
  const isSaving = saveMutation.isPending;
  const isTesting = testMutation.isPending;

  const dialogTitle = {
    view: `View Template: ${template?.name || ""}`,
    edit: `Edit Template: ${template?.name || ""}`,
    create: "Create New Template",
    customize: `Customize: ${template?.name || ""}`
  }[mode];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {mode === "view"
              ? "View template details and test with sample data."
              : mode === "customize"
              ? "Create a customized version of this platform template."
              : "Configure your prompt template with variables and AI settings."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="editor" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="variables">Variables ({variables.length})</TabsTrigger>
            <TabsTrigger value="settings">AI Settings</TabsTrigger>
          </TabsList>

          {/* Editor Tab */}
          <TabsContent value="editor" className="flex-1 overflow-auto space-y-4 p-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Product Description Generator"
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-slug">Slug</Label>
                <Input
                  id="template-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="product-description"
                  disabled={isReadOnly || mode === "edit"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-category">Category</Label>
                <Select
                  value={category}
                  onValueChange={setCategory}
                  disabled={isReadOnly}
                >
                  <SelectTrigger id="template-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Generates product descriptions..."
                  disabled={isReadOnly}
                />
              </div>
            </div>

            {/* Variable insertion toolbar */}
            {!isReadOnly && extractedVariables.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Insert:</span>
                {extractedVariables.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => insertVariable(v)}
                  >
                    <Variable className="w-3 h-3 mr-1" />
                    {v}
                  </Badge>
                ))}
              </div>
            )}

            {/* Split pane: Editor | Preview */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="template-content">Template Content</Label>
                  <span className="text-xs text-muted-foreground">
                    ~{tokenEstimate} tokens
                  </span>
                </div>
                <Textarea
                  id="template-content"
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  placeholder="Write a compelling product description for {{product_name}}..."
                  className="font-mono text-sm min-h-[200px]"
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Preview</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={generatePreview}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                </div>
                <div className="border rounded-md p-3 min-h-[200px] bg-muted/50 text-sm whitespace-pre-wrap">
                  {previewResult || (
                    <span className="text-muted-foreground italic">
                      Click Preview to see the rendered template
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sample data inputs */}
            {extractedVariables.length > 0 && (
              <div className="space-y-2">
                <Label>Sample Data</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {extractedVariables.map((v) => (
                    <Input
                      key={v}
                      placeholder={v}
                      value={sampleData[v] || ""}
                      onChange={(e) =>
                        setSampleData((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="system-prompt">System Prompt (Optional)</Label>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are an expert e-commerce copywriter..."
                className="font-mono text-sm min-h-[80px]"
                disabled={isReadOnly}
              />
            </div>
          </TabsContent>

          {/* Variables Tab */}
          <TabsContent value="variables" className="flex-1 overflow-auto space-y-4 p-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Define variables that users can fill in when using this template.
              </p>
              {!isReadOnly && (
                <Button size="sm" onClick={addVariable}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Variable
                </Button>
              )}
            </div>

            {variables.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Variable className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No variables defined yet.</p>
                <p className="text-sm">
                  Variables are automatically detected from {"{{variable}}"} syntax.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {variables.map((variable, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Variable {index + 1}</Badge>
                      {!isReadOnly && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeVariable(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Name</Label>
                        <Input
                          value={variable.name}
                          onChange={(e) =>
                            updateVariable(index, { name: e.target.value })
                          }
                          placeholder="product_name"
                          disabled={isReadOnly}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Type</Label>
                        <Select
                          value={variable.type}
                          onValueChange={(v) =>
                            updateVariable(index, { type: v as any })
                          }
                          disabled={isReadOnly}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VARIABLE_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Default Value</Label>
                        <Input
                          value={variable.default || ""}
                          onChange={(e) =>
                            updateVariable(index, { default: e.target.value })
                          }
                          placeholder="Optional default"
                          disabled={isReadOnly}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Description</Label>
                        <Input
                          value={variable.description || ""}
                          onChange={(e) =>
                            updateVariable(index, { description: e.target.value })
                          }
                          placeholder="Help text"
                          disabled={isReadOnly}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="flex-1 overflow-auto space-y-4 p-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="output-format">Output Format</Label>
                <Select
                  value={outputFormat}
                  onValueChange={(v) => setOutputFormat(v as any)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger id="output-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-tokens">Max Tokens: {maxTokens}</Label>
                <Slider
                  id="max-tokens"
                  value={[maxTokens]}
                  onValueChange={([v]) => setMaxTokens(v)}
                  min={100}
                  max={8000}
                  step={100}
                  disabled={isReadOnly}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature: {temperature.toFixed(1)}</Label>
              <Slider
                id="temperature"
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={2}
                step={0.1}
                disabled={isReadOnly}
              />
              <p className="text-xs text-muted-foreground">
                Lower values = more deterministic, higher = more creative
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          {!isReadOnly && (
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={isTesting || !templateContent}
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Test
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {isReadOnly ? "Close" : "Cancel"}
          </Button>
          {!isReadOnly && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={isSaving || !name || !slug || !templateContent}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {mode === "edit" ? "Update" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TemplateEditorModal;
