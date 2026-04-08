// Minimal, lightweight celestial math logic to calculate local altitude & azimuth from RA/Dec.
// RA expected in hours. Dec expected in degrees.
// Lat/Lon expected in degrees.

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

export function getJulianDate(date) {
  return (date.getTime() / 86400000.0) + 2440587.5;
}

export function getLocalSiderealTime(jd, lon) {
  const t = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + (t * t) * 0.000387933 - (t * t * t) / 38710000.0;
  gmst = gmst % 360.0;
  if (gmst < 0) gmst += 360.0;
  let lst = gmst + lon;
  lst = lst % 360.0;
  if (lst < 0) lst += 360.0;
  return lst;
}

export function getAltAz(raHours, decDeg, latDeg, lstDeg) {
  const raDeg = raHours * 15.0;
  let haDeg = lstDeg - raDeg;
  // Normalize HA to -180 to 180
  haDeg = haDeg % 360.0;
  if (haDeg > 180.0) haDeg -= 360.0;
  if (haDeg < -180.0) haDeg += 360.0;

  const lat = latDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const ha = haDeg * DEG2RAD;

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  let alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));

  if (Math.sin(ha) > 0) {
    az = (2 * Math.PI) - az;
  }

  return {
    alt: alt * RAD2DEG,
    az: az * RAD2DEG,
    ha: haDeg
  };
}

// Low-precision Sun position
// Returns RA in hours, Dec in degrees
export function getSunPosition(jd) {
  const n = jd - 2451545.0;
  let L = (280.460 + 0.9856474 * n) % 360.0;
  let g = (357.528 + 0.9856003 * n) % 360.0;
  if (L < 0) L += 360.0;
  if (g < 0) g += 360.0;

  const gRad = g * DEG2RAD;
  const lambda = L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
  const lambdaRad = lambda * DEG2RAD;
  const epsilon = 23.439 - 0.0000004 * n;
  const epsRad = epsilon * DEG2RAD;

  let raRad = Math.atan2(Math.cos(epsRad) * Math.sin(lambdaRad), Math.cos(lambdaRad));
  let decRad = Math.asin(Math.sin(epsRad) * Math.sin(lambdaRad));

  let raHours = (raRad * RAD2DEG) / 15.0;
  if (raHours < 0) raHours += 24.0;
  const decDeg = decRad * RAD2DEG;

  return { r: raHours, d: decDeg };
}

// Low-precision Moon position
// Returns RA in hours, Dec in degrees
export function getLunarPosition(jd) {
  const n = jd - 2451545.0;
  let L = (218.316 + 13.176396 * n) % 360.0;
  let M = (134.963 + 13.064993 * n) % 360.0;
  let F = (93.272 + 13.229350 * n) % 360.0;
  if (L < 0) L += 360.0;
  if (M < 0) M += 360.0;
  if (F < 0) F += 360.0;

  const lRad = L * DEG2RAD;
  const mRad = M * DEG2RAD;
  const fRad = F * DEG2RAD;

  const lambda = L + 6.289 * Math.sin(mRad);
  const lambdaRad = lambda * DEG2RAD;
  const beta = 5.128 * Math.sin(fRad);
  const betaRad = beta * DEG2RAD;
  const epsilon = 23.439 - 0.0000004 * n;
  const epsRad = epsilon * DEG2RAD;

  const y = Math.sin(lambdaRad) * Math.cos(epsRad) - Math.tan(betaRad) * Math.sin(epsRad);
  const x = Math.cos(lambdaRad);
  let raRad = Math.atan2(y, x);

  let decRad = Math.asin(Math.sin(betaRad) * Math.cos(epsRad) + Math.cos(betaRad) * Math.sin(epsRad) * Math.sin(lambdaRad));

  let raHours = (raRad * RAD2DEG) / 15.0;
  if (raHours < 0) raHours += 24.0;
  const decDeg = decRad * RAD2DEG;

  return { r: raHours, d: decDeg };
}
