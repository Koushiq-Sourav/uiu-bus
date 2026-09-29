/* =========================================================
   PARTITION: ROUTES / DESTINATION SELECTION
   ---------------------------------------------------------
   - busRoutes data (Dhanmondi etc. with stops)
   - Dropdown that shows route info card
   - Updates shuttle info header
   - Reloads trip/seats when route changes
   ========================================================= */

const busRoutes = {
  Dhanmondi: {
    title: "ROUTE: 01: Dhanmondi ⇄ UIU Campus",
    stops: ["Dhanmondi 27", "Kalabagan", "Science Lab", "Shahbagh", "Kakrail", "Notun Bazar", "UIU Campus"],
    departure: "08:00 AM",
    arrival: "09:30 AM"
  },
  Mirpur: {
    title: "ROUTE: 02: Mirpur ⇄ UIU Campus",
    stops: ["Mirpur 10", "Mirpur 11", "Purobi", "ECB Chottor", "Kuril Bishwa Road", "Notun Bazar", "UIU Campus"],
    departure: "08:15 AM",
    arrival: "09:45 AM"
  },
  Signboard: {
    title: "ROUTE: 03: Signboard ⇄ UIU Campus",
    stops: ["Signboard", "Matuail", "Kanchpur Bridge", "Demra Staff Quarter", "Rampura", "Notun Bazar", "UIU Campus"],
    departure: "07:45 AM",
    arrival: "09:15 AM"
  },
  Jatrabari: {
    title: "ROUTE: 04: Jatrabari ⇄ UIU Campus",
    stops: ["Jatrabari", "Sayedabad", "Mugdha", "Basabo", "Maddhya Badda", "Notun Bazar", "UIU Campus"],
    departure: "07:30 AM",
    arrival: "09:00 AM"
  },
  Palashi: {
    title: "ROUTE: 05: Palashi ⇄ UIU Campus",
    stops: ["Palashi", "BUET Campus", "Dhaka Medical", "Press Club", "Kakrail", "Notun Bazar", "UIU Campus"],
    departure: "08:30 AM",
    arrival: "09:30 AM"
  },
  Uttara: {
    title: "ROUTE: 06: Uttara ⇄ UIU Campus",
    stops: ["Uttara House Building", "Azampur", "Airport", "Khilkhet", "Kuril Flyover", "Notun Bazar", "UIU Campus"],
    departure: "07:00 AM",
    arrival: "09:00 AM"
  }
};

function initRouteDropdown() {
  initShuttleRouteSelect();
  const routeButtons = document.querySelectorAll('.route-select-btn');

  routeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      selectRoute(button.getAttribute('data-route'));
      const liveSection = document.getElementById('live-location-section');
      // (initLiveLocationButtons in map.js also scrolls to the live map.)
    });
  });

  const routeDisplaySection = document.getElementById('route-info-display');
  const closeRouteBtn = document.getElementById('close-route-info');

  if (closeRouteBtn) {
    closeRouteBtn.addEventListener('click', () => {
      routeDisplaySection.classList.add('hidden');
    });
  }
}

/* Route picker inside the UIU SHUTTLE SERVICE card.
   Selecting a route runs the same selectRoute() flow, so the
   Departure/Arrival shown are always the driver's live DB times. */
function initShuttleRouteSelect() {
  const sel = document.getElementById('shuttle-route-select');
  if (!sel) return;
  if (sel.dataset.wired) { syncShuttleRouteSelect(); return; }
  sel.dataset.wired = '1';
  sel.addEventListener('change', () => {
    if (sel.value && sel.value !== currentRoute) selectRoute(sel.value);
  });
  syncShuttleRouteSelect();
}

function syncShuttleRouteSelect() {
  const sel = document.getElementById('shuttle-route-select');
  if (sel && currentRoute) sel.value = currentRoute;
}

/* Shared route-selection entry point: used by the Destination dropdown,
   the live-map buttons AND the Search results. */
async function selectRoute(routeKey) {
  const routeData = busRoutes[routeKey];
  if (!routeData) return;
  currentRoute = routeKey;
  if (typeof syncShuttleRouteSelect === 'function') syncShuttleRouteSelect();
  selectedSeatsList = [];
  selectedSeatCount = 0;
  setInnerText('selected-seat', 0);
  // clear booking list UI
  const container = document.getElementById('booking-seat-container');
  if (container) container.innerHTML = '';
  // reset seat styles that were lime selected (keep red booked as is)
  document.querySelectorAll('.seats').forEach(el => {
    if (!el.disabled && el.classList.contains('bg-lime-500')) {
      el.classList.remove('bg-lime-500','text-white');
      el.classList.add('bg-slate-100','text-slate-700');
    }
  });
  // the pending seat (if any) belongs to another route now
  if (typeof clearPendingSelection === 'function') clearPendingSelection();
  pendingBookingAfterAuth = false;

  const routeTitle = document.getElementById('route-title');
  const routeStopsList = document.getElementById('route-stops-list');
  const routeDisplaySection = document.getElementById('route-info-display');
  const displayRouteName = document.getElementById('display-route-name');
  const displayBoardingPoints = document.getElementById('display-boarding-points');

  showRouteInfoCard(routeData, { routeTitle, routeStopsList, routeDisplaySection });
  updateShuttleInfoSection(routeKey, routeData, { displayRouteName, displayBoardingPoints });
  await loadTripAndSeats();
  if (typeof updateStopTimes === 'function') updateStopTimes();
  validateNextButton();
}

