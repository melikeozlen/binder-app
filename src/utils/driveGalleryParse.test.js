import { parseDriveFolderId } from './driveGalleryParse';

describe('parseDriveFolderId', () => {
  it('parses raw folder id', () => {
    expect(parseDriveFolderId('1aBcDeFgHiJkLmNoPqRs')).toBe('1aBcDeFgHiJkLmNoPqRs');
  });

  it('parses standard folder url', () => {
    expect(
      parseDriveFolderId('https://drive.google.com/drive/folders/abc123XYZ-_')
    ).toBe('abc123XYZ-_');
  });

  it('parses folder url with user path', () => {
    expect(
      parseDriveFolderId('https://drive.google.com/drive/u/0/folders/folderId99')
    ).toBe('folderId99');
  });

  it('parses open?id= url', () => {
    expect(parseDriveFolderId('https://drive.google.com/open?id=openId123')).toBe(
      'openId123'
    );
  });

  it('returns null for invalid input', () => {
    expect(parseDriveFolderId('')).toBeNull();
    expect(parseDriveFolderId('not-a-url')).toBeNull();
    expect(parseDriveFolderId('https://example.com/')).toBeNull();
  });
});
