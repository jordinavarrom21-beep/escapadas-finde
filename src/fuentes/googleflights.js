/**
 * Vuelos de ida y vuelta de fin de semana y puentes desde Barcelona, de todas las
 * aerolíneas, con el modo «Explorar» de Google Flights: una consulta por finde (o puente)
 * da los destinos más baratos para esas fechas, con aerolínea, escalas y duración.
 *
 * Google no permite leer sus resultados directamente (su robots.txt prohíbe
 * /travel/flights/search): los lee Apify, un proveedor de datos de pago, con el actor
 * lergassy/google-flights-scraper (src/util/apify.js). Por eso necesita el secreto
 * APIFY_TOKEN y solo se consulta una vez al día (`fuentes.googleflights.intervaloMin`),
 * con los límites de `ajustes.apify.googleFlights`.
 *
 * Google Explore da el precio más bajo de la ida y vuelta y el día, no la hora: las horas
 * se ven al abrir la búsqueda en Google Flights. Los vuelos que solo hace Wizz Air ya
 * llegan, con su hora, de la fuente de Wizz Air y aquí se saltan.
 */
import { crearOferta } from '../modelo.js';
import { ErrorPresupuesto, ejecutarActor, urlEjecucion } from '../util/apify.js';
import { etiquetaDia } from '../util/fechas.js';
import { recortar } from '../util/xml.js';
import { generarConsultas } from './ryanair.js';

const WEB = 'https://www.google.com/travel/flights';
const POR_DEFECTO = { aeropuertos: ['BCN'], findes: 6, destinosPorConsulta: 25, maxUsdPorConsulta: 0.01 };
const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const SOLO_WIZZ = /^wizz ?air$/i;

const configuracion = (ajustes) => ({ ...POR_DEFECTO, ...ajustes.apify?.googleFlights });

/**
 * Consultas de esta pasada: los próximos `findes` fines de semana (viernes a domingo, según
 * `vuelos.patrones`) y los puentes que caen antes, desde los aeropuertos de `googleFlights`.
 */
