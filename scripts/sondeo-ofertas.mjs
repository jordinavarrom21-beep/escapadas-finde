// TEMPORAL: sondeo de la API de precios de Vueling. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const BASE = 'https://static.vueling.com/corporativeCMS/WebComponents/home/browser/';
const CAB = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'es-ES,es;q=0.9', Origin: 'https://www.vueling.com', Referer: 'https://www.vueling.com/' };
mkdirSync('sondeo', { recursive: true });
const contexto = [];
for (const archivo of ['chunk-JVBZN3KJ.js']) {
  const js = await (await fetch(BASE + archivo, { headers: { 'User-Agent': UA } })).text();
  for (const clave of ['providerName', 'getAvailability', 'includeSummary']) {
    let i = -1;
    while ((i = js.indexOf(clave, i + 1)) >= 0 && contexto.length < 40) contexto.push(`${archivo} ${clave}: ${js.slice(Math.max(0, i - 700), i + 500)}`);
  }
}
writeFileSync('sondeo/contexto.txt', contexto.join('\n\n=====\n\n'));
const B = 'https://apiw.vueling.com/api/v1/bestPrices?originCode=BCN&destinationCodes=LIS,FCO,AMS,ORY,LGW&currencyCode=EUR';
const PRUEBAS = {
  'best-m0': `${B}&months=0&startDate=2026-10-16`,
  'best-m1-16': `${B}&months=1&startDate=2026-10-16`,
  'best-m1-01': `${B}&months=1&startDate=2026-10-01`,
  'best-fin': `${B}&months=1&startDate=2026-10-16&endDate=2026-10-16`,
  'best-vuelta': 'https://apiw.vueling.com/api/v1/bestPrices?originCode=LIS&destinationCodes=BCN&currencyCode=EUR&months=1&startDate=2026-10-18',
  'robots-apiw-2': 'https://apiw.vueling.com/robots.txt',
};
const resumen = {};
for (const [nombre, url] of Object.entries(PRUEBAS)) {
  try {
    const r = await fetch(url, { headers: CAB, signal: AbortSignal.timeout(25000) });
    const t = await r.text();
    resumen[nombre] = { estado: r.status, tipo: r.headers.get('content-type'), bytes: t.length, inicio: t.slice(0, 200).replace(/\s+/g, ' ') };
    writeFileSync(`sondeo/${nombre}.txt`, t.slice(0, 3000000));
  } catch (e) { resumen[nombre] = { error: e.message }; }
}
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
