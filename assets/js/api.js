/* =========================================================
   PARTITION: API / DATABASE LAYER
   ---------------------------------------------------------
   All PHP REST calls. No DOM manipulation except
   updating seat availability returned from backend.
   ---------------------------------------------------------
   Endpoints:
   - GET  api/get_trip.php?route=&date=
   - GET  api/get_seats.php?trip_id=
   - POST api/create_booking.php
   - POST api/login.php (auth.js uses)
   ========================================================= */

async function loadTripAndSeats() {
  try {
    const today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().split('T')[0];
    const tripResponse = await fetch(
      `${API_BASE}get_trip.php?route=${encodeURIComponent(currentRoute)}&date=${today}`
    );
    if (!tripResponse.ok) throw new Error('Could not connect to get_trip.php');
    const tripData = await tripResponse.json();
    if (!tripData.success || !tripData.trip) {
      throw new Error(tripData.message || 'No trip found for this route.');
    }
    currentTripId = Number(tripData.trip.trip_id);
    // Arrival / departure times: live from DB, fallback to per-route defaults
    currentDepartureTime = tripData.trip.departure_time || (busRoutes[currentRoute] && busRoutes[currentRoute].departure) || '';
    currentArrivalTime = tripData.trip.arrival_time || (busRoutes[currentRoute] && busRoutes[currentRoute].arrival) || '';
    setInnerText('display-departure-time', currentDepartureTime);
    setInnerText('display-arrival-time', currentArrivalTime);
    if (typeof refreshBusPolling === 'function') { try { refreshBusPolling(); } catch {} }
    await loadBookedSeats();
    if (typeof refreshRouteAvailability === 'function') { try { await refreshRouteAvailability(); } catch {} }
    if (typeof startSeatPolling === 'function') { try { startSeatPolling(); } catch {} }
  } catch (error) {
    console.error('Trip loading error:', error);
    // Demo fallback (same pattern as auth.js): allow booking without XAMPP/DB
    // so Next() does not stop at "Trip information is not loaded yet".
    currentTripId = -1;
    // Demo: prefer driver-saved times on this device, else per-route defaults.
    const demoOv = (typeof getDemoTiming === 'function') ? getDemoTiming(currentRoute) : null;
    currentDepartureTime = ((demoOv && demoOv.departure && typeof timing24to12 === 'function') ? timing24to12(demoOv.departure) : null)
      || (typeof busRoutes !== 'undefined' && busRoutes[currentRoute] && busRoutes[currentRoute].departure) || '';
    currentArrivalTime = ((demoOv && demoOv.arrival && typeof timing24to12 === 'function') ? timing24to12(demoOv.arrival) : null)
      || (typeof busRoutes !== 'undefined' && busRoutes[currentRoute] && busRoutes[currentRoute].arrival) || '';
    setInnerText('display-departure-time', currentDepartureTime);
    setInnerText('display-arrival-time', currentArrivalTime);
    if (typeof refreshBusPolling === 'function') { try { refreshBusPolling(); } catch {} }
    // Demo repaint on every load/refresh — otherwise booked red vanishes.
    if (typeof restoreDemoSeatAvailability === 'function') { try { restoreDemoSeatAvailability(); } catch {} }
    console.warn('Demo trip mode: backend unreachable, using currentTripId=-1');
  }
}

