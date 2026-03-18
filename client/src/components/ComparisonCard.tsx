/**
 * Comparison Card Component
 *
 * Displays side-by-side comparison of a single field between current and new values
 * Used in product update confirmation dialogs
 */

import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { useState } from "react";

interface ComparisonCardProps {
  label: string;
  currentValue: string | null | undefined;
  newValue: string | null | undefined;
  changed: boolean;
  expandable?: boolean;
  expandThreshold?: number;
  stripHtml?: boolean;
}

/**
 * Strip HTML tags from text for display purposes
 * Preserves line breaks and decodes HTML entities
 */
function stripHtmlTags(html: string): string {
  // Create a temporary div to decode HTML entities
  const div = document.createElement('div');
  div.innerHTML = html;

  // Get text content (automatically strips HTML tags)
  let text = div.textContent || div.innerText || '';

  // Clean up excessive whitespace while preserving intentional line breaks
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Reduce multiple blank lines to double
  text = text.trim();

  return text;
}

export function ComparisonCard({
  label,
  currentValue,
  newValue,
  changed,
  expandable = false,
  expandThreshold = 200,
  stripHtml = false
}: ComparisonCardProps) {
  const [expandedCurrent, setExpandedCurrent] = useState(false);
  const [expandedNew, setExpandedNew] = useState(false);

  // Strip HTML if requested
  let currentText = currentValue || 'Not set';
  let newText = newValue || 'Not set';

  if (stripHtml && currentValue) {
    currentText = stripHtmlTags(currentValue);
  }

  if (stripHtml && newValue) {
    newText = stripHtmlTags(newValue);
  }

  const currentNeedsExpansion = expandable && currentText.length > expandThreshold;
  const newNeedsExpansion = expandable && newText.length > expandThreshold;

  const displayCurrentText = currentNeedsExpansion && !expandedCurrent
    ? currentText.substring(0, expandThreshold) + '...'
    : currentText;

  const displayNewText = newNeedsExpansion && !expandedNew
    ? newText.substring(0, expandThreshold) + '...'
    : newText;

  return (
    <div className={`border rounded-lg p-4 ${changed ? 'border-green-300 bg-green-50/50' : 'border-gray-200'}`}>
      {/* Field Label */}
      <div className="flex items-center gap-2 mb-3">
        <h4 className="font-semibold text-sm text-gray-700">{label}</h4>
        {changed && (
          <Badge variant="default" className="text-xs bg-green-600">
            <Sparkles className="w-3 h-3 mr-1" />
            AI Enhanced
          </Badge>
        )}
        {!changed && (
          <Badge variant="outline" className="text-xs text-gray-500">
            Unchanged
          </Badge>
        )}
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Current Value */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Current (Saved)</p>
          <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
            {displayCurrentText}
          </div>
          {currentNeedsExpansion && (
            <button
              onClick={() => setExpandedCurrent(!expandedCurrent)}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              {expandedCurrent ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* New Value */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">New (AI Generated)</p>
          <div className={`text-sm whitespace-pre-wrap break-words ${changed ? 'text-green-700 font-medium' : 'text-gray-900'}`}>
            {displayNewText}
          </div>
          {newNeedsExpansion && (
            <button
              onClick={() => setExpandedNew(!expandedNew)}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              {expandedNew ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
