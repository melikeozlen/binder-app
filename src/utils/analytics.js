import { track } from '@vercel/analytics';

let pendingDefaultBinderTrack = false;

export function markDefaultBinderCreated() {
  pendingDefaultBinderTrack = true;
}

export function flushPendingAnalytics() {
  if (pendingDefaultBinderTrack) {
    track('binder_created', { source: 'default' });
    pendingDefaultBinderTrack = false;
  }
}

export function trackBinderCreated(source = 'new') {
  track('binder_created', { source });
}
