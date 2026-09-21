// Kullanım olayları: yalnızca Vercel Analytics (varsa). Kendi API'mize event/presence gitmez.
import { track } from '@vercel/analytics';

export function trackEvent(name, props = {}) {
  try {
    track(name, props);
  } catch {
    // Vercel dışı ortamda sessizce geç
  }
}

let pendingDefaultBinderTrack = false;

export function markDefaultBinderCreated() {
  pendingDefaultBinderTrack = true;
}

export function flushPendingAnalytics() {
  if (pendingDefaultBinderTrack) {
    trackEvent('binder_created', { source: 'default' });
    pendingDefaultBinderTrack = false;
  }
}

export function trackBinderCreated(source = 'new') {
  trackEvent('binder_created', { source });
}
