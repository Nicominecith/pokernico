// Nicominecith Poker - Main Application

// =========================================

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyDH6KuYuuATPgz7CDSGP1vZ0vXBWHLOH2M",
  authDomain: "nicominepo.firebaseapp.com",
  databaseURL: "https://nicominepo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nicominepo",
  storageBucket: "nicominepo.firebasestorage.app",
  messagingSenderId: "949040652943",
  appId: "1:949040652943:web:3344b950c4f4f97ccf46fa",
  measurementId: "G-4Y7S7XHG4N"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();
const functions = firebase.functions();

const USE_REAL_EMAIL_CODE = false; // Set to true after you configure Firebase Functions / email service
const EMAIL_CODE_FUNCTION_NAME = 'generateEmailCode';
const EMAIL_CODE_VERIFY_FUNCTION_NAME = 'verifyEmailCode';

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({
  client_id: '949040652943-1a1m1n4eemfqjmkg2ifptq5pvlit5eja.apps.googleusercontent.com'
});

// ===== STATE =====
let currentUser = null;
let userData = {};
let pendingRegistration = null;
let otpCode = null;
let gameState = null;
let gameMode = 'local';
let currentRoom = null;
let timerInterval = null;
let publicTablesListener = null;
let currencyRates = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', CHIP: '🪙' };
let currentCurrency = 'EUR';
let streamerMode = false;
let settings = {};

