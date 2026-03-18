import { ImageIcon } from "lucide-react";
import type { ProductVariant } from "@shared/schema";

interface VariantListItemProps {
  variant: ProductVariant;
  isActive: boolean;
  onClick: () => void;
}

export function VariantListItem({ variant, isActive, onClick }: VariantListItemProps) {
  const title = [variant.option1, variant.option2, variant.option3]
    .filter(Boolean)
    .join(" / ");

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 text-left
        transition-colors rounded-md
        ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted"
        }
      `}
    >
      {/* Image thumbnail or placeholder */}
      <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-muted border">
        {variant.imageUrl ? (
          <img
            src={variant.imageUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="w-full h-full p-2 text-muted-foreground" />
        )}
      </div>

      {/* Title and price */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        <p className="text-xs text-muted-foreground">${variant.price}</p>
      </div>
    </button>
  );
}
