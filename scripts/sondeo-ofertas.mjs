// TEMPORAL: sondeo de APIs de aerolíneas gratis y sin registro. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const PRUEBAS = {
  'vueling-main': ['https://static.vueling.com/corporativeCMS/WebComponents/home/browser/main.js?v=639263922216329412'],
  'vueling-destino': ['https://www.vueling.com/es/destinos/vuelos-barcelona-lisboa'],
  'airbaltic-robots': ['https://www.airbaltic.com/robots.txt'],
  'airbaltic-api': ['https://www.airbaltic.com/api/fsf/outbound?origin=BCN&destin=RIX&tripType=return&numAdt=1&numChd=0&numInf=0&flightMode=return&departureDate=2026-10-16&returnDate=2026-10-18&startDate=2026-10-01&endDate=2026-10-31'],
  'airbaltic-api2': ['https://www.airbaltic.com/api/fsf/outbound?origin=BCN&destin=RIX&tripType=return&numAdt=1&numChd=0&numInf=0&departureDate=2026-10-16&returnDate=2026-10-18&startDate=2026-10-16&endDate=2026-10-18'],
  'airtrfx-robots': ['https://openair-california.airtrfx.com/robots.txt'],
  'airtrfx-front-robots': ['https://em-frontend-assets.airtrfx.com/robots.txt'],
};
mkdirSync('sondeo', { recursive: true });
const resumen = {};
for (const [nombre, [url, cuerpo]] of Object.entries(PRUEBAS)) {
  try {
    const r = await fetch(url, {
      method: cuerpo ? 'POST' : 'GET',
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'es-ES,es;q=0.9', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(25000),
    });
    const texto = await r.text();
    resumen[nombre] = { estado: r.status, tipo: r.headers.get('content-type'), bytes: texto.length, inicio: texto.slice(0, 160).replace(/\s+/g, ' ') };
    writeFileSync(`sondeo/${nombre}.txt`, texto.slice(0, 5000000));
  } catch (e) { resumen[nombre] = { error: e.message }; }
}
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
console.log(resumen);