// ===== PARTICLES INIT =====
function initParticles() {
  const c = document.getElementById('particles');
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    const colors = [
      'rgba(139,47,201,0.4)',
      'rgba(192,35,58,0.3)',
      'rgba(26,140,78,0.3)',
      'rgba(212,160,23,0.3)'
    ];
    p.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 15 + 10}s;
      animation-delay:-${Math.random() * 15}s;
      background:${colors[Math.floor(Math.random() * colors.length)]};
    `;
    c.appendChild(p);
  }
}
initParticles();

// ===== TOAST NOTIFICATIONS =====
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = document.getElementById(id);
  if (s) s.classList.add('active');
  if (id === 'profile-screen') loadProfileData();
  if (id === 'ranking-screen') {
    loadLeaderboard();
    updateRankDisplay();
  }
  if (id === 'menu-screen') updateMenuUI();
}

// ===== AUTHENTICATION =====
auth.onAuthStateChanged(async user => {
  document.getElementById('loading-overlay').style.display = 'none';
  if (user) {
    currentUser = user;
    await loadUserData();
    showScreen('menu-screen');
    checkBonuses();
  } else {
    currentUser = null;
    showScreen('auth-screen');
  }
});

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  document.getElementById('login-form').classList.toggle('active', tab === 'login');
  document.getElementById('register-form').classList.toggle('active', tab === 'register');
}

async function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  if (!email || !pw) {
    err.textContent = 'Bitte alle Felder ausfüllen.';
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    err.textContent = getAuthError(e.code);
  }
}

async function loginGoogle() {
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;
    const snap = await db.ref('users/' + user.uid).once('value');
    if (!snap.exists()) {
      await db.ref('users/' + user.uid).set({
        username: user.displayName || 'Spieler_' + user.uid.slice(0, 5),
        email: user.email,
        balance: 500,
        rankedPoints: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        winStreak: 0,
        createdAt: Date.now(),
        lastBonusDaily: 0,
        lastBonusWeekly: 0,
        avatarUrl: user.photoURL || '',
        settings: { sound: true, anim: true, streamer: false, currency: 'EUR', notif: true, fastplay: false }
      });
    }
  } catch (e) {
    toast(getAuthError(e.code), 'error');
  }
}

async function registerUser() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const dob = document.getElementById('reg-dob').value;
  const pw = document.getElementById('reg-password').value;
  const pw2 = document.getElementById('reg-password2').value;
  const err = document.getElementById('reg-error');
  err.textContent = '';

  if (!username || !email || !dob || !pw || !pw2) {
    err.textContent = 'Alle Felder ausfüllen.';
    return;
  }
  if (pw.length < 8) {
    err.textContent = 'Passwort min. 8 Zeichen.';
    return;
  }
  if (pw !== pw2) {
    err.textContent = 'Passwörter stimmen nicht überein.';
    return;
  }

  // Age check (18+)
  const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 18) {
    err.textContent = 'Du musst mindestens 18 Jahre alt sein.';
    return;
  }

  pendingRegistration = { username, email, dob, pw };

  if (USE_REAL_EMAIL_CODE) {
    const success = await requestEmailCode(email);
    if (!success) return;
    toast('Code an deine E-Mail gesendet. Bitte prüfe dein Postfach.', 'success');
  } else {
    otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('Demo OTP:', otpCode);
    toast('Demo-Code im Browser generiert. Bitte überprüfe die Konsole.', 'info');
  }

  document.getElementById('reg-email-display').textContent = email;
  document.getElementById('reg-step-1').style.display = 'none';
  document.getElementById('reg-step-2').style.display = 'block';
}

async function requestEmailCode(email) {
  if (!USE_REAL_EMAIL_CODE || !EMAIL_CODE_FUNCTION_NAME) return false;
  try {
    const sendCode = functions.httpsCallable(EMAIL_CODE_FUNCTION_NAME);
    const result = await sendCode({ email });
    toast(result.data?.message || 'Code gesendet!', 'success');
    return true;
  } catch (e) {
    toast('E-Mail-Code senden fehlgeschlagen: ' + (e.message || e.code), 'error');
    return false;
  }
}

async function verifyEmailCodeRemote(code) {
  if (!USE_REAL_EMAIL_CODE || !EMAIL_CODE_VERIFY_FUNCTION_NAME) return false;
  try {
    const verify = functions.httpsCallable(EMAIL_CODE_VERIFY_FUNCTION_NAME);
    const result = await verify({ code });
    toast(result.data?.message || 'Code bestätigt!', 'success');
    return true;
  } catch (e) {
    console.error('Email verify failed', e);
    return false;
  }
}

function otpMove(input, idx) {
  if (input.value.length === 1 && idx < 5) {
    document.querySelectorAll('.otp-input')[idx + 1].focus();
  }
}

async function verifyOtp() {
  const inputs = document.querySelectorAll('.otp-input');
  const entered = Array.from(inputs).map(i => i.value).join('');
  const err = document.getElementById('otp-error');
  if (entered.length < 6) {
    err.textContent = 'Bitte vollständigen Code eingeben.';
    return;
  }

  if (USE_REAL_EMAIL_CODE) {
    const valid = await verifyEmailCodeRemote(entered);
    if (!valid) {
      err.textContent = 'Falscher Code. Bitte erneut versuchen.';
      return;
    }
  } else {
    if (entered !== otpCode) {
      err.textContent = 'Falscher Code. Bitte erneut versuchen.';
      return;
    }
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(pendingRegistration.email, pendingRegistration.pw);
    await cred.user.updateProfile({ displayName: pendingRegistration.username });
    await db.ref('users/' + cred.user.uid).set({
      username: pendingRegistration.username,
      email: pendingRegistration.email,
      dob: pendingRegistration.dob,
      balance: 500,
      rankedPoints: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      winStreak: 0,
      createdAt: Date.now(),
      lastBonusDaily: 0,
      lastBonusWeekly: 0,
      avatarUrl: '',
      settings: { sound: true, anim: true, streamer: false, currency: 'EUR', notif: true, fastplay: false }
    });
    toast('Konto erstellt! Willkommen! 🎉', 'success');
  } catch (e) {
    err.textContent = getAuthError(e.code);
  }
}

async function logoutUser() {
  await auth.signOut();
  currentUser = null;
  userData = {};
}

function getAuthError(code) {
  const map = {
    'auth/user-not-found': 'Kein Konto mit dieser E-Mail.',
    'auth/wrong-password': 'Falsches Passwort.',
    'auth/email-already-in-use': 'E-Mail wird bereits verwendet.',
    'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
    'auth/weak-password': 'Passwort zu schwach.',
    'auth/too-many-requests': 'Zu viele Versuche. Bitte warten.',
    'auth/popup-closed-by-user': 'Anmeldung abgebrochen.',
  };
  return map[code] || 'Fehler: ' + code;
}

// ===== USER DATA =====
async function loadUserData() {
  if (!currentUser) return;
  const snap = await db.ref('users/' + currentUser.uid).once('value');
  userData = snap.val() || {};
  settings = userData.settings || { sound: true, anim: true, streamer: false, currency: 'EUR', notif: true, fastplay: false };
  currentCurrency = settings.currency || 'EUR';
  streamerMode = settings.streamer || false;
  applySettings();
}

async function saveUserData(updates) {
  if (!currentUser) return;
  await db.ref('users/' + currentUser.uid).update(updates);
  Object.assign(userData, updates);
}

// ===== MENU UI =====
function updateMenuUI() {
  if (!userData) return;
  const name = streamerMode ? '???' : (userData.username || 'Spieler');
  document.getElementById('menu-username').textContent = name;

  const bal = userData.balance || 0;
  document.getElementById('topbar-balance').textContent = streamerMode ? '????' : formatBalance(bal);
  document.getElementById('topbar-currency').textContent = streamerMode ? '' : currencySymbol();

  const rankInfo = getRankInfo(userData.rankedPoints || 0);
  document.getElementById('topbar-rank-icon').textContent = rankInfo.icon;
  document.getElementById('topbar-rank-name').textContent = rankInfo.name;

  const av = document.getElementById('menu-avatar');
  if (userData.avatarUrl) {
    av.innerHTML = `<img src="${userData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    av.textContent = name[0]?.toUpperCase() || '?';
  }

  const now = Date.now();
  const canDaily = (now - (userData.lastBonusDaily || 0)) > 12 * 60 * 60 * 1000;
  const canWeekly = (now - (userData.lastBonusWeekly || 0)) > 7 * 24 * 60 * 60 * 1000;
  const bonusBtn = document.getElementById('bonus-btn');
  bonusBtn.style.display = (canDaily || canWeekly) ? 'flex' : 'none';
}

