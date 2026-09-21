const { createPresenceStore, isValidClientId } = require('../../server/stats');

describe('isValidClientId', () => {
  test('geçerli kimlikleri kabul eder', () => {
    expect(isValidClientId('abcd1234')).toBe(true);
    expect(isValidClientId('A'.repeat(64))).toBe(true);
  });

  test('geçersiz kimlikleri reddeder', () => {
    expect(isValidClientId('short')).toBe(false);
    expect(isValidClientId('has space!!')).toBe(false);
    expect(isValidClientId(null)).toBe(false);
  });
});

describe('createPresenceStore', () => {
  test('hesap ve misafiri ayrı sayar; aynı hesap tek sayılır', () => {
    let now = 1_000_000;
    const store = createPresenceStore({ ttlMs: 120_000, now: () => now });
    store.touch('guest-aaa1', null);
    store.touch('user-aaaa', 'u1');
    store.touch('user-bbbb', 'u2');
    store.touch('user-cccc', 'u1');
    expect(store.counts()).toEqual({ total: 3, users: 2, guests: 1 });
  });

  test('silent (admin) oturum online sayıya girmez', () => {
    let now = 1_000_000;
    const store = createPresenceStore({ ttlMs: 120_000, now: () => now });
    store.touch('guest-aaa1', null);
    store.touch('admin-xxxx', 'adm1', { silent: true });
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
