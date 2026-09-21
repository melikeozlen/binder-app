import { useEffect, useRef } from 'react';
import { api } from '../utils/apiClient';
import { getClientId } from '../utils/clientId';
import { setAnalyticsBackendEnabled } from '../utils/analytics';

const HEARTBEAT_MS = 60 * 1000;
// Sekme tekrar görünür olunca en fazla bu sıklıkta ek heartbeat
const FOCUS_THROTTLE_MS = 20 * 1000;

/**
 * Online sayacı için heartbeat (misafir dahil).
 * - Sayfa açılışında `visit: true` ile bir kez (ziyaret sayısı)
 * - Sekme görünürken 60 sn'de bir; gizliyken gönderilmez
 * - Kullanıcı giriş/çıkış yapınca hemen bir kez (presence hesabı güncellensin)
 * Backend yoksa (404 / ağ hatası) kendini kapatır.
 */
export function usePresence({ enabled = true, userId = null } = {}) {
  const lastSentRef = useRef(0);
  const visitSentRef = useRef(false);
  const disabledRef = useRef(false);

  useEffect(() => {
    if (!enabled || disabledRef.current) return undefined;
    if (typeof document === 'undefined') return undefined;

    let cancelled = false;

    const send = (force = false) => {
      if (cancelled || disabledRef.current) return;
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < FOCUS_THROTTLE_MS) return;
      lastSentRef.current = now;

      const visit = !visitSentRef.current;
      visitSentRef.current = true;
      api('/api/presence', { method: 'POST', body: { clientId: getClientId(), visit } }).catch((error) => {
        if (error?.status === 404 || error?.code === 'NETWORK_ERROR') {
          disabledRef.current = true;
          setAnalyticsBackendEnabled(false);
        } else if (visit) {
          // Ziyaret kaydı gitmedi (örn. 429): bir sonraki denemede tekrar işaretle
          visitSentRef.current = false;
        }
      });
    };

    // Kullanıcı değişti (giriş/çıkış) → hemen gönder
    send(true);

    const interval = setInterval(() => send(true), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') send(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, userId]);
}
