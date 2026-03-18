import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Search, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Collection } from "@shared/schema";

interface CollectionSelectorProps {
  selectedCollectionIds: string[];
  onSelectionChange: (collectionIds: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function CollectionSelector({
  selectedCollectionIds,
  onSelectionChange,
  placeholder = "Search collections...",
  className,
}: CollectionSelectorProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all active collections (increased limit to get all collections)
  const { data: collectionData, isLoading } = useQuery({
    queryKey: ["/api/collections", { isActive: true }],
    queryFn: async () => {
      const response = await fetch("/api/collections?isActive=true&limit=10000", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch collections");
      }
      return response.json();
    },
  });

  const collections: Collection[] = collectionData?.collections || [];

  // Get selected collections
  const selectedCollections = collections.filter((c) =>
    selectedCollectionIds.includes(c.id)
  );

  // Get unselected collections for the add dialog
  const unselectedCollections = collections.filter((c) =>
    !selectedCollectionIds.includes(c.id)
  );

  // Filter unselected collections by search query
  const filteredUnselectedCollections = unselectedCollections.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRemove = (collectionId: string) => {
    onSelectionChange(selectedCollectionIds.filter((id) => id !== collectionId));
  };

  const handleAdd = (collectionId: string) => {
    onSelectionChange([...selectedCollectionIds, collectionId]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Selected Collections Display */}
      <div className="border rounded-md p-3 min-h-[60px]">
        {selectedCollections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collections selected</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedCollections.map((collection) => {
              const isAuto = collection.shopifyType === "smart";
              return (
                <Badge
                  key={collection.id}
                  variant={isAuto ? "default" : "secondary"}
                  className={cn(
                    "gap-1 text-xs pr-1 whitespace-normal break-words",
                    isAuto && "bg-blue-100 text-blue-800 hover:bg-blue-100"
                  )}
                >
                  <span>{collection.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(collection.id)}
                    className="ml-1 rounded-full hover:bg-black/10 p-0.5 flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Collection Button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowAddDialog(true)}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add to Collection
      </Button>

      {/* Selection Count */}
      {selectedCollectionIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedCollectionIds.length} collection{selectedCollectionIds.length !== 1 ? 's' : ''} selected
        </p>
      )}

      {/* Add Collection Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add to Collections</DialogTitle>
            <DialogDescription>
              Select collections to add this product to
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search Field */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Available Collections List */}
            <div className="border rounded-md">
              <div className="max-h-[400px] overflow-y-auto">
                {isLoading && (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Loading collections...
                  </div>
                )}

                {!isLoading && filteredUnselectedCollections.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {searchQuery
                      ? "No collections found matching your search."
                      : unselectedCollections.length === 0
                      ? "This product is already in all available collections."
                      : "No collections available."}
                  </div>
                )}

                {!isLoading && filteredUnselectedCollections.length > 0 && (
                  <div className="divide-y">
                    {filteredUnselectedCollections.map((collection) => {
                      const isAuto = collection.shopifyType === "smart";

                      return (
                        <button
                          key={collection.id}
                          type="button"
                          onClick={() => {
                            handleAdd(collection.id);
                            setSearchQuery("");
                          }}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          {/* Plus Icon */}
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-primary text-primary flex-shrink-0">
                            <Plus className="h-3 w-3" />
                          </div>

                          {/* Collection Name */}
                          <span className="flex-1 text-sm font-medium">
                            {collection.name}
                          </span>

                          {/* Auto/Manual Badge */}
                          <Badge
                            variant={isAuto ? "default" : "secondary"}
                            className={cn(
                              "text-xs flex-shrink-0",
                              isAuto && "bg-blue-100 text-blue-800 hover:bg-blue-100"
                            )}
                          >
                            {isAuto ? "Auto" : "Manual"}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
