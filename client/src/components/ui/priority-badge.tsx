import React from 'react';
import { cn } from '@/lib/utils';
import { designTokens, getPriorityKey } from '@/lib/design-tokens';

type Priority = 'High' | 'Medium' | 'Low';

interface PriorityBadgeProps {
  priority: Priority;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  size = 'md',
  className,
}) => {
  const priorityKey = getPriorityKey(priority);
  const colors = designTokens.colors.priority[priorityKey];

  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold rounded-full',
        'transition-all duration-200',
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {priority}
    </span>
  );
};