export function consultasGoogle(ctx) {
  const config = configuracion(ctx.ajustes);
  const ajustes = { ...ctx.ajustes, vuelos: { ...ctx.ajustes.vuelos, aeropuertos: config.aeropuertos, horarioIdeal: undefined } };
  const vistas = new Set();
  return generarConsultas({ ...ctx, ajustes, findes: ctx.findes.slice(0, config.findes) })
    .filter((consulta) => {
      const clave = `${consulta.origen}:${consulta.salida}:${consulta.vuelta}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
}

/** Entrada del actor para una consulta: explorar destinos desde el origen esas fechas. */
export function entradaExplorar(consulta, destinos) {
  return {
    origin: consulta.origen,
    exploreAnywhere: true,
    departureDate: consulta.salida,
    returnDate: consulta.vuelta,
    maxDestinations: destinos,
    currency: 'EUR',
    market: 'ES',
    language: 'es',
    includePriceInsights: false,
  };
}

const escalasTexto = (n) => (n === 0 ? 'directo' : n === 1 ? '1 escala' : `${n} escalas`);

/**
 * Ofertas de una respuesta de «Explorar» para una consulta: un destino por aeropuerto (el
 * primero que da Google: a veces repite el aeropuerto con otra zona, «Milán» y «Lago de
 * Como»), con las fechas de la consulta, en euros, que no pase de `vuelos.precioMax` y que no
 * sea solo de Wizz Air si esa fuente está activa. Las filas raras se descartan y se registran con `log`.
 */
export function parsearExplorar(filas, consulta, ajustes, log = () => {}) {
  if (!Array.isArray(filas)) throw new Error('Respuesta inesperada de Google Flights: no es una lista');
  const wizzActiva = ajustes.fuentes?.wizzair?.activa !== false;
  const vistos = new Set();
  const ofertas = [];
  const destinos = filas
    .filter((fila) => fila?.type === 'destination')
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  for (const fila of destinos) {
    const iata = fila.destination;
    if (!/^[A-Z]{3}$/.test(iata ?? '') || vistos.has(iata)) continue;
    vistos.add(iata);
    // Sin fechas, Google Explore da viajes «flexibles» de una semana: solo valen los de la consulta.
    if (fila.origin !== consulta.origen || fila.currency !== 'EUR') continue;
    if (fila.departureDate !== consulta.salida || fila.returnDate !== consulta.vuelta) continue;
    if (!(fila.price > 0) || fila.price > ajustes.vuelos.precioMax) continue;
    if (wizzActiva && SOLO_WIZZ.test(fila.airline ?? '')) continue;
    try {
      ofertas.push(ofertaDeFila(fila, consulta));
    } catch (error) {
      log(`Destino ${iata} descartado en ${consulta.id}: ${error.message}`);
    }
  }
  return ofertas;
}

function ofertaDeFila(fila, consulta) {
  const iata = fila.destination;
  const ciudad = String(fila.city ?? '').trim() || iata;
  const escalas = Number.isInteger(fila.stops) ? fila.stops : null;
  const duracionMin = Number.isFinite(fila.durationMinutes) ? fila.durationMinutes : null;
  const aerolinea = String(fila.airline ?? '').trim() || null;
  const detalles = [aerolinea, escalas != null && escalasTexto(escalas), fila.duration && `${fila.duration} de vuelo`].filter(Boolean).join(' · ');
  return crearOferta({
    id: `googleflights:${consulta.origen}-${iata}:${consulta.salida}:${consulta.vuelta}`,
    fuente: 'googleflights',
    tipo: 'vuelo',
    titulo: ciudad,
    descripcion: recortar(`${consulta.origen} → ${iata}${detalles ? ` · ${detalles}` : ''} · ida ${etiquetaDia(consulta.salida)}, ` +
      `vuelta ${etiquetaDia(consulta.vuelta)}. Precio más bajo de ida y vuelta que da Google Flights para esas fechas; las horas se ven al abrir la búsqueda.`),
    url: fila.googleFlightsUrl,
    precio: fila.price,
    precioTexto: `desde ${EUROS.format(fila.price)} ida y vuelta`,
    unidad: 'i/v',
    transporte: 'avion',
    lugar: {
      nombre: ciudad, region: null, pais: fila.country ?? null, codigoPais: null, iata,
      lat: Number.isFinite(fila.latitude) ? fila.latitude : null, lon: Number.isFinite(fila.longitude) ? fila.longitude : null,
    },
    fechas: { salida: consulta.salida, vuelta: consulta.vuelta },
    vuelo: {
      origen: consulta.origen,
      destino: iata,
      ida: { salida: consulta.salida, llegada: null, numero: null, precio: null, escalas, duracionMin },
      vuelta: { salida: consulta.vuelta, llegada: null, numero: null, precio: null, escalas: null },
      consultaId: consulta.id,
      horarioIdeal: false,
      patron: consulta.patron,
      nuevaRuta: false,
      directo: escalas === 0,
      aerolinea,
    },
    etiquetas: [fila.country, consulta.patron, escalas === 0 ? 'Directo' : null, aerolinea].filter(Boolean),
  });
}

async function obtener(ctx) {
  const config = configuracion(ctx.ajustes);
  const consultas = consultasGoogle(ctx);
  const ofertas = [];
  const consultasOk = new Set();
  let ultimoError = null;
  for (const consulta of consultas) {
    try {
      const filas = await ejecutarActor(ctx, 'googleFlights', entradaExplorar(consulta, config.destinosPorConsulta), { maxUsd: config.maxUsdPorConsulta });
      ofertas.push(...parsearExplorar(filas, consulta, ctx.ajustes, ctx.log));
      consultasOk.add(consulta.id);
    } catch (error) {
      ultimoError = error;
      ctx.log(`Consulta ${consulta.id} fallida: ${error.message}`);
      // Sin presupuesto o sin saldo, las demás consultas fallarían igual.
      if (error instanceof ErrorPresupuesto) break;
    }
  }
  if (!consultasOk.size && ultimoError) {
    // Sin presupuesto no es un fallo de la web: el orquestador la deja «desactivada» hasta el mes que viene.
    if (ultimoError instanceof ErrorPresupuesto) throw ultimoError;
    throw new Error(`Ninguna consulta a Google Flights ha funcionado (último error: ${ultimoError.message})`);
  }
  return { ofertas, reemplazar: (oferta) => consultasOk.has(oferta.vuelo?.consultaId) };
}

export default {
  id: 'googleflights',
  nombre: 'Google Flights',
  web: WEB,
  modo: 'api',
  requiere: ['APIFY_TOKEN'],
  // Se lee a través de la API de Apify (su robots.txt lo permite todo).
  urls: [urlEjecucion('googleFlights')],
  obtener,
};
