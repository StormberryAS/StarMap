/*! app.js is compiled from ts/app.ts by tools/build-ts.sh, which leaves out every comment but
    this one: the explanations are in the source. Edit the TypeScript, never the .js: the build
    refuses to overwrite a hand edit, and its check mode fails on one. */

// StarMap: the page. An ES module, as before the move to TypeScript (5 November 2026): index.html
// loads cities.js as a classic script and then app.js with type="module", and app.js imports the
// sky maths from './astro-calc.js' (ts/astro-calc.ts), with no ?v= stamp, as before. The star
// catalogue is stars.json, next to the page, which loadData fetches once. The app keeps nothing in
// the browser's storage.

import { getJulianDate, getLocalSiderealTime, getAltAz, getSunPosition, getLunarPosition, type RaDec } from './astro-calc.js';
// CITIES comes from the shared cities.js, loaded as a classic script by
// index.html before this module. Regenerate with GitHub/update_cities.py.
// ts/cities.d.ts types it.

/** One star of stars.json (fetch_stars.py): right ascension in hours, declination and visual
 *  magnitude, and the proper name (n) or the constellation (c) where the catalogue has them. */
interface Star {
  r: number;
  d: number;
  m: number;
  n?: string;
  c?: string;
}

/** A star as drawn on the canvas, for the hover tooltip. */
interface DrawnStar {
  x: number;
  y: number;
  size: number;
  data: Star;
}

/** A constellation label: its code and the magnitude-weighted mean of its stars. */
interface ConstellationLabel {
  c: string;
  r: number;
  d: number;
}

/** The running sums of one constellation in computeConstellations. */
interface ConstellationSum {
  sumRA: number;
  sumDec: number;
  weight: number;
}

/** A checked place, in decimal degrees. */
interface Place {
  lat: number;
  lon: number;
}

/** Stops the script: the page is not what this code was written for. */
function fail(what: string): never {
  throw new Error(`StarMap: ${what}`);
}

/** The element with this id, of this kind; the page always has it, so a miss is a broken page. */
function byId<T extends HTMLElement>(id: string, kind: { new (): T; prototype: T }): T {
  const el = document.getElementById(id);
  if (!(el instanceof kind)) fail(`#${id} is missing from the page`);
  return el;
}

/** A value that is always there when the page is whole. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) fail(`${what} is missing`);
  return value;
}

let starsData: Star[] = [];
let drawnStars: DrawnStar[] = [];
const canvas = byId('starmap-canvas', HTMLCanvasElement);
const ctx = must(canvas.getContext('2d'), 'the canvas 2d context');
const tooltip = byId('star-tooltip', HTMLElement);
let devicePixelRatio = window.devicePixelRatio || 1;

// Location-picker tabs + panels. There is no device-location option: the
// stormberry.as zone sends Permissions-Policy geolocation=(), which blocks it
// on every Labs host, so it was removed on 2026-10-02. A place comes from city
// search or from typed coordinates.
const tabCity = byId('tab-city', HTMLButtonElement);
const tabGps = byId('tab-gps', HTMLButtonElement);
const panelCity = byId('panel-city', HTMLElement);
const panelGps = byId('panel-gps', HTMLElement);

// City search. The dropdown keeps the current matches on itself (_matches), as before.
const citySearch = byId('city-search', HTMLInputElement);
const cityDropdown = byId('city-dropdown', HTMLUListElement) as HTMLUListElement & { _matches?: City[] };
const citySelected = byId('city-selected', HTMLElement);
const citySelectedText = byId('city-selected-text', HTMLElement);
const cityClearBtn = byId('city-clear-btn', HTMLButtonElement);

// GPS coords: the text fields, their inline messages and the "Using ..." line
const latInput = byId('lat-input', HTMLInputElement);
const lonInput = byId('lon-input', HTMLInputElement);
const latError = byId('lat-error', HTMLElement);
const lonError = byId('lon-error', HTMLElement);
const gpsEcho = byId('gps-echo', HTMLElement);

// Date + actions
const dateInput = byId('date-input', HTMLInputElement);
const updateBtn = byId('update-btn', HTMLButtonElement);
const liveBtn = byId('live-btn', HTMLButtonElement);
const liveText = byId('live-text', HTMLElement);
const mapSection = byId('map-section', HTMLElement);

let constellationLabels: ConstellationLabel[] = [];
let isLive = false;
let animationFrameId: number | null = null;

// The place the chart is drawn for, as checked numbers ({ lat, lon }), or null
// while the typed coordinates cannot be read. drawMap reads this, never the
// text fields, so a half-typed value is never drawn.
let observer: Place | null = null;

function init(): void {
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
  // A click outside the search box closes the list. (A click target is always an element; one
  // that is not counts as outside, where the old script would have thrown.)
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.search-wrapper')) closeDropdown();
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

async function loadData(): Promise<void> {
  try {
    const res = await fetch('stars.json');
    // stars.json is ours (fetch_stars.py writes it) and is read as it is, as before.
    const data: unknown = await res.json();
    // The labels are drawn in Inter (Marcos, 6 November 2026: "Font should always be inter"). The
    // map waits until the browser has that face, so its first frame is not drawn in a fallback
    // font; if the face cannot load, the map is drawn anyway.
    await document.fonts.load('600 10px "InterVariable"').catch(() => undefined);
    starsData = data as Star[];
    computeConstellations();
    drawMap();
  } catch (err) {
    console.error("Failed to load stars dataset.", err);
  }
}

/* ── TAB SWITCHING ──────────────────────────────────────────── */
function switchTab(tab: string | undefined): void {
  [tabCity, tabGps].forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  panelCity.hidden = (tab !== 'city');
  panelGps.hidden = (tab !== 'gps');
}

