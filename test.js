
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, setDoc, getDoc,
  onSnapshot, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

let db;
let firebaseInitialized = false;

async function initFirebase(config) {
  if (firebaseInitialized) return;
  const app = initializeApp(config);
  db = getFirestore(app);
  firebaseInitialized = true;
}

setupApp();

function setupApp() {

async function sendWebhookLog({ title, description, color = 0x7c5cff, fields = [] }) {
  try {
    await fetch('/api/discord-log', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "DALE DAWSON Panel Log",
        embeds: [{ title, description, color, fields, timestamp: new Date().toISOString(), footer: { text: "Dale Dawson Staffs Panel" } }]
      })
    });
  } catch (e) { console.error("webhook log err", e); }
}

let currentUser = "";
let serverAdmins = [];
let currentUserPhoto = "";
let currentUserDisplayName = "";
let currentChannel = "genel-yonetim";
let blUnsubscribe = null;
let annUnsubscribe = null;
let chatUnsubscribe = null;
let profilesUnsubscribe = null;
let blFilter = "";
let blAllDocs = [];
let userProfiles = {};
let recentQueryList = [];

// Chart instances
let playerChartInstance = null;
let banDonutInstance = null;
let currentChartRange = "hourly";

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(msg, type = "ok") {
  const t = document.getElementById('toast');
  t.className = `toast ${type}`;
  t.textContent = type === "ok" ? "✓  " + msg : type === "everyone" ? msg : "✕  " + msg;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('tr-TR') + " " + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(name) {
  const colors = [
    "linear-gradient(135deg,#7c5cff,#5a3fe0)",
    "linear-gradient(135deg,#00e5c7,#00a693)",
    "linear-gradient(135deg,#ff8a5c,#ff4d6a)",
    "linear-gradient(135deg,#ffb545,#c67e00)",
    "linear-gradient(135deg,#5cffb0,#00c2a8)"
  ];
  let hash = 0;
  for (let c of (name || "?")) hash += c.charCodeAt(0);
  return colors[hash % colors.length];
}

function avatarInner(rawName) {
  const profile = userProfiles[rawName];
  const initials = (profile?.displayName || rawName || "?").substring(0, 2).toUpperCase();
  if (profile?.photo) return `<img src="${profile.photo}" alt="">`;
  return initials;
}

function displayNameOf(rawName) {
  return userProfiles[rawName]?.displayName || rawName || "";
}

// ========== AUDIO ==========
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function warmUpAudio() {
  try { const ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume(); } catch(e) {}
}
document.addEventListener('click', warmUpAudio, { once: false });
document.addEventListener('keydown', warmUpAudio, { once: false });

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    const doPlay = () => {
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.6, ctx.currentTime);
      master.connect(ctx.destination);
      const notes = [
        { freq: 1318, start: 0.00, dur: 0.45, type: 'sine', vol: 0.9 },
        { freq: 1760, start: 0.00, dur: 0.45, type: 'triangle', vol: 0.4 },
        { freq: 1174, start: 0.22, dur: 0.50, type: 'sine', vol: 0.8 },
        { freq: 988,  start: 0.50, dur: 0.55, type: 'sine', vol: 0.75 },
      ];
      notes.forEach(({ freq, start, dur, type, vol }) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(master);
        o.type = type;
        o.frequency.setValueAtTime(freq, ctx.currentTime + start);
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur + 0.05);
      });
      master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    };
    if (ctx.state === 'suspended') ctx.resume().then(doPlay); else doPlay();
  } catch(e) {}
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showBrowserNotification(author, text) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const displayName = displayNameOf(author) || author;
  try { new Notification(`📢 @everyone — ${displayName}`, { body: text.replace(/@everyone/g, '@everyone'), icon: '/favicon.ico', tag: 'everyone-' + Date.now() }); } catch(e) {}
}

// ========== PROFILES ==========
function listenProfiles() {
  if (profilesUnsubscribe) profilesUnsubscribe();
  profilesUnsubscribe = onSnapshot(collection(db, "user_profiles"), snap => {
    userProfiles = {};
    snap.docs.forEach(d => { userProfiles[d.id] = d.data(); });
    refreshSidebarAvatar();
    renderBlacklist();
    if (typeof window._rerenderChat === 'function') window._rerenderChat();
  }, err => console.error("profiles err", err));
}

function refreshSidebarAvatar() {
  const p = userProfiles[currentUser];
  currentUserPhoto = p?.photo || "";
  currentUserDisplayName = p?.displayName || currentUser;
  const av = document.getElementById('sidebarAvatar');
  av.innerHTML = currentUserPhoto ? `<img src="${currentUserPhoto}" alt="">` : currentUser.substring(0, 2).toUpperCase();
  document.getElementById('sidebarName').textContent = currentUserDisplayName;
}

// ========== LOGIN ==========
const loginBtn = document.getElementById('loginBtn');
const loginUser = document.getElementById('loginUser');
const loginKey = document.getElementById('loginKey');
const loginError = document.getElementById('loginError');
const loginOverlay = document.getElementById('loginOverlay');
const shell = document.getElementById('shell');

// ========== BENI HATIRLA ==========
const rememberMe = document.getElementById('rememberMe');

// Sayfa açılışında kayıtlı bilgileri yükle
(function loadSavedCredentials() {
  try {
    const saved = localStorage.getItem('dd_remember');
    if (saved) {
      const parsed = JSON.parse(atob(saved));
      if (parsed.user && parsed.key) {
        loginUser.value = parsed.user;
        loginKey.value  = parsed.key;
        rememberMe.checked = true;
      }
    }
  } catch(e) { localStorage.removeItem('dd_remember'); }
})();

