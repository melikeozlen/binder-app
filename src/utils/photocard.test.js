import {
  createPhotocard,
  normalizePhotocard,
  updatePhotocard,
  toPersistedCellValue,
  resolvePersistedCellValue,
  getPhotocardImage,
  getPhotocardLabel,
  getImageRefKey,
  IMAGE_REF_PREFIX,
} from './photocard';

describe('photocard model', () => {
  it('yalnızca image ile oluşturulur', () => {
    const card = createPhotocard({ image: 'https://example.com/a.jpg' });
    expect(card.image).toBe('https://example.com/a.jpg');
    expect(card.id).toMatch(/^pc_/);
    expect(card.createdAt).toBeTruthy();
    expect(card.updatedAt).toBeTruthy();
    expect(card.member).toBeUndefined();
    expect(card.status).toBeUndefined();
  });

  it('eski string ve {url,name} formatlarını migrate eder', () => {
    const fromString = normalizePhotocard('https://example.com/b.jpg');
    expect(fromString.image).toBe('https://example.com/b.jpg');

    const fromLegacy = normalizePhotocard({
      url: 'https://example.com/c.jpg',
      name: 'Jennie',
    });
    expect(fromLegacy.image).toBe('https://example.com/c.jpg');
    expect(fromLegacy.notes).toBe('Jennie');
  });

  it('image yoksa null döner', () => {
    expect(normalizePhotocard({ member: 'A' })).toBeNull();
    expect(normalizePhotocard('not-an-image')).toBeNull();
  });

  it('opsiyonel alanları temizler', () => {
    const card = createPhotocard({
      image: 'https://example.com/d.jpg',
      member: '  Lisa  ',
      status: 'owned',
      quantity: '2',
      tags: 'pink, venom',
      album: '',
    });
    expect(card.member).toBe('Lisa');
    expect(card.status).toBe('owned');
    expect(card.quantity).toBe(2);
    expect(card.tags).toEqual(['pink', 'venom']);
    expect(card.album).toBeUndefined();
  });

  it('persist/resolve meta korur', () => {
    const card = createPhotocard({
      image: 'data:image/jpeg;base64,abc',
      member: 'Rosé',
      group: 'BLACKPINK',
    });
    const persisted = toPersistedCellValue(card, '1-content-0-0');
    expect(persisted.image).toBe(`${IMAGE_REF_PREFIX}1-content-0-0`);
    expect(persisted.member).toBe('Rosé');
    expect(persisted.group).toBe('BLACKPINK');
    expect(getImageRefKey(persisted)).toBe('1-content-0-0');

    const resolved = resolvePersistedCellValue(persisted, 'data:image/jpeg;base64,xyz');
    expect(resolved.image).toBe('data:image/jpeg;base64,xyz');
    expect(resolved.member).toBe('Rosé');
    expect(resolved.id).toBe(card.id);
  });

  it('updatePhotocard id ve createdAt korur', () => {
    const card = createPhotocard({ image: 'https://example.com/e.jpg', member: 'Jisoo' });
    const updated = updatePhotocard(card, { album: 'Born Pink', member: 'Kim Jisoo' });
    expect(updated.id).toBe(card.id);
    expect(updated.createdAt).toBe(card.createdAt);
    expect(updated.member).toBe('Kim Jisoo');
    expect(updated.album).toBe('Born Pink');
    expect(updated.image).toBe(card.image);
  });

  it('label önceliği member > album > notes', () => {
    expect(
      getPhotocardLabel({
        image: 'https://x.com/a.jpg',
        member: 'M',
        album: 'A',
        notes: 'N',
      })
    ).toBe('M');
    expect(getPhotocardImage({ url: 'https://x.com/a.jpg' })).toBe('https://x.com/a.jpg');
  });
});
