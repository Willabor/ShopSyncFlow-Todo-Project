import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUploadZone } from "./FileUploadZone";
import { Search, Image, FileText, Video, File, CheckCircle, LayoutGrid, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Types
interface FileRecord {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileType: 'image' | 'document' | 'video' | 'other';
  fileSize: number;
  cdnUrl: string;
  thumbnailUrl?: string;
  altText?: string;
  title?: string;
  uploadedBy?: string;
  uploadSource?: string;
  createdAt: string;
  updatedAt: string;
}

interface FilesResponse {
  success: boolean;
  files: FileRecord[];
  count: number;
  limit: number;
  offset: number;
}

export interface FilePickerProps {
  /** Whether to allow multiple file selection */
  multiple?: boolean;
  /** Accepted file types (MIME types) */
  accept?: string[];
  /** Maximum number of files to select */
  maxFiles?: number;
  /** Callback when files are selected */
  onSelect: (files: FileRecord[]) => void;
  /** Callback when canceled */
  onCancel?: () => void;
  /** Whether the picker is open */
  isOpen: boolean;
  /** Callback to close the picker */
  onClose: () => void;
  /** Whether to show Upload tab */
  allowUpload?: boolean;
  /** Whether to show Browse tab */
  allowBrowse?: boolean;
  /** Default active tab */
  defaultTab?: 'upload' | 'browse';
  /** Filter by file type */
  fileType?: 'image' | 'document' | 'video' | 'other' | 'all';
}

export function FilePicker({
  multiple = false,
  accept = [],
  maxFiles = 10,
  onSelect,
  onCancel,
  isOpen,
  onClose,
  allowUpload = true,
  allowBrowse = true,
  defaultTab = 'browse',
  fileType = 'all',
}: FilePickerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Browse tab state
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<string>(fileType);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedFiles(new Set());
      setPage(1);
      setSearchInput("");
      setDebouncedSearch("");
      setFileTypeFilter(fileType);
      setActiveTab(defaultTab);
    }
  }, [isOpen, fileType, defaultTab]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('offset', ((page - 1) * limit).toString());

    if (debouncedSearch) params.append('search', debouncedSearch);
    if (fileTypeFilter !== 'all') params.append('fileType', fileTypeFilter);
    params.append('sortBy', 'createdAt');
    params.append('sortOrder', 'desc');

    return params.toString();
  }, [page, limit, debouncedSearch, fileTypeFilter]);

  // Fetch files for Browse tab
  const { data, isLoading, error } = useQuery<FilesResponse>({
    queryKey: ["file-picker-files", queryParams],
    queryFn: async () => {
      const response = await fetch(`/api/files?${queryParams}`);
      if (!response.ok) throw new Error("Failed to fetch files");
      return response.json();
    },
    enabled: isOpen && allowBrowse,
  });

  // Handle file selection (Browse tab)
  const handleSelectFile = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);

      if (multiple) {
        if (next.has(fileId)) {
          next.delete(fileId);
        } else {
          if (next.size >= maxFiles) {
            toast({
              title: "Selection limit reached",
              description: `You can only select up to ${maxFiles} file(s)`,
              variant: "destructive",
            });
            return prev;
          }
          next.add(fileId);
        }
      } else {
        // Single selection - replace
        next.clear();
        next.add(fileId);
      }

      return next;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (!data || !multiple) return;

    const allFileIds = data.files.map(f => f.id);

    if (selectedFiles.size === allFileIds.length) {
      setSelectedFiles(new Set());
    } else {
      if (allFileIds.length > maxFiles) {
        toast({
          title: "Selection limit",
          description: `You can only select up to ${maxFiles} file(s). Selecting first ${maxFiles}.`,
          variant: "default",
        });
        setSelectedFiles(new Set(allFileIds.slice(0, maxFiles)));
      } else {
        setSelectedFiles(new Set(allFileIds));
      }
    }
  };

  // Handle confirm selection
  const handleConfirmSelection = () => {
    if (selectedFiles.size === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file",
        variant: "destructive",
      });
      return;
    }

    const selectedFileRecords = data?.files.filter(f => selectedFiles.has(f.id)) || [];
    onSelect(selectedFileRecords);
    onClose();
  };

  // Handle upload complete
  const handleUploadComplete = () => {
    // Invalidate the file list cache so the browse tab shows newly uploaded files
    queryClient.invalidateQueries({ queryKey: ["file-picker-files"] });
    toast({
      title: "Upload complete",
      description: "Switching to browse tab to select uploaded files",
    });
    // Switch to browse tab after upload
    setActiveTab('browse');
  };

  // Handle cancel
  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Get file icon
  const getFileIcon = (file: FileRecord) => {
    switch (file.fileType) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'video':
        return <Video className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const totalPages = data ? Math.ceil(data.count / limit) : 0;
  const hasFiles = data && data.files.length > 0;
  const isAllSelected = data && selectedFiles.size === data.files.length && data.files.length > 0;
  const isSomeSelected = selectedFiles.size > 0 && selectedFiles.size < (data?.files.length || 0);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5; // Maximum number of page buttons to show

    if (totalPages <= maxVisible + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page <= 3) {
        // Near the beginning
        for (let i = 2; i <= Math.min(maxVisible, totalPages - 1); i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
      } else if (page >= totalPages - 2) {
        // Near the end
        pages.push('ellipsis');
        for (let i = Math.max(totalPages - maxVisible + 1, 2); i < totalPages; i++) {
          pages.push(i);
        }
      } else {
        // In the middle
        pages.push('ellipsis');
        for (let i = page - 1; i <= page + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {multiple ? `Select Files (up to ${maxFiles})` : 'Select File'}
          </DialogTitle>
          <DialogDescription>
            {allowUpload && allowBrowse
              ? "Upload new files or browse existing ones"
              : allowUpload
              ? "Upload new files"
              : "Browse and select files"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full shrink-0" style={{ gridTemplateColumns: `repeat(${allowUpload && allowBrowse ? 2 : 1}, 1fr)` }}>
            {allowBrowse && (
              <TabsTrigger value="browse">
                Browse Files
                {selectedFiles.size > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedFiles.size}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {allowUpload && (
              <TabsTrigger value="upload">Upload New</TabsTrigger>
            )}
          </TabsList>

          {/* Browse Tab */}
          {allowBrowse && (
            <TabsContent value="browse" className="flex-1 flex flex-col space-y-4 overflow-hidden mt-4">
              {/* Search and Filters */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search files..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="File type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="document">Documents</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>

                {/* View Toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none"
                    title="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-l-none"
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Select All (only if multiple selection) */}
              {multiple && hasFiles && (
                <div className="flex items-center gap-2 px-2 shrink-0">
                  <Checkbox
                    checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all on this page
                  </span>
                </div>
              )}

              {/* File List - Scrollable Container */}
              <div className="flex-1 overflow-y-auto pr-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : error ? (
                  <Card className="border-destructive">
                    <CardContent className="p-6 text-center text-destructive">
                      Failed to load files. Please try again.
                    </CardContent>
                  </Card>
                ) : !hasFiles ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No files found
                      {(debouncedSearch || fileTypeFilter !== 'all') && (
                        <p className="text-sm mt-2">Try adjusting your filters</p>
                      )}
                    </CardContent>
                  </Card>
                ) : viewMode === 'list' ? (
                  // List View
                  <div className="space-y-2">
                  {data.files.map((file) => {
                    const isSelected = selectedFiles.has(file.id);

                    return (
                      <Card
                        key={file.id}
                        className={`cursor-pointer transition-colors hover:bg-accent ${
                          isSelected ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => handleSelectFile(file.id)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Checkbox or Selected Indicator */}
                            <div
                              className="flex-shrink-0 mt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {multiple ? (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleSelectFile(file.id)}
                                />
                              ) : (
                                isSelected && <CheckCircle className="h-5 w-5 text-primary" />
                              )}
                            </div>

                            {/* Thumbnail or Icon */}
                            <div className="flex-shrink-0">
                              {file.fileType === 'image' ? (
                                <img
                                  src={file.thumbnailUrl || file.cdnUrl}
                                  alt={file.altText || file.originalFilename}
                                  className="h-12 w-12 object-cover rounded"
                                  onError={(e) => {
                                    // Fallback to icon if image fails to load
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const parent = target.parentElement;
                                    if (parent) {
                                      const fallback = document.createElement('div');
                                      fallback.className = 'h-12 w-12 flex items-center justify-center bg-muted rounded';
                                      fallback.textContent = file.fileType || 'file';
                                      parent.appendChild(fallback);
                                    }
                                  }}
                                />
                              ) : (
                                <div className="h-12 w-12 flex items-center justify-center bg-muted rounded">
                                  {getFileIcon(file)}
                                </div>
                              )}
                            </div>

                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {file.title || file.originalFilename}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {file.fileSize > 0 && `${formatFileSize(file.fileSize)} • `}{file.mimeType}
                              </p>
                              {file.altText && (
                                <p className="text-xs text-muted-foreground truncate mt-1">
                                  {file.altText}
                                </p>
                              )}
                            </div>

                            {/* File Type Badge */}
                            <Badge variant="outline" className="flex-shrink-0">
                              {file.fileType}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                ) : (
                  // Grid View
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {data.files.map((file) => {
                      const isSelected = selectedFiles.has(file.id);

                      return (
                        <Card
                          key={file.id}
                          className={`cursor-pointer transition-colors hover:bg-accent ${
                            isSelected ? 'border-primary bg-primary/5' : ''
                          }`}
                          onClick={() => handleSelectFile(file.id)}
                        >
                          <CardContent className="p-3">
                            {/* Selection Indicator - Top Right */}
                            <div className="relative mb-2">
                              {/* Thumbnail or Icon - Square aspect ratio */}
                              <div className="aspect-square w-full overflow-hidden rounded-md bg-muted">
                                {file.fileType === 'image' ? (
                                  <img
                                    src={file.thumbnailUrl || file.cdnUrl}
                                    alt={file.altText || file.originalFilename}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // Fallback to icon if image fails to load
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent) {
                                        const fallback = document.createElement('div');
                                        fallback.className = 'w-full h-full flex items-center justify-center bg-muted';
                                        fallback.textContent = file.fileType || 'file';
                                        parent.appendChild(fallback);
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    {getFileIcon(file)}
                                  </div>
                                )}
                              </div>

                              {/* Checkbox or Selected Indicator - Absolute positioned */}
                              <div
                                className="absolute top-2 right-2 bg-background/80 rounded backdrop-blur-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {multiple ? (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleSelectFile(file.id)}
                                    className="border-2"
                                  />
                                ) : (
                                  isSelected && (
                                    <CheckCircle className="h-5 w-5 text-primary" />
                                  )
                                )}
                              </div>

                              {/* File Type Badge - Bottom Left */}
                              <div className="absolute bottom-2 left-2">
                                <Badge variant="secondary" className="text-xs">
                                  {file.fileType}
                                </Badge>
                              </div>
                            </div>

                            {/* File Info - Compact */}
                            <div className="space-y-1">
                              <p className="text-sm font-medium truncate" title={file.title || file.originalFilename}>
                                {file.title || file.originalFilename}
                              </p>
                              {file.fileSize > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(file.fileSize)}
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t shrink-0">
                  <p className="text-sm text-muted-foreground">
                    {data?.count} total files
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>

                    {/* Page Numbers */}
                    {getPageNumbers().map((pageNum, index) => {
                      if (pageNum === 'ellipsis') {
                        return (
                          <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                            ...
                          </span>
                        );
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPage(pageNum)}
                          className="min-w-[2.5rem]"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {/* Upload Tab */}
          {allowUpload && (
            <TabsContent value="upload" className="flex-1 overflow-y-auto mt-4">
              <FileUploadZone
                onUploadComplete={handleUploadComplete}
                maxFiles={maxFiles}
                acceptedTypes={accept.length > 0 ? accept : undefined}
              />
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          {allowBrowse && activeTab === 'browse' && (
            <Button
              onClick={handleConfirmSelection}
              disabled={selectedFiles.size === 0}
            >
              Select {selectedFiles.size > 0 ? `(${selectedFiles.size})` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
