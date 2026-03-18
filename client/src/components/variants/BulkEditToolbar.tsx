import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit, Trash2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ColumnConfig {
  visible: Set<string>;
  order: string[];
  widths: Record<string, number>;
}

interface BulkEditToolbarProps {
  totalVariants: number;
  selectedCount: number;
  columnConfig: ColumnConfig;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
  onColumnConfigChange: (config: ColumnConfig) => void;
  onSearchChange: (query: string) => void;
}

// Available columns for bulk editor
const AVAILABLE_COLUMNS = [
  { id: "variant", label: "Variant", alwaysVisible: true },
  { id: "price", label: "Price" },
  { id: "compareAtPrice", label: "Compare at price" },
  { id: "cost", label: "Cost" },
  { id: "sku", label: "SKU" },
  { id: "barcode", label: "Barcode" },
  { id: "inventoryQuantity", label: "Quantity" },
  { id: "inventoryPolicy", label: "Inventory policy" },
  { id: "weight", label: "Weight" },
  { id: "requiresShipping", label: "Requires shipping" },
];

export function BulkEditToolbar({
  totalVariants,
  selectedCount,
  columnConfig,
  onBulkEdit,
  onBulkDelete,
  onColumnConfigChange,
  onSearchChange,
}: BulkEditToolbarProps) {
  function toggleColumn(columnId: string) {
    const newVisible = new Set(columnConfig.visible);
    if (newVisible.has(columnId)) {
      newVisible.delete(columnId);
    } else {
      newVisible.add(columnId);
    }

    onColumnConfigChange({
      ...columnConfig,
      visible: newVisible,
    });
  }

  return (
    <div className="flex items-center justify-between border-b px-6 py-3 bg-muted/20">
      {/* Left: Selection info and bulk actions */}
      <div className="flex items-center gap-4">
        {selectedCount > 0 ? (
          <>
            <span className="text-sm font-medium">
              {selectedCount} variant{selectedCount > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onBulkEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit fields
              </Button>
              <Button variant="outline" size="sm" onClick={onBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {totalVariants} variant{totalVariants !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Right: Search and column config */}
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Search variants..."
          className="w-64"
          onChange={(e) => onSearchChange(e.target.value)}
        />

        {/* Column configuration dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Eye className="mr-2 h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {AVAILABLE_COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={columnConfig.visible.has(column.id)}
                onCheckedChange={() => toggleColumn(column.id)}
                disabled={column.alwaysVisible}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
