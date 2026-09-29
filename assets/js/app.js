/* =========================================================
   PARTITION: APP ENTRY — ORCHESTRATOR
   ---------------------------------------------------------
   No business logic here. Only wires together the
   partitions you asked for:

   1. AUTH PORTAL   → auth.js
   2. SEAT CHOOSING → seats.js
   3. BOOKING       → booking.js
   4. ROUTES        → routes.js
    5. LIVE LOCATION → map.js
    6. TELEGRAM ALERTS → telegram.js (bus-near demo + link)
    7. UTILS/HELPERS → utils.js
    8. API/DB SYNC   → api.js
    9. NAVIGATION + SEARCH + MY BOOKINGS (below)

    Load order in index.html must be:
      config.js → utils.js → api.js → auth.js → routes.js
      → seats.js → booking.js → map.js → telegram.js → app.js
   ========================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth portal (+ theme)
  initAuth();

  // 2. Seat choosing partition
  initSeatSelection();

  // 3. Booking validation
  initPassengerFormValidation();

  // 4. Route selection
  initRouteDropdown();
  if (typeof initShuttleCard === 'function') initShuttleCard();

  // 5. Live location / map
  initLiveMap();
  initLiveLocationButtons();

  // 5b. Telegram alerts (link + bus-near demo)
  if (typeof initTelegram === 'function') initTelegram();

  // 5c. Scroll-reveal motion (up + down)
  initScrollReveal();

  // 6. Navigation (Home / About / Search — all functional)
  initNavigation();

  // 7. Search (routes + boarding stops)
  initSearch();

  // 8. DB sync — load today's trip + seat availability
  await loadTripAndSeats();

  // 9. Restore a seat selection that survived an auth round-trip
  restorePendingSelection();

  // 10. Restore an existing session without forcing re-login
  if (isStudent()) {
    prefillBookingFromAccount();
    await refreshStudentBookingState();
    await renderMyBookings();
  }
  if (isDriver()) {
    // A restored driver token is not enough to enter the dashboard.
    // Require a fresh live GPS fix on every page load/session restore.
    showApp();
    openAuthModal('driver-location');
    await requestDriverLocation();
  }
});

/* =========================================================
   PARTITION: SCROLL REVEAL — fade-up on scroll (up + down)
   - Observes page blocks once; .visible sticks so scrolling back
     up keeps them shown (no flicker), new blocks animate in.
   - Siblings in a grid stagger slightly for a cascading feel.
   - Skipped entirely under prefers-reduced-motion.
   ========================================================= */
function initScrollReveal() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    const blocks = document.querySelectorAll(
      'main section, #live-location-section > div, #about-section > div, #driver-dashboard > div, footer .container > div'
    );
    if (!blocks.length) return;
    // Sibling stagger: children sharing a parent cascade 0/70/140ms.
    const sibIndex = new Map();
    blocks.forEach(el => {
      const key = el.parentNode;
      const i = sibIndex.get(key) || 0;
      sibIndex.set(key, i + 1);
      el.classList.add('reveal');
      el.style.transitionDelay = `${Math.min(i, 3) * 70}ms`;
    });
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    blocks.forEach(el => io.observe(el));
  } catch {}
}

/* =========================================================
   PARTITION: NAVIGATION — every button functional
   - [data-nav="home"]   → back to the top of the homepage
   - [data-nav="about"]  → scroll to the About section
   - [data-nav="search"] → scroll to Search + focus the field
   ========================================================= */
function initNavigation() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = el.getAttribute('data-nav');
      if (target === 'home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const section = document.getElementById(target === 'about' ? 'about-section' : 'search-section');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target === 'search') setTimeout(() => document.getElementById('search-input')?.focus(), 450);
      }
    });
  });
}

/* =========================================================
   PARTITION: SEARCH — match route name/title or any
   boarding stop, then jump to that route on click
   ========================================================= */
function initSearch() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!form || !input || !results) return;

  const render = () => {
    const q = (input.value || '').trim().toLowerCase();
    const matches = Object.entries(busRoutes).filter(([key, r]) =>
      q === '' ||
      key.toLowerCase().includes(q) ||
      (r.title || '').toLowerCase().includes(q) ||
      (r.stops || []).some(s => s.toLowerCase().includes(q))
    );
    results.innerHTML = '';
    if (!matches.length) {
      results.innerHTML = '<div class="search-empty">No routes match your search. Try a route or stop name (e.g. Uttara, Notun Bazar).</div>';
      return;
    }
    matches.forEach(([key, r]) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'search-result-card';
      card.innerHTML = `<span class="search-result-route">${key}</span>
        <span class="search-result-title">${r.title}</span>
        <span class="search-result-stops">${(r.stops || []).slice(0, 3).join(' → ')}${(r.stops || []).length > 3 ? ' …' : ''}</span>`;
      card.addEventListener('click', async () => {
        await selectRoute(key);
        results.innerHTML = '';
        input.value = '';
        document.getElementById('purchase-section')?.scrollIntoView({ behavior: 'smooth' });
      });
      results.appendChild(card);
    });
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); render(); });
  input.addEventListener('input', render);
}

/* =========================================================
   PARTITION: MY BOOKINGS — banner + list for the
   logged-in student (protected student area)
   ========================================================= */
function updateMyBookingBanner() {
  const banner = document.getElementById('my-booking-banner');
  const text = document.getElementById('my-booking-text');
  if (!banner || !text) return;
  if (studentTripBooking && isStudent()) {
    banner.classList.remove('hidden');
    text.innerHTML = `You have already booked seat <strong>${studentTripBooking.seat_code}</strong> on this route` +
      (studentTripBooking.booking_reference ? ` (Ref: ${studentTripBooking.booking_reference})` : '') +
      `. One student ID can select only one seat.`;
  } else {
    banner.classList.add('hidden');
  }
}

async function renderMyBookings() {
  const section = document.getElementById('my-bookings-section');
  const list = document.getElementById('my-bookings-list');
  if (!section || !list) return;
  if (!isStudent()) { section.classList.add('hidden'); return; }
  let bookings = await fetchUserBookings();
  if (!bookings.length) {
    // Demo/offline registry fallback so the list works without a DB too.
    try {
      const reg = JSON.parse(localStorage.getItem(DEMO_STUDENT_BOOKINGS_KEY) || '{}');
      bookings = Object.entries(reg)
        .filter(([k]) => k.startsWith(currentUser.username + '_'))
        .map(([k, seat]) => ({
          seat_codes: seat,
          route_code: k.slice(currentUser.username.length + 1),
          route_name: '',
          service_date: '',
          booking_reference: 'UIU-DEMO'
        }));
    } catch { bookings = []; }
  }
  if (!bookings.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  list.innerHTML = '';
  bookings.forEach(b => {
    const li = document.createElement('li');
    li.className = 'my-booking-row';
    li.innerHTML = `<span class="font-bold">${b.seat_codes || ''}</span>
      <span>${b.route_code || b.route_name || ''} · ${b.service_date || ''}</span>
      <span class="text-slate-500">${b.booking_reference || ''}</span>`;
    list.appendChild(li);
  });
}
