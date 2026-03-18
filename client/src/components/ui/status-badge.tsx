import React from 'react';
import { cn } from '@/lib/utils';
import { designTokens, getStatusKey } from '@/lib/design-tokens';

type WorkflowStatus =
  | 'NEW'
  | 'TRIAGE'
  | 'ASSIGNED'
  | 'IN PROGRESS'
  | 'READY FOR REVIEW'
  | 'PUBLISHED'
  | 'QA APPROVED'
  | 'DONE';

interface StatusBadgeProps {
  status: WorkflowStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  className,
}) => {
  const statusKey = getStatusKey(status);
  const colors = designTokens.colors.status[statusKey];

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        'transition-all duration-200',
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderLeft: `3px solid ${colors.border}`,
        paddingLeft: size === 'sm' ? '10px' : size === 'md' ? '14px' : '18px',
      }}
    >
      {status}
    </span>
  );
};