// ===== BONUSES =====
function checkBonuses() {
  const now = Date.now();
  const canDaily = (now - (userData.lastBonusDaily || 0)) > 12 * 60 * 60 * 1000;
  if (canDaily && settings.notif) {
    toast('🎁 Dein 12h-Bonus wartet auf dich!', 'info');
  }
}

async function claimBonus() {
  const now = Date.now();
  const canDaily = (now - (userData.lastBonusDaily || 0)) > 12 * 60 * 60 * 1000;
  const canWeekly = (now - (userData.lastBonusWeekly || 0)) > 7 * 24 * 60 * 60 * 1000;
  let earned = 0;
  const updates = {};
  if (canDaily) {
    earned += 100;
    updates.lastBonusDaily = now;
  }
  if (canWeekly) {
    earned += 1000;
    updates.lastBonusWeekly = now;
  }
  if (earned > 0) {
    updates.balance = (userData.balance || 0) + earned;
    await saveUserData(updates);
    toast(`+${earned}€ Bonus erhalten! 🎁`, 'success');
    updateMenuUI();
  } else {
    toast('Kein Bonus verfügbar. Komm später wieder!', 'info');
  }
}

// ===== PROFILE =====
function loadProfileData() {
  if (!userData) return;
  const name = userData.username || 'Spieler';
  document.getElementById('profile-display-name').textContent = streamerMode ? '???' : name;
  document.getElementById('profile-avatar-letter').textContent = name[0]?.toUpperCase() || '?';
  document.getElementById('edit-username').value = name;
  document.getElementById('edit-email').value = currentUser?.email || '';
  if (userData.createdAt) {
    document.getElementById('profile-join-date').textContent = 'Mitglied seit ' + new Date(userData.createdAt).toLocaleDateString('de-DE');
  }
  const rankInfo = getRankInfo(userData.rankedPoints || 0);
  document.getElementById('profile-rank-badge').innerHTML = `<span class="tag tag-purple">${rankInfo.icon} ${rankInfo.name}</span>`;

  const games = userData.gamesPlayed || 0;
  const wins = userData.gamesWon || 0;
  document.getElementById('stat-games').textContent = games;
  document.getElementById('stat-wins').textContent = wins;
  document.getElementById('stat-winrate').textContent = games > 0 ? Math.round(wins / games * 100) + '%' : '0%';
  document.getElementById('stat-balance').textContent = streamerMode ? '???€' : formatBalance(userData.balance || 0) + currencySymbol();
  document.getElementById('stat-ranked-points').textContent = userData.rankedPoints || 0;
  document.getElementById('stat-streak').textContent = userData.winStreak || 0;

  if (userData.avatarUrl) {
    document.getElementById('profile-avatar-large').innerHTML = `<img src="${userData.avatarUrl}" style="width:100%;height:100%;object-fit:cover"><div class="avatar-upload-hint">📷 Ändern</div>`;
  }
}

