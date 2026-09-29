/* =========================================================
   PARTITION: CONFIGURATION & GLOBAL STATE
   ---------------------------------------------------------
   Central place for all shared state.
   Loaded FIRST before any other module.
   ========================================================= */

// --- Booking / Seat State ---
// NO MONEY: fares removed. One student = one seat (by login ID).
const maxAllowedSeats = 1;
let availableSeat = 40;
let selectedSeatCount = 0;
let selectedSeatsList = [];

let currentRoute = 'Dhanmondi';
let currentTripId = null;
let bookedSeatIds = new Set();
let isBooking = false;

// Trip times (filled by api.js from backend, fallback = routes.js per-route times)
let currentDepartureTime = '';
let currentArrivalTime = '';

const API_BASE = 'api/';
// NO MONEY: all fares/amounts removed. One student ID = one seat.

// --- Auth State (AUTH PORTAL PARTITION) ---
// currentUser = { username, name, role: 'STUDENT'|'DRIVER', token }
let currentUser = null; // { student_id, name, token }
const AUTH_STORAGE_KEY = 'uiu_bus_auth';
const THEME_STORAGE_KEY = 'uiu_bus_theme';
const PENDING_SELECTION_KEY = 'uiu_pending_selection';
const DEMO_USERS_KEY = 'uiu_bus_users';
const DEMO_BOOKED_SEATS_KEY = 'uiu_bus_demo_booked_seats';
const DEMO_STUDENT_BOOKINGS_KEY = 'uiu_bus_demo_student_bookings';

// The logged-in student's own confirmed booking on the CURRENT trip
// (null until loaded). Used for the banner + one-seat block.
let studentTripBooking = null; // { seat_code, booking_reference }

// True when "Book Now" was clicked while logged out: after login,
// booking continues automatically without losing the selected seat.
let pendingBookingAfterAuth = false;

// Driver location sharing state (memory only — never persisted).
let driverWatchId = null;
let driverLocationState = { lat: null, lng: null, accuracy: null, updatedAt: null, sharing: false };

// Driver's ACTIVE trip whose bus marker gets updated on every GPS fix.
// Persisted per-driver so refresh/login keeps broadcasting to the same trip.
let driverActiveTripId = null;
const DRIVER_TRIP_KEY = 'uiu_bus_driver_trip';
try {
  const savedTrip = localStorage.getItem(DRIVER_TRIP_KEY);
  if (savedTrip) driverActiveTripId = Number(savedTrip) || null;
} catch { /* ignore */ }

// Restore auth from localStorage on load (normalize legacy sessions)
try {
  const saved = localStorage.getItem(AUTH_STORAGE_KEY);
  if (saved) {
    currentUser = JSON.parse(saved);
    if (currentUser) {
      if (!currentUser.username && currentUser.student_id) currentUser.username = currentUser.student_id;
      if (!currentUser.role) currentUser.role = 'STUDENT';
    }
  }
} catch { /* ignore */ }

// --- Map Constants ---
const UIU_LOCATION = { lat: 23.7966, lng: 90.4495 };
let currentLiveRoute = "Dhanmondi";

/* Local service date (YYYY-MM-DD) for ALL trip queries.
   Must be local — toISOString() is UTC and shows yesterday's trips
   in the evening (Dhaka = UTC+6), so driver retimes would never match
   the student's trip. Backend CURDATE() is server-local too. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
