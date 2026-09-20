import {
  collectImageRefs,
  createSyncQueue,
  loadCloudMeta,
  saveCloudMeta,
  removeCloudMeta,
  cloudMetaKey,
  hasLocalPages,
  isCloudBinder,
} from './cloudSync';

describe('collectImageRefs', () => {
  it('string ve obje referanslarını toplar, diğerlerini atlar', () => {
    const pages = [
      {
        content: {
          '0-0': '__IMAGE_REF__1-content-0-0',
          '0-1': { url: '__IMAGE_REF__1-content-0-1', name: 'x' },
          '1-0': 'https://example.com/a.jpg',
          '1-1': null,
        },
        backContent: { '0-0': '__IMAGE_REF__1-back-0-0' },
      },
      { content: {}, backContent: undefined },
    ];
    expect([...collectImageRefs(pages)].sort()).toEqual(['1-back-0-0', '1-content-0-0', '1-content-0-1']);
    expect(collectImageRefs([]).size).toBe(0);
    expect(collectImageRefs(undefined).size).toBe(0);
  });
});

describe('cloud meta', () => {
  beforeEach(() => localStorage.clear());

  it('kaydeder, okur, siler', () => {
    expect(loadCloudMeta('b1')).toBeNull();
    saveCloudMeta('b1', { userId: 'u', hash: 'h', updatedAt: 't' });
    expect(loadCloudMeta('b1')).toEqual({ userId: 'u', hash: 'h', updatedAt: 't' });
    expect(cloudMetaKey('b1')).toBe('binder-b1-cloud-meta');
    removeCloudMeta('b1');
    expect(loadCloudMeta('b1')).toBeNull();
  });

  it('bozuk JSON için null döner', () => {
    localStorage.setItem(cloudMetaKey('b2'), '{oops');
    expect(loadCloudMeta('b2')).toBeNull();
  });

  it('isCloudBinder yalnızca aynı kullanıcının meta\'sı için true', () => {
    expect(isCloudBinder('b3', 'u1')).toBe(false);
    saveCloudMeta('b3', { userId: 'u1', hash: 'h', updatedAt: 't' });
    expect(isCloudBinder('b3', 'u1')).toBe(true);
    expect(isCloudBinder('b3', 'u2')).toBe(false);
    expect(isCloudBinder('b3', null)).toBe(false);
  });
});

describe('hasLocalPages', () => {
  beforeEach(() => localStorage.clear());

  it('sayfa listesi dolu ise true', () => {
    expect(hasLocalPages('b1')).toBe(false);
    localStorage.setItem('binder-b1-pages-list', '[]');
    expect(hasLocalPages('b1')).toBe(false);
    localStorage.setItem('binder-b1-pages-list', '[1,2]');
    expect(hasLocalPages('b1')).toBe(true);
  });
});

describe('createSyncQueue', () => {
  it('görevleri sırayla çalıştırır ve hata zinciri kırmaz', async () => {
    const queue = createSyncQueue();
    const order = [];
    const p1 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
      return 'a';
    });
    const p2 = queue.enqueue(async () => {
      order.push(2);
      throw new Error('boom');
    });
    const p3 = queue.enqueue(async () => {
      order.push(3);
      return 'c';
    });
    expect(queue.size).toBe(3);
    await expect(p1).resolves.toBe('a');
    await expect(p2).rejects.toThrow('boom');
    await expect(p3).resolves.toBe('c');
    expect(order).toEqual([1, 2, 3]);
    expect(queue.size).toBe(0);
  });
});
