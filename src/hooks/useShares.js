import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, encodeId } from '../utils/apiClient';

const POLL_INTERVAL_MS = 60 * 1000;
const FOCUS_THROTTLE_MS = 15 * 1000;

/**
 * Binder paylaşımları (kopya gönderme).
 * - incoming: bana gelen bekleyen paylaşımlar (kabul / reddet)
 * - outgoing: benim gönderdiğim bekleyenler (iptal)
 * - send(binderId, toUsername) → yeni paylaşım
 * - accept(id) → kopya alıcının hesabına yazılır; onAccepted() ile eşitleme tetiklenir
 */
export function useShares({ user, onAccepted }) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const userRef = useRef(user);
  const onAcceptedRef = useRef(onAccepted);
  userRef.current = user;
  onAcceptedRef.current = onAccepted;
  const lastRefreshRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const data = await api('/api/shares');
      setIncoming(Array.isArray(data?.incoming) ? data.incoming : []);
      setOutgoing(Array.isArray(data?.outgoing) ? data.outgoing : []);
      lastRefreshRef.current = Date.now();
    } catch (error) {
      console.warn('[shares] liste alınamadı:', error);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setIncoming([]);
      setOutgoing([]);
      return undefined;
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshRef.current < FOCUS_THROTTLE_MS) return;
      refresh();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  const withBusy = useCallback(
    async (id, task) => {
      setBusyId(id);
      try {
        return await task();
      } finally {
        setBusyId(null);
        refresh();
      }
    },
    [refresh]
  );

  const send = useCallback(
    (binderId, toUsername) =>
      withBusy(binderId, () =>
        api('/api/shares', { method: 'POST', body: { binderId, toUsername } })
      ),
    [withBusy]
  );

  const accept = useCallback(
    (shareId) =>
      withBusy(shareId, async () => {
        const result = await api(`/api/shares/${encodeId(shareId)}/accept`, { method: 'POST' });
        onAcceptedRef.current?.(result);
        return result;
      }),
    [withBusy]
  );

  const reject = useCallback(
    (shareId) =>
      withBusy(shareId, () => api(`/api/shares/${encodeId(shareId)}/reject`, { method: 'POST' })),
    [withBusy]
  );

  const cancel = useCallback(
    (shareId) => withBusy(shareId, () => api(`/api/shares/${encodeId(shareId)}`, { method: 'DELETE' })),
    [withBusy]
  );

  return useMemo(
    () => ({ incoming, outgoing, busyId, refresh, send, accept, reject, cancel }),
    [incoming, outgoing, busyId, refresh, send, accept, reject, cancel]
  );
}
