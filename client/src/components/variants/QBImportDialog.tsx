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
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface QBImportDialogProps {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  success: boolean;
  message?: string;
  summary?: {
    totalRowsInFile: number;
    filteredRows: number;
    variantsUpdated: number;
    variantsCreated: number;
    rowsSkipped: number;
    existingVariantsKept: number;
  };
  details?: {
    productId: string;
    productTitle: string;
    styleNumber: string;
    color: string;
    sizesFound: string[];
    totalVariantsAfterImport: number;
  };
  errors?: Array<{ row: string; reason: string }>;
  warnings?: Array<{ row: string; message: string }>;
}

export function QBImportDialog({ productId, open, onOpenChange }: QBImportDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/products/${productId}/import-variants-from-qb`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Import failed');
      }

      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["options", productId] });
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });

      toast({
        title: "Import successful!",
        description: `${data.summary?.variantsCreated || 0} variants created, ${data.summary?.variantsUpdated || 0} updated`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // File selection handlers
  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(xls|xlsx)$/i)) {
      toast({
        title: "Invalid file type",
        description: "Please select an Excel file (.xls or .xlsx)",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    setImportResult(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleImport = () => {
    if (!selectedFile) return;
    importMutation.mutate(selectedFile);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Variants from QuickBooks</DialogTitle>
          <DialogDescription>
            Upload a QuickBooks POS export file (.xls or .xlsx) to import or update product variants
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload Area */}
          {!importResult && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : selectedFile
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : "border-gray-300 dark:border-gray-700 hover:border-primary/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="space-y-3">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-green-600" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      Drag and drop your QuickBooks file here
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          )}

          {/* Import Progress */}
          {importMutation.isPending && (
            <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <p className="font-medium">Importing variants...</p>
              </div>
              <Progress value={undefined} className="h-2" />
              <p className="text-sm text-muted-foreground">
                Processing QuickBooks data and updating variants
              </p>
            </div>
          )}

          {/* Import Results */}
          {importResult && importResult.success && (
            <div className="space-y-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">
                      Import completed successfully!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {importResult.details?.productTitle}
                    </p>
                  </div>

                  {/* Summary Stats */}
                  {importResult.summary && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border">
                        <p className="text-muted-foreground">Created</p>
                        <p className="text-lg font-semibold text-green-600">
                          {importResult.summary.variantsCreated}
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border">
                        <p className="text-muted-foreground">Updated</p>
                        <p className="text-lg font-semibold text-blue-600">
                          {importResult.summary.variantsUpdated}
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border">
                        <p className="text-muted-foreground">Total After</p>
                        <p className="text-lg font-semibold">
                          {importResult.details?.totalVariantsAfterImport || 0}
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-gray-900 rounded border">
                        <p className="text-muted-foreground">Skipped</p>
                        <p className="text-lg font-semibold text-gray-600">
                          {importResult.summary.rowsSkipped}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Details */}
                  {importResult.details && (
                    <div className="text-sm space-y-1 p-3 bg-white dark:bg-gray-900 rounded border">
                      <p>
                        <span className="font-medium">Style Number:</span>{" "}
                        {importResult.details.styleNumber}
                      </p>
                      <p>
                        <span className="font-medium">Color:</span>{" "}
                        {importResult.details.color}
                      </p>
                      <p>
                        <span className="font-medium">Sizes:</span>{" "}
                        {importResult.details.sizesFound.join(", ")}
                      </p>
                    </div>
                  )}

                  {/* Warnings */}
                  {importResult.warnings && importResult.warnings.length > 0 && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200">
                      <p className="font-medium text-yellow-700 text-sm mb-2">
                        Warnings:
                      </p>
                      <ul className="text-xs space-y-1">
                        {importResult.warnings.map((w, i) => (
                          <li key={i}>
                            Row {w.row}: {w.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Import Error */}
          {importResult && !importResult.success && (
            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-700 dark:text-red-400">
                    Import failed
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {importResult.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Help Text */}
          {!importResult && !importMutation.isPending && (
            <div className="text-sm text-muted-foreground space-y-2 p-3 bg-muted/50 rounded">
              <p className="font-medium">Requirements:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>File must be a QuickBooks POS export (.xls or .xlsx)</li>
                <li>Product must have a Style Number set</li>
                <li>Product title must include color (e.g., "Product Name - Ice Blue")</li>
                <li>
                  Import will match variants by SKU (update existing, create new)
                </li>
                <li>Existing variants not in the file will be kept (non-destructive)</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={!selectedFile || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Variants
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
