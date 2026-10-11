// উদার আত্মা সংগঠন — FCM Service Worker (Web fallback)
// Capacitor native অ্যাপে এটি ব্যবহার হয় না; শুধু ব্রাউজার/PWA-এর জন্য

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB1_RCGGxgpnIg7vpSrx86lFfgXk3vlY2Y",
  authDomain: "udar-atma.firebaseapp.com",
  projectId: "udar-atma",
  storageBucket: "udar-atma.firebasestorage.app",
  messagingSenderId: "1055405474875",
  appId: "1:1055405474875:web:d5e9147c51cbc8dff2c81e"
});

const messaging = firebase.messaging();

function showPushNotification(title, body, data) {
  var options = {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data || {},
    tag: (data && data.tag) || 'udar-atma-' + String(Date.now()).slice(-6),
    renotify: true,
    requireInteraction: false,
    vibrate: [120, 80, 120],
    silent: false
  };
  return self.registration.showNotification(title || 'উদার আত্মা সংগঠন', options);
}

function extractPayload(payload) {
  var title =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    'উদার আত্মা সংগঠন';
  var body =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    '';
  var data = Object.assign({}, payload.data || {}, {
    title: title,
    body: body,
    type: (payload.data && payload.data.type) || 'general'
  });
  return { title: title, body: body, data: data };
}

messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM Background]', payload);
  var p = extractPayload(payload || {});
  return showPushNotification(p.title, p.body, p.data);
});

self.addEventListener('push', function(event) {
  if (!event.data) return;
  event.waitUntil(
    (async function() {
      try {
        var payload = event.data.json();
        if (payload && payload.data && !payload.notification) {
          var p = extractPayload(payload);
          await showPushNotification(p.title, p.body, p.data);
        }
      } catch (e) {
        console.log('[push parse]', e);
      }
    })()
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = '/';
  try {
    if (event.notification.data && event.notification.data.url) {
      url = event.notification.data.url;
    }
  } catch (e) {}
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });
