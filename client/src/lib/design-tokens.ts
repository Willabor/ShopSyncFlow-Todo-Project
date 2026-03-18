/**
 * ShopSyncFlow Design System Tokens
 * Based on Monday.com best practices
 * Version: 1.0
 * Created: 2025-10-23
 */

export const designTokens = {
  // Color palette
  colors: {
    // Brand colors
    primary: {
      50: '#E3F2FD',
      100: '#BBDEFB',
      200: '#90CAF9',
      300: '#64B5F6',
      400: '#42A5F5',
      500: '#2196F3',  // Main brand blue
      600: '#1E88E5',
      700: '#1976D2',
      800: '#1565C0',
      900: '#0D47A1',
    },

    // Status colors for workflow stages
    status: {
      new: {
        bg: '#E3F2FD',
        border: '#1976D2',
        text: '#0D47A1',
      },
      triage: {
        bg: '#FFF3E0',
        border: '#F57C00',
        text: '#E65100',
      },
      assigned: {
        bg: '#F3E5F5',
        border: '#7B1FA2',
        text: '#4A148C',
      },
      inProgress: {
        bg: '#FFE0B2',
        border: '#FB8C00',
        text: '#E65100',
      },
      readyForReview: {
        bg: '#E0F2F1',
        border: '#00897B',
        text: '#004D40',
      },
      published: {
        bg: '#E1F5FE',
        border: '#0277BD',
        text: '#01579B',
      },
      qaApproved: {
        bg: '#F1F8E9',
        border: '#689F38',
        text: '#33691E',
      },
      done: {
        bg: '#E8F5E9',
        border: '#43A047',
        text: '#1B5E20',
      },
    },

    // Priority colors
    priority: {
      high: {
        bg: '#F44336',
        text: '#FFFFFF',
      },
      medium: {
        bg: '#FF9800',
        text: '#FFFFFF',
      },
      low: {
        bg: '#2196F3',
        text: '#FFFFFF',
      },
    },

    // Semantic colors
    success: '#00C875',  // Green
    warning: '#FDAB3D',  // Orange
    error: '#E2445C',    // Red
    info: '#579BFC',     // Light blue

    // Neutral colors (grays)
    gray: {
      50: '#F8F9FA',
      100: '#F1F3F4',
      200: '#E8EAED',
      300: '#DADCE0',
      400: '#BDC1C6',
      500: '#9AA0A6',
      600: '#80868B',
      700: '#5F6368',
      800: '#3C4043',
      900: '#202124',
    },

    // UI element colors
    sidebar: {
      bg: '#323338',       // Dark navy
      text: '#FFFFFF',
      hover: '#404047',
      active: '#0073EA',
    },

    background: {
      page: '#F8F9FA',     // Light gray
      card: '#FFFFFF',
      hover: '#F5F5F5',
    },

    text: {
      primary: '#1A1A1A',
      secondary: '#666666',
      disabled: '#9AA0A6',
      inverse: '#FFFFFF',
    },

    border: {
      default: '#E8EAED',
      hover: '#DADCE0',
      focus: '#2196F3',
    },
  },

  // Typography scale
  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
    },

    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
    },

    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },

    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },

    letterSpacing: {
      tight: '-0.02em',
      normal: '0',
      wide: '0.02em',
      wider: '0.05em',
    },
  },

  // Spacing scale (8px base unit)
  spacing: {
    0: '0',
    1: '4px',    // 0.5 * 8
    2: '8px',    // 1 * 8
    3: '12px',   // 1.5 * 8
    4: '16px',   // 2 * 8
    5: '20px',   // 2.5 * 8
    6: '24px',   // 3 * 8
    8: '32px',   // 4 * 8
    10: '40px',  // 5 * 8
    12: '48px',  // 6 * 8
    16: '64px',  // 8 * 8
    20: '80px',  // 10 * 8
    24: '96px',  // 12 * 8
  },

  // Border radius
  borderRadius: {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },

  // Shadows for elevation
  shadow: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    hover: '0 12px 24px -6px rgba(0, 0, 0, 0.12), 0 6px 12px -3px rgba(0, 0, 0, 0.08)',
  },

  // Transitions
  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slower: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Z-index layers
  zIndex: {
    dropdown: 1000,
    sticky: 1100,
    modal: 1200,
    popover: 1300,
    tooltip: 1400,
  },
} as const;

export type DesignTokens = typeof designTokens;

// Helper function to map workflow status to design token key
export const getStatusKey = (status: string): keyof typeof designTokens.colors.status => {
  const statusMap: Record<string, keyof typeof designTokens.colors.status> = {
    'NEW': 'new',
    'TRIAGE': 'triage',
    'ASSIGNED': 'assigned',
    'IN PROGRESS': 'inProgress',
    'READY FOR REVIEW': 'readyForReview',
    'PUBLISHED': 'published',
    'QA APPROVED': 'qaApproved',
    'DONE': 'done',
  };

  return statusMap[status] || 'new';
};

// Helper function to map priority to design token key
export const getPriorityKey = (priority: string): keyof typeof designTokens.colors.priority => {
  const priorityMap: Record<string, keyof typeof designTokens.colors.priority> = {
    'High': 'high',
    'Medium': 'medium',
    'Low': 'low',
  };

  return priorityMap[priority] || 'medium';
};
