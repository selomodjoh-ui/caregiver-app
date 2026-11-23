// ShiftKind service worker. Its only job is to show a notification when the
// server sends one, and to open the app when the notification is tapped.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || 'ShiftKind';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'You have something new on ShiftKind.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'shiftkind-message',
      renotify: true,
      data: { url: data.url || '/?open=messages' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/?open=messages';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
