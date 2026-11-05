/*! app.js is compiled from ts/app.ts by tools/build-ts.sh, which leaves out every comment but
    this one: the explanations are in the source. Edit the TypeScript, never the .js: the build
    refuses to overwrite a hand edit, and its check mode fails on one. */
import { getJulianDate, getLocalSiderealTime, getAltAz, getSunPosition, getLunarPosition } from './astro-calc.js';
function fail(what) {
    throw new Error(`StarMap: ${what}`);
}
function byId(id, kind) {
    const el = document.getElementById(id);
    if (!(el instanceof kind))
        fail(`#${id} is missing from the page`);
    return el;
}
function must(value, what) {
    if (value === null || value === undefined)
        fail(`${what} is missing`);
    return value;
}
let starsData = [];
let drawnStars = [];
const canvas = byId('starmap-canvas', HTMLCanvasElement);
const ctx = must(canvas.getContext('2d'), 'the canvas 2d context');
const tooltip = byId('star-tooltip', HTMLElement);
let devicePixelRatio = window.devicePixelRatio || 1;
const tabCity = byId('tab-city', HTMLButtonElement);
const tabGps = byId('tab-gps', HTMLButtonElement);
const panelCity = byId('panel-city', HTMLElement);
const panelGps = byId('panel-gps', HTMLElement);
const citySearch = byId('city-search', HTMLInputElement);
const cityDropdown = byId('city-dropdown', HTMLUListElement);
const citySelected = byId('city-selected', HTMLElement);
const citySelectedText = byId('city-selected-text', HTMLElement);
const cityClearBtn = byId('city-clear-btn', HTMLButtonElement);
const latInput = byId('lat-input', HTMLInputElement);
const lonInput = byId('lon-input', HTMLInputElement);
const latError = byId('lat-error', HTMLElement);
const lonError = byId('lon-error', HTMLElement);
const gpsEcho = byId('gps-echo', HTMLElement);
const dateInput = byId('date-input', HTMLInputElement);
const updateBtn = byId('update-btn', HTMLButtonElement);
const liveBtn = byId('live-btn', HTMLButtonElement);
const liveText = byId('live-text', HTMLElement);
const mapSection = byId('map-section', HTMLElement);
let constellationLabels = [];
let isLive = false;
let animationFrameId = null;
let observer = null;
function init() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dateInput.value = now.toISOString().slice(0, 16);
    observer = {
        lat: parseDecimal(latInput.value, -90, 90) ?? 59.9139,
        lon: parseDecimal(lonInput.value, -180, 180) ?? 10.7522,
    };
    [tabCity, tabGps].forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    citySearch.addEventListener('input', onCityInput);
    citySearch.addEventListener('keydown', onCityKeydown);
    cityClearBtn.addEventListener('click', clearCity);
    document.addEventListener('click', (e) => {
        if (!(e.target instanceof Element) || !e.target.closest('.search-wrapper'))
            closeDropdown();
    });
    latInput.addEventListener('input', () => { setFieldError(latInput, latError, null); setEcho(null); });
    lonInput.addEventListener('input', () => { setFieldError(lonInput, lonError, null); setEcho(null); });
    updateBtn.addEventListener('click', () => { if (applyCoords())
        drawMap(); });
    liveBtn.addEventListener('click', toggleLive);
    syncCityBadge();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousemove', handleHover);
    canvas.addEventListener('mouseout', () => tooltip.hidden = true);
    loadData();
}
async function loadData() {
    try {
        const res = await fetch('stars.json');
        const data = await res.json();
        starsData = data;
        computeConstellations();
        drawMap();
    }
    catch (err) {
        console.error("Failed to load stars dataset.", err);
    }
}
function switchTab(tab) {
    [tabCity, tabGps].forEach((btn) => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });
    panelCity.hidden = (tab !== 'city');
    panelGps.hidden = (tab !== 'gps');
}
let highlightIndex = -1;
function onCityInput() {
    const query = citySearch.value.trim().toLowerCase();
    highlightIndex = -1;
    if (query.length < 1) {
        closeDropdown();
        return;
    }
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
function rank(city, query) {
    const name = city.name.toLowerCase();
    if (name.startsWith(query))
        return 0;
    if (name.includes(query))
        return 1;
    return 2;
}
function onCityKeydown(e) {
    const items = cityDropdown.querySelectorAll('li');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(Math.min(highlightIndex + 1, items.length - 1));
    }
    else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(Math.max(highlightIndex - 1, 0));
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIndex >= 0 && cityDropdown._matches) {
            selectCity(must(cityDropdown._matches[highlightIndex], 'the highlighted city'));
        }
    }
    else if (e.key === 'Escape') {
        closeDropdown();
    }
}
function setHighlight(index) {
    const items = cityDropdown.querySelectorAll('li');
    items.forEach((li, i) => li.classList.toggle('highlighted', i === index));
    highlightIndex = index;
}
function selectCity(city) {
    latInput.value = String(city.lat);
    lonInput.value = String(city.lon);
    observer = { lat: city.lat, lon: city.lon };
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
function syncCityBadge() {
    if (!observer)
        return;
    const { lat: la, lon: lo } = observer;
    let match = null;
    let best = Infinity;
    for (const c of CITIES) {
        const dLat = Math.abs(c.lat - la);
        const dLon = Math.abs(c.lon - lo);
        if (dLat < 0.05 && dLon < 0.05 && dLat + dLon < best) {
            best = dLat + dLon;
            match = c;
        }
    }
    if (match) {
        citySelectedText.textContent = `${match.name}, ${match.country}`;
        citySelected.removeAttribute('hidden');
    }
    else {
        citySelected.setAttribute('hidden', '');
    }
}
function parseDecimal(text, min, max) {
    if (text == null)
        return null;
    let s = String(text).trim().replace(/[\u2212\u2012\u2013\u2014\uFE63\uFF0D]/g, '-').replace(/\s+/g, '');
    if (/^[+-]?\d+,\d+$/.test(s))
        s = s.replace(',', '.');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s))
        return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function setFieldError(input, errorEl, msg) {
    if (msg) {
        errorEl.textContent = msg;
        errorEl.hidden = false;
        input.setAttribute('aria-invalid', 'true');
    }
    else {
        errorEl.textContent = '';
        errorEl.hidden = true;
        input.removeAttribute('aria-invalid');
    }
}
function setEcho(text) {
    gpsEcho.textContent = text || '';
    gpsEcho.hidden = !text;
}
function applyCoords() {
    const lat = parseDecimal(latInput.value, -90, 90);
    const lon = parseDecimal(lonInput.value, -180, 180);
    setFieldError(latInput, latError, lat === null ? 'Enter a latitude between -90 and 90, such as 60.39 or 60,39.' : null);
    setFieldError(lonInput, lonError, lon === null ? 'Enter a longitude between -180 and 180, such as 5.32 or 5,32.' : null);
    if (lat === null || lon === null) {
        observer = null;
        setEcho(null);
        hideMap();
        if (panelGps.hidden)
            switchTab('gps');
        (lat === null ? latInput : lonInput).focus();
        return false;
    }
    const moved = !observer || observer.lat !== lat || observer.lon !== lon;
    observer = { lat, lon };
    setEcho(`Using ${lat}, ${lon}`);
    if (moved)
        syncCityBadge();
    showMap();
    return true;
}
function hideMap() {
    tooltip.hidden = true;
    mapSection.hidden = true;
}
function showMap() {
    if (!mapSection.hidden)
        return;
    mapSection.hidden = false;
    resizeCanvas();
}
function toggleLive() {
    if (!isLive && !applyCoords())
        return;
    isLive = !isLive;
    if (isLive) {
        liveBtn.classList.add('active');
        liveText.innerText = 'Live View: ON';
        updateClockAndDraw();
    }
    else {
        liveBtn.classList.remove('active');
        liveText.innerText = 'Live View: OFF';
        cancelAnimationFrame(animationFrameId ?? 0);
    }
}
function updateClockAndDraw() {
    if (!isLive)
        return;
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
function resizeCanvas() {
    const rect = must(canvas.parentElement, 'the canvas frame').getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    drawMap();
}
function drawMap() {
    if (!starsData.length || !observer)
        return;
    const { lat, lon } = observer;
    const localDateStr = dateInput.value;
    if (!localDateStr)
        return;
    const obsDate = new Date(localDateStr);
    const jd = getJulianDate(obsDate);
    const lst = getLocalSiderealTime(jd, lon);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) * 0.95;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawnStars = [];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let alt = 0; alt <= 60; alt += 30) {
        const r = ((90 - alt) / 90) * radius;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    for (let s of starsData) {
        const ra = s.r;
        const dec = s.d;
        const mag = s.m;
        const { alt, az } = getAltAz(ra, dec, lat, lst);
        if (alt < 0)
            continue;
        const r = ((90 - alt) / 90) * radius;
        const azRad = az * Math.PI / 180.0;
        const x = cx - r * Math.sin(azRad);
        const y = cy - r * Math.cos(azRad);
        const size = Math.max(0.5, (6.5 - mag) * 0.8) * devicePixelRatio;
        const opacity = Math.max(0.1, 1.0 - (mag / 8.0));
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        if (mag < 1.5) {
            ctx.shadowBlur = 4 * devicePixelRatio;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        drawnStars.push({ x, y, size, data: s });
    }
    ctx.font = `600 ${10 * devicePixelRatio}px "Inter", sans-serif`;
    ctx.fillStyle = 'rgba(130, 170, 255, 0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let cl of constellationLabels) {
        const { alt, az } = getAltAz(cl.r, cl.d, lat, lst);
        if (alt < 0)
            continue;
        const rL = ((90 - alt) / 90) * radius;
        const azRadL = az * Math.PI / 180.0;
        const xL = cx - rL * Math.sin(azRadL);
        const yL = cy - rL * Math.cos(azRadL);
        ctx.fillText(cl.c, xL, yL);
    }
    const drawBody = (pos, color, sizeMultiplier, label) => {
        const { alt, az } = getAltAz(pos.r, pos.d, lat, lst);
        if (alt < 0)
            return;
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
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    let hoveredStar = null;
    let minDist = 10 * devicePixelRatio;
    for (let s of drawnStars) {
        const dx = s.x - mx;
        const dy = s.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
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
    }
    else {
        tooltip.hidden = true;
    }
}
document.addEventListener('DOMContentLoaded', init);
