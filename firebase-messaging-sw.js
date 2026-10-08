// উদার আত্মা সংগঠন — FCM Service Worker
// অ্যাপ বন্ধ / রিসেন্ট থেকে সরানো থাকলেও পুশ নোটিফিকেশন দেখায়

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
    tag: (data && data.tag) || 'udar-atma',
    renotify: true,
    requireInteraction: false,
    vibrate: [120, 80, 120],
    actions: []
  };
  return self.registration.showNotification(title || 'উদার আত্মা সংগঠন', options);
}

// FCM ব্যাকগ্রাউন্ড (অ্যাপ বন্ধ / ব্যাকগ্রাউন্ড)
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM Background]', payload);
  var title = (payload.notification && payload.notification.title) ||
              (payload.data && payload.data.title) ||
              'উদার আত্মা সংগঠন';
  var body = (payload.notification && payload.notification.body) ||
             (payload.data && payload.data.body) ||
             '';
  var data = Object.assign({}, payload.data || {}, {
    title: title,
    body: body
  });
  return showPushNotification(title, body, data);
});

// অতিরিক্ত নিরাপত্তা: সাধারণ push ইভেন্ট (কিছু ব্রাউজারে দরকার)
self.addEventListener('push', function(event) {
  // FCM SDK নিজে হ্যান্ডেল করলে ডুপ্লিকেট এড়াতে — শুধু raw push হলে
  if (!event.data) return;
  try {
    var payload = event.data.json();
    // যদি notification অবজেক্ট থাকে এবং onBackgroundMessage ইতিমধ্যে চলে, Firebase সাধারণত এটি ম্যানেজ করে
    // data-only মেসেজের জন্য backup
    if (payload && payload.data && !payload.notification) {
      var title = payload.data.title || 'উদার আত্মা সংগঠন';
      var body = payload.data.body || '';
      event.waitUntil(showPushNotification(title, body, payload.data));
    }
  } catch (e) {
    console.log('[push parse]', e);
  }
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
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});
