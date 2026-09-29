# UIU Shuttle — Architecture

## Stack
HTML5 + Tailwind + DaisyUI 4.7.2 + Vanilla JS + Leaflet 1.9.4 (OSM) ↔ PHP 8 PDO (MySQL/MariaDB)

## File Responsibility Map

### Frontend — Presentation (`index.html` + `assets/`)
`index.html:1` single-page, 500 lines, 6 sections:
1. **Nav** `21` — `route-select-btn` `data-route` Dhanmondi/Mirpur/Signboard/Jatrabari/Palashi/Uttara
2. **Hero** `103` `.banner-hero` CTA → `#purchase-section`
3. **Route Card** `121` `#route-info-display.hidden` dynamic `#route-title` + `#route-stops-list`
4. **Shuttle Info** `152` `#display-route-name`, `#display-boarding-points`, `#seats-left` (40), 550 Taka
5. **Booking** `202` seat grid `222` (JS `document.write` A-J×4) + summary `#booking-seat-container` `#total-cost` `#grand-total` + form `#passenger-name/phone/email` `#next-btn`
6. **Carousel** `282` 4 slides + **Live Location** `317` Leaflet `#live-map` `.live-route-btn` `#live-route-name` `#live-location-status` `#my-location-btn` `#get-directions-btn` `#stop-location-btn`
7. **Success** `474` `#successfull-section.hidden`

`assets/css/style.css:1` — Inter/Raleway, `.banner-hero` `url('../images/banner.png')`, `.seats`, `.animate-fade-in`, `#next-btn:disabled`, `.live-route-selector/.live-map` (480px, responsive 768/480)

`assets/images/` — banner.png, bus icons, 4 slides pic-*.jpg, seat icons, success/playstore, svg, uiu-bus.png

### Frontend — Client Logic (`assets/js/` — 9 PARTITIONS, load order matters)
> Load order in `index.html:432-441`: `config.js → utils.js → api.js → auth.js → routes.js → seats.js → booking.js → map.js → app.js`

| File `assets/js/` | Partition | Lines | Owns |
|---|---|---|---|
| `config.js:1` | **CONFIG / GLOBAL STATE** | 34 | `maxAllowedSeats=4`, `availableSeat=40`, `selectedSeatCount`, `selectedSeatsList`, `currentRoute`, `currentTripId`, `bookedSeatIds Set`, `isBooking`, `API_BASE='api/'`, `SEAT_FARE=550`, `currentUser`, `AUTH_STORAGE_KEY`, `UIU_LOCATION` |
| `utils.js:1` | **HELPERS (SHARED)** | 54 | Pure DOM: `setBackgroundColorById()`, `setSeatSelectedStyle()` lime, `setInnerText()`, `totalCost()`, `grandTotalCost()` — no API, no auth |
| `api.js:1` | **API / DATABASE LAYER** | 73 | `loadTripAndSeats()` `GET get_trip.php?route=&date=` → `currentTripId` → `loadBookedSeats()` `GET get_seats.php?trip_id=` paints red disabled, updates `#seats-left` |
| `auth.js:1` | **🔐 LOGIN** | 138 | `initAuth()`, `openLoginModal()`, `handleLogin()` `POST login.php` → `localStorage`, `handleLogout()`, `isLoggedIn()`, `updateAuthUI()` — gates `booking.js:Next()` |
| `routes.js:1` | **🛣️ ROUTES** | 106 | `busRoutes` 6 routes ×7 stops → `initRouteDropdown()` `showRouteInfoCard()` `updateShuttleInfoSection()` — resets selection/totals, calls `loadTripAndSeats()` |
| `seats.js:1` | **💺 SEAT CHOOSING** | 56 | `initSeatSelection()` `handleSeatClick()` guards booked/disabled/duplicate/max4 → `setSeatSelectedStyle()` `addSeatToBookingList()` `totalCost()` `validateNextButton()` |
| `booking.js:1` | **🧾 BOOKING** | 95 | `initPassengerFormValidation()` `validateNextButton()` (seat+name+phone) → `Next()` login gate + `POST create_booking.php` tx → marks red, shows `#successfull-section` |
| `map.js:1` | **🗺️ LIVE LOCATION** | 186 | `initLiveMap()` OSM + UIU marker 23.7966,90.4495, `showLiveRoute()` colored polyline per `liveRouteData`, `startLiveLocation()` watchPosition `updateLiveUserLocation()`, `centerOnMyLocation()` `getDirections()` `stopLiveLocation()` |
| `app.js:1` | **ENTRY / ORCHESTRATOR** | 39 | `DOMContentLoaded` wires all: `initAuth()`, `initSeatSelection()`, `initPassengerFormValidation()`, `initRouteDropdown()`, `initLiveMap()`, `initLiveLocationButtons()`, `loadTripAndSeats()` — no business logic |

