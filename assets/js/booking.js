/* =========================================================
   PARTITION: BOOKING (SIMPLIFIED UI — seat + Book Now only)
   ---------------------------------------------------------
   - Auth gate: browsing is public; "Book Now" opens the portal
     when logged out, then continues automatically with the
     preserved seat selection.
   - One student = one seat per trip (frontend check mirrors the
     DB check in api/create_booking.php).
   - Account info is reused directly from login (no form fields):
     name = account name, phone/email = account or empty.
   - NO MONEY: no fares/totals anywhere.
   - Next() POSTs to api/create_booking.php transactionally
   ========================================================= */

function initPassengerFormValidation() {
  // No form fields in simplified UI — Book Now is seat-driven only.
  // Kept as a no-op so app.js wiring stays unchanged.
}

function validateNextButton() {
  const nextBtn = document.getElementById('next-btn');
  if (!nextBtn) return;
  const seatSelected = selectedSeatsList.length > 0;
  // The button is seat-driven; the one-seat login check happens in Next().
  const isValid = seatSelected && !studentTripBooking;
  if (isValid) {
    nextBtn.removeAttribute('disabled');
    nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    nextBtn.setAttribute('disabled', 'true');
    nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }
  // hint about login
  const hint = document.getElementById('booking-login-hint');
  if (hint) {
    if (seatSelected && !isLoggedIn()) hint.classList.remove('hidden');
    else hint.classList.add('hidden');
  }
}

