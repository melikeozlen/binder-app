// Paylaşım API hata kodları → çeviri anahtarı
const SHARE_ERROR_CODES = new Set([
  'USER_NOT_FOUND',
  'SELF_SHARE',
  'SHARE_EXISTS',
  'SHARE_NOT_FOUND',
  'SHARE_NOT_PENDING',
  'SHARE_SOURCE_DELETED',
  'BINDER_NOT_FOUND',
  'QUOTA_EXCEEDED',
  'INVALID_USERNAME',
  'RATE_LIMITED',
  'NETWORK_ERROR',
]);

export const shareErrorKey = (code) => `share.error.${SHARE_ERROR_CODES.has(code) ? code : 'GENERIC'}`;
