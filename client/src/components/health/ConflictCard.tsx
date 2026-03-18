import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Navigation,
  Menu,
  Folder,
  Trash2,
  RefreshCw,
  BookOpen,
  HelpCircle,
} from "lucide-react";

export type NavConflictType = 'switch_required' | 'remove_link' | 'block_delete' | 'orphan_link';

export interface NavigationConflictDisplay {
  collectionId: string;
  collectionName: string;
  collectionHandle: string;
  shopifyCollectionId: string | null;
  menuTitle: string;
  itemTitle: string;
  severity: string;
  message: string;
  action: string;
  conflictType?: NavConflictType;
  currentInNav?: {
    id: string;
    handle: string;
    shopifyId: string | null;
    productCount: number;
  } | null;
  switchTo?: {
    id: string;
    handle: string;
    shopifyId: string | null;
    productCount: number;
  } | null;
}

interface ConflictCardProps {
  conflicts: NavigationConflictDisplay[];
}

function getConflictIcon(conflictType: NavConflictType | undefined) {
  switch (conflictType) {
    case 'switch_required':
      return <RefreshCw className="h-5 w-5 text-orange-500" />;
    case 'remove_link':
      return <Trash2 className="h-5 w-5 text-red-500" />;
    case 'orphan_link':
      return <AlertTriangle className="h-5 w-5 text-purple-500" />;
    default:
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
  }
}

function getConflictBadge(conflictType: NavConflictType | undefined) {
  switch (conflictType) {
    case 'switch_required':
      return <Badge className="bg-orange-500">Switch Required</Badge>;
    case 'remove_link':
      return <Badge className="bg-red-500">Remove Link</Badge>;
    case 'orphan_link':
      return <Badge className="bg-purple-500">Orphan Link</Badge>;
    default:
      return <Badge className="bg-red-500">Block Delete</Badge>;
  }
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return <Badge variant="destructive">Critical</Badge>;
    case 'high':
      return <Badge className="bg-orange-500">High</Badge>;
    case 'medium':
      return <Badge className="bg-yellow-500 text-black">Medium</Badge>;
    default:
      return <Badge variant="secondary">{severity}</Badge>;
  }
}

export function ConflictCard({ conflicts }: ConflictCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (conflicts.length === 0) {
    return null;
  }

  // Count by conflict type
  const switchCount = conflicts.filter(c => c.conflictType === 'switch_required').length;
  const removeCount = conflicts.filter(c => c.conflictType === 'remove_link').length;
  const orphanCount = conflicts.filter(c => c.conflictType === 'orphan_link').length;
  const blockCount = conflicts.filter(c => c.conflictType === 'block_delete' || !c.conflictType).length;

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader
        className="cursor-pointer hover:bg-orange-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Navigation className="h-5 w-5 text-orange-500" />
            <div>
              <CardTitle className="text-base text-orange-700">
                Navigation Conflicts
              </CardTitle>
              <CardDescription>
                {switchCount > 0 && `${switchCount} switch required`}
                {switchCount > 0 && (removeCount > 0 || orphanCount > 0 || blockCount > 0) && ' • '}
                {removeCount > 0 && `${removeCount} remove link`}
                {removeCount > 0 && (orphanCount > 0 || blockCount > 0) && ' • '}
                {orphanCount > 0 && `${orphanCount} orphan link`}
                {orphanCount > 0 && blockCount > 0 && ' • '}
                {blockCount > 0 && `${blockCount} blocking`}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{conflicts.length} conflicts</Badge>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            {conflicts.map((conflict, idx) => (
              <div
                key={`${conflict.collectionId}-${idx}`}
                className={`border rounded-lg p-4 bg-white ${
                  conflict.conflictType === 'switch_required'
                    ? 'border-orange-300'
                    : conflict.conflictType === 'orphan_link'
                      ? 'border-purple-300'
                      : 'border-red-300'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {getConflictIcon(conflict.conflictType)}
                    <div>
                      <div className="font-medium text-gray-900">
                        {conflict.collectionName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {conflict.collectionHandle}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                        <Menu className="h-4 w-4" />
                        <span>
                          In menu: <strong>{conflict.menuTitle}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getConflictBadge(conflict.conflictType)}
                    {getSeverityBadge(conflict.severity)}
                    {conflict.shopifyCollectionId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const shopifyId = conflict.shopifyCollectionId?.replace(
                            "gid://shopify/Collection/",
                            ""
                          );
                          window.open(
                            `https://admin.shopify.com/store/nexus-clothes/collections/${shopifyId}`,
                            "_blank"
                          );
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Switch recommendation display */}
                {conflict.conflictType === 'switch_required' && conflict.currentInNav && conflict.switchTo && (
                  <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex-1">
                        <div className="text-orange-800 font-medium">Current (wrong):</div>
                        <div className="text-gray-600 font-mono text-xs">
                          /{conflict.currentInNav.handle}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {conflict.currentInNav.productCount} products
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-orange-500 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-green-700 font-medium">Switch to (correct):</div>
                        <div className="text-gray-600 font-mono text-xs">
                          /{conflict.switchTo.handle}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {conflict.switchTo.productCount} products
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Remove link display */}
                {conflict.conflictType === 'remove_link' && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm">
                    <div className="flex items-start gap-2">
                      <Trash2 className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-red-800">
                        Both duplicates have 0 products. Remove this link from navigation entirely.
                      </div>
                    </div>
                  </div>
                )}

                {/* Orphan link display */}
                {conflict.conflictType === 'orphan_link' && (
                  <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-purple-800 font-medium">Broken Link - Collection Deleted</div>
                        <div className="text-purple-700 mt-1">
                          This navigation link points to a collection that no longer exists in Shopify.
                          {conflict.currentInNav && (
                            <span className="font-mono text-xs ml-1">
                              (/{conflict.currentInNav.handle})
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-purple-600">
                          <strong>Action:</strong> {conflict.action}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generic message/action for block_delete or when no enhanced data */}
                {(conflict.conflictType === 'block_delete' || !conflict.conflictType) && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-red-800">{conflict.message}</div>
                        <div className="mt-1 text-red-600 font-medium">
                          Action: {conflict.action}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action summary for switch_required */}
                {conflict.conflictType === 'switch_required' && (
                  <div className="mt-2 text-sm text-orange-700">
                    <strong>Action:</strong> {conflict.action}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <strong>How to resolve:</strong> Go to Shopify Admin → Online Store → Navigation,
            find the menu(s) listed above, and update or remove the links to these collections
            before deleting them.
          </div>

          {/* Why did this happen? Link */}
          <div className="mt-3 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-indigo-500" />
            <a
              href="/education"
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
            >
              Why do navigation conflicts happen? Learn about collection handles
              <BookOpen className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
