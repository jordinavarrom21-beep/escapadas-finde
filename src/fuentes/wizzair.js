/**
 * Vuelos de ida y vuelta de fin de semana y puentes con Wizz Air, usando la API
 * pública (no oficial, gratis y sin registro) que usa su propia web:
 *  - el mapa de rutas (qué destinos tiene cada aeropuerto, con ciudad, país y coordenadas);
 *  - el calendario de precios («timetable»): la tarifa más baja de cada día y las
 *    horas de salida de ese día, para la ida y para la vuelta de una ruta.
 * La API va en be.wizzair.com con la versión de la web en la ruta (cambia con cada
 * despliegue de Wizz), así que la versión se lee de su portada.
 * robots.txt (comprobado el 30/09/2026): wizzair.com solo prohíbe «smartsearchforwarder»
 * y be.wizzair.com no tiene robots.txt.
 */
import { crearOferta } from '../modelo.js';
import { etiquetaDia, sumarDias } from '../util/fechas.js';
import { recortar } from '../util/xml.js';
import { esHorarioIdeal, generarConsultas } from './ryanair.js';

const WEB = 'https://wizzair.com';
const PORTADA = `${WEB}/es-es`;
const API = 'https://be.wizzair.com';
const CLAVE_VERSION = 'wizzair:version';
const CLAVE_MAPA = 'wizzair:mapa';
const DOCE_HORAS_MS = 12 * 60 * 60 * 1000;
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
/** Días que abarca cada consulta al calendario (la web pide unas 6 semanas). */
export const DIAS_POR_CONSULTA = 42;
const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const CABECERAS = { Origin: WEB, Referer: `${WEB}/` };

