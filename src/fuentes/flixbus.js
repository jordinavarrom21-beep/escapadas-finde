/**
 * FlixBus: trayectos de ida desde Barcelona el viernes del próximo finde a cinco
 * destinos de escapada, con el buscador JSON público que usa su web
 * (global.api.flixbus.com no tiene robots.txt y el de flixbus.es no lo prohíbe).
 * Una consulta por destino y una oferta por destino con el trayecto más barato.
 * El precio es el total del billete de ida para un adulto, sin la tasa de gestión
 * que FlixBus añade al pagar (se indica aparte en `precioTexto`).
 * La API no devuelve la vuelta en la misma consulta, así que no se pide.
 */
import { crearOferta } from '../modelo.js';
import { etiquetaDia, fechaLocal, findesProximos } from '../util/fechas.js';
import { recortar } from '../util/xml.js';

const ID = 'flixbus';
const API = 'https://global.api.flixbus.com/search/service/v4/search';
const TIENDA = 'https://shop.flixbus.es/search';
const PAUSA_MS = 2000;

const BARCELONA = { id: '40e086ed-8646-11e6-9066-549f350fcb0c', nombre: 'Barcelona' };

/** Ids de ciudad de FlixBus (de su autocompletado) y datos del lugar. */
export const DESTINOS = [
  { slug: 'perpignan', id: '40dfa505-8646-11e6-9066-549f350fcb0c', nombre: 'Perpiñán', region: 'Occitania', pais: 'Francia', codigoPais: 'FR', lat: 42.6971, lon: 2.8899 },
  { slug: 'montpellier', id: '40df980f-8646-11e6-9066-549f350fcb0c', nombre: 'Montpellier', region: 'Occitania', pais: 'Francia', codigoPais: 'FR', lat: 43.6106, lon: 3.8769 },
  { slug: 'toulouse', id: '40dfd612-8646-11e6-9066-549f350fcb0c', nombre: 'Toulouse', region: 'Occitania', pais: 'Francia', codigoPais: 'FR', lat: 43.6134, lon: 1.4524 },
  { slug: 'andorra-la-vella', id: '70622f19-4dd5-470a-ae66-c8f22a384458', nombre: 'Andorra la Vella', region: null, pais: 'Andorra', codigoPais: 'AD', lat: 42.5063, lon: 1.5218 },
  { slug: 'zaragoza', id: '885a9019-ff58-4229-ad2c-4b63a5baf6a2', nombre: 'Zaragoza', region: 'Aragón', pais: 'España', codigoPais: 'ES', lat: 41.6488, lon: -0.8891 },
];

const EUROS = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const euros = (valor) => `${EUROS.format(valor)} €`;

/** 'YYYY-MM-DD' → 'DD.MM.YYYY', el formato de fecha de FlixBus. */
const fechaFlix = (iso) => iso.split('-').reverse().join('.');

/** URL de búsqueda de la API para un destino y un día. */
export function urlBusqueda(destino, fecha) {
  const parametros = new URLSearchParams({
    from_city_id: BARCELONA.id,
    to_city_id: destino.id,
    departure_date: fechaFlix(fecha),
    products: JSON.stringify({ adult: 1 }),
    currency: 'EUR',
    locale: 'es',
    search_by: 'cities',
    include_after_midnight_rides: '1',
  });
  return `${API}?${parametros}`;
}

/** Enlace a la búsqueda en la tienda web de FlixBus (sin parámetros de seguimiento). */
function urlTienda(destino, fecha) {
  const parametros = new URLSearchParams({
    departureCity: BARCELONA.id,
    arrivalCity: destino.id,
    rideDate: fechaFlix(fecha),
    adult: '1',
  });
  return `${TIENDA}?${parametros}`;
}

/** '2026-09-18T22:20:00+02:00' → '2026-09-18T22:20:00' (hora local de la estación). */
const horaLocalDe = (fecha) => fecha.slice(0, 19);

/**
 * Trayectos con plazas de una respuesta de la API, del más barato al más caro.
 * @param {object} respuesta JSON de /search/service/v4/search
 */
export function parsearTrayectos(respuesta) {
  const marcas = respuesta.brands ?? {};
  return (respuesta.trips ?? [])
    .flatMap((viaje) => Object.values(viaje.results ?? {}))
    .filter((r) => r.status === 'available' && r.price?.total > 0)
    .map((r) => ({
      salida: horaLocalDe(r.departure.date),
      llegada: horaLocalDe(r.arrival.date),
      salidaIso: new Date(r.departure.date).toISOString(),
      duracion: r.duration ?? null,
      precio: r.price.total,
      gestion: Math.max(0, Math.round(((r.price.total_with_platform_fee ?? r.price.total) - r.price.total) * 100) / 100),
      plazas: r.available?.seats ?? null,
      directo: r.transfer_type_key === 'direct' || (r.legs ?? []).length === 1,
      tren: (r.legs ?? []).some((tramo) => tramo.means_of_transport === 'train'),
      socios: [...new Set((r.legs ?? []).filter((t) => t.is_marketplace).map((t) => marcas[t.brand_id]?.name?.trim()).filter(Boolean))],
    }))
    .sort((a, b) => a.precio - b.precio || a.salida.localeCompare(b.salida));
}

