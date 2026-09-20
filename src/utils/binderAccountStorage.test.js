import {
  GUEST_ACCOUNT,
  accountKey,
  claimGuestBindersIntoAccount,
  ensureLegacyBindersMigrated,
  loadBindersList,
  saveBindersList,
  loadSelectedBinderId,
  saveSelectedBinderId,
} from './binderAccountStorage';

describe('binderAccountStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('accountKey: misafir ve kullanıcı adı (küçük harf)', () => {
    expect(accountKey(null)).toBe(GUEST_ACCOUNT);
    expect(accountKey({})).toBe(GUEST_ACCOUNT);
    expect(accountKey({ username: 'Melike_01' })).toBe('user:melike_01');
  });

  it('eski binders-list → guest migrasyonu', () => {
    localStorage.setItem('binders-list', JSON.stringify([{ id: 'b1', name: 'A' }]));
    localStorage.setItem('selected-binder-id', 'b1');
    ensureLegacyBindersMigrated();
    expect(localStorage.getItem('binders-list')).toBeNull();
    expect(loadBindersList(GUEST_ACCOUNT)).toEqual([{ id: 'b1', name: 'A' }]);
    expect(loadSelectedBinderId(GUEST_ACCOUNT)).toBe('b1');
  });

  it('hesap listeleri birbirinden bağımsız', () => {
    saveBindersList('user:alice', [{ id: 'a1', name: 'Alice' }]);
    saveBindersList('user:bob', [{ id: 'b1', name: 'Bob' }]);
    expect(loadBindersList('user:alice')).toEqual([{ id: 'a1', name: 'Alice' }]);
    expect(loadBindersList('user:bob')).toEqual([{ id: 'b1', name: 'Bob' }]);
    expect(loadBindersList(GUEST_ACCOUNT)).toEqual([]);
  });

  it('claimGuestBindersIntoAccount: misafiri hesaba taşır ve misafiri temizler', () => {
    saveBindersList(GUEST_ACCOUNT, [
      { id: 'g1', name: 'Guest' },
      { id: 'a1', name: 'Dup' },
    ]);
    localStorage.setItem('binder-g1-pages-list', JSON.stringify([1]));
    saveBindersList('user:alice', [{ id: 'a1', name: 'Alice' }]);
    saveSelectedBinderId(GUEST_ACCOUNT, 'g1');

    const merged = claimGuestBindersIntoAccount('user:alice');
    expect(merged.map((b) => b.id).sort()).toEqual(['a1', 'g1']);
    expect(loadBindersList(GUEST_ACCOUNT)).toEqual([]);
    expect(loadBindersList('user:alice').map((b) => b.id).sort()).toEqual(['a1', 'g1']);
    expect(loadSelectedBinderId('user:alice')).toBe('g1');
  });

  it('claim: hesabın binder\'ı varken misafirdeki boş binder taşınmaz', () => {
    saveBindersList(GUEST_ACCOUNT, [{ id: 'empty', name: 'Binder 1' }]);
    saveBindersList('user:alice', [{ id: 'a1', name: 'Alice' }]);

    const merged = claimGuestBindersIntoAccount('user:alice');
    expect(merged.map((b) => b.id)).toEqual(['a1']);
    expect(loadBindersList(GUEST_ACCOUNT)).toEqual([]);
  });

  it('claim: hesap boşsa misafirdeki boş binder da taşınır', () => {
    saveBindersList(GUEST_ACCOUNT, [{ id: 'empty', name: 'Binder 1' }]);
    const merged = claimGuestBindersIntoAccount('user:new');
    expect(merged.map((b) => b.id)).toEqual(['empty']);
  });
});
