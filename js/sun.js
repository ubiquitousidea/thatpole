// Where the morning sun is, for the entry time you pick: NOAA's solar position
// approximation for one weekday in September, in New York. Pure math with no
// three.js, so node can check it (selfTest).
//
// The ride runs straight from Queensboro Plaza toward Lexington Av/59 St,
// which lies west-northwest of it, so the car's front (-z) points at
// TRAIN_BEARING and its right side (+x) at TRAIN_BEARING + 90. In the morning
// the sun comes from behind the train.

export const SUN_DATE = { year: 2015, month: 9, day: 15 }; // the N's R68 years
const LAT = 40.75, LON = -73.94; // Queensboro Plaza
const UTC_OFFSET = -4;           // EDT
export const TRAIN_BEARING = 300; // degrees clockwise from north

const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD);

// Julian day at 0h UTC on a calendar date.
function julianDay(y, m, d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + 2 - a + Math.floor(a / 4) - 1524.5;
}

// hour: local clock time (7.5 is 7:30). Returns { elevation, azimuth } in
// degrees, azimuth clockwise from north.
export function solarPosition(hour, date = SUN_DATE) {
  const jd = julianDay(date.year, date.month, date.day) + (hour - UTC_OFFSET) / 24;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * cos(omega);
  const decl = Math.asin(sin(eps) * sin(lambda)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = 4 / RAD * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0)
    - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M)); // minutes
  const solarMinutes = hour * 60 + eqTime + 4 * LON - 60 * UTC_OFFSET;
  const ha = solarMinutes / 4 - 180;
  const cosZenith = sin(LAT) * sin(decl) + cos(LAT) * cos(decl) * cos(ha);
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / RAD;
  const az = Math.atan2(sin(ha), cos(ha) * sin(LAT) - Math.tan(decl * RAD) * cos(LAT)) / RAD + 180;
  return { elevation, azimuth: ((az % 360) + 360) % 360 };
}

// A unit vector toward the sun in car coordinates (x across to the right,
// y up, front of the train toward -z), plus the angles.
export function sunInCar(hour) {
  const { elevation, azimuth } = solarPosition(hour);
  const rel = azimuth - TRAIN_BEARING;
  return {
    elevation, azimuth,
    x: cos(elevation) * sin(rel),
    y: sin(elevation),
    z: -cos(elevation) * cos(rel),
  };
}

export function selfTest() {
  const issues = [];
  // Loose bounds from published tables for New York in mid-September.
  const want = { 7: [1, 7, 85, 100], 8: [12, 19, 95, 110], 9: [22, 31, 105, 125] };
  for (const [h, [e0, e1, a0, a1]] of Object.entries(want)) {
    const s = sunInCar(+h);
    console.log(`${h} AM: elevation ${s.elevation.toFixed(1)}, azimuth ${s.azimuth.toFixed(1)}, in car (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`);
    if (s.elevation < e0 || s.elevation > e1) issues.push(`${h} AM elevation ${s.elevation.toFixed(1)}`);
    if (s.azimuth < a0 || s.azimuth > a1) issues.push(`${h} AM azimuth ${s.azimuth.toFixed(1)}`);
    if (s.z <= 0) issues.push(`${h} AM sun not behind the train`);
  }
  const noon = solarPosition(12.85);
  if (noon.elevation < 50 || noon.elevation > 54) issues.push(`solar noon elevation ${noon.elevation.toFixed(1)}`);
  console.log(issues.length ? `sun FAIL: ${issues.join('; ')}` : 'sun ok');
  return issues.length === 0;
}
