import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '../lib/config';
import type { WsMessage } from '../types';

export type WsStatus = 'connecting' | 'open' | 'closed';

export type UseWebSocketReturn = {
  status: WsStatus;
  subscribe: (eventType: string, handler: (data: any) => void) => () => void;
};

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 45000; // 45s
const HEARTBEAT_TIMEOUT_MS = 15000;  // 15s to respond

type EventHandler = (data: any) => void;
type RawWsMessage = WsMessage | { type: '__heartbeat__'; [key: string]: any };

export function useWebSocket(onMessage: (msg: WsMessage) => void): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const subscriptionsRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const resetReconnectDelay = () => {
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
  };

  const getNextReconnectDelay = () => {
    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(
      delay * (1.5 + Math.random() * 0.5),
      MAX_RECONNECT_DELAY_MS
    );
    return delay;
  };

  const sendHeartbeat = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: '__heartbeat__' }));
      heartbeatTimeoutRef.current = setTimeout(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          console.warn('[ws] heartbeat timeout, closing connection');
          socketRef.current.close();
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }
  };

  const connect = () => {
    if (cancelledRef.current) return;

    setStatus('connecting');
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      if (cancelledRef.current) return;
      socketRef.current = socket;
      setStatus('open');
      resetReconnectDelay();
      console.log('[ws] connected');

      heartbeatTimerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RawWsMessage;

        if (msg.type === '__heartbeat__') {
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          return;
        }

        const handlers = subscriptionsRef.current.get(msg.type);
        if (handlers && handlers.size > 0) {
          handlers.forEach((handler) => {
            try {
              handler(msg);
            } catch (err) {
              console.error(`[ws] handler error for ${msg.type}:`, err);
            }
          });
        }

        onMessageRef.current(msg);
      } catch (err) {
        console.error('[ws] failed to parse message', err);
      }
    };

    socket.onclose = () => {
      if (cancelledRef.current) return;
      setStatus('closed');

      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }

      const delay = getNextReconnectDelay();
      console.log(`[ws] closed, reconnecting in ${delay}ms`);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    socket.onerror = (err) => {
      console.error('[ws] error:', err);
      socket.close();
    };

    socketRef.current = socket;
  };

  useEffect(() => {
    cancelledRef.current = false;
    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current);
      socketRef.current?.close();
    };
  }, []);

  const subscribe = (eventType: string, handler: EventHandler) => {
    if (!subscriptionsRef.current.has(eventType)) {
      subscriptionsRef.current.set(eventType, new Set());
    }
    subscriptionsRef.current.get(eventType)!.add(handler);

    return () => {
      const handlers = subscriptionsRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          subscriptionsRef.current.delete(eventType);
        }
      }
    };
  };

  return { status, subscribe };
}