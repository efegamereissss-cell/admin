// api/verify-login.js
// Vercel Serverless Function
// Hem kullanıcı adı hem key sunucu tarafında eşleşmeli.
// Client asla kullanıcı listesini veya key'leri göremez.
//
// Vercel env variable formatı:
// USERS = 0nlyany_:KEYA,mace1n:KEYB
// (kullaniciadi:key çiftleri, virgülle ayrılmış, büyük/küçük harf duyarsız key)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { username, key } = req.body;

    if (!username || !key) {
      return res.status(400).json({ success: false, message: "Kullanıcı adı ve key gerekli." });
    }

    // USERS env variable'ı: "0nlyany_:KEY123,mace1n:KEY456"
    const usersRaw = (process.env.USERS || "").split(",").map(u => u.trim()).filter(Boolean);

    // Her çifti parse et
    const userMap = {};
    for (const entry of usersRaw) {
      const colonIdx = entry.indexOf(":");
      if (colonIdx === -1) continue;
      const uname = entry.substring(0, colonIdx).trim();
      const ukey  = entry.substring(colonIdx + 1).trim().toUpperCase();
      userMap[uname.toLowerCase()] = { key: ukey, display: uname };
    }

    const inputUser = username.trim().toLowerCase();
    const inputKey  = key.trim().toUpperCase();

    // Kullanıcı adı sistemde kayıtlı mı?
    if (!(inputUser in userMap)) {
      return res.status(401).json({ success: false, message: "Geçersiz kullanıcı adı veya key." });
    }

    // Key eşleşiyor mu?
    if (userMap[inputUser].key !== inputKey) {
      return res.status(401).json({ success: false, message: "Geçersiz kullanıcı adı veya key." });
    }

    // Her ikisi de doğru → Firebase config'i ver
    const firebaseConfig = {
      apiKey:            process.env.FIREBASE_API_KEY,
      authDomain:        process.env.FIREBASE_AUTH_DOMAIN,
      projectId:         process.env.FIREBASE_PROJECT_ID,
      storageBucket:     process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId:             process.env.FIREBASE_APP_ID
    };

    return res.status(200).json({
      success: true,
      firebaseConfig,
      username: userMap[inputUser].display,
      adminList: Object.values(userMap).map(u => u.display)
    });

  } catch (e) {
    return res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
}
