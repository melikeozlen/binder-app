import { useEffect, useRef } from 'react';
import { api } from '../utils/apiClient';
import { getClientId } from '../utils/clientId';

const HEARTBEAT_MS = 5 * 60 * 1000;
const FOCUS_THROTTLE_MS = 2 * 60 * 1000;

function leaveBeacon() {
  const clientId = getClientId();
  const body = JSON.stringify({ clientId });
  const url = `${(process.env.REACT_APP_API_URL || '').replace(/\/+$/, '')}/api/presence/leave`;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // fallback below
  }
  try {
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  } catch {
    // unload sırasında sessizce yoksay
  }
}

/**
 * Anlık online sayacı. DB yazılmaz; yalnızca bellek.
 * - Açılışta bir kez
 * - Sekme görünürken 5 dk'de bir; gizliyken gönderilmez
 * - Sekme/kapanışta leave → listeden hemen düşer
 * - Giriş/çıkışta hemen bir kez
 * Backend yoksa kendini kapatır.
 */
export function usePresence({ enabled = true, userId = null } = {}) {
  const enabledRef = useRef(enabled);
  const lastSentRef = useRef(0);
  const disabledRef = useRef(false);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return undefined;

    const ping = () => {
      if (disabledRef.current || !enabledRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      lastSentRef.current = Date.now();
      api('/api/presence', { method: 'POST', body: { clientId: getClientId() } }).catch((error) => {
        if (error?.status === 404 || error?.code === 'NETWORK_ERROR') {
          disabledRef.current = true;
        }
      });
    };

    ping();
    const timer = setInterval(ping, HEARTBEAT_MS);
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSentRef.current < FOCUS_THROTTLE_MS) return;
      ping();
    };
    const onPageHide = () => {
      if (disabledRef.current) return;
      leaveBeacon();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      leaveBeacon();
    };
  }, [enabled, userId]);
}
