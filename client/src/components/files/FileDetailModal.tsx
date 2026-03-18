import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Trash2,
  Edit,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  File,
  X,
} from "lucide-react";

// Types
interface FileRecord {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileType: "image" | "document" | "video" | "other";
  fileSize: number;
  cdnUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  title?: string;
  width?: number;
  height?: number;
  uploadedBy?: string;
  uploadSource?: string;
  createdAt: string;
  updatedAt: string;
}

interface FileDetailResponse {
  success: boolean;
  file: FileRecord;
  usage: {
    totalUsage: number;
    productCount: number;
    variantCount: number;
    referenceCount: number;
  };
}

interface FileDetailModalProps {
  fileId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onFileUpdated?: () => void;
  onFileDeleted?: () => void;
}

export function FileDetailModal({
  fileId,
  isOpen,
  onClose,
  onFileUpdated,
  onFileDeleted,
}: FileDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [isEditing, setIsEditing] = useState(false);
  const [altText, setAltText] = useState("");
  const [title, setTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Fetch file details
  const { data, isLoading, error } = useQuery<FileDetailResponse>({
    queryKey: ["file", fileId],
    queryFn: async () => {
      if (!fileId) throw new Error("No file ID provided");

      const response = await fetch(`/api/files/${fileId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch file details");
      }

      return response.json();
    },
    enabled: !!fileId && isOpen,
  });

  // Initialize form values when data loads
  useEffect(() => {
    if (data?.file) {
      setAltText(data.file.altText || "");
      setTitle(data.file.title || "");
    }
  }, [data]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setShowDeleteConfirm(false);
    }
  }, [isOpen]);

  // Update metadata mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: { altText?: string; title?: string }) => {
      if (!fileId) throw new Error("No file ID");

      const response = await fetch(`/api/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update file");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file", fileId] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "File metadata updated successfully",
      });
      onFileUpdated?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!fileId) throw new Error("No file ID");

      const response = await fetch(`/api/files/${fileId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete file");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      toast({
        title: "Success",
        description: "File deleted successfully",
      });
      onFileDeleted?.();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleSave = () => {
    updateMutation.mutate({ altText, title });
  };

  const handleCancel = () => {
    if (data?.file) {
      setAltText(data.file.altText || "");
      setTitle(data.file.title || "");
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteMutation.mutate();
  };

  const handleCopyUrl = async () => {
    if (!data?.file) return;

    try {
      await navigator.clipboard.writeText(data.file.cdnUrl);
      toast({
        title: "Success",
        description: "CDN URL copied to clipboard",
      });
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = data.file.cdnUrl;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        toast({
          title: "Success",
          description: "CDN URL copied to clipboard",
        });
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to copy URL",
          variant: "destructive",
        });
      }
      document.body.removeChild(textArea);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Get file type icon
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "image":
        return <ImageIcon className="h-5 w-5" />;
      case "document":
        return <FileText className="h-5 w-5" />;
      case "video":
        return <VideoIcon className="h-5 w-5" />;
      default:
        return <File className="h-5 w-5" />;
    }
  };

  // Validation
  const hasChanges =
    altText !== (data?.file.altText || "") ||
    title !== (data?.file.title || "");
  const isAltTextValid = altText.length <= 500;
  const isTitleValid = title.length <= 200;
  const canSave = hasChanges && isAltTextValid && isTitleValid;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File Details</DialogTitle>
          <DialogDescription>
            View and manage file information
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-destructive">
              Error loading file: {error.message}
            </p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Preview */}
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/20">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  {getFileIcon(data.file.fileType)}
                  Preview
                </h3>

                {/* Image Preview */}
                {data.file.fileType === "image" && (
                  <div className="relative bg-background rounded border overflow-hidden">
                    <img
                      src={data.file.cdnUrl}
                      alt={data.file.altText || data.file.originalFilename}
                      className="w-full h-auto max-h-96 object-contain"
                    />
                  </div>
                )}

                {/* Video Preview */}
                {data.file.fileType === "video" && (
                  <div className="relative bg-background rounded border overflow-hidden">
                    <video
                      src={data.file.cdnUrl}
                      controls
                      className="w-full h-auto max-h-96"
                    />
                  </div>
                )}

                {/* Document Preview */}
                {data.file.fileType === "document" && (
                  <div className="flex flex-col items-center justify-center py-12 bg-background rounded border">
                    <FileText className="h-20 w-20 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Document Preview
                    </p>
                  </div>
                )}

                {/* Other Files */}
                {data.file.fileType === "other" && (
                  <div className="flex flex-col items-center justify-center py-12 bg-background rounded border">
                    <File className="h-20 w-20 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No Preview Available
                    </p>
                  </div>
                )}
              </div>

              {/* File Info */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{data.file.fileType}</Badge>
                  <span className="text-muted-foreground">
                    {data.file.mimeType}
                  </span>
                </div>
                <p>
                  <span className="font-medium">Size:</span>{" "}
                  {formatFileSize(data.file.fileSize)}
                </p>
                {data.file.width && data.file.height && (
                  <p>
                    <span className="font-medium">Dimensions:</span>{" "}
                    {data.file.width} × {data.file.height}
                  </p>
                )}
                <p>
                  <span className="font-medium">Original Name:</span>{" "}
                  {data.file.originalFilename}
                </p>
                <p>
                  <span className="font-medium">Uploaded:</span>{" "}
                  {formatDate(data.file.createdAt)}
                </p>
                {data.file.uploadedBy && (
                  <p>
                    <span className="font-medium">Uploaded By:</span>{" "}
                    {data.file.uploadedBy}
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: Metadata & Actions */}
            <div className="space-y-4">
              {/* Metadata Section */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Metadata</h3>
                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                </div>

                {!isEditing ? (
                  // View Mode
                  <div className="space-y-3">
                    <div>
                      <Label>Alt Text</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {data.file.altText || "No alt text"}
                      </p>
                    </div>
                    <div>
                      <Label>Title</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {data.file.title || "No title"}
                      </p>
                    </div>
                  </div>
                ) : (
                  // Edit Mode
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="altText">
                        Alt Text{" "}
                        <span className="text-xs text-muted-foreground">
                          ({altText.length}/500)
                        </span>
                      </Label>
                      <Textarea
                        id="altText"
                        value={altText}
                        onChange={(e) => setAltText(e.target.value)}
                        placeholder="Describe this image for accessibility..."
                        className={`mt-1 ${
                          !isAltTextValid ? "border-destructive" : ""
                        }`}
                        maxLength={500}
                      />
                      {!isAltTextValid && (
                        <p className="text-xs text-destructive mt-1">
                          Alt text must be 500 characters or less
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="title">
                        Title{" "}
                        <span className="text-xs text-muted-foreground">
                          ({title.length}/200)
                        </span>
                      </Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Enter a title..."
                        className={`mt-1 ${
                          !isTitleValid ? "border-destructive" : ""
                        }`}
                        maxLength={200}
                      />
                      {!isTitleValid && (
                        <p className="text-xs text-destructive mt-1">
                          Title must be 200 characters or less
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!canSave || updateMutation.isPending}
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={updateMutation.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Usage Information */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3">Usage Information</h3>

                {data.usage.totalUsage === 0 ? (
                  <Badge variant="secondary">Unused</Badge>
                ) : (
                  <div className="space-y-2">
                    <Badge variant="default">
                      Used in {data.usage.totalUsage}{" "}
                      {data.usage.totalUsage === 1 ? "place" : "places"}
                    </Badge>
                    <ul className="text-sm space-y-1 mt-2">
                      {data.usage.productCount > 0 && (
                        <li>
                          Products: <strong>{data.usage.productCount}</strong>
                        </li>
                      )}
                      {data.usage.variantCount > 0 && (
                        <li>
                          Variants: <strong>{data.usage.variantCount}</strong>
                        </li>
                      )}
                      {data.usage.referenceCount > 0 && (
                        <li>
                          References:{" "}
                          <strong>{data.usage.referenceCount}</strong>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-3">Actions</h3>

                <div className="space-y-2">
                  {/* Copy URL Button */}
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleCopyUrl}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy CDN URL
                  </Button>

                  {/* Delete Button */}
                  {!showDeleteConfirm ? (
                    <Button
                      variant="destructive"
                      className="w-full justify-start"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={data.usage.totalUsage > 0}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete File
                    </Button>
                  ) : (
                    <div className="space-y-2 p-3 border border-destructive rounded-lg bg-destructive/10">
                      <p className="text-sm font-medium text-destructive">
                        Are you sure you want to delete this file?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        This action cannot be undone.
                      </p>
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleDelete}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending
                            ? "Deleting..."
                            : "Yes, Delete"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={deleteMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {data.usage.totalUsage > 0 && (
                    <p className="text-xs text-muted-foreground">
                      This file cannot be deleted because it is currently in
                      use.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
