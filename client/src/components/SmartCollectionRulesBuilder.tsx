/**
 * Smart Collection Rules Builder
 *
 * Visual UI component for building smart collection rules that match Shopify's
 * SmartCollection API structure. Supports up to 60 rules with AND/OR logic.
 *
 * @see https://shopify.dev/docs/api/admin-rest/latest/resources/smartcollection
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, AlertTriangle, Info } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

export type RuleColumn =
  | "title"
  | "type"
  | "vendor"
  | "variant_title"
  | "tag"
  | "variant_price"
  | "variant_compare_at_price"
  | "variant_weight"
  | "variant_inventory";

export type TextRelation =
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "contains"
  | "not_contains";

export type NumberRelation =
  | "greater_than"
  | "less_than"
  | "equals"
  | "not_equals";

export type RuleRelation = TextRelation | NumberRelation;

export interface SmartCollectionRule {
  column: RuleColumn;
  relation: RuleRelation;
  condition: string;
}

export interface SmartCollectionRules {
  rules: SmartCollectionRule[];
  disjunctive: boolean; // true = OR (any), false = AND (all)
}

// ============================================================================
// Constants
// ============================================================================

const TEXT_COLUMNS: RuleColumn[] = ["title", "type", "vendor", "variant_title", "tag"];
const NUMBER_COLUMNS: RuleColumn[] = ["variant_price", "variant_compare_at_price", "variant_weight", "variant_inventory"];

const COLUMN_LABELS: Record<RuleColumn, string> = {
  title: "Product title",
  type: "Product type",
  vendor: "Product vendor",
  variant_title: "Variant title",
  tag: "Product tag",
  variant_price: "Price",
  variant_compare_at_price: "Compare at price",
  variant_weight: "Weight",
  variant_inventory: "Inventory stock",
};

const TEXT_RELATIONS: { value: TextRelation; label: string }[] = [
  { value: "equals", label: "is equal to" },
  { value: "not_equals", label: "is not equal to" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
];

const NUMBER_RELATIONS: { value: NumberRelation; label: string }[] = [
  { value: "greater_than", label: "is greater than" },
  { value: "less_than", label: "is less than" },
  { value: "equals", label: "is equal to" },
  { value: "not_equals", label: "is not equal to" },
];

const MAX_RULES = 60;

// ============================================================================
// Helper Functions
// ============================================================================

function isTextColumn(column: RuleColumn): boolean {
  return TEXT_COLUMNS.includes(column);
}

function getRelationsForColumn(column: RuleColumn): { value: RuleRelation; label: string }[] {
  return isTextColumn(column) ? TEXT_RELATIONS : NUMBER_RELATIONS;
}

function getDefaultRelation(column: RuleColumn): RuleRelation {
  return isTextColumn(column) ? "equals" : "greater_than";
}

function createEmptyRule(): SmartCollectionRule {
  return {
    column: "tag",
    relation: "equals",
    condition: "",
  };
}

// ============================================================================
// Component Props
// ============================================================================

interface SmartCollectionRulesBuilderProps {
  value: SmartCollectionRules;
  onChange: (rules: SmartCollectionRules) => void;
  disabled?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function SmartCollectionRulesBuilder({
  value,
  onChange,
  disabled = false,
}: SmartCollectionRulesBuilderProps) {
  const { rules, disjunctive } = value;

  // Add a new rule
  const handleAddRule = useCallback(() => {
    if (rules.length >= MAX_RULES) return;
    onChange({
      ...value,
      rules: [...rules, createEmptyRule()],
    });
  }, [rules, value, onChange]);

  // Remove a rule by index
  const handleRemoveRule = useCallback((index: number) => {
    onChange({
      ...value,
      rules: rules.filter((_, i) => i !== index),
    });
  }, [rules, value, onChange]);

  // Update a specific rule
  const handleUpdateRule = useCallback((index: number, updates: Partial<SmartCollectionRule>) => {
    const newRules = [...rules];
    const currentRule = newRules[index];

    // If column changed, reset relation to appropriate default
    if (updates.column && updates.column !== currentRule.column) {
      const newColumn = updates.column;
      const currentRelation = currentRule.relation;
      const validRelations = getRelationsForColumn(newColumn);

      // Check if current relation is valid for new column
      const isRelationValid = validRelations.some(r => r.value === currentRelation);

      newRules[index] = {
        ...currentRule,
        column: newColumn,
        relation: isRelationValid ? currentRelation : getDefaultRelation(newColumn),
        condition: updates.condition ?? currentRule.condition,
      };
    } else {
      newRules[index] = { ...currentRule, ...updates };
    }

    onChange({ ...value, rules: newRules });
  }, [rules, value, onChange]);

  // Toggle disjunctive (AND/OR logic)
  const handleLogicChange = useCallback((newValue: string) => {
    onChange({
      ...value,
      disjunctive: newValue === "any",
    });
  }, [value, onChange]);

  const hasRules = rules.length > 0;
  const isAtMaxRules = rules.length >= MAX_RULES;

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <Alert className="border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-700 text-sm">
          Smart collections automatically include products that match your conditions.
          Products are added or removed automatically as their attributes change.
        </AlertDescription>
      </Alert>

      {/* Logic Toggle - Only show if there are multiple rules */}
      {rules.length > 1 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Products must match:</Label>
          <RadioGroup
            value={disjunctive ? "any" : "all"}
            onValueChange={handleLogicChange}
            disabled={disabled}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="logic-all" />
              <Label htmlFor="logic-all" className="text-sm font-normal cursor-pointer">
                All conditions
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="any" id="logic-any" />
              <Label htmlFor="logic-any" className="text-sm font-normal cursor-pointer">
                Any condition
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            {disjunctive
              ? "Products matching ANY of the conditions below will be included (OR logic)"
              : "Products must match ALL conditions below to be included (AND logic)"}
          </p>
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <RuleRow
            key={index}
            rule={rule}
            index={index}
            onUpdate={handleUpdateRule}
            onRemove={handleRemoveRule}
            disabled={disabled}
            showConnector={index > 0}
            connector={disjunctive ? "OR" : "AND"}
          />
        ))}
      </div>

      {/* Empty State */}
      {!hasRules && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No conditions added yet. Add conditions to automatically include matching products.
          </p>
        </div>
      )}

      {/* Add Rule Button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddRule}
        disabled={disabled || isAtMaxRules}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add {hasRules ? "another " : ""}condition
      </Button>

      {/* Max Rules Warning */}
      {isAtMaxRules && (
        <Alert variant="destructive" className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 text-sm">
            Maximum of {MAX_RULES} conditions reached. Remove a condition to add more.
          </AlertDescription>
        </Alert>
      )}

      {/* Rules Count */}
      {hasRules && (
        <p className="text-xs text-muted-foreground text-right">
          {rules.length} of {MAX_RULES} conditions used
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Rule Row Component
// ============================================================================

interface RuleRowProps {
  rule: SmartCollectionRule;
  index: number;
  onUpdate: (index: number, updates: Partial<SmartCollectionRule>) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  showConnector?: boolean;
  connector?: "AND" | "OR";
}

function RuleRow({
  rule,
  index,
  onUpdate,
  onRemove,
  disabled = false,
  showConnector = false,
  connector = "AND",
}: RuleRowProps) {
  const relations = getRelationsForColumn(rule.column);
  const isNumberColumn = NUMBER_COLUMNS.includes(rule.column);

  return (
    <div className="space-y-2">
      {/* Connector */}
      {showConnector && (
        <div className="flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">
            {connector}
          </span>
        </div>
      )}

      {/* Rule Fields */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
        {/* Column Select */}
        <Select
          value={rule.column}
          onValueChange={(val) => onUpdate(index, { column: val as RuleColumn })}
          disabled={disabled}
        >
          <SelectTrigger className="w-[160px] bg-white">
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Text Fields
            </div>
            {TEXT_COLUMNS.map((col) => (
              <SelectItem key={col} value={col}>
                {COLUMN_LABELS[col]}
              </SelectItem>
            ))}
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">
              Number Fields
            </div>
            {NUMBER_COLUMNS.map((col) => (
              <SelectItem key={col} value={col}>
                {COLUMN_LABELS[col]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Relation Select */}
        <Select
          value={rule.relation}
          onValueChange={(val) => onUpdate(index, { relation: val as RuleRelation })}
          disabled={disabled}
        >
          <SelectTrigger className="w-[160px] bg-white">
            <SelectValue placeholder="Select condition" />
          </SelectTrigger>
          <SelectContent>
            {relations.map((rel) => (
              <SelectItem key={rel.value} value={rel.value}>
                {rel.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Condition Input */}
        <Input
          type={isNumberColumn ? "number" : "text"}
          placeholder={isNumberColumn ? "0" : "Enter value..."}
          value={rule.condition}
          onChange={(e) => onUpdate(index, { condition: e.target.value })}
          disabled={disabled}
          className="flex-1 bg-white"
          step={isNumberColumn ? "0.01" : undefined}
        />

        {/* Remove Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="text-gray-400 hover:text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default SmartCollectionRulesBuilder;

// Export helper for creating empty rules structure
export function createEmptyRulesStructure(): SmartCollectionRules {
  return {
    rules: [],
    disjunctive: false,
  };
}

// Export validation helper
export function validateRules(rules: SmartCollectionRules): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (rules.rules.length > MAX_RULES) {
    errors.push(`Maximum of ${MAX_RULES} conditions allowed`);
  }

  rules.rules.forEach((rule, index) => {
    if (!rule.column) {
      errors.push(`Condition ${index + 1}: Field is required`);
    }
    if (!rule.relation) {
      errors.push(`Condition ${index + 1}: Operator is required`);
    }
    if (!rule.condition || rule.condition.trim() === "") {
      errors.push(`Condition ${index + 1}: Value is required`);
    }

    // Validate number fields have numeric values
    if (NUMBER_COLUMNS.includes(rule.column)) {
      const num = parseFloat(rule.condition);
      if (isNaN(num)) {
        errors.push(`Condition ${index + 1}: Must be a valid number`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
