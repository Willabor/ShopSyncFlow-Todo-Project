import { Button } from "@/components/ui/button";
import { ArrowLeft, Undo, Redo, Upload, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface BulkEditHeaderProps {
  productId: string;
  productTitle: string;
  saveStatus: "idle" | "saving" | "saved" | "error";
  canUndo: boolean;
  canRedo: boolean;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
}

export function BulkEditHeader({
  productTitle,
  saveStatus,
  canUndo,
  canRedo,
  onBack,
  onUndo,
  onRedo,
  onImport,
  onExport,
  onSave,
}: BulkEditHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-4 bg-background">
      {/* Left: Back button and title */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to product
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Bulk editor</h1>
          <p className="text-sm text-muted-foreground">{productTitle}</p>
        </div>
      </div>

      {/* Right: Actions and save status */}
      <div className="flex items-center gap-2">
        {/* Save status indicator */}
        {saveStatus === "saving" && (
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="text-sm text-green-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        {saveStatus === "error" && (
          <span className="text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Error saving
          </span>
        )}

        {/* Undo/Redo buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Cmd+Z)"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Cmd+Shift+Z)"
        >
          <Redo className="h-4 w-4" />
        </Button>

        {/* Import/Export buttons */}
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        {/* Manual save button */}
        <Button size="sm" onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
