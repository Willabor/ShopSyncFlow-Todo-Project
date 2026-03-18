import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ImageIcon, X, Upload, Loader2 } from "lucide-react";
import type { ProductVariant } from "@shared/schema";
import type { SaveStatus } from "./VariantEditorHeader";

interface VariantImageSectionProps {
  variant: ProductVariant;
  productId: string;
  onSaveStatusChange: (status: SaveStatus) => void;
}

export function VariantImageSection({
  variant,
  productId,
  onSaveStatusChange,
}: VariantImageSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState(false);

  // Reset image error when variant changes
  useEffect(() => {
    setImageError(false);
    setSelectedFile(null);
  }, [variant.id]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`/api/products/${productId}/variants/${variant.id}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to upload image");
      }

      return res.json();
    },
    onMutate: () => {
      onSaveStatusChange("saving");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      onSaveStatusChange("saved");
      toast({ title: "Image uploaded successfully" });
      setTimeout(() => onSaveStatusChange("idle"), 2000);
      setSelectedFile(null);
      setImageError(false);
    },
    onError: (error: Error) => {
      onSaveStatusChange("error");
      toast({
        title: "Failed to upload image",
        description: error.message,
        variant: "destructive",
      });
      setTimeout(() => onSaveStatusChange("idle"), 3000);
      setSelectedFile(null);
    },
  });

  // Delete image mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants/${variant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageUrl: null }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to remove image");
      }

      return res.json();
    },
    onMutate: () => {
      onSaveStatusChange("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["variants", productId] });
      onSaveStatusChange("saved");
      toast({ title: "Image removed" });
      setTimeout(() => onSaveStatusChange("idle"), 2000);
    },
    onError: (error: Error) => {
      onSaveStatusChange("error");
      toast({
        title: "Failed to remove image",
        description: error.message,
        variant: "destructive",
      });
      setTimeout(() => onSaveStatusChange("idle"), 3000);
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

    setSelectedFile(file);
    uploadMutation.mutate(file);
  };

  const handleRemoveImage = () => {
    deleteMutation.mutate();
  };

  const isUploading = uploadMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const hasImage = !!variant.imageUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Image</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File upload section */}
        <div>
          <Label>Upload image</Label>
          <div className="flex gap-2 mt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isDeleting}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Choose image
                </>
              )}
            </Button>
            {hasImage && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRemoveImage}
                disabled={isUploading || isDeleting}
                title="Remove image"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Supported: JPEG, PNG, GIF. Max size: 10MB
          </p>
        </div>

        {/* Image preview */}
        <div>
          <Label>Preview</Label>
          <div className="mt-2 w-full max-w-xs aspect-square rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
            {hasImage && !imageError ? (
              <img
                src={variant.imageUrl || ""}
                alt="Variant preview"
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
                onLoad={() => setImageError(false)}
              />
            ) : (
              <div className="text-center p-8">
                <ImageIcon className="mx-auto h-16 w-16 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">
                  {imageError ? "Failed to load image" : "No image"}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
