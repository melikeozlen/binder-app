// Kullanım olayları: Vercel Analytics (varsa) + kendi backend'imiz (/api/events).
// Backend çağrıları "ateşle ve unut": hata kullanıcıya yansımaz, uygulamayı bloklamaz.
import { track } from '@vercel/analytics';
import { api } from './apiClient';
import { getClientId } from './clientId';

let backendEnabled = true;

/** Backend yoksa (statik deploy / eski sunucu) tekrar denemeyi kapat. */
export function setAnalyticsBackendEnabled(enabled) {
  backendEnabled = Boolean(enabled);
}

function sendToBackend(name, props) {
  if (!backendEnabled) return;
  api('/api/events', { method: 'POST', body: { name, props, clientId: getClientId() } }).catch((error) => {
    // 404: eski sunucu; NETWORK_ERROR: backend yok → bir daha deneme
    if (error?.status === 404 || error?.code === 'NETWORK_ERROR') backendEnabled = false;
  });
}

export function trackEvent(name, props = {}) {
  try {
    track(name, props);
  } catch {
    // Vercel dışı ortamda sessizce geç
  }
  sendToBackend(name, props);
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
