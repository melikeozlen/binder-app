export const ONBOARDING_STORAGE_KEY = 'pocapocket-onboarding-done';

export const markOnboardingDone = () => {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
};

export const isOnboardingDone = () => {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
};

/** Daha önce kullanılmış site: galeri, çok sayfa, footer tercihi vb. */
export const hasPriorAppUse = () => {
  try {
    if (isOnboardingDone()) return true;
    if (localStorage.getItem('binder-footer-visible') != null) return true;

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.endsWith('gallery-urls')) {
        const raw = localStorage.getItem(key);
        if (raw && raw !== '[]' && raw !== 'null') return true;
      }

      if (key.endsWith('pages-list')) {
        try {
          const pages = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(pages) && pages.length > 1) return true;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
};
