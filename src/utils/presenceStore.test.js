const { createPresenceStore, isValidClientId } = require('../../server/stats');

describe('isValidClientId', () => {
  test('kabul eder / reddeder', () => {
    expect(isValidClientId('abcdefgh')).toBe(true);
    expect(isValidClientId('a'.repeat(64))).toBe(true);
    expect(isValidClientId('short')).toBe(false);
    expect(isValidClientId('has space!!')).toBe(false);
    expect(isValidClientId(null)).toBe(false);
  });
});

describe('createPresenceStore', () => {
  test('aynı clientId bir kez sayılır; kullanıcı ve misafir ayrılır', () => {
    let now = 1_000_000;
    const store = createPresenceStore({ ttlMs: 120_000, now: () => now });

    store.touch('guest-aaa1', null);
    store.touch('guest-aaa1', null);
    store.touch('user-bbbb2', 'u1');
    store.touch('user-cccc3', 'u1'); // aynı hesap, ikinci cihaz
    store.touch('user-dddd4', 'u2');

    // Aynı hesabın iki cihazı tek kullanıcı; misafir ayrı
    expect(store.counts()).toEqual({ total: 3, users: 2, guests: 1 });
  });

  test('silent (admin) oturum online sayıya girmez', () => {
    let now = 1_000_000;
    const store = createPresenceStore({ ttlMs: 120_000, now: () => now });
    store.touch('guest-aaa1', null);
    store.touch('admin-xxxx', 'admin-id', { silent: true });
    expect(store.counts()).toEqual({ total: 1, users: 0, guests: 1 });
  });

  test('TTL dolunca düşer', () => {
    let now = 1_000_000;
    const store = createPresenceStore({ ttlMs: 60_000, now: () => now });
    store.touch('guest-aaa1', null);
    now += 61_000;
    expect(store.counts()).toEqual({ total: 0, users: 0, guests: 0 });
  });
});
