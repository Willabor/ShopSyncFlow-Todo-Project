import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Design System: Status colors
        "status-new-bg": "#E3F2FD",
        "status-new-border": "#1976D2",
        "status-new-text": "#0D47A1",
        "status-triage-bg": "#FFF3E0",
        "status-triage-border": "#F57C00",
        "status-triage-text": "#E65100",
        "status-assigned-bg": "#F3E5F5",
        "status-assigned-border": "#7B1FA2",
        "status-assigned-text": "#4A148C",
        "status-inprogress-bg": "#FFE0B2",
        "status-inprogress-border": "#FB8C00",
        "status-inprogress-text": "#E65100",
        "status-review-bg": "#E0F2F1",
        "status-review-border": "#00897B",
        "status-review-text": "#004D40",
        "status-published-bg": "#E1F5FE",
        "status-published-border": "#0277BD",
        "status-published-text": "#01579B",
        "status-qa-bg": "#F1F8E9",
        "status-qa-border": "#689F38",
        "status-qa-text": "#33691E",
        "status-done-bg": "#E8F5E9",
        "status-done-border": "#43A047",
        "status-done-text": "#1B5E20",
        // Design System: Priority colors
        "priority-high": "#F44336",
        "priority-medium": "#FF9800",
        "priority-low": "#2196F3",
        // Design System: Semantic colors
        success: "#00C875",
        warning: "#FDAB3D",
        error: "#E2445C",
        info: "#579BFC",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      // Design System: Box shadows
      boxShadow: {
        hover: "0 12px 24px -6px rgba(0, 0, 0, 0.12), 0 6px 12px -3px rgba(0, 0, 0, 0.08)",
      },
      // Design System: Spacing (additional)
      spacing: {
        "18": "4.5rem",
      },
      // Design System: Transition durations
      transitionDuration: {
        fast: "150ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
