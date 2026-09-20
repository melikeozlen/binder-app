import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSyncQueue,
  deleteCloudBinder,
  isCloudBinder,
  isViewOnlyBinder,
  pushBinder,
  reconcile,
  removeCloudMeta,
} from '../utils/cloudSync';

const PUSH_DEBOUNCE_MS = 2500;
const POLL_INTERVAL_MS = 60 * 1000;
const FOCUS_THROTTLE_MS = 15 * 1000;

/**
 * App state'i ile bulut eşitlemesi arasındaki köprü.
 * - Bulut kaydı opt-in: saveBinder(id) ile hesaba kaydedilen binder'lar (cloudBinderIds)
 *   otomatik eşitlenir; diğerleri yerel kalır.
 * - notifyChange(): seçili binder değişti → (kayıtlıysa) debounce ile push
 * - Giriş: tam reconcile; sonrasında 60 sn'de bir ve sekme odaklanınca hafif reconcile
 * - Rename: ilgili binder (kayıtlıysa) anında push
 * - deleteBinder(): buluttan da sil
 */
export function useCloudSync({
  user,
  binders,
  setBinders,
  saveBindersList,
  selectedBinderId,
  setSelectedBinderId,
  flushCurrentBinderState,
  onBinderPulled,
  onUnauthorized,
  copySuffix,
}) {
  const [status, setStatus] = useState('idle'); // idle | syncing | synced | error
  const [lastError, setLastError] = useState(null);
  // Bu hesaba kaydedilmiş binder id'leri (UI: ☁ rozeti / "Kaydet" butonu)
  const [cloudBinderIds, setCloudBinderIds] = useState(() => new Set());
  // "Kaydet" işlemi süren binder id'leri
  const [savingBinderIds, setSavingBinderIds] = useState(() => new Set());

  const queueRef = useRef(null);
  if (!queueRef.current) queueRef.current = createSyncQueue();

  // Son değerleri ref'te tut (callback'ler stabil kalsın)
  const userRef = useRef(user);
  const bindersRef = useRef(binders);
  const selectedRef = useRef(selectedBinderId);
  const flushRef = useRef(flushCurrentBinderState);
  const onPulledRef = useRef(onBinderPulled);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const copySuffixRef = useRef(copySuffix);
  userRef.current = user;
  bindersRef.current = binders;
  selectedRef.current = selectedBinderId;
  flushRef.current = flushCurrentBinderState;
  onPulledRef.current = onBinderPulled;
  onUnauthorizedRef.current = onUnauthorized;
  copySuffixRef.current = copySuffix;

  const pushTimerRef = useRef(null);
  const lastReconcileRef = useRef(0);
  const prevNamesRef = useRef(null);

  // localStorage'daki cloud-meta'lardan kayıtlı binder kümesini yeniden hesapla
  const refreshCloudIds = useCallback(() => {
    const currentUser = userRef.current;
    const next = new Set();
    if (currentUser) {
      for (const b of bindersRef.current) {
        if (isCloudBinder(b.id, currentUser.id)) next.add(b.id);
      }
    }
    setCloudBinderIds((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, []);

  const run = useCallback(
    (label, task) => {
      return queueRef.current.enqueue(async () => {
        if (!userRef.current) return null;
        setStatus('syncing');
        try {
          const result = await task();
          setStatus('synced');
          setLastError(null);
          return result;
        } catch (error) {
          console.warn(`[cloud] ${label} başarısız:`, error);
          setStatus('error');
          setLastError(error);
          if (error?.status === 401) onUnauthorizedRef.current?.();
          return null;
        } finally {
          refreshCloudIds();
        }
      });
    },
    [refreshCloudIds]
  );

  // Kayıtlı bir binder'ı push eder. `adopt: true` → henüz kayıtlı değilse hesaba kaydeder.
  const pushOne = useCallback(
    (binderId, { adopt = false } = {}) =>
      run('push', async () => {
        const currentUser = userRef.current;
        const binder = bindersRef.current.find((b) => b.id === binderId);
        if (!currentUser || !binder) return null;
        // Sadece görüntüleme yetkisi: sunucu 403 döner, hiç deneme
        if (isViewOnlyBinder(binder)) return null;
        if (!adopt && !isCloudBinder(binderId, currentUser.id)) return null;
        if (binderId === selectedRef.current && flushRef.current) {
          await flushRef.current();
        }
        return pushBinder(
          binderId,
          { name: binder.name, createdAt: binder.createdAt, userId: currentUser.id },
          { force: adopt }
        );
      }),
    [run]
  );

  // "Kaydet": yerel binder'ı hesaba yükle, sonrasında otomatik eşitlensin
  const saveBinder = useCallback(
    async (binderId) => {
      if (!userRef.current) return null;
      setSavingBinderIds((prev) => new Set(prev).add(binderId));
      try {
        return await pushOne(binderId, { adopt: true });
      } finally {
        setSavingBinderIds((prev) => {
          const next = new Set(prev);
          next.delete(binderId);
          return next;
        });
      }
    },
    [pushOne]
  );

  const notifyChange = useCallback(() => {
    if (!userRef.current || !selectedRef.current) return;
    const binderId = selectedRef.current;
    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushOne(binderId), PUSH_DEBOUNCE_MS);
  }, [pushOne]);

  const applyReconcileResult = useCallback(
    (result) => {
      if (!result) return;
      const { added = [], updated = [], removed = [], pulled = [] } = result;
      const current = bindersRef.current;

      if (added.length > 0 || updated.length > 0 || removed.length > 0) {
        const removedSet = new Set(removed);
        const patches = new Map(updated.map(({ id, ...fields }) => [id, fields]));
        const next = current
          .filter((b) => !removedSet.has(b.id))
          .map((b) => (patches.has(b.id) ? { ...b, ...patches.get(b.id) } : b));
        for (const item of added) {
          if (!next.some((b) => b.id === item.id)) {
            next.push({
              id: item.id,
              name: item.name,
              createdAt: item.createdAt || Date.now(),
              shared: Boolean(item.shared),
              ownerUsername: item.shared ? item.ownerUsername || null : null,
              role: item.shared ? item.role || 'edit' : null,
            });
          }
        }
        setBinders(next);
        saveBindersList(next);

        const selected = selectedRef.current;
        if (selected && removedSet.has(selected)) {
          const fallback = next[0]?.id || null;
          if (fallback) setSelectedBinderId(fallback);
          return;
        }
      }

      const selected = selectedRef.current;
      if (selected && pulled.includes(selected)) {
        onPulledRef.current?.(selected);
      }
    },
    [setBinders, saveBindersList, setSelectedBinderId]
  );

  const runReconcile = useCallback(
    (checkLocalChanges) =>
      run('reconcile', async () => {
        const currentUser = userRef.current;
        if (!currentUser) return null;
        if (flushRef.current) await flushRef.current();
        const result = await reconcile({
          userId: currentUser.id,
          localBinders: bindersRef.current,
          checkLocalChanges,
          copySuffix: copySuffixRef.current,
        });
        lastReconcileRef.current = Date.now();
        applyReconcileResult(result);
        return result;
      }),
    [run, applyReconcileResult]
  );

  // Kullanıcı veya liste değişince kayıtlı küme güncel kalsın
  useEffect(() => {
    refreshCloudIds();
  }, [user, binders, refreshCloudIds]);

  // Giriş/çıkış → tam reconcile, periyodik ve odaklanmada hafif reconcile
  useEffect(() => {
    if (!user) {
      setStatus('idle');
      setLastError(null);
      clearTimeout(pushTimerRef.current);
      return undefined;
    }

    runReconcile(true);

    const interval = setInterval(() => runReconcile(false), POLL_INTERVAL_MS);
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastReconcileRef.current < FOCUS_THROTTLE_MS) return;
      runReconcile(false);
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, runReconcile]);

  // Rename → ilgili binder'ı anında push
  useEffect(() => {
    const next = new Map(binders.map((b) => [b.id, b.name]));
    const prev = prevNamesRef.current;
    if (prev && userRef.current) {
      for (const [id, name] of next) {
        if (prev.has(id) && prev.get(id) !== name) pushOne(id);
      }
    }
    prevNamesRef.current = next;
  }, [binders, pushOne]);

  // Unmount → bekleyen debounce'u iptal et
  useEffect(() => () => clearTimeout(pushTimerRef.current), []);

  const deleteBinder = useCallback(
    async (binderId) => {
      if (!userRef.current) {
        removeCloudMeta(binderId);
        return;
      }
      await run('delete', () => deleteCloudBinder(binderId));
    },
    [run]
  );

  const syncNow = useCallback(() => runReconcile(true), [runReconcile]);

  return useMemo(
    () => ({
      status,
      lastError,
      cloudBinderIds,
      savingBinderIds,
      notifyChange,
      deleteBinder,
      saveBinder,
      syncNow,
    }),
    [status, lastError, cloudBinderIds, savingBinderIds, notifyChange, deleteBinder, saveBinder, syncNow]
  );
}
