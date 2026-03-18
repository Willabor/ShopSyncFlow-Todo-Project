import { useMemo, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ProductVariant } from "@shared/schema";
import { EditableCell, type Column } from "./EditableCell";

interface ColumnConfig {
  visible: Set<string>;
  order: string[];
  widths: Record<string, number>;
}

interface BulkEditTableProps {
  variants: ProductVariant[];
  productId: string;
  columnConfig: ColumnConfig;
  selectedVariantIds: Set<string>;
  editingCell: { rowId: string; columnId: string } | null;
  onSelectVariant: (id: string) => void;
  onSelectAll: () => void;
  onCellEdit: (variantId: string, field: keyof ProductVariant, value: any) => void;
  onCellFocus: (rowId: string, columnId: string) => void;
  onSaveStatusChange: (status: "idle" | "saving" | "saved" | "error") => void;
}

// Column definitions with field mappings
const COLUMNS: Column[] = [
  {
    id: "variant",
    label: "Variant",
    field: null,
    editable: false,
    type: "text",
    format: (variant: ProductVariant) =>
      [variant.option1, variant.option2, variant.option3].filter(Boolean).join(" / "),
  },
  {
    id: "price",
    label: "Price",
    field: "price",
    editable: true,
    type: "number",
    format: (variant: ProductVariant) => `$${variant.price}`,
  },
  {
    id: "compareAtPrice",
    label: "Compare at price",
    field: "compareAtPrice",
    editable: true,
    type: "number",
    format: (variant: ProductVariant) =>
      variant.compareAtPrice ? `$${variant.compareAtPrice}` : "—",
  },
  {
    id: "cost",
    label: "Cost",
    field: "cost",
    editable: true,
    type: "number",
    format: (variant: ProductVariant) => (variant.cost ? `$${variant.cost}` : "—"),
  },
  {
    id: "sku",
    label: "SKU",
    field: "sku",
    editable: true,
    type: "text",
    format: (variant: ProductVariant) => variant.sku || "—",
  },
  {
    id: "barcode",
    label: "Barcode",
    field: "barcode",
    editable: true,
    type: "text",
    format: (variant: ProductVariant) => variant.barcode || "—",
  },
  {
    id: "inventoryQuantity",
    label: "Quantity",
    field: "inventoryQuantity",
    editable: true,
    type: "number",
    format: (variant: ProductVariant) => variant.inventoryQuantity.toString(),
  },
  {
    id: "inventoryPolicy",
    label: "Inventory policy",
    field: "inventoryPolicy",
    editable: true,
    type: "select",
    options: ["deny", "continue"],
    format: (variant: ProductVariant) =>
      variant.inventoryPolicy === "deny" ? "Deny when out of stock" : "Continue selling",
  },
  {
    id: "weight",
    label: "Weight",
    field: "weight",
    editable: true,
    type: "number",
    format: (variant: ProductVariant) =>
      variant.weight ? `${variant.weight} ${variant.weightUnit || "lb"}` : "—",
  },
  {
    id: "requiresShipping",
    label: "Requires shipping",
    field: "requiresShipping",
    editable: true,
    type: "checkbox",
    format: (variant: ProductVariant) => (variant.requiresShipping ? "Yes" : "No"),
  },
];

