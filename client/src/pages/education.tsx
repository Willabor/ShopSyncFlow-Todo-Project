import { useState } from "react";
import { MainLayout } from "@/components/layouts";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Link as LinkIcon,
  AlertTriangle,
  ShieldCheck,
  Filter,
  Upload,
  Search,
  Loader2,
  Pin,
  ChevronRight,
  Package,
  Zap,
  AlertCircle,
  Tags,
  ArrowRight,
  CheckCircle2,
  Info,
  FolderTree,
  ShoppingCart,
  Globe,
  Lightbulb,
  Target,
  DollarSign,
} from "lucide-react";

// Types
interface EducationArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  icon: string | null;
  displayOrder: number;
  isActive: boolean;
  isPinned: boolean;
  relevantIssueTypes: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface AppEducationLibrary {
  id: string;
  appName: string;
  appVendor: string | null;
  createsCollections: boolean;
  riskLevel: string | null;
  whatItDoes: string | null;
  howItCreatesCollections: string | null;
  whyDuplicatesHappen: string | null;
  howToPrevent: string | null;
  whereToFind: string | null;
  isVerified: boolean;
  icon: string | null;
  color: string | null;
}

interface TenantDetectedApp {
  id: string;
  tenantId: string;
  libraryAppId: string | null;
  detectedName: string;
  collectionsCreated: number;
  customNotes: string | null;
  isHidden: boolean;
  libraryApp?: AppEducationLibrary;
}

// Helper to get icon component
function getIconForName(iconName: string | null) {
  switch (iconName) {
    case "link":
      return LinkIcon;
    case "alert-triangle":
      return AlertTriangle;
    case "shield-check":
      return ShieldCheck;
    case "filter":
      return Filter;
    case "upload":
      return Upload;
    case "search":
      return Search;
    default:
      return BookOpen;
  }
}

// Risk badge component
function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null;

  const colorMap: Record<string, string> = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-green-100 text-green-700 border-green-200",
  };

  return (
    <Badge variant="outline" className={colorMap[level] || "bg-gray-100"}>
      {level.charAt(0).toUpperCase() + level.slice(1)} Risk
    </Badge>
  );
}

