// Hesaba özel binder listesi (localStorage).
// Misafir: binders-list:guest
// Hesap:   binders-list:user:<username>  (küçük harf)
// Eski tek liste (binders-list) ilk açılışta misafire taşınır.

export const GUEST_ACCOUNT = 'guest';

const LEGACY_LIST_KEY = 'binders-list';
const LEGACY_SELECTED_KEY = 'selected-binder-id';

const listKey = (account) => `binders-list:${account}`;
const selectedKey = (account) => `selected-binder-id:${account}`;

export function accountKey(user) {
  if (!user?.username) return GUEST_ACCOUNT;
  return `user:${String(user.username).trim().toLowerCase()}`;
}

/** Eski global listeyi bir kez misafir hesabına taşı */
export function ensureLegacyBindersMigrated() {
  try {
    const legacy = localStorage.getItem(LEGACY_LIST_KEY);
    if (legacy == null) return;
    if (localStorage.getItem(listKey(GUEST_ACCOUNT)) == null) {
      localStorage.setItem(listKey(GUEST_ACCOUNT), legacy);
      const sel = localStorage.getItem(LEGACY_SELECTED_KEY);
      if (sel) localStorage.setItem(selectedKey(GUEST_ACCOUNT), sel);
    }
    localStorage.removeItem(LEGACY_LIST_KEY);
    localStorage.removeItem(LEGACY_SELECTED_KEY);
  } catch (e) {
    console.warn('Binder liste migrasyonu başarısız:', e);
  }
}

export function loadBindersList(account = GUEST_ACCOUNT) {
  ensureLegacyBindersMigrated();
  try {
    const saved = localStorage.getItem(listKey(account));
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    console.error('Binder listesi yüklenirken hata:', e);
  }
  return [];
}

export function saveBindersList(account, binders) {
  try {
    localStorage.setItem(listKey(account), JSON.stringify(binders));
  } catch (e) {
    console.error('Binder listesi kaydedilirken hata:', e);
  }
}

export function loadSelectedBinderId(account = GUEST_ACCOUNT) {
  ensureLegacyBindersMigrated();
  try {
    return localStorage.getItem(selectedKey(account));
  } catch (e) {
    console.error('Seçili binder ID yüklenirken hata:', e);
  }
  return null;
}

export function saveSelectedBinderId(account, binderId) {
  try {
    if (binderId) {
      localStorage.setItem(selectedKey(account), binderId);
    } else {
      localStorage.removeItem(selectedKey(account));
    }
  } catch (e) {
    console.error('Seçili binder ID kaydedilirken hata:', e);
  }
}

/**
 * Misafir binder'larını bu hesaba taşı (görünür liste).
 * Buluta kayıt (Kaydet) ayrıdır; bu yalnızca yerel sahiplik / görünürlük.
 * Misafir listesi temizlenir → başka hesap bunları görmez.
 */
export function claimGuestBindersIntoAccount(account) {
  if (!account || account === GUEST_ACCOUNT) return loadBindersList(account);

  const guest = loadBindersList(GUEST_ACCOUNT);
  const mine = loadBindersList(account);
  if (guest.length === 0) return mine;

  const ids = new Set(mine.map((b) => b.id));
  const merged = [...mine];
  for (const b of guest) {
    if (!ids.has(b.id)) merged.push(b);
  }
  saveBindersList(account, merged);

  const guestSelected = loadSelectedBinderId(GUEST_ACCOUNT);
  if (guestSelected && merged.some((b) => b.id === guestSelected)) {
    const currentSel = loadSelectedBinderId(account);
    if (!currentSel || !merged.some((b) => b.id === currentSel)) {
      saveSelectedBinderId(account, guestSelected);
    }
  }

  saveBindersList(GUEST_ACCOUNT, []);
  saveSelectedBinderId(GUEST_ACCOUNT, null);
  return merged;
}
