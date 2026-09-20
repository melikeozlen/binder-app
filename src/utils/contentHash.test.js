import { fnv1a, stableStringify } from './contentHash';

describe('fnv1a', () => {
  it('bilinen vektörlerle eşleşir (server/lib/hash.js ile aynı algoritma)', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('foobar')).toBe('bf9cf968');
  });

  it('farklı içerik farklı hash üretir', () => {
    expect(fnv1a('data:image/png;base64,AAAA')).not.toBe(fnv1a('data:image/png;base64,AAAB'));
  });
});

describe('stableStringify', () => {
  it('anahtar sırasından bağımsızdır (JSONB yeniden sıralamasına dayanıklı)', () => {
    const a = { name: 'x', settings: { widthRatio: 1.9, binderColor: '#fff' }, pages: [{ id: 1, content: { '0-0': 'a' } }] };
    const b = { pages: [{ content: { '0-0': 'a' }, id: 1 }], settings: { binderColor: '#fff', widthRatio: 1.9 }, name: 'x' };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(fnv1a(stableStringify(a))).toBe(fnv1a(stableStringify(b)));
  });

  it('undefined alanları atlar, null/dizileri korur', () => {
    expect(stableStringify({ a: undefined, b: null, c: [1, 'x', null] })).toBe('{"b":null,"c":[1,"x",null]}');
  });

  it('içerik değişince çıktı değişir', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});
