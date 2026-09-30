/**
 * Vuelos de ida y vuelta con fecha y hora (findes y puentes) de la API de datos de
 * Aviasales, vía el programa de afiliados de Travelpayouts: `prices_for_dates` da, para un
 * origen y unas fechas, los billetes más baratos a cualquier destino, con sus horarios,
 * escalas y duración.
 *
 * Son precios de la caché de Aviasales (búsquedas recientes de otros usuarios), no una
 * búsqueda en directo: se dice así en la oferta y el enlace abre la búsqueda en Aviasales,
 * que da el precio de ese momento.
 *
 * Necesita `TRAVELPAYOUTS_TOKEN` (secreto de GitHub). Con `TRAVELPAYOUTS_MARKER` (tu id de
 * afiliado) los enlaces llevan tu marca y las reservas cuentan para ti. Los catálogos de
 * ciudades, aeropuertos y países (nombres en español, zona horaria) son públicos. Su
 * robots.txt permite /aviasales/ y /data/ (comprobado el 30/09/2026).
 */
import { crearOferta } from '../modelo.js';
import { etiquetaFechaHora } from '../util/fechas.js';
import { recortar } from '../util/xml.js';
import { esHorarioIdeal, generarConsultas } from './ryanair.js';

const ID = 'travelpayouts';
const API = 'https://api.travelpayouts.com';
const URL_PRECIOS = `${API}/aviasales/v3/prices_for_dates`;
const URL_CIUDADES = `${API}/data/es/cities.json`;
const URL_AEROPUERTOS = `${API}/data/es/airports.json`;
const URL_PAISES = `${API}/data/es/countries.json`;
const WEB = 'https://www.aviasales.com';
const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Parámetros de una consulta (una salida y una vuelta desde un aeropuerto, a cualquier destino). */
export function urlConsulta(consulta) {
  const parametros = new URLSearchParams({
    origin: consulta.origen,
    departure_at: consulta.salida,
    return_at: consulta.vuelta,
    one_way: 'false',
    sorting: 'price',
    unique: 'false',
    currency: 'eur',
    market: 'es',
    limit: '1000',
  });
  return `${URL_PRECIOS}?${parametros}`;
}

/** '2026-10-16T19:05:00+02:00' → '2026-10-16T19:05:00' (hora local del aeropuerto, como el resto de vuelos). */
const horaLocal = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? `${iso.slice(0, 16)}:00` : null);