function showRouteInfoCard(routeData, { routeTitle, routeStopsList, routeDisplaySection }) {
  routeTitle.innerText = routeData.title;
  routeStopsList.innerHTML = '';
  routeData.stops.forEach((stop, index) => {
    const li = document.createElement('li');
    li.className = 'bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl flex items-center gap-3 text-sm';
    li.innerHTML = `<span class="bg-lime-500/20 text-lime-400 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">${index + 1}</span> <span class="flex-1">${stop}</span> <span class="stop-time text-lime-300/90 text-xs font-semibold whitespace-nowrap">…</span>`;
    routeStopsList.appendChild(li);
  });
  routeDisplaySection.classList.remove('hidden');
  routeDisplaySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (typeof updateStopTimes === 'function') updateStopTimes();
}

/* Per-stoppage arrival times: departure (driver live) + road duration
   spread evenly across stops. First stop = departure, last = arrival. */
let stopTimesToken = 0;
function parseDepSec(v) {
  v = (v || '').trim();
  let m = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)?\s*$/i.exec(v);
  if (m) {
    let h = Number(m[1]) % 12;
    if (/pm/i.test(m[3] || '')) h += 12;
    // "08:00" without AM/PM in this project means morning.
    if (!m[3] && Number(m[1]) >= 1 && Number(m[1]) <= 11) h = Number(m[1]);
    if (!m[3] && Number(m[1]) === 12) h = 12;
    return h * 3600 + Number(m[2]) * 60;
  }
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(v);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
  return null;
}

function fmtStopTime(sec) {
  sec = ((Math.round(sec) % 86400) + 86400) % 86400;
  let h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

async function updateStopTimes() {
  const my = ++stopTimesToken;
  const list = document.getElementById('route-stops-list');
  if (!list || !list.children.length) return;
  const routeData = (typeof busRoutes !== 'undefined') ? busRoutes[currentRoute] : null;
  if (!routeData || !routeData.stops.length) return;
  const depSec = parseDepSec(currentDepartureTime || routeData.departure || '');
  if (depSec === null) return;
  let durationS = null, live = false;
  try {
    if (typeof getRouteStats === 'function') {
      const st = await getRouteStats(currentRoute);
      if (my !== stopTimesToken) return;
      if (st && Number.isFinite(st.durationS)) { durationS = st.durationS; live = !!st.live; }
    }
  } catch {}
  if (durationS === null) {
    const a = parseDepSec(currentArrivalTime || routeData.arrival || '');
    durationS = (a !== null && a > depSec) ? (a - depSec) : 90 * 60;
  }
  const n = routeData.stops.length;
  [...list.children].forEach((li, i) => {
    const el = li.querySelector('.stop-time');
    if (!el) return;
    const t = depSec + (n === 1 ? 0 : durationS * (i / (n - 1)));
    el.innerText = `≈ ${fmtStopTime(t)}${live ? '' : '*'}`;
  });
  const badge = document.getElementById('route-badge');
  if (badge) badge.innerText = live ? 'UIU Shuttle Line · live road times' : 'UIU Shuttle Line · schedule times';
}

function updateShuttleInfoSection(routeKey, routeData, { displayRouteName, displayBoardingPoints }) {
  if (displayRouteName) displayRouteName.innerText = routeKey;
  // Departure / arrival times (fallback per-route; api.js overwrites with live DB times)
  currentDepartureTime = routeData.departure || '';
  currentArrivalTime = routeData.arrival || '';
  setInnerText('display-departure-time', currentDepartureTime);
  setInnerText('display-arrival-time', currentArrivalTime);
  if (displayBoardingPoints) {
    displayBoardingPoints.innerHTML = '';
    routeData.stops.slice(0, 3).forEach(stop => {
      const div = document.createElement('div');
      div.className = 'bg-slate-200 text-xs md:text-sm p-2.5 rounded-lg font-medium text-slate-700';
      div.innerText = `Boarding Point - ${stop}`;
      displayBoardingPoints.appendChild(div);
    });
  }
}

/* First-paint defaults: the card ships with stale "Dhaka-City" HTML until
   the first route is picked. Fill it from the default route immediately so
   students never see the placeholder; live DB times overwrite after. */
function initShuttleCard() {
  const routeData = (typeof busRoutes !== 'undefined') ? busRoutes[currentRoute] : null;
  if (!routeData) return;
  if (typeof syncShuttleRouteSelect === 'function') syncShuttleRouteSelect();
  updateShuttleInfoSection(currentRoute, routeData, {
    displayRouteName: document.getElementById('display-route-name'),
    displayBoardingPoints: document.getElementById('display-boarding-points')
  });
}
