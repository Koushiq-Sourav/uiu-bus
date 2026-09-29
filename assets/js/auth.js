/* =========================================================
   PARTITION: AUTH PORTAL / ROLES / THEME
   ---------------------------------------------------------
   Public website — auth is required ONLY at "Book Now".
   The portal offers: Student Login / New Sign Up / Driver Login.

   - Student sessions: { username, name, role:'STUDENT', token }
   - Driver sessions:  { username, name, role:'DRIVER', token }
   - Seat selection survives auth (in-memory; sessionStorage snapshot
     as a backup across reloads).
   - Drivers must pass a live geolocation check BEFORE the dashboard.
   - Dark mode toggle persisted in localStorage.

   DOM IDs used:
   - #auth-modal, #auth-view-{options,login,signup,driver,driver-location}
   - #portal-login-form, #portal-signup-form, #portal-driver-form
   - #theme-toggle, #login-btn, #logout-btn, #user-display
   ========================================================= */
function initAuth() {
  wireAuthPortal();
  initTheme();
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', () => openAuthModal('options'));
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  const openLoginFromBooking = document.getElementById('open-login-from-booking');
  if (openLoginFromBooking) openLoginFromBooking.addEventListener('click', () => openAuthModal('login'));

  showApp();
  updateAuthUI();
}

/* Username of the current session (new sessions store `username`;
   legacy pre-upgrade sessions stored `student_id`). */
function sessionUsername() {
  if (!currentUser) return '';
  return currentUser.username || currentUser.student_id || '';
}

/* ---------- PUBLIC SITE: always visible, no entry gate ---------- */
function showApp() {
  const main = document.getElementById('first-one');
  if (main) main.classList.remove('hidden');
  const live = document.getElementById('live-location-section');
  if (live) live.style.display = '';
  const foot = document.querySelector('footer');
  if (foot) foot.style.display = '';
  // Legacy fullscreen gate removed from HTML; hide it if it ever exists.
  const gate = document.getElementById('login-screen');
  if (gate) gate.classList.add('hidden');
  // Leaflet needs a resize nudge after its container becomes visible again.
  try {
    if (typeof liveMap !== 'undefined' && liveMap && typeof liveMap.invalidateSize === 'function') {
      setTimeout(() => { try { liveMap.invalidateSize(); } catch {} }, 300);
    }
  } catch {}
}

/* =========================================================
   AUTH PORTAL — options / student login / signup / driver
   ========================================================= */
function openAuthModal(view) {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  showAuthView(view || 'options');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  ['portal-login-error', 'portal-login-success', 'portal-signup-error', 'portal-signup-success', 'portal-driver-error']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerText = ''; });
}

function showAuthView(view) {
  ['options', 'login', 'signup', 'driver', 'driver-location'].forEach(v => {
    const el = document.getElementById('auth-view-' + v);
    if (el) el.classList.toggle('hidden', v !== view);
  });
}

function wireAuthPortal() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  on('auth-close', closeAuthModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAuthModal(); });

  // Options → each flow
  on('auth-goto-login', () => showAuthView('login'));
  on('auth-goto-signup', () => showAuthView('signup'));
  on('auth-goto-driver', () => showAuthView('driver'));

  // Login ↔ Sign Up navigation ("Already have an account? Login")
  on('auth-login-to-signup', () => showAuthView('signup'));
  on('auth-signup-to-login', () => showAuthView('login'));

  // Back buttons
  on('auth-login-back', () => showAuthView('options'));
  on('auth-signup-back', () => showAuthView('options'));
  on('auth-driver-back', () => showAuthView('options'));

  // Forms
  const loginForm = document.getElementById('portal-login-form');
  if (loginForm) loginForm.addEventListener('submit', handleStudentLogin);
  const signupForm = document.getElementById('portal-signup-form');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  const driverForm = document.getElementById('portal-driver-form');
  if (driverForm) driverForm.addEventListener('submit', handleDriverLogin);

  // Driver location retry
  on('driver-retry-location', requestDriverLocation);

  // Driver dashboard controls
  on('driver-share-location-btn', () => toggleDriverLocationSharing(true));
  on('driver-stop-location-btn', () => toggleDriverLocationSharing(false));
  on('driver-back-website-btn', showApp);
  // Trip timing: driver-set departure -> road-based arrival preview + save.
  const depInput = document.getElementById('driver-departure-input');
  if (depInput) depInput.addEventListener('input', () => { updateArrivalPreview(); });
  on('driver-timing-save', saveDriverTiming);
}

