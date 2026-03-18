import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProductVariant } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { BulkEditHeader } from "@/components/variants/BulkEditHeader";
import { BulkEditToolbar } from "@/components/variants/BulkEditToolbar";
import { BulkEditTable } from "@/components/variants/BulkEditTable";
import { BulkEditDialog } from "@/components/variants/BulkEditDialog";
import { BulkDeleteDialog } from "@/components/variants/BulkDeleteDialog";
import { ExportDialog } from "@/components/variants/ExportDialog";
import { ImportDialog } from "@/components/variants/ImportDialog";

interface Change {
  variantId: string;
  field: keyof ProductVariant;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

interface ColumnConfig {
  visible: Set<string>;
  order: string[];
  widths: Record<string, number>;
}

const DEFAULT_COLUMN_CONFIG: ColumnConfig = {
  visible: new Set(["variant", "price", "sku", "inventoryQuantity", "inventoryPolicy"]),
  order: ["variant", "price", "compareAtPrice", "cost", "sku", "barcode", "inventoryQuantity", "inventoryPolicy", "weight", "requiresShipping"],
  widths: {
    variant: 200,
    price: 100,
    compareAtPrice: 120,
    cost: 100,
    sku: 120,
    barcode: 120,
    inventoryQuantity: 100,
    inventoryPolicy: 150,
    weight: 100,
    requiresShipping: 130,
  },
};

export default function BulkEditPage() {
  const [, params] = useRoute("/products/:id/bulk-edit");
  const [, setLocation] = useLocation();
  const productId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [columnConfig, setColumnConfig] = useState<ColumnConfig>(() => {
    // Try to load from localStorage
    const saved = localStorage.getItem(`bulk-edit-columns-${productId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          visible: new Set(parsed.visible),
        };
      } catch {
        return DEFAULT_COLUMN_CONFIG;
      }
    }
    return DEFAULT_COLUMN_CONFIG;
  });
  const [undoStack, setUndoStack] = useState<Change[]>([]);
  const [redoStack, setRedoStack] = useState<Change[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Fetch product and variants
  const { data: product, isLoading: productLoading, error: productError } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch product");
      return res.json();
    },
    enabled: !!productId,
  });

  const { data: variants = [], isLoading: variantsLoading, error: variantsError } = useQuery<ProductVariant[]>({
    queryKey: ["variants", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch variants");
      return res.json();
    },
    enabled: !!productId,
  });

  // Filter variants by search query
  const filteredVariants = useMemo(() => {
    if (!searchQuery) return variants;

    const query = searchQuery.toLowerCase();
    return variants.filter((variant) => {
      const title = [variant.option1, variant.option2, variant.option3]
        .filter(Boolean)
        .join(" / ")
        .toLowerCase();
      const sku = variant.sku?.toLowerCase() || "";
      const barcode = variant.barcode?.toLowerCase() || "";

      return title.includes(query) || sku.includes(query) || barcode.includes(query);
    });
  }, [variants, searchQuery]);

  // Persist column config to localStorage
  useEffect(() => {
    localStorage.setItem(
      `bulk-edit-columns-${productId}`,
      JSON.stringify({
        ...columnConfig,
        visible: Array.from(columnConfig.visible),
      })
    );
  }, [columnConfig, productId]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+Z / Ctrl+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Cmd+Shift+Z / Ctrl+Shift+Z - Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoStack, redoStack]);

  // Handlers
  function handleBack() {
    setLocation(`/products/${productId}/edit`);
  }

  function handleCellEdit(variantId: string, field: keyof ProductVariant, newValue: any) {
    // Find the variant
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;

    const oldValue = variant[field];

    // Add to undo stack
    setUndoStack((prev) => [
      ...prev,
      {
        variantId,
        field,
        oldValue,
        newValue,
        timestamp: new Date(),
      },
    ]);

    // Clear redo stack (new branch)
    setRedoStack([]);

    // Note: Actual mutation is handled in EditableCell component
    // This just tracks the change for undo/redo
  }

  async function handleUndo() {
    if (undoStack.length === 0) return;

    const lastChange = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, lastChange]);

    // Apply reverse change via mutation
    try {
      const res = await fetch(`/api/products/${productId}/variants/${lastChange.variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [lastChange.field]: lastChange.oldValue }),
      });

      if (!res.ok) {
        throw new Error("Failed to undo change");
      }

      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Change undone" });
    } catch (error) {
      toast({
        title: "Failed to undo",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      // Revert stack changes on error
      setUndoStack((prev) => [...prev, lastChange]);
      setRedoStack((prev) => prev.slice(0, -1));
    }
  }

  async function handleRedo() {
    if (redoStack.length === 0) return;

    const lastChange = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, lastChange]);