const duracionTexto = (d) => (d ? `${d.hours} h${d.minutes ? ` ${d.minutes} min` : ''}` : null);

/**
 * Oferta con el trayecto más barato de un destino, o null si no hay plazas.
 * @param {object} respuesta JSON de la API
 * @param {typeof DESTINOS[number]} destino
 * @param {string} viernes 'YYYY-MM-DD' consultado
 */
export function ofertaDestino(respuesta, destino, viernes) {
  const trayectos = parsearTrayectos(respuesta);
  if (!trayectos.length) return null;
  const [mejor] = trayectos;
  const medio = mejor.tren ? 'Tren' : 'Bus';
  const gestion = mejor.gestion ? ` (+${euros(mejor.gestion)} de gestión)` : '';
  const otroDia = mejor.llegada.slice(0, 10) !== mejor.salida.slice(0, 10);
  const detalles = [
    `sale el ${etiquetaDia(mejor.salida)} a las ${mejor.salida.slice(11, 16)}`,
    `llega${otroDia ? ` el ${etiquetaDia(mejor.llegada)}` : ''} a las ${mejor.llegada.slice(11, 16)}`,
    duracionTexto(mejor.duracion),
    mejor.directo ? 'directo' : 'con transbordo',
    mejor.plazas != null ? `${mejor.plazas} plazas` : null,
  ].filter(Boolean);
  const socio = mejor.socios.length ? ` Viaje de ${mejor.socios.join(' y ')} vendido por FlixBus.` : '';
  return crearOferta({
    id: `${ID}:barcelona-${destino.slug}:${viernes}`,
    fuente: ID,
    tipo: 'escapada',
    titulo: `${medio} Barcelona – ${destino.nombre} el ${etiquetaDia(viernes)} desde ${euros(mejor.precio)}`,
    descripcion: recortar(`Ida con FlixBus: ${detalles.join(', ')}. ${trayectos.length} trayectos con plazas ese día.${socio}`),
    url: urlTienda(destino, viernes),
    precio: mejor.precio,
    precioTexto: `${euros(mejor.precio)} por persona, solo ida${gestion}`,
    unidad: null,
    transporte: mejor.tren ? 'tren' : 'bus',
    lugar: {
      nombre: destino.nombre,
      region: destino.region,
      pais: destino.pais,
      codigoPais: destino.codigoPais,
      lat: destino.lat,
      lon: destino.lon,
      iata: null,
    },
    fechas: { salida: mejor.salida, vuelta: null },
    etiquetas: ['FlixBus', mejor.tren ? 'tren' : 'autobús', mejor.directo ? 'directo' : 'con transbordo', 'solo ida', ...mejor.socios],
    caduca: mejor.salidaIso,
  });
}

const esBloqueo = (error) => error.estado === 403 || error.estado === 429 || error instanceof SyntaxError;

// El viernes del primer finde cuya salida no haya pasado ya (hoy puede ser sábado o domingo).
function proximoViernes(ctx) {
  const hoy = fechaLocal(ctx.ahora);
  const findes = ctx.findes?.length ? ctx.findes : findesProximos(2, ctx.ahora);
  return findes.find((finde) => finde.viernes >= hoy)?.viernes ?? findesProximos(2, ctx.ahora).at(-1).viernes;
}

async function obtener(ctx) {
  const viernes = proximoViernes(ctx);
  const ofertas = [];
  const consultados = new Set();
  let ultimoError = null;
  for (const [i, destino] of DESTINOS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      const oferta = ofertaDestino(await ctx.http.json(urlBusqueda(destino, viernes)), destino, viernes);
      consultados.add(destino.slug);
      if (oferta) ofertas.push(oferta);
      else ctx.log(`Sin plazas a ${destino.nombre} el ${viernes}`);
    } catch (error) {
      ultimoError = error;
      ctx.log(`${destino.nombre}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('FlixBus ha bloqueado o limitado las peticiones (o no ha devuelto JSON): no se consulta más en esta ejecución');
        break;
      }
    }
  }
  if (!consultados.size) throw new Error(`No se ha podido consultar FlixBus (último error: ${ultimoError.message})`);
  return { ofertas, reemplazar: (oferta) => consultados.has(oferta.id.split(':')[1].replace(/^barcelona-/, '')) };
}

export default {
  id: ID,
  nombre: 'FlixBus',
  web: 'https://www.flixbus.es',
  modo: 'api',
  requiere: [],
  urls: DESTINOS.map((destino) => `${API}?from_city_id=${BARCELONA.id}&to_city_id=${destino.id}`),
  obtener,
};
