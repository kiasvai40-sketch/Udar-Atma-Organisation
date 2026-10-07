// উদার আত্মা সংগঠন — Firebase Cloud Messaging Service Worker
// এই ফাইল ব্যাকগ্রাউন্ডে (অ্যাপ বন্ধ থাকলে) পুশ নোটিফিকেশন হ্যান্ডেল করে

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

// অ্যাপ বন্ধ থাকলে বা ব্যাকগ্রাউন্ডে মেসেজ এলে
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM Background]', payload);

  var title = (payload.notification && payload.notification.title) ||
              (payload.data && payload.data.title) ||
              'উদার আত্মা সংগঠন';

  var body = (payload.notification && payload.notification.body) ||
             (payload.data && payload.data.body) ||
             '';

  var options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    tag: (payload.data && payload.data.tag) || 'udar-atma'
  };

  return self.registration.showNotification(title, options);
});

// নোটিফিকেশনে ক্লিক করলে অ্যাপ খুলবে / ফোকাস করবে
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