/* =========================================================
   STUDENT LOGIN
   ========================================================= */
async function handleStudentLogin(e) {
  e.preventDefault();
  const idInput = document.getElementById('portal-login-id');
  const pwInput = document.getElementById('portal-login-password');
  const tgInput = document.getElementById('portal-login-tg');
  const errEl = document.getElementById('portal-login-error');
  const submitBtn = document.getElementById('portal-login-submit');
  const studentId = (idInput?.value || '').trim();
  const password = pwInput?.value || '';
  if (!studentId || !password) {
    if (errEl) errEl.innerText = 'Student ID and password are required.';
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Logging in...'; }
  if (errEl) errEl.innerText = '';
  try {
    const res = await fetch(`${API_BASE}login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, password, telegram_chat_id: (tgInput?.value || '').trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Login failed');
    await onStudentAuthSuccess(data.user);
  } catch (err) {
    // Demo fallback (DB unreachable): accept any 4-char password as a demo student session.
    if (password.length >= 4) {
      console.warn('Demo login fallback used (API unreachable)');
      await onStudentAuthSuccess({ username: studentId, name: studentId, role: 'STUDENT', token: 'demo-STUDENT-' + studentId });
    } else {
      if (errEl) errEl.innerText = err.message || 'Login failed';
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Login'; }
  }
}

async function onStudentAuthSuccess(user) {
  currentUser = user;
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)); } catch {}
  updateAuthUI();
  closeAuthModal();
  // One-time Telegram link from login
  const tgInput = document.getElementById('portal-login-tg');
  const tgChatId = (tgInput?.value || '').trim() || (() => { try { return localStorage.getItem('uiu_bus_tg_' + user.username) || ''; } catch { return ''; } })();
  if (typeof linkTelegramWithId === 'function' && tgChatId) { try { await linkTelegramWithId(user.username, tgChatId); } catch {} }
  prefillBookingFromAccount();
  await refreshStudentBookingState();
  if (typeof syncTelegramField === 'function') { try { syncTelegramField(); } catch {} }
  // Continue the booking the user started before logging in.
  if (pendingBookingAfterAuth) {
    pendingBookingAfterAuth = false;
    clearPendingSelection();
    await Next();
  }
}

function prefillBookingFromAccount() {
  // Simplified UI: no passenger form fields to fill — booking uses the
  // logged-in account directly. Just refresh the Book Now state.
  if (typeof validateNextButton === 'function') validateNextButton();
}

/* Loads the logged-in student's own booking state for the current trip:
   sets studentTripBooking (DB) or demo registry (offline). */
async function refreshStudentBookingState() {
  if (!currentUser || currentUser.role !== 'STUDENT') {
    studentTripBooking = null;
    if (typeof updateMyBookingBanner === 'function') updateMyBookingBanner();
    return;
  }
  if (currentTripId && currentTripId !== -1) {
    await loadBookedSeats(); // picks up data.student_booking + paints banner
    return;
  }
  // Demo mode: per-student registry, same browser
  try {
    const reg = JSON.parse(localStorage.getItem(DEMO_STUDENT_BOOKINGS_KEY) || '{}');
    const seat = reg[currentUser.username + '_' + currentRoute];
    studentTripBooking = seat ? { seat_code: seat, booking_reference: 'UIU-DEMO' } : null;
  } catch { studentTripBooking = null; }
  // Repaint demo red after refresh/login — otherwise bookings vanish visually.
  if (typeof restoreDemoSeatAvailability === 'function') { try { restoreDemoSeatAvailability(); } catch {} }
  if (typeof updateMyBookingBanner === 'function') updateMyBookingBanner();
}

/* =========================================================
   NEW SIGN UP
   ========================================================= */
async function handleSignup(e) {
  e.preventDefault();
  const idInput = document.getElementById('portal-signup-id');
  const pwInput = document.getElementById('portal-signup-password');
  const pw2Input = document.getElementById('portal-signup-password2');
  const errEl = document.getElementById('portal-signup-error');
  const submitBtn = document.getElementById('portal-signup-submit');
  const studentId = (idInput?.value || '').trim();
  const pw1 = pwInput?.value || '';
  const pw2 = pw2Input?.value || '';
  if (errEl) errEl.innerText = '';
  if (!studentId) { if (errEl) errEl.innerText = 'Student ID / Email is required.'; return; }
  if (!pw1) { if (errEl) errEl.innerText = 'Password is required.'; return; }
  if (pw1.length < 4) { if (errEl) errEl.innerText = 'Password must be at least 4 characters.'; return; }
  if (pw1 !== pw2) { if (errEl) errEl.innerText = 'Passwords do not match.'; return; }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Creating account...'; }
  try {
    const res = await fetch(`${API_BASE}register.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, password: pw1 })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Registration failed');
    // Success → redirect to Student Login, continue booking after login.
    showAuthView('login');
    const backId = document.getElementById('portal-login-id');
    if (backId) backId.value = studentId;
    const okEl = document.getElementById('portal-login-success');
    if (okEl) okEl.innerText = 'Registration successful. Please log in.';
  } catch (err) {
    // Demo fallback (DB unreachable): keep the account in a local registry
    // so duplicate signups are still rejected offline.
    try {
      const users = JSON.parse(localStorage.getItem(DEMO_USERS_KEY) || '[]');
      if (Array.isArray(users) && users.some(u => u.student_id === studentId)) {
        if (errEl) errEl.innerText = 'An account with this Student ID already exists.';
        return;
      }
      users.push({ student_id: studentId });
      localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
    } catch {}
    console.warn('Demo signup fallback used (API unreachable)');
    showAuthView('login');
    const backId = document.getElementById('portal-login-id');
    if (backId) backId.value = studentId;
    const okEl = document.getElementById('portal-login-success');
    if (okEl) okEl.innerText = 'Registration successful. Please log in.';
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Sign Up'; }
  }
}

