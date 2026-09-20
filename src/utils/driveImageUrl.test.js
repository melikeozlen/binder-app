import {
  extractDriveFileId,
  driveThumbnailUrl,
  getDriveImageFallbacks,
  normalizeDriveImageUrl,
} from './driveImageUrl';

describe('driveImageUrl', () => {
  const fileId = '1T0F-DyRODZV66gzNoNs2xfvGp6Fb1qlB';

  it('builds thumbnail url', () => {
    expect(driveThumbnailUrl(fileId)).toBe(
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
    );
  });

  it('extracts id from uc export view url', () => {
    expect(
      extractDriveFileId(`https://drive.google.com/uc?export=view&id=${fileId}`)
    ).toBe(fileId);
  });

  it('extracts id from thumbnail url', () => {
    expect(extractDriveFileId(driveThumbnailUrl(fileId))).toBe(fileId);
  });

  it('normalizes uc url to thumbnail', () => {
    expect(
      normalizeDriveImageUrl(`https://drive.google.com/uc?export=view&id=${fileId}`)
    ).toBe(driveThumbnailUrl(fileId));
  });

  it('returns thumbnail then proxy fallbacks', () => {
    expect(getDriveImageFallbacks(fileId)).toEqual([
      driveThumbnailUrl(fileId),
      `/api/drive-image?id=${fileId}`,
    ]);
  });
});
