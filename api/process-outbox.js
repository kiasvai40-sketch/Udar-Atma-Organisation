/**
 * Vercel Serverless — fcm_outbox থেকে pending পুশ পাঠায়
 * Env: FIREBASE_SERVICE_ACCOUNT = service account JSON (এক লাইন)
 *
 * Web + Native Android দুই ধরনের টোকেন সাপোর্ট করে।
 * Native টোকেনে android.priority = high → Recent থেকে সরালেও ডেলিভারি ভালো।
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
    let match = false;
    if (data.target === 'all') {
      if (role !== 'guest') match = true;
    } else if (data.target === 'admins') {
      if (role === 'admin' || role === 'superadmin') match = true;
    } else if (data.target === 'superadmins') {
      if (role === 'superadmin') match = true;
    } else if (data.target === 'blood') {
      if (d.bloodGroup === data.bloodGroup) match = true;
    } else if (data.target === 'member') {
      if (String(d.memberId) === String(data.memberId)) match = true;
    }
    if (match) {
      out.push({
        token: d.token,
        docId: doc.id,
        platform: d.platform || 'web',
      });
    }
  });
  const seen = new Set();
  return out.filter((t) => {
    if (seen.has(t.token)) return false;
    seen.add(t.token);
    return true;
  });
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
      const tokenEntries = await tokensFor(db, data);
      if (!tokenEntries.length) {
        await doc.ref.update({ status: 'empty', processedAt: Date.now() });
        processed++;
        continue;
      }

      const title = data.title || 'UDAR ATMA';
      const body = data.body || '';
      let success = 0;
      let failure = 0;
      const invalidDocIds = [];

      const nativeTokens = tokenEntries.filter((t) => t.platform === 'android-native');
      const webTokens = tokenEntries.filter((t) => t.platform !== 'android-native');

      // —— Native Android (high priority) ——
      for (let i = 0; i < nativeTokens.length; i += 500) {
        const chunk = nativeTokens.slice(i, i + 500);
        const tokens = chunk.map((t) => t.token);
        try {
          const result = await messaging.sendEachForMulticast({
            tokens,
            data: {
              type: String(data.type || 'general'),
              title: String(title),
              body: String(body),
            },
            android: {
              priority: 'high',
              ttl: 86400000,
              notification: {
                title,
                body,
                channelId: 'udar_atma_default',
                priority: 'high',
                defaultSound: true,
                defaultVibrateTimings: true,
                icon: 'ic_stat_udar',
                color: '#0F0F54',
                imageUrl: 'https://udar-atma.web.app/icon-192.png',
              },
            },
          });
          success += result.successCount;
          failure += result.failureCount;
          if (result.responses) {
            result.responses.forEach((r, idx) => {
              if (!r.success && r.error) {
                const code = (r.error.code || '') + '';
                if (
                  code.includes('registration-token-not-registered') ||
                  code.includes('invalid-registration-token') ||
                  code.includes('invalid-argument')
                ) {
                  invalidDocIds.push(chunk[idx].docId);
                }
              }
            });
          }
        } catch (e) {
          console.error('native send error', e.message);
          failure += tokens.length;
        }
      }

      // —— Web Push ——
      for (let i = 0; i < webTokens.length; i += 500) {
        const chunk = webTokens.slice(i, i + 500);
        const tokens = chunk.map((t) => t.token);
        try {
          const result = await messaging.sendEachForMulticast({
            tokens,
            data: {
              type: String(data.type || 'general'),
              title: String(title),
              body: String(body),
              tag: 'udar-atma-' + String(Date.now()),
            },
            webpush: {
              headers: { Urgency: 'high', TTL: '86400' },
              notification: {
                title,
                body,
                icon: '/icon-192.png',
                badge: '/badge-96.png',
              },
              fcmOptions: { link: '/' },
            },
          });
          success += result.successCount;
          failure += result.failureCount;
          if (result.responses) {
            result.responses.forEach((r, idx) => {
              if (!r.success && r.error) {
                const code = (r.error.code || '') + '';
                if (
                  code.includes('registration-token-not-registered') ||
                  code.includes('invalid-registration-token') ||
                  code.includes('invalid-argument')
                ) {
                  invalidDocIds.push(chunk[idx].docId);
                }
              }
            });
          }
        } catch (e) {
          console.error('web send error', e.message);
          failure += tokens.length;
        }
      }

      for (const id of [...new Set(invalidDocIds)]) {
        try {
          await db.collection('fcm_tokens').doc(id).delete();
        } catch (e) {
          console.warn('token cleanup failed', id, e.message);
        }
      }

      await doc.ref.update({
        status: 'sent',
        success,
        failure,
        tokenCount: tokenEntries.length,
        nativeCount: nativeTokens.length,
        webCount: webTokens.length,
        cleaned: invalidDocIds.length,
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