async function saveProfile() {
  const newUsername = document.getElementById('edit-username').value.trim();
  if (!newUsername) {
    toast('Username darf nicht leer sein.', 'error');
    return;
  }
  await saveUserData({ username: newUsername });
  toast('Profil gespeichert!', 'success');
  updateMenuUI();
  loadProfileData();
}

function triggerAvatarUpload() {
  document.getElementById('avatar-file-input').click();
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('Bild max. 2MB', 'error');
    return;
  }
  try {
    const ref = storage.ref('avatars/' + currentUser.uid);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await saveUserData({ avatarUrl: url });
    toast('Profilbild aktualisiert! 📷', 'success');
    loadProfileData();
    updateMenuUI();
  } catch (e) {
    toast('Upload fehlgeschlagen: ' + e.message, 'error');
  }
}

async function changePassword() {
  const old = document.getElementById('old-password').value;
  const newPw = document.getElementById('new-password').value;
  const newPw2 = document.getElementById('new-password2').value;
  const err = document.getElementById('pw-change-error');
  err.textContent = '';
  if (!old || !newPw || !newPw2) {
    err.textContent = 'Alle Felder ausfüllen.';
    return;
  }
  if (newPw !== newPw2) {
    err.textContent = 'Passwörter stimmen nicht überein.';
    return;
  }
  if (newPw.length < 8) {
    err.textContent = 'Neues Passwort min. 8 Zeichen.';
    return;
  }
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, old);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPw);
    toast('Passwort erfolgreich geändert!', 'success');
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('new-password2').value = '';
  } catch (e) {
    err.textContent = getAuthError(e.code) || e.message;
  }
}

// ===== SETTINGS =====
function applySettings() {
  document.getElementById('toggle-streamer').checked = settings.streamer || false;
  document.getElementById('toggle-sound').checked = settings.sound !== false;
  document.getElementById('toggle-anim').checked = settings.anim !== false;
  document.getElementById('toggle-fastplay').checked = settings.fastplay || false;
  document.getElementById('toggle-notif').checked = settings.notif !== false;
  document.getElementById('currency-select').value = settings.currency || 'EUR';
  document.getElementById('streamer-indicator').style.display = settings.streamer ? 'block' : 'none';
  streamerMode = settings.streamer || false;
}

async function saveSettings() {
  settings.streamer = document.getElementById('toggle-streamer').checked;
  settings.sound = document.getElementById('toggle-sound').checked;
  settings.anim = document.getElementById('toggle-anim').checked;
  settings.fastplay = document.getElementById('toggle-fastplay').checked;
  settings.notif = document.getElementById('toggle-notif').checked;
  settings.currency = document.getElementById('currency-select').value;
  streamerMode = settings.streamer;
  document.getElementById('streamer-indicator').style.display = streamerMode ? 'block' : 'none';
  await saveUserData({ settings });
  toast('Einstellungen gespeichert', 'success');
}

async function changeCurrency(val) {
  settings.currency = val;
  currentCurrency = val;
  await saveUserData({ settings });
  toast('Währung geändert', 'info');
  updateMenuUI();
}

function currencySymbol() {
  return currencyRates[currentCurrency] || '€';
}

function formatBalance(amount) {
  const rates = { EUR: 1, USD: 1.09, GBP: 0.86, CHF: 0.98, CHIP: 1 };
  return Math.round(amount * (rates[currentCurrency] || 1));
}

