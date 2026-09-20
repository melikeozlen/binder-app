import { buildStoreZip, sanitizeFilename } from './galleryDownload';

describe('galleryDownload', () => {
  it('sanitizeFilename cleans unsafe chars', () => {
    expect(sanitizeFilename('a/b:c*.png')).toBe('a_b_c_.png');
    expect(sanitizeFilename('')).toBe('image');
  });

  it('buildStoreZip creates a zip blob', () => {
    const data = new Uint8Array([104, 101, 108, 108, 111]); // hello
    const blob = buildStoreZip([{ name: 'hello.txt', data }]);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(30);
  });
});
