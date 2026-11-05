// The page logic, run as the page runs it (tests/vm-page.ts): cities.js, then the compiled app.js
// with the compiled astro-calc.js, with the clock fixed at 5 November 2026 22:00 in Oslo. The
// expected values are what the JavaScript before the move to TypeScript (commit 33ccdfb) showed and
// drew at that instant. A drawing is held by the sha256 of every canvas call from the clearRect on.

process.env.TZ = 'Europe/Oslo';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAltAz, getJulianDate, getLocalSiderealTime, getLunarPosition, getSunPosition } from '#astro-calc.js';
import { loadPage } from './vm-page.ts';

const NOW = Date.parse('2026-11-05T21:00:00Z');
const root = new URL('../', import.meta.url);
/** A typographic minus sign (U+2212), which the coordinate fields accept. */
const MINUS = String.fromCharCode(0x2212);

test('load: Oslo from the coordinate fields, its badge, now as the date, and the chart', async () => {
  const page = await loadPage(root, NOW);
  const s = page.state();
  assert.deepEqual([s.badge, s.lat.value, s.lon.value, s.date, s.map.hidden, s.dropdown.hidden], [
    { hidden: false, text: 'Oslo, Norway' }, '59.9139', '10.7522', '2026-11-05T22:00', false, true,
  ]);
  assert.deepEqual([s.frame.calls, s.frame.stars, s.frame.labels.length], [17615, 4392, 32]);
  assert.equal(s.frame.sha256, 'd520edd7a34ceffb93ee4848c19c9861ee1a99be515afd4c55d1c25534592f24');
  assert.deepEqual([page.totals().fetched, page.totals().console], [['stars.json'], []]);
});

test('the city search: accents and exonyms, keys, the pointer, and a choice that redraws', async () => {
  const page = await loadPage(root, NOW);
  page.typeCity('berg');
  assert.deepEqual(page.state().dropdown.rows, [
    '0|Bergerac|France||false', '1|Bergedorf|Germany||false', '2|Bergheim|Germany||false', '3|Bergisch Gladbach|Germany||false',
    '4|Bergkamen|Germany||false', '5|Bergamo|Italy||false', '6|Bergen|Norway||false', '7|Bergen|The Netherlands||false',
  ]);
  assert.equal(page.state().search.expanded, 'true');
  assert.equal(page.key('ArrowDown'), true);
  page.key('ArrowDown');
  assert.equal(page.state().dropdown.rows[1], '1|Bergedorf|Germany|highlighted|false');
  page.hoverRow(6);
  assert.equal(page.key('Enter'), true);
  let s = page.state();
  assert.deepEqual([s.badge.text, s.lat.value, s.lon.value, s.search.value, s.dropdown.hidden, s.dropdown.rows.length],
    ['Bergen, Norway', '60.393', '5.3242', '', true, 0]);
  page.typeCity('tromso');
  assert.deepEqual(page.state().dropdown.rows, ['0|Tromsø|Norway||false']);
  page.clickRow(0);
  s = page.state();
  assert.deepEqual([s.badge.text, s.lat.value, s.lon.value], ['Tromsø, Norway', '69.6489', '18.9551']);
  assert.equal(s.frame.sha256, '9c129b019be597574e9f6fcadec514f793b46d1fad4060cf95236860ea77770d');
  page.typeCity('Gothenburg');
  assert.deepEqual(page.state().dropdown.rows, ['0|Göteborg|Sweden||false']);
  assert.equal(page.key('Escape'), false);
  assert.equal(page.state().dropdown.hidden, true);
  page.typeCity('sao paulo');
  assert.equal(page.state().dropdown.rows.length, 2);
  page.clickOutside();
  assert.deepEqual([page.state().dropdown.hidden, page.state().search.expanded], [true, 'false']);
  page.click('city-clear-btn');
  assert.deepEqual([page.state().badge.hidden, page.state().focus], [true, 'city-search']);
});

