/**
 * Google Category Mapper Modal
 *
 * Allows users to search and select Google Shopping product categories
 * from the database (11,768+ categories)
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, CheckCircle2, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Database-backed category interface
export interface GoogleCategory {
  id: string;          // e.g., "aa-5-4-7"
  gid: string;         // Shopify GID
  name: string;        // e.g., "Cross Body Bags"
  path: string;        // Full path
  level: number;       // Category depth
}

interface GoogleCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCategory: (category: GoogleCategory) => void;
  currentCategory?: GoogleCategory | null;
}

interface CategoryFilters {
  mainCategories: { name: string; count: number }[];
  genders: { name: string; count: number }[];
  levels: number[];
}

export function GoogleCategoryModal({
  open,
  onOpenChange,
  onSelectCategory,
  currentCategory,
}: GoogleCategoryModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedMainCategory, setSelectedMainCategory] = useState<string>("");
  const [selectedGender, setSelectedGender] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<GoogleCategory | null>(
    currentCategory || null
  );
  const { toast } = useToast();

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch filter options
  const { data: filters } = useQuery<CategoryFilters>({
    queryKey: ["/api/google-categories/filters"],
    queryFn: async () => {
      const response = await fetch("/api/google-categories/filters");
      if (!response.ok) {
        throw new Error("Failed to fetch filters");
      }
      return response.json();
    },
    enabled: open,
  });

  // Fetch categories from API
  const { data: categories = [], isLoading, error } = useQuery<GoogleCategory[]>({
    queryKey: ["/api/google-categories/search", debouncedSearch, selectedMainCategory, selectedGender, selectedLevel],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }
      if (selectedMainCategory) {
        params.append("mainCategory", selectedMainCategory);
      }
      if (selectedGender) {
        params.append("gender", selectedGender);
      }
      if (selectedLevel) {
        params.append("level", selectedLevel);
      }
      params.append("limit", "100");

      const response = await fetch(`/api/google-categories/search?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch categories");
      }
      return response.json();
    },
    enabled: open, // Only fetch when modal is open
  });

  // Show error toast if search fails
  useEffect(() => {
    if (error) {
      toast({
        title: "Search Error",
        description: "Failed to search categories. Please try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleSelect = (category: GoogleCategory) => {
    setSelectedCategory(category);
  };

  const handleConfirm = () => {
    if (selectedCategory) {
      onSelectCategory(selectedCategory);
      onOpenChange(false);
    }
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedMainCategory("");
    setSelectedGender("");
    setSelectedLevel("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>Map Shopify Category</DialogTitle>
          <DialogDescription>
            Select from Shopify's Standard Product Taxonomy (11,768+ categories).
            Simprosys will use this to auto-map your product to the correct Google Shopping category.
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="px-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search categories (e.g., 'cross body bags', 'hoodies', 'jeans')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Select
                value={selectedMainCategory || undefined}
                onValueChange={(value) => setSelectedMainCategory(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  {filters?.mainCategories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.name} ({cat.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Select
                value={selectedGender || undefined}
                onValueChange={(value) => setSelectedGender(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Genders" />
                </SelectTrigger>
                <SelectContent>
                  {filters?.genders.map((gender) => (
                    <SelectItem key={gender.name} value={gender.name}>
                      {gender.name} ({gender.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Select
                value={selectedLevel || undefined}
                onValueChange={(value) => setSelectedLevel(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
                <SelectContent>
                  {filters?.levels.map((level) => (
                    <SelectItem key={level} value={level.toString()}>
                      Level {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(searchQuery || selectedMainCategory || selectedGender || selectedLevel) && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleClearFilters}
                title="Clear all filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Active Filters Display */}
          {(searchQuery || selectedMainCategory || selectedGender || selectedLevel) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Filters:</span>
              {searchQuery && (
                <Badge variant="secondary">Search: "{searchQuery}"</Badge>
              )}
              {selectedMainCategory && (
                <Badge variant="secondary">{selectedMainCategory}</Badge>
              )}
              {selectedGender && (
                <Badge variant="secondary">{selectedGender}</Badge>
              )}
              {selectedLevel && (
                <Badge variant="secondary">Level {selectedLevel}</Badge>
              )}
              <span className="ml-auto">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Searching...
                  </span>
                ) : (
                  `${categories.length} result${categories.length !== 1 ? 's' : ''}`
                )}
              </span>
            </div>
          )}
        </div>

        {/* Category List */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>
                {searchQuery || selectedMainCategory || selectedGender || selectedLevel
                  ? "No categories found matching your filters"
                  : "Select filters or search to find categories"}
              </p>
              {(searchQuery || selectedMainCategory || selectedGender || selectedLevel) && (
                <Button
                  variant="link"
                  onClick={handleClearFilters}
                  className="mt-2"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => {
                const isSelected =
                  selectedCategory?.id === category.id &&
                  selectedCategory?.name === category.name;

                return (
                  <div
                    key={`${category.id}-${category.name}`}
                    onClick={() => handleSelect(category)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-accent"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{category.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            Level {category.level}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {category.path}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedCategory ? (
                <span>
                  Selected: <span className="font-semibold">{selectedCategory.name}</span>
                </span>
              ) : (
                <span>No category selected</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selectedCategory}
              >
                Confirm Selection
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
