/* =========================================================
   PARTITION: TELEGRAM / BUS-NEAR ALERTS (DEMO)
   ---------------------------------------------------------
   - linkTelegram(): saves Student ID ↔ Telegram Chat ID
     (POST save_telegram.php, localStorage fallback for demo)
   - startBusSimulation(): moves a 🚌 marker along the route
     polyline; when it comes within 500m of YOU (live GPS,
     else the route start) shows an in-page alert + the exact
     Telegram text the server would send on deploy.
   - Real send path: driver posts GPS to bus_location.php,
     server cron calls notify_nearby.php (works with browser
     closed). Needs bot token in api/telegram_config.php.
   ========================================================= */

const TG_NEARBY_M = 500;
let tgSimTimer = null;
let tgSimSeg = 0;
let tgSimFrac = 0;
let tgSimPath = [];
let tgSimMarker = null;
let tgNotifiedKey = null;

function tgStorageKey() {
  const uid = (typeof sessionUsername === 'function') ? sessionUsername() : (currentUser && (currentUser.username || currentUser.student_id));
  return uid ? ('uiu_bus_tg_' + uid) : null;
}

function syncTelegramField() {
  const input = document.getElementById('telegram-chat-id');
  if (!input) return;
  try {
    const k = tgStorageKey();
    if (k && !input.value) input.value = localStorage.getItem(k) || '';
  } catch {}
}

function initTelegram() {
  syncTelegramField();
  initLoginTgPrefill();
  const linkBtn = document.getElementById('telegram-link-btn');
  if (linkBtn) linkBtn.addEventListener('click', linkTelegram);
  const simBtn = document.getElementById('sim-bus-btn');
  if (simBtn) simBtn.addEventListener('click', startBusSimulation);
}

/* One-time link: typing a known Student ID on the login page
   auto-fills the saved Chat ID — user links once, never again. */
function initLoginTgPrefill() {
  const idInput = document.getElementById('login-page-id');
  const tgInput = document.getElementById('login-page-tg');
  if (!idInput || !tgInput) return;
  idInput.addEventListener('input', () => {
    try {
      const sid = (idInput.value || '').trim();
      if (sid && !tgInput.value) tgInput.value = localStorage.getItem('uiu_bus_tg_' + sid) || '';
    } catch {}
  });
}

/* Core link used by login (one-time). Safe to call repeatedly:
   the server only sends the confirmation on the FIRST link. */
async function linkTelegramWithId(studentId, chatId) {
  if (!studentId || !chatId) return 'missing';
  const key = 'uiu_bus_tg_' + studentId;
  try { localStorage.setItem(key, chatId); } catch {}
  try {
    const res = await fetch(`${API_BASE}save_telegram.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, chat_id: chatId })
    });
    const data = await res.json().catch(() => ({}));
    if (!(res.ok && data.success)) return 'local';
    if (data.telegram_sent) return 'linked+sent';
    return (data.is_new === false) ? 'already' : 'linked';
  } catch {
    return 'local';
  }
}

async function linkTelegram() {
  const input = document.getElementById('telegram-chat-id');
  const status = document.getElementById('telegram-link-status');
  const chatId = (input?.value || '').trim();
  if (!isLoggedIn()) { if (status) status.innerText = 'Login first.'; return; }
  if (!chatId) { if (status) status.innerText = 'Paste your Chat ID first.'; return; }
  const studentId = (typeof sessionUsername === 'function') ? sessionUsername() : currentUser.username;
  const msg = await linkTelegramWithId(studentId, chatId);
  if (status) {
    status.innerText =
      msg === 'already' ? 'Already linked — nothing to do.' :
      msg === 'linked+sent' ? 'Linked — check your Telegram.' :
      msg === 'linked' ? 'Linked — alerts ON.' :
      'Saved (one-time) — will activate on server.';
  }
}

function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const dLa = rad(bLat - aLat), dLo = rad(bLng - aLng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function tgToast(text) {
  let el = document.getElementById('telegram-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'telegram-toast';
    document.body.appendChild(el);
  }
  el.innerText = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 8000);
}


let tgLastLocationPost = 0;

async function saveTelegramUserLocation(lat, lng, accuracy) {
  // ETA alerts are student-only: never pollute user_locations with driver fixes.
  if (!currentUser || currentUser.role !== 'STUDENT') return;
  const sid = (typeof sessionUsername === 'function') ? sessionUsername() : (currentUser && currentUser.username);
  if (!sid) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  // Skip wildly inaccurate fixes (>100m) — keep last good fix for precise ETA.
  if (Number.isFinite(accuracy) && accuracy > 100) return;
  const now = Date.now();
  if (now - tgLastLocationPost < 15000) return;
  tgLastLocationPost = now;
  try {
    await fetch(`${API_BASE}user_location.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: sid,
        lat,
        lng,
        accuracy: Number.isFinite(accuracy) ? accuracy : null
      })
    });
  } catch (err) {
    console.warn('Could not save location for ETA alerts.', err);
  }
}