export function BulkEditTable({
  variants,
  productId,
  columnConfig,
  selectedVariantIds,
  editingCell,
  onSelectVariant,
  onSelectAll,
  onCellEdit,
  onCellFocus,
  onSaveStatusChange,
}: BulkEditTableProps) {
  // Filter columns based on visibility config
  const visibleColumns = useMemo(() => {
    return COLUMNS.filter((col) => columnConfig.visible.has(col.id));
  }, [columnConfig.visible]);

  // Check if all variants are selected
  const allSelected = useMemo(() => {
    return variants.length > 0 && selectedVariantIds.size === variants.length;
  }, [variants.length, selectedVariantIds.size]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
      const isEditing =
        editingCell?.rowId === variants[rowIndex]?.id &&
        editingCell?.columnId === visibleColumns[colIndex]?.id;

      // Only handle navigation when not editing
      if (isEditing) return;

      switch (e.key) {
        case "Tab":
          e.preventDefault();
          // Move to next/previous cell
          if (e.shiftKey) {
            // Previous cell
            if (colIndex > 0) {
              onCellFocus(variants[rowIndex].id, visibleColumns[colIndex - 1].id);
            } else if (rowIndex > 0) {
              onCellFocus(
                variants[rowIndex - 1].id,
                visibleColumns[visibleColumns.length - 1].id
              );
            }
          } else {
            // Next cell
            if (colIndex < visibleColumns.length - 1) {
              onCellFocus(variants[rowIndex].id, visibleColumns[colIndex + 1].id);
            } else if (rowIndex < variants.length - 1) {
              onCellFocus(variants[rowIndex + 1].id, visibleColumns[0].id);
            }
          }
          break;

        case "Enter":
          e.preventDefault();
          // Move down in same column
          if (rowIndex < variants.length - 1) {
            onCellFocus(variants[rowIndex + 1].id, visibleColumns[colIndex].id);
          }
          break;

        case "ArrowRight":
          if (colIndex < visibleColumns.length - 1) {
            onCellFocus(variants[rowIndex].id, visibleColumns[colIndex + 1].id);
          }
          break;

        case "ArrowLeft":
          if (colIndex > 0) {
            onCellFocus(variants[rowIndex].id, visibleColumns[colIndex - 1].id);
          }
          break;

        case "ArrowDown":
          if (rowIndex < variants.length - 1) {
            onCellFocus(variants[rowIndex + 1].id, visibleColumns[colIndex].id);
          }
          break;

        case "ArrowUp":
          if (rowIndex > 0) {
            onCellFocus(variants[rowIndex - 1].id, visibleColumns[colIndex].id);
          }
          break;
      }
    },
    [editingCell, variants, visibleColumns, onCellFocus]
  );

  // Empty state
  if (variants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-lg font-semibold">No variants found</p>
          <p className="text-sm text-muted-foreground mt-2">
            No variants match your search criteria
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full border-collapse text-sm">
        {/* Table header */}
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {/* Select all checkbox */}
            <th className="border-b px-2 py-2 text-left w-12">
              <Checkbox checked={allSelected} onCheckedChange={onSelectAll} />
            </th>

            {/* Column headers */}
            {visibleColumns.map((column) => (
              <th
                key={column.id}
                className="border-b px-3 py-2 text-left font-medium"
                style={{ width: columnConfig.widths[column.id] || "auto" }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* Table body */}
        <tbody>
          {variants.map((variant, rowIndex) => (
            <tr
              key={variant.id}
              className="hover:bg-muted/50 transition-colors"
            >
              {/* Row checkbox */}
              <td className="border-b px-2 py-2">
                <Checkbox
                  checked={selectedVariantIds.has(variant.id)}
                  onCheckedChange={() => onSelectVariant(variant.id)}
                />
              </td>

              {/* Editable cells */}
              {visibleColumns.map((column, colIndex) => {
                const isEditing =
                  editingCell?.rowId === variant.id &&
                  editingCell?.columnId === column.id;
                const isFocused =
                  editingCell?.rowId === variant.id &&
                  editingCell?.columnId === column.id;

                return (
                  <td
                    key={column.id}
                    className="border-b px-3 py-2"
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                  >
                    {column.editable ? (
                      <EditableCell
                        variant={variant}
                        productId={productId}
                        column={column}
                        isEditing={isEditing}
                        isFocused={isFocused}
                        onEdit={(value) =>
                          onCellEdit(variant.id, column.field as keyof ProductVariant, value)
                        }
                        onFocus={() => onCellFocus(variant.id, column.id)}
                        onSaveStatusChange={onSaveStatusChange}
                      />
                    ) : (
                      <div className="px-2 py-1">
                        {column.format ? column.format(variant) : "—"}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