async function Next() {
  // Auth gate: "Book Now" is the ONLY login trigger on the public site.
  if (!isLoggedIn()) {
    pendingBookingAfterAuth = true;
    snapshotPendingSelection();
    openAuthModal('login');
    return;
  }
  if (currentUser.role !== 'STUDENT') {
    alert('Please login with a Student account to book seats.');
    return;
  }
  // One student ID = one seat per trip.
  if (studentTripBooking) {
    alert('One student ID can select only one seat.');
    return;
  }
  if (isBooking) return;
  if (!currentTripId) { alert('Trip information is not loaded yet. Please wait a moment and try again.'); return; }
  if (selectedSeatsList.length !== 1) { alert('One student ID can select only one seat. Please select exactly one seat.'); return; }
  // FRESH revalidation: pull the latest seat map right before POST so a seat
  // taken seconds ago by another student turns red here first and aborts.
  // The backend FOR UPDATE lock is the final guard; this is the UX guard.
  if (currentTripId !== -1 && typeof loadBookedSeats === 'function') {
    try { await loadBookedSeats(); } catch {}
    if (studentTripBooking) { alert('One student ID can select only one seat.'); return; }
    if (selectedSeatsList.length !== 1) return; // evicted above with its own alert
  }
  const studentId = currentUser.username;
  // Telegram Chat ID comes from the one-time login link (no box after login).
  let tgChatId = '';
  try { tgChatId = localStorage.getItem('uiu_bus_tg_' + studentId) || ''; } catch {}
  if (tgChatId && typeof linkTelegramWithId === 'function') {
    try { await linkTelegramWithId(studentId, tgChatId); } catch {} // ensure server has it
  }
  // Reuse account info directly — simplified UI has no form fields.
  const nameValue = currentUser.name || studentId;
  const phoneValue = currentUser.phone || '';
  const emailValue = currentUser.email || '';
  const unavailableSelectedSeats = selectedSeatsList.filter(seatId => bookedSeatIds.has(seatId));
  if (unavailableSelectedSeats.length > 0) {
    alert(`This seat is no longer available. Please select another seat. (${unavailableSelectedSeats.join(', ')})`);
    await loadBookedSeats();
    return;
  }
  isBooking = true;
  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.innerText = 'Booking...'; }
  // Demo mode (backend unreachable, currentTripId=-1 from api.js).
  // One student = one seat per route, keyed by that student's own ID.
  if (currentTripId === -1) {
    const resetDemoState = () => {
      isBooking = false;
      if (nextBtn) { nextBtn.innerText = 'Book Now'; validateNextButton(); }
    };
    try {
      const pickedSeat = selectedSeatsList[0];
      const seatsReg = JSON.parse(localStorage.getItem(DEMO_BOOKED_SEATS_KEY) || '{}');
      const routeSeats = seatsReg[currentRoute] || [];
      if (routeSeats.includes(pickedSeat)) {
        alert('This seat is no longer available. Please select another seat.');
        await loadBookedSeats();
        resetDemoState();
        return;
      }
      const studentReg = JSON.parse(localStorage.getItem(DEMO_STUDENT_BOOKINGS_KEY) || '{}');
      const studentKey = studentId + '_' + currentRoute;
      if (studentReg[studentKey]) {
        alert('One student ID can select only one seat.');
        resetDemoState();
        return;
      }
      routeSeats.push(pickedSeat);
      seatsReg[currentRoute] = routeSeats;
      studentReg[studentKey] = pickedSeat;
      localStorage.setItem(DEMO_BOOKED_SEATS_KEY, JSON.stringify(seatsReg));
      localStorage.setItem(DEMO_STUDENT_BOOKINGS_KEY, JSON.stringify(studentReg));
    } catch {}
    const demoRef = 'UIU-DEMO-' + Date.now().toString().slice(-6);
    selectedSeatsList.forEach(seatId => {
      bookedSeatIds.add(seatId);
      const seatElement = document.getElementById(seatId);
      if (seatElement) {
        seatElement.disabled = true;
        seatElement.classList.remove('bg-lime-500', 'hover:bg-slate-200');
        seatElement.classList.add('bg-red-500', 'text-white', 'cursor-not-allowed', 'opacity-70');
        seatElement.setAttribute('data-seat-status', 'BOOKED');
        seatElement.setAttribute('title', 'Already booked');
      }
    });
    ['booking-reference-inline', 'booking-reference-success'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = demoRef;
    });
    const wrapDemo = document.getElementById('booking-reference-wrap');
    if (wrapDemo) wrapDemo.classList.remove('hidden');
    const tgNoteDemo = document.getElementById('success-telegram-note');
    if (tgNoteDemo) tgNoteDemo.innerText = tgChatId
      ? '🚌 Bus-near Telegram alerts ON for this booking.'
      : '🚌 Tip: add your Telegram Chat ID next time for bus-near alerts.';
    studentTripBooking = { seat_code: selectedSeatsList[0], booking_reference: demoRef };
    clearPendingSelection();
    document.getElementById('first-one').classList.add('hidden');
    document.getElementById('successfull-section').classList.remove('hidden');
    isBooking = false;
    if (nextBtn) { nextBtn.innerText = 'Book Now'; validateNextButton(); }
    return;
  }
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (currentUser && currentUser.token) headers['token'] = currentUser.token;
    const response = await fetch(`${API_BASE}create_booking.php`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: nameValue, phone: phoneValue, email: emailValue, route: currentRoute, trip_id: currentTripId, seats: selectedSeatsList, student_id: studentId, telegram_chat_id: tgChatId })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Booking could not be completed.');
    console.log('Booking successful:', data.booking);
    selectedSeatsList.forEach(seatId => {
      bookedSeatIds.add(seatId);
      const seatElement = document.getElementById(seatId);
      if (seatElement) {
        seatElement.disabled = true;
        seatElement.classList.remove('bg-lime-500','hover:bg-slate-200');
        seatElement.classList.add('bg-red-500','text-white','cursor-not-allowed','opacity-70');
        seatElement.setAttribute('data-seat-status', 'BOOKED');
        seatElement.setAttribute('title', 'Already booked');
      }
    });
    // Update both booking refs (inline + success) — fixes duplicate-id bug
    ['booking-reference-inline', 'booking-reference-success', 'booking-reference'].forEach(id => {
      const el = document.getElementById(id);
      if (el && data.booking) el.innerText = data.booking.booking_reference;
    });
    const wrap = document.getElementById('booking-reference-wrap');
    if (wrap) wrap.classList.remove('hidden');
    const tgNote = document.getElementById('success-telegram-note');
    if (tgNote) tgNote.innerText = tgChatId
      ? '🚌 Bus-near Telegram alerts ON for this booking.'
      : '🚌 Tip: add your Telegram Chat ID next time for bus-near alerts.';
    studentTripBooking = { seat_code: selectedSeatsList[0], booking_reference: data.booking ? data.booking.booking_reference : '' };
    clearPendingSelection();
    // Clear my picker silently BEFORE the fresh repaint — otherwise the
    // just-booked seat looks like "taken by someone else" and mis-alerts.
    selectedSeatsList = [];
    selectedSeatCount = 0;
    try {
      setInnerText('selected-seat', 0);
      const cont = document.getElementById('booking-seat-container');
      if (cont) cont.innerHTML = '';
    } catch {}
    await loadBookedSeats();
    document.getElementById('first-one').classList.add('hidden');
    document.getElementById('successfull-section').classList.remove('hidden');
  } catch (error) {
    console.error('Booking error:', error);
    alert(error.message || 'Booking failed. Please try again.');
  } finally {
    isBooking = false;
    if (nextBtn) { nextBtn.innerText = 'Book Now'; validateNextButton(); }
  }
}
