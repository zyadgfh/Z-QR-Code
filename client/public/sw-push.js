/* Service Worker إشعارات الطلبات (NOTIF-01) — Web Push بسيط بلا اعتماديات */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'طلب جديد', body: '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'طلب جديد', {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/dash' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dash';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
