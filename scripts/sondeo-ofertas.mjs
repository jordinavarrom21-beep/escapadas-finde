// TEMPORAL: sondeo de APIs de vuelos gratis y sin registro (robots.txt y respuesta). Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const URLS = {
  'wizz-metadata': 'https://wizzair.com/static_fe/metadata.json',
  'wizz-home': 'https://wizzair.com/es-es',
};
mkdirSync('sondeo', { recursive: true });
const resumen = {};
for (const [nombre, url] of Object.entries(URLS)) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(20000) });
    const texto = await r.text();
    resumen[nombre] = { estado: r.status, tipo: r.headers.get('content-type'), bytes: texto.length };
    writeFileSync(`sondeo/${nombre}.txt`, texto.slice(0, 20000));
  } catch (e) { resumen[nombre] = { error: e.message }; }
}
// Wizz Air: timetable (POST) con la versión de la web
try {
  const build = (await (await fetch('https://wizzair.com/static_fe/metadata.json', { headers: { 'User-Agent': UA } })).text()).trim();
  const version = build.match(/be\.wizzair\.com\/([\d.]+)/)?.[1] ?? (await (await fetch('https://wizzair.com/es-es', { headers: { 'User-Agent': UA } })).text()).match(/be\.wizzair\.com\/([\d.]+)/)?.[1];
  resumen.version = version;
  const m = await fetch(`https://be.wizzair.com/${version}/Api/asset/map?languageCode=es-es`, { headers: { 'User-Agent': UA, Origin: 'https://wizzair.com', Referer: 'https://wizzair.com/' } });
  const mt = await m.text(); resumen.wizzMapa = { estado: m.status, bytes: mt.length }; writeFileSync('sondeo/wizz-mapa.txt', mt.slice(0, 200000));
  resumen.wizzVersion = build.slice(0, 200);
  const cuerpo = { flightList: [{ departureStation: 'BCN', arrivalStation: 'BUD', from: '2026-10-15', to: '2026-10-19' }, { departureStation: 'BUD', arrivalStation: 'BCN', from: '2026-10-15', to: '2026-10-19' }], priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0 };
  const r = await fetch(`https://be.wizzair.com/${version}/Api/search/timetable`, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Origin: 'https://wizzair.com', Referer: 'https://wizzair.com/' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  resumen.wizzTimetable = { estado: r.status, bytes: t.length };
  writeFileSync('sondeo/wizz-timetable.txt', t.slice(0, 20000));
} catch (e) { resumen.wizzTimetable = { error: e.message }; }
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
console.log(resumen);
