import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Edit,
  Trash2,
  Upload,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Tag,
  Globe,
  Calendar,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { Product } from "@shared/schema";
import { ProductOptionsManager, VariantList } from "@/components/variants";

interface ProductDetailModalProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (productId: string) => void;
  onDelete: (productId: string) => void;
  onPublish?: (productId: string, publishAsActive: boolean) => void;
  isPublishing?: boolean;
}

const statusConfig = {
  local_draft: { label: "Local Draft", color: "bg-purple-500", icon: "🟣" },
  draft: { label: "Draft", color: "bg-yellow-500", icon: "🟡" },
  active: { label: "Active", color: "bg-green-500", icon: "🟢" },
  archived: { label: "Archived", color: "bg-gray-500", icon: "⚫" },
};

const publishStatusConfig = {
  not_published: { label: "Not Published", color: "bg-gray-400" },
  publishing: { label: "Publishing...", color: "bg-blue-500 animate-pulse" },
  published: { label: "Published", color: "bg-green-500" },
  failed: { label: "Failed", color: "bg-red-500" },
};

export function ProductDetailModal({
  productId,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onPublish,
  isPublishing,
}: ProductDetailModalProps) {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Fetch product details
  const { data: product, isLoading, error } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      if (!productId) throw new Error("No product ID");
      const response = await fetch(`/api/products/${productId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch product");
      }
      return response.json();
    },
    enabled: !!productId && isOpen,
  });

  if (!isOpen || !productId) return null;

  const StatusBadge = ({ status }: { status: string }) => {
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return (
      <Badge className={`${config.color} text-white`}>
        {config.icon} {config.label}
      </Badge>
    );
  };

  const PublishStatusBadge = ({ status }: { status: string }) => {
    const config = publishStatusConfig[status as keyof typeof publishStatusConfig] || publishStatusConfig.not_published;
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading product...</span>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
            <h3 className="mt-4 text-lg font-semibold">Error Loading Product</h3>
            <p className="text-muted-foreground mt-2">
              {error instanceof Error ? error.message : "Failed to load product"}
            </p>
            <Button onClick={onClose} className="mt-4">
              Close
            </Button>
          </div>
        ) : product ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-3">
                <Package className="h-6 w-6" />
                {product.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <span>Vendor: <strong>{product.vendor}</strong></span>
              </DialogDescription>
            </DialogHeader>

            {/* Status Badges */}
            <div className="flex items-center gap-2 pt-2">
              <StatusBadge status={product.status} />
              <PublishStatusBadge status={product.publishStatus} />
              {product.category && (
                <Badge variant="outline">
                  <Tag className="mr-1 h-3 w-3" />
                  {product.category}
                </Badge>
              )}
            </div>

            <Separator className="my-4" />

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button onClick={() => onEdit(product.id)} className="flex-1">
                <Edit className="mr-2 h-4 w-4" />
                Edit Product
              </Button>
              {product.publishStatus === "not_published" && onPublish && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onPublish(product.id, false)}
                  disabled={isPublishing}
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Publish to Shopify
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => onDelete(product.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>

            <Separator className="my-4" />

            {/* Tabs */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="images">Images</TabsTrigger>
                <TabsTrigger value="variants">Variants</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Info className="h-5 w-5" />
                      Product Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Description */}
                    {product.description && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Description</h4>
                        <div
                          className="text-sm text-muted-foreground prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
                        />
                      </div>
                    )}

                    <Separator />

                    {/* Pricing - now shown in variants section */}
                    <div className="grid grid-cols-2 gap-4">
                      {product.orderNumber && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Order Number</h4>
                          <p className="text-sm text-muted-foreground">{product.orderNumber}</p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Timestamps */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Created
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {new Date(product.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Last Updated
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {new Date(product.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Published Info */}
                    {product.publishStatus === "published" && product.publishedAt && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
                            <Upload className="h-4 w-4" />
                            Published
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {new Date(product.publishedAt).toLocaleString()}
                          </p>
                          {product.shopifyProductId && (
                            <Button variant="link" className="p-0 h-auto mt-1" asChild>
                              <a
                                href={`https://admin.shopify.com/store/products/${product.shopifyProductId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View in Shopify
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </>
                    )}

                    {/* Publish Error */}
                    {product.publishStatus === "failed" && product.publishError && (
                      <>
                        <Separator />
                        <div className="bg-red-50 dark:bg-red-950 p-3 rounded-md">
                          <h4 className="text-sm font-semibold mb-1 text-red-700 dark:text-red-400 flex items-center gap-1">
                            <AlertCircle className="h-4 w-4" />
                            Publish Error
                          </h4>
                          <p className="text-sm text-red-600 dark:text-red-300">
                            {product.publishError}
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Images Tab */}
              <TabsContent value="images" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Product Images
                    </CardTitle>
                    <CardDescription>
                      {product.images && product.images.length > 0
                        ? `${product.images.length} image(s)`
                        : "No images uploaded"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {product.images && product.images.length > 0 ? (
                      <div className="grid grid-cols-3 gap-4">
                        {product.images.map((image, index) => (
                          <div
                            key={index}
                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary cursor-pointer transition-colors"
                            onClick={() => setSelectedImage(image)}
                          >
                            <img
                              src={image}
                              alt={`${product.title} - Image ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext fill='%23999' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12'%3ENo Image%3C/text%3E%3C/svg%3E";
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <ImageIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p>No images available for this product</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Image Preview Modal */}
                {selectedImage && (
                  <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Image Preview</DialogTitle>
                      </DialogHeader>
                      <div className="relative w-full aspect-square">
                        <img
                          src={selectedImage}
                          alt="Preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </TabsContent>

              {/* Variants Tab */}
              <TabsContent value="variants" className="space-y-4">
                <ProductOptionsManager productId={productId} />

                <div className="pt-4">
                  <VariantList productId={productId} />
                </div>
              </TabsContent>

              {/* SEO Tab */}
              <TabsContent value="seo" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      SEO Information
                    </CardTitle>
                    <CardDescription>
                      Search engine optimization details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {product.metaTitle && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Meta Title</h4>
                        <p className="text-sm text-muted-foreground">{product.metaTitle}</p>
                      </div>
                    )}

                    {product.metaDescription && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Meta Description</h4>
                        <p className="text-sm text-muted-foreground">{product.metaDescription}</p>
                      </div>
                    )}

                    {product.focusKeyword && (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Focus Keyword</h4>
                        <Badge variant="secondary">{product.focusKeyword}</Badge>
                      </div>
                    )}

                    {product.generatedKeywords && product.generatedKeywords.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Generated Keywords</h4>
                        <div className="flex flex-wrap gap-2">
                          {product.generatedKeywords.map((keyword, index) => (
                            <Badge key={index} variant="outline">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {product.googleCategory ? (
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Google Product Category</h4>
                        <p className="text-sm text-muted-foreground">
                          {(() => {
                            const cat = product.googleCategory;
                            if (typeof cat === 'object' && cat !== null && 'name' in cat) {
                              return String((cat as any).name);
                            }
                            return JSON.stringify(cat);
                          })()}
                        </p>
                      </div>
                    ) : null}

                    {!product.metaTitle && !product.metaDescription && !product.focusKeyword && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Globe className="mx-auto h-12 w-12 mb-4 opacity-50" />
                        <p>No SEO information available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Metadata Tab */}
              <TabsContent value="metadata" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Info className="h-5 w-5" />
                      Product Metadata
                    </CardTitle>
                    <CardDescription>
                      Additional product information and raw data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Product ID</h4>
                        <p className="text-xs text-muted-foreground font-mono">{product.id}</p>
                      </div>
                      {product.vendorId && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Vendor ID</h4>
                          <p className="text-xs text-muted-foreground font-mono">{product.vendorId}</p>
                        </div>
                      )}
                      {product.shopifyProductId && (
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Shopify Product ID</h4>
                          <p className="text-xs text-muted-foreground font-mono">{product.shopifyProductId}</p>
                        </div>
                      )}
                    </div>

                    {product.metadata ? (
                      <>
                        <Separator />
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Raw Metadata (CSV Import)</h4>
                          <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-64">
                            {(() => {
                              try {
                                return JSON.stringify(product.metadata, null, 2);
                              } catch {
                                return String(product.metadata);
                              }
                            })()}
                          </pre>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
