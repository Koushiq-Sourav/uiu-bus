/* =========================================================
   PARTITION: LIVE LOCATION / MAP
   ---------------------------------------------------------
   Leaflet + OpenStreetMap (no API key).
   - initLiveMap() creates map centered on UIU
   - showLiveRoute() draws colored polyline per route
   - startLiveLocation() watches geolocation
   ========================================================= */

let liveMap = null;
let liveUserMarker = null;
let liveAccuracyCircle = null;
let liveLocationWatchId = null;
let liveRoutePolyline = null;
let liveRoadRouteCache = {};
let liveBusMarker = null;
let liveBusPollTimer = null;
let liveBusTripId = null;

const liveRouteData = {
  Dhanmondi: {
    name: "ROUTE: 01 Dhanmondi",
    color: "#84cc16",
    path: [
      { lat: 23.7559, lng: 90.3744 },
      { lat: 23.7568, lng: 90.3795 },
      { lat: 23.7379, lng: 90.3867 },
      { lat: 23.7388, lng: 90.3956 },
      { lat: 23.7457, lng: 90.4120 },
      { lat: 23.7806, lng: 90.4140 },
      { lat: 23.7966, lng: 90.4495 }
    ]
  },
  Mirpur: {
    name: "ROUTE: 02 Mirpur",
    color: "#2563eb",
    path: [
      { lat: 23.8068, lng: 90.3689 },
      { lat: 23.8160, lng: 90.3654 },
      { lat: 23.8265, lng: 90.3652 },
      { lat: 23.8223, lng: 90.4032 },
      { lat: 23.8166, lng: 90.4256 },
      { lat: 23.7908, lng: 90.4254 },
      { lat: 23.7966, lng: 90.4495 }
    ]
  },
  Signboard: {
    name: "ROUTE: 03 Signboard",
    color: "#dc2626",
    path: [
      { lat: 23.7037, lng: 90.4307 },
      { lat: 23.7065, lng: 90.4400 },
      { lat: 23.7112, lng: 90.4590 },
      { lat: 23.7510, lng: 90.4230 },
      { lat: 23.7806, lng: 90.4140 },
      { lat: 23.7966, lng: 90.4495 }
    ]
  },
  Jatrabari: {
    name: "ROUTE: 04 Jatrabari",
    color: "#9333ea",
    path: [
      { lat: 23.7104, lng: 90.4358 },
      { lat: 23.7200, lng: 90.4320 },
      { lat: 23.7355, lng: 90.4260 },
      { lat: 23.7540, lng: 90.4200 },
      { lat: 23.7806, lng: 90.4140 },
      { lat: 23.7966, lng: 90.4495 }
    ]
  },
  Palashi: {
    name: "ROUTE: 05 Palashi",
    color: "#ea580c",
    path: [
      { lat: 23.7287, lng: 90.3835 },
      { lat: 23.7315, lng: 90.3890 },
      { lat: 23.7368, lng: 90.3970 },
      { lat: 23.7457, lng: 90.4120 },
      { lat: 23.7806, lng: 90.4140 },
      { lat: 23.7966, lng: 90.4495 }
    ]
  },
  Uttara: {
    name: "ROUTE: 06 Uttara",
    color: "#0891b2",
    path: [
      { lat: 23.8759, lng: 90.3795 },
      { lat: 23.8700, lng: 90.4000 },
      { lat: 23.8510, lng: 90.4050 },
      { lat: 23.8330, lng: 90.4200 },
      { lat: 23.8170, lng: 90.4250 },
      { lat: 23.7966, lng: 90.4495 }
    ]
  }
};

async function initLiveMap() {
  const mapElement = document.getElementById("live-map");
  if (!mapElement || typeof L === "undefined") return;
  liveMap = L.map('live-map').setView([UIU_LOCATION.lat, UIU_LOCATION.lng], 12);
  L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'
  }).addTo(liveMap);
  L.marker([UIU_LOCATION.lat, UIU_LOCATION.lng]).addTo(liveMap).bindPopup("United International University");
  await showLiveRoute("Dhanmondi");
  startLiveLocation();
  refreshBusPolling();
}

