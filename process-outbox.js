/**
 * Vercel Serverless — fcm_outbox থেকে pending পুশ পাঠায়
 * Env: FIREBASE_SERVICE_ACCOUNT = service account JSON (এক লাইন)
 */
const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env');
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return admin.initializeApp({
    credential: admin.credential.cert(sa),
  });
}

async function tokensFor(db, data) {
  const snap = await db.collection('fcm_tokens').get();
  const out = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (!d || !d.token) return;
    const role = d.role || 'guest';
    if (data.target === 'all') {
      if (role !== 'guest') out.push(d.token);
    } else if (data.target === 'admins') {
      if (role === 'admin' || role === 'superadmin') out.push(d.token);
    } else if (data.target === 'superadmins') {
      if (role === 'superadmin') out.push(d.token);
    } else if (data.target === 'blood') {
      if (d.bloodGroup === data.bloodGroup) out.push(d.token);
    } else if (data.target === 'member') {
      if (String(d.memberId) === String(data.memberId)) out.push(d.token);
    }
  });
  return [...new Set(out)];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    initAdmin();
    const db = admin.firestore();
    const messaging = admin.messaging();

    const pending = await db
      .collection('fcm_outbox')
      .where('status', '==', 'pending')
      .limit(20)
      .get();

    if (pending.empty) {
      return res.status(200).json({ ok: true, processed: 0 });
    }

    let processed = 0;
    for (const doc of pending.docs) {
      const data = doc.data();
      const tokens = await tokensFor(db, data);
      if (!tokens.length) {
        await doc.ref.update({ status: 'empty', processedAt: Date.now() });
        processed++;
        continue;
      }

      const title = data.title || 'UDAR ATMA';
      const body = data.body || '';
      let success = 0;
      let failure = 0;

      for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        const result = await messaging.sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          data: {
            type: String(data.type || 'general'),
            title: String(title),
            body: String(body),
          },
          webpush: {
            notification: {
              title,
              body,
              icon: '/icon-192.png',
            },
            fcmOptions: { link: '/' },
          },
        });
        success += result.successCount;
        failure += result.failureCount;
      }

      await doc.ref.update({
        status: 'sent',
        success,
        failure,
        tokenCount: tokens.length,
        processedAt: Date.now(),
      });
      processed++;
    }

    return res.status(200).json({ ok: true, processed });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
};
