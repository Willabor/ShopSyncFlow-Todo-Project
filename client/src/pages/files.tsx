import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { FileIcon, Upload, Image, FileText, Video, File, ChevronDown, ChevronUp, Search, X, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FileUploadZone } from "@/components/files/FileUploadZone";
import { FileDetailModal } from "@/components/files/FileDetailModal";
import { MainLayout } from "@/components/layouts";

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

export default function FilesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [showUploadZone, setShowUploadZone] = useState(false);

  // File detail modal state
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Bulk selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Bulk delete state
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [deleteResults, setDeleteResults] = useState<{
    success: string[];
    failed: { id: string; error: string }[];
    inUse: string[];
  }>({ success: [], failed: [], inUse: [] });

  // Search and filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [sortOrder, setSortOrder] = useState<string>("desc");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to first page on search
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
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);

    return params.toString();
  }, [page, limit, debouncedSearch, fileTypeFilter, sortBy, sortOrder]);

  // Fetch files
  const { data, isLoading, isError, error } = useQuery<FilesResponse>({
    queryKey: ['files', queryParams],
    queryFn: async () => {
      const response = await fetch(`/api/files?${queryParams}`);

      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      return response.json();
    },
  });

  const totalPages = data ? Math.ceil(data.count / limit) : 1;

  // Count active filters
  const activeFiltersCount = [
    debouncedSearch,
    fileTypeFilter !== 'all',
    sortBy !== 'createdAt' || sortOrder !== 'desc',
  ].filter(Boolean).length;

  // Handle upload complete
  const handleUploadComplete = () => {
    // Invalidate files query to refetch
    queryClient.invalidateQueries({ queryKey: ['files'] });
    // Hide upload zone after successful upload
    setShowUploadZone(false);
    // Reset to first page
    setPage(1);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setFileTypeFilter("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setPage(1);
  };

  // Handle file click
  const handleFileClick = (fileId: string) => {
    setSelectedFileId(fileId);
    setShowDetailModal(true);
  };

  // Handle modal close
  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedFileId(null);
  };

  // Handle file updated
  const handleFileUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
  };

  // Handle file deleted
  const handleFileDeleted = () => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
  };

  // Handle checkbox selection
  const handleSelectFile = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (!data?.files) return;

    if (selectedFiles.size === data.files.length) {
      // Deselect all
      setSelectedFiles(new Set());
    } else {
      // Select all visible files on current page
      setSelectedFiles(new Set(data.files.map(f => f.id)));
    }
  };

  // Clear selection on page change or filter change
  useEffect(() => {
    setSelectedFiles(new Set());
  }, [page, queryParams]);

  // Calculate selection states
  const isAllSelected = data?.files && selectedFiles.size === data.files.length && data.files.length > 0;
  const isSomeSelected = selectedFiles.size > 0 && selectedFiles.size < (data?.files.length || 0);

  // Handle bulk delete
  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true);
  };

  const executeBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    setIsBulkDeleting(true);
    setDeletedCount(0);

    const results = {
      success: [] as string[],
      failed: [] as { id: string; error: string }[],
      inUse: [] as string[],
    };

    const filesArray = Array.from(selectedFiles);
    let processed = 0;

    // Delete files sequentially
    for (const fileId of filesArray) {
      try {
        const response = await fetch(`/api/files/${fileId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          results.success.push(fileId);
        } else {
          const error = await response.json();
          if (error.message?.includes('in use')) {
            results.inUse.push(fileId);
          } else {
            results.failed.push({ id: fileId, error: error.message || 'Unknown error' });
          }
        }
      } catch (error) {
        results.failed.push({ id: fileId, error: 'Network error' });
      }

      processed++;
      setDeletedCount(processed);
    }

    setIsBulkDeleting(false);
    setSelectedFiles(new Set());
    setDeleteResults(results);

    // Refresh file list
    queryClient.invalidateQueries({ queryKey: ['files'] });

    // Show results
    if (results.success.length > 0 && results.failed.length === 0 && results.inUse.length === 0) {
      // All success
      toast({
        title: "Success",
        description: `${results.success.length} file(s) deleted successfully`,
      });
    } else {
      // Mixed results - show detailed dialog
      setShowResultsDialog(true);
    }
  };

  return (
    <MainLayout
      title="Files"
      subtitle="Manage your uploaded files and media assets"
      actions={
        <Button onClick={() => setShowUploadZone(!showUploadZone)}>
          {showUploadZone ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Hide Upload
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </>
          )}
        </Button>
      }
    >
      <div className="p-8 space-y-6">

      {/* Upload Zone */}
      {showUploadZone && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Files</CardTitle>
            <CardDescription>
              Drag and drop files here or click to browse. Maximum 10 files, 20 MB each.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUploadZone onUploadComplete={handleUploadComplete} />
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files by name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap gap-3">
              {/* File Type Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Files</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="document">Documents</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort:</span>
                <Select
                  value={`${sortBy}-${sortOrder}`}
                  onValueChange={(value) => {
                    const [newSortBy, newSortOrder] = value.split('-');
                    setSortBy(newSortBy);
                    setSortOrder(newSortOrder);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt-desc">Newest First</SelectItem>
                    <SelectItem value="createdAt-asc">Oldest First</SelectItem>
                    <SelectItem value="filename-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="filename-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="fileSize-desc">Largest First</SelectItem>
                    <SelectItem value="fileSize-asc">Smallest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters Button */}
              {activeFiltersCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllFilters}
                  className="ml-auto"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear Filters ({activeFiltersCount})
                </Button>
              )}
            </div>

            {/* Active Filters Badges */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {debouncedSearch && (
                  <Badge variant="secondary" className="gap-1">
                    Search: "{debouncedSearch}"
                    <button
                      onClick={() => setSearchInput("")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {fileTypeFilter !== 'all' && (
                  <Badge variant="secondary" className="gap-1">
                    Type: {fileTypeFilter}
                    <button
                      onClick={() => setFileTypeFilter("all")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {(sortBy !== 'createdAt' || sortOrder !== 'desc') && (
                  <Badge variant="secondary" className="gap-1">
                    Sorted
                    <button
                      onClick={() => {
                        setSortBy("createdAt");
                        setSortOrder("desc");
                      }}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.count || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Images</CardTitle>
            <Image className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.files.filter(f => f.fileType === 'image').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.files.filter(f => f.fileType === 'document').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Videos</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.files.filter(f => f.fileType === 'video').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Files List */}
      <Card>
        <CardHeader>
          <CardTitle>All Files</CardTitle>
          <CardDescription>
            {data?.count || 0} files uploaded
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-3 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="text-center py-12">
              <FileIcon className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Failed to load files</h3>
              <p className="text-muted-foreground mt-2">
                {error instanceof Error ? error.message : 'An error occurred'}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          )}

          {data && data.files.length === 0 && (
            <div className="text-center py-12">
              <FileIcon className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No files uploaded yet</h3>
              <p className="text-muted-foreground mt-2">
                Upload your first file to get started
              </p>
              <Button className="mt-4">
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>
          )}

          {data && data.files.length > 0 && (
            <>
              {/* Select All Row */}
              <div className="flex items-center space-x-4 p-3 border-b bg-muted/50">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all files"
                    className={isSomeSelected && !isAllSelected ? "data-[state=checked]:bg-primary" : ""}
                  />
                  <span className="text-sm font-medium">
                    {selectedFiles.size > 0
                      ? `${selectedFiles.size} selected`
                      : "Select all"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {data.files.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    isSelected={selectedFiles.has(file.id)}
                    onSelect={handleSelectFile}
                    onClick={() => handleFileClick(file.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({data.count} total files)
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
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
            </>
          )}
        </CardContent>
      </Card>

      {/* File Detail Modal */}
      <FileDetailModal
        fileId={selectedFileId}
        isOpen={showDetailModal}
        onClose={handleCloseModal}
        onFileUpdated={handleFileUpdated}
        onFileDeleted={handleFileDeleted}
      />

      {/* Bulk Actions Bar */}
      {selectedFiles.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
          <Card className="shadow-2xl border-2">
            <CardContent className="flex items-center gap-4 p-4">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
              </Badge>

              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedFiles(new Set())}
              >
                <X className="mr-2 h-4 w-4" />
                Clear Selection
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} file(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Files that are currently in use will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {selectedFiles.size} file(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Progress Overlay */}
      {isBulkDeleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <Card className="p-6 min-w-[300px]">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="font-medium">Deleting files...</p>
                <Progress
                  value={(deletedCount / selectedFiles.size) * 100}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  {deletedCount} of {selectedFiles.size} files processed
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Delete Results Dialog */}
      <AlertDialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Delete Results</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            {deleteResults.success.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-green-600 font-semibold">✓</span>
                <p className="text-sm">
                  {deleteResults.success.length} file(s) deleted successfully
                </p>
              </div>
            )}
            {deleteResults.inUse.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-amber-600 font-semibold">⚠</span>
                <p className="text-sm">
                  {deleteResults.inUse.length} file(s) could not be deleted (currently in use)
                </p>
              </div>
            )}
            {deleteResults.failed.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-destructive font-semibold">✗</span>
                <p className="text-sm">
                  {deleteResults.failed.length} file(s) failed to delete
                </p>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </MainLayout>
  );
}

// File Row Component
function FileRow({
  file,
  isSelected,
  onSelect,
  onClick,
}: {
  file: FileRecord;
  isSelected: boolean;
  onSelect: (fileId: string) => void;
  onClick: () => void;
}) {
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image':
        return <Image className="h-5 w-5 text-blue-500" />;
      case 'document':
        return <FileText className="h-5 w-5 text-orange-500" />;
      case 'video':
        return <Video className="h-5 w-5 text-purple-500" />;
      default:
        return <File className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
  };

  return (
    <div
      className={`flex items-center space-x-4 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer ${
        isSelected ? "bg-accent/50" : ""
      }`}
      onClick={onClick}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0" onClick={handleCheckboxClick}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(file.id)}
          aria-label={`Select ${file.originalFilename}`}
        />
      </div>

      {/* Thumbnail/Icon */}
      <div className="flex-shrink-0">
        {file.fileType === 'image' ? (
          <img
            src={file.cdnUrl}
            alt={file.altText || file.originalFilename}
            className="h-12 w-12 object-cover rounded"
            loading="lazy"
          />
        ) : (
          <div className="h-12 w-12 flex items-center justify-center bg-muted rounded">
            {getFileIcon(file.fileType)}
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium truncate">
            {file.title || file.originalFilename}
          </p>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
            {file.fileType}
          </span>
        </div>
        <div className="flex items-center space-x-4 mt-1">
          <p className="text-sm text-muted-foreground">{formatFileSize(file.fileSize)}</p>
          <p className="text-sm text-muted-foreground">{formatDate(file.createdAt)}</p>
          {file.uploadSource && (
            <p className="text-xs text-muted-foreground">
              Source: {file.uploadSource}
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
