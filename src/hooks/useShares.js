import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, encodeId } from '../utils/apiClient';

const FOCUS_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Binder paylaşımları. Binder'ın tek sahibi vardır; kabul eden kişi aynı binder'a üye olur.
 * - incoming:     bana gelen bekleyen davetler (kabul / reddet)
 * - outgoing:     benim gönderdiğim bekleyenler (iptal)
 * - members:      benim binder'larıma erişimi olan kullanıcılar (kaldır)
 * - sharedWithMe: bana paylaşılan binder'lar (ayrıl)
 * - send(binderId, toUsername) → yeni davet
 * - accept(id) → üye olur; onAccepted() ile eşitleme tetiklenir
 * - removeMember(binderId, userId) → sahip üyeyi kaldırır
 * - setMemberRole(binderId, userId, role) → sahip yetkiyi değiştirir ('edit' | 'view')
 * - leave(binderId) → üye paylaşımdan ayrılır; onLeft(binderId) ile yerel temizlik
 * - onIncoming(shares[]) → bu oturumda ilk kez görülen gelen davetler (bildirim için)
 */
export function useShares({ user, onAccepted, onLeft, onIncoming }) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [members, setMembers] = useState([]);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const userRef = useRef(user);
  const onAcceptedRef = useRef(onAccepted);
  const onLeftRef = useRef(onLeft);
  const onIncomingRef = useRef(onIncoming);
  userRef.current = user;
  onAcceptedRef.current = onAccepted;
  onLeftRef.current = onLeft;
  onIncomingRef.current = onIncoming;
  const lastRefreshRef = useRef(0);
  // Bu oturumda bildirilen gelen davet id'leri (aynı davet için tekrar bildirim yok)
  const seenIncomingRef = useRef(new Set());

  const refresh = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const data = await api('/api/shares');
      const nextIncoming = Array.isArray(data?.incoming) ? data.incoming : [];
      const fresh = nextIncoming.filter((s) => !seenIncomingRef.current.has(s.id));
      for (const s of nextIncoming) seenIncomingRef.current.add(s.id);
      if (fresh.length > 0) onIncomingRef.current?.(fresh);
      setIncoming(nextIncoming);
      setOutgoing(Array.isArray(data?.outgoing) ? data.outgoing : []);
      setMembers(Array.isArray(data?.members) ? data.members : []);
      setSharedWithMe(Array.isArray(data?.sharedWithMe) ? data.sharedWithMe : []);
      lastRefreshRef.current = Date.now();
    } catch (error) {
      console.warn('[shares] liste alınamadı:', error);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setIncoming([]);
      setOutgoing([]);
      setMembers([]);
      setSharedWithMe([]);
      seenIncomingRef.current = new Set();
      return undefined;
    }
    refresh();
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshRef.current < FOCUS_THROTTLE_MS) return;
      refresh();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
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

  // role: 'edit' (varsayılan) | 'view' (sadece görüntüleme)
  const send = useCallback(
    (binderId, toUsername, role = 'edit') =>
      withBusy(binderId, () =>
        api('/api/shares', { method: 'POST', body: { binderId, toUsername, role } })
      ),
    [withBusy]
  );

  // Sahip: üyenin yetkisini değiştir
  const setMemberRole = useCallback(
    (binderId, userId, role) =>
      withBusy(`${binderId}:${userId}`, () =>
        api(`/api/shares/members/${encodeId(binderId)}/${encodeId(userId)}`, {
          method: 'PATCH',
          body: { role },
        })
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

  const removeMember = useCallback(
    (binderId, userId) =>
      withBusy(`${binderId}:${userId}`, () =>
        api(`/api/shares/members/${encodeId(binderId)}/${encodeId(userId)}`, { method: 'DELETE' })
      ),
    [withBusy]
  );

  // Üye olarak ayrıl: sunucuda üyelik silinir, yerelde binder tamamen temizlenir
  const leave = useCallback(
    (binderId) =>
      withBusy(`leave:${binderId}`, async () => {
        await api(`/api/binders/${encodeId(binderId)}`, { method: 'DELETE' });
        await onLeftRef.current?.(binderId);
      }),
    [withBusy]
  );

  return useMemo(
    () => ({
      incoming,
      outgoing,
      members,
      sharedWithMe,
      busyId,
      refresh,
      send,
      accept,
      reject,
      cancel,
      removeMember,
      setMemberRole,
      leave,
    }),
    [incoming, outgoing, members, sharedWithMe, busyId, refresh, send, accept, reject, cancel, removeMember, setMemberRole, leave]
  );
}
