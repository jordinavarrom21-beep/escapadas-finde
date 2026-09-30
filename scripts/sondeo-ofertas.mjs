// TEMPORAL: sondeo de la API de Travelpayouts (catálogos públicos y robots.txt). Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const URLS = {
  robots: 'https://api.travelpayouts.com/robots.txt',
  ciudades: 'https://api.travelpayouts.com/data/es/cities.json',
  aeropuertos: 'https://api.travelpayouts.com/data/es/airports.json',
  paises: 'https://api.travelpayouts.com/data/es/countries.json',
  sinToken: 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=BCN&departure_at=2026-10-16&return_at=2026-10-18&currency=eur',
};
mkdirSync('sondeo', { recursive: true });
const resumen = {};
for (const [nombre, url] of Object.entries(URLS)) {
  try {
    const r = await fetch(url, { headers: { 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'escapadas-finde (sondeo)' } });
    const texto = await r.text();
    resumen[nombre] = { estado: r.status, tipo: r.headers.get('content-type'), bytes: texto.length };
    if (nombre === 'ciudades' || nombre === 'aeropuertos' || nombre === 'paises') {
      const lista = JSON.parse(texto);
      resumen[nombre].n = lista.length;
      const quiero = ['OPO', 'ROM', 'LON', 'PAR', 'BCN', 'CIA', 'FCO', 'ES', 'PT', 'IT', 'GB', 'FR'];
      writeFileSync(`sondeo/${nombre}-muestra.json`, JSON.stringify(lista.filter((x) => quiero.includes(x.code)), null, 1));
    } else {
      writeFileSync(`sondeo/${nombre}.txt`, texto.slice(0, 5000));
    }
  } catch (e) { resumen[nombre] = { error: e.message }; }
}
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
console.log(resumen);