// Get a road-following route from OSRM. The points in liveRouteData are
// waypoints/stops, not the final line. OSRM snaps and connects them using
// the actual road network. Duration/distance are cached alongside for ETA.
let liveRouteStatsCache = {};
async function getRoadRoute(routeKey) {
  if (liveRoadRouteCache[routeKey]) return liveRoadRouteCache[routeKey];
  const route = liveRouteData[routeKey];
  if (!route || !route.path || route.path.length < 2) return null;
  const coords = route.path.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Routing HTTP ${response.status}`);
    const data = await response.json();
    if (!data.routes || !data.routes.length) throw new Error('No road route returned');
    const geometry = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    liveRoadRouteCache[routeKey] = geometry;
    if (Number.isFinite(data.routes[0].duration) && Number.isFinite(data.routes[0].distance)) {
      liveRouteStatsCache[routeKey] = { durationS: data.routes[0].duration, distanceM: data.routes[0].distance, live: true };
    }
    return geometry;
  } catch (err) {
    console.warn(`Could not load road route for ${routeKey}; using straight-line fallback.`, err);
    return route.path;
  }
}

/* Road stats for ETA: { durationS, distanceM, live:true (OSRM) | false (fallback) }.
   Reuses the full-route cache when showLiveRoute already fetched it;
   otherwise does a light overview=false request for duration only. */
async function getRouteStats(routeKey) {
  if (liveRouteStatsCache[routeKey]) return liveRouteStatsCache[routeKey];
  const route = liveRouteData[routeKey];
  if (!route || !route.path || route.path.length < 2) return null;
  const coords = route.path.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Routing HTTP ${response.status}`);
    const data = await response.json();
    if (!data.routes || !data.routes.length) throw new Error('No route stats returned');
    const stats = { durationS: data.routes[0].duration, distanceM: data.routes[0].distance, live: true };
    if (!Number.isFinite(stats.durationS) || !Number.isFinite(stats.distanceM)) throw new Error('Bad stats');
    liveRouteStatsCache[routeKey] = stats;
    return stats;
  } catch (err) {
    console.warn(`Could not load road stats for ${routeKey}; ETA falls back to schedule.`, err);
    return { durationS: null, distanceM: null, live: false };
  }
}

async function showLiveRoute(routeKey) {
  if (!liveMap || !liveRouteData[routeKey]) return;
  currentLiveRoute = routeKey;
  const route = liveRouteData[routeKey];
  const routeName = document.getElementById("live-route-name");
  if (routeName) routeName.innerText = route.name;
  document.querySelectorAll(".live-route-btn").forEach(button => {
    button.classList.toggle("active", button.getAttribute("data-live-route") === routeKey);
  });

  if (liveRoutePolyline) liveMap.removeLayer(liveRoutePolyline);
  if (routeName) routeName.innerText = `${route.name} (loading roads...)`;

  const roadPath = await getRoadRoute(routeKey);
  if (!roadPath || currentLiveRoute !== routeKey) return;
  const latLngs = roadPath.map(point => [point.lat, point.lng]);
  liveRoutePolyline = L.polyline(latLngs, { color: route.color, weight: 5, opacity: 0.9 }).addTo(liveMap);
  if (routeName) routeName.innerText = route.name;
  liveMap.fitBounds(liveRoutePolyline.getBounds(), { padding: [20, 20] });
}

