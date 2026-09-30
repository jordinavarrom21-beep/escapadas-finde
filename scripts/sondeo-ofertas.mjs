// TEMPORAL: sondeo de APIs de vuelos gratis y sin registro (robots.txt y respuesta). Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const URLS = {
  'wizz-robots': 'https://wizzair.com/robots.txt',
  'wizz-be-robots': 'https://be.wizzair.com/robots.txt',
  'wizz-build': 'https://wizzair.com/buildnumber',
  'easyjet-robots': 'https://www.easyjet.com/robots.txt',
  'easyjet-fares': 'https://www.easyjet.com/api/routepricing/v3/searchfares/GetAllFaresByDate?departureAirport=BCN&arrivalAirport=LGW&currency=EUR',
  'vueling-robots': 'https://www.vueling.com/robots.txt',
  'transavia-robots': 'https://www.transavia.com/robots.txt',
  'norwegian-robots': 'https://www.norwegian.com/robots.txt',
  'iberia-robots': 'https://www.iberia.com/robots.txt',
  'airbaltic-robots': 'https://www.airbaltic.com/robots.txt',
  'jet2-robots': 'https://www.jet2.com/robots.txt',
  'jet2-api': 'https://www.jet2.com/api/search/flightsearchresults/cheapestprice?departureAirportIata=BCN',
  'eurowings-robots': 'https://www.eurowings.com/robots.txt',
  'binter-robots': 'https://www.bintercanarias.com/robots.txt',
  'skyscanner-robots': 'https://www.skyscanner.es/robots.txt',
  'google-robots': 'https://www.google.com/robots.txt',
  'kayak-robots': 'https://www.kayak.es/robots.txt',
  'momondo-robots': 'https://www.momondo.es/robots.txt',
  'kiwi-robots': 'https://www.kiwi.com/robots.txt',
  'kiwi-api-robots': 'https://api.skypicker.com/robots.txt',
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
  const build = (await (await fetch('https://wizzair.com/buildnumber', { headers: { 'User-Agent': UA } })).text()).trim();
  const version = build.match(/\d+\.\d+\.\d+/)?.[0] ?? build;
  resumen.wizzVersion = build.slice(0, 200);
  const cuerpo = { flightList: [{ departureStation: 'BCN', arrivalStation: 'BUD', from: '2026-10-15', to: '2026-10-19' }, { departureStation: 'BUD', arrivalStation: 'BCN', from: '2026-10-15', to: '2026-10-19' }], priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0 };
  const r = await fetch(`https://be.wizzair.com/${version}/Api/search/timetable`, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Origin: 'https://wizzair.com', Referer: 'https://wizzair.com/' }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  resumen.wizzTimetable = { estado: r.status, bytes: t.length };
  writeFileSync('sondeo/wizz-timetable.txt', t.slice(0, 20000));
} catch (e) { resumen.wizzTimetable = { error: e.message }; }
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
console.log(resumen);