// Article Card Component
function ArticleCard({
  article,
  onClick,
}: {
  article: EducationArticle;
  onClick: () => void;
}) {
  const Icon = getIconForName(article.icon);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">{article.title}</CardTitle>
              <Badge variant="outline" className="mt-1 text-xs">
                {article.category}
              </Badge>
            </div>
          </div>
          {article.isPinned && (
            <Pin className="h-4 w-4 text-orange-500 fill-current" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {article.summary}
        </p>
        <div className="flex items-center gap-1 mt-3 text-sm text-blue-600">
          <span>Read more</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

// App Card Component
function AppCard({
  app,
  detectedInfo,
  onClick,
}: {
  app: AppEducationLibrary;
  detectedInfo?: TenantDetectedApp;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className="p-2 rounded-lg"
              style={{
                backgroundColor: app.color ? `${app.color}15` : "#f0f9ff",
              }}
            >
              <Filter
                className="h-5 w-5"
                style={{ color: app.color || "#3b82f6" }}
              />
            </div>
            <div>
              <CardTitle className="text-base">{app.appName}</CardTitle>
              {app.appVendor && (
                <p className="text-xs text-muted-foreground">
                  by {app.appVendor}
                </p>
              )}
            </div>
          </div>
          <RiskBadge level={app.riskLevel} />
        </div>
      </CardHeader>
      <CardContent>
        {detectedInfo ? (
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-green-600" />
            <span className="text-green-600 font-medium">
              {detectedInfo.collectionsCreated} collections created
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not detected in your store
          </p>
        )}
        {app.createsCollections && (
          <div className="flex items-center gap-1 mt-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-amber-600">
              Creates collections automatically
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Article Detail Modal
function ArticleDetailModal({
  article,
  open,
  onOpenChange,
}: {
  article: EducationArticle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!article) return null;

  const Icon = getIconForName(article.icon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle>{article.title}</DialogTitle>
              <DialogDescription>{article.summary}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="prose prose-sm max-w-none mt-4">
          {/* Render markdown-like content */}
          {article.content.split("\n").map((line, i) => {
            if (line.startsWith("## ")) {
              return (
                <h2 key={i} className="text-lg font-semibold mt-4 mb-2">
                  {line.replace("## ", "")}
                </h2>
              );
            }
            if (line.startsWith("### ")) {
              return (
                <h3 key={i} className="text-base font-semibold mt-3 mb-1">
                  {line.replace("### ", "")}
                </h3>
              );
            }
            if (line.startsWith("- ")) {
              return (
                <li key={i} className="ml-4">
                  {line.replace("- ", "")}
                </li>
              );
            }
            if (line.startsWith("**") && line.endsWith("**")) {
              return (
                <p key={i} className="font-semibold">
                  {line.replace(/\*\*/g, "")}
                </p>
              );
            }
            if (line.trim() === "") {
              return <br key={i} />;
            }
            return (
              <p key={i} className="my-1">
                {line}
              </p>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// App Detail Modal
function AppDetailModal({
  app,
  open,
  onOpenChange,
}: {
  app: AppEducationLibrary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!app) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="p-2 rounded-lg"
              style={{
                backgroundColor: app.color ? `${app.color}15` : "#f0f9ff",
              }}
            >
              <Filter
                className="h-5 w-5"
                style={{ color: app.color || "#3b82f6" }}
              />
            </div>
            <div>
              <DialogTitle>{app.appName}</DialogTitle>
              {app.appVendor && (
                <DialogDescription>by {app.appVendor}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex gap-2">
            <RiskBadge level={app.riskLevel} />
            {app.createsCollections && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700">
                Creates Collections
              </Badge>
            )}
            {app.isVerified && (
              <Badge variant="outline" className="bg-green-50 text-green-700">
                Verified
              </Badge>
            )}
          </div>

          {app.whatItDoes && (
            <div>
              <h3 className="font-semibold text-sm mb-1">What It Does</h3>
              <p className="text-sm text-muted-foreground">{app.whatItDoes}</p>
            </div>
          )}

          {app.howItCreatesCollections && (
            <div>
              <h3 className="font-semibold text-sm mb-1">
                How It Creates Collections
              </h3>
              <p className="text-sm text-muted-foreground">
                {app.howItCreatesCollections}
              </p>
            </div>
          )}

          {app.whyDuplicatesHappen && (
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
              <h3 className="font-semibold text-sm mb-1 text-amber-800">
                Why Duplicates Happen
              </h3>
              <p className="text-sm text-amber-700">
                {app.whyDuplicatesHappen}
              </p>
            </div>
          )}

          {app.howToPrevent && (
            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <h3 className="font-semibold text-sm mb-1 text-green-800">
                How to Prevent
              </h3>
              <p className="text-sm text-green-700">{app.howToPrevent}</p>
            </div>
          )}

          {app.whereToFind && (
            <div>
              <h3 className="font-semibold text-sm mb-1">Where to Find</h3>
              <p className="text-sm text-muted-foreground font-mono">
                {app.whereToFind}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Category Education Component
function CategoryEducation() {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Tags className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-xl">Understanding Shopify Category Systems</CardTitle>
              <CardDescription className="text-purple-700">
                Master the three category systems that power your product organization, tax compliance, and advertising
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Visual Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" />
            How Categories Flow Together
          </CardTitle>
          <CardDescription>
            Each category system serves a different purpose and flows into the next
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2 p-6 bg-slate-50 rounded-lg">
            {/* Product Type */}
            <div className="flex flex-col items-center text-center p-4 bg-white rounded-lg border-2 border-orange-200 shadow-sm min-w-[180px]">
              <div className="p-2 bg-orange-100 rounded-lg mb-2">
                <Tags className="h-5 w-5 text-orange-600" />
              </div>
              <span className="font-semibold text-orange-700">Product Type</span>
              <span className="text-xs text-muted-foreground mt-1">Your internal labels</span>
              <Badge variant="outline" className="mt-2 bg-orange-50 text-orange-700 border-orange-200">
                Free-form text
              </Badge>
            </div>

            <ArrowRight className="h-6 w-6 text-slate-400 rotate-90 md:rotate-0" />

            {/* Shopify Category */}
            <div className="flex flex-col items-center text-center p-4 bg-white rounded-lg border-2 border-green-200 shadow-sm min-w-[180px]">
              <div className="p-2 bg-green-100 rounded-lg mb-2">
                <ShoppingCart className="h-5 w-5 text-green-600" />
              </div>
              <span className="font-semibold text-green-700">Shopify Category</span>
              <span className="text-xs text-muted-foreground mt-1">Standardized taxonomy</span>
              <Badge variant="outline" className="mt-2 bg-green-50 text-green-700 border-green-200">
                11,768 categories
              </Badge>
            </div>

            <ArrowRight className="h-6 w-6 text-slate-400 rotate-90 md:rotate-0" />

            {/* Google Category */}
            <div className="flex flex-col items-center text-center p-4 bg-white rounded-lg border-2 border-blue-200 shadow-sm min-w-[180px]">
              <div className="p-2 bg-blue-100 rounded-lg mb-2">
                <Globe className="h-5 w-5 text-blue-600" />
              </div>
              <span className="font-semibold text-blue-700">Google Category</span>
              <span className="text-xs text-muted-foreground mt-1">Auto-mapped by Shopify</span>
              <Badge variant="outline" className="mt-2 bg-blue-50 text-blue-700 border-blue-200">
                ~6,000 categories
              </Badge>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-800">
                <strong>Key insight:</strong> When you set a Shopify Product Category, Shopify automatically maps it to the appropriate Google Shopping Category. Your Product Type flows separately to Google as the <code className="bg-blue-100 px-1 rounded">product_type</code> attribute for campaign organization.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-600" />
            Category Comparison
          </CardTitle>
          <CardDescription>
            Understanding when and why to use each category type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Field</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold">Standardized?</TableHead>
                  <TableHead className="font-semibold">Purpose</TableHead>
                  <TableHead className="font-semibold">Example</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-orange-100 rounded">
                        <Tags className="h-4 w-4 text-orange-600" />
                      </div>
                      <span className="font-medium">Product Type</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-orange-50">Free-form text</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-slate-50">No</Badge>
                  </TableCell>
                  <TableCell className="text-sm">Internal organization, filtering, reporting</TableCell>
                  <TableCell>
                    <code className="bg-slate-100 px-2 py-1 rounded text-sm">"Men's Graphic Tees"</code>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-green-100 rounded">
                        <ShoppingCart className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="font-medium">Shopify Category</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-green-50">Hierarchical</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-green-50">Yes (11,768)</Badge>
                  </TableCell>
                  <TableCell className="text-sm">Taxes, cross-channel selling, compliance</TableCell>
                  <TableCell>
                    <code className="bg-slate-100 px-2 py-1 rounded text-sm">"Apparel &gt; Shirts &gt; T-Shirts"</code>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-blue-100 rounded">
                        <Globe className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="font-medium">Google Category</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50">Hierarchical</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50">Yes (~6,000)</Badge>
                  </TableCell>
                  <TableCell className="text-sm">Google Shopping ads, Merchant Center</TableCell>
                  <TableCell>
                    <code className="bg-slate-100 px-2 py-1 rounded text-sm">"212 - Shirts & Tops"</code>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Key Points with Accordion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Key Concepts Explained
          </CardTitle>
          <CardDescription>
            Important details about how each category system works
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="google-broad">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>Google categories are BROAD - no "Jeans" or "Beanies"</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Google's taxonomy is intentionally less granular than Shopify's. While Shopify might have specific categories like "Jeans" or "Beanies", Google groups these into broader categories:
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mt-3">
                    <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                      <p className="font-medium text-red-700 mb-2">Not available in Google:</p>
                      <ul className="list-disc list-inside space-y-1 text-red-600">
                        <li>Jeans (use "Pants" instead)</li>
                        <li>Beanies (use "Hats" instead)</li>
                        <li>Sneakers (use "Shoes" instead)</li>
                        <li>Hoodies (use "Tops" instead)</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                      <p className="font-medium text-green-700 mb-2">What Google uses instead:</p>
                      <ul className="list-disc list-inside space-y-1 text-green-600">
                        <li>Apparel &gt; Clothing &gt; Pants</li>
                        <li>Apparel &gt; Accessories &gt; Hats</li>
                        <li>Apparel &gt; Shoes</li>
                        <li>Apparel &gt; Clothing &gt; Shirts & Tops</li>
                      </ul>
                    </div>
                  </div>
                  <p className="mt-3">
                    <strong>Tip:</strong> This is why Product Type is valuable - it preserves your specific categorization ("Jeans") while Google uses its broader category ("Pants").
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="auto-mapping">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-500" />
                  <span>Shopify auto-maps to Google when you set Shopify Category</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    When you assign a Shopify Product Category, Shopify automatically determines the corresponding Google Shopping Category. You don't need to manually set both!
                  </p>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                    <p className="font-medium text-green-700 mb-2">How it works:</p>
                    <ol className="list-decimal list-inside space-y-2 text-green-600">
                      <li>You select: <code className="bg-green-100 px-1 rounded">Apparel &gt; Clothing &gt; Shirts &gt; T-Shirts</code></li>
                      <li>Shopify automatically maps to Google: <code className="bg-green-100 px-1 rounded">212 - Shirts & Tops</code></li>
                      <li>When synced to Google Merchant Center, the correct category is applied</li>
                    </ol>
                  </div>
                  <p className="mt-3">
                    <strong>Note:</strong> You can override the automatic Google category if needed, but in most cases the auto-mapping is accurate.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="product-type-google">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-orange-500" />
                  <span>Product Type flows to Google as a separate attribute</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Your Product Type doesn't just stay in Shopify - it's sent to Google as the <code className="bg-slate-100 px-1 rounded">product_type</code> attribute, separate from the Google Product Category.
                  </p>
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="font-medium text-orange-700 mb-2">What this means for Google Ads:</p>
                    <ul className="list-disc list-inside space-y-2 text-orange-600">
                      <li><strong>Reporting:</strong> Filter performance by your custom Product Types</li>
                      <li><strong>Bidding:</strong> Set different bids for "Men's Graphic Tees" vs "Women's Basic Tees"</li>
                      <li><strong>Campaign Structure:</strong> Create ad groups based on your Product Types</li>
                      <li><strong>Performance Max:</strong> Asset groups can target specific Product Types</li>
                    </ul>
                  </div>
                  <p className="mt-3">
                    <strong>Best practice:</strong> Use a consistent hierarchy in your Product Types (e.g., "Apparel &gt; Men's &gt; T-Shirts &gt; Graphic Tees") for better Google Ads organization.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="why-important">
              <AccordionTrigger className="text-left">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                  <span>Why proper categorization matters: taxes, ads, and compliance</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 text-sm text-muted-foreground">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium text-emerald-700">Tax Compliance</span>
                      </div>
                      <p className="text-emerald-600 text-xs">
                        Shopify uses Product Category to apply correct tax rates. "Clothing" may be tax-exempt in some states while "Accessories" is not.
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-700">Ad Targeting</span>
                      </div>
                      <p className="text-blue-600 text-xs">
                        Google uses categories to show your products to relevant shoppers. Wrong category = wrong audience = wasted ad spend.
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-purple-700">Compliance</span>
                      </div>
                      <p className="text-purple-600 text-xs">
                        Some categories require additional attributes (e.g., apparel needs gender, age_group, color, size) or have advertising restrictions.
                      </p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Best Practices */}
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Best Practices Checklist
          </CardTitle>
          <CardDescription className="text-green-700">
            Follow these guidelines for optimal categorization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Always set BOTH Product Type AND Shopify Category</p>
                  <p className="text-sm text-green-600 mt-1">
                    Product Type for your internal organization, Shopify Category for standardized taxonomy and auto-Google mapping.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Be as specific as possible in Shopify Category</p>
                  <p className="text-sm text-green-600 mt-1">
                    Don't stop at "Clothing" - drill down to "Shirts &gt; T-Shirts" for better tax handling and Google mapping.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Let Shopify handle Google mapping automatically</p>
                  <p className="text-sm text-green-600 mt-1">
                    Only override the Google category if you have a specific reason. The auto-mapping is usually accurate.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Apparel requires additional attributes</p>
                  <p className="text-sm text-green-600 mt-1">
                    For clothing products, always include: <code className="bg-green-100 px-1 rounded text-xs">gender</code>, <code className="bg-green-100 px-1 rounded text-xs">age_group</code>, <code className="bg-green-100 px-1 rounded text-xs">color</code>, <code className="bg-green-100 px-1 rounded text-xs">size</code>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Use hierarchical Product Types for Google Ads</p>
                  <p className="text-sm text-green-600 mt-1">
                    Format like "Category &gt; Subcategory &gt; Type" for better campaign organization and bidding control.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Audit categories regularly</p>
                  <p className="text-sm text-green-600 mt-1">
                    Review products without categories and fix inconsistencies. Use the Categories page to find and fix issues.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Real-World Examples */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-600" />
            Real-World Examples
          </CardTitle>
          <CardDescription>
            See how the three category systems work together for common product types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Example 1: T-Shirt */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-indigo-100 text-indigo-700">Example 1</Badge>
                <span className="font-medium">Men's Graphic T-Shirt</span>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="p-2 bg-orange-50 rounded border border-orange-100">
                  <p className="text-xs text-orange-600 mb-1">Product Type</p>
                  <p className="font-medium text-orange-800">Men's &gt; Tops &gt; Graphic Tees</p>
                </div>
                <div className="p-2 bg-green-50 rounded border border-green-100">
                  <p className="text-xs text-green-600 mb-1">Shopify Category</p>
                  <p className="font-medium text-green-800">Apparel &gt; Clothing &gt; Shirts &gt; T-Shirts</p>
                </div>
                <div className="p-2 bg-blue-50 rounded border border-blue-100">
                  <p className="text-xs text-blue-600 mb-1">Google Category (auto)</p>
                  <p className="font-medium text-blue-800">212 - Shirts & Tops</p>
                </div>
              </div>
            </div>

            {/* Example 2: Jeans */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-indigo-100 text-indigo-700">Example 2</Badge>
                <span className="font-medium">Women's Skinny Jeans</span>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="p-2 bg-orange-50 rounded border border-orange-100">
                  <p className="text-xs text-orange-600 mb-1">Product Type</p>
                  <p className="font-medium text-orange-800">Women's &gt; Bottoms &gt; Jeans &gt; Skinny</p>
                </div>
                <div className="p-2 bg-green-50 rounded border border-green-100">
                  <p className="text-xs text-green-600 mb-1">Shopify Category</p>
                  <p className="font-medium text-green-800">Apparel &gt; Clothing &gt; Pants &gt; Jeans</p>
                </div>
                <div className="p-2 bg-blue-50 rounded border border-blue-100">
                  <p className="text-xs text-blue-600 mb-1">Google Category (auto)</p>
                  <p className="font-medium text-blue-800">204 - Pants (no "Jeans" in Google!)</p>
                </div>
              </div>
            </div>

            {/* Example 3: Beanie */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-indigo-100 text-indigo-700">Example 3</Badge>
                <span className="font-medium">Winter Beanie Hat</span>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="p-2 bg-orange-50 rounded border border-orange-100">
                  <p className="text-xs text-orange-600 mb-1">Product Type</p>
                  <p className="font-medium text-orange-800">Accessories &gt; Headwear &gt; Beanies</p>
                </div>
                <div className="p-2 bg-green-50 rounded border border-green-100">
                  <p className="text-xs text-green-600 mb-1">Shopify Category</p>
                  <p className="font-medium text-green-800">Apparel &gt; Accessories &gt; Hats &gt; Beanies</p>
                </div>
                <div className="p-2 bg-blue-50 rounded border border-blue-100">
                  <p className="text-xs text-blue-600 mb-1">Google Category (auto)</p>
                  <p className="font-medium text-blue-800">173 - Hats (no "Beanies" in Google!)</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Reference */}
      <Card className="border-slate-300">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-slate-600" />
            Quick Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-medium text-orange-700 mb-1">Product Type</p>
              <p className="text-muted-foreground">Where: Product details page, "Product type" field</p>
              <p className="text-muted-foreground">Format: Any text you want</p>
            </div>
            <div>
              <p className="font-medium text-green-700 mb-1">Shopify Category</p>
              <p className="text-muted-foreground">Where: Product details page, "Category" dropdown</p>
              <p className="text-muted-foreground">Format: Select from Shopify's taxonomy</p>
            </div>
            <div>
              <p className="font-medium text-blue-700 mb-1">Google Category</p>
              <p className="text-muted-foreground">Where: Auto-assigned, or override in Google channel</p>
              <p className="text-muted-foreground">Format: ID number + category path</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main Education Page
export default function EducationPage() {
  const [selectedArticle, setSelectedArticle] = useState<EducationArticle | null>(null);
  const [selectedApp, setSelectedApp] = useState<AppEducationLibrary | null>(null);

  // Fetch articles
  const { data: articlesData, isLoading: articlesLoading } = useQuery<{
    articles: EducationArticle[];
    total: number;
  }>({
    queryKey: ["/api/education/articles"],
  });

  // Fetch apps (detected + library)
  const { data: appsData, isLoading: appsLoading } = useQuery<{
    detectedApps: TenantDetectedApp[];
    libraryApps: AppEducationLibrary[];
    totalDetected: number;
    totalLibrary: number;
  }>({
    queryKey: ["/api/education/apps"],
  });

  const articles = articlesData?.articles || [];
  const detectedApps = appsData?.detectedApps || [];
  const libraryApps = appsData?.libraryApps || [];

  // Separate pinned and regular articles
  const pinnedArticles = articles.filter((a) => a.isPinned);
  const regularArticles = articles.filter((a) => !a.isPinned);

  // Create a map of detected apps by library ID
  const detectedByLibraryId = new Map<string, TenantDetectedApp>();
  detectedApps.forEach((da) => {
    if (da.libraryAppId) {
      detectedByLibraryId.set(da.libraryAppId, da);
    }
  });

  // Combine detected apps with their library info + undetected library apps
  const allApps: { app: AppEducationLibrary; detected?: TenantDetectedApp }[] =
    [];

  // Add detected apps with library info
  detectedApps.forEach((da) => {
    if (da.libraryApp) {
      allApps.push({ app: da.libraryApp, detected: da });
    }
  });

  // Add library apps that aren't detected
  libraryApps.forEach((la) => {
    allApps.push({ app: la });
  });

  return (
    <MainLayout title="Education Center" subtitle="Learn about Shopify categories, collections, and best practices">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BookOpen className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Education Center</h1>
              <p className="text-muted-foreground">
                Master Shopify categories, prevent duplicate collections, and
                manage your store effectively
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="categories" className="space-y-4">
          <TabsList>
            <TabsTrigger value="categories" className="gap-2">
              <Tags className="h-4 w-4" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="articles" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Articles
              {articles.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {articles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="apps" className="gap-2">
              <Zap className="h-4 w-4" />
              Apps
              {allApps.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {allApps.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <CategoryEducation />
          </TabsContent>

          {/* Articles Tab */}
          <TabsContent value="articles">
            {articlesLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : articles.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No articles available yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Pinned Articles (Critical) */}
                {pinnedArticles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Pin className="h-4 w-4 text-orange-500" />
                      <h2 className="font-semibold">Must Read</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {pinnedArticles.map((article) => (
                        <ArticleCard
                          key={article.id}
                          article={article}
                          onClick={() => setSelectedArticle(article)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Regular Articles */}
                {regularArticles.length > 0 && (
                  <div>
                    <h2 className="font-semibold mb-3">More Resources</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {regularArticles.map((article) => (
                        <ArticleCard
                          key={article.id}
                          article={article}
                          onClick={() => setSelectedArticle(article)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Apps Tab */}
          <TabsContent value="apps">
            {appsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allApps.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                  <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No app information available yet.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Detected Apps */}
                {detectedApps.some((a) => a.libraryApp) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-4 w-4 text-green-600" />
                      <h2 className="font-semibold">Apps in Your Store</h2>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {allApps
                        .filter((a) => a.detected)
                        .map(({ app, detected }) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            detectedInfo={detected}
                            onClick={() => setSelectedApp(app)}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Library Apps (Not Detected) */}
                {allApps.filter((a) => !a.detected).length > 0 && (
                  <div>
                    <h2 className="font-semibold mb-3">
                      Other Common Apps
                    </h2>
                    <p className="text-sm text-muted-foreground mb-3">
                      These apps are known to affect collections but haven't
                      been detected in your store.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {allApps
                        .filter((a) => !a.detected)
                        .map(({ app }) => (
                          <AppCard
                            key={app.id}
                            app={app}
                            onClick={() => setSelectedApp(app)}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Article Detail Modal */}
        <ArticleDetailModal
          article={selectedArticle}
          open={!!selectedArticle}
          onOpenChange={(open) => !open && setSelectedArticle(null)}
        />

        {/* App Detail Modal */}
        <AppDetailModal
          app={selectedApp}
          open={!!selectedApp}
          onOpenChange={(open) => !open && setSelectedApp(null)}
        />
      </div>
    </MainLayout>
  );
}
