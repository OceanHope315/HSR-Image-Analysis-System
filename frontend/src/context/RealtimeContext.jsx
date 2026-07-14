import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { RealtimeContext } from './realtime-context.js';

const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export function RealtimeProvider({ children }) {
  const [status, setStatus] = useState('disconnected');
  const [revision, setRevision] = useState(0);
  const [highAlarm, setHighAlarm] = useState(null);
  const [latestInspection, setLatestInspection] = useState(null);

  const dismissHighAlarm = useCallback(() => setHighAlarm(null), []);

  useEffect(() => {
    setStatus('connecting');
    const socket = io(socketUrl, {
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
    const onInspectionCreated = (payload) => {
      setLatestInspection(payload?.inspection ?? payload);
      refresh();
    };
    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));
    socket.on('inspection:created', onInspectionCreated);
    socket.on('alarm:high', onHighAlarm);
    socket.on('alarm:updated', refresh);
    socket.on('device:updated', refresh);
    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.close();
    };
  }, []);

  const value = useMemo(
    () => ({ status, revision, highAlarm, latestInspection, dismissHighAlarm }),
    [status, revision, highAlarm, latestInspection, dismissHighAlarm],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