No framework, no build step — copy `assets/` as-is.

### Backend — API (`api/` — 6 files, each PARTITION header)
`api/config.php:1` **PARTITION: CONFIG** — PDO `127.0.0.1` `uiu_shuttle` `root/''`, `json_input()` `json_response()` — shared by all
`api/get_trip.php:1` **PARTITION: API / TRIP LOOKUP** — `GET ?route&date` → `SELECT t.trip_id,r.route_code,service_date,departure_time,fare FROM trips JOIN routes WHERE route_name=? AND service_date=?`
`api/get_seats.php:1` **PARTITION: API / SEAT MAP** — `GET ?trip_id` → cleanup `HELD` expired (`held_until <= NOW()` → `AVAILABLE`) + return 40 seats with `effective_status` — FIXED 2026-09-15 (was `...` placeholder)
`api/create_booking.php:1` **PARTITION: BOOKING BACKEND** — `POST {name,phone,email,route,trip_id,seats[1..4]}` transactional `FOR UPDATE`: verify trip `SCHEDULED/BOARDING`, lock `trip_seats`, reject BOOKED/BLOCKED/unexpired HELD, upsert `passengers` by phone, `INSERT bookings CONFIRMED/UNPAID` `UIU-YYYYMMDDHHmmss-xxxxxx`, `UPDATE trip_seats→BOOKED` + `INSERT booking_seats`, commit
`api/login.php:1` **PARTITION: LOGIN** — `POST {student_id,password}` demo token (≥4 chars) → `{user, token}` — see `auth.js`
`api/logout.php:1` **PARTITION: LOGIN** — `POST` stateless → `{success}`

### Data — MySQL (`uiu_shuttle`)
`routes(route_id,route_code,route_name)` → `trips(trip_id,route_id,service_date,departure_time,arrival_time,fare,trip_status)` → `seats(seat_id,seat_code)` → `trip_seats(trip_seat_id,trip_id,seat_id,seat_status AVAILABLE/BOOKED/BLOCKED/HELD,held_until,booking_id)` → `passengers(passenger_id,full_name,phone,email)` → `bookings(booking_id,booking_reference,passenger_id,trip_id,seat_count,unit_fare,total_amount,booking_status,payment_status)` → `booking_seats(booking_id,trip_seat_id,seat_price)`

## Data Flow (booking)
1. Page load → `loadTripAndSeats()` today + `currentRoute=Dhanmondi` → `loadBookedSeats()` paints map
2. Click route → reset selection, `showRouteInfoCard()` + `loadTripAndSeats()` for new `trip_id`
3. Click seat → `handleSeatClick()` lime + list + `550` → `validateNextButton()`
4. Fill name+phone → Next enabled → `Next()` POST → tx → `CONFIRMED` → success screen
5. Map → `initLiveMap()` draws route polyline + watches geolocation; route buttons re-`showLiveRoute()` + `fitBounds()`

## Why This Separation Is Professional
- **No mixed concerns**: static (`assets/`) vs dynamic (`api/`) vs data (`database/`) vs docs (`docs/`)
- **XAMPP-compatible**: `index.html` + `api/` at root → `http://localhost/uiu-bus/` zero CORS
- **Cache-friendly**: `assets/` can be CDN-cached, `api/` never cached
- **Testable**: `utils.js` pure, `app.js` modules mockable, API testable via curl
- **Maintainable**: one place per concern — change color → `style.css`, booking rule → `create_booking.php`, map route → `app.js:liveRouteData`