test('typed coordinates: a decimal comma, a minus sign, a refused value and its message', async () => {
  const page = await loadPage(root, NOW);
  page.click('tab-gps');
  assert.deepEqual([page.state().tabs.gps, page.state().tabs.cityPanelHidden], ['tab active|true', true]);
  page.typeCoord('lat', '60,39');
  page.typeCoord('lon', '5,32');
  page.click('update-btn');
  let s = page.state();
  assert.deepEqual([s.echo, s.badge.text], [{ text: 'Using 60.39, 5.32', hidden: false }, 'Bergen, Norway']);
  assert.equal(s.frame.sha256, '55c3daf9442e2626b8a353cf09f0c344741d4e2f06883b2756fc116bb457d96b');
  page.typeCoord('lat', '95');
  page.click('update-btn');
  s = page.state();
  assert.deepEqual([s.lat.error, s.lat.invalid, s.lat.errorHidden, s.map.hidden, s.focus, s.echo.hidden],
    ['Enter a latitude between -90 and 90, such as 60.39 or 60,39.', 'true', false, true, 'lat-input', true]);
  page.typeCoord('lat', `${MINUS}33,87`);
  page.typeCoord('lon', '151.21');
  page.click('update-btn');
  s = page.state();
  assert.deepEqual([s.echo.text, s.badge.text, s.map.hidden, s.lat.invalid], ['Using -33.87, 151.21', 'Sydney, Australia', false, null]);
  assert.equal(s.frame.sha256, 'd3abefb0bc458b07edddd83499c74ea725b5a71f29edb0c78109a47adaf7a39d');
  page.typeCoord('lon', '181');
  page.click('update-btn');
  assert.equal(page.state().lon.error, 'Enter a longitude between -180 and 180, such as 5.32 or 5,32.');
});

test('Live View: refused on a bad field, then one drawing a frame, and off', async () => {
  const page = await loadPage(root, NOW);
  page.typeCoord('lat', 'abc');
  page.click('live-btn');
  assert.deepEqual([page.state().live.text, page.state().tabs.gps, page.state().map.hidden], ['Live View: OFF', 'tab active|true', true]);
  page.typeCoord('lat', '-33.87');
  page.typeCoord('lon', '151.21');
  page.click('live-btn');
  assert.deepEqual(page.state().live, { classes: 'active', text: 'Live View: ON', pending: 1 });
  page.frame(NOW + 60000);
  assert.equal(page.state().date, '2026-11-05T22:01');
  assert.equal(page.state().frame.sha256, 'fa91068b803294c2b25a79506cb209f8da63500576c682296155b85ea1053952');
  page.click('live-btn');
  assert.deepEqual(page.state().live, { classes: '', text: 'Live View: OFF', pending: 0 });
});

test('a date, the tooltip over a star, and the Sun and the Moon', async () => {
  const page = await loadPage(root, NOW);
  page.typeCoord('lat', '-33.87');
  page.typeCoord('lon', '151.21');
  page.setDate('2027-06-21T23:00');
  page.click('update-btn');
  const s = page.state();
  assert.equal(s.frame.sha256, 'f819aab5f61dc34d81f03ccc66bbe1a0edc7b256c3dc3736912fd733582ac4a6');
  assert.deepEqual(s.frame.labels.slice(-2), ['Eco', 'MOON']);
  page.hover(260, 10);
  assert.deepEqual(page.tooltip(), { hidden: true, text: '', left: '', top: '' });
  page.hover(270, 10);
  assert.deepEqual(page.tooltip(), { hidden: false, text: 'Per (Mag 5.5)', left: '270px', top: '10px' });
  page.leave();
  assert.equal(page.tooltip().hidden, true);
});

test('the sky maths (astro-calc.js): the values the old module gave', () => {
  const jd = getJulianDate(new Date(NOW));
  assert.equal(jd, 2461350.375);
  assert.equal(getLocalSiderealTime(jd, 10.7522), 10.85489056307152);
  assert.equal(getLocalSiderealTime(2451545, -180), 100.46061837000002);
  assert.deepEqual(getSunPosition(jd), { r: 14.733421798490191, d: -15.875045191470987 });
  assert.deepEqual(getLunarPosition(jd), { r: 12.17568423214007, d: -4.103905494059267 });
  assert.deepEqual(getSunPosition(2461578.375), { r: 6.019642037216918, d: 23.434710223801233 });
  assert.deepEqual(getAltAz(5.9195, 38.78, 59.91, 90.5), { alt: 68.84243385408486, az: 183.68991683525184, ha: 1.707499999999996 });
  assert.deepEqual(getAltAz(18.6156, 38.78, 59.91, 271.3), { alt: 68.28313591158019, az: 163.0938001333902, ha: -7.934000000000026 });
});
