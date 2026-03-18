/**
 * MainLayout Component
 * Provides consistent page layout with Sidebar and GlobalHeader
 * Use this component to wrap page content for a unified layout across the app
 */

import { Sidebar } from "@/components/sidebar";
import { GlobalHeader } from "./GlobalHeader";

interface MainLayoutProps {
  /** Page content */
  children: React.ReactNode;
  /** Page title displayed in header */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Optional page-specific action buttons for the header */
  actions?: React.ReactNode;
}

export function MainLayout({ children, title, subtitle, actions }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <GlobalHeader title={title} subtitle={subtitle} actions={actions} />
        <div id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
          {children}
        </div>
      </main>
    </div>
  );
}