// ===== RANKING =====
const RANKS = [
  { name: 'Unranked', icon: '⬛', min: 0, max: 99 },
  { name: 'Bronze I', icon: '🥉', min: 100, max: 149 },
  { name: 'Bronze II', icon: '🥉', min: 150, max: 199 },
  { name: 'Bronze III', icon: '🥉', min: 200, max: 299 },
  { name: 'Silber I', icon: '🥈', min: 300, max: 399 },
  { name: 'Silber II', icon: '🥈', min: 400, max: 499 },
  { name: 'Silber III', icon: '🥈', min: 500, max: 599 },
  { name: 'Gold I', icon: '🥇', min: 600, max: 749 },
  { name: 'Gold II', icon: '🥇', min: 750, max: 899 },
  { name: 'Gold III', icon: '🥇', min: 900, max: 999 },
  { name: 'Platin I', icon: '💎', min: 1000, max: 1199 },
  { name: 'Platin II', icon: '💎', min: 1200, max: 1349 },
  { name: 'Platin III', icon: '💎', min: 1350, max: 1499 },
  { name: 'Diamant I', icon: '🔷', min: 1500, max: 1699 },
  { name: 'Diamant II', icon: '🔷', min: 1700, max: 1849 },
  { name: 'Diamant III', icon: '🔷', min: 1850, max: 1999 },
  { name: 'Elite', icon: '⚡', min: 2000, max: 2499 },
  { name: 'Champion', icon: '🏆', min: 2500, max: 2999 },
  { name: 'Unreal', icon: '👑', min: 3000, max: 99999 },
];

function getRankInfo(points) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

function updateRankDisplay() {
  const pts = userData.rankedPoints || 0;
  const rank = getRankInfo(pts);
  document.getElementById('my-rank-icon').textContent = rank.icon;
  document.getElementById('my-rank-name').textContent = rank.name;
  document.getElementById('my-rank-points').textContent = pts + ' Punkte';
  const progress = Math.min(100, Math.round((pts - rank.min) / (rank.max - rank.min + 1) * 100));
  document.getElementById('rank-progress-bar').style.width = progress + '%';
  const nextRank = RANKS.find(r => r.min > pts);
  document.getElementById('rank-progress-text').textContent = nextRank ? `${pts} / ${nextRank.min} für ${nextRank.name}` : 'Höchster Rang!';
}

async function loadLeaderboard() {
  const snap = await db.ref('users').orderByChild('rankedPoints').limitToLast(10).once('value');
  const list = [];
  snap.forEach(child => {
    const d = child.val();
    list.push({ uid: child.key, username: d.username, rankedPoints: d.rankedPoints || 0, rank: getRankInfo(d.rankedPoints || 0) });
  });
  list.sort((a, b) => b.rankedPoints - a.rankedPoints);
  const container = document.getElementById('leaderboard-list');
  if (!list.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim)">Noch keine Spieler</div>';
    return;
  }
  container.innerHTML = list.map((p, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    return `<div class="leaderboard-row">
      <span class="pos">${medals[i] || '#' + (i + 1)}</span>
      <div class="lb-avatar">${p.username[0]?.toUpperCase() || '?'}</div>
      <div class="lb-info"><strong>${p.username}</strong><span>${p.rank.icon} ${p.rank.name}</span></div>
      <span class="lb-points">${p.rankedPoints} Pkt</span>
    </div>`;
  }).join('');
}

// ===== LOBBY =====
function showLobby(type) {
  showScreen('lobby-screen');
  document.getElementById('public-lobby').style.display = 'none';
  document.getElementById('private-lobby').style.display = 'none';

  if (type === 'public') {
    document.getElementById('lobby-title').textContent = 'Öffentliche Tische';
    document.getElementById('public-lobby').style.display = 'flex';
    loadPublicTables();
  } else {
    document.getElementById('lobby-title').textContent = 'Privater Tisch';
    document.getElementById('private-lobby').style.display = 'flex';
  }

  document.getElementById('lobby-balance').textContent = streamerMode ? '????' : formatBalance(userData.balance || 0);
  document.getElementById('lobby-currency').textContent = streamerMode ? '' : currencySymbol();
}

