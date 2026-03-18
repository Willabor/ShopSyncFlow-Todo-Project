/**
 * useSystemTime Hook
 * Provides live clock synchronized with server time
 */

import { useState, useEffect } from 'react';
import { useSystem } from '@/contexts/SystemContext';

export function useSystemTime() {
  const { systemInfo } = useSystem();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    // Update clock every second
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return {
    currentTime,
    systemInfo,
  };
}
