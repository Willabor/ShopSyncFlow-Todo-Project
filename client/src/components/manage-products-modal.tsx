import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Loader2,
  Package,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Collection, Product } from "@shared/schema";

interface ManageProductsModalProps {
  collection: Collection | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ManageProductsModal({
  collection,
  isOpen,
  onClose,
}: ManageProductsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"current" | "add">("current");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab("current");
      setSearchQuery("");
      setSelectedProductIds([]);
    }
  }, [isOpen]);

  // Fetch products currently in this collection
  const { data: collectionProducts, isLoading: loadingCurrent, refetch: refetchCurrent } = useQuery({
    queryKey: [`/api/collections/${collection?.id}/products`],
    queryFn: async () => {
      if (!collection?.id) return [];
      const response = await fetch(`/api/collections/${collection.id}?includeProducts=true`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch collection products");
      const data = await response.json();
      return data.products || [];
    },
    enabled: isOpen && !!collection?.id,
  });

  // Fetch all products for adding (excluding ones already in collection)
  const { data: availableProducts, isLoading: loadingAvailable } = useQuery({
    queryKey: ["/api/products/list", searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      params.append("limit", "100");

      const response = await fetch(`/api/products/list?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();

      // Filter out products already in the collection
      const currentIds = new Set((collectionProducts || []).map((p: Product) => p.id));
      return (data.products || []).filter((p: Product) => !currentIds.has(p.id));
    },
    enabled: isOpen && activeTab === "add",
  });

  // Add products mutation
  const addProductsMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const response = await fetch(`/api/collections/${collection!.id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add products");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collection?.id}/products`] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      refetchCurrent();
      setSelectedProductIds([]);
      toast({
        title: "✅ Products Added",
        description: `${selectedProductIds.length} product(s) added to collection.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Failed to Add Products",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove products mutation
  const removeProductsMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      const response = await fetch(`/api/collections/${collection!.id}/products`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove products");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/collections/${collection?.id}/products`] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      refetchCurrent();
      setSelectedProductIds([]);
      toast({
        title: "✅ Products Removed",
        description: `${selectedProductIds.length} product(s) removed from collection.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Failed to Remove Products",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleProduct = (productId: string) => {
    setSelectedProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleAddSelected = () => {
    if (selectedProductIds.length > 0) {
      addProductsMutation.mutate(selectedProductIds);
    }
  };

  const handleRemoveSelected = () => {
    if (selectedProductIds.length > 0) {
      removeProductsMutation.mutate(selectedProductIds);
    }
  };

  if (!collection) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Products - {collection.name}</DialogTitle>
          <DialogDescription>
            Add or remove products from this collection
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "current" | "add")} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current">
              Current Products ({collectionProducts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="add">
              Add Products
            </TabsTrigger>
          </TabsList>

          {/* Current Products Tab */}
          <TabsContent value="current" className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              {selectedProductIds.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveSelected}
                  disabled={removeProductsMutation.isPending}
                >
                  {removeProductsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedProductIds.length})
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              {loadingCurrent ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : collectionProducts && collectionProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionProducts.map((product: Product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProductIds.includes(product.id)}
                            onCheckedChange={() => handleToggleProduct(product.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {product.images && product.images.length > 0 ? (
                              <img
                                src={product.images[0]}
                                alt={product.title}
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium">{product.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <code className="text-xs cursor-help">—</code>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View product details for variant SKUs</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">—</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View product details for variant pricing</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.status === "active" ? "default" : "secondary"}>
                            {product.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mb-4" />
                  <p>No products in this collection</p>
                  <p className="text-sm">Switch to "Add Products" tab to add products</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Add Products Tab */}
          <TabsContent value="add" className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              {selectedProductIds.length > 0 && (
                <Button
                  onClick={handleAddSelected}
                  disabled={addProductsMutation.isPending}
                >
                  {addProductsMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Selected ({selectedProductIds.length})
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-auto border rounded-md">
              {loadingAvailable ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : availableProducts && availableProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableProducts.map((product: Product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProductIds.includes(product.id)}
                            onCheckedChange={() => handleToggleProduct(product.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {product.images && product.images.length > 0 ? (
                              <img
                                src={product.images[0]}
                                alt={product.title}
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium">{product.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <code className="text-xs cursor-help">—</code>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View product details for variant SKUs</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">—</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View product details for variant pricing</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.status === "active" ? "default" : "secondary"}>
                            {product.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-12 w-12 mb-4" />
                  <p>No products found</p>
                  <p className="text-sm">Try adjusting your search</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
