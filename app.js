import { getJulianDate, getLocalSiderealTime, getAltAz, getSunPosition, getLunarPosition } from './astro-calc.js';
import { CITIES } from './cities.js';

let starsData = [];
let drawnStars = [];
const canvas = document.getElementById('starmap-canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('star-tooltip');
let devicePixelRatio = window.devicePixelRatio || 1;

// Location-picker tabs + panels
const tabCity = document.getElementById('tab-city');
const tabGps = document.getElementById('tab-gps');
const tabDevice = document.getElementById('tab-device');
const panelCity = document.getElementById('panel-city');
const panelGps = document.getElementById('panel-gps');
const panelDevice = document.getElementById('panel-device');

// City search
const citySearch = document.getElementById('city-search');
const cityDropdown = document.getElementById('city-dropdown');
const citySelected = document.getElementById('city-selected');
const citySelectedText = document.getElementById('city-selected-text');
const cityClearBtn = document.getElementById('city-clear-btn');

// GPS coords (canonical state — drawMap reads these)
const latInput = document.getElementById('lat-input');
const lonInput = document.getElementById('lon-input');

// My Device
const getLocationBtn = document.getElementById('get-location-btn');
const deviceCoords = document.getElementById('device-coords');

// Date + actions
const dateInput = document.getElementById('date-input');
const updateBtn = document.getElementById('update-btn');
const liveBtn = document.getElementById('live-btn');
const liveText = document.getElementById('live-text');
const errorMsg = document.getElementById('error-msg');

let constellationLabels = [];
let isLive = false;
let animationFrameId = null;

// Default GPS coordinates icon (restored on the My Device button between requests)
const PIN_SVG = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>';

function init() {
  // Set default datetime to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  // Tab switching
  [tabCity, tabGps, tabDevice].forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // City search
  citySearch.addEventListener('input', onCityInput);
  citySearch.addEventListener('keydown', onCityKeydown);
  cityClearBtn.addEventListener('click', clearCity);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) closeDropdown();
  });

  // My Device geolocation
  getLocationBtn.addEventListener('click', requestDeviceLocation);

  // Actions
  updateBtn.addEventListener('click', () => { clearError(); drawMap(); });
  liveBtn.addEventListener('click', toggleLive);

  // Reflect the default coordinates onto the City Search badge, if they match a city.
  syncInitialCity();

  // Resize canvas setup
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Hover events for tooltip
  canvas.addEventListener('mousemove', handleHover);
  canvas.addEventListener('mouseout', () => tooltip.hidden = true);

  loadData();
}

async function loadData() {
  try {
    const res = await fetch('stars.json');
    starsData = await res.json();
    computeConstellations();
    drawMap();
  } catch (err) {
    console.error("Failed to load stars dataset.", err);
  }
}

/* ── TAB SWITCHING ──────────────────────────────────────────── */
function switchTab(tab) {
  clearError();
  [tabCity, tabGps, tabDevice].forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  panelCity.hidden = (tab !== 'city');
  panelGps.hidden = (tab !== 'gps');
  panelDevice.hidden = (tab !== 'device');
}

/* ── CITY SEARCH & DROPDOWN ─────────────────────────────────── */
let highlightIndex = -1;

function onCityInput() {
  const query = citySearch.value.trim().toLowerCase();
  highlightIndex = -1;

  if (query.length < 1) {
    closeDropdown();
    return;
  }

  // Match on city name or country; prioritise name-starts-with, then name, then country.
  const matches = CITIES
    .filter((c) => c.name.toLowerCase().includes(query) || c.country.toLowerCase().includes(query))
    .sort((a, b) => rank(a, query) - rank(b, query))
    .slice(0, 8);

  if (matches.length === 0) {
    closeDropdown();
    return;
  }

  cityDropdown.innerHTML = '';
  matches.forEach((city, i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.index = i;
    li.innerHTML = `<span class="city-name"></span><span class="city-country"></span>`;
    li.querySelector('.city-name').textContent = city.name;
    li.querySelector('.city-country').textContent = city.country;
    li.addEventListener('click', () => selectCity(city));
    li.addEventListener('mouseenter', () => setHighlight(i));
    cityDropdown.appendChild(li);
  });

  cityDropdown._matches = matches;
  cityDropdown.removeAttribute('hidden');
  citySearch.setAttribute('aria-expanded', 'true');
}

// Lower rank sorts first: name starts-with (0) < name contains (1) < country only (2).
function rank(city, query) {
  const name = city.name.toLowerCase();
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  return 2;
}

