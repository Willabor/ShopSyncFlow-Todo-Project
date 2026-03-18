import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Tag {
  id: string;
  name: string;
  productCount?: number;
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({
  value = [],
  onChange,
  placeholder = "Add tags...",
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all tags from API
  const { data: allTags = [], isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      const response = await fetch("/api/tags", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch tags");
      }
      return response.json();
    },
  });

  // Filter tags based on input (exclude already selected)
  const filteredTags = allTags
    .filter((tag) =>
      tag.name.toLowerCase().includes(inputValue.toLowerCase()) &&
      !value.some(v => v.toLowerCase() === tag.name.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20); // Limit to 20 suggestions

  // Check if input matches an existing tag exactly
  const exactMatch = allTags.some(
    (tag) => tag.name.toLowerCase() === inputValue.toLowerCase()
  );

  // Check if we should show "Create new tag" option
  const showCreateOption = inputValue.trim() && !exactMatch &&
    !value.some(v => v.toLowerCase() === inputValue.toLowerCase().trim());

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: async (tagName: string) => {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: tagName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create tag");
      }

      return response.json();
    },
    onSuccess: (newTag: Tag) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      addTag(newTag.name);
      toast({
        title: "Tag created",
        description: `"${newTag.name}" has been added to your tags.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error creating tag",
        description: error.message,
      });
    },
  });

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !value.some(v => v.toLowerCase() === trimmedTag.toLowerCase())) {
      onChange([...value, trimmedTag]);
      setInputValue("");
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleCreateTag = () => {
    const trimmedInput = inputValue.trim();
    if (trimmedInput) {
      createTagMutation.mutate(trimmedInput);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || (e.key === "Enter" && inputValue)) {
        setIsOpen(true);
        return;
      }
    }

    const totalItems = filteredTags.length + (showCreateOption ? 1 : 0);

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
        if (highlightedIndex >= 0 && highlightedIndex < filteredTags.length) {
          addTag(filteredTags[highlightedIndex].name);
        } else if (highlightedIndex === filteredTags.length && showCreateOption) {
          handleCreateTag();
        } else if (inputValue.trim()) {
          // If nothing highlighted but input has value, add it
          const existingTag = allTags.find(
            (t) => t.name.toLowerCase() === inputValue.toLowerCase().trim()
          );
          if (existingTag) {
            addTag(existingTag.name);
          } else {
            handleCreateTag();
          }
        }
        break;
      case ",":
        e.preventDefault();
        if (inputValue.trim()) {
          const existingTag = allTags.find(
            (t) => t.name.toLowerCase() === inputValue.toLowerCase().trim()
          );
          if (existingTag) {
            addTag(existingTag.name);
          } else {
            handleCreateTag();
          }
        }
        break;
      case "Backspace":
        if (!inputValue && value.length > 0) {
          removeTag(value[value.length - 1]);
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
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/* Tags Display */}
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="pl-2 pr-1 py-1 text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 hover:bg-muted rounded-sm p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Input */}
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsOpen(true)}
        placeholder={isLoading ? "Loading tags..." : (value.length === 0 ? placeholder : "Add more tags...")}
        disabled={isLoading}
      />

      {/* Suggestions Dropdown */}
      {isOpen && (filteredTags.length > 0 || showCreateOption) && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
        >
          {filteredTags.map((tag, index) => (
            <div
              key={tag.id}
              onClick={() => addTag(tag.name)}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-2 cursor-pointer text-sm",
                highlightedIndex === index && "bg-accent",
                value.includes(tag.name) && "bg-accent/50"
              )}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="flex items-center gap-2">
                <Check
                  className={cn(
                    "h-4 w-4 flex-shrink-0",
                    value.includes(tag.name) ? "opacity-100" : "opacity-0"
                  )}
                />
                <span>{tag.name}</span>
              </div>
              {tag.productCount !== undefined && tag.productCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {tag.productCount} products
                </span>
              )}
            </div>
          ))}

          {/* Create new tag option */}
          {showCreateOption && (
            <div
              onClick={handleCreateTag}
              className={cn(
                "flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-t text-muted-foreground hover:text-foreground",
                highlightedIndex === filteredTags.length && "bg-accent"
              )}
              onMouseEnter={() => setHighlightedIndex(filteredTags.length)}
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span>Create tag: "{inputValue.trim()}"</span>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1">
        Type to search existing tags or create new ones
      </p>
    </div>
  );
}
