import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, CheckCircle2, Database, FileDown, FileUp, Play, Eye, Shield } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface CategoryWithStatus {
  name: string;
  productCount: number;
  tier: number;
  riskLevel: 'low' | 'medium' | 'high';
  hasMapping: boolean;
  mapping?: {
    productType: string;
    tags: string[];
    shopifyTaxonomy: {
      id: string;
      path: string;
    };
    notes?: string;
  };
}

interface MigrationStatus {
  categories: CategoryWithStatus[];
  totalCategories: number;
  totalProducts: number;
  categoriesWithMapping: number;
}

interface MigrationResult {
  success: boolean;
  categoryName: string;
  productsFound: number;
  productsUpdated: number;
  errors: string[];
  updatedProducts: Array<{
    id: string;
    title: string;
    oldCategory: string | null;
    newProductType: string;
    oldTags: string | null;
    newTags: string;
    shopifyTaxonomy: string;
  }>;
}

interface BackupInfo {
  filename: string;
  categoryName: string;
  timestamp: string;
  productCount: number;
  createdAt: string;
}

export default function CategoryMigration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithStatus | null>(null);
  const [showDryRunDialog, setShowDryRunDialog] = useState(false);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [showBackupsDialog, setShowBackupsDialog] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<MigrationResult | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // Fetch migration status
  const { data: migrationStatus, isLoading: statusLoading } = useQuery<MigrationStatus>({
    queryKey: ["/api/categories/migration/status"],
  });

  // Fetch backups
  const { data: backups, isLoading: backupsLoading } = useQuery<BackupInfo[]>({
    queryKey: ["/api/categories/migration/backups"],
  });

  // Dry-run mutation
  const dryRunMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      const response = await fetch("/api/categories/migration/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to run dry-run");
      }

      return response.json();
    },
    onSuccess: (data: MigrationResult) => {
      setDryRunResult(data);
      setShowDryRunDialog(true);
      toast({
        title: "Dry-run complete",
        description: `Found ${data.productsFound} products. Review changes before executing.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Dry-run failed",
        description: error.message,
      });
    },
  });

  // Create backup mutation
  const createBackupMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      const response = await fetch("/api/categories/migration/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create backup");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/migration/backups"] });
      toast({
        title: "Backup created",
        description: `Backed up ${data.productCount} products to ${data.backupFile}`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Backup failed",
        description: error.message,
      });
    },
  });

  // Execute migration mutation
  const executeMigrationMutation = useMutation({
    mutationFn: async (categoryName: string) => {
      const response = await fetch("/api/categories/migration/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ categoryName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to execute migration");
      }

      return response.json();
    },
    onSuccess: (data: MigrationResult) => {
      setMigrationResult(data);
      setShowExecuteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/categories/migration/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      if (data.success) {
        toast({
          title: "Migration complete!",
          description: `Successfully migrated ${data.productsUpdated} products.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Migration completed with errors",
          description: `${data.errors.length} errors occurred. Check the results below.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Migration failed",
        description: error.message,
      });
    },
  });

  // Restore from backup mutation
  const restoreBackupMutation = useMutation({
    mutationFn: async (backupFilename: string) => {
      const response = await fetch("/api/categories/migration/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ backupFilename }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to restore backup");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories/migration/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setShowBackupsDialog(false);

      toast({
        title: "Restore complete",
        description: `Restored ${data.restoredCount} products from backup.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Restore failed",
        description: error.message,
      });
    },
  });

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low':
        return <Badge variant="success">Low Risk</Badge>;
      case 'medium':
        return <Badge variant="warning">Medium Risk</Badge>;
      case 'high':
        return <Badge variant="destructive">High Risk</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handleDryRun = (category: CategoryWithStatus) => {
    if (!category.hasMapping) {
      toast({
        variant: "destructive",
        title: "No mapping available",
        description: `Category "${category.name}" does not have a migration mapping yet.`,
      });
      return;
    }

    setSelectedCategory(category);
    dryRunMutation.mutate(category.name);
  };

  const handleCreateBackup = (category: CategoryWithStatus) => {
    setSelectedCategory(category);
    createBackupMutation.mutate(category.name);
  };

  const handleExecuteMigration = (category: CategoryWithStatus) => {
    if (!category.hasMapping) {
      toast({
        variant: "destructive",
        title: "No mapping available",
        description: `Category "${category.name}" does not have a migration mapping yet.`,
      });
      return;
    }

    setSelectedCategory(category);
    setShowExecuteDialog(true);
  };

  const confirmExecuteMigration = () => {
    if (!selectedCategory) return;
    executeMigrationMutation.mutate(selectedCategory.name);
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Category Migration</h1>
        <p className="text-muted-foreground">
          Migrate from old category system to Shopify's 4-part system (Product Type + Tags + Taxonomy + Collections)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Categories</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{migrationStatus?.totalCategories || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{migrationStatus?.totalProducts.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mappings Ready</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{migrationStatus?.categoriesWithMapping || 0}</div>
            <p className="text-xs text-muted-foreground">
              out of {migrationStatus?.totalCategories || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Backups</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{backups?.length || 0}</div>
            <Button
              variant="link"
              className="p-0 h-auto text-xs"
              onClick={() => setShowBackupsDialog(true)}
            >
              View backups
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Alert about pilot test */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Start with Pilot Test</AlertTitle>
        <AlertDescription>
          Recommended: Start with "Gift Cards" (1 product) for pilot testing. Create a backup before executing any migration.
        </AlertDescription>
      </Alert>

      {/* Migration Results */}
      {migrationResult && (
        <Alert variant={migrationResult.success ? "default" : "destructive"}>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>
            Migration {migrationResult.success ? "Complete" : "Completed with Errors"}
          </AlertTitle>
          <AlertDescription>
            <div className="space-y-2 mt-2">
              <p><strong>Category:</strong> {migrationResult.categoryName}</p>
              <p><strong>Products updated:</strong> {migrationResult.productsUpdated} / {migrationResult.productsFound}</p>
              {migrationResult.errors.length > 0 && (
                <div>
                  <p className="font-semibold">Errors:</p>
                  <ul className="list-disc list-inside text-sm">
                    {migrationResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Sorted by product count (safest first). Tier 1 (1-10 products) recommended for initial testing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Products</TableHead>
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-center">Risk</TableHead>
                  <TableHead className="text-center">Mapping</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {migrationStatus?.categories.map((category) => (
                  <TableRow key={category.name}>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-center">{category.productCount}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">Tier {category.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{getRiskBadge(category.riskLevel)}</TableCell>
                    <TableCell className="text-center">
                      {category.hasMapping ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not Yet</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDryRun(category)}
                        disabled={!category.hasMapping || dryRunMutation.isPending}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateBackup(category)}
                        disabled={createBackupMutation.isPending}
                      >
                        <FileDown className="h-4 w-4 mr-1" />
                        Backup
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleExecuteMigration(category)}
                        disabled={!category.hasMapping || executeMigrationMutation.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Execute
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dry-Run Results Dialog */}
      <Dialog open={showDryRunDialog} onOpenChange={setShowDryRunDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Migration Preview: {dryRunResult?.categoryName}</DialogTitle>
            <DialogDescription>
              Review the changes that will be applied. No changes have been made yet.
            </DialogDescription>
          </DialogHeader>

          {dryRunResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Products Found</p>
                  <p className="text-2xl font-bold">{dryRunResult.productsFound}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">To Be Updated</p>
                  <p className="text-2xl font-bold">{dryRunResult.productsFound}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Sample Products (first 5):</h4>
                <div className="space-y-4">
                  {dryRunResult.updatedProducts.slice(0, 5).map((product) => (
                    <Card key={product.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{product.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <div>
                          <span className="font-medium">Product Type:</span>{" "}
                          <span className="line-through text-muted-foreground">{product.oldCategory || "(empty)"}</span>{" "}
                          → <span className="text-green-600">{product.newProductType}</span>
                        </div>
                        <div>
                          <span className="font-medium">Tags:</span>{" "}
                          <span className="text-green-600">{product.newTags}</span>
                        </div>
                        <div>
                          <span className="font-medium">Taxonomy:</span>{" "}
                          <span className="text-xs text-muted-foreground">{product.shopifyTaxonomy}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {dryRunResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Errors Detected</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside text-sm">
                      {dryRunResult.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDryRunDialog(false)}>
              Close
            </Button>
            {dryRunResult && dryRunResult.errors.length === 0 && (
              <Button onClick={() => {
                setShowDryRunDialog(false);
                if (selectedCategory) handleExecuteMigration(selectedCategory);
              }}>
                Proceed to Execute
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute Confirmation Dialog */}
      <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Migration Execution</DialogTitle>
            <DialogDescription>
              This will permanently modify {selectedCategory?.productCount} products in the "{selectedCategory?.name}" category.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              Make sure you have created a backup before proceeding. This action modifies your database.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExecuteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmExecuteMigration}
              disabled={executeMigrationMutation.isPending}
            >
              {executeMigrationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Execute Migration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backups Dialog */}
      <Dialog open={showBackupsDialog} onOpenChange={setShowBackupsDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Backup Files</DialogTitle>
            <DialogDescription>
              Restore products from a previous backup if needed.
            </DialogDescription>
          </DialogHeader>

          {backupsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : backups && backups.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {backups.map((backup) => (
                  <Card key={backup.filename}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{backup.categoryName}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(backup.createdAt).toLocaleString()} · {backup.productCount} products
                        </p>
                        <p className="text-xs text-muted-foreground">{backup.filename}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Restore ${backup.productCount} products from this backup? This will overwrite current data.`)) {
                            restoreBackupMutation.mutate(backup.filename);
                          }
                        }}
                        disabled={restoreBackupMutation.isPending}
                      >
                        <FileUp className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No backups found. Create a backup before migrating categories.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBackupsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
