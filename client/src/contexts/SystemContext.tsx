/**
 * System Context
 * Provides system information (time, location, timezone) app-wide
 */

import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface SystemInfo {
  currentTime: string;
  timezone: string;
  timezoneOffset: number;
  timezoneAbbr: string;
  location: {
    businessName: string;
    city: string;
    full: string;
  };
  format: {
    time: '12' | '24';
    date: string;
  };
}

interface SystemContextType {
  systemInfo: SystemInfo | null;
  isLoading: boolean;
  error: Error | null;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

interface SystemProviderProps {
  children: ReactNode;
}

export function SystemProvider({ children }: SystemProviderProps) {
  const { data: systemInfo, isLoading, error } = useQuery<SystemInfo>({
    queryKey: ['/api/system/info'],
    // Refetch every 5 minutes to keep timezone accurate (DST changes)
    refetchInterval: 5 * 60 * 1000,
    // Don't refetch on window focus (we have a local clock)
    refetchOnWindowFocus: false,
    // Retry on mount (in case of initial failure)
    retry: 3,
  });

  return (
    <SystemContext.Provider
      value={{
        systemInfo: systemInfo || null,
        isLoading,
        error: error as Error | null,
      }}
    >
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (context === undefined) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
}
