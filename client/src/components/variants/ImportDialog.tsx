import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, FileUp, AlertCircle } from "lucide-react";
import type { ProductVariant } from "@shared/schema";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  variants: ProductVariant[];
  productId: string;
}

interface CSVRow {
  [key: string]: string;
}

interface ColumnMapping {
  csvColumn: string;
  variantField: keyof ProductVariant | "skip";
}

const VARIANT_FIELDS = [
  { value: "skip", label: "Skip this column" },
  { value: "sku", label: "SKU (for matching)" },
  { value: "option1", label: "Option 1 (for matching)" },
  { value: "option2", label: "Option 2 (for matching)" },
  { value: "option3", label: "Option 3 (for matching)" },
  { value: "price", label: "Price" },
  { value: "compareAtPrice", label: "Compare at price" },
  { value: "cost", label: "Cost" },
  { value: "barcode", label: "Barcode" },
  { value: "inventoryQuantity", label: "Inventory quantity" },
  { value: "inventoryPolicy", label: "Inventory policy" },
  { value: "weight", label: "Weight" },
  { value: "weightUnit", label: "Weight unit" },
  { value: "requiresShipping", label: "Requires shipping" },
  { value: "taxable", label: "Taxable" },
];

export function ImportDialog({
  isOpen,
  onClose,
  variants,
  productId,
}: ImportDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const parseCSV = (text: string): { headers: string[]; rows: CSVRow[] } => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    // Parse header
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

    // Parse rows
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: CSVRow = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });
      rows.push(row);
    }

    return { headers, rows };
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSV(text);

        setCsvHeaders(headers);
        setCsvData(rows);

        // Auto-map columns based on header names
        const autoMappings: ColumnMapping[] = headers.map((header) => {
          const lowerHeader = header.toLowerCase();

          // Try to find matching field
          const matchingField = VARIANT_FIELDS.find(
            (field) =>
              field.label.toLowerCase().includes(lowerHeader) ||
              lowerHeader.includes(field.value.toLowerCase())
          );

          return {
            csvColumn: header,
            variantField: (matchingField?.value as keyof ProductVariant) || "skip",
          };
        });

        setColumnMappings(autoMappings);
        setStep("mapping");
      } catch (error) {
        toast({
          title: "Failed to parse CSV",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    };

    reader.readAsText(selectedFile);
  };

  const handleMappingChange = (csvColumn: string, variantField: string) => {
    setColumnMappings((prev) =>
      prev.map((mapping) =>
        mapping.csvColumn === csvColumn
          ? { ...mapping, variantField: variantField as keyof ProductVariant }
          : mapping
      )
    );
  };

  const validateImport = (): boolean => {
    const errors: string[] = [];

    // Check if at least one matching field is mapped (SKU or options)
    const hasMatchingField = columnMappings.some(
      (m) => m.variantField === "sku" || m.variantField === "option1"
    );

    if (!hasMatchingField) {
      errors.push("You must map at least one matching field (SKU or Option 1)");
    }

    // Check if at least one update field is mapped
    const hasUpdateField = columnMappings.some(
      (m) =>
        m.variantField !== "skip" &&
        m.variantField !== "sku" &&
        m.variantField !== "option1" &&
        m.variantField !== "option2" &&
        m.variantField !== "option3"
    );

    if (!hasUpdateField) {
      errors.push("You must map at least one field to update");
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const matchVariant = (row: CSVRow): ProductVariant | null => {
    const mappedData: Record<string, string> = {};
    columnMappings.forEach((mapping) => {
      if (mapping.variantField !== "skip") {
        mappedData[mapping.variantField] = row[mapping.csvColumn] || "";
      }
    });

    // Try to match by SKU first
    if (mappedData.sku) {
      const match = variants.find(
        (v) => v.sku?.toLowerCase() === mappedData.sku.toLowerCase()
      );
      if (match) return match;
    }

    // Try to match by options
    if (mappedData.option1) {
      const match = variants.find((v) => {
        const option1Match = v.option1?.toLowerCase() === mappedData.option1.toLowerCase();
        const option2Match = !mappedData.option2 || v.option2?.toLowerCase() === mappedData.option2?.toLowerCase();
        const option3Match = !mappedData.option3 || v.option3?.toLowerCase() === mappedData.option3?.toLowerCase();
        return option1Match && option2Match && option3Match;
      });
      if (match) return match;
    }

    return null;
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const errors: string[] = [];
      let successCount = 0;

      for (const row of csvData) {
        const variant = matchVariant(row);
        if (!variant) {
          errors.push(`No matching variant found for row: ${JSON.stringify(row)}`);
          continue;
        }

        try {
          const updates: Record<string, any> = {};

          columnMappings.forEach((mapping) => {
            if (
              mapping.variantField === "skip" ||
              mapping.variantField === "sku" ||
              mapping.variantField === "option1" ||
              mapping.variantField === "option2" ||
              mapping.variantField === "option3"
            ) {
              return; // Skip matching fields
            }

            const value = row[mapping.csvColumn];
            if (!value) return;

            // Type conversion based on field
            if (mapping.variantField === "price" || mapping.variantField === "compareAtPrice" || mapping.variantField === "cost" || mapping.variantField === "weight") {
              updates[mapping.variantField] = value;
            } else if (mapping.variantField === "inventoryQuantity") {
              updates[mapping.variantField] = parseInt(value, 10);
            } else if (mapping.variantField === "requiresShipping" || mapping.variantField === "taxable") {
              updates[mapping.variantField] = value.toLowerCase() === "yes" || value.toLowerCase() === "true";
            } else {
              updates[mapping.variantField] = value;
            }
          });

          if (Object.keys(updates).length === 0) continue;

          const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
          });

          if (!res.ok) {
            errors.push(`Failed to update variant ${variant.id}`);
          } else {
            successCount++;
          }
        } catch (error) {
          errors.push(`Error updating variant ${variant.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Import completed with ${errors.length} error(s). ${successCount} variant(s) updated successfully.`);
      }

      return successCount;
    },
    onSuccess: (successCount) => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({
        title: "Import successful",
        description: `Updated ${successCount} variant(s)`,
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Import completed with errors",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleContinue = () => {
    if (step === "mapping") {
      if (validateImport()) {
        setStep("preview");
      }
    }
  };

  const handleImport = () => {
    importMutation.mutate();
  };

  const handleClose = () => {
    setFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMappings([]);
    setStep("upload");
    setValidationErrors([]);
    onClose();
  };

  const matchedCount = csvData.filter((row) => matchVariant(row) !== null).length;
  const unmatchedCount = csvData.length - matchedCount;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import variants from CSV</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV file to import variant data"}
            {step === "mapping" && "Map CSV columns to variant fields"}
            {step === "preview" && "Review import preview before applying"}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                {file ? file.name : "Click to select a CSV file"}
              </p>
              <p className="text-xs text-muted-foreground">
                CSV should include headers and variant matching fields (SKU or options)
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Found {csvData.length} row(s) in CSV. Map each column to a variant field:
            </div>

            {validationErrors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-1">
                {validationErrors.map((error, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 max-h-[300px] overflow-y-auto border rounded-md p-4">
              {columnMappings.map((mapping) => (
                <div key={mapping.csvColumn} className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">
                    CSV Column: {mapping.csvColumn}
                  </Label>
                  <Select
                    value={mapping.variantField}
                    onValueChange={(value) =>
                      handleMappingChange(mapping.csvColumn, value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIANT_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="bg-muted rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Total rows:</span>
                <span className="font-medium">{csvData.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Matched variants:</span>
                <span className="font-medium text-green-600">{matchedCount}</span>
              </div>
              {unmatchedCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span>Unmatched rows (will be skipped):</span>
                  <span className="font-medium text-orange-600">{unmatchedCount}</span>
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {matchedCount} variant(s) will be updated. Click Import to apply changes.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={importMutation.isPending}
          >
            Cancel
          </Button>
          {step === "mapping" && (
            <Button type="button" onClick={handleContinue}>
              Continue to preview
            </Button>
          )}
          {step === "preview" && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={importMutation.isPending || matchedCount === 0}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {matchedCount} variant{matchedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
