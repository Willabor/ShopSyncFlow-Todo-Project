import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LocationInventory } from "@shared/schema";

interface LocationInventoryBreakdownProps {
  locationInventory: LocationInventory[];
  compact?: boolean;
  className?: string;
}

export function LocationInventoryBreakdown({
  locationInventory,
  compact = false,
  className,
}: LocationInventoryBreakdownProps) {
  const total = locationInventory.reduce((sum, loc) => sum + loc.qty, 0);

  if (locationInventory.length === 0) return null;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "cursor-help border-b border-dotted border-muted-foreground tabular-nums",
                className
              )}
            >
              {total}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="p-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {locationInventory.map((loc) => (
                <div key={loc.code} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{loc.code}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      loc.qty === 0
                        ? "text-muted-foreground"
                        : "font-medium"
                    )}
                  >
                    {loc.qty}
                  </span>
                </div>
              ))}
              <div className="col-span-2 border-t mt-1 pt-1 flex justify-between">
                <span className="font-medium">Total</span>
                <span className="font-bold tabular-nums">{total}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full inline view: row of badges
  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {locationInventory.map((loc) => (
        <Badge
          key={loc.code}
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 h-5 font-mono rounded-md",
            loc.qty === 0 ? "opacity-40" : ""
          )}
        >
          {loc.code}:{loc.qty}
        </Badge>
      ))}
    </div>
  );
}
