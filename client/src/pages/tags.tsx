import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tag,
  Plus,
  Search,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowUpDown,
  RefreshCw,
  Check,
  X,
} from "lucide-react";
import type { Tag as TagType } from "@shared/schema";

interface TagStats {
  total: number;
  used: number;
  unused: number;
  synced: number;
}

type SortField = "name" | "productCount" | "updatedAt";
type SortDirection = "asc" | "desc";
type FilterMode = "all" | "used" | "unused" | "notSynced";

export default function TagsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if user can edit/delete tags (SuperAdmin and WarehouseManager only)
  const canManageTags = user?.role === "SuperAdmin" || user?.role === "WarehouseManager";

  // Table state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    color: "#3b82f6",
  });

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingTag, setDeletingTag] = useState<TagType | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // Fetch tag statistics
  const { data: stats, isLoading: statsLoading } = useQuery<TagStats>({
    queryKey: ["/api/tags/stats"],
    queryFn: async () => {
      const response = await fetch("/api/tags/stats", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tag statistics");
      }

      return response.json();
    },
  });

  // Fetch all tags
  const { data: tags = [], isLoading: tagsLoading, error } = useQuery<TagType[]>({
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

  // Create tag mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create tag");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/stats"] });
      toast({
        title: "Success",
        description: "Tag created successfully",
      });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update tag mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update tag");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/stats"] });
      toast({
        title: "Success",
        description: "Tag updated successfully",
      });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete tag mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tags/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete tag");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/stats"] });
      toast({
        title: "Success",
        description: "Tag deleted successfully",
      });
      handleCloseDeleteDialog();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`/api/tags/${id}`, {
            method: "DELETE",
            credentials: "include",
          })
        )
      );
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`Failed to delete ${failed} tags`);
      }
      return { deleted: ids.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/stats"] });
      toast({
        title: "Success",
        description: `Deleted ${data.deleted} tags successfully`,
      });
      setSelectedTags(new Set());
      setIsBulkDeleteOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Refresh counts mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/tags/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to refresh tag counts");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/stats"] });
      toast({
        title: "Success",
        description: "Tag counts refreshed from products",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = statsLoading || tagsLoading;

  // Filter and sort tags
  const filteredTags = useMemo(() => {
    let filtered = [...tags];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((tag) =>
        tag.name.toLowerCase().includes(query)
      );
    }

    // Apply filter mode
    if (filterMode === "used") {
      filtered = filtered.filter((tag) => tag.productCount > 0);
    } else if (filterMode === "unused") {
      filtered = filtered.filter((tag) => tag.productCount === 0);
    } else if (filterMode === "notSynced") {
      filtered = filtered.filter((tag) => !tag.shopifySynced);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "productCount":
          aVal = a.productCount || 0;
          bVal = b.productCount || 0;
          break;
        case "updatedAt":
          aVal = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          bVal = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          break;
      }

      if (sortDirection === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [tags, searchQuery, filterMode, sortField, sortDirection]);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTags(new Set(filteredTags.map((t) => t.id)));
    } else {
      setSelectedTags(new Set());
    }
  };

  const handleSelectTag = (tagId: string, checked: boolean) => {
    const newSelected = new Set(selectedTags);
    if (checked) {
      newSelected.add(tagId);
    } else {
      newSelected.delete(tagId);
    }
    setSelectedTags(newSelected);
  };

  // Open form for creating new tag
  const handleCreateTag = () => {
    setEditingTag(null);
    setFormData({
      name: "",
      color: "#3b82f6",
    });
    setIsFormOpen(true);
  };

  // Open form for editing existing tag
  const handleEditTag = (tag: TagType) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      color: tag.color || "#3b82f6",
    });
    setIsFormOpen(true);
  };

  // Close form and reset
  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingTag(null);
    setFormData({
      name: "",
      color: "#3b82f6",
    });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Tag name is required",
        variant: "destructive",
      });
      return;
    }

    // Submit
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Open delete dialog
  const handleDeleteTag = (tag: TagType) => {
    setDeletingTag(tag);
    setIsDeleteDialogOpen(true);
  };

  // Close delete dialog and reset
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeletingTag(null);
  };

  // Confirm deletion
  const handleConfirmDelete = () => {
    if (!deletingTag) return;
    deleteMutation.mutate(deletingTag.id);
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (selectedTags.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedTags));
  };

  // Format date for display
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <MainLayout
      title="Tags"
      subtitle="Manage product tags and sync with Shopify"
    >
      <div className="p-8">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Tags */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Tags
              </CardTitle>
              <Tag className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stats?.total || 0}</div>
              )}
              <p className="text-xs text-gray-500 mt-1">All product tags</p>
            </CardContent>
          </Card>

          {/* Used Tags */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Used Tags
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stats?.used || 0}</div>
              )}
              <p className="text-xs text-gray-500 mt-1">Tags with products</p>
            </CardContent>
          </Card>

          {/* Unused Tags */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Unused Tags
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stats?.unused || 0}</div>
              )}
              <p className="text-xs text-gray-500 mt-1">Tags with 0 products</p>
            </CardContent>
          </Card>

          {/* Synced to Shopify */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Synced to Shopify
              </CardTitle>
              <RefreshCw className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{stats?.synced || 0}</div>
              )}
              <p className="text-xs text-gray-500 mt-1">Tags synced with store</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={filterMode}
            onValueChange={(v) => setFilterMode(v as FilterMode)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="unused">Unused</SelectItem>
              <SelectItem value="notSynced">Not Synced</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh Counts
          </Button>
          <Button className="gap-2" onClick={handleCreateTag}>
            <Plus className="h-4 w-4" />
            Add Tag
          </Button>
        </div>

        {/* Bulk Actions Bar - only for users with delete permission */}
        {canManageTags && selectedTags.size > 0 && (
          <div className="flex items-center justify-between p-4 mb-4 bg-accent rounded-lg border">
            <span className="text-sm font-medium">
              {selectedTags.size} tag{selectedTags.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTags(new Set())}
              >
                Clear Selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Failed to load tags</p>
                  <p className="text-sm text-red-600">
                    {error instanceof Error ? error.message : "Unknown error occurred"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success State - Tags Table */}
        {!isLoading && !error && tags.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canManageTags && (
                      <TableHead className="w-[48px]">
                        <Checkbox
                          checked={
                            filteredTags.length > 0 &&
                            filteredTags.every((t) => selectedTags.has(t.id))
                          }
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all tags"
                        />
                      </TableHead>
                    )}
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleSort("name")}
                      >
                        Tag Name
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleSort("productCount")}
                      >
                        Products
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead>Synced</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={() => handleSort("updatedAt")}
                      >
                        Last Updated
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManageTags ? 6 : 5} className="h-24 text-center">
                        <div className="text-gray-500">
                          <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p>No tags found matching your filters</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTags.map((tag) => (
                      <TableRow
                        key={tag.id}
                        className={tag.productCount === 0 ? "bg-yellow-500/5" : ""}
                      >
                        {canManageTags && (
                          <TableCell>
                            <Checkbox
                              checked={selectedTags.has(tag.id)}
                              onCheckedChange={(checked) =>
                                handleSelectTag(tag.id, checked as boolean)
                              }
                              aria-label={`Select ${tag.name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {tag.color && (
                              <div
                                className="w-3 h-3 rounded-full border"
                                style={{ backgroundColor: tag.color }}
                              />
                            )}
                            {tag.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={tag.productCount === 0 ? "outline" : "secondary"}
                            className={tag.productCount === 0 ? "text-orange-600 border-orange-300" : ""}
                          >
                            {tag.productCount}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tag.shopifySynced ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <Check className="h-3 w-3 mr-1" />
                              Synced
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-gray-500">
                              <X className="h-3 w-3 mr-1" />
                              Not Synced
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {formatDate(tag.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManageTags && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" aria-label="Tag actions">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditTag(tag)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDeleteTag(tag)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!isLoading && !error && tags.length === 0 && (
          <Card>
            <CardContent className="p-12">
              <div className="text-center">
                <Tag className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No tags found
                </h3>
                <p className="text-gray-500 mb-4">
                  Get started by creating your first tag or refresh from products
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                    Refresh from Products
                  </Button>
                  <Button className="gap-2" onClick={handleCreateTag}>
                    <Plus className="h-4 w-4" />
                    Add Tag
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Tag Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingTag ? "Edit Tag" : "Add New Tag"}
            </DialogTitle>
            <DialogDescription>
              {editingTag
                ? "Update the tag details below."
                : "Create a new tag to organize your products."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tag Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Tag Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., new-arrival"
                required
              />
              <p className="text-xs text-gray-500">
                Use lowercase letters, numbers, and hyphens only.
              </p>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label htmlFor="color">Color (Optional)</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  className="w-20 h-10 cursor-pointer"
                />
                <span className="text-sm text-gray-500">
                  Pick a color for visual identification
                </span>
              </div>
            </div>

            {/* Warning for edit */}
            {editingTag && editingTag.productCount > 0 && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                <p className="text-sm text-yellow-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  Renaming this tag will require a sync to Shopify to update the
                  tag on all {editingTag.productCount} products.
                </p>
              </div>
            )}

            {/* Form Actions */}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseForm}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingTag
                  ? "Save Changes"
                  : "Create Tag"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Tag Alert Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tag?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-md">
            <p className="text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              This will remove the tag <strong>"{deletingTag?.name}"</strong> from{" "}
              {deletingTag?.productCount || 0} products. This action cannot be undone.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDeleteDialog} disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Tag"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Alert Dialog */}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tags</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the selected tags?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-md">
            <p className="text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              This will delete <strong>{selectedTags.size} tags</strong> and remove
              them from all associated products. This action cannot be undone.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setIsBulkDeleteOpen(false)}
              disabled={bulkDeleteMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete Tags"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
