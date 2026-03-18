/**
 * CharacterCounter Component
 *
 * A reusable component for displaying character/keyword counts with color-coded feedback.
 * Used for SEO optimization to ensure titles, descriptions, and keywords meet best practices.
 *
 * Color Coding Logic:
 * - Characters: Red (< 50 or > max), Orange (50-54), Green (55-60)
 * - Keywords: Green (3-5), Orange (6-7), Red (< 3 or > 7)
 *
 * @example
 * // For character counting (titles, descriptions)
 * <CharacterCounter current={56} min={55} max={60} label="Title" />
 *
 * @example
 * // For keyword counting
 * <CharacterCounter current={5} min={3} max={7} type="keywords" label="Keywords" />
 */

import React from 'react';

export interface CharacterCounterProps {
  /** Current count (characters or keywords) */
  current: number;
  /** Minimum recommended count */
  min: number;
  /** Maximum allowed count */
  max: number;
  /** Optional label to display before count */
  label?: string;
  /** Type of counting - characters or keywords */
  type?: 'characters' | 'keywords';
  /** Additional CSS classes */
  className?: string;
}

interface CounterStatus {
  color: string;
  icon: string;
  message: string;
}

export function CharacterCounter({
  current,
  min,
  max,
  label,
  type = 'characters',
  className = '',
}: CharacterCounterProps) {

  /**
   * Determines the status (color, icon, message) based on current count
   *
   * For characters (titles/descriptions):
   * - 🔴 Red: < 50 or > max
   * - 🟠 Orange: 50-54
   * - 🟢 Green: 55-60
   *
   * For keywords:
   * - 🟢 Green: 3-5 (optimal)
   * - 🟠 Orange: 6-7 (acceptable)
   * - 🔴 Red: < 3 or > 7
   */
  const getStatus = (): CounterStatus => {
    if (type === 'keywords') {
      // Keywords: 3-5 green, 6-7 orange, <3 or >7 red
      if (current >= 3 && current <= 5) {
        return {
          color: 'text-green-600 dark:text-green-400',
          icon: '🟢',
          message: 'Optimal keyword count',
        };
      }
      if (current >= 6 && current <= 7) {
        return {
          color: 'text-orange-600 dark:text-orange-400',
          icon: '🟠',
          message: 'Acceptable keyword count',
        };
      }
      return {
        color: 'text-red-600 dark:text-red-400',
        icon: '🔴',
        message: current < 3 ? 'Too few keywords' : 'Too many keywords',
      };
    }

    // Characters: Red (< 50 or > max), Orange (50-54), Green (55-60)

    // Above max = red
    if (current > max) {
      const diff = current - max;
      return {
        color: 'text-red-600 dark:text-red-400',
        icon: '🔴',
        message: `Remove ${diff} characters`,
      };
    }

    // Below 50 = red
    if (current < 50) {
      const diff = 50 - current;
      return {
        color: 'text-red-600 dark:text-red-400',
        icon: '🔴',
        message: `Add ${diff} more characters (minimum 50)`,
      };
    }

    // 50-54 = orange (needs improvement)
    if (current >= 50 && current <= 54) {
      const diff = min - current;
      return {
        color: 'text-orange-600 dark:text-orange-400',
        icon: '🟠',
        message: `Add ${diff} more for optimal SEO`,
      };
    }

    // 55-60 = green (perfect!)
    return {
      color: 'text-green-600 dark:text-green-400',
      icon: '🟢',
      message: 'Perfect length for SEO',
    };
  };

  const status = getStatus();

  return (
    <div
      className={`flex items-center gap-2 text-xs font-medium ${status.color} ${className}`}
      title={status.message}
    >
      <span role="img" aria-label={status.message}>
        {status.icon}
      </span>
      <span>
        {label && `${label}: `}
        {current} / {max} {type === 'keywords' ? 'keywords' : 'characters'}
      </span>
    </div>
  );
}
