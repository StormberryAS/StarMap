import { getJulianDate, getLocalSiderealTime, getAltAz, getSunPosition, getLunarPosition } from './astro-calc.js';

let starsData = [];
let drawnStars = [];
const canvas = document.getElementById('starmap-canvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('star-tooltip');
let devicePixelRatio = window.devicePixelRatio || 1;

// Inputs
const latInput = document.getElementById('lat-input');
const lonInput = document.getElementById('lon-input');
const dateInput = document.getElementById('date-input');
const updateBtn = document.getElementById('update-btn');
const gpsBtn = document.getElementById('gps-btn');
const liveBtn = document.getElementById('live-btn');
const liveText = document.getElementById('live-text');
const citySelect = document.getElementById('city-select');

// Local city catalogue (no network calls — keeps the app offline-capable and privacy-first).
// Grouped by region; home region (Norway) first.
const CITIES = [
  { region: 'Norway', name: 'Oslo', lat: 59.9139, lon: 10.7522 },
  { region: 'Norway', name: 'Bergen', lat: 60.3913, lon: 5.3221 },
  { region: 'Norway', name: 'Trondheim', lat: 63.4305, lon: 10.3951 },
  { region: 'Norway', name: 'Stavanger', lat: 58.9700, lon: 5.7331 },
  { region: 'Norway', name: 'Kristiansand', lat: 58.1599, lon: 8.0182 },
  { region: 'Norway', name: 'Tromsø', lat: 69.6492, lon: 18.9553 },
  { region: 'Norway', name: 'Bodø', lat: 67.2804, lon: 14.4049 },

  { region: 'Europe', name: 'London', lat: 51.5074, lon: -0.1278 },
  { region: 'Europe', name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { region: 'Europe', name: 'Berlin', lat: 52.5200, lon: 13.4050 },
  { region: 'Europe', name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  { region: 'Europe', name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  { region: 'Europe', name: 'Lisbon', lat: 38.7223, lon: -9.1393 },
  { region: 'Europe', name: 'Rome', lat: 41.9028, lon: 12.4964 },
  { region: 'Europe', name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
  { region: 'Europe', name: 'Copenhagen', lat: 55.6761, lon: 12.5683 },
  { region: 'Europe', name: 'Helsinki', lat: 60.1699, lon: 24.9384 },
  { region: 'Europe', name: 'Reykjavík', lat: 64.1466, lon: -21.9426 },
  { region: 'Europe', name: 'Dublin', lat: 53.3498, lon: -6.2603 },
  { region: 'Europe', name: 'Vienna', lat: 48.2082, lon: 16.3738 },
  { region: 'Europe', name: 'Zürich', lat: 47.3769, lon: 8.5417 },
  { region: 'Europe', name: 'Warsaw', lat: 52.2297, lon: 21.0122 },
  { region: 'Europe', name: 'Athens', lat: 37.9838, lon: 23.7275 },
  { region: 'Europe', name: 'Istanbul', lat: 41.0082, lon: 28.9784 },
  { region: 'Europe', name: 'Moscow', lat: 55.7558, lon: 37.6173 },

  { region: 'North America', name: 'New York', lat: 40.7128, lon: -74.0060 },
  { region: 'North America', name: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { region: 'North America', name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { region: 'North America', name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { region: 'North America', name: 'Miami', lat: 25.7617, lon: -80.1918 },
  { region: 'North America', name: 'Toronto', lat: 43.6532, lon: -79.3832 },
  { region: 'North America', name: 'Vancouver', lat: 49.2827, lon: -123.1207 },
  { region: 'North America', name: 'Mexico City', lat: 19.4326, lon: -99.1332 },

  { region: 'South America', name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { region: 'South America', name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
  { region: 'South America', name: 'Brasília', lat: -15.7939, lon: -47.8828 },
  { region: 'South America', name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  { region: 'South America', name: 'Santiago', lat: -33.4489, lon: -70.6693 },
  { region: 'South America', name: 'Lima', lat: -12.0464, lon: -77.0428 },
  { region: 'South America', name: 'Bogotá', lat: 4.7110, lon: -74.0721 },

  { region: 'Africa & Middle East', name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { region: 'Africa & Middle East', name: 'Casablanca', lat: 33.5731, lon: -7.5898 },
  { region: 'Africa & Middle East', name: 'Lagos', lat: 6.5244, lon: 3.3792 },
  { region: 'Africa & Middle East', name: 'Nairobi', lat: -1.2864, lon: 36.8172 },
  { region: 'Africa & Middle East', name: 'Cape Town', lat: -33.9249, lon: 18.4241 },
  { region: 'Africa & Middle East', name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { region: 'Africa & Middle East', name: 'Tel Aviv', lat: 32.0853, lon: 34.7818 },
  { region: 'Africa & Middle East', name: 'Riyadh', lat: 24.7136, lon: 46.6753 },

  { region: 'Asia', name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { region: 'Asia', name: 'Seoul', lat: 37.5665, lon: 126.9780 },
  { region: 'Asia', name: 'Beijing', lat: 39.9042, lon: 116.4074 },
  { region: 'Asia', name: 'Shanghai', lat: 31.2304, lon: 121.4737 },
  { region: 'Asia', name: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
  { region: 'Asia', name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { region: 'Asia', name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  { region: 'Asia', name: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  { region: 'Asia', name: 'Manila', lat: 14.5995, lon: 120.9842 },
  { region: 'Asia', name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { region: 'Asia', name: 'Delhi', lat: 28.6139, lon: 77.2090 },

  { region: 'Oceania', name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { region: 'Oceania', name: 'Melbourne', lat: -37.8136, lon: 144.9631 },
  { region: 'Oceania', name: 'Brisbane', lat: -27.4698, lon: 153.0251 },
  { region: 'Oceania', name: 'Perth', lat: -31.9505, lon: 115.8605 },
  { region: 'Oceania', name: 'Auckland', lat: -36.8485, lon: 174.7633 },
];

let constellationLabels = [];
let isLive = false;
let animationFrameId = null;

function init() {
  // Set default datetime to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dateInput.value = now.toISOString().slice(0, 16);

  updateBtn.addEventListener('click', drawMap);
  gpsBtn.addEventListener('click', getGPS);
  liveBtn.addEventListener('click', toggleLive);

  // City picker: fill the dropdown, then keep it in sync with the coordinate inputs.
  populateCities();
  citySelect.addEventListener('change', onCityChange);
  latInput.addEventListener('input', syncCityToCoords);
  lonInput.addEventListener('input', syncCityToCoords);
  syncCityToCoords();

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

function getGPS() {
  if (navigator.geolocation) {
    gpsBtn.innerHTML = 'Locating...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latInput.value = pos.coords.latitude.toFixed(4);
        lonInput.value = pos.coords.longitude.toFixed(4);
        gpsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2m0 16v2M4 12H2m20 0h-2m-3.2-6.8a8 8 0 1 0 0 13.6"></path></svg> GPS';
        syncCityToCoords();
        drawMap();
      },
      (err) => {
        console.warn('Geolocation error:', err);
        gpsBtn.innerHTML = 'Error';
        setTimeout(() => {
          gpsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:18px;height:18px;" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2m0 16v2M4 12H2m20 0h-2m-3.2-6.8a8 8 0 1 0 0 13.6"></path></svg> GPS';
        }, 2000);
      }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
  }
}

function populateCities() {
  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = 'Custom location';
  citySelect.appendChild(custom);

  const groups = {};
  for (const c of CITIES) {
    if (!groups[c.region]) {
      const og = document.createElement('optgroup');
      og.label = c.region;
      groups[c.region] = og;
      citySelect.appendChild(og);
    }
    const opt = document.createElement('option');
    opt.value = `${c.lat},${c.lon}`;
    opt.textContent = c.name;
    groups[c.region].appendChild(opt);
  }
}

function onCityChange() {
  const val = citySelect.value;
  if (!val) return; // "Custom location" — leave the inputs for manual entry
  const [la, lo] = val.split(',');
  latInput.value = la;
  lonInput.value = lo;
  drawMap();
}

// Reflect the current coordinates back onto the dropdown: select the matching city,
// or fall back to "Custom location" (after GPS or manual editing).
function syncCityToCoords() {
  const la = parseFloat(latInput.value);
  const lo = parseFloat(lonInput.value);
  let matched = '';
  if (!isNaN(la) && !isNaN(lo)) {
    for (const c of CITIES) {
      if (Math.abs(c.lat - la) < 0.01 && Math.abs(c.lon - lo) < 0.01) {
        matched = `${c.lat},${c.lon}`;
        break;
      }
    }
  }
  citySelect.value = matched;
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
