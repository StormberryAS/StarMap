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
