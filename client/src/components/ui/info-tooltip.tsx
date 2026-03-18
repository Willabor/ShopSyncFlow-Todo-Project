/**
 * InfoTooltip Component
 *
 * A reusable tooltip component with a question mark icon (?) that displays
 * detailed help text when clicked or hovered.
 *
 * Used throughout the Content Studio to provide SEO guidance to editors.
 */

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

export interface InfoTooltipProps {
  /** The detailed help text to display (supports JSX for formatting) */
  content: React.ReactNode;
  /** Optional: Additional CSS classes for the trigger button */
  className?: string;
  /** Optional: Side where tooltip appears (default: "top") */
  side?: "top" | "right" | "bottom" | "left";
}

export function InfoTooltip({ content, className = "", side = "top" }: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-full w-4 h-4 text-muted-foreground hover:text-foreground transition-colors ${className}`}
            aria-label="Help information"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-sm p-4 text-sm leading-relaxed"
          sideOffset={5}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