async function loadBookedSeats() {
  if (!currentTripId) {
    console.error('No trip ID available.');
    return;
  }
  if (currentTripId === -1) { restoreDemoSeatAvailability(); return; } // demo mode: seats from the offline registry
  try {
    const tokenParam = currentUser && currentUser.token ? `&token=${encodeURIComponent(currentUser.token)}` : '';
    const response = await fetch(`${API_BASE}get_seats.php?trip_id=${currentTripId}${tokenParam}`);
    if (!response.ok) throw new Error('Could not connect to get_seats.php');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.seats)) {
      throw new Error(data.message || 'Could not load seats.');
    }
    bookedSeatIds.clear();
    availableSeat = data.seats.filter(seat => {
      const status = seat.effective_status || seat.seat_status;
      return status === 'AVAILABLE';
    }).length;

    data.seats.forEach(seatData => {
      const seatElement = document.getElementById(seatData.seat_code);
      if (!seatElement) return;
      const status = seatData.effective_status || seatData.seat_status;
      if (status === 'BOOKED' || status === 'BLOCKED' || status === 'HELD') {
        bookedSeatIds.add(seatData.seat_code);
        seatElement.disabled = true;
        seatElement.classList.remove('bg-slate-100','text-slate-700','hover:bg-slate-200','bg-lime-500','text-white');
        seatElement.classList.add('bg-red-500','text-white','cursor-not-allowed','opacity-70');
        seatElement.setAttribute('data-seat-status', status);
        seatElement.setAttribute('title', 'Already booked');
      } else {
        seatElement.disabled = false;
        seatElement.classList.remove('bg-red-500','cursor-not-allowed','opacity-70');
        seatElement.removeAttribute('title');
        // Never paint over the visitor's current selection.
        if (!selectedSeatsList.includes(seatData.seat_code)) {
          seatElement.classList.remove('bg-lime-500','text-white');
          seatElement.classList.add('bg-slate-100','text-slate-700');
        }
        seatElement.setAttribute('data-seat-status', 'AVAILABLE');
      }
    });
    setInnerText('seats-left', availableSeat);
    // The logged-in student's own booking on this trip (one-seat banner/block).
    studentTripBooking = (data && data.student_booking) || null;
    // EVICT: if the seat I just picked was taken by someone else since my
    // last refresh, drop it from my selection so Book Now can't fire on it.
    // The seat is already painted red+disabled above for every viewer.
    const takenSelected = selectedSeatsList.filter(s => bookedSeatIds.has(s));
    if (takenSelected.length) {
      takenSelected.forEach(seatCode => {
        selectedSeatsList = selectedSeatsList.filter(s => s !== seatCode);
        selectedSeatCount = Math.max(0, selectedSeatCount - 1);
        const li = document.getElementById(`booked-${seatCode}`);
        if (li) li.remove();
      });
      setInnerText('selected-seat', selectedSeatCount);
      if (takenSelected.length === 1) alert(`Seat ${takenSelected[0]} was just booked by another student. Please pick another seat.`);
      else alert(`Seats ${takenSelected.join(', ')} were just booked by others. Please pick again.`);
    }
    if (typeof updateMyBookingBanner === 'function') updateMyBookingBanner();
    if (typeof validateNextButton === 'function') validateNextButton();
  } catch (error) {
    console.error('Seat loading error:', error);
    alert('Could not load seat availability from the database.');
  }
}

/* Demo/offline seat availability: seats booked in this browser while the
   backend was unreachable are painted red so double booking is blocked. */
function restoreDemoSeatAvailability() {
  try {
    // Reset every seat to gray first — otherwise red from the previous
    // route sticks and looks "booked all the time".
    document.querySelectorAll('.seats').forEach(el => {
      el.disabled = false;
      el.classList.remove('bg-red-500', 'cursor-not-allowed', 'opacity-70', 'bg-lime-500', 'text-white');
      el.classList.add('bg-slate-100', 'text-slate-700');
      el.setAttribute('data-seat-status', 'AVAILABLE');
      el.removeAttribute('title');
    });
    // Re-apply my current (cleared on route switch, but safe) selection.
    selectedSeatsList.forEach(seatCode => {
      const el = document.getElementById(seatCode);
      if (el && !el.disabled) {
        el.classList.remove('bg-slate-100', 'text-slate-700');
        el.classList.add('bg-lime-500', 'text-white');
      }
    });
    const seatsReg = JSON.parse(localStorage.getItem(DEMO_BOOKED_SEATS_KEY) || '{}');
    const routeSeats = seatsReg[currentRoute] || [];
    bookedSeatIds.clear();
    routeSeats.forEach(seatCode => {
      const seatElement = document.getElementById(seatCode);
      bookedSeatIds.add(seatCode);
      if (!seatElement) return;
      seatElement.disabled = true;
      seatElement.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200', 'bg-lime-500', 'text-white');
      seatElement.classList.add('bg-red-500', 'text-white', 'cursor-not-allowed', 'opacity-70');
      seatElement.setAttribute('data-seat-status', 'BOOKED');
      seatElement.setAttribute('title', 'Already booked');
    });
    availableSeat = 40 - bookedSeatIds.size;
    setInnerText('seats-left', availableSeat);
  } catch {}
}

/* Cancel the logged-in STUDENT's own CONFIRMED booking (Unbook).
   POST api/cancel_booking.php { token, booking_id }.
   Returns the freed { booking } or throws with the server message. */
async function cancelBooking(bookingId) {
  if (!currentUser || currentUser.role !== 'STUDENT') throw new Error('Student login required.');
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser.token) headers['token'] = currentUser.token;
  const res = await fetch(`${API_BASE}cancel_booking.php`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token: currentUser.token, booking_id: bookingId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error((data && data.message) || 'Could not cancel booking.');
  return data.booking;
}