/* ── CITY SEARCH & DROPDOWN ─────────────────────────────────── */
let highlightIndex = -1;

function onCityInput(): void {
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
    li.dataset.index = String(i);
    li.innerHTML = `<span class="city-name"></span><span class="city-country"></span>`;
    must(li.querySelector('.city-name'), 'the city name span').textContent = city.name;
    must(li.querySelector('.city-country'), 'the country span').textContent = city.country;
    li.addEventListener('click', () => selectCity(city));
    li.addEventListener('mouseenter', () => setHighlight(i));
    cityDropdown.appendChild(li);
  });

  cityDropdown._matches = matches;
  cityDropdown.removeAttribute('hidden');
  citySearch.setAttribute('aria-expanded', 'true');
}

// Lower rank sorts first: name starts-with (0) < name contains (1) < country only (2).
function rank(city: City, query: string): number {
  const name = city.name.toLowerCase();
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  return 2;
}

function onCityKeydown(e: KeyboardEvent): void {
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
      selectCity(must(cityDropdown._matches[highlightIndex], 'the highlighted city'));
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
}

function setHighlight(index: number): void {
  const items = cityDropdown.querySelectorAll('li');
  items.forEach((li, i) => li.classList.toggle('highlighted', i === index));
  highlightIndex = index;
}

function selectCity(city: City): void {
  latInput.value = String(city.lat);
  lonInput.value = String(city.lon);
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

function clearCity(): void {
  citySelected.setAttribute('hidden', '');
  citySearch.value = '';
  citySearch.focus();
}

function closeDropdown(): void {
  cityDropdown.setAttribute('hidden', '');
  citySearch.setAttribute('aria-expanded', 'false');
  cityDropdown.innerHTML = '';
}

// Show the badge for the nearest known city within 0.05° of the current
// coordinates, and hide it if there is none. Used on load and after typed
// coordinates change.
function syncCityBadge(): void {
  if (!observer) return;
  const { lat: la, lon: lo } = observer;
  let match: City | null = null;
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
function parseDecimal(text: string | null | undefined, min: number, max: number): number | null {
  if (text == null) return null;
  let s = String(text).trim().replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-').replace(/\s+/g, '');
  if (/^[+-]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Show (msg) or clear (null) the inline message under one coordinate field. */
function setFieldError(input: HTMLInputElement, errorEl: HTMLElement, msg: string | null): void {
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
function setEcho(text: string | null): void {
  gpsEcho.textContent = text || '';
  gpsEcho.hidden = !text;
}

/** Read both coordinate fields into `observer`. On failure: an inline message,
 *  no chart (an older sky must not pass for the new place), and false. */
function applyCoords(): boolean {
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
function hideMap(): void {
  tooltip.hidden = true;
  mapSection.hidden = true;
}

function showMap(): void {
  if (!mapSection.hidden) return;
  mapSection.hidden = false;
  // The canvas was sized while hidden (0 x 0); size it again, which redraws.
  resizeCanvas();
}

function toggleLive(): void {
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
    // The frame id is always set here; null would reach the browser as 0, as before.
    cancelAnimationFrame(animationFrameId ?? 0);
  }
}

function updateClockAndDraw(): void {
  if (!isLive) return;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);
  drawMap();
  animationFrameId = requestAnimationFrame(updateClockAndDraw);
}

function computeConstellations(): void {
  let conMap: Record<string, ConstellationSum> = {};
  for (let s of starsData) {
    if (s.c) {
      const sum = conMap[s.c] ?? (conMap[s.c] = { sumRA: 0, sumDec: 0, weight: 0 });
      let w = Math.max(0.1, 5.0 - s.m);
      sum.sumRA += s.r * w;
      sum.sumDec += s.d * w;
      sum.weight += w;
    }
  }

  constellationLabels = [];
  for (let c in conMap) {
     const sum = conMap[c];
     if (sum && sum.weight > 0) {
        constellationLabels.push({
           c: c,
           r: sum.sumRA / sum.weight,
           d: sum.sumDec / sum.weight
        });
     }
  }
}

function resizeCanvas(): void {
  const rect = must(canvas.parentElement, 'the canvas frame').getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  drawMap();
}

function drawMap(): void {
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

    // Stereographic projection: Zenith is centre (Alt=90)
    // Distance from centre represents Zenith Distance (90 - alt)
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

    // Colours roughly mimicking stellar classes if we wanted, but white/blue-ish works ok.
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Emphasise bright stars
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
  ctx.font = `600 ${10 * devicePixelRatio}px "InterVariable", "Inter", sans-serif`;
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
  const drawBody = (pos: RaDec, color: string, sizeMultiplier: number, label: string): void => {
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

    ctx.font = `600 ${9 * devicePixelRatio}px "InterVariable", "Inter", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(label, xB, yB + 14 * devicePixelRatio);
  };

  const sunPos = getSunPosition(jd);
  drawBody(sunPos, '#ffd700', 1.5, 'SUN');

  const moonPos = getLunarPosition(jd);
  drawBody(moonPos, '#e0e8ff', 1.2, 'MOON');
}

function handleHover(e: MouseEvent): void {
  const rect = canvas.getBoundingClientRect();
  // Adjust mouse pos to internal resolution
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);

  let hoveredStar: DrawnStar | null = null;
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