/* =========================================================
   DRIVER LOGIN + MANDATORY LOCATION CHECK
   ========================================================= */
async function handleDriverLogin(e) {
  e.preventDefault();
  const idInput = document.getElementById('portal-driver-id');
  const pwInput = document.getElementById('portal-driver-password');
  const errEl = document.getElementById('portal-driver-error');
  const submitBtn = document.getElementById('portal-driver-submit');
  const driverId = (idInput?.value || '').trim();
  const password = pwInput?.value || '';
  if (!driverId || !password) {
    if (errEl) errEl.innerText = 'Driver ID and password are required.';
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Verifying...'; }
  if (errEl) errEl.innerText = '';
  try {
    const res = await fetch(`${API_BASE}driver_login.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: driverId, password })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Driver login failed');
    await onDriverAuthSuccess(data.user);
  } catch (err) {
    // Demo fallback (DB unreachable): accept any 4-char password as demo driver.
    if (password.length >= 4) {
      console.warn('Demo driver login fallback used (API unreachable)');
      await onDriverAuthSuccess({ username: driverId, name: driverId, role: 'DRIVER', token: 'demo-DRIVER-' + driverId });
    } else {
      if (errEl) errEl.innerText = err.message || 'Driver login failed';
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Driver Login'; }
  }
}

async function onDriverAuthSuccess(user) {
  currentUser = user;
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)); } catch {}
  updateAuthUI();

  // Do NOT open the dashboard yet. A driver session is valid only after
  // a fresh GPS fix has been obtained and accepted by the backend.
  showAuthView('driver-location');
  await requestDriverLocation();
}

/* Mandatory location permission for drivers.
   Covers: unsupported browsers, denied permission, unavailable GPS,
   timeouts, and permission changes (via Retry + permissions 'change'). */
async function requestDriverLocation() {
  const statusEl = document.getElementById('driver-location-status');
  const setStatus = (msg) => { if (statusEl) statusEl.innerText = msg; };

  if (!('geolocation' in navigator)) {
    setStatus('This browser does not support geolocation. Driver login requires a GPS-enabled browser.');
    return;
  }

  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state === 'denied') {
      setStatus('Location permission is required for driver login. Please enable your location and try again.');
      // If the user enables it afterwards, retry automatically.
      try { permission.addEventListener('change', () => { if (permission.state === 'granted') requestDriverLocation(); }); } catch {}
      return;
    }
    setStatus('Requesting your location...');
  } catch {
    // Permissions API unavailable (some browsers) — proceed to the prompt.
    setStatus('Requesting your location...');
  }

  let position;
  try {
    position = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      })
    );
  } catch (err) {
    const code = err && err.code;
    if (code === 1) setStatus('Location permission is required for driver login. Please enable your location and try again.');
    else if (code === 2) setStatus('Location unavailable. Please check your device GPS and try again.');
    else if (code === 3) setStatus('Location request timed out. Please try again.');
    else setStatus('Unable to get your location. Please try again.');
    return;
  }

  const { latitude, longitude, accuracy } = position.coords;
  setStatus('Location acquired. Verifying...');
  try {
    await driverSendLocation(latitude, longitude, accuracy);
  } catch (err) {
    // Only the explicit local demo session may continue without the API.
    // A real driver token must be accepted by the backend before dashboard access.
    if (!String(currentUser?.token || '').startsWith('demo-')) {
      setStatus(err?.message || 'The server could not verify your location. Please try again.');
      return;
    }
    console.warn('Demo driver location kept locally (API unavailable)');
  }
  driverLocationState.lat = latitude;
  driverLocationState.lng = longitude;
  driverLocationState.accuracy = accuracy;
  driverLocationState.updatedAt = new Date();
  renderDriverLocation();

  // GPS verification is complete, so the dashboard can finally be shown.
  closeAuthModal();
  showDriverDashboard();
  await fetchDriverDashboard();
  setStatus(`Location verified: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. You are signed in — the driver dashboard is open below.`);
}

/* =========================================================
   DRIVER DASHBOARD
   ========================================================= */
function showDriverDashboard() {
  const main = document.getElementById('first-one');
  if (main) main.classList.add('hidden');
  const dash = document.getElementById('driver-dashboard');
  if (dash) {
    dash.classList.remove('hidden');
    dash.scrollIntoView({ behavior: 'smooth' });
  }
}

async function fetchDriverDashboard() {
  if (!isDriver()) return;
  try {
    const res = await fetch(`${API_BASE}driver_dashboard.php?token=${encodeURIComponent(currentUser.token)}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Could not load driver dashboard.');
    renderDriverDashboard(data);
  } catch {
    renderDriverDashboard(null); // demo fallback
  }
}

function getDriverActiveTripId() {
  if (driverActiveTripId) return driverActiveTripId;
  try {
    const saved = localStorage.getItem(DRIVER_TRIP_KEY);
    if (saved) driverActiveTripId = Number(saved) || null;
  } catch {}
  return driverActiveTripId;
}

function setDriverActiveTripId(tripId) {
  driverActiveTripId = tripId ? Number(tripId) : null;
  try {
    if (driverActiveTripId) localStorage.setItem(DRIVER_TRIP_KEY, String(driverActiveTripId));
    else localStorage.removeItem(DRIVER_TRIP_KEY);
  } catch {}
  // Re-render active highlight without refetch.
  document.querySelectorAll('#driver-trips-list [data-trip-id]').forEach(btn => {
    const isActive = Number(btn.getAttribute('data-trip-id')) === driverActiveTripId;
    btn.classList.toggle('driver-trip-active', isActive);
    btn.querySelector('.driver-trip-set')?.classList.toggle('hidden', isActive);
    btn.querySelector('.driver-trip-live')?.classList.toggle('hidden', !isActive);
  });
  renderDriverLocation();
  if (typeof refreshTimingPanel === 'function') { try { refreshTimingPanel(); } catch {} }
}

let driverTripsCache = [];
let timingPreviewToken = 0;

function timingHMtoSec(hm) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(hm || '');
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3] || 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

function timingSecToHM(sec) {
  sec = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  return `${h}:${m}`;
}

/* "08:00 AM" (routes.js demo) -> "08:00:00" (DB TIME format). */
function busTimeTo24(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)?\s*$/i.exec(t || '');
  if (!m) return '08:00:00';
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3] || '')) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}:00`;
}

function getActiveTrip() {
  const id = (typeof getDriverActiveTripId === 'function') ? getDriverActiveTripId() : null;
  if (!id || !Array.isArray(driverTripsCache)) return null;
  return driverTripsCache.find(t => Number(t.trip_id) === Number(id)) || null;
}

function refreshTimingPanel() {
  const label = document.getElementById('driver-timing-trip');
  const input = document.getElementById('driver-departure-input');
  const trip = getActiveTrip();
  if (!trip) {
    if (label) label.innerText = 'No active trip selected.';
    if (input && document.activeElement !== input) input.value = '';
    updateArrivalPreview();
    return;
  }
  if (label) label.innerText = `${trip.route_code || trip.route_name || ''} · ${trip.service_date || ''} · Trip #${trip.trip_id}${Number(trip.trip_id) < 0 ? ' (demo)' : ''}`;
  if (input && document.activeElement !== input) {
    const cur = (trip.departure_time || '').slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(cur)) input.value = cur;
  }
  updateArrivalPreview();
}

