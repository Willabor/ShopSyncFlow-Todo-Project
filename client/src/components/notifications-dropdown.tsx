/**
 * NotificationsDropdown Component
 *
 * The notification bell in the header with:
 * - Badge showing unread count (capped at 99+)
 * - Red attention state for critical notifications
 * - Subtle pulse animation for critical alerts
 * - Dropdown panel with categorized notifications
 */

import { useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationContext";
import { NotificationPanel } from "@/components/notifications";
import { cn } from "@/lib/utils";

export function NotificationsDropdown() {
  const { counts, isOpen, setIsOpen } = useNotifications();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get badge display value (cap at 99+)
  const badgeCount = counts?.total ?? 0;
  const displayCount = badgeCount > 99 ? "99+" : badgeCount.toString();
  const hasCritical = (counts?.criticalCount ?? 0) > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, setIsOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, setIsOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
        aria-label={`Notifications${badgeCount > 0 ? `, ${badgeCount} unread` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-testid="button-notifications"
      >
        <Bell className={cn("h-5 w-5", hasCritical && "text-red-500")} />

        {/* Badge */}
        {badgeCount > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium flex items-center justify-center",
              hasCritical
                ? "bg-red-500 text-white animate-pulse"
                : "bg-primary text-primary-foreground"
            )}
            data-testid="text-notification-count"
          >
            {displayCount}
          </span>
        )}
      </Button>

      {/* Screen reader announcement for new notifications */}
      {badgeCount > 0 && (
        <span className="sr-only" aria-live="polite">
          {badgeCount} new notifications
          {hasCritical && ", including critical alerts"}
        </span>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 z-50"
          role="dialog"
          aria-label="Notification center"
          aria-modal="true"
        >
          <NotificationPanel onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
