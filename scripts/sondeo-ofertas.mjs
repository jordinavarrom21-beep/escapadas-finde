// TEMPORAL: sondeo de APIs de aerolíneas gratis y sin registro. Se borra al terminar.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const PRUEBAS = {
  // Vueling
  'vueling-robots': ['https://www.vueling.com/robots.txt'],
  'vueling-apiwww-robots': ['https://apiwww.vueling.com/robots.txt'],
  'vueling-precios-apiwww': ['https://apiwww.vueling.com/api/FlightPrice/GetAllFlights?originCode=BCN&destinationCode=LIS&year=2026&month=10&currencyCode=EUR&monthsRange=1'],
  'vueling-precios-www': ['https://www.vueling.com/api/FlightPrice/GetAllFlights?originCode=BCN&destinationCode=LIS&year=2026&month=10&currencyCode=EUR&monthsRange=1'],
  'vueling-home': ['https://www.vueling.com/es'],
  // Norwegian
  'norwegian-calendario': ['https://www.norwegian.com/api/fare-calendar/calendar?adultCount=1&destinationAirportCode=OSL&includeTransit=false&originAirportCode=BCN&outboundDate=2026-10-01&tripType=1&currencyCode=EUR&languageCode=es-ES'],
  // Pegasus
  'pegasus-robots': ['https://web.flypgs.com/robots.txt'],
  'pegasus-robots2': ['https://www.flypgs.com/robots.txt'],
  'pegasus-barata': ['https://web.flypgs.com/pegasus/cheapest-fare', { depPort: 'BCN', arrPort: 'SAW', flightDate: '2026-10-16', currency: 'EUR' }],
  // Level
  'level-robots': ['https://www.flylevel.com/robots.txt'],
  'level-calendario': ['https://www.flylevel.com/nwe/flights/api/calendar/?triptype=RT&origin=BCN&destination=BOS&month=10&year=2026&currencyCode=EUR'],
  // easyJet
  'easyjet-rutas': ['https://www.easyjet.com/ejcms/cache15m/api/routedates/get/?originIata=BCN&destinationIata=LGW'],
  'easyjet-diarios': ['https://www.easyjet.com/api/routepricing/v2/searchfares/GetLowestDailyFares?departureAirport=BCN&arrivalAirport=LGW&currency=EUR'],
  // Jet2
  'jet2-robots': ['https://www.jet2.com/robots.txt'],
  // Transavia
  'transavia-home': ['https://www.transavia.com/es-ES/inicio/'],
  // Eurowings
  'eurowings-api': ['https://www.eurowings.com/es/reservar/vuelos/flight-search/low-fare-calendar.json?origin=BCN&destination=DUS&month=2026-10'],
  // airBaltic
  'airbaltic-api': ['https://www.airbaltic.com/api/fsf/outbound?origin=BCN&destin=RIX&tripType=return&numAdt=1&numChd=0&numInf=0&flightMode=return&departureDate=2026-10-16&returnDate=2026-10-18'],
  // Aegean, TAP, Smartwings robots
  'smartwings-robots': ['https://www.smartwings.com/robots.txt'],
  'tap-robots': ['https://www.flytap.com/robots.txt'],
  'aegean-robots': ['https://en.aegeanair.com/robots.txt'],
  'volotea-api-robots': ['https://json.volotea.com/robots.txt'],
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
    writeFileSync(`sondeo/${nombre}.txt`, texto.slice(0, 300000));
  } catch (e) { resumen[nombre] = { error: e.message }; }
}
writeFileSync('sondeo/resumen.json', JSON.stringify(resumen, null, 1));
console.log(resumen);