/** Versión de la API que enlaza la portada de la web («be.wizzair.com/29.18.0»). */
export function versionDePortada(html) {
  return String(html).match(/be\.wizzair\.com\/(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

/**
 * Del mapa de Wizz, los destinos directos desde cada aeropuerto de `origenes`:
 * `{BCN: [{iata, ciudad, pais, codigoPais, lat, lon}]}`. Se quitan los códigos de
 * área (p. ej. «MIL» para Milán), que repiten los aeropuertos reales.
 */
export function rutasDesde(mapa, origenes) {
  if (!Array.isArray(mapa?.cities)) throw new Error('Respuesta inesperada de Wizz Air: falta la lista «cities» del mapa');
  const porIata = new Map(mapa.cities.map((ciudad) => [ciudad.iata, ciudad]));
  const areas = new Set(mapa.cities.map((ciudad) => ciudad.mac).filter(Boolean));
  return Object.fromEntries(origenes.map((origen) => [origen, (porIata.get(origen)?.connections ?? [])
    .filter((conexion) => conexion.isDirectFlight !== false && !conexion.isConnected && !areas.has(conexion.iata) && porIata.has(conexion.iata))
    .map((conexion) => {
      const ciudad = porIata.get(conexion.iata);
      return {
        iata: ciudad.iata, ciudad: String(ciudad.shortName ?? ciudad.iata).trim(), pais: ciudad.countryName?.trim() || null,
        codigoPais: ciudad.countryCode ?? null, lat: ciudad.latitude ?? null, lon: ciudad.longitude ?? null,
      };
    })]));
}

/** Tramos de fechas (como mucho `DIAS_POR_CONSULTA` días) que cubren todas las consultas. */
export function tramosDeFechas(consultas) {
  if (!consultas.length) return [];
  const desde = consultas.map((c) => c.salida).sort()[0];
  const hasta = consultas.map((c) => c.vuelta).sort().at(-1);
  const tramos = [];
  for (let inicio = desde; inicio <= hasta; inicio = sumarDias(inicio, DIAS_POR_CONSULTA)) {
    const fin = sumarDias(inicio, DIAS_POR_CONSULTA - 1);
    tramos.push({ desde: inicio, hasta: fin < hasta ? fin : hasta });
  }
  return tramos;
}

/** Cuerpo del POST al calendario de precios: ida y vuelta de una ruta entre dos fechas. */
export function cuerpoCalendario(origen, destino, { desde, hasta }) {
  return {
    flightList: [
      { departureStation: origen, arrivalStation: destino, from: desde, to: hasta },
      { departureStation: destino, arrivalStation: origen, from: desde, to: hasta },
    ],
    priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
  };
}

/**
 * Días con vuelo de una respuesta del calendario, por sentido:
 * `{ida: {'2026-10-16': {precio, precioAnterior, horas: ['…T10:10:00', …]}}, vuelta: {…}}`.
 * Los días sin precio (sin plazas o sin vuelo) no aparecen.
 */
export function diasDeCalendario(json) {
  if (!Array.isArray(json?.outboundFlights) || !Array.isArray(json?.returnFlights)) {
    throw new Error('Respuesta inesperada de Wizz Air: faltan «outboundFlights» o «returnFlights»');
  }
  const indexar = (lista) => Object.fromEntries(lista
    .filter((dia) => dia?.price?.currencyCode === 'EUR' && dia.price.amount > 0 && dia.departureDates?.length)
    .map((dia) => [dia.departureDate.slice(0, 10), {
      precio: dia.price.amount,
      precioAnterior: dia.originalPrice?.amount > dia.price.amount ? dia.originalPrice.amount : null,
      horas: [...dia.departureDates].sort(),
    }]));
  return { ida: indexar(json.outboundFlights), vuelta: indexar(json.returnFlights) };
}

const redondear = (euros) => Math.round(euros * 100) / 100;
const hora = (fechaHora) => fechaHora.slice(11, 16);

/**
 * Oferta de una consulta (finde o puente) a un destino, si hay vuelo los dos días
 * y la suma de las tarifas más bajas no pasa de `vuelos.precioMax`.
 * Wizz da el precio más bajo del día, no de cada vuelo: se enseñan todas las horas
 * del día y, como hora de referencia, la última (la que mejor encaja en un finde).
 */
export function ofertaDeRuta(consulta, destino, dias, ajustes) {
  const ida = dias.ida[consulta.salida];
  const vuelta = dias.vuelta[consulta.vuelta];
  if (!ida || !vuelta) return null;
  const precio = redondear(ida.precio + vuelta.precio);
  if (precio > ajustes.vuelos.precioMax) return null;
  const anterior = ida.precioAnterior || vuelta.precioAnterior
    ? redondear((ida.precioAnterior ?? ida.precio) + (vuelta.precioAnterior ?? vuelta.precio))
    : null;
  const salidaIda = ida.horas.at(-1);
  const salidaVuelta = vuelta.horas.at(-1);
  const horarios = (dia) => dia.horas.map(hora).join(', ');
  return crearOferta({
    id: `wizzair:${consulta.origen}-${destino.iata}:${consulta.salida}:${consulta.vuelta}`,
    fuente: 'wizzair',
    tipo: 'vuelo',
    titulo: destino.ciudad,
    descripcion: recortar(`${consulta.origen} → ${destino.iata} · ida ${etiquetaDia(consulta.salida)} (salidas: ${horarios(ida)}) · ` +
      `vuelta ${etiquetaDia(consulta.vuelta)} (salidas: ${horarios(vuelta)}). Precio más bajo de cada día; la hora exacta de esa tarifa se ve al reservar.`),
    url: urlReserva(consulta, destino.iata),
    precio,
    precioTexto: `desde ${EUROS.format(precio)} ida y vuelta`,
    unidad: 'i/v',
    precioAnterior: anterior,
    transporte: 'avion',
    lugar: {
      nombre: destino.ciudad, region: null, pais: destino.pais, codigoPais: destino.codigoPais,
      iata: destino.iata, lat: destino.lat, lon: destino.lon,
    },
    fechas: { salida: salidaIda, vuelta: salidaVuelta },
    vuelo: {
      origen: consulta.origen,
      destino: destino.iata,
      ida: { salida: salidaIda, llegada: null, numero: null, precio: ida.precio, escalas: 0 },
      vuelta: { salida: salidaVuelta, llegada: null, numero: null, precio: vuelta.precio, escalas: 0 },
      consultaId: consulta.id,
      horarioIdeal: esHorarioIdeal(salidaIda, salidaVuelta, ajustes.vuelos.horarioIdeal, consulta.exigirHoraIda),
      patron: consulta.patron,
      nuevaRuta: false,
      directo: true,
    },
    etiquetas: [destino.pais, consulta.patron, 'Directo'].filter(Boolean),
  });
}

function urlReserva({ origen, salida, vuelta }, destino) {
  return `${WEB}/es-es/booking/select-flight/${origen}/${destino}/${salida}/${vuelta}/1/0/0/null`;
}

async function obtenerVersion(ctx, { renovar = false } = {}) {
  const ahora = ctx.ahora.getTime();
  const guardada = renovar ? null : ctx.cache.obtener(CLAVE_VERSION, DOCE_HORAS_MS, ahora);
  if (guardada) return guardada;
  const version = versionDePortada(await ctx.http.texto(PORTADA));
  if (!version) throw new Error('No se encuentra la versión de la API en la portada de Wizz Air');
  ctx.cache.guardar(CLAVE_VERSION, version, ahora);
  return version;
}

async function obtenerMapa(ctx, version) {
  const ahora = ctx.ahora.getTime();
  // Por aeropuertos de salida: si cambian en los ajustes, se vuelve a pedir el mapa.
  const clave = `${CLAVE_MAPA}:${ctx.ajustes.vuelos.aeropuertos.join(',')}`;
  const guardado = ctx.cache.obtener(clave, SIETE_DIAS_MS, ahora);
  if (guardado) return guardado;
  try {
    const mapa = rutasDesde(await ctx.http.json(`${API}/${version}/Api/asset/map?languageCode=es-es`, { cabeceras: CABECERAS }), ctx.ajustes.vuelos.aeropuertos);
    ctx.cache.guardar(clave, mapa, ahora);
    return mapa;
  } catch (error) {
    const viejo = ctx.cache.obtener(clave);
    if (!viejo) throw error;
    ctx.log(`No se ha podido actualizar el mapa de rutas: ${error.message}`);
    return viejo;
  }
}

// Un 403/429 o una respuesta que no es JSON (desafío anti-bot): no se insiste más.
const esBloqueo = (error) => error.estado === 403 || error.estado === 429 || error instanceof SyntaxError;

async function obtener(ctx) {
  const consultas = generarConsultas(ctx).filter((consulta) => consulta.tipo !== 'ideal');
  if (!consultas.length) return { ofertas: [], reemplazar: false };
  let version = await obtenerVersion(ctx);
  const rutas = await obtenerMapa(ctx, version);
  const tramos = tramosDeFechas(consultas);
  const ofertas = [];
  const rutasOk = new Set();
  let peticiones = 0;
  let ultimoError = null;
  let versionRenovada = false;

  const calendario = async (origen, destino, tramo) => {
    if (peticiones++) await ctx.http.esperar(ctx.ajustes.vuelos.pausaEntrePeticionesMs);
    const pedir = () => ctx.http.json(`${API}/${version}/Api/search/timetable`, { cuerpo: cuerpoCalendario(origen, destino, tramo), cabeceras: CABECERAS });
    try {
      return await pedir();
    } catch (error) {
      // Wizz despliega una versión nueva y la vieja deja de responder: se lee otra vez y se reintenta una vez.
      if (versionRenovada || !(error.estado === 400 || error.estado === 404)) throw error;
      versionRenovada = true;
      version = await obtenerVersion(ctx, { renovar: true });
      return pedir();
    }
  };

  bucle: for (const origen of ctx.ajustes.vuelos.aeropuertos) {
    const deEsteOrigen = consultas.filter((consulta) => consulta.origen === origen);
    for (const destino of rutas[origen] ?? []) {
      try {
        const dias = { ida: {}, vuelta: {} };
        for (const tramo of tramos) {
          const parte = diasDeCalendario(await calendario(origen, destino.iata, tramo));
          Object.assign(dias.ida, parte.ida);
          Object.assign(dias.vuelta, parte.vuelta);
        }
        rutasOk.add(`${origen}-${destino.iata}`);
        for (const consulta of deEsteOrigen) {
          const oferta = ofertaDeRuta(consulta, destino, dias, ctx.ajustes);
          if (oferta) ofertas.push(oferta);
        }
      } catch (error) {
        ultimoError = error;
        ctx.log(`Ruta ${origen}-${destino.iata} fallida: ${error.message}`);
        if (esBloqueo(error)) {
          ctx.log('Wizz Air ha bloqueado o limitado las peticiones: no se hacen más consultas en esta ejecución');
          break bucle;
        }
      }
    }
  }
  if (!rutasOk.size && ultimoError) throw new Error(`Ninguna consulta a Wizz Air ha funcionado (último error: ${ultimoError.message})`);
  return {
    ofertas,
    reemplazar: (oferta) => rutasOk.has(`${oferta.vuelo?.origen}-${oferta.vuelo?.destino}`),
  };
}

export default {
  id: 'wizzair',
  nombre: 'Wizz Air',
  web: WEB,
  modo: 'api',
  requiere: [],
  urls: [PORTADA, `${API}/api/search/timetable`],
  obtener,
};