function onCityKeydown(e) {
  const items = cityDropdown.querySelectorAll('li');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setHighlight(Math.min(highlightIndex + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setHighlight(Math.max(highlightIndex - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (highlightIndex >= 0 && cityDropdown._matches) {
      selectCity(cityDropdown._matches[highlightIndex]);
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
}

function setHighlight(index) {
  const items = cityDropdown.querySelectorAll('li');
  items.forEach((li, i) => li.classList.toggle('highlighted', i === index));
  highlightIndex = index;
}

function selectCity(city) {
  latInput.value = city.lat;
  lonInput.value = city.lon;
  citySearch.value = '';
  closeDropdown();

  citySelectedText.textContent = `${city.name}, ${city.country}`;
  citySelected.removeAttribute('hidden');

  clearError();
  drawMap();
}

function clearCity() {
  citySelected.setAttribute('hidden', '');
  citySearch.value = '';
  citySearch.focus();
}

function closeDropdown() {
  cityDropdown.setAttribute('hidden', '');
  citySearch.setAttribute('aria-expanded', 'false');
  cityDropdown.innerHTML = '';
}

// On load, show the badge for the default coordinates if they match a known city.
function syncInitialCity() {
  const la = parseFloat(latInput.value);
  const lo = parseFloat(lonInput.value);
  if (isNaN(la) || isNaN(lo)) return;
  const match = CITIES.find((c) => Math.abs(c.lat - la) < 0.05 && Math.abs(c.lon - lo) < 0.05);
  if (match) {
    citySelectedText.textContent = `${match.name}, ${match.country}`;
    citySelected.removeAttribute('hidden');
  }
}

/* ── MY DEVICE GEOLOCATION ──────────────────────────────────── */
function requestDeviceLocation() {
  clearError();
  if (!('geolocation' in navigator)) {
    showError('Geolocation is not supported by this browser.');
    return;
  }

  getLocationBtn.disabled = true;
  getLocationBtn.innerHTML = 'Requesting…';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      latInput.value = lat.toFixed(4);
      lonInput.value = lon.toFixed(4);

      deviceCoords.textContent = `📍 ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
      deviceCoords.removeAttribute('hidden');

      getLocationBtn.disabled = false;
      getLocationBtn.innerHTML = `${PIN_SVG} Location Retrieved ✓`;

      // A device fix usually won't match a catalogue city — clear the badge.
      citySelected.setAttribute('hidden', '');
      drawMap();
    },
    (err) => {
      getLocationBtn.disabled = false;
      getLocationBtn.innerHTML = `${PIN_SVG} Get My Location`;
      const messages = {
        1: 'Location access was denied. Please allow location in browser settings.',
        2: 'Location unavailable (device signal issue).',
        3: 'Location request timed out.',
      };
      showError(messages[err.code] || 'Unknown geolocation error.');
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

/* ── ERROR MESSAGING ────────────────────────────────────────── */
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.removeAttribute('hidden');
}

function clearError() {
  errorMsg.setAttribute('hidden', '');
  errorMsg.textContent = '';
}

function toggleLive() {
  isLive = !isLive;
  if (isLive) {
    liveBtn.classList.add('active');
    liveText.innerText = 'Live View: ON';
    updateClockAndDraw();
  } else {
    liveBtn.classList.remove('active');
    liveText.innerText = 'Live View: OFF';
    cancelAnimationFrame(animationFrameId);
  }
}

function updateClockAndDraw() {
  if (!isLive) return;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  drawMap();
  animationFrameId = requestAnimationFrame(updateClockAndDraw);
}

function computeConstellations() {
  let conMap = {};
  for (let s of starsData) {
    if (s.c) {
      if (!conMap[s.c]) conMap[s.c] = { sumRA: 0, sumDec: 0, weight: 0 };
      let w = Math.max(0.1, 5.0 - s.m);
      conMap[s.c].sumRA += s.r * w;
      conMap[s.c].sumDec += s.d * w;
      conMap[s.c].weight += w;
    }
  }

  constellationLabels = [];
  for (let c in conMap) {
     if (conMap[c].weight > 0) {
        constellationLabels.push({
           c: c,
           r: conMap[c].sumRA / conMap[c].weight,
           d: conMap[c].sumDec / conMap[c].weight
        });
     }
  }
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  drawMap();
}

function drawMap() {
  if (!starsData.length) return;

  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  const localDateStr = dateInput.value;
  if (isNaN(lat) || isNaN(lon) || !localDateStr) return;

  const obsDate = new Date(localDateStr);
  const jd = getJulianDate(obsDate);
  const lst = getLocalSiderealTime(jd, lon);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) * 0.95; // 5% padding

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawnStars = [];

  // Draw background sky sphere grid (optional minimal altitude rings)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  for (let alt = 0; alt <= 60; alt += 30) {
     const r = ((90 - alt) / 90) * radius;
     ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  // Iterate stars
  for (let s of starsData) {
    const ra = s.r;
    const dec = s.d;
    const mag = s.m;

    const { alt, az } = getAltAz(ra, dec, lat, lst);

    // Filter out stars below horizon
    if (alt < 0) continue;

    // Stereographic projection: Zenith is center (Alt=90)
    // Distance from center represents Zenith Distance (90 - alt)
    // Map bounds: 90 - 0 altitude fits into 'radius'
    const r = ((90 - alt) / 90) * radius;

    // Canvas coordinates: North is -Y (up), East is -X (left) if looking up
    // Wait, typical printed star chart (looking UP):
    // If North is top, Az=0 -> -Y. Az=90 (East) -> -X.
    // X = cx - r * sin(az)
    // Y = cy - r * cos(az)
    const azRad = az * Math.PI / 180.0;
    const x = cx - r * Math.sin(azRad);
    const y = cy - r * Math.cos(azRad);

    // Calculate star size and opacity based on magnitude
    // Magnitude scale is inverted (lower means brighter). 6.5 is limit.
    const size = Math.max(0.5, (6.5 - mag) * 0.8) * devicePixelRatio;
    const opacity = Math.max(0.1, 1.0 - (mag / 8.0));

    // Colors roughly mimicking stellar classes if we wanted, but white/blue-ish works ok.
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Emphasize bright stars
    if (mag < 1.5) {
      ctx.shadowBlur = 4 * devicePixelRatio;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
      ctx.shadowBlur = 0; // reset
    }

    // Save drawn position for hover events
    drawnStars.push({ x, y, size, data: s });
  }

  // Draw constellation labels
  ctx.font = `600 ${10 * devicePixelRatio}px "Inter", sans-serif`;
  ctx.fillStyle = 'rgba(130, 170, 255, 0.4)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let cl of constellationLabels) {
    const { alt, az } = getAltAz(cl.r, cl.d, lat, lst);
    if (alt < 0) continue;
    const rL = ((90 - alt) / 90) * radius;
    const azRadL = az * Math.PI / 180.0;
    const xL = cx - rL * Math.sin(azRadL);
    const yL = cy - rL * Math.cos(azRadL);
    ctx.fillText(cl.c, xL, yL);
  }

  // Helper to draw Sun/Moon
  const drawBody = (pos, color, sizeMultiplier, label) => {
    const { alt, az } = getAltAz(pos.r, pos.d, lat, lst);
    if (alt < 0) return;

    const rB = ((90 - alt) / 90) * radius;
    const azRadB = az * Math.PI / 180.0;
    const xB = cx - rB * Math.sin(azRadB);
    const yB = cy - rB * Math.cos(azRadB);

    ctx.shadowBlur = 10 * devicePixelRatio;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(xB, yB, 5 * devicePixelRatio * sizeMultiplier, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `600 ${9 * devicePixelRatio}px "Inter", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(label, xB, yB + 14 * devicePixelRatio);
  };

  const sunPos = getSunPosition(jd);
  drawBody(sunPos, '#ffd700', 1.5, 'SUN');

  const moonPos = getLunarPosition(jd);
  drawBody(moonPos, '#e0e8ff', 1.2, 'MOON');
}

function handleHover(e) {
  const rect = canvas.getBoundingClientRect();
  // Adjust mouse pos to internal resolution
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);

  let hoveredStar = null;
  let minDist = 10 * devicePixelRatio; // detection radius

  for (let s of drawnStars) {
    const dx = s.x - mx;
    const dy = s.y - my;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < minDist) {
      minDist = dist;
      hoveredStar = s;
    }
  }

  if (hoveredStar && (hoveredStar.data.n || hoveredStar.data.c)) {
    tooltip.hidden = false;
    tooltip.style.left = `${e.clientX}px`;
    tooltip.style.top = `${e.clientY}px`;
    let label = hoveredStar.data.n || hoveredStar.data.c;
    tooltip.innerText = `${label} (Mag ${hoveredStar.data.m.toFixed(1)})`;
  } else {
    tooltip.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', init);
