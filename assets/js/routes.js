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

/* Shared route-selection entry point: used by the Destination dropdown,
   the live-map buttons AND the Search results. */
async function selectRoute(routeKey) {
  const routeData = busRoutes[routeKey];
  if (!routeData) return;
  currentRoute = routeKey;
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
  validateNextButton();
}

function showRouteInfoCard(routeData, { routeTitle, routeStopsList, routeDisplaySection }) {
  routeTitle.innerText = routeData.title;
  routeStopsList.innerHTML = '';
  routeData.stops.forEach((stop, index) => {
    const li = document.createElement('li');
    li.className = 'bg-slate-800/80 border border-slate-700/60 p-3 rounded-xl flex items-center gap-3 text-sm';
    li.innerHTML = `<span class="bg-lime-500/20 text-lime-400 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">${index + 1}</span> <span>${stop}</span>`;
    routeStopsList.appendChild(li);
  });
  routeDisplaySection.classList.remove('hidden');
  routeDisplaySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
