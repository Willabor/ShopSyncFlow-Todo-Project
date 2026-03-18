import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Clock, Zap } from "lucide-react";

interface SaveStatusFooterProps {
  lastSavedAt: Date | null;
}

export function SaveStatusFooter({ lastSavedAt }: SaveStatusFooterProps) {
  const saveText = useMemo(() => {
    if (!lastSavedAt) {
      return null;
    }

    const distance = formatDistanceToNow(lastSavedAt, { addSuffix: true });
    return distance;
  }, [lastSavedAt]);

  return (
    <div className="border-t px-6 py-3 bg-muted/30">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Zap className="h-3.5 w-3.5" />
          <span>Changes save automatically as you type</span>
        </div>
        {lastSavedAt && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Last saved {saveText}</span>
          </div>
        )}
      </div>
    </div>
  );
}
