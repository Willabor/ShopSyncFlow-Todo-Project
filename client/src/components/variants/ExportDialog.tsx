import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ProductVariant } from "@shared/schema";
import { Download, Loader2 } from "lucide-react";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  variants: ProductVariant[];
  productTitle: string;
}

interface ExportField {
  key: keyof ProductVariant;
  label: string;
  selected: boolean;
}

const DEFAULT_EXPORT_FIELDS: ExportField[] = [
  { key: "option1", label: "Option 1", selected: true },
  { key: "option2", label: "Option 2", selected: true },
  { key: "option3", label: "Option 3", selected: true },
  { key: "price", label: "Price", selected: true },
  { key: "compareAtPrice", label: "Compare at price", selected: true },
  { key: "cost", label: "Cost", selected: true },
  { key: "sku", label: "SKU", selected: true },
  { key: "barcode", label: "Barcode", selected: true },
  { key: "inventoryQuantity", label: "Inventory quantity", selected: true },
  { key: "inventoryPolicy", label: "Inventory policy", selected: true },
  { key: "weight", label: "Weight", selected: true },
  { key: "weightUnit", label: "Weight unit", selected: true },
  { key: "requiresShipping", label: "Requires shipping", selected: true },
  { key: "taxable", label: "Taxable", selected: true },
  { key: "imageUrl", label: "Image URL", selected: false },
  { key: "position", label: "Position", selected: false },
];

export function ExportDialog({
  isOpen,
  onClose,
  variants,
  productTitle,
}: ExportDialogProps) {
  const [fields, setFields] = useState<ExportField[]>(DEFAULT_EXPORT_FIELDS);
  const [isExporting, setIsExporting] = useState(false);

  const handleToggleField = (key: keyof ProductVariant) => {
    setFields((prev) =>
      prev.map((field) =>
        field.key === key ? { ...field, selected: !field.selected } : field
      )
    );
  };

  const handleSelectAll = () => {
    const allSelected = fields.every((f) => f.selected);
    setFields((prev) => prev.map((f) => ({ ...f, selected: !allSelected })));
  };

  const generateCSV = () => {
    const selectedFields = fields.filter((f) => f.selected);

    // CSV header
    const headers = selectedFields.map((f) => f.label).join(",");

    // CSV rows
    const rows = variants.map((variant) => {
      return selectedFields
        .map((field) => {
          const value = variant[field.key];

          // Handle null/undefined
          if (value === null || value === undefined) return "";

          // Handle booleans
          if (typeof value === "boolean") return value ? "Yes" : "No";

          // Handle strings with commas or quotes (CSV escaping)
          if (typeof value === "string") {
            if (value.includes(",") || value.includes('"') || value.includes("\n")) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }

          // Handle numbers and other types
          return String(value);
        })
        .join(",");
    });

    return [headers, ...rows].join("\n");
  };

  const handleExport = () => {
    setIsExporting(true);

    try {
      const csv = generateCSV();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      // Create filename from product title and timestamp
      const timestamp = new Date().toISOString().split("T")[0];
      const sanitizedTitle = productTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const filename = `${sanitizedTitle}-variants-${timestamp}.csv`;

      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedCount = fields.filter((f) => f.selected).length;
  const allSelected = fields.every((f) => f.selected);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export variants to CSV</DialogTitle>
          <DialogDescription>
            Export {variants.length} variant{variants.length !== 1 ? "s" : ""} to a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              Select fields ({selectedCount} selected)
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-4">
            {fields.map((field) => (
              <div key={field.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`export-field-${field.key}`}
                  checked={field.selected}
                  onCheckedChange={() => handleToggleField(field.key)}
                />
                <Label
                  htmlFor={`export-field-${field.key}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {field.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={isExporting || selectedCount === 0}
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
