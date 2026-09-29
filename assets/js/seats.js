/* =========================================================
   PARTITION: SEAT CHOOSING
   ---------------------------------------------------------
   This is the "which one is for seat choosing" you asked for.
   All seat grid logic lives here.

    - initSeatSelection() attaches clicks to .seats
    - handleSeatClick() max 1 (one student = one seat), blocks booked/duplicate
    - addSeatToBookingList() appends to summary
    - Uses utils.js helpers: setSeatSelectedStyle, setInnerText

    Seats are A1-J4 (40). NO MONEY. Booking tied to login Student ID.
   ========================================================= */

function initSeatSelection() {
  const seatElements = document.getElementsByClassName('seats');
  for (const seat of seatElements) {
    seat.addEventListener('click', () => handleSeatClick(seat));
  }
}

function handleSeatClick(seat) {
  const seatId = seat.innerText.trim();
  if (bookedSeatIds.has(seatId)) { alert('This seat is already booked.'); return; }
  if (seat.disabled) return;
  // One student ID = one seat: a student that already booked this trip
  // (their own account only — other students are never affected) cannot
  // pick another seat.
  if (studentTripBooking) { alert('One student ID can select only one seat.'); return; }
  // Toggle: clicking an already selected seat deselects it (minimal fix)
  if (selectedSeatsList.includes(seatId)) {
    selectedSeatsList = selectedSeatsList.filter(s => s !== seatId);
    selectedSeatCount -= 1;
    availableSeat += 1;
    setInnerText('seats-left', availableSeat);
    setInnerText('selected-seat', selectedSeatCount);
    setSeatDeselectedStyle(seatId);
    const li = document.getElementById(`booked-${seatId}`);
    if (li) li.remove();
    if (typeof updatePendingSelectionSnapshot === 'function') updatePendingSelectionSnapshot();
    validateNextButton();
    return;
  }
  if (selectedSeatCount >= maxAllowedSeats) { alert('One student ID can select only one seat.'); return; }

  availableSeat -= 1;
  selectedSeatCount += 1;
  selectedSeatsList.push(seatId);

  setInnerText('seats-left', availableSeat);
  setInnerText('selected-seat', selectedSeatCount);
  setSeatSelectedStyle(seatId);
  addSeatToBookingList(seatId);
  if (typeof updatePendingSelectionSnapshot === 'function') updatePendingSelectionSnapshot();
  validateNextButton();
}

function addSeatToBookingList(seatId) {
  const bookingSeatContainer = document.getElementById('booking-seat-container');
  const li = document.createElement('li');
  li.id = `booked-${seatId}`;
  const seatCell = document.createElement('p');
  seatCell.innerText = seatId;
  li.appendChild(seatCell);
  bookingSeatContainer.appendChild(li);
}
