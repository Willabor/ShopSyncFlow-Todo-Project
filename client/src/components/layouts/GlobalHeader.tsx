/**
 * GlobalHeader Component
 * Provides consistent header with title, location, time, and navigation across all pages
 */

import { useSystem } from "@/contexts/SystemContext";
import { useSystemTime } from "@/hooks/useSystemTime";
import { formatTime, formatDate } from "@/lib/dateUtils";
import { WorkflowGuide } from "@/components/workflow-guide";
import { NotificationsDropdown } from "@/components/notifications-dropdown";
import { MapPin, Clock } from "lucide-react";

interface GlobalHeaderProps {
  /** Page title displayed prominently */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Optional page-specific action buttons (e.g., "New Task", "Sync") */
  actions?: React.ReactNode;
}

export function GlobalHeader({ title, subtitle, actions }: GlobalHeaderProps) {
  const { systemInfo } = useSystem();
  const { currentTime } = useSystemTime();

  return (
    <header className="bg-card border-b border-border px-6 py-4 flex-shrink-0">
      <div className="flex items-center justify-between">
        {/* Left: Title & Subtitle */}
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Center: Location & Time */}
        {systemInfo && (
          <div className="flex items-center space-x-6 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1.5">
              <MapPin className="h-4 w-4" />
              <span>{systemInfo.location.city}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Clock className="h-4 w-4" />
              <span className="font-mono">
                {formatDate(currentTime, systemInfo)} {formatTime(currentTime, systemInfo)} {systemInfo.timezoneAbbr}
              </span>
            </div>
          </div>
        )}

        {/* Right: Page Actions + Workflow Guide + Notifications */}
        <div className="flex items-center space-x-4">
          {actions}
          <WorkflowGuide />
          <NotificationsDropdown />
        </div>
      </div>
    </header>
  );
}
