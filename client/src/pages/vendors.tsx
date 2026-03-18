import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Store,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Building2,
  Package,
  Shield,
  TrendingUp
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Vendor } from "@shared/schema";

interface VendorWithStats extends Vendor {
  productCount: number;
}

export default function VendorsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [newVendorName, setNewVendorName] = useState("");
  const [editVendorName, setEditVendorName] = useState("");
  const [editVendorWebsite, setEditVendorWebsite] = useState("");

  const { data: vendors = [], isLoading } = useQuery<VendorWithStats[]>({
    queryKey: ["/api/vendors/stats"],
    enabled: !!user,
  });

  const filteredVendors = vendors.filter(vendor =>
    vendor.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createVendorMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/vendors", { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setNewVendorName("");
      setIsAddDialogOpen(false);
      toast({
        title: "Vendor Created",
        description: "New vendor has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create vendor.",
        variant: "destructive",
      });
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ id, name, websiteUrl }: { id: string; name: string; websiteUrl?: string }) => {
      const response = await apiRequest("PATCH", `/api/vendors/${id}`, { name, websiteUrl: websiteUrl || null });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setEditingVendor(null);
      setEditVendorName("");
      setEditVendorWebsite("");
      toast({
        title: "Vendor Updated",
        description: "Vendor has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update vendor.",
        variant: "destructive",
      });
    },
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/vendors/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: "Vendor Deleted",
        description: "Vendor has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete vendor.",
        variant: "destructive",
      });
    },
  });

  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVendorName.trim()) {
      createVendorMutation.mutate(newVendorName.trim());
    }
  };

  const handleEditVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVendor && editVendorName.trim()) {
      updateVendorMutation.mutate({ id: editingVendor.id, name: editVendorName.trim(), websiteUrl: editVendorWebsite.trim() });
    }
  };

  const handleDeleteVendor = (vendor: VendorWithStats) => {
    if (vendor.productCount > 0) {
      toast({
        title: "Cannot Delete Vendor",
        description: `${vendor.name} has ${vendor.productCount} associated products. Remove products first.`,
        variant: "destructive",
      });
      return;
    }
    deleteVendorMutation.mutate(vendor.id);
  };

  const canEdit = user?.role && ["SuperAdmin", "WarehouseManager", "Editor"].includes(user.role);
  const canCreate = user?.role && ["SuperAdmin", "WarehouseManager", "Editor"].includes(user.role);
  const canDelete = user?.role && ["SuperAdmin", "WarehouseManager"].includes(user.role);

  // Check permissions
  if (!user || !["SuperAdmin", "WarehouseManager", "Editor", "Auditor"].includes(user.role)) {
    return (
      <MainLayout title="Access Denied" subtitle="Insufficient permissions">
        <div className="p-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader className="text-center">
                <Shield className="mx-auto h-12 w-12 text-red-500 mb-4" />
                <CardTitle>Access Denied</CardTitle>
                <p className="text-muted-foreground">
                  You don't have permission to view vendor management.
                </p>
              </CardHeader>
            </Card>
          </div>
        </div>
      </MainLayout>
    );
  }

  const totalVendors = vendors.length;
  const totalProducts = vendors.reduce((acc, vendor) => acc + vendor.productCount, 0);
  const mostUsedVendor = vendors.reduce((prev, current) =>
    prev.productCount > current.productCount ? prev : current, vendors[0] || null
  );

  return (
    <MainLayout
      title="Vendor Management"
      subtitle="Manage vendor database and track product relationships"
      actions={
        canCreate && (
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-vendor">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Vendor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Vendor</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateVendor} className="space-y-4">
                      <div>
                        <Label htmlFor="newVendorName">Vendor Name</Label>
                        <Input
                          id="newVendorName"
                          type="text"
                          placeholder="e.g., Apple Inc."
                          value={newVendorName}
                          onChange={(e) => setNewVendorName(e.target.value)}
                          required
                          data-testid="input-new-vendor-name"
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createVendorMutation.isPending || !newVendorName.trim()}
                          data-testid="button-create-vendor"
                        >
                          {createVendorMutation.isPending ? "Creating..." : "Create Vendor"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )
      }
    >
      <div className="p-8">
        <div className="max-w-7xl mx-auto">

          {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Store className="h-6 w-6 text-primary" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Total Vendors</p>
                      <p className="text-2xl font-bold text-foreground" data-testid="stat-total-vendors">
                        {totalVendors}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                      <Package className="h-6 w-6 text-success" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Total Products</p>
                      <p className="text-2xl font-bold text-foreground" data-testid="stat-total-products">
                        {totalProducts}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-warning" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Most Used</p>
                      <p className="text-lg font-bold text-foreground truncate" data-testid="stat-most-used-vendor">
                        {mostUsedVendor?.name || "N/A"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-secondary/50 rounded-lg flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Avg Products</p>
                      <p className="text-2xl font-bold text-foreground" data-testid="stat-avg-products">
                        {totalVendors > 0 ? Math.round(totalProducts / totalVendors) : 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search and Filters */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Search Vendors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by vendor name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-vendors"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Vendors Table */}
            <Card>
              <CardHeader>
                <CardTitle>Vendors ({filteredVendors.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredVendors.length === 0 ? (
                  <div className="text-center py-16">
                    <Store className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-muted-foreground mb-2">
                      {searchTerm ? "No vendors found" : "No vendors yet"}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm
                        ? "No vendors match your search criteria."
                        : "Get started by adding your first vendor."
                      }
                    </p>
                    {canCreate && !searchTerm && (
                      <Button onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add First Vendor
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor Name</TableHead>
                        <TableHead>Products</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVendors.map((vendor) => (
                        <TableRow key={vendor.id} data-testid={`vendor-row-${vendor.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                                <Store className="h-4 w-4 text-primary" />
                              </div>
                              {vendor.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" data-testid={`vendor-product-count-${vendor.id}`}>
                              {vendor.productCount} products
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(vendor.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(vendor.updatedAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {(canEdit || canDelete) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid={`vendor-actions-${vendor.id}`}>
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canEdit && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditingVendor(vendor);
                                        setEditVendorName(vendor.name);
                                        setEditVendorWebsite(vendor.websiteUrl || "");
                                      }}
                                      data-testid={`edit-vendor-${vendor.id}`}
                                    >
                                      <Edit className="mr-2 h-4 w-4" />
                                      Edit Name
                                    </DropdownMenuItem>
                                  )}
                                  {canDelete && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem
                                          onSelect={(e) => e.preventDefault()}
                                          className="text-destructive"
                                          data-testid={`delete-vendor-${vendor.id}`}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to delete "{vendor.name}"?
                                            {vendor.productCount > 0 && (
                                              <span className="text-destructive block mt-2">
                                                Warning: This vendor has {vendor.productCount} associated products.
                                                You cannot delete vendors with existing products.
                                              </span>
                                            )}
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteVendor(vendor)}
                                            disabled={vendor.productCount > 0}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                          >
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      {/* Edit Vendor Dialog */}
      {editingVendor && (
        <Dialog open={!!editingVendor} onOpenChange={() => setEditingVendor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Vendor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditVendor} className="space-y-4">
              <div>
                <Label htmlFor="editVendorName">Vendor Name</Label>
                <Input
                  id="editVendorName"
                  type="text"
                  value={editVendorName}
                  onChange={(e) => setEditVendorName(e.target.value)}
                  required
                  data-testid="input-edit-vendor-name"
                />
              </div>
              <div>
                <Label htmlFor="editVendorWebsite">Website URL</Label>
                <Input
                  id="editVendorWebsite"
                  type="url"
                  value={editVendorWebsite}
                  onChange={(e) => setEditVendorWebsite(e.target.value)}
                  placeholder="https://www.example.com"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setEditingVendor(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateVendorMutation.isPending || !editVendorName.trim()}
                  data-testid="button-update-vendor"
                >
                  {updateVendorMutation.isPending ? "Updating..." : "Update Vendor"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}