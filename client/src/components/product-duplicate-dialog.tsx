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
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Product {
  id: string;
  title: string;
  vendor: string;
  styleNumber?: string;
  status: string;
  createdAt: Date;
}

interface DuplicateDetectionResult {
  level: 1 | 2 | 3 | 4 | 5;
  confidence: 'DEFINITE' | 'VERY_STRONG' | 'STRONG' | 'POSSIBLE' | 'NEW';
  matchedBy: 'SKU' | 'Vendor + Style + Title' | 'Vendor + Style + Color' | 'Vendor + Style' | 'None';
  matches: Product[];
  recommendation: 'UPDATE' | 'UPDATE_OR_CREATE' | 'ADD_VARIANT_OR_CREATE' | 'CREATE';
}

interface ProductDuplicateDialogProps {
  isOpen: boolean;
  result: DuplicateDetectionResult | null;
  newProductName: string;
  onUpdate: (productId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export function ProductDuplicateDialog({
  isOpen,
  result,
  newProductName,
  onUpdate,
  onCreateNew,
  onCancel,
}: ProductDuplicateDialogProps) {
  if (!result) return null;

  // Determine dialog styling based on confidence level
  const getConfidenceColor = () => {
    switch (result.confidence) {
      case 'DEFINITE':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'VERY_STRONG':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'STRONG':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'POSSIBLE':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
  };

  const getConfidenceIcon = () => {
    switch (result.confidence) {
      case 'DEFINITE':
      case 'VERY_STRONG':
        return <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
      case 'STRONG':
      case 'POSSIBLE':
        return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    }
  };

  const getTitle = () => {
    if (result.level === 5) return "No Duplicates Found";
    return "Potential Duplicate Detected";
  };

  const getDescription = () => {
    if (result.level === 5) {
      return "No existing products match this item. It will be created as a new product.";
    }

    const matchCount = result.matches.length;
    return `Found ${matchCount} existing product${matchCount > 1 ? 's' : ''} that ${matchCount > 1 ? 'match' : 'matches'} "${newProductName}".`;
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onCancel}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {getConfidenceIcon()}
            {getTitle()}
          </AlertDialogTitle>
          <AlertDialogDescription>{getDescription()}</AlertDialogDescription>
        </AlertDialogHeader>

        {/* Confidence Level Badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Confidence:</span>
          <Badge className={getConfidenceColor()}>
            {result.confidence} ({result.level === 1 ? '99.9%' : result.level === 2 ? '98%' : result.level === 3 ? '95%' : result.level === 4 ? '85%' : '0%'})
          </Badge>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Matched by: <span className="font-medium">{result.matchedBy}</span>
          </span>
        </div>

        {/* Existing Products */}
        {result.matches.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Existing Product{result.matches.length > 1 ? 's' : ''}:
              </h4>
              {result.matches.slice(0, 3).map((product) => (
                <div
                  key={product.id}
                  className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 space-y-1"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {product.title}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Vendor: {product.vendor}
                        {product.styleNumber && ` • Style: ${product.styleNumber}`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Created: {new Date(product.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                      {product.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {result.matches.length > 3 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  ... and {result.matches.length - 3} more match{result.matches.length - 3 > 1 ? 'es' : ''}
                </p>
              )}
            </div>
          </>
        )}

        {/* Recommendation */}
        <Separator />
        <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
            Recommendation:
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {result.recommendation === 'UPDATE' && (
              <>
                Update the existing product to avoid duplicates. This is a <strong>definite match</strong>.
              </>
            )}
            {result.recommendation === 'UPDATE_OR_CREATE' && (
              <>
                Update the existing product or create a new one if this is intentionally different.
              </>
            )}
            {result.recommendation === 'ADD_VARIANT_OR_CREATE' && (
              <>
                Consider adding this as a variant to the existing product, or create a new product if it's a different design.
              </>
            )}
            {result.recommendation === 'CREATE' && (
              <>
                This appears to be a new product. Safe to create.
              </>
            )}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            Cancel
          </AlertDialogCancel>

          {/* Action buttons based on recommendation */}
          {result.level === 5 ? (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onCreateNew();
              }}
              className="bg-green-600 hover:bg-green-700 focus:ring-green-600"
            >
              Create New Product
            </AlertDialogAction>
          ) : (
            <>
              {result.matches.length > 0 && (
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    onUpdate(result.matches[0].id);
                  }}
                  className="bg-orange-600 hover:bg-orange-700 focus:ring-orange-600"
                >
                  Update Existing
                </AlertDialogAction>
              )}
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  onCreateNew();
                }}
                className={result.level === 1 ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600' : ''}
              >
                {result.level === 1 ? 'Create Anyway (Not Recommended)' : 'Create New Product'}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