function tgUserPosition() {
  try {
    if (typeof liveUserMarker !== 'undefined' && liveUserMarker && typeof liveMap !== 'undefined' && liveMap) {
      const p = liveUserMarker.getLatLng();
      return { lat: p.lat, lng: p.lng, src: 'your live location' };
    }
  } catch {}
  const r = (typeof busRoutes !== 'undefined') ? busRoutes[currentRoute] : null;
  const path = (typeof liveRouteData !== 'undefined' && liveRouteData[currentRoute]) ? liveRouteData[currentRoute].path : null;
  if (path && path.length) return { lat: path[0].lat, lng: path[0].lng, src: 'boarding area' };
  if (r) return { lat: 23.7966, lng: 90.4495, src: 'campus' };
  return null;
}

async function startBusSimulation() {
  const status = document.getElementById('bus-sim-status');
  if (typeof liveMap === 'undefined' || !liveMap || typeof liveRouteData === 'undefined' || !liveRouteData[currentRoute]) {
    if (status) status.innerText = 'Open the page over http (not file://) so the map loads first.';
    return;
  }
  if (tgSimTimer) {
    clearInterval(tgSimTimer); tgSimTimer = null;
    if (status) status.innerText = 'Simulation stopped.';
    return;
  }

  const route = liveRouteData[currentRoute];
  const roadPath = (typeof getRoadRoute === 'function') ? await getRoadRoute(currentRoute) : route.path;
  if (!roadPath || roadPath.length < 2) {
    if (status) status.innerText = 'Could not load the road route.';
    return;
  }

  tgSimPath = roadPath;
  tgSimSeg = 0;
  tgSimFrac = 0;
  tgNotifiedKey = null;
  if (tgSimMarker) { try { liveMap.removeLayer(tgSimMarker); } catch {} tgSimMarker = null; }
  const btn = document.getElementById('sim-bus-btn');
  if (btn) btn.innerText = 'Stop Simulation';
  if (status) status.innerText = 'Demo bus following the roads…';

  tgSimTimer = setInterval(() => {
    const a = tgSimPath[tgSimSeg];
    const b = tgSimPath[Math.min(tgSimSeg + 1, tgSimPath.length - 1)];
    const lat = a.lat + (b.lat - a.lat) * tgSimFrac;
    const lng = a.lng + (b.lng - a.lng) * tgSimFrac;
    tgSimFrac += 0.08;
    if (tgSimFrac >= 1) { tgSimFrac = 0; tgSimSeg++; }
    if (tgSimSeg >= tgSimPath.length - 1) { tgSimSeg = 0; tgSimFrac = 0; }

    if (!tgSimMarker) {
      tgSimMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'bus-sim-icon', html: '🚌', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(liveMap).bindPopup('Demo bus (simulated road route)');
    } else tgSimMarker.setLatLng([lat, lng]);

    const you = tgUserPosition();
    if (you) {
      const d = Math.round(haversineM(lat, lng, you.lat, you.lng));
      if (status) status.innerText = `Demo bus ${d}m from ${you.src}. Alert at ≤${TG_NEARBY_M}m.`;
      const key = ((typeof sessionUsername === 'function') ? sessionUsername() : 'guest') + '_' + currentRoute;
      if (d <= TG_NEARBY_M && tgNotifiedKey !== key) {
        tgNotifiedKey = key;
        const msg = `🚌 Your UIU bus (${currentRoute}) is near ${you.src} (~${d}m). Seat ${selectedSeatsList[0] || '—'} — please be ready.`;
        tgToast(msg + (currentTripId === -1 ? ' [Demo preview — real Telegram send works after XAMPP deploy + bot token.]' : ''));
      }
    } else if (status) status.innerText = 'Demo bus moving…';
  }, 1200);
}