    // Apply change via mutation
    try {
      const res = await fetch(`/api/products/${productId}/variants/${lastChange.variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [lastChange.field]: lastChange.newValue }),
      });

      if (!res.ok) {
        throw new Error("Failed to redo change");
      }

      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({ title: "Change redone" });
    } catch (error) {
      toast({
        title: "Failed to redo",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      // Revert stack changes on error
      setRedoStack((prev) => [...prev, lastChange]);
      setUndoStack((prev) => prev.slice(0, -1));
    }
  }

  function handleSelectAll() {
    if (selectedVariantIds.size === filteredVariants.length) {
      setSelectedVariantIds(new Set());
    } else {
      setSelectedVariantIds(new Set(filteredVariants.map((v) => v.id)));
    }
  }

  function handleSelectVariant(id: string) {
    setSelectedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleBulkEdit() {
    setShowBulkEditDialog(true);
  }

  function handleBulkDelete() {
    setShowBulkDeleteDialog(true);
  }

  function handleImport() {
    setShowImportDialog(true);
  }

  function handleExport() {
    setShowExportDialog(true);
  }

  function handleSave() {
    // Auto-save is handled on cell blur
    // This manual save is for future batch updates
  }

  // Loading state
  if (productLoading || variantsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading variants...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (productError || variantsError || !product || !productId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-lg font-semibold">Product not found</p>
          <p className="text-sm text-muted-foreground mt-2">
            The product you're looking for doesn't exist.
          </p>
          {(productError || variantsError) && (
            <p className="text-xs text-red-600 mt-2">
              {productError?.message || variantsError?.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <BulkEditHeader
        productId={productId}
        productTitle={product.title}
        saveStatus={saveStatus}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onBack={handleBack}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onImport={handleImport}
        onExport={handleExport}
        onSave={handleSave}
      />

      <BulkEditToolbar
        totalVariants={variants.length}
        selectedCount={selectedVariantIds.size}
        columnConfig={columnConfig}
        onBulkEdit={handleBulkEdit}
        onBulkDelete={handleBulkDelete}
        onColumnConfigChange={setColumnConfig}
        onSearchChange={setSearchQuery}
      />

      <div className="flex-1 overflow-hidden">
        <BulkEditTable
          variants={filteredVariants}
          productId={productId}
          columnConfig={columnConfig}
          selectedVariantIds={selectedVariantIds}
          editingCell={editingCell}
          onSelectVariant={handleSelectVariant}
          onSelectAll={handleSelectAll}
          onCellEdit={handleCellEdit}
          onCellFocus={(rowId, columnId) => setEditingCell({ rowId, columnId })}
          onSaveStatusChange={setSaveStatus}
        />
      </div>

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        isOpen={showBulkEditDialog}
        onClose={() => setShowBulkEditDialog(false)}
        selectedIds={Array.from(selectedVariantIds)}
        productId={productId}
      />

      {/* Bulk Delete Dialog */}
      <BulkDeleteDialog
        isOpen={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        selectedIds={Array.from(selectedVariantIds)}
        productId={productId}
      />

      {/* CSV Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        variants={variants}
        productTitle={product.title}
      />

      {/* CSV Import Dialog */}
      <ImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        variants={variants}
        productId={productId}
      />
    </div>
  );
}
