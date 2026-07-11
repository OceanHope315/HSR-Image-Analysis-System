import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './auth-context.js';
import { RealtimeContext } from './realtime-context.js';

const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export function RealtimeProvider({ children }) {
  const { token } = useAuth();
  const [status, setStatus] = useState('disconnected');
  const [revision, setRevision] = useState(0);
  const [highAlarm, setHighAlarm] = useState(null);

  const dismissHighAlarm = useCallback(() => setHighAlarm(null), []);

  useEffect(() => {
    if (!token) {
      setStatus('disconnected');
      return undefined;
    }
    setStatus('connecting');
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      timeout: 8_000,
    });
    const refresh = () => setRevision((value) => value + 1);
    const onHighAlarm = (payload) => {
      setHighAlarm(payload?.alarm ?? payload);
      refresh();
    };
    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));
    socket.on('inspection:created', refresh);
    socket.on('alarm:high', onHighAlarm);
    socket.on('alarm:updated', refresh);
    socket.on('device:updated', refresh);
    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.close();
    };
  }, [token]);

  const value = useMemo(
    () => ({ status, revision, highAlarm, dismissHighAlarm }),
    [status, revision, highAlarm, dismissHighAlarm],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