/* Current STUDENT's booking list (My Bookings). Returns [] in demo mode. */
async function fetchUserBookings() {
  if (!currentUser || currentUser.role !== 'STUDENT') return [];
  try {
    const res = await fetch(`${API_BASE}user_bookings.php?token=${encodeURIComponent(currentUser.token)}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Could not load bookings.');
    return data.bookings || [];
  } catch (err) {
    return [];
  }
}

/* Driver GPS feed (server-validated). No hard-coded locations anywhere.
   The active trip id is attached so the backend mirrors the same fix
   into bus_locations — one POST drives driver + bus markers + ETA cron. */
async function driverSendLocation(lat, lng, accuracy, tripIdOverride) {
  if (!currentUser || currentUser.role !== 'DRIVER') throw new Error('Driver login required.');
  let tripId = tripIdOverride ?? null;
  try {
    if (tripId == null && typeof getDriverActiveTripId === 'function') tripId = getDriverActiveTripId();
  } catch {}
  if (tripId == null && typeof driverActiveTripId !== 'undefined') tripId = driverActiveTripId;
  const res = await fetch(`${API_BASE}driver_location.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: currentUser.token, lat, lng, accuracy, trip_id: tripId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || 'Could not save location.');
  return data.location;
}

async function fetchDriverLocation() {
  if (!currentUser || currentUser.role !== 'DRIVER') return null;
  try {
    const res = await fetch(`${API_BASE}driver_location.php?token=${encodeURIComponent(currentUser.token)}`);
    const data = await res.json();
    if (!res.ok || !data.success) return null;
    return data.location;
  } catch {
    return null;
  }
}

/* Seat auto-refresh: repaints red BOOKED seats for EVERY viewer every 15s
   so a seat taken by one student turns red for all others without reload.
   Skips while a booking POST is in flight or the tab is hidden. */
let seatPollTimer = null;
function startSeatPolling() {
  if (seatPollTimer) return;
  seatPollTimer = setInterval(async () => {
    try {
      if (typeof isBooking !== 'undefined' && isBooking) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!currentTripId || currentTripId === -1) return;
      await loadBookedSeats();
      if (typeof refreshRouteAvailability === 'function') await refreshRouteAvailability();
    } catch {}
  }, 15000);
}

/* Per-route availability + live times for the student overview.
   Paints "N left" on every Destination / live-map button and keeps the
   shuttle card Departure/Arrival in sync after the driver retimes a trip.
   Silent no-op in demo/offline mode. */
async function refreshRouteAvailability() {
  let data = null;
  try {
    const today = (typeof localToday === 'function') ? localToday() : new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_BASE}route_availability.php?date=${encodeURIComponent(today)}`);
    data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.routes)) return;
  } catch { return; }
  const byRoute = {};
  data.routes.forEach(r => { byRoute[r.route_code] = r; });
  document.querySelectorAll('.route-select-btn[data-route]').forEach(btn => {
    const key = btn.getAttribute('data-route');
    const info = byRoute[key];
    if (!info || info.seats_left === null || info.seats_left === undefined) return;
    if (!btn.dataset.base) btn.dataset.base = btn.textContent.trim();
    btn.textContent = `${btn.dataset.base} · ${info.seats_left} left`;
  });
  document.querySelectorAll('.live-route-btn[data-live-route]').forEach(btn => {
    const key = btn.getAttribute('data-live-route');
    const info = byRoute[key];
    if (!info || info.seats_left === null || info.seats_left === undefined) return;
    if (!btn.dataset.base) btn.dataset.base = btn.textContent.trim();
    btn.textContent = `${btn.dataset.base} · ${info.seats_left} left`;
  });
  // Live driver times for the CURRENT route (no reload needed to see retime).
  const cur = byRoute[currentRoute];
  if (cur && Number(cur.trip_id) === Number(currentTripId)) {
    if (cur.departure_time) {
      currentDepartureTime = cur.departure_time;
      setInnerText('display-departure-time', cur.departure_time);
    }
    if (cur.arrival_time) {
      currentArrivalTime = cur.arrival_time;
      setInnerText('display-arrival-time', cur.arrival_time);
    }
    if (typeof updateStopTimes === 'function') { try { updateStopTimes(); } catch {} }
  }
}

/* Live bus position for the CURRENT trip (student map + ETA).
   Returns { trip_id, lat, lng, updated_at } or null when no fix yet. */
async function fetchBusLocation(tripId) {
  const id = tripId ?? (typeof currentTripId !== 'undefined' ? currentTripId : null);
  if (!id || id === -1) return null;
  try {
    const res = await fetch(`${API_BASE}bus_location.php?trip_id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok || !data.success) return null;
    return data.location || null;
  } catch {
    return null;
  }
}