/** Hora local de llegada: salida + duración, en la zona horaria del aeropuerto de llegada. */
export function llegadaLocal(salidaIso, minutos, zona) {
  const inicio = Date.parse(salidaIso);
  if (!Number.isFinite(inicio) || !(minutos > 0) || !zona) return null;
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(inicio + minutos * 60_000)).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:00`;
}

const escalas = (n) => (n === 0 ? 'Directo' : n === 1 ? '1 escala' : `${n} escalas`);

/**
 * Índices de los catálogos: aeropuerto → {ciudad, zona, coordenadas}, ciudad → {nombre, país,
 * coordenadas, zona} y país → nombre.
 */
export function indexarCatalogos({ ciudades = [], aeropuertos = [], paises = [] }) {
  const porPais = Object.fromEntries(paises.filter((p) => p?.code).map((p) => [p.code, p.name]));
  const porCiudad = Object.fromEntries(ciudades.filter((c) => c?.code).map((c) => [c.code, {
    nombre: c.name ?? c.name_translations?.en ?? c.code, pais: c.country_code ?? null, lat: c.coordinates?.lat ?? null, lon: c.coordinates?.lon ?? null, zona: c.time_zone ?? null,
  }]));
  const porAeropuerto = Object.fromEntries(aeropuertos.filter((a) => a?.code).map((a) => [a.code, {
    ciudad: a.city_code ?? null, lat: a.coordinates?.lat ?? null, lon: a.coordinates?.lon ?? null, zona: a.time_zone ?? null,
  }]));
  return { porPais, porCiudad, porAeropuerto };
}

/** El enlace de la búsqueda en Aviasales (con tu marca de afiliado si la hay). */
export function urlAviasales(enlace, marca) {
  if (typeof enlace !== 'string' || !enlace.startsWith('/')) return null;
  const url = new URL(enlace, WEB);
  if (marca) url.searchParams.set('marker', marca);
  return url.href;
}

/**
 * Ofertas de una respuesta de `prices_for_dates`: la más barata por destino, sin pasar del
 * precio máximo de los ajustes. Lo que no cumple el contrato se descarta y se anota.
 */
export function parsearPrecios(json, consulta, catalogos, { ajustes, marca = null, log = () => {} }) {
  if (json?.success === false) throw new Error(`Travelpayouts respondió con error: ${json.error ?? 'sin detalle'}`);
  if (!Array.isArray(json?.data)) throw new Error('Respuesta inesperada de Travelpayouts: falta la lista «data»');
  const precioMax = ajustes.vuelos.precioMax ?? Infinity;
  const mejores = new Map();
  for (const billete of json.data) {
    const destino = billete?.destination_airport ?? billete?.destination;
    if (!destino || !(billete.price > 0) || billete.price > precioMax) continue;
    const previo = mejores.get(destino);
    if (!previo || billete.price < previo.price) mejores.set(destino, billete);
  }
  return [...mejores.values()].flatMap((billete) => {
    try {
      return [ofertaDeBillete(billete, consulta, catalogos, ajustes, marca)];
    } catch (error) {
      log(`Billete a ${billete.destination_airport ?? billete.destination} descartado en ${consulta.id}: ${error.message}`);
      return [];
    }
  });
}

function ofertaDeBillete(b, consulta, { porCiudad, porAeropuerto, porPais }, ajustes, marca) {
  const aeropuerto = b.destination_airport ?? b.destination;
  const datosAeropuerto = porAeropuerto[aeropuerto] ?? {};
  const ciudad = porCiudad[b.destination] ?? porCiudad[datosAeropuerto.ciudad] ?? {};
  const origen = porAeropuerto[b.origin_airport ?? consulta.origen] ?? {};
  const salida = horaLocal(b.departure_at);
  const vuelta = horaLocal(b.return_at);
  if (!salida || !vuelta) throw new Error('sin fecha y hora de ida o de vuelta');
  const url = urlAviasales(b.link, marca);
  if (!url) throw new Error('sin enlace a la búsqueda');
  const nombre = ciudad.nombre ?? aeropuerto;
  const pais = porPais[ciudad.pais] ?? null;
  const directo = (b.transfers ?? 0) === 0 && (b.return_transfers ?? 0) === 0;
  const ida = {
    salida,
    llegada: llegadaLocal(b.departure_at, b.duration_to, datosAeropuerto.zona ?? ciudad.zona),
    numero: b.airline && b.flight_number ? `${b.airline}${b.flight_number}` : null,
    precio: null,
    escalas: b.transfers ?? null,
    duracionMin: b.duration_to ?? null,
  };
  const regreso = {
    salida: vuelta,
    llegada: llegadaLocal(b.return_at, b.duration_back, origen.zona),
    numero: null,
    precio: null,
    escalas: b.return_transfers ?? null,
    duracionMin: b.duration_back ?? null,
  };
  return crearOferta({
    id: `${ID}:${consulta.origen}-${aeropuerto}:${consulta.salida}:${consulta.vuelta}`,
    fuente: ID,
    tipo: 'vuelo',
    titulo: nombre,
    descripcion: recortar(`${consulta.origen} → ${aeropuerto} · ${etiquetaFechaHora(salida)} → ${etiquetaFechaHora(vuelta)} · ${directo ? 'Directo' : `${escalas(b.transfers ?? 0)} a la ida, ${escalas(b.return_transfers ?? 0).toLowerCase()} a la vuelta`}. Precio visto en búsquedas recientes en Aviasales: confírmalo al abrir la búsqueda.`),
    url,
    precio: b.price,
    precioTexto: `${EUROS.format(b.price)} ida y vuelta por persona (búsquedas recientes)`,
    unidad: 'i/v',
    transporte: 'avion',
    lugar: {
      nombre, region: null, pais, codigoPais: ciudad.pais ?? null, iata: aeropuerto,
      lat: datosAeropuerto.lat ?? ciudad.lat ?? null, lon: datosAeropuerto.lon ?? ciudad.lon ?? null,
    },
    fechas: { salida, vuelta },
    vuelo: {
      origen: consulta.origen,
      destino: aeropuerto,
      ida,
      vuelta: regreso,
      consultaId: consulta.id,
      horarioIdeal: esHorarioIdeal(salida, vuelta, ajustes.vuelos.horarioIdeal, consulta.exigirHoraIda),
      patron: consulta.patron,
      nuevaRuta: false,
      directo,
    },
    etiquetas: [pais, consulta.patron, directo ? 'Directo' : 'Con escalas'].filter(Boolean),
  });
}

/**
 * Un catálogo público (~2 MB): se baja en cada lectura en vez de guardarlo en la caché, que
 * viaja en la rama «datos». Si falla, el vuelo sale igual con el código del aeropuerto.
 */
async function catalogo(ctx, url) {
  try {
    const lista = await ctx.http.json(url);
    if (!Array.isArray(lista)) throw new Error('no es una lista');
    return lista;
  } catch (error) {
    ctx.log(`No se ha podido leer ${url}: ${error.message} (los destinos saldrán con su código)`);
    return [];
  }
}

// Un 401/403 (token mal puesto) o un 429 (límite): no se insiste más en esta ejecución.
const esBloqueo = (error) => [401, 403, 429].includes(error.estado);

async function obtener(ctx) {
  // La variante «ideal» de Ryanair filtra por hora en su API; aquí el horario se mira en cada billete.
  const consultas = generarConsultas(ctx).filter((c) => c.tipo !== 'ideal');
  if (!consultas.length) return { ofertas: [], reemplazar: false };
  const catalogos = indexarCatalogos({
    ciudades: await catalogo(ctx, URL_CIUDADES),
    aeropuertos: await catalogo(ctx, URL_AEROPUERTOS),
    paises: await catalogo(ctx, URL_PAISES),
  });
  const cabeceras = { 'X-Access-Token': ctx.env.TRAVELPAYOUTS_TOKEN };
  const marca = ctx.env.TRAVELPAYOUTS_MARKER || null;
  const ofertas = [];
  const correctas = new Set();
  let ultimoError = null;
  for (const [i, consulta] of consultas.entries()) {
    if (i) await ctx.http.esperar(ctx.ajustes.vuelos.pausaEntrePeticionesMs);
    try {
      const json = await ctx.http.json(urlConsulta(consulta), { cabeceras, reintentos: 1 });
      ofertas.push(...parsearPrecios(json, consulta, catalogos, { ajustes: ctx.ajustes, marca, log: ctx.log }));
      correctas.add(consulta.id);
    } catch (error) {
      ultimoError = error;
      ctx.log(`Consulta ${consulta.id} fallida: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log(error.estado === 429 ? 'Límite de peticiones de Travelpayouts: se sigue en la próxima revisión' : 'Travelpayouts rechaza el token: revisa el secreto TRAVELPAYOUTS_TOKEN');
        break;
      }
    }
  }
  if (!correctas.size) throw new Error(`Ninguna consulta a Travelpayouts ha funcionado (último error: ${ultimoError?.message})`);
  return { ofertas, reemplazar: (oferta) => correctas.has(oferta.vuelo?.consultaId) };
}

export default {
  id: ID,
  nombre: 'Aviasales',
  web: WEB,
  modo: 'api',
  requiere: ['TRAVELPAYOUTS_TOKEN'],
  urls: [URL_PRECIOS, URL_CIUDADES, URL_AEROPUERTOS, URL_PAISES],
  obtener,
};
