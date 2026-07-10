// api/discord-log.js
// Vercel Serverless Function
// Webhook URL burada, env variable'dan okunuyor. Client asla göremiyor.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { username, embeds } = req.body;

    // Vercel > Project Settings > Environment Variables kısmına ekle:
    // DISCORD_WEBHOOK_URL = https://discord.com/api/webhooks/xxxx/xxxx
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(500).json({ success: false, message: "Webhook ayarlı değil." });
    }

    if (!Array.isArray(embeds)) {
      return res.status(400).json({ success: false, message: "Geçersiz payload." });
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username || "NEXUS Panel Log", embeds })
    });

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Sunucu hatası." });
  }
}
