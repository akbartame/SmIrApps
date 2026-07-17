import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '../lib/config';
import type { WsMessage } from '../types';

export type WsStatus = 'connecting' | 'open' | 'closed';

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      setStatus('connecting');
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (cancelled) return;
        setStatus('open');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          onMessageRef.current(msg);
        } catch (err) {
          console.error('[ws] failed to parse message', err);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setStatus('closed');
        // Simple fixed-delay reconnect — fine for a single-tenant dashboard.
        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return status;
}
