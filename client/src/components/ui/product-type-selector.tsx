import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Category } from "@shared/schema";

interface ProductTypeSelectorProps {
  value: string; // Category name (stored as productType)
  onChange: (categoryName: string) => void;
  placeholder?: string;
  className?: string;
}

export function ProductTypeSelector({
  value,
  onChange,
  placeholder = "Type to search product types...",
  className,
}: ProductTypeSelectorProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync inputValue with value prop
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Fetch all active categories
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories", { isActive: true }],
    queryFn: async () => {
      const response = await fetch("/api/categories?isActive=true", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }
      return response.json();
    },
  });

  // Filter and sort categories based on input
  const filteredCategories = categories
    .filter((cat) =>
      cat.name.toLowerCase().includes(inputValue.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  // Handle selection
  const handleSelect = (categoryName: string) => {
    onChange(categoryName);
    setInputValue(categoryName);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle clear
  const handleClear = () => {
    onChange("");
    setInputValue("");
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredCategories.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredCategories[highlightedIndex]) {
          handleSelect(filteredCategories[highlightedIndex].name);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        // Reset to selected value if input doesn't match
        if (inputValue !== value) {
          setInputValue(value);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue, value]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "Loading..." : placeholder}
          disabled={isLoading}
          className="pr-8"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && filteredCategories.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
        >
          {filteredCategories.map((category, index) => (
            <div
              key={category.id}
              onClick={() => handleSelect(category.name)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm",
                highlightedIndex === index && "bg-accent",
                value === category.name && "bg-accent/50"
              )}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <Check
                className={cn(
                  "h-4 w-4 flex-shrink-0",
                  value === category.name ? "opacity-100" : "opacity-0"
                )}
              />
              {category.color && (
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: category.color }}
                />
              )}
              <span>{category.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && inputValue && filteredCategories.length === 0 && !isLoading && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md p-3 text-center text-sm text-muted-foreground"
        >
          No matching product type found.
          <p className="text-xs mt-1">Create new types in the Categories page.</p>
        </div>
      )}
    </div>
  );
}
