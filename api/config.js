export default function handler(req, res) {
  // Sadece GET isteği kabul et
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basit origin kontrolü
  const origin = req.headers.origin || req.headers.referer || '';
  const allowed = process.env.ALLOWED_ORIGIN || '';
  if (allowed && !origin.includes(allowed)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.status(200).json({
    firebaseConfig: {
      apiKey: process.env.FB_API_KEY,
      authDomain: process.env.FB_AUTH_DOMAIN,
      projectId: process.env.FB_PROJECT_ID,
      storageBucket: process.env.FB_STORAGE_BUCKET,
      messagingSenderId: process.env.FB_MESSAGING_SENDER_ID,
      appId: process.env.FB_APP_ID,
    },
    validKeys: (process.env.VALID_KEYS || '').split(',').map(k => k.trim()),
  });
}
