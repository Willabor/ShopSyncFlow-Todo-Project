import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ShopifyCategory {
  id: string;
  gid: string;
  name: string;
  path: string;
  level: number;
}

interface CategorySelectorProps {
  value?: string; // Selected category GID
  onSelect: (categoryGid: string, categoryPath: string) => void;
  placeholder?: string;
  className?: string;
}

// Main categories list for filtering
const MAIN_CATEGORIES = [
  "Apparel & Accessories",
  "Health & Beauty",
  "Home & Garden",
  "Animals & Pet Supplies",
  "Arts & Entertainment",
  "Baby & Toddler",
  "Business & Industrial",
  "Cameras & Optics",
  "Electronics",
  "Food, Beverages & Tobacco",
  "Furniture",
  "Hardware",
  "Luggage & Bags",
  "Media",
  "Office Supplies",
  "Religious & Ceremonial",
  "Sporting Goods",
  "Toys & Games",
  "Vehicles & Parts",
];

// Helper function to highlight matching text
function highlightMatch(text: string, search: string): React.ReactNode {
  if (!search || search.length < 2) return text;

  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={index} className="bg-yellow-200 text-black font-medium">{part}</mark>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

export function CategorySelector({
  value,
  onSelect,
  placeholder = "Select category...",
  className,
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mainCategory, setMainCategory] = useState<string>("");
  const [categories, setCategories] = useState<ShopifyCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ShopifyCategory | null>(null);

  // Fetch categories when search or mainCategory changes
  useEffect(() => {
    const fetchCategories = async () => {
      if (!search || search.length < 2) {
        setCategories([]);
        return;
      }

      setIsLoading(true);
      try {
        const url = new URL('/api/categories/shopify/search', window.location.origin);
        url.searchParams.append('q', search);
        if (mainCategory) {
          url.searchParams.append('mainCategory', mainCategory);
        }

        const response = await fetch(url.toString(), {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to search categories");
        }

        const data = await response.json();
        setCategories(data.categories || []);
      } catch (error) {
        console.error("Error fetching categories:", error);
        setCategories([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce the search
    const timer = setTimeout(fetchCategories, 300);
    return () => clearTimeout(timer);
  }, [search, mainCategory]);

  // Load selected category details on mount or when value changes
  useEffect(() => {
    const loadSelectedCategory = async () => {
      if (!value) {
        setSelectedCategory(null);
        return;
      }

      // Try to find in current categories first
      const found = categories.find((cat) => cat.gid === value);
      if (found) {
        setSelectedCategory(found);
        return;
      }

      // If not found in current list, we need to fetch by GID
      // For now, we'll just show the GID - in production, you might want to fetch the full details
      setSelectedCategory({
        id: value.split('/').pop() || value,
        gid: value,
        name: "Selected Category",
        path: value,
        level: 0,
      });
    };

    loadSelectedCategory();
  }, [value, categories]);

  const handleSelect = (category: ShopifyCategory) => {
    onSelect(category.gid, category.path);
    setSelectedCategory(category);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedCategory ? (
            <span className="text-left truncate">
              {selectedCategory.path}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[600px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 p-2 border-b">
            <div className="flex-1">
              <CommandInput
                placeholder="Search categories (e.g., hoodies, jeans, t-shirts)..."
                value={search}
                onValueChange={setSearch}
              />
            </div>
          </div>

          {/* Main Category Filter */}
          <div className="px-3 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Filter by category:
              </label>
              <Select value={mainCategory || undefined} onValueChange={setMainCategory}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {MAIN_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mainCategory && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setMainCategory("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <CommandList className="max-h-[400px] overflow-y-auto">
            {search.length > 0 && search.length < 2 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Type at least 2 characters to search
              </div>
            )}

            {isLoading && search.length >= 2 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Searching...
              </div>
            )}

            {!isLoading && search.length >= 2 && categories.length === 0 && (
              <CommandEmpty>No categories found.</CommandEmpty>
            )}

            {!isLoading && categories.length > 0 && (
              <CommandGroup heading={`${categories.length} categories found${mainCategory ? ` in "${mainCategory}"` : ''}`}>
                {categories.map((category) => (
                  <CommandItem
                    key={category.gid}
                    value={category.gid}
                    onSelect={() => handleSelect(category)}
                    className="flex items-start py-3 cursor-pointer hover:bg-accent"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0 mt-0.5",
                        selectedCategory?.gid === category.gid
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {highlightMatch(category.name, search)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Level {category.level}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {highlightMatch(category.path, search)}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!search && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Start typing to search Shopify Standard Product Taxonomy...
                <div className="mt-2 text-xs">
                  Examples: "hoodies", "jeans", "t-shirts", "jackets"
                </div>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
