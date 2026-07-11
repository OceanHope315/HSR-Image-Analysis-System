import { createContext, useContext } from 'react';

export const RealtimeContext = createContext(null);

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error('useRealtime 必须在 RealtimeProvider 内使用');
  return value;
}
