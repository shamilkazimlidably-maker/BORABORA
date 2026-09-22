// Timezone-aware period keys without extra deps (default America/Sao_Paulo)
function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}
function offsetMs(date, tz) {
  const p = parts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}
export function localDate(tz, date = new Date()) {
  const p = parts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
export function dayKey(tz, date = new Date()) { return 'd:' + localDate(tz, date); }
export function dayEnd(tz, date = new Date()) {
  const p = parts(date, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d + 1) - offsetMs(date, tz));
}
export function dayStart(tz, date = new Date()) {
  const p = parts(date, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - offsetMs(date, tz));
}
export function weekInfo(tz, date = new Date()) {
  const p = parts(date, tz);
  const local = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const dow = (local.getUTCDay() + 6) % 7; // segunda = 0
  const monday = new Date(local.getTime() - dow * 86400000);
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((thursday - jan1) / 86400000 + 1) / 7);
  const off = offsetMs(date, tz);
  return {
    key: `w:${thursday.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`,
    start: new Date(monday.getTime() - off),
    end: new Date(monday.getTime() + 7 * 86400000 - off),
  };
}
export function yesterday(tz) { return localDate(tz, new Date(Date.now() - 86400000)); }
