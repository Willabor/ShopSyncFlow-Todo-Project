import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import type { HealthIssue, CollectionInNavigation } from "@/hooks/use-health-check";
import type { NavigationConflictDisplay } from "./ConflictCard";

// Types for the report
interface CollectionInfo {
  id: string;
  name: string;
  slug: string;
  shopifyHandle: string | null;
  shopifyCollectionId: string | null;
  productCount: number;
  image: string | null;
  createdAt: string;
  shopifyCreatedAt: string | null;
  createdByType: string | null;
  createdByName: string | null;
}

interface DuplicateGroupDisplay {
  groupId: string;
  name: string;
  issues: HealthIssue[];
  collections: CollectionInfo[];
  severity: string;
}

interface HandlePatternGroup {
  pattern: string;
  count: number;
  severity: string;
  description: string;
  issues: HealthIssue[];
}

interface PrintReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: {
    total: number;
    actionRequired: number;
    duplicates: number;
    navConflicts: number;
    handleMismatches: number;
  };
  duplicateGroups: DuplicateGroupDisplay[];
  navigationConflicts: NavigationConflictDisplay[];
  handlePatterns: HandlePatternGroup[];
  collectionsInNav: CollectionInNavigation[];
  allCollections: CollectionInfo[];
  // Multi-tenant: Store info for report header
  storeInfo?: {
    companyName: string;
    shopifyStoreUrl: string;
  };
}

// Helper functions
function getSeverityOrder(severity: string): number {
  switch (severity) {
    case "critical": return 0;
    case "high": return 1;
    case "medium": return 2;
    case "low": return 3;
    default: return 4;
  }
}