async function tryLogin() {
  const user = loginUser.value.trim();
  const key  = loginKey.value.trim();
  if (!user || !key) {
    loginError.textContent = "Kullanıcı adı ve key gerekli.";
    loginError.classList.remove('show'); void loginError.offsetWidth; loginError.classList.add('show');
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "KONTROL EDİLİYOR...";
  try {
    const res = await fetch('/api/verify-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, key })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      loginError.textContent = data.message || "Geçersiz kullanıcı adı veya key.";
      loginError.classList.remove('show'); void loginError.offsetWidth; loginError.classList.add('show');
      loginBtn.disabled = false;
      loginBtn.textContent = "GİRİŞ YAP";
      // Hatalı girişte kayıtlı veriyi temizle
      localStorage.removeItem('dd_remember');
      return;
    }
    // Beni hatırla işaretliyse kaydet, değilse temizle
    if (rememberMe.checked) {
      localStorage.setItem('dd_remember', btoa(JSON.stringify({ user, key })));
    } else {
      localStorage.removeItem('dd_remember');
    }
    await initFirebase(data.firebaseConfig);
    loginOverlay.style.transition = 'opacity .35s ease';
    loginOverlay.style.opacity = '0';
    setTimeout(() => {
      loginOverlay.style.display = 'none';
      shell.classList.add('unlocked');
    }, 350);
    currentUser = data.username || user;
    serverAdmins = data.adminList || [currentUser];
    document.getElementById('sidebarName').textContent = currentUser;
    document.getElementById('sidebarAvatar').textContent = currentUser.substring(0, 2).toUpperCase();
    initFirestoreListeners();
    logActivity("join", `${user} panele giriş yaptı`);
    sendWebhookLog({ title: "🟢 Panele Giriş Yapıldı", description: `**${user}** panele giriş yaptı.`, color: 0x00e5c7 });
  } catch (e) {
    loginError.textContent = "Sunucu bağlantı hatası. Tekrar deneyin.";
    loginError.classList.remove('show'); void loginError.offsetWidth; loginError.classList.add('show');
    loginBtn.disabled = false;
    loginBtn.textContent = "GİRİŞ YAP";
  }
}
loginBtn.addEventListener('click', tryLogin);
loginKey.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') loginKey.focus(); });

// ========== NAVIGATION ==========
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + item.dataset.view).classList.add('active');
    if (item.dataset.view === 'stats') {
      setTimeout(() => initCharts(), 100);
    }
  });
});

// ========== SETTINGS MODAL & THEMES ==========
const settingsModal = document.getElementById('settingsModal');
const settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
const settingsFileInput = document.getElementById('settingsFileInput');
const settingsDisplayName = document.getElementById('settingsDisplayName');
let pendingPhotoDataUrl = null;
let pendingPhotoRemoved = false;
let currentTheme = localStorage.getItem('dd_theme') || 'default';

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'crimson') {
    root.style.setProperty('--accent', '#ff4d6a');
    root.style.setProperty('--accent-2', '#ffb545');
  } else if (theme === 'emerald') {
    root.style.setProperty('--accent', '#20e37c');
    root.style.setProperty('--accent-2', '#00c2a8');
  } else {
    // Default
    root.style.setProperty('--accent', '#7c5cff');
    root.style.setProperty('--accent-2', '#00e5c7');
  }
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.theme-btn[data-theme="${theme}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  localStorage.setItem('dd_theme', theme);
  currentTheme = theme;
}

// Initial theme apply
applyTheme(currentTheme);

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
  });
});

const OWNERS = ['0nlyany_', 'mace1n'];

function getUserRole(username) {
  return OWNERS.some(o => o.toLowerCase() === (username || '').toLowerCase()) ? 'owner' : 'admin';
}

function openSettingsModal() {
  pendingPhotoDataUrl = null;
  pendingPhotoRemoved = false;
  const existingPhoto = userProfiles[currentUser]?.photo || "";
  settingsAvatarPreview.innerHTML = existingPhoto ? `<img src="${existingPhoto}" alt="">` : currentUser.substring(0, 2).toUpperCase();
  settingsDisplayName.value = userProfiles[currentUser]?.displayName || currentUser;
  // Rozet guncelle
  const roleBadge = document.getElementById('settingsRoleBadge');
  if (roleBadge) {
    const role = getUserRole(currentUser);
    roleBadge.className = 'current-role-badge ' + role;
    roleBadge.textContent = role === 'owner' ? '👑 Owner' : '🛡️ Admin';
  }
  settingsModal.classList.remove('hidden');
}
document.getElementById('sidebarFoot').addEventListener('click', openSettingsModal);
document.getElementById('settingsClose').addEventListener('click', () => settingsModal.classList.add('hidden'));
document.getElementById('settingsCancelBtn').addEventListener('click', () => settingsModal.classList.add('hidden'));
document.getElementById('settingsUploadBtn').addEventListener('click', () => settingsFileInput.click());