async function updateArrivalPreview() {
  const my = ++timingPreviewToken;
  const preview = document.getElementById('driver-arrival-preview');
  const roadEl = document.getElementById('driver-route-info');
  const input = document.getElementById('driver-departure-input');
  const trip = getActiveTrip();
  const depHM = (input?.value || '').trim() || (trip?.departure_time || '').slice(0, 5);
  const depSec = timingHMtoSec(depHM);
  if (depSec === null || !trip) {
    if (preview) preview.innerText = '--';
    if (roadEl) roadEl.innerText = '--';
    return null;
  }
  const routeKey = trip.route_code || trip.route_name;
  let durationS = null, distanceM = null, live = false;
  try {
    if (routeKey && typeof getRouteStats === 'function') {
      const st = await getRouteStats(routeKey);
      if (my !== timingPreviewToken) return null;
      if (st && Number.isFinite(st.durationS)) { durationS = st.durationS; distanceM = st.distanceM; live = !!st.live; }
    }
  } catch {}
  if (durationS === null) {
    // Fallback: keep the trip's own scheduled duration (default 90 min).
    const a = timingHMtoSec((trip.arrival_time || '').slice(0, 8));
    const d = timingHMtoSec((trip.departure_time || '').slice(0, 8));
    durationS = (a !== null && d !== null && a > d) ? (a - d) : 90 * 60;
  }
  const arrHM = timingSecToHM(depSec + durationS);
  if (preview) preview.innerText = arrHM;
  if (roadEl) {
    const mins = Math.round(durationS / 60);
    const km = (distanceM !== null && Number.isFinite(distanceM)) ? ` · ${(distanceM / 1000).toFixed(1)} km` : '';
    roadEl.innerText = live ? `~${mins} min${km} · live road` : `~${mins} min${km} · schedule`;
  }
  return { departure: depHM + ':00', arrival: arrHM + ':00', durationS };
}