async function loadPublicTables() {
  await cleanupExpiredRooms();
  const snap = await db.ref('publicTables').orderByChild('status').equalTo('waiting').once('value');
  const list = [];
  snap.forEach(c => list.push({ id: c.key, ...c.val() }));
  const container = document.getElementById('public-tables-list');

  const fp = document.getElementById('filter-players').value;
  const fb = document.getElementById('filter-buyin').value;
  const filtered = list.filter(t => {
    if ((t.players || 0) >= t.maxPlayers) return false;
    if (fp && t.maxPlayers != fp) return false;
    if (fb && t.buyIn < parseInt(fb)) return false;
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">🃏 Keine offenen Tische gefunden.<br>Erstelle den ersten oder ändere die Filter.</div>';
    return;
  }
  container.innerHTML = filtered.map(t => `
    <div class="table-item" onclick="joinPublicTable('${t.id}')">
      <div class="table-icon">🎰</div>
      <div class="table-info">
        <strong>${t.name || 'Tisch'}</strong>
        <span>Blinds: ${t.smallBlind || 10}/${(t.smallBlind || 10) * 2} • Buy-in: ${t.buyIn || 100}€</span>
      </div>
      <div class="table-meta">
        <span class="tag tag-green">${t.players || 0}/${t.maxPlayers || 4}</span>
        <span class="tag tag-purple">${t.status === 'waiting' ? 'Wartend' : 'Voll'}</span>
      </div>
    </div>
  `).join('');
}

async function createPublicTable() {
  if (!currentUser) {
    toast('Nicht eingeloggt', 'error');
    return;
  }
  const name = document.getElementById('pub-table-name').value || userData.username + "'s Tisch";
  const maxPlayers = parseInt(document.getElementById('pub-max-players').value);
  const buyIn = parseInt(document.getElementById('pub-buyin').value);
  const smallBlind = parseInt(document.getElementById('pub-smallblind').value);

  if ((userData.balance || 0) < buyIn) {
    toast('Nicht genug Guthaben!', 'error');
    return;
  }

  const ref = db.ref('publicTables').push();
  await ref.set({
    name, maxPlayers, buyIn, smallBlind,
    status: 'waiting',
    players: 1,
    hostId: currentUser.uid,
    hostName: userData.username,
    createdAt: Date.now(),
    lastActive: Date.now(),
    deleteAt: null
  });
  toast('Tisch erstellt!', 'success');
  startOnlineGame(ref.key, 'public', { maxPlayers, buyIn, smallBlind });
}

async function joinPublicTable(tableId) {
  if (!currentUser) {
    toast('Nicht eingeloggt', 'error');
    return;
  }
  const ref = db.ref('publicTables/' + tableId);
  const snap = await ref.once('value');
  if (!snap.exists()) {
    toast('Tisch nicht gefunden', 'error');
    return;
  }
  const room = snap.val();
  if (room.status !== 'waiting' || (room.players || 0) >= room.maxPlayers) {
    toast('Tisch kann nicht beigetreten werden.', 'error');
    return;
  }
  await ref.update({
    players: (room.players || 0) + 1,
    lastActive: Date.now(),
    deleteAt: null
  });
  toast('Tisch beigetreten!', 'success');
  startOnlineGame(tableId, 'public', room);
}

async function createPrivateRoom() {
  if (!currentUser) {
    toast('Nicht eingeloggt', 'error');
    return;
  }
  const maxPlayers = parseInt(document.getElementById('priv-max-players').value);
  const buyIn = parseInt(document.getElementById('priv-buyin').value);
  const blindsStr = document.getElementById('priv-blinds').value;
  const [sb] = blindsStr.split('/').map(Number);

  if ((userData.balance || 0) < buyIn) {
    toast('Nicht genug Guthaben!', 'error');
    return;
  }

  const code = Math.random().toString(36).substr(2, 6).toUpperCase();
  const pass = Math.floor(1000 + Math.random() * 9000).toString();

  await db.ref('privateTables/' + code).set({
    code, pass, maxPlayers, buyIn, smallBlind: sb,
    hostId: currentUser.uid,
    hostName: userData.username,
    status: 'waiting',
    players: 1,
    createdAt: Date.now(),
    lastActive: Date.now(),
    deleteAt: null
  });

  document.getElementById('created-room-code').textContent = code;
  document.getElementById('created-room-pass').textContent = pass;
  document.getElementById('room-created-modal').classList.add('visible');
  window._pendingPrivateGame = { code, maxPlayers, buyIn, smallBlind: sb };
}

async function joinPrivateRoom() {
  if (!currentUser) {
    toast('Nicht eingeloggt', 'error');
    return;
  }
  const code = document.getElementById('join-room-code').value.toUpperCase().trim();
  const pass = document.getElementById('join-room-pass').value.trim();
  if (!code || !pass) {
    toast('Code und Passwort eingeben', 'error');
    return;
  }
  const ref = db.ref('privateTables/' + code);
  const snap = await ref.once('value');
  if (!snap.exists()) {
    toast('Raum nicht gefunden', 'error');
    return;
  }
  const room = snap.val();
  if (room.pass !== pass) {
    toast('Falsches Passwort', 'error');
    return;
  }
  if (room.status !== 'waiting' || (room.players || 0) >= room.maxPlayers) {
    toast('Raum ist voll oder bereits gestartet.', 'error');
    return;
  }
  await ref.update({
    players: (room.players || 0) + 1,
    lastActive: Date.now(),
    deleteAt: null
  });
  toast('Raum beigetreten!', 'success');
  startOnlineGame(code, 'private', room);
}

function copyRoomCode() {
  navigator.clipboard.writeText(document.getElementById('created-room-code').textContent);
  toast('Code kopiert!', 'success');
}

function startPrivateGame() {
  closeModal('room-created-modal');
  const g = window._pendingPrivateGame;
  if (g) startOnlineGame(g.code, 'private', g);
}

async function deletePrivateRoom() {
  const pending = window._pendingPrivateGame;
  if (!pending || !currentUser) {
    toast('Kein Raum zum Löschen vorhanden.', 'error');
    return;
  }
  const ref = db.ref('privateTables/' + pending.code);
  const snap = await ref.once('value');
  if (!snap.exists()) {
    toast('Raum wurde bereits entfernt.', 'info');
  } else {
    const room = snap.val();
    if (room.hostId !== currentUser.uid) {
      toast('Nur der Ersteller kann den Raum löschen.', 'error');
      return;
    }
    await ref.remove();
    toast('Privater Raum gelöscht.', 'success');
  }
  closeModal('room-created-modal');
  window._pendingPrivateGame = null;
}

async function updateRoomActivity(tableId, type) {
  if (!tableId) return;
  const path = type === 'public' ? 'publicTables/' + tableId : 'privateTables/' + tableId;
  const ref = db.ref(path);
  const snap = await ref.once('value');
  if (!snap.exists()) return;
  const room = snap.val();
  const updates = { lastActive: Date.now(), deleteAt: null };
  if ((room.players || 0) >= room.maxPlayers) updates.status = 'active';
  await ref.update(updates);
}

async function cleanupExpiredRooms() {
  const now = Date.now();
  const publicSnap = await db.ref('publicTables').orderByChild('deleteAt').endAt(now).once('value');
  publicSnap.forEach(child => {
    const room = child.val();
    if ((room.players || 0) === 0 && room.deleteAt && room.deleteAt <= now) {
      db.ref('publicTables/' + child.key).remove();
    }
  });
  const privateSnap = await db.ref('privateTables').orderByChild('deleteAt').endAt(now).once('value');
  privateSnap.forEach(child => {
    const room = child.val();
    if ((room.players || 0) === 0 && room.deleteAt && room.deleteAt <= now) {
      db.ref('privateTables/' + child.key).remove();
    }
  });
}

async function scheduleRoomCleanup(tableId, type) {
  setTimeout(async () => {
    const path = type === 'public' ? 'publicTables/' + tableId : 'privateTables/' + tableId;
    const ref = db.ref(path);
    const snap = await ref.once('value');
    const room = snap.val();
    if (!room) return;
    if ((room.players || 0) === 0 && room.deleteAt && room.deleteAt <= Date.now()) {
      ref.remove();
    }
  }, 30000);
}

function showLobbyScreen() {
  showScreen('lobby-screen');
}

// ===== RANKED =====
function startRankedGame() {
  document.getElementById('ranked-info-modal').classList.add('visible');
}

function confirmRanked() {
  closeModal('ranked-info-modal');
  gameMode = 'ranked';
  initGame('ranked');
}

// ===== GAME INITIALIZATION =====
function startLocalGame() {
  gameMode = 'local';
  initGame('local');
}

async function startOnlineGame(tableId, type, config) {
  gameMode = type;
  currentRoom = { id: tableId, type, config };
  await updateRoomActivity(tableId, type);
  // For now, run a local simulation for online tables
  initGame(type, config);
}

function startBlackjack() {
  gameMode = 'blackjack';
  initBlackjack();
}

function startRankedBlackjack() {
  gameMode = 'ranked-blackjack';
  initBlackjack();
}

// ===== MODAL =====
function closeModal(id) {
  document.getElementById(id).classList.remove('visible');
}

// ===== UTILITIES =====
function el(id) {
  return document.getElementById(id);
}

// Init on load
window.addEventListener('load', () => {
  // Auth state listener handles everything
});