settingsFileInput.addEventListener('change', () => {
  const file = settingsFileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast("Lütfen bir resim dosyası seçin.", "err"); return; }
  if (file.size > 1.5 * 1024 * 1024) { showToast("Dosya çok büyük (maks. ~1.5MB).", "err"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 220;
      let { width, height } = img;
      if (width > height) { if (width > maxDim) { height *= maxDim / width; width = maxDim; } }
      else { if (height > maxDim) { width *= maxDim / height; height = maxDim; } }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      pendingPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      pendingPhotoRemoved = false;
      settingsAvatarPreview.innerHTML = `<img src="${pendingPhotoDataUrl}" alt="">`;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('settingsRemoveBtn').addEventListener('click', () => {
  pendingPhotoDataUrl = null;
  pendingPhotoRemoved = true;
  settingsAvatarPreview.innerHTML = currentUser.substring(0, 2).toUpperCase();
});

document.getElementById('settingsSave').addEventListener('click', async () => {
  const displayName = settingsDisplayName.value.trim() || currentUser;
  const existing = userProfiles[currentUser] || {};
  let photo = existing.photo || "";
  if (pendingPhotoRemoved) photo = "";
  if (pendingPhotoDataUrl) photo = pendingPhotoDataUrl;
  try {
    await setDoc(doc(db, "user_profiles", currentUser), { displayName, photo, updatedAt: serverTimestamp() }, { merge: true });
    settingsModal.classList.add('hidden');
    sendWebhookLog({ title: "👤 Profil Güncellendi", description: `**${currentUser}** profilini güncelledi.`, color: 0x00e5c7, fields: [{ name: "Görünen Ad", value: displayName, inline: true }] });
    showToast("Profil güncellendi!");
  } catch (e) { showToast("Kaydedilemedi: " + e.message, "err"); }
});

// ========== ACTIVITY LOG ==========
async function logActivity(type, text) {
  try { await addDoc(collection(db, "activity"), { type, text, ts: serverTimestamp() }); }
  catch (e) { console.error("activity log err", e); }
}

function listenActivity() {
  onSnapshot(collection(db, "activity"), snap => {
    const feed = document.getElementById('activityFeed');
    if (snap.empty) { feed.innerHTML = '<div class="loading-row">Henüz hareket yok.</div>'; return; }
    const icons = { join: { cls: "join", ico: "✓" }, ban: { cls: "ban", ico: "⛔" }, warn: { cls: "warn", ico: "!" }, ok: { cls: "ok", ico: "◆" } };
    const sorted = snap.docs.map(d => d.data()).sort((a,b) => (b.ts?.seconds||0)-(a.ts?.seconds||0)).slice(0, 8);
    feed.innerHTML = sorted.map(a => {
      const ic = icons[a.type] || icons.ok;
      return `<div class="activity-row"><div class="dot-icon ${ic.cls}">${ic.ico}</div><div class="activity-main"><b>${escapeHtml(a.text)}</b><span>${a.ts ? formatDate(a.ts) : "Az önce"}</span></div></div>`;
    }).join('');

    // Stats sayfasındaki log tablosunu da güncelle
    const logBody = document.getElementById('statsActivityLog');
    if (logBody) {
      const actionLabels = { join: "Giriş", ban: "Yasak", warn: "Uyarı", ok: "İşlem" };
      if (!sorted.length) { logBody.innerHTML = '<tr><td colspan="4" class="loading-row">Henüz kayıt yok.</td></tr>'; return; }
      logBody.innerHTML = sorted.map(a => `
        <tr>
          <td><span class="dot-icon ${a.type || 'ok'}" style="width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;">${icons[a.type]?.ico || '◆'}</span></td>
          <td style="color:var(--text-faint);font-family:var(--font-mono);font-size:12px;">${escapeHtml(currentUser)}</td>
          <td>${escapeHtml(a.text)}</td>
          <td style="color:var(--text-faint);font-family:var(--font-mono);font-size:11px;">${a.ts ? formatDate(a.ts) : "Az önce"}</td>
        </tr>`).join('');
    }
  }, err => console.error("activity err", err));
}

// ========== BLACKLIST & ADMINLER ==========
function listenBlacklist() {
  if (blUnsubscribe) blUnsubscribe();
  blUnsubscribe = onSnapshot(collection(db, "blacklist"), snap => {
    blAllDocs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.ts?.seconds||0)-(a.ts?.seconds||0));
    const count = blAllDocs.length;
    document.getElementById('blBadge').textContent = count;
    document.getElementById('blCountLabel').textContent = count + " KAYIT";
    document.getElementById('dashBlCount').textContent = count;
    document.getElementById('stat-bans').textContent = count;
    renderBlacklist();
    updateBanDonut();
    renderAdminsGrid(); // Admin tablosunu blacklist değiştiğinde güncelle
  }, err => console.error("bl err", err));
}

function renderAdminsGrid() {
  const grid = document.getElementById('adminsGrid');
  if (!grid || !serverAdmins.length) return;

  // Sort: owners first
  const sorted = [...serverAdmins].sort((a, b) => {
    const aOwner = OWNERS.some(o => o.toLowerCase() === a.toLowerCase()) ? 0 : 1;
    const bOwner = OWNERS.some(o => o.toLowerCase() === b.toLowerCase()) ? 0 : 1;
    return aOwner - bOwner;
  });

  grid.innerHTML = sorted.map(adminName => {
    const role = getUserRole(adminName);
    const blCount = blAllDocs.filter(b => b.addedBy && b.addedBy.toLowerCase() === adminName.toLowerCase()).length;
    const badgeHtml = role === 'owner'
      ? `<span class="role-badge owner">Owner</span>`
      : `<span class="role-badge admin">Admin</span>`;
    const rankLabel = role === 'owner' ? 'KURUCU / OWNER' : 'YETKİLİ PERSONEL';

    return `
      <div class="admin-card" style="border-top:2px solid ${role === 'owner' ? 'rgba(245,201,108,.4)' : 'rgba(0,229,199,.2)'}; position:relative;">
        <div class="admin-avatar" style="background:${avatarColor(adminName)};">${avatarInner(adminName)}</div>
        <b>${escapeHtml(displayNameOf(adminName) || adminName)}</b>
        ${badgeHtml}
        <span class="role" style="display:none;">${rankLabel}</span>
        <div class="admin-stats-row">
          <div><b style="color:var(--danger);">${blCount}</b> Ban</div>
          <div><b style="color:${role === 'owner' ? '#f5c96c' : 'var(--accent-2)'};">Aktif</b> Hesap</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBlacklist() {
  const body = document.getElementById('blacklistBody');
  const filtered = blFilter ? blAllDocs.filter(x => (x.discordId || "").includes(blFilter)) : blAllDocs;
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7" class="loading-row">${blFilter ? "Sonuç bulunamadı." : "Henüz kayıt yok."}</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map((x, i) => `
    <tr style="animation-delay:${i * 0.04}s">
      <td class="bl-idx">${String(i + 1).padStart(2, '0')}</td>
      <td class="bl-id">${escapeHtml(x.discordId || "")}</td>
      <td style="color:var(--text-dim);font-size:12.5px;">${escapeHtml(x.reason || "—")}</td>
      <td><span class="status-chip">Yasaklı</span></td>
      <td class="bl-idx">${x.ts ? formatDate(x.ts) : "—"}</td>
      <td class="bl-idx">${escapeHtml(displayNameOf(x.addedBy) || "—")}</td>
      <td>
        <div class="row-actions" style="justify-content:flex-end;">
          <div class="icon-btn" title="Kopyala" onclick="navigator.clipboard.writeText('${escapeHtml(x.discordId || '')}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </div>
          <div class="icon-btn del" title="Sil" onclick="window._deleteBlEntry('${x.id}','${escapeHtml(x.discordId || '')}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </div>
        </div>
      </td>
    </tr>`).join('');
}

window._deleteBlEntry = async (docId, discordId) => {
  if (!confirm(`"${discordId}" kişisini blacklistten çıkarmak istediğinize emin misiniz?`)) return;
  try {
    await deleteDoc(doc(db, "blacklist", docId));
    logActivity("ok", `${discordId} blacklistten çıkarıldı (${currentUser})`);
    sendWebhookLog({ title: "✅ Blacklistten Çıkarıldı", description: `**${discordId}** kullanıcısı blacklistten çıkarıldı.`, color: 0x20e37c, fields: [{ name: "Çıkaran", value: currentUser, inline: true }] });
    showToast("Kayıt silindi.");
  } catch (e) { showToast("Silme başarısız: " + e.message, "err"); }
};

document.getElementById('blSearch').addEventListener('input', e => { blFilter = e.target.value.trim(); renderBlacklist(); });

document.getElementById('blAddBtn').addEventListener('click', () => {
  document.getElementById('blModal').classList.remove('hidden');
  document.getElementById('blModalId').focus();
});
document.getElementById('blModalClose').addEventListener('click', () => document.getElementById('blModal').classList.add('hidden'));
document.getElementById('blModalAdd').addEventListener('click', async () => {
  const id = document.getElementById('blModalId').value.trim();
  const reason = document.getElementById('blModalReason').value.trim();
  if (!id) { showToast("Discord ID boş olamaz.", "err"); return; }
  if (!/^\d{17,20}$/.test(id)) { showToast("Geçersiz Discord ID formatı.", "err"); return; }
  if (blAllDocs.find(x => x.discordId === id)) { showToast("Bu ID zaten listede.", "err"); return; }
  try {
    await addDoc(collection(db, "blacklist"), { discordId: id, reason: reason || "", addedBy: currentUser, ts: serverTimestamp() });
    logActivity("ban", `${id} blackliste eklendi (${currentUser})`);
    sendWebhookLog({ title: "⛔ Blackliste Eklendi", description: `**${id}** kullanıcısı blackliste eklendi.`, color: 0xff4d6a, fields: [{ name: "Sebep", value: reason || "Belirtilmedi" }, { name: "Ekleyen", value: currentUser, inline: true }] });
    showToast("Blackliste eklendi!");
    document.getElementById('blModalId').value = "";
    document.getElementById('blModalReason').value = "";
    document.getElementById('blModal').classList.add('hidden');
  } catch (e) { showToast("Ekleme başarısız: " + e.message, "err"); }
});

// ========== ANNOUNCEMENTS ==========
const tagLabels = { info: "Bilgi", onemli: "Önemli", kritik: "Kritik", guncelleme: "Güncelleme" };
let selectedTag = "info";

document.getElementById('annTagPick').addEventListener('click', e => {
  const opt = e.target.closest('.tag-opt');
  if (!opt) return;
  document.querySelectorAll('.tag-opt').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
  selectedTag = opt.dataset.tag;
});

function listenAnnouncements() {
  if (annUnsubscribe) annUnsubscribe();
  annUnsubscribe = onSnapshot(collection(db, "announcements"), snap => {
    const count = snap.size;
    document.getElementById('announceBadge').textContent = count;
    document.getElementById('announceCountLabel').textContent = count + " DUYURU";
    document.getElementById('dashAnnCount').textContent = count;
    document.getElementById('stat-anns').textContent = count;
    const feed = document.getElementById('announceFeed');
    if (snap.empty) { feed.innerHTML = `<div class="announce-empty">Henüz duyuru yok. Yukarıdan ilk duyurunu oluştur.</div>`; return; }
    feed.innerHTML = "";
    [...snap.docs].sort((a,b) => (b.data().ts?.seconds||0)-(a.data().ts?.seconds||0)).forEach((d, idx) => {
      const a = d.data();
      const card = document.createElement('div');
      card.className = `announce-card tag-${a.tag}`;
      card.style.animationDelay = (idx * 0.06) + "s";
      card.innerHTML = `
        <div class="announce-head">
          <div class="announce-title">${escapeHtml(a.title)} <span class="announce-tag ${a.tag}">${tagLabels[a.tag] || a.tag}</span></div>
          <div class="announce-meta">${a.ts ? formatDate(a.ts) : "Az önce"}</div>
        </div>
        <div class="announce-body">${escapeHtml(a.body)}</div>
        <div class="announce-footer-row">
          <div class="announce-author">
            <div class="aa-avatar">${avatarInner(a.author)}</div>
            <span><b>${escapeHtml(displayNameOf(a.author))}</b> tarafından yayınlandı</span>
          </div>
          <div class="icon-btn del" title="Duyuruyu Sil" onclick="window._deleteAnnouncement('${d.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </div>
        </div>`;
      feed.appendChild(card);
    });
  }, err => console.error("ann err", err));
}

window._deleteAnnouncement = async (docId) => {
  if (!confirm("Bu duyuruyu silmek istediğinize emin misiniz?")) return;
  try {
    await deleteDoc(doc(db, "announcements", docId));
    logActivity("ok", `Duyuru silindi (${currentUser})`);
    sendWebhookLog({ title: "🗑️ Duyuru Silindi", description: `Bir duyuru silindi.`, color: 0xffb545, fields: [{ name: "Silen", value: currentUser, inline: true }] });
    showToast("Duyuru silindi.");
  } catch (e) { showToast("Silme başarısız: " + e.message, "err"); }
};

document.getElementById('annPublishBtn').addEventListener('click', async () => {
  const titleEl = document.getElementById('annTitle');
  const bodyEl = document.getElementById('annBody');
  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  if (!title || !body) {
    if (!title) titleEl.style.borderColor = 'var(--danger)';
    if (!body) bodyEl.style.borderColor = 'var(--danger)';
    setTimeout(() => { titleEl.style.borderColor = ''; bodyEl.style.borderColor = ''; }, 900);
    return;
  }
  try {
    await addDoc(collection(db, "announcements"), { title, body, tag: selectedTag, author: currentUser, ts: serverTimestamp() });
    logActivity("ok", `Yeni duyuru: "${title}" (${currentUser})`);
    sendWebhookLog({ title: "📢 Yeni Duyuru Yayınlandı", description: `**${title}**\n\n${body}`, color: 0x7c5cff, fields: [{ name: "Etiket", value: tagLabels[selectedTag] || selectedTag, inline: true }, { name: "Yayınlayan", value: currentUser, inline: true }] });
    showToast("Duyuru yayınlandı!");
    titleEl.value = ""; bodyEl.value = "";
  } catch (e) { showToast("Yayınlama başarısız: " + e.message, "err"); }
});

// ========== CHAT ==========
let lastChatDocs = [];
let lastKnownMsgCount = 0;
let chatInitialized = false;

function formatMessageText(text) {
  return escapeHtml(text).replace(/@everyone/g, '<span class="everyone-tag">@everyone</span>');
}

function renderChatMessages() {
  const messagesEl = document.getElementById('chatMessages');
  if (!lastChatDocs.length) {
    messagesEl.innerHTML = '<div class="loading-row">Bu kanalda henüz mesaj yok.</div>';
    return;
  }
  messagesEl.innerHTML = "";
  lastChatDocs.forEach(m => {
    const isEveryone = m.everyone === true;
    const div = document.createElement('div');
    div.className = "msg" + (isEveryone ? " everyone-msg" : "");
    div.innerHTML = `
      <div class="m-avatar" style="background:${avatarColor(m.author)}">${avatarInner(m.author)}</div>
      <div class="m-body" style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <b>${escapeHtml(displayNameOf(m.author))}</b>
            <span class="m-time">${m.ts ? formatDate(m.ts) : "Az önce"}</span>
          </div>
          <div class="icon-btn del" title="Mesajı Sil" onclick="window._deleteChatMsg('${m._id}')" style="width:24px;height:24px;background:transparent;border:none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </div>
        </div>
        <p>${formatMessageText(m.text || "")}</p>
      </div>`;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
window._rerenderChat = renderChatMessages;

window._deleteChatMsg = async (msgId) => {
  if (!confirm("Bu mesajı silmek istiyor musunuz?")) return;
  try {
    await deleteDoc(doc(db, `chat_${currentChannel}`, msgId));
    // Firebase listener otomatik olarak mesajı silecek
  } catch (e) { showToast("Mesaj silinemedi: " + e.message, "err"); }
};

function listenChat(channel) {
  if (chatUnsubscribe) chatUnsubscribe();
  chatInitialized = false;
  lastKnownMsgCount = 0;
  const messagesEl = document.getElementById('chatMessages');
  messagesEl.innerHTML = '<div class="loading-row"><span class="spinner"></span> Yükleniyor...</div>';
  requestNotificationPermission();

  chatUnsubscribe = onSnapshot(collection(db, `chat_${channel}`), snap => {
    const allDocs = [...snap.docs].map(d => ({ ...d.data(), _id: d.id })).sort((a,b) => (a.ts?.seconds||0)-(b.ts?.seconds||0));
    if (!chatInitialized) {
      lastKnownMsgCount = allDocs.length;
      chatInitialized = true;
      lastChatDocs = allDocs;
      renderChatMessages();
      document.getElementById('chatBadge').textContent = snap.size;
      return;
    }
    if (allDocs.length > lastKnownMsgCount) {
      const newMessages = allDocs.slice(lastKnownMsgCount);
      newMessages.forEach(msg => {
        if (msg.author !== currentUser && msg.everyone === true) {
          playNotificationSound();
          showBrowserNotification(msg.author, msg.text);
          const senderName = displayNameOf(msg.author) || msg.author;
          showToast(`📢 ${senderName} @everyone yazdı!`, "everyone");
        }
      });
    }
    lastKnownMsgCount = allDocs.length;
    lastChatDocs = allDocs;
    renderChatMessages();
    document.getElementById('chatBadge').textContent = snap.size;
  }, err => console.error("chat err", err));
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  const isEveryone = text.includes('@everyone');
  try {
    await addDoc(collection(db, `chat_${currentChannel}`), { text, author: currentUser, ts: serverTimestamp(), everyone: isEveryone });
    if (isEveryone) {
      logActivity("warn", `${currentUser} #${currentChannel} kanalında @everyone kullandı`);
      sendWebhookLog({ title: `📢 @everyone — #${currentChannel}`, description: text, color: 0xff4d6a, fields: [{ name: "Gönderen", value: currentUser, inline: true }] });
    } else {
      sendWebhookLog({ title: `💬 #${currentChannel}`, description: text, color: 0x5a3fe0, fields: [{ name: "Gönderen", value: currentUser, inline: true }] });
    }
  } catch (e) { showToast("Mesaj gönderilemedi: " + e.message, "err"); }
}

document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

document.querySelectorAll('.chan[data-channel]').forEach(ch => {
  ch.addEventListener('click', () => {
    document.querySelectorAll('.chan').forEach(c => c.classList.remove('active'));
    ch.classList.add('active');
    currentChannel = ch.dataset.channel;
    document.getElementById('chatChannelName').textContent = '# ' + ch.dataset.channel;
    listenChat(currentChannel);
  });
});

// ===== OYUNCU SORGULAMA =====
function addRecentQuery(id) {
  recentQueryList = recentQueryList.filter(x => x !== id);
  recentQueryList.unshift(id);
  if (recentQueryList.length > 5) recentQueryList = recentQueryList.slice(0, 5);
  renderRecentQueries();
}

function renderRecentQueries() {
  const el = document.getElementById('recentQueries');
  if (!recentQueryList.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-faint);font-family:var(--font-mono);">Henüz sorgu yapılmadı.</div>';
    return;
  }
  el.innerHTML = recentQueryList.map(id => `
    <div onclick="window._runQuery('${id}')" style="
      display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;
      cursor:pointer;margin-bottom:4px;transition:.15s;
      background:var(--bg-panel-2);border:1px solid var(--line);
    " onmouseover="this.style.borderColor='rgba(124,92,255,.4)'" onmouseout="this.style.borderColor='var(--line)'">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim);">${id}</span>
    </div>`).join('');
}

