import { useCallback, useState } from "react";
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface FileUploadState {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: {
    id: string;
    filename: string;
    cdnUrl: string;
  };
}

interface FileUploadZoneProps {
  onUploadComplete?: () => void;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  acceptedTypes?: string[];
}

const DEFAULT_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'video/mp4',
  'video/quicktime',
];

const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const DEFAULT_MAX_FILES = 10;

export function FileUploadZone({
  onUploadComplete,
  maxFiles = DEFAULT_MAX_FILES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}: FileUploadZoneProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Validate file
  const validateFile = (file: File): string | null => {
    if (!acceptedTypes.includes(file.type)) {
      return `File type "${file.type}" is not allowed`;
    }
    if (file.size > maxFileSize) {
      const sizeMB = (maxFileSize / 1024 / 1024).toFixed(0);
      return `File size exceeds ${sizeMB} MB limit`;
    }
    return null;
  };

  // Handle file selection
  const handleFiles = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return;

      const newFiles: FileUploadState[] = [];
      const errors: string[] = [];

      // Validate total file count
      if (files.length + selectedFiles.length > maxFiles) {
        toast({
          title: "Too many files",
          description: `You can only upload ${maxFiles} files at a time`,
          variant: "destructive",
        });
        return;
      }

      // Validate each file
      Array.from(selectedFiles).forEach((file) => {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          newFiles.push({
            file,
            progress: 0,
            status: 'pending',
          });
        }
      });

      // Show validation errors
      if (errors.length > 0) {
        toast({
          title: `${errors.length} file(s) rejected`,
          description: errors[0], // Show first error
          variant: "destructive",
        });
      }

      // Add valid files to state
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [files.length, maxFiles, maxFileSize, acceptedTypes, toast]
  );

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  // Handle file input change
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // Reset input value to allow re-selecting same file
      e.target.value = '';
    },
    [handleFiles]
  );

  // Remove file from list
  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload files
  const uploadFiles = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Create FormData
      const formData = new FormData();
      files.forEach((fileState) => {
        formData.append('files', fileState.file);
      });

      // Update all files to "uploading" status
      setFiles((prev) =>
        prev.map((f) => ({ ...f, status: 'uploading' as const, progress: 0 }))
      );

      // Upload to API
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include', // Include session cookie
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || errorData.message || `Upload failed (${response.status})`);
      }

      const result = await response.json();

      if (result.success) {
        // Update file states with success
        setFiles((prev) =>
          prev.map((f, i) => ({
            ...f,
            status: 'success' as const,
            progress: 100,
            result: result.files[i],
          }))
        );

        toast({
          title: "Upload successful",
          description: `${result.uploaded} file(s) uploaded successfully`,
        });

        // Call onUploadComplete callback
        if (onUploadComplete) {
          setTimeout(() => {
            onUploadComplete();
          }, 1000);
        }

        // Clear files after 2 seconds
        setTimeout(() => {
          setFiles([]);
        }, 2000);
      } else {
        // Handle partial success
        setFiles((prev) =>
          prev.map((f, i) => {
            const wasSuccess = result.files.some((rf: any) => rf.filename === f.file.name);
            return {
              ...f,
              status: wasSuccess ? 'success' : 'error' as const,
              progress: wasSuccess ? 100 : 0,
              error: wasSuccess ? undefined : (result.errors?.[i] || 'Upload failed'),
              result: wasSuccess ? result.files[i] : undefined,
            };
          })
        );

        toast({
          title: "Upload completed with errors",
          description: `${result.uploaded} succeeded, ${result.failed} failed`,
          variant: "destructive",
        });
      }
    } catch (error) {
      // Mark all files as error
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: 'error' as const,
          progress: 0,
          error: error instanceof Error ? error.message : 'Upload failed',
        }))
      );

      toast({
        title: "Upload failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Clear all files
  const clearFiles = () => {
    setFiles([]);
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const hasFiles = files.length > 0;
  const canUpload = hasFiles && !isUploading && files.some(f => f.status === 'pending');
  const allSuccess = hasFiles && files.every(f => f.status === 'success');

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      {!allSuccess && (
        <Card
          className={`border-2 border-dashed transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Upload className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Drop files here or click to browse
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Maximum {maxFiles} files, up to {(maxFileSize / 1024 / 1024).toFixed(0)} MB each
            </p>
            <input
              type="file"
              id="file-upload-input"
              className="hidden"
              multiple
              accept={acceptedTypes.join(',')}
              onChange={handleFileInputChange}
              disabled={isUploading}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById('file-upload-input')?.click()}
              disabled={isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Select Files
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Accepted: Images, PDFs, Videos, Documents
            </p>
          </div>
        </Card>
      )}

      {/* File List */}
      {hasFiles && (
        <div className="space-y-3">
          {files.map((fileState, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-start space-x-3">
                {/* Status Icon */}
                <div className="flex-shrink-0 mt-1">
                  {fileState.status === 'uploading' && (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  )}
                  {fileState.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {fileState.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  )}
                  {fileState.status === 'pending' && (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {fileState.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(fileState.file.size)} • {fileState.file.type}
                      </p>
                      {fileState.error && (
                        <p className="text-xs text-destructive mt-1">
                          {fileState.error}
                        </p>
                      )}
                    </div>
                    {fileState.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {fileState.status === 'uploading' && (
                    <Progress value={fileState.progress} className="mt-2 h-1" />
                  )}
                </div>
              </div>
            </Card>
          ))}

          {/* Action Buttons */}
          {!allSuccess && (
            <div className="flex items-center justify-end space-x-2">
              <Button
                variant="outline"
                onClick={clearFiles}
                disabled={isUploading}
              >
                Clear All
              </Button>
              <Button
                onClick={uploadFiles}
                disabled={!canUpload}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload {files.length} file(s)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