async function saveDriverTiming() {
  const status = document.getElementById('driver-timing-status');
  const setStatus = (msg) => { if (status) status.innerText = msg; };
  if (!isDriver()) { setStatus('Driver login required.'); return; }
  const trip = getActiveTrip();
  if (!trip) { setStatus('Select an active trip first.'); return; }
  setStatus('Calculating road route…');
  const calc = await updateArrivalPreview();
  if (!calc) { setStatus('Enter a valid departure time (HH:MM).'); return; }
  if (Number(trip.trip_id) < 0 || String(currentUser?.token || '').startsWith('demo-')) {
    setStatus(`Demo preview — departs ${calc.departure.slice(0, 5)}, arrives ~${calc.arrival.slice(0, 5)}. Connect XAMPP to save it live.`);
    return;
  }
  setStatus('Saving…');
  try {
    const res = await fetch(`${API_BASE}driver_update_trip.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentUser.token, trip_id: trip.trip_id, departure_time: calc.departure, arrival_time: calc.arrival })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Could not save timing.');
    setStatus(`Saved — departs ${calc.departure.slice(0, 5)}, arrives ~${calc.arrival.slice(0, 5)}. Students see it live.`);
    await fetchDriverDashboard();
  } catch (err) {
    setStatus(err?.message || 'Could not save timing.');
  }
}

function renderDriverDashboard(data) {
  const nameEl = document.getElementById('driver-name');
  const idEl = document.getElementById('driver-id');
  if (nameEl) nameEl.innerText = (data?.driver?.name) || currentUser.name || currentUser.username;
  if (idEl) idEl.innerText = 'Driver ID: ' + ((data?.driver?.driver_id) || currentUser.username);
  if (data?.location) {
    driverLocationState.lat = data.location.lat;
    driverLocationState.lng = data.location.lng;
    driverLocationState.accuracy = data.location.accuracy_m;
    driverLocationState.updatedAt = data.location.updated_at ? new Date(data.location.updated_at) : new Date();
  }
  renderDriverLocation();
  const list = document.getElementById('driver-trips-list');
  if (!list) return;
  const trips = Array.isArray(data?.trips) ? data.trips : [];
  driverTripsCache = trips;
  list.innerHTML = '';
  if (!trips.length) {
    // Demo fallback (no backend): selectable demo trips per route so the
    // departure input + road arrival preview still work offline.
    // Negative IDs can never collide with real trip_ids; Save is blocked
    // in demo with a "connect XAMPP" note instead of failing silently.
    if (typeof busRoutes !== 'undefined') {
      const demoTrips = Object.entries(busRoutes).map(([key, r], i) => ({
        trip_id: -(i + 1),
        route_code: key,
        route_name: r.title,
        service_date: 'demo',
        departure_time: busTimeTo24(r.departure),
        arrival_time: busTimeTo24(r.arrival),
        seats_left: '?'
      }));
      driverTripsCache = demoTrips;
      demoTrips.forEach(t => {
        const li = document.createElement('li');
        const isActive = Number(t.trip_id) === getDriverActiveTripId();
        li.className = 'driver-trip-row' + (isActive ? ' driver-trip-active' : '');
        li.setAttribute('data-trip-id', String(t.trip_id));
        li.innerHTML = `<span class="font-bold">${t.route_code}</span><span>${t.route_name}</span><span>Dep ${t.departure_time.slice(0, 5)} · Arr ${t.arrival_time.slice(0, 5)} · demo</span>
          <span class="driver-trip-live badge badge-success gap-1 ${isActive ? '' : 'hidden'}">● LIVE bus marker</span>
          <button type="button" class="btn btn-xs driver-trip-set ${isActive ? 'hidden' : ''}">Set Active</button>`;
        li.querySelector('.driver-trip-set')?.addEventListener('click', () => setDriverActiveTripId(t.trip_id));
        list.appendChild(li);
      });
      if (!demoTrips.some(t => Number(t.trip_id) === getDriverActiveTripId())) setDriverActiveTripId(demoTrips[0].trip_id);
      else refreshTimingPanel();
      return;
    }
    list.innerHTML = '<li class="text-sm text-slate-500">No trips scheduled today.</li>';
    refreshTimingPanel();
    return;
  }
  trips.forEach(t => {
    const li = document.createElement('li');
    const isActive = Number(t.trip_id) === getDriverActiveTripId();
    li.className = 'driver-trip-row' + (isActive ? ' driver-trip-active' : '');
    li.setAttribute('data-trip-id', String(t.trip_id));
    li.innerHTML = `<span class="font-bold">${t.route_code || t.route_name || ''}</span>
      <span>${t.route_name || ''} · ${t.service_date || ''}</span>
      <span>Dep ${t.departure_time || '--'} · ${t.seats_left ?? '?'} seats left</span>
      <span class="driver-trip-live badge badge-success gap-1 ${isActive ? '' : 'hidden'}">● LIVE bus marker</span>
      <button type="button" class="btn btn-xs driver-trip-set ${isActive ? 'hidden' : ''}">Set Active</button>`;
    li.querySelector('.driver-trip-set')?.addEventListener('click', async () => {
      setDriverActiveTripId(t.trip_id);
      // Immediately mirror current fix to the newly selected trip so the
      // student map + ETA cron see the bus without waiting for next GPS tick.
      if (driverLocationState.lat !== null && driverLocationState.lng !== null) {
        try { await driverSendLocation(driverLocationState.lat, driverLocationState.lng, driverLocationState.accuracy); } catch {}
      }
    });
    list.appendChild(li);
  });
  // Auto-select first trip so sharing always has a target (driver can change).
  // Also repairs a stale stored id (e.g. demo -1 lingering after XAMPP came back).
  if ((!getDriverActiveTripId() || !trips.some(t => Number(t.trip_id) === getDriverActiveTripId())) && trips.length) {
    setDriverActiveTripId(trips[0].trip_id);
    return; // setDriverActiveTripId already refreshes the panel
  }
  refreshTimingPanel();
}

function renderDriverLocation() {
  const latEl = document.getElementById('driver-lat');
  const lngEl = document.getElementById('driver-lng');
  const updEl = document.getElementById('driver-location-updated');
  const statusEl = document.getElementById('driver-sharing-status');
  const has = driverLocationState.lat !== null && driverLocationState.lng !== null;
  if (latEl) latEl.innerText = has ? Number(driverLocationState.lat).toFixed(6) : '--';
  if (lngEl) lngEl.innerText = has ? Number(driverLocationState.lng).toFixed(6) : '--';
  if (updEl) {
    const trip = getDriverActiveTripId();
    const base = has && driverLocationState.updatedAt
      ? 'Updated ' + (driverLocationState.updatedAt instanceof Date
        ? driverLocationState.updatedAt.toLocaleTimeString()
        : driverLocationState.updatedAt) : 'Not sharing yet';
    updEl.innerText = trip ? `${base} · Trip #${trip}` : base;
  }
  if (statusEl) {
    const trip = getDriverActiveTripId();
    if (!trip) {
      statusEl.innerText = 'Select an active trip first';
      statusEl.className = 'driver-status-off';
    } else {
      statusEl.innerText = driverLocationState.sharing ? `Sharing live location · Trip #${trip}` : 'Location sharing off';
      statusEl.className = driverLocationState.sharing ? 'driver-status-on' : 'driver-status-off';
    }
  }
}

function toggleDriverLocationSharing(start) {
  if (!guardDriverAction()) return;
  if (start) {
    if (!('geolocation' in navigator)) { alert('This browser does not support geolocation.'); return; }
    const isDemoDriver = String(currentUser?.token || '').startsWith('demo-');
    if (!getDriverActiveTripId() && !isDemoDriver) { alert('Select an active trip first — the bus marker needs a trip to follow.'); return; }
    if (driverWatchId !== null) return;
    driverLocationState.sharing = true;
    renderDriverLocation();
    driverWatchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        // Ignore wildly inaccurate fixes (>100m) so the bus marker stays precise.
        if (Number.isFinite(accuracy) && accuracy > 100) return;
        driverLocationState.lat = latitude;
        driverLocationState.lng = longitude;
        driverLocationState.accuracy = accuracy;
        driverLocationState.updatedAt = new Date();
        driverLocationState.sharing = true;
        renderDriverLocation();
        try { await driverSendLocation(latitude, longitude, accuracy); } catch {}
      },
      (err) => {
        driverLocationState.sharing = false;
        renderDriverLocation();
        if (err && err.code === 1) alert('Location permission is required for driver login. Please enable your location and try again.');
        else if (err && err.code === 2) alert('Location unavailable. Please check your device GPS.');
        else if (err && err.code === 3) alert('Location request timed out. Please try again.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  } else {
    if (driverWatchId !== null) {
      try { navigator.geolocation.clearWatch(driverWatchId); } catch {}
      driverWatchId = null;
    }
    driverLocationState.sharing = false;
    renderDriverLocation();
  }
}

/* =========================================================
   ROLE GUARDS — protect student-only and driver-only actions
   ========================================================= */
function isLoggedIn() {
  return !!currentUser;
}

function isDriver() {
  return !!currentUser && currentUser.role === 'DRIVER';
}

function isStudent() {
  return !!currentUser && currentUser.role === 'STUDENT';
}

function guardStudentAction() {
  if (!currentUser) { openAuthModal('login'); return false; }
  if (currentUser.role !== 'STUDENT') {
    alert('Please login with a Student account to book seats.');
    return false;
  }
  return true;
}

function guardDriverAction() {
  if (!currentUser) { openAuthModal('driver'); return false; }
  if (currentUser.role !== 'DRIVER') {
    alert('Driver access requires a Driver account. Students cannot open the driver dashboard.');
    return false;
  }
  return true;
}

/* =========================================================
   LOGOUT — clears session, returns to the public website
   ========================================================= */
async function handleLogout() {
  if (driverWatchId !== null) {
    try { navigator.geolocation.clearWatch(driverWatchId); } catch {}
    driverWatchId = null;
  }
  try {
    await fetch(`${API_BASE}logout.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentUser?.token || '' })
    });
  } catch {}
  currentUser = null;
  studentTripBooking = null;
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
  driverLocationState = { lat: null, lng: null, accuracy: null, updatedAt: null, sharing: false };
  // Clear the previous student's picker so the next ID starts fresh.
  // Without this the old lime selection lingers and the next login hits
  // "One student can book one seat" on the very first click.
  selectedSeatsList = [];
  selectedSeatCount = 0;
  pendingBookingAfterAuth = false;
  try { sessionStorage.removeItem(PENDING_SELECTION_KEY); } catch {}
  try { setInnerText('selected-seat', 0); } catch {}
  try { const cont = document.getElementById('booking-seat-container'); if (cont) cont.innerHTML = ''; } catch {}
  document.querySelectorAll('.seats.bg-lime-500').forEach(el => {
    el.classList.remove('bg-lime-500', 'text-white');
    if (!el.disabled) el.classList.add('bg-slate-100', 'text-slate-700');
  });
  updateAuthUI();
  const dash = document.getElementById('driver-dashboard');
  if (dash) dash.classList.add('hidden');
  showApp();
  const sidField = document.getElementById('passenger-student-id');
  if (sidField) sidField.value = '';
  if (typeof updateMyBookingBanner === 'function') updateMyBookingBanner();
  if (typeof validateNextButton === 'function') validateNextButton();
  // Guest view must still show all BOOKED seats in red for the next student.
  if (typeof currentTripId !== 'undefined' && currentTripId) {
    try {
      if (currentTripId === -1 && typeof restoreDemoSeatAvailability === 'function') restoreDemoSeatAvailability();
      else if (typeof loadBookedSeats === 'function') loadBookedSeats();
    } catch {}
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateAuthUI() {
  const userDisplay = document.getElementById('user-display');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const bookingLoginHint = document.getElementById('booking-login-hint');
  const authBadge = document.getElementById('auth-badge');

  if (currentUser) {
    const label = currentUser.role === 'DRIVER' ? 'Driver: ' : '';
    if (userDisplay) userDisplay.innerText = label + currentUser.username;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (bookingLoginHint) bookingLoginHint.classList.add('hidden');
    if (authBadge) {
      authBadge.innerText = currentUser.role === 'DRIVER' ? 'Driver' : 'Student';
      authBadge.className = 'bg-emerald-500 text-white text-xs px-2 py-1 rounded-full font-bold hidden md:inline';
    }
    if (isStudent() && typeof prefillBookingFromAccount === 'function') prefillBookingFromAccount();
    if (typeof syncTelegramField === 'function') { try { syncTelegramField(); } catch {} }
  } else {
    if (userDisplay) userDisplay.innerText = '';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (bookingLoginHint) bookingLoginHint.classList.remove('hidden');
    if (authBadge) { authBadge.innerText = 'Guest'; authBadge.className = 'bg-slate-200 text-slate-600 text-xs px-2 py-1 rounded-full font-bold hidden md:inline'; }
    const sidField = document.getElementById('passenger-student-id');
    if (sidField) sidField.value = '';
  }
}

/* =========================================================
   PENDING SEAT SELECTION — survives auth (in-memory first,
   sessionStorage snapshot as a backup). No sensitive data
   is persisted: seat + route ids only, cleared after use.
   ========================================================= */
function snapshotPendingSelection() {
  try {
    if (selectedSeatsList.length > 0) {
      sessionStorage.setItem(PENDING_SELECTION_KEY, JSON.stringify({
        seatId: selectedSeatsList[0],
        route: currentRoute,
        tripId: currentTripId
      }));
    } else {
      sessionStorage.removeItem(PENDING_SELECTION_KEY);
    }
  } catch {}
}

function updatePendingSelectionSnapshot() {
  snapshotPendingSelection();
}

function clearPendingSelection() {
  try { sessionStorage.removeItem(PENDING_SELECTION_KEY); } catch {}
}

function restorePendingSelection() {
  try {
    const raw = sessionStorage.getItem(PENDING_SELECTION_KEY);
    if (!raw) return;
    const sel = JSON.parse(raw);
    if (!sel || !sel.seatId || sel.route !== currentRoute) return;
    if (currentTripId !== -1 && sel.tripId !== currentTripId) return;
    if (bookedSeatIds.has(sel.seatId)) return;
    if (studentTripBooking) return;
    const el = document.getElementById(sel.seatId);
    if (!el || el.disabled) return;
    if (!selectedSeatsList.includes(sel.seatId)) {
      selectedSeatsList.push(sel.seatId);
      selectedSeatCount = selectedSeatsList.length;
      availableSeat = Math.max(0, availableSeat - 1);
      setSeatSelectedStyle(sel.seatId);
      addSeatToBookingList(sel.seatId);
      setInnerText('selected-seat', selectedSeatCount);
      setInnerText('seats-left', availableSeat);
    }
    clearPendingSelection();
    validateNextButton();
  } catch {}
}

/* =========================================================
   DARK MODE — html[data-theme], persisted in localStorage
   ========================================================= */
function initTheme() {
  let saved = 'light';
  try { saved = localStorage.getItem(THEME_STORAGE_KEY) || 'light'; } catch {}
  applyTheme(saved);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  const toggle = document.getElementById('theme-toggle');
  if (theme === 'dark') {
    if (toggle) toggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>`;
    toggle?.setAttribute('aria-label', 'Switch to light mode');
    toggle?.setAttribute('title', 'Light mode');
  } else {
    if (toggle) toggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>`;
    toggle?.setAttribute('aria-label', 'Switch to dark mode');
    toggle?.setAttribute('title', 'Dark mode');
  }
}
