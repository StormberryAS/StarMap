import { getJulianDate, getLocalSiderealTime, getAltAz, getSunPosition, getLunarPosition } from './astro-calc.js';
// CITIES comes from the shared cities.js, loaded as a classic script by
// index.html before this module. Regenerate with GitHub/update_cities.py.

let starsData = [];
let drawnStars = [];
const canvas = document.getElementById('starmap-canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('star-tooltip');
let devicePixelRatio = window.devicePixelRatio || 1;

// Location-picker tabs + panels. There is no device-location option: the
// stormberry.as zone sends Permissions-Policy geolocation=(), which blocks it
// on every Labs host, so it was removed on 2026-10-02. A place comes from city
// search or from typed coordinates.
const tabCity = document.getElementById('tab-city');
const tabGps = document.getElementById('tab-gps');
const panelCity = document.getElementById('panel-city');
const panelGps = document.getElementById('panel-gps');

// City search
const citySearch = document.getElementById('city-search');
const cityDropdown = document.getElementById('city-dropdown');
const citySelected = document.getElementById('city-selected');
const citySelectedText = document.getElementById('city-selected-text');
const cityClearBtn = document.getElementById('city-clear-btn');

// GPS coords: the text fields, their inline messages and the "Using ..." line
const latInput = document.getElementById('lat-input');
const lonInput = document.getElementById('lon-input');
const latError = document.getElementById('lat-error');
const lonError = document.getElementById('lon-error');
const gpsEcho = document.getElementById('gps-echo');

// Date + actions
const dateInput = document.getElementById('date-input');
const updateBtn = document.getElementById('update-btn');
const liveBtn = document.getElementById('live-btn');
const liveText = document.getElementById('live-text');
const mapSection = document.getElementById('map-section');

let constellationLabels = [];
let isLive = false;
let animationFrameId = null;

// The place the chart is drawn for, as checked numbers ({ lat, lon }), or null
// while the typed coordinates cannot be read. drawMap reads this, never the
// text fields, so a half-typed value is never drawn.
let observer = null;

function init() {
  // Set default datetime to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  // The first-load place is the one written in the coordinate fields (Oslo).
  observer = {
    lat: parseDecimal(latInput.value, -90, 90) ?? 59.9139,
    lon: parseDecimal(lonInput.value, -180, 180) ?? 10.7522,
  };

  // Tab switching
  [tabCity, tabGps].forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // City search
  citySearch.addEventListener('input', onCityInput);
  citySearch.addEventListener('keydown', onCityKeydown);
  cityClearBtn.addEventListener('click', clearCity);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) closeDropdown();
  });

  // Editing a coordinate clears its message and the "Using ..." line, which
  // described the previous value, until the next Update.
  latInput.addEventListener('input', () => { setFieldError(latInput, latError, null); setEcho(null); });
  lonInput.addEventListener('input', () => { setFieldError(lonInput, lonError, null); setEcho(null); });

  // Actions
  updateBtn.addEventListener('click', () => { if (applyCoords()) drawMap(); });
  liveBtn.addEventListener('click', toggleLive);

  // Reflect the default coordinates onto the City Search badge, if they match a city.
  syncCityBadge();

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
  [tabCity, tabGps].forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
  panelCity.hidden = (tab !== 'city');
  panelGps.hidden = (tab !== 'gps');
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
  const qf = foldQuery(query);
  const matches = CITIES
    .filter((c) => c.fold.includes(qf) || c.alt.includes(qf) || c.cfold.includes(qf))
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
  observer = { lat: city.lat, lon: city.lon };
  // The fields now hold the city's coordinates, so any earlier message is moot.
  setFieldError(latInput, latError, null);
  setFieldError(lonInput, lonError, null);
  setEcho(null);
  citySearch.value = '';
  closeDropdown();

  citySelectedText.textContent = `${city.name}, ${city.country}`;
  citySelected.removeAttribute('hidden');

  showMap();
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

// Show the badge for the nearest known city within 0.05° of the current
// coordinates, and hide it if there is none. Used on load and after typed
// coordinates change.
function syncCityBadge() {
  if (!observer) return;
  const { lat: la, lon: lo } = observer;
  let match = null;
  let best = Infinity;
  for (const c of CITIES) {
    const dLat = Math.abs(c.lat - la);
    const dLon = Math.abs(c.lon - lo);
    if (dLat < 0.05 && dLon < 0.05 && dLat + dLon < best) { best = dLat + dLon; match = c; }
  }
  if (match) {
    citySelectedText.textContent = `${match.name}, ${match.country}`;
    citySelected.removeAttribute('hidden');
  } else {
    citySelected.setAttribute('hidden', '');
  }
}

/* ── TYPED NUMBERS ──────────────────────────────────────────── */
// Shared Labs parser: accepts "60,39" and a Unicode minus, rejects anything else or out of range (null).
function parseDecimal(text, min, max) {
  if (text == null) return null;
  let s = String(text).trim().replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-').replace(/\s+/g, '');
  if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Show (msg) or clear (null) the inline message under one coordinate field. */
function setFieldError(input, errorEl, msg) {
  if (msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  } else {
    errorEl.textContent = '';
    errorEl.hidden = true;
    input.removeAttribute('aria-invalid');
  }
}

/** Show (text) or clear (null) the "Using ..." line. Cleared text, not just
 *  hidden: aria-describedby still reads a hidden element it points at. */
function setEcho(text) {
  gpsEcho.textContent = text || '';
  gpsEcho.hidden = !text;
}

/** Read both coordinate fields into `observer`. On failure: an inline message,
 *  no chart (an older sky must not pass for the new place), and false. */
function applyCoords() {
  const lat = parseDecimal(latInput.value, -90, 90);
  const lon = parseDecimal(lonInput.value, -180, 180);

  setFieldError(latInput, latError,
    lat === null ? 'Enter a latitude between -90 and 90, such as 60.39 or 60,39.' : null);
  setFieldError(lonInput, lonError,
    lon === null ? 'Enter a longitude between -180 and 180, such as 5.32 or 5,32.' : null);

  if (lat === null || lon === null) {
    observer = null;
    setEcho(null);
    hideMap();
    // The fields live on the GPS Coords tab; show it so the message is seen.
    if (panelGps.hidden) switchTab('gps');
    (lat === null ? latInput : lonInput).focus();
    return false;
  }

  const moved = !observer || observer.lat !== lat || observer.lon !== lon;
  observer = { lat, lon };
  // Echo the numbers actually used, so "6,5" visibly became 6.5.
  setEcho(`Using ${lat}, ${lon}`);
  if (moved) syncCityBadge();
  showMap();
  return true;
}

/* ── MAP VISIBILITY ─────────────────────────────────────────── */
function hideMap() {
  tooltip.hidden = true;
  mapSection.hidden = true;
}

function showMap() {
  if (!mapSection.hidden) return;
  mapSection.hidden = false;
  // The canvas was sized while hidden (0 x 0); size it again, which redraws.
  resizeCanvas();
}

function toggleLive() {
  // Live View draws the place in the fields, so check them before starting.
  if (!isLive && !applyCoords()) return;
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
  if (!starsData.length || !observer) return;

  const { lat, lon } = observer;
  const localDateStr = dateInput.value;
  if (!localDateStr) return;

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