async function runPlayerQuery(discordId) {
  const panel = document.getElementById('queryResultPanel');
  panel.className = 'query-result-panel';
  panel.innerHTML = '<div class="query-empty"><span class="spinner"></span><span>Sorgulanıyor...</span></div>';

  if (!db) {
    panel.innerHTML = '<div class="query-empty"><span>Firestore bağlantısı yok.</span></div>';
    return;
  }

  try {
    // Blacklist kontrolü
    const blMatch = blAllDocs.find(x => x.discordId === discordId);

    // Admin notları
    let noteData = null;
    try {
      const noteSnap = await getDoc(doc(db, "player_notes", discordId));
      if (noteSnap.exists()) noteData = noteSnap.data();
    } catch(e) {}

    addRecentQuery(discordId);
    logActivity("ok", `${currentUser} tarafından sorgulandı: ${discordId}`);

    const isBanned = !!blMatch;
    panel.className = 'query-result-panel ' + (isBanned ? 'danger-highlight' : 'highlight');

    panel.innerHTML = `
      <div class="player-profile-header">
        <div class="player-big-avatar">${discordId.substring(0,2)}</div>
        <div>
          <div class="p-name">Oyuncu #${discordId.substring(0,8)}...</div>
          <div class="p-id">${discordId}</div>
          <div class="p-status">
            ${isBanned
              ? '<span class="status-chip">⛔ Yasaklı</span>'
              : '<span class="status-chip clean">✓ Temiz</span>'
            }
          </div>
        </div>
        <div style="margin-left:auto;">
          <div class="icon-btn" title="ID Kopyala" onclick="navigator.clipboard.writeText('${discordId}');window._showToast('ID kopyalandı!')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </div>
        </div>
      </div>

      <div class="info-row"><span class="lbl">Discord ID</span><span class="val">${discordId}</span></div>
      <div class="info-row"><span class="lbl">Blacklist Durumu</span><span class="val" style="color:${isBanned ? 'var(--danger)' : '#20e37c'}">${isBanned ? '⛔ Yasaklı' : '✓ Temiz'}</span></div>
      ${isBanned ? `
      <div class="info-row"><span class="lbl">Yasak Sebebi</span><span class="val">${escapeHtml(blMatch.reason || '—')}</span></div>
      <div class="info-row"><span class="lbl">Yasaklayan</span><span class="val">${escapeHtml(displayNameOf(blMatch.addedBy) || '—')}</span></div>
      <div class="info-row"><span class="lbl">Yasak Tarihi</span><span class="val">${blMatch.ts ? formatDate(blMatch.ts) : '—'}</span></div>
      ` : ''}
      <div class="info-row"><span class="lbl">Sorgulayan</span><span class="val">${escapeHtml(currentUserDisplayName || currentUser)}</span></div>
      <div class="info-row"><span class="lbl">Sorgu Zamanı</span><span class="val">${new Date().toLocaleDateString('tr-TR') + ' ' + new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</span></div>

      <div class="query-notes-area" id="notesArea">
        <label>Admin Notları</label>
        <textarea id="noteTextarea" placeholder="Bu oyuncu hakkında not ekle...">${escapeHtml(noteData?.note || '')}</textarea>
        <div class="query-notes-foot">
          <button class="btn-primary violet" onclick="window._savePlayerNote('${discordId}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Notu Kaydet
          </button>
        </div>
      </div>

      ${isBanned ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);display:flex;gap:8px;">
        <button class="btn-primary" style="font-size:12px;padding:9px 14px;" onclick="window._quickUnban('${blMatch.id}','${discordId}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
          Yasağı Kaldır
        </button>
      </div>` : `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);display:flex;gap:8px;">
        <button class="btn-primary" style="font-size:12px;padding:9px 14px;" onclick="window._quickBan('${discordId}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
          Blackliste Ekle
        </button>
      </div>`}
    `;
  } catch(e) {
    panel.className = 'query-result-panel';
    panel.innerHTML = `<div class="query-empty"><span>Sorgu başarısız: ${e.message}</span></div>`;
  }
}

window._showToast = (msg) => showToast(msg);
window._runQuery = (id) => {
  document.getElementById('queryInput').value = id;
  runPlayerQuery(id);
};
window._savePlayerNote = async (discordId) => {
  const note = document.getElementById('noteTextarea')?.value?.trim() || '';
  try {
    await setDoc(doc(db, "player_notes", discordId), { note, updatedBy: currentUser, updatedAt: serverTimestamp() }, { merge: true });
    showToast("Not kaydedildi!");
    logActivity("ok", `${discordId} için not güncellendi (${currentUser})`);
  } catch(e) { showToast("Not kaydedilemedi: " + e.message, "err"); }
};
window._quickBan = async (discordId) => {
  const reason = prompt("Yasak sebebi (boş bırakılabilir):");
  if (reason === null) return;
  try {
    await addDoc(collection(db, "blacklist"), { discordId, reason: reason || "", addedBy: currentUser, ts: serverTimestamp() });
    logActivity("ban", `${discordId} blackliste eklendi (${currentUser})`);
    sendWebhookLog({ title: "⛔ Blackliste Eklendi", description: `**${discordId}** blackliste eklendi.`, color: 0xff4d6a, fields: [{ name: "Sebep", value: reason || "Belirtilmedi" }, { name: "Ekleyen", value: currentUser, inline: true }] });
    showToast("Blackliste eklendi!");
    setTimeout(() => runPlayerQuery(discordId), 500);
  } catch(e) { showToast("Ekleme başarısız.", "err"); }
};
window._quickUnban = async (docId, discordId) => {
  if (!confirm(`"${discordId}" kişisinin yasağını kaldırmak istiyor musunuz?`)) return;
  try {
    await deleteDoc(doc(db, "blacklist", docId));
    logActivity("ok", `${discordId} blacklistten çıkarıldı (${currentUser})`);
    sendWebhookLog({ title: "✅ Yasak Kaldırıldı", description: `**${discordId}** yasağı kaldırıldı.`, color: 0x20e37c, fields: [{ name: "Kaldıran", value: currentUser, inline: true }] });
    showToast("Yasak kaldırıldı!");
    setTimeout(() => runPlayerQuery(discordId), 500);
  } catch(e) { showToast("İşlem başarısız.", "err"); }
};

document.getElementById('queryBtn').addEventListener('click', () => {
  const id = document.getElementById('queryInput').value.trim();
  if (!id) { showToast("Discord ID girin.", "err"); return; }
  if (!/^\d{17,20}$/.test(id)) { showToast("Geçersiz Discord ID formatı (17-20 rakam).", "err"); return; }
  runPlayerQuery(id);
});
document.getElementById('queryInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('queryBtn').click();
});

// ===== SUNUCU İSTATİSTİKLERİ — CHART.JS =====
function getChartData(range) {
  if (range === 'hourly') {
    const labels = [];
    const data = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const h = new Date(now - i * 3600000);
      labels.push(h.getHours().toString().padStart(2,'0') + ':00');
      const base = 80 + Math.sin((h.getHours() - 6) * Math.PI / 12) * 120;
      data.push(Math.max(20, Math.round(base + (Math.random() - 0.5) * 30)));
    }
    return { labels, data };
  } else if (range === 'daily') {
    const labels = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
    const data = [1420, 1680, 1550, 1820, 2100, 2340, 1980];
    return { labels, data };
  } else {
    const labels = ['1. Hafta','2. Hafta','3. Hafta','4. Hafta'];
    const data = [9800, 11200, 10500, 13100];
    return { labels, data };
  }
}

function initPlayerChart(range) {
  const ctx = document.getElementById('playerChart');
  if (!ctx) return;
  if (playerChartInstance) { playerChartInstance.destroy(); }
  const { labels, data } = getChartData(range);
  playerChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Oyuncu',
        data,
        borderColor: '#7c5cff',
        backgroundColor: 'rgba(124,92,255,0.08)',
        borderWidth: 2,
        pointBackgroundColor: '#7c5cff',
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#12151c',
        borderColor: '#1e222c',
        borderWidth: 1,
        titleColor: '#e8e9ee',
        bodyColor: '#8a8fa3',
        callbacks: { label: ctx => ` ${ctx.parsed.y} oyuncu` }
      }},
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#565b6e', font: { size: 10, family: 'JetBrains Mono' } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#565b6e', font: { size: 10, family: 'JetBrains Mono' } }, beginAtZero: true }
      }
    }
  });
}

function updateBanDonut() {
  const ctx = document.getElementById('banDonut');
  if (!ctx) return;

  const reasons = {};
  blAllDocs.forEach(x => {
    const r = (x.reason || 'Belirtilmedi').split(' ').slice(0,3).join(' ') || 'Belirtilmedi';
    const key = r.length > 22 ? r.substring(0, 22) + '…' : r;
    reasons[key] = (reasons[key] || 0) + 1;
  });

  let entries = Object.entries(reasons).sort((a,b) => b[1]-a[1]).slice(0,5);
  if (!entries.length) entries = [['Henüz ban yok', 1]];

  const palette = ['#7c5cff','#00e5c7','#ff4d6a','#ffb545','#5cffb0'];

  if (banDonutInstance) banDonutInstance.destroy();
  banDonutInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: palette, borderColor: '#07080b', borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#12151c', borderColor: '#1e222c', borderWidth: 1,
          titleColor: '#e8e9ee', bodyColor: '#8a8fa3'
        }
      },
      cutout: '68%'
    }
  });

  const legend = document.getElementById('donutLegend');
  if (legend) {
    legend.innerHTML = entries.map((e, i) => `
      <div class="donut-legend-row">
        <span class="dl-dot" style="background:${palette[i]}"></span>
        <span class="dl-name">${escapeHtml(e[0])}</span>
        <span class="dl-val">${e[1]}</span>
      </div>`).join('');
  }
}

function initCharts() {
  initPlayerChart(currentChartRange);
  updateBanDonut();
}

document.querySelectorAll('.chart-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentChartRange = tab.dataset.range;
    initPlayerChart(currentChartRange);
  });
});

// ========== MAZERET İZNİ ==========
let mazeretUnsubscribe = null;

function formatLocalDatetime(dtString) {
  if (!dtString) return '—';
  try {
    const d = new Date(dtString);
    return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch(e) { return dtString; }
}

function listenMazeret() {
  if (mazeretUnsubscribe) mazeretUnsubscribe();
  mazeretUnsubscribe = onSnapshot(collection(db, 'mazeret_izni'), snap => {
    const count = snap.size;
    document.getElementById('mazeretBadge').textContent = count;
    document.getElementById('mazeretCountLabel').textContent = count + ' AKTİF İZİN';
    const feed = document.getElementById('mazeretFeed');
    if (snap.empty) {
      feed.innerHTML = '<div class="mazeret-empty">Henüz mazeret izni kaydı yok.<br><span style="font-size:11px;opacity:.6;">Yukarıdaki formu doldurarak ilk talebi oluşturun.</span></div>';
      return;
    }
    feed.innerHTML = '';
    [...snap.docs]
      .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
      .forEach((d, idx) => {
        const m = d.data();
        const card = document.createElement('div');
        card.className = 'mazeret-card';
        card.style.animationDelay = (idx * 0.06) + 's';
        const initials = (m.yetkiliAdi || '?').substring(0, 2).toUpperCase();
        card.innerHTML = `
          <div class="mazeret-card-head">
            <div class="mazeret-name">
              ${escapeHtml(m.yetkiliAdi || '?')}
              <span class="mazeret-role-badge">${escapeHtml(m.yetki || '—')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              <span class="mazeret-status-badge aktif">İZİNDE</span>
              <div class="icon-btn del" title="Kaydı Sil" onclick="window._deleteMazeret('${d.id}','${escapeHtml(m.yetkiliAdi || '')}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
              </div>
            </div>
          </div>

          <div class="mazeret-info-grid">
            <div class="mazeret-info-item">
              <div class="mi-lbl">📅 Ayrılış Tarihi & Saati</div>
              <div class="mi-val">${escapeHtml(formatLocalDatetime(m.ayrilisTarihi))}</div>
            </div>
            <div class="mazeret-info-item">
              <div class="mi-lbl">📅 Tahmini Dönüş Tarihi & Saati</div>
              <div class="mi-val">${escapeHtml(formatLocalDatetime(m.donusTarihi))}</div>
            </div>
          </div>

          <div style="font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:var(--text-faint);margin-bottom:7px;margin-top:12px;">📝 Mazeret Sebebi</div>
          <div class="mazeret-reason">${escapeHtml(m.mazeretSebep || '—')}</div>

          <div class="mazeret-footer">
            <div class="mazeret-author">
              <div style="width:24px;height:24px;border-radius:6px;background:linear-gradient(135deg,var(--warn),#c67e00);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:9px;font-weight:700;color:#07080b;">${escapeHtml(initials)}</div>
              <span>${escapeHtml(displayNameOf(m.olusturan) || m.olusturan || '—')} tarafından oluşturuldu</span>
            </div>
            <span style="font-size:11px;color:var(--text-faint);font-family:var(--font-mono);">${m.createdAt ? formatDate(m.createdAt) : 'Az önce'}</span>
          </div>
        `;
        feed.appendChild(card);
      });
  }, err => console.error('mazeret err', err));
}

window._deleteMazeret = async (docId, yetkiliAdi) => {
  if (!confirm(`"${yetkiliAdi}" kişisinin mazeret iznini silmek istediğinize emin misiniz?`)) return;
  try {
    await deleteDoc(doc(db, 'mazeret_izni', docId));
    logActivity('ok', `${yetkiliAdi} mazeret izni silindi (${currentUser})`);
    sendWebhookLog({ title: '🗑️ Mazeret İzni Silindi', description: `**${yetkiliAdi}** adlı kişinin mazeret izni silindi.`, color: 0xffb545, fields: [{ name: 'Silen', value: currentUser, inline: true }] });
    showToast('Mazeret izni silindi.');
  } catch (e) { showToast('Silme başarısız: ' + e.message, 'err'); }
};

document.getElementById('mzSubmitBtn').addEventListener('click', async () => {
  const yetkiliAdi   = document.getElementById('mzYetkili').value.trim();
  const yetki        = document.getElementById('mzYetki').value.trim();
  const ayrilisTarihi = document.getElementById('mzAyrilis').value;
  const donusTarihi   = document.getElementById('mzDonus').value;
  const mazeretSebep  = document.getElementById('mzSebep').value.trim();

  // Validation
  const fields = [
    { el: document.getElementById('mzYetkili'), val: yetkiliAdi },
    { el: document.getElementById('mzYetki'), val: yetki },
    { el: document.getElementById('mzAyrilis'), val: ayrilisTarihi },
    { el: document.getElementById('mzDonus'), val: donusTarihi },
    { el: document.getElementById('mzSebep'), val: mazeretSebep },
  ];
  let hasError = false;
  fields.forEach(f => {
    if (!f.val) {
      f.el.style.borderColor = 'var(--danger)';
      setTimeout(() => { f.el.style.borderColor = ''; }, 1200);
      hasError = true;
    }
  });
  if (hasError) { showToast('Lütfen tüm alanları doldurun.', 'err'); return; }
  if (new Date(donusTarihi) <= new Date(ayrilisTarihi)) {
    showToast('Dönüş tarihi, ayrılış tarihinden sonra olmalıdır.', 'err');
    return;
  }

  const btn = document.getElementById('mzSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';
  try {
    await addDoc(collection(db, 'mazeret_izni'), {
      yetkiliAdi,
      yetki,
      ayrilisTarihi,
      donusTarihi,
      mazeretSebep,
      olusturan: currentUser,
      createdAt: serverTimestamp()
    });
    logActivity('warn', `${yetkiliAdi} mazeret izni oluşturdu (${currentUser})`);
    sendWebhookLog({
      title: '🏖️ Yeni Mazeret İzni Talebi',
      description: `**${yetkiliAdi}** (${yetki}) mazeret izni talep etti.`,
      color: 0xffb545,
      fields: [
        { name: '📅 Ayrılış', value: formatLocalDatetime(ayrilisTarihi), inline: true },
        { name: '📅 Tahmini Dönüş', value: formatLocalDatetime(donusTarihi), inline: true },
        { name: '📝 Sebep', value: mazeretSebep },
        { name: '👤 Oluşturan', value: currentUser, inline: true }
      ]
    });
    showToast('Mazeret izni kaydedildi! ✓');
    document.getElementById('mzYetkili').value = '';
    document.getElementById('mzYetki').value = '';
    document.getElementById('mzAyrilis').value = '';
    document.getElementById('mzDonus').value = '';
    document.getElementById('mzSebep').value = '';
  } catch (e) {
    showToast('Kayıt başarısız: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> İzin Talebini Gönder';
  }
});

// ========== OWNER PANEL ==========
let adminRoles = {}; // { username: { roleTitle, badgeType, assignedBy } }
let adminRolesUnsubscribe = null;

const ROLE_PRESETS = [
  { value: 'co-owner',    label: '👑 Co-Owner',    type: 'owner' },
  { value: 'bas-admin',   label: '⭐ Baş Admin',   type: 'admin-gold' },
  { value: 'senior-admin',label: '🔶 Senior Admin', type: 'admin' },
  { value: 'admin',       label: '🛡️ Admin',      type: 'admin' },
  { value: 'moderator',   label: '📋 Moderatör',   type: 'mod' },
  { value: 'trial-mod',   label: '🌱 Trial Mod',   type: 'mod' },
];

function getAdminDisplayRole(username) {
  if (adminRoles[username]) return adminRoles[username];
  const isOwner = OWNERS.some(o => o.toLowerCase() === username.toLowerCase());
  return isOwner
    ? { roleTitle: 'Owner', badgeType: 'owner' }
    : { roleTitle: 'Admin', badgeType: 'admin' };
}

function roleBadgeHtml(roleData) {
  const { roleTitle, badgeType } = roleData;
  const styleMap = {
    'owner':      'color:#f5c96c;border-color:rgba(245,201,108,.4);background:rgba(245,201,108,.1);',
    'admin-gold': 'color:#ffb545;border-color:rgba(255,181,69,.4);background:rgba(255,181,69,.08);',
    'admin':      'color:var(--accent-2);border-color:rgba(0,229,199,.3);background:rgba(0,229,199,.07);',
    'mod':        'color:var(--accent);border-color:rgba(124,92,255,.3);background:rgba(124,92,255,.07);',
  };
  const style = styleMap[badgeType] || styleMap['admin'];
  return `<span class="role-badge" style="${style}">${escapeHtml(roleTitle)}</span>`;
}

function listenAdminRoles() {
  if (adminRolesUnsubscribe) adminRolesUnsubscribe();
  adminRolesUnsubscribe = onSnapshot(collection(db, 'admin_roles'), snap => {
    adminRoles = {};
    snap.docs.forEach(d => { adminRoles[d.id] = d.data(); });
    renderAdminsGrid();
    renderOwnerPanel();
  }, err => console.error('admin_roles err', err));
}

function renderOwnerPanel() {
  const isOwner = getUserRole(currentUser) === 'owner';
  const lockBanner = document.getElementById('ownerLockBanner');
  const ownerContent = document.getElementById('ownerContent');
  if (!lockBanner || !ownerContent) return;

  if (!isOwner) {
    lockBanner.style.display = 'flex';
    ownerContent.style.display = 'none';
    return;
  }
  lockBanner.style.display = 'none';
  ownerContent.style.display = 'block';

  const nonOwners = serverAdmins.filter(n => getUserRole(n) !== 'owner');
  const grid = document.getElementById('roleAssignGrid');
  if (!grid) return;

  if (!nonOwners.length) {
    grid.innerHTML = '<div class="mazeret-empty">Atanacak admin bulunamadı.</div>';
    return;
  }

  grid.innerHTML = nonOwners.map(adminName => {
    const currentRole = getAdminDisplayRole(adminName);
    const selectId = `roleSelect_${adminName.replace(/[^a-z0-9]/gi,'_')}`;
    const optionsHtml = ROLE_PRESETS.map(p =>
      `<option value="${p.value}" data-type="${p.type}" ${currentRole.roleTitle && ROLE_PRESETS.find(r => r.label.includes(currentRole.roleTitle.replace(/[^\w]/g,''))) ? '' : ''}>${p.label}</option>`
    ).join('');

    // Seçili değeri bul
    const savedPreset = ROLE_PRESETS.find(p => p.label.replace(/[\u{1F000}-\u{FFFF}]|[\u{10000}-\u{10FFFF}]/gu,'').trim() === currentRole.roleTitle) ||
      ROLE_PRESETS.find(p => p.value === (adminRoles[adminName]?.value));
    const selectedVal = adminRoles[adminName]?.value || 'admin';

    return `
      <div class="role-assign-card">
        <div class="rac-head">
          <div class="rac-avatar" style="background:${avatarColor(adminName)}">${avatarInner(adminName)}</div>
          <div class="rac-info">
            <b>${escapeHtml(displayNameOf(adminName) || adminName)}</b>
            <div class="rac-current-badge">${roleBadgeHtml(currentRole)}</div>
          </div>
        </div>
        <div class="rac-form">
          <select class="rac-select" id="${selectId}">
            ${ROLE_PRESETS.map(p => `<option value="${p.value}" data-type="${p.type}" ${p.value === selectedVal ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
          <button class="rac-save-btn" onclick="window._assignRole('${adminName}','${selectId}')">
            ✦ ROZET ATA / GÜNCELLE
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window._assignRole = async (adminName, selectId) => {
  const select = document.getElementById(selectId);
  if (!select) return;
  const selectedOption = select.options[select.selectedIndex];
  const value = selectedOption.value;
  const badgeType = selectedOption.dataset.type;
  const roleTitle = selectedOption.text.replace(/^[\u{1F000}-\u{FFFF}\u{10000}-\u{10FFFF}\u2B50\s⭐]+/gu, '').trim();

  const btn = select.closest('.rac-form').querySelector('.rac-save-btn');
  btn.disabled = true;
  btn.textContent = 'Kaydediliyor...';
  try {
    await setDoc(doc(db, 'admin_roles', adminName), {
      roleTitle: selectedOption.text.replace(/^[^\w\s]+/u, '').trim(),
      badgeType,
      value,
      assignedBy: currentUser,
      assignedAt: serverTimestamp()
    });
    logActivity('ok', `${adminName} kullanıcısına "${selectedOption.text.trim()}" rozeti atandı (${currentUser})`);
    sendWebhookLog({
      title: '👑 Rozet Atandı',
      description: `**${adminName}** kullanıcısına yeni rozet verildi.`,
      color: 0xf5c96c,
      fields: [
        { name: 'Yeni Rozet', value: selectedOption.text.trim(), inline: true },
        { name: 'Atayan', value: currentUser, inline: true }
      ]
    });
    showToast(`${adminName} → ${selectedOption.text.trim()} ✓`);
  } catch(e) {
    showToast('Kaydedilemedi: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '✦ ROZET ATA / GÜNCELLE';
  }
};

// ========== INIT ==========
function initFirestoreListeners() {
  listenProfiles();
  listenBlacklist();
  listenAnnouncements();
  listenActivity();
  listenChat(currentChannel);
  listenMazeret();
  listenAdminRoles();
  // Owner nav item'ı göster/gizle
  const ownerNav = document.getElementById('ownerNavItem');
  if (ownerNav) ownerNav.style.display = getUserRole(currentUser) === 'owner' ? 'flex' : 'none';
}

} // end setupApp