function formatCreator(type: string | null, name: string | null): string {
  if (!type && !name) return "Unknown";
  if (type === "app") return name ? `App: ${name}` : "App";
  if (type === "staff") return name || "Staff";
  return name || type || "Unknown";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PrintReport({
  open,
  onOpenChange,
  stats,
  duplicateGroups,
  navigationConflicts,
  handlePatterns,
  collectionsInNav,
  allCollections,
  storeInfo,
}: PrintReportProps) {
  // Multi-tenant: Use provided store info or fallback
  const companyName = storeInfo?.companyName || "Your Store";
  const storeUrl = storeInfo?.shopifyStoreUrl || "your-store.myshopify.com";
  const printRef = useRef<HTMLDivElement>(null);

  // Get priority groups (critical + high)
  const priorityGroups = duplicateGroups.filter(
    g => g.severity === "critical" || g.severity === "high"
  );

  // Get lower priority groups (medium + low)
  const lowerPriorityGroups = duplicateGroups.filter(
    g => g.severity === "medium" || g.severity === "low"
  );

  // Create a set of Shopify IDs that are in navigation for quick lookup
  const navShopifyIds = new Set(collectionsInNav.map(c => c.shopifyCollectionId));

  // Generate action checklist items
  const generateChecklist = (): string[] => {
    const items: string[] = [];

    // Navigation conflicts requiring attention
    navigationConflicts.forEach(conflict => {
      if (conflict.conflictType === "switch_required" && conflict.switchTo) {
        items.push(`Update "${conflict.collectionName}" link in ${conflict.menuTitle} from /${conflict.collectionHandle} to /${conflict.switchTo.handle}`);
      } else if (conflict.conflictType === "remove_link") {
        items.push(`Remove "${conflict.collectionName}" from ${conflict.menuTitle} (0 products)`);
      } else if (conflict.conflictType === "orphan_link") {
        items.push(`Remove orphan "${conflict.collectionName}" link from ${conflict.menuTitle}`);
      } else if (conflict.conflictType === "block_delete") {
        items.push(`Remove "${conflict.collectionName}" from ${conflict.menuTitle} nav before deleting`);
      }
    });

    // Duplicates to delete
    priorityGroups.forEach(group => {
      const deleteCollections = getDeleteCollections(group);
      deleteCollections.forEach(col => {
        if (col.inNavigation) {
          items.push(`Remove duplicate "/${col.handle}" from nav, then delete`);
        } else {
          items.push(`Delete duplicate: /${col.handle}`);
        }
      });
    });

    if (items.length > 0) {
      items.push("Run health check again to verify all resolved");
    }

    return items;
  };

  // Get collections to delete from a group
  const getDeleteCollections = (group: DuplicateGroupDisplay) => {
    const keepCollectionId = group.issues[0]?.relatedCollectionId;
    return group.collections
      .map(collection => {
        const relatedIssue = group.issues.find(i => i.collectionId === collection.id);
        const inNav = collection.shopifyCollectionId ? navShopifyIds.has(collection.shopifyCollectionId) : false;
        const navInfo = inNav ? collectionsInNav.find(c => c.shopifyCollectionId === collection.shopifyCollectionId) : null;
        const isKeep = keepCollectionId
          ? collection.id === keepCollectionId
          : !relatedIssue;

        return {
          id: collection.id,
          name: collection.name,
          handle: collection.slug || collection.shopifyHandle || "unknown",
          productCount: relatedIssue?.metadata?.productCount ?? collection.productCount ?? 0,
          inNavigation: inNav,
          navMenuTitle: navInfo?.menuTitle,
          isRecommendedKeep: isKeep,
          createdAt: collection.createdAt,
          shopifyCreatedAt: collection.shopifyCreatedAt,
          createdByType: collection.createdByType,
          createdByName: collection.createdByName,
        };
      })
      .filter(c => !c.isRecommendedKeep);
  };

  // Get keep collection from a group
  const getKeepCollection = (group: DuplicateGroupDisplay) => {
    const keepCollectionId = group.issues[0]?.relatedCollectionId;
    const collection = group.collections.find(c => {
      const relatedIssue = group.issues.find(i => i.collectionId === c.id);
      return keepCollectionId
        ? c.id === keepCollectionId
        : !relatedIssue;
    });

    if (!collection) return null;

    const inNav = collection.shopifyCollectionId ? navShopifyIds.has(collection.shopifyCollectionId) : false;
    const relatedIssue = group.issues.find(i => i.collectionId === collection.id);

    return {
      id: collection.id,
      name: collection.name,
      handle: collection.slug || collection.shopifyHandle || "unknown",
      productCount: relatedIssue?.metadata?.productCount ?? collection.productCount ?? 0,
      inNavigation: inNav,
      createdAt: collection.createdAt,
      shopifyCreatedAt: collection.shopifyCreatedAt,
      createdByType: collection.createdByType,
      createdByName: collection.createdByName,
    };
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Collection Health Report - ShopSyncFlow</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #1a1a1a;
            background: #fff;
            padding: 0.75in;
          }
          @media print {
            body { padding: 0; font-size: 10pt; }
            .page-break { page-break-before: always; }
            @page { margin: 0.75in; size: letter; }
          }
          .report-header {
            border-bottom: 3px solid #1a1a1a;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .report-title { font-size: 24pt; font-weight: 700; margin-bottom: 4px; }
          .report-subtitle { font-size: 11pt; color: #666; }
          .report-meta {
            display: flex;
            justify-content: space-between;
            margin-top: 12px;
            font-size: 9pt;
            color: #666;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .stat-box {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: center;
          }
          .stat-box.highlight-red { border-color: #dc2626; background: #fef2f2; }
          .stat-box.highlight-green { border-color: #16a34a; background: #f0fdf4; }
          .stat-value { font-size: 20pt; font-weight: 700; }
          .stat-value.red { color: #dc2626; }
          .stat-value.green { color: #16a34a; }
          .stat-value.yellow { color: #ca8a04; }
          .stat-value.orange { color: #ea580c; }
          .stat-label { font-size: 8pt; text-transform: uppercase; color: #666; margin-top: 4px; }
          .section { margin-bottom: 24px; }
          .section-header {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #f8f8f8;
            padding: 8px 12px;
            margin-bottom: 12px;
            border-left: 4px solid #1a1a1a;
          }
          .section-header.priority { border-left-color: #dc2626; background: #fef2f2; }
          .section-header.nav-conflicts { border-left-color: #ea580c; background: #fff7ed; }
          .section-header.duplicates { border-left-color: #ca8a04; background: #fefce8; }
          .section-icon { font-size: 14pt; }
          .section-title { font-size: 12pt; font-weight: 600; }
          .section-count { font-size: 10pt; color: #666; margin-left: auto; }
          .duplicate-group {
            border: 1px solid #ddd;
            margin-bottom: 12px;
            page-break-inside: avoid;
          }
          .duplicate-group-header {
            background: #f8f8f8;
            padding: 10px 12px;
            border-bottom: 1px solid #ddd;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .duplicate-name { font-weight: 600; font-size: 11pt; }
          .severity-badge {
            font-size: 8pt;
            padding: 2px 8px;
            border-radius: 3px;
            text-transform: uppercase;
            font-weight: 600;
          }
          .severity-critical { background: #dc2626; color: #fff; }
          .severity-high { background: #ea580c; color: #fff; }
          .severity-medium { background: #ca8a04; color: #fff; }
          .severity-low { background: #2563eb; color: #fff; }
          .collection-row {
            padding: 10px 12px;
            display: grid;
            grid-template-columns: 80px 1fr 80px 100px 120px;
            gap: 12px;
            align-items: center;
            border-bottom: 1px solid #eee;
            font-size: 10pt;
          }
          .collection-row:last-child { border-bottom: none; }
          .collection-row.keep { background: #f0fdf4; }
          .collection-row.delete { background: #fef2f2; }
          .action-badge {
            font-size: 8pt;
            padding: 3px 8px;
            font-weight: 700;
            border-radius: 3px;
          }
          .action-keep { background: #16a34a; color: #fff; }
          .action-delete { background: #dc2626; color: #fff; }
          .collection-handle { font-family: 'SF Mono', Monaco, monospace; font-size: 9pt; color: #444; }
          .collection-products { text-align: center; }
          .collection-creator { font-size: 9pt; color: #666; }
          .collection-date { font-size: 9pt; color: #666; }
          .nav-warning {
            background: #fef2f2;
            border: 1px solid #fecaca;
            padding: 6px 10px;
            margin: 8px 12px;
            font-size: 9pt;
            color: #991b1b;
          }
          .conflict-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
          .conflict-table th {
            background: #f8f8f8;
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #ddd;
            font-size: 9pt;
          }
          .conflict-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #eee;
            vertical-align: top;
          }
          .conflict-type {
            font-size: 8pt;
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 600;
          }
          .type-switch { background: #fed7aa; color: #9a3412; }
          .type-remove { background: #fecaca; color: #991b1b; }
          .type-orphan { background: #e9d5ff; color: #6b21a8; }
          .type-block { background: #fecaca; color: #991b1b; }
          .action-text { font-size: 9pt; color: #444; }
          .info-box {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            padding: 12px;
            margin: 16px 0;
            font-size: 9pt;
          }
          .info-box-title { font-weight: 600; margin-bottom: 6px; }
          .handle-summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 12px;
          }
          .handle-stat { border: 1px solid #ddd; padding: 10px; text-align: center; }
          .handle-count { font-size: 16pt; font-weight: 700; color: #666; }
          .handle-pattern { font-size: 9pt; color: #666; }
          .report-footer {
            margin-top: 24px;
            padding-top: 12px;
            border-top: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            font-size: 8pt;
            color: #666;
          }
          .checklist { margin: 12px 0; }
          .checklist-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 10pt;
          }
          .checkbox {
            width: 14px;
            height: 14px;
            border: 1px solid #999;
            flex-shrink: 0;
            margin-top: 2px;
          }
          .all-clear {
            text-align: center;
            padding: 32px;
            background: #f0fdf4;
            border: 1px solid #86efac;
          }
          .all-clear-icon { font-size: 36pt; margin-bottom: 12px; }
          .all-clear-title { font-size: 14pt; font-weight: 600; color: #16a34a; }
          .all-clear-text { font-size: 10pt; color: #666; margin-top: 4px; }
        </style>
      </head>
      <body>
        <header class="report-header">
          <h1 class="report-title">Collection Health Report</h1>
          <p class="report-subtitle">ShopSyncFlow - ${companyName}</p>
          <div class="report-meta">
            <span>Generated: ${dateStr} at ${timeStr}</span>
            <span>Store: ${storeUrl}</span>
          </div>
        </header>

        <!-- Summary Stats -->
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-value">${stats.total.toLocaleString()}</div>
            <div class="stat-label">Total Collections</div>
          </div>
          <div class="stat-box ${stats.actionRequired > 0 ? 'highlight-red' : 'highlight-green'}">
            <div class="stat-value ${stats.actionRequired > 0 ? 'red' : 'green'}">${stats.actionRequired}</div>
            <div class="stat-label">Action Required</div>
          </div>
          <div class="stat-box">
            <div class="stat-value yellow">${stats.duplicates}</div>
            <div class="stat-label">Duplicate Groups</div>
          </div>
          <div class="stat-box">
            <div class="stat-value orange">${stats.navConflicts}</div>
            <div class="stat-label">Nav Conflicts</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${stats.handleMismatches.toLocaleString()}</div>
            <div class="stat-label">Handle Notes</div>
          </div>
        </div>

        ${stats.actionRequired === 0 && navigationConflicts.length === 0 ? `
          <div class="all-clear">
            <div class="all-clear-icon">[OK]</div>
            <div class="all-clear-title">All collections are healthy!</div>
            <div class="all-clear-text">No duplicates or navigation conflicts detected.</div>
          </div>
        ` : `
          <!-- Priority Actions Section -->
          ${priorityGroups.length > 0 ? `
            <section class="section">
              <div class="section-header priority">
                <span class="section-icon">!</span>
                <span class="section-title">Priority Actions Required</span>
                <span class="section-count">${priorityGroups.length} groups</span>
              </div>
              ${priorityGroups.map(group => {
                const keepCol = getKeepCollection(group);
                const deleteCols = getDeleteCollections(group);
                return `
                  <div class="duplicate-group">
                    <div class="duplicate-group-header">
                      <span class="duplicate-name">${group.name}</span>
                      <span class="severity-badge severity-${group.severity}">${group.severity}</span>
                    </div>
                    ${keepCol ? `
                      <div class="collection-row keep">
                        <span class="action-badge action-keep">KEEP</span>
                        <span class="collection-handle">/${keepCol.handle}</span>
                        <span class="collection-products">${keepCol.productCount} products</span>
                        <span class="collection-creator">${formatCreator(keepCol.createdByType, keepCol.createdByName)}</span>
                        <span class="collection-date">${formatDate(keepCol.shopifyCreatedAt || keepCol.createdAt)}</span>
                      </div>
                    ` : ''}
                    ${deleteCols.map(col => `
                      <div class="collection-row delete">
                        <span class="action-badge action-delete">DELETE</span>
                        <span class="collection-handle">/${col.handle}</span>
                        <span class="collection-products">${col.productCount} products</span>
                        <span class="collection-creator">${formatCreator(col.createdByType, col.createdByName)}</span>
                        <span class="collection-date">${formatDate(col.shopifyCreatedAt || col.createdAt)}</span>
                      </div>
                      ${col.inNavigation ? `
                        <div class="nav-warning">
                          <strong>Warning:</strong> Duplicate is in navigation "${col.navMenuTitle}" - remove from nav first
                        </div>
                      ` : ''}
                    `).join('')}
                  </div>
                `;
              }).join('')}
            </section>
          ` : ''}

          <!-- Navigation Conflicts Section -->
          ${navigationConflicts.length > 0 ? `
            <section class="section">
              <div class="section-header nav-conflicts">
                <span class="section-icon">&harr;</span>
                <span class="section-title">Navigation Conflicts</span>
                <span class="section-count">${navigationConflicts.length} conflicts</span>
              </div>
              <table class="conflict-table">
                <thead>
                  <tr>
                    <th style="width: 80px;">Type</th>
                    <th>Collection</th>
                    <th>Menu</th>
                    <th>Required Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${navigationConflicts.map(conflict => `
                    <tr>
                      <td>
                        <span class="conflict-type type-${conflict.conflictType === 'switch_required' ? 'switch' : conflict.conflictType === 'remove_link' ? 'remove' : conflict.conflictType === 'orphan_link' ? 'orphan' : 'block'}">
                          ${conflict.conflictType === 'switch_required' ? 'Switch' : conflict.conflictType === 'remove_link' ? 'Remove' : conflict.conflictType === 'orphan_link' ? 'Orphan' : 'Block'}
                        </span>
                      </td>
                      <td>
                        <strong>${conflict.collectionName}</strong><br>
                        <span class="collection-handle">/${conflict.collectionHandle}</span>
                      </td>
                      <td>${conflict.menuTitle}</td>
                      <td class="action-text">${conflict.action}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="info-box">
                <div class="info-box-title">How to fix navigation conflicts:</div>
                <ol style="margin-left: 16px; font-size: 9pt;">
                  <li>Go to Shopify Admin &rarr; Online Store &rarr; Navigation</li>
                  <li>Find and edit the menu listed above</li>
                  <li>Update or remove the collection link</li>
                  <li>Save the menu</li>
                </ol>
              </div>
            </section>
          ` : ''}

          <!-- Action Checklist -->
          ${(priorityGroups.length > 0 || navigationConflicts.length > 0) ? `
            <section class="section">
              <div class="section-header">
                <span class="section-icon">[ ]</span>
                <span class="section-title">Action Checklist</span>
              </div>
              <div class="checklist">
                ${generateChecklist().map(item => `
                  <div class="checklist-item">
                    <div class="checkbox"></div>
                    <span>${item}</span>
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}
        `}

        ${stats.handleMismatches > 0 || lowerPriorityGroups.length > 0 ? '<div class="page-break"></div>' : ''}

        <!-- Handle Analysis Summary -->
        ${handlePatterns.length > 0 ? `
          <section class="section">
            <div class="section-header duplicates">
              <span class="section-icon">#</span>
              <span class="section-title">Handle Mismatches (Informational)</span>
              <span class="section-count">${stats.handleMismatches.toLocaleString()} total</span>
            </div>
            <div class="handle-summary">
              ${handlePatterns.slice(0, 4).map(pattern => `
                <div class="handle-stat">
                  <div class="handle-count">${pattern.count.toLocaleString()}</div>
                  <div class="handle-pattern">${pattern.pattern.replace("-", " ")} prefix</div>
                </div>
              `).join('')}
            </div>
            <div class="info-box">
              <div class="info-box-title">About handle mismatches:</div>
              <p>Most handle mismatches are created by filter apps (like Power Tools Filter Menu) and are <strong>expected behavior</strong>. These add prefixes like color-, size-, vendor- for organization. No action is typically required unless a collection with a mismatched handle is linked in navigation.</p>
            </div>
          </section>
        ` : ''}

        <!-- Lower Priority Duplicates -->
        ${lowerPriorityGroups.length > 0 ? `
          <section class="section">
            <div class="section-header duplicates">
              <span class="section-icon">*</span>
              <span class="section-title">Other Duplicates (Lower Priority)</span>
              <span class="section-count">${lowerPriorityGroups.length} groups</span>
            </div>
            ${lowerPriorityGroups.slice(0, 3).map(group => {
              const keepCol = getKeepCollection(group);
              const deleteCols = getDeleteCollections(group);
              return `
                <div class="duplicate-group">
                  <div class="duplicate-group-header">
                    <span class="duplicate-name">${group.name}</span>
                    <span class="severity-badge severity-${group.severity}">${group.severity}</span>
                  </div>
                  ${keepCol ? `
                    <div class="collection-row keep">
                      <span class="action-badge action-keep">KEEP</span>
                      <span class="collection-handle">/${keepCol.handle}</span>
                      <span class="collection-products">${keepCol.productCount} products</span>
                      <span class="collection-creator">${formatCreator(keepCol.createdByType, keepCol.createdByName)}</span>
                      <span class="collection-date">${formatDate(keepCol.shopifyCreatedAt || keepCol.createdAt)}</span>
                    </div>
                  ` : ''}
                  ${deleteCols.slice(0, 2).map(col => `
                    <div class="collection-row delete">
                      <span class="action-badge action-delete">DELETE</span>
                      <span class="collection-handle">/${col.handle}</span>
                      <span class="collection-products">${col.productCount} products</span>
                      <span class="collection-creator">${formatCreator(col.createdByType, col.createdByName)}</span>
                      <span class="collection-date">${formatDate(col.shopifyCreatedAt || col.createdAt)}</span>
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
            ${lowerPriorityGroups.length > 3 ? `
              <p style="font-size: 9pt; color: #666; text-align: center; margin-top: 12px;">
                ... and ${lowerPriorityGroups.length - 3} more low-priority duplicate groups (see app for full list)
              </p>
            ` : ''}
          </section>
        ` : ''}

        <footer class="report-footer">
          <span>ShopSyncFlow Collection Health Report</span>
          <span>Generated on ${dateStr}</span>
        </footer>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Collection Health Report
          </DialogTitle>
          <DialogDescription>
            Generate a printable report summarizing collection health issues for offline review or sharing with team members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm">Report will include:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Collections:</span>
                <span className="font-medium">{stats.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Action Required:</span>
                <span className={`font-medium ${stats.actionRequired > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {stats.actionRequired}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Duplicate Groups:</span>
                <span className="font-medium">{stats.duplicates}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Nav Conflicts:</span>
                <span className="font-medium">{stats.navConflicts}</span>
              </div>
            </div>
          </div>

          {/* Report Contents */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Report Sections:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>1. Summary statistics</li>
              {priorityGroups.length > 0 && (
                <li>2. Priority actions ({priorityGroups.length} critical/high duplicates with KEEP/DELETE recommendations)</li>
              )}
              {navigationConflicts.length > 0 && (
                <li>3. Navigation conflicts table ({navigationConflicts.length} conflicts)</li>
              )}
              {(priorityGroups.length > 0 || navigationConflicts.length > 0) && (
                <li>4. Action checklist (printable checkboxes)</li>
              )}
              {handlePatterns.length > 0 && (
                <li>5. Handle analysis summary (informational)</li>
              )}
              {lowerPriorityGroups.length > 0 && (
                <li>6. Lower priority duplicates ({lowerPriorityGroups.length} groups)</li>
              )}
            </ul>
          </div>

          {/* Print Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p className="text-blue-800">
              <strong>Tip:</strong> The report is optimized for A4/Letter paper and works well in black and white.
              Use your browser's print dialog to save as PDF if needed.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print Report
            </Button>
          </div>
        </div>

        {/* Hidden ref for printing - not actually used since we open new window */}
        <div ref={printRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
