import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Vendor } from "@shared/schema";

interface VendorSelectorProps {
  value: string; // Vendor name
  onChange: (vendorName: string) => void;
  placeholder?: string;
  className?: string;
}

export function VendorSelector({
  value,
  onChange,
  placeholder = "Type to search vendors...",
  className,
}: VendorSelectorProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorEmail, setNewVendorEmail] = useState("");
  const [newVendorWebsite, setNewVendorWebsite] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Sync inputValue with value prop
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Fetch all vendors
  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const response = await fetch("/api/vendors", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch vendors");
      }
      return response.json();
    },
  });

  // Filter and sort vendors based on input
  const filteredVendors = vendors
    .filter((v) =>
      v.name.toLowerCase().includes(inputValue.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Create vendor mutation
  const createVendorMutation = useMutation({
    mutationFn: async (newVendor: { name: string; email?: string; website?: string }) => {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newVendor),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create vendor");
      }

      return response.json();
    },
    onSuccess: (newVendor: Vendor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      onChange(newVendor.name);
      setInputValue(newVendor.name);
      setShowCreateDialog(false);
      setNewVendorName("");
      setNewVendorEmail("");
      setNewVendorWebsite("");
      toast({
        title: "Vendor created",
        description: `${newVendor.name} has been added to your vendors.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error creating vendor",
        description: error.message,
      });
    },
  });

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  // Handle selection
  const handleSelect = (vendorName: string) => {
    onChange(vendorName);
    setInputValue(vendorName);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle clear
  const handleClear = () => {
    onChange("");
    setInputValue("");
    inputRef.current?.focus();
  };

  // Handle create vendor
  const handleCreateVendor = () => {
    if (!newVendorName.trim()) {
      toast({
        variant: "destructive",
        title: "Vendor name required",
        description: "Please enter a vendor name.",
      });
      return;
    }
    createVendorMutation.mutate({
      name: newVendorName.trim(),
      email: newVendorEmail.trim() || undefined,
      website: newVendorWebsite.trim() || undefined,
    });
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
      }
      return;
    }

    // +1 for the "Create new vendor" option at the end
    const totalItems = filteredVendors.length + 1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredVendors.length) {
          handleSelect(filteredVendors[highlightedIndex].name);
        } else if (highlightedIndex === filteredVendors.length) {
          // "Create new vendor" option
          setNewVendorName(inputValue);
          setShowCreateDialog(true);
          setIsOpen(false);
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
        if (inputValue !== value) {
          setInputValue(value);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue, value]);

  return (
    <>
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
        {isOpen && (
          <div
            ref={listRef}
            className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
          >
            {filteredVendors.map((vendor, index) => (
              <div
                key={vendor.id}
                onClick={() => handleSelect(vendor.name)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm",
                  highlightedIndex === index && "bg-accent",
                  value === vendor.name && "bg-accent/50"
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <Check
                  className={cn(
                    "h-4 w-4 flex-shrink-0",
                    value === vendor.name ? "opacity-100" : "opacity-0"
                  )}
                />
                <span>{vendor.name}</span>
              </div>
            ))}

            {/* Create new vendor option */}
            <div
              onClick={() => {
                setNewVendorName(inputValue);
                setShowCreateDialog(true);
                setIsOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-t text-muted-foreground hover:text-foreground",
                highlightedIndex === filteredVendors.length && "bg-accent"
              )}
              onMouseEnter={() => setHighlightedIndex(filteredVendors.length)}
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span>Create new vendor{inputValue && `: "${inputValue}"`}</span>
            </div>
          </div>
        )}
      </div>

      {/* Create Vendor Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Vendor</DialogTitle>
            <DialogDescription>
              Add a new vendor to your system. Name is required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vendor-name">
                Vendor Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vendor-name"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                placeholder="e.g., Premium Milano"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-email">Email (optional)</Label>
              <Input
                id="vendor-email"
                type="email"
                value={newVendorEmail}
                onChange={(e) => setNewVendorEmail(e.target.value)}
                placeholder="e.g., info@vendor.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-website">Website (optional)</Label>
              <Input
                id="vendor-website"
                type="url"
                value={newVendorWebsite}
                onChange={(e) => setNewVendorWebsite(e.target.value)}
                placeholder="e.g., https://vendor.com"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewVendorName("");
                setNewVendorEmail("");
                setNewVendorWebsite("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateVendor}
              disabled={createVendorMutation.isPending || !newVendorName.trim()}
            >
              {createVendorMutation.isPending ? "Creating..." : "Create Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
