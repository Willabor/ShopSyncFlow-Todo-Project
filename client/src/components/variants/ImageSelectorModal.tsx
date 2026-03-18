import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2, Check, Grid3x3, List } from "lucide-react";
import type { ProductVariant } from "@shared/schema";

interface ImageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  variants: ProductVariant[]; // All variants in this group
  currentImage: string | null;
  option1Value: string; // For display (e.g., "green blue pink")
}

export function ImageSelectorModal({
  isOpen,
  onClose,
  productId,
  variants,
  currentImage,
  option1Value,
}: ImageSelectorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(currentImage);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch product images from API
  const { data: productImages = [] } = useQuery<Array<{ url: string }>>({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/images`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch images");
      return res.json();
    },
    enabled: isOpen,
  });

  // Map to include selection state
  const existingImages = productImages.map((img) => ({
    url: img.url,
    isSelected: img.url === selectedImage,
  }));

  // Upload new image mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("image", file);

      // Upload to first variant in group (we'll use this URL for all)
      const res = await fetch(
        `/api/products/${productId}/variants/${variants[0].id}/upload`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to upload image");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setIsUploading(false);
      setSelectedImage(data.imageUrl);
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      toast({ title: "Image uploaded successfully" });
    },
    onError: (error: Error) => {
      setIsUploading(false);
      toast({
        title: "Failed to upload image",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Apply image to all variants in group
  const applyImageMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const errors: string[] = [];

      for (const variant of variants) {
        try {
          const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ imageUrl }),
          });

          if (!res.ok) {
            errors.push(variant.id);
          }
        } catch (error) {
          errors.push(variant.id);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} variant(s)`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      toast({
        title: "Image applied",
        description: `Updated ${variants.length} variant(s)`,
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to apply image",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, or GIF image",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(file);
  };

  const handleDone = () => {
    if (!selectedImage) {
      toast({
        title: "No image selected",
        description: "Please select or upload an image",
        variant: "destructive",
      });
      return;
    }

    applyImageMutation.mutate(selectedImage);
  };

  const handleImageClick = (url: string) => {
    setSelectedImage(url);
  };

  const filteredImages = existingImages.filter((img) =>
    img.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Select image</DialogTitle>
          <DialogDescription>
            Choose an image for {option1Value} ({variants.length} variant
            {variants.length !== 1 ? "s" : ""})
          </DialogDescription>
        </DialogHeader>

        {/* Search and Controls */}
        <div className="space-y-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search files"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-8 px-2"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-8 px-2"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Upload Area */}
          <div className="border-2 border-dashed rounded-lg p-4 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Add files
                  </>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                or drag and drop
              </span>
            </div>
          </div>
        </div>

        {/* Image Grid/List */}
        <div className="flex-1 overflow-y-auto border rounded-md p-4 min-h-0">
          {filteredImages.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              {existingImages.length === 0
                ? "No images yet. Upload an image to get started."
                : "No images match your search."}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-4 gap-4">
              {filteredImages.map((img) => (
                <div
                  key={img.url}
                  className={`relative aspect-square border-2 rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    selectedImage === img.url
                      ? "border-primary ring-2 ring-primary"
                      : "border-border"
                  }`}
                  onClick={() => handleImageClick(img.url)}
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === img.url && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredImages.map((img) => (
                <div
                  key={img.url}
                  className={`flex items-center gap-3 p-2 border rounded-lg cursor-pointer transition-all hover:bg-muted ${
                    selectedImage === img.url
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  onClick={() => handleImageClick(img.url)}
                >
                  <div className="w-12 h-12 border rounded overflow-hidden flex-shrink-0">
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 text-sm truncate">{img.url}</div>
                  {selectedImage === img.url && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - always visible */}
        <DialogFooter className="flex-shrink-0 border-t pt-4 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={applyImageMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDone}
            disabled={applyImageMutation.isPending || !selectedImage}
          >
            {applyImageMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Apply Image
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
