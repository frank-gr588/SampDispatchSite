import { useEffect, useRef, useCallback, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE } from '@/lib/utils';

type SignalRState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface SignalRContextValue {
  connection: signalR.HubConnection | null;
  state: SignalRState;
}

let globalConnection: signalR.HubConnection | null = null;
const subscribers = new Set<() => void>();

function getConnection(): signalR.HubConnection {
  if (!globalConnection) {
    globalConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/coordshub`)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
  }
  return globalConnection;
}

export function useSignalR(): SignalRContextValue {
  const [state, setState] = useState<SignalRState>('disconnected');
  const startedRef = useRef(false);

  useEffect(() => {
    const conn = getConnection();
    
    const onState = () => setState(conn.state as unknown as SignalRState);
    conn.onreconnecting(() => setState('reconnecting'));
    conn.onreconnected(() => setState('connected'));
    conn.onclose(() => setState('disconnected'));

    if (!startedRef.current) {
      startedRef.current = true;
      conn.start()
        .then(() => setState('connected'))
        .catch((err) => {
          console.warn('[SignalR] Connection failed, retrying:', err);
          setState('disconnected');
          // Retry after delay
          setTimeout(() => {
            startedRef.current = false;
            setState('connecting');
          }, 5000);
        });
    }

    return () => {
      // Don't stop on unmount — keep global connection alive
    };
  }, []);

  return { connection: globalConnection, state };
}

/**
 * Subscribe to a SignalR event. Automatically cleans up on unmount.
 */
export function useSignalREvent<T = unknown>(
  eventName: string,
  handler: (data: T) => void
) {
  const { connection } = useSignalR();

  useEffect(() => {
    if (!connection) return;
    const fn = (data: T) => handler(data);
    connection.on(eventName, fn);
    return () => { connection.off(eventName, fn); };
  }, [connection, eventName, handler]);
}

/**
 * Force a full data refresh via SignalR (triggers query invalidation).
 */
export function useRefreshOnSignalR(
  invalidateQueries: (...keys: string[]) => void
) {
  useSignalREvent('UnitCreated', () => invalidateQueries('units'));
  useSignalREvent('UnitUpdated', () => invalidateQueries('units'));
  useSignalREvent('UnitDeleted', () => invalidateQueries('units'));
  useSignalREvent('SituationUpdated', () => invalidateQueries('situations'));
  useSignalREvent('SituationCreated', () => invalidateQueries('situations'));
  useSignalREvent('SituationDeleted', () => invalidateQueries('situations'));
  useSignalREvent('ChannelUpdated', () => invalidateQueries('channels'));
  useSignalREvent('UpdatePlayer', () => invalidateQueries('players'));
  useSignalREvent('UpdatePlayerStatus', () => invalidateQueries('players'));
}