function initLiveLocationButtons() {
  document.querySelectorAll(".route-select-btn").forEach(button => {
    button.addEventListener("click", function () {
      const routeKey = this.getAttribute("data-route");
      if (!liveRouteData[routeKey]) return;
      showLiveRoute(routeKey);
      const liveSection = document.getElementById("live-location-section");
      if (liveSection) liveSection.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  document.querySelectorAll(".live-route-btn").forEach(button => {
    button.addEventListener("click", function () { showLiveRoute(this.getAttribute("data-live-route")); });
  });
  const myLocationButton = document.getElementById("my-location-btn");
  if (myLocationButton) myLocationButton.addEventListener("click", centerOnMyLocation);
  const directionsButton = document.getElementById("get-directions-btn");
  if (directionsButton) directionsButton.addEventListener("click", getDirections);
  const stopButton = document.getElementById("stop-location-btn");
  if (stopButton) stopButton.addEventListener("click", stopLiveLocation);
}

function startLiveLocation() {
  const status = document.getElementById("live-location-status");
  if (!navigator.geolocation) { if (status) status.innerText = "Geolocation is not supported"; return; }
  if (status) status.innerText = "Requesting location permission...";
  liveLocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      updateLiveUserLocation(latitude, longitude, accuracy);
      if (status) status.innerText = "Live location active";
    },
    (error) => {
      if (!status) return;
      const errorMessages = { 1: "Location permission denied", 2: "Location unavailable", 3: "Location request timed out" };
      status.innerText = errorMessages[error.code] || "Unable to get location";
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function updateLiveUserLocation(latitude, longitude, accuracy) {
  if (!liveMap) return;
  const position = [latitude, longitude];
  if (typeof saveTelegramUserLocation === 'function') {
    saveTelegramUserLocation(latitude, longitude, accuracy);
  }
  if (!liveUserMarker) liveUserMarker = L.marker(position).addTo(liveMap).bindPopup("My Live Location");
  else liveUserMarker.setLatLng(position);
  if (!liveAccuracyCircle) liveAccuracyCircle = L.circle(position, { radius: accuracy, fillOpacity: 0.12, opacity: 0.4, weight: 1 }).addTo(liveMap);
  else { liveAccuracyCircle.setLatLng(position); liveAccuracyCircle.setRadius(accuracy); }
}

function centerOnMyLocation() {
  if (!liveUserMarker || !liveMap) { startLiveLocation(); return; }
  liveMap.setView(liveUserMarker.getLatLng(), 16);
}

function getDirections() {
  let url = "https://www.google.com/maps/dir/?api=1" + "&destination=" + encodeURIComponent("United International University, Madani Avenue, Badda, Dhaka");
  if (liveUserMarker) { const position = liveUserMarker.getLatLng(); url += "&origin=" + encodeURIComponent(`${position.lat},${position.lng}`); }
  window.open(url, "_blank");
}

function stopLiveLocation() {
  if (liveLocationWatchId !== null) { navigator.geolocation.clearWatch(liveLocationWatchId); liveLocationWatchId = null; }
  const status = document.getElementById("live-location-status");
  if (status) status.innerText = "Live location stopped";
}

/* =========================================================
   LIVE BUS MARKER — real driver GPS for the CURRENT trip.
   Polls GET bus_location.php?trip_id= every 10s (driver mirror
   keeps it fresh). Stale >10min is hidden so students never
   chase a ghost bus. Demo simulation (telegram.js) is separate.
   ========================================================= */
function stopBusPolling() {
  if (liveBusPollTimer) { try { clearInterval(liveBusPollTimer); } catch {} liveBusPollTimer = null; }
  liveBusTripId = null;
  if (liveBusMarker && liveMap) { try { liveMap.removeLayer(liveBusMarker); } catch {} liveBusMarker = null; }
}

function refreshBusPolling() {
  const id = (typeof currentTripId !== 'undefined') ? currentTripId : null;
  if (!id || id === -1) { stopBusPolling(); return; }
  if (liveBusTripId === id && liveBusPollTimer) return;
  stopBusPolling();
  liveBusTripId = id;
  updateBusMarker();
  liveBusPollTimer = setInterval(updateBusMarker, 10000);
}

async function updateBusMarker() {
  if (!liveMap || !liveBusTripId || liveBusTripId === -1) return;
  if (typeof fetchBusLocation !== 'function') return;
  let loc = null;
  try { loc = await fetchBusLocation(liveBusTripId); } catch { return; }
  if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) return;
  const lat = Number(loc.lat), lng = Number(loc.lng);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
  let ageS = null;
  try { if (loc.updated_at) ageS = Math.round((Date.now() - new Date(loc.updated_at).getTime()) / 1000); } catch {}
  // Stale >10min (same window as notify_nearby) — hide, don't mislead.
  if (ageS !== null && ageS > 600) {
    if (liveBusMarker) { try { liveMap.removeLayer(liveBusMarker); } catch {} liveBusMarker = null; }
    return;
  }
  const label = ageS === null ? 'Live bus' : `Live bus · ${ageS < 60 ? ageS + 's ago' : Math.floor(ageS / 60) + 'm ago'}`;
  if (!liveBusMarker) {
    liveBusMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: 'bus-live-icon', html: '🚌', iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(liveMap).bindPopup(label);
  } else {
    liveBusMarker.setLatLng([lat, lng]);
    liveBusMarker.bindPopup(label);
  }
}
