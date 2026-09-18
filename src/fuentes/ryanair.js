/**
 * Vuelos de ida y vuelta de fin de semana y puentes con Ryanair, usando la API
 * pública (no oficial) de tarifas que usa su propia web: la tarifa más barata
 * por destino para unas fechas concretas.
 *
 * DESACTIVADA en config/ajustes.json: el robots.txt de Ryanair prohíbe /api a
 * cualquier agente (comprobado el 18/09/2026) y el orquestador respeta robots.txt,
 * así que solo se ejecutaría si Ryanair cambiara esa regla.
 */
import { crearOferta } from '../modelo.js';
import { etiquetaFechaHora, fechaLocal, sumarDias } from '../util/fechas.js';
import { recortar } from '../util/xml.js';

const WEB = 'https://www.ryanair.com';
const URL_TARIFAS = `${WEB}/api/farfnd/v4/roundTripFares`;
const URL_AEROPUERTOS = `${WEB}/api/views/locate/5/airports/es/active`;
const CLAVE_AEROPUERTOS = 'ryanair:aeropuertos';
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const SIETE_DIAS_MS = 7 * UN_DIA_MS;
const SUFIJO_IDEAL = ':ideal';
const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/**
 * Consultas de esta ejecución: findes × patrones × aeropuertos (normal), la
 * variante con horario ideal y los puentes que no cubren las normales.
 * @returns {{id: string, origen: string, salida: string, vuelta: string, tipo: 'normal'|'ideal'|'puente', patron: string, exigirHoraIda: boolean}[]}
 */
export function generarConsultas({ ajustes, findes, puentes = [], ahora }) {
  const { aeropuertos, patrones, horarioIdeal } = ajustes.vuelos;
  const hoy = fechaLocal(ahora);
  const viajes = findes
    .flatMap((finde) => patrones.map((patron) => ({
      salida: sumarDias(finde.viernes, patron.salida),
      vuelta: sumarDias(finde.viernes, patron.vuelta),
      patron: patron.id,
    })))
    .filter((viaje) => viaje.salida >= hoy);

  const normales = combinar(viajes, aeropuertos, 'normal');
  const ideales = combinar(viajes, horarioIdeal?.aeropuertos ?? [], 'ideal');
  const cubiertas = new Set(normales.map(claveViaje));
  const dePuentes = ajustes.puentes?.buscarVuelos
    ? combinar(viajesDePuentes(puentes, hoy, findes.at(-1)?.domingo), aeropuertos, 'puente')
      .filter((consulta) => !cubiertas.has(claveViaje(consulta)))
    : [];
  return [...normales, ...ideales, ...dePuentes];
}

function viajesDePuentes(puentes, hoy, horizonte) {
  if (!horizonte) return [];
  return puentes.flatMap((puente) => puente.salidas
    .filter((salida) => salida >= hoy && salida <= horizonte)
    // Solo el día laborable anterior al puente exige salir por la tarde.
    .map((salida) => ({ salida, vuelta: puente.vuelta, patron: 'puente', exigirHoraIda: salida < puente.desde })));
}

function combinar(viajes, aeropuertos, tipo) {
  return viajes.flatMap(({ salida, vuelta, patron, exigirHoraIda = true }) => aeropuertos.map((origen) => ({
    id: `${origen}:${salida}:${vuelta}:${tipo}`, origen, salida, vuelta, tipo, patron, exigirHoraIda,
  })));
}

const claveViaje = (consulta) => `${consulta.origen}:${consulta.salida}:${consulta.vuelta}`;

/** URL de la API de tarifas de ida y vuelta para una consulta. */
export function urlConsulta(consulta, ajustes) {
  const { precioMax, horarioIdeal } = ajustes.vuelos;
  const parametros = {
    departureAirportIataCode: consulta.origen,
    outboundDepartureDateFrom: consulta.salida,
    outboundDepartureDateTo: consulta.salida,
    inboundDepartureDateFrom: consulta.vuelta,
    inboundDepartureDateTo: consulta.vuelta,
    market: 'es-es',
    adultPaxCount: 1,
    currency: 'EUR',
    priceValueTo: precioMax,
  };
  if (consulta.tipo === 'ideal') {
    Object.assign(parametros, {
      outboundDepartureTimeFrom: horarioIdeal.salidaDesde,
      outboundDepartureTimeTo: '23:59',
      inboundDepartureTimeFrom: horarioIdeal.vueltaDesde,
      inboundDepartureTimeTo: '23:59',
    });
  }
  // Sin codificar, igual que la web: solo hay códigos IATA, fechas, horas y números.
  const cadena = Object.entries(parametros)
    .filter(([, valor]) => valor != null)
    .map(([clave, valor]) => `${clave}=${valor}`)
    .join('&');
  return `${URL_TARIFAS}?${cadena}`;
}

/**
 * true si la ida (fecha-hora local) sale a partir de `horario.salidaDesde` y la
 * vuelta a partir de `horario.vueltaDesde`. Con `exigirIda = false` solo cuenta la vuelta.
 */
export function esHorarioIdeal(ida, vuelta, horario, exigirIda = true) {
  if (!horario) return false;
  const hora = (fechaHora) => fechaHora.slice(11, 16);
  return (!exigirIda || hora(ida) >= horario.salidaDesde) && hora(vuelta) >= horario.vueltaDesde;
}

/** Índice `{IATA: {lat, lon}}` a partir de la lista de aeropuertos de Ryanair. */
export function indexarAeropuertos(lista) {
  if (!Array.isArray(lista)) throw new Error('Respuesta inesperada de Ryanair: la lista de aeropuertos no es un array');
  return Object.fromEntries(lista
    .filter((aeropuerto) => aeropuerto?.code && aeropuerto.coordinates)
    .map((aeropuerto) => [aeropuerto.code, { lat: aeropuerto.coordinates.latitude, lon: aeropuerto.coordinates.longitude }]));
}

/**
 * Ofertas de una respuesta de `roundTripFares`. Las tarifas que no cumplen el
 * contrato se descartan y se registran con `log`.
 */
export function parsearTarifas(json, consulta, aeropuertos, ajustes, log = () => {}) {
  if (!Array.isArray(json?.fares)) throw new Error('Respuesta inesperada de Ryanair: falta la lista «fares»');
  return json.fares.flatMap((tarifa) => {
    try {
      return [ofertaDeTarifa(tarifa, consulta, aeropuertos, ajustes)];
    } catch (error) {
      log(`Tarifa descartada en ${consulta.id}: ${error.message}`);
      return [];
    }
  });
}

function ofertaDeTarifa({ outbound: ida, inbound: vuelta, summary }, consulta, aeropuertos, ajustes) {
  const destino = ida.arrivalAirport;
  const ciudad = destino.city?.name ?? destino.name;
  const pais = destino.countryName ?? null;
  const coordenadas = aeropuertos[destino.iataCode];
  const precio = summary.price.value;
  return crearOferta({
    id: `ryanair:${consulta.origen}-${destino.iataCode}:${consulta.salida}:${consulta.vuelta}${consulta.tipo === 'ideal' ? SUFIJO_IDEAL : ''}`,
    fuente: 'ryanair',
    tipo: 'vuelo',
    titulo: ciudad,
    descripcion: recortar(`${consulta.origen} → ${destino.iataCode} · ${etiquetaFechaHora(ida.departureDate)} → ${etiquetaFechaHora(vuelta.departureDate)}`),
    url: urlReserva(consulta, destino.iataCode),
    precio,
    precioTexto: `${EUROS.format(precio)} ida y vuelta`,
    unidad: 'i/v',
    precioAnterior: summary.previousPrice?.value ?? null,
    transporte: 'avion',
    lugar: {
      nombre: ciudad,
      region: null,
      pais,
      codigoPais: destino.city?.countryCode?.toUpperCase() ?? null,
      iata: destino.iataCode,
      lat: coordenadas?.lat ?? null,
      lon: coordenadas?.lon ?? null,
    },
    fechas: { salida: ida.departureDate, vuelta: vuelta.departureDate },
    vuelo: {
      origen: consulta.origen,
      destino: destino.iataCode,
      ida: tramo(ida),
      vuelta: tramo(vuelta),
      consultaId: consulta.id,
      horarioIdeal: esHorarioIdeal(ida.departureDate, vuelta.departureDate, ajustes.vuelos.horarioIdeal, consulta.exigirHoraIda),
      patron: consulta.patron,
      nuevaRuta: Boolean(summary.newRoute),
    },
    etiquetas: [pais, consulta.patron].filter(Boolean),
  });
}

const tramo = (vuelo) => ({
  salida: vuelo.departureDate,
  llegada: vuelo.arrivalDate,
  numero: vuelo.flightNumber,
  precio: vuelo.price?.value ?? null,
});

function urlReserva({ origen, salida, vuelta }, destino) {
  return `${WEB}/es/es/trip/flights/select?adults=1&teens=0&children=0&infants=0` +
    `&dateOut=${salida}&dateIn=${vuelta}&isConnectedFlight=false&isReturn=true&discount=0` +
    `&originIata=${origen}&destinationIata=${destino}`;
}

// Quita las ofertas de la variante ideal que repiten los vuelos de la normal y marca esta como ideal.
function fusionarIdeales(ofertas) {
  const porId = new Map(ofertas.map((oferta) => [oferta.id, oferta]));
  const repetidas = new Set();
  for (const ideal of ofertas.filter((oferta) => oferta.id.endsWith(SUFIJO_IDEAL))) {
    const normal = porId.get(ideal.id.slice(0, -SUFIJO_IDEAL.length));
    if (normal && normal.vuelo.ida.numero === ideal.vuelo.ida.numero && normal.vuelo.vuelta.numero === ideal.vuelo.vuelta.numero) {
      normal.vuelo.horarioIdeal = true;
      repetidas.add(ideal.id);
    }
  }
  return ofertas.filter((oferta) => !repetidas.has(oferta.id));
}

// Pide JSON esperando `pausaEntrePeticionesMs` antes de cada petición salvo la primera.
function peticionesEspaciadas(ctx) {
  let primera = true;
  return async (url) => {
    if (!primera) await ctx.http.esperar(ctx.ajustes.vuelos.pausaEntrePeticionesMs);
    primera = false;
    return ctx.http.json(url);
  };
}

async function obtenerAeropuertos(ctx, pedir) {
  const ahora = ctx.ahora.getTime();
  const guardados = ctx.cache.obtener(CLAVE_AEROPUERTOS, SIETE_DIAS_MS, ahora);
  if (guardados) return guardados;
  try {
    const aeropuertos = indexarAeropuertos(await pedir(URL_AEROPUERTOS));
    ctx.cache.guardar(CLAVE_AEROPUERTOS, aeropuertos, ahora);
    return aeropuertos;
  } catch (error) {
    ctx.log(`No se ha podido actualizar la lista de aeropuertos: ${error.message}`);
    return ctx.cache.obtener(CLAVE_AEROPUERTOS) ?? {};
  }
}

// Un 403/429 o una respuesta que no es JSON (desafío anti-bot): no se insiste más.
const esBloqueo = (error) => error.estado === 403 || error.estado === 429 || error instanceof SyntaxError;

async function obtener(ctx) {
  const consultas = generarConsultas(ctx);
  if (!consultas.length) return { ofertas: [], reemplazar: false };
  const pedir = peticionesEspaciadas(ctx);
  const aeropuertos = await obtenerAeropuertos(ctx, pedir);
  const ofertas = [];
  const correctas = new Set();
  let ultimoError = null;
  for (const consulta of consultas) {
    try {
      const json = await pedir(urlConsulta(consulta, ctx.ajustes));
      ofertas.push(...parsearTarifas(json, consulta, aeropuertos, ctx.ajustes, ctx.log));
      correctas.add(consulta.id);
    } catch (error) {
      ultimoError = error;
      ctx.log(`Consulta ${consulta.id} fallida: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Ryanair ha bloqueado o limitado las peticiones: no se hacen más consultas en esta ejecución');
        break;
      }
    }
  }
  if (!correctas.size) throw new Error(`Ninguna consulta a Ryanair ha funcionado (último error: ${ultimoError.message})`);
  return {
    ofertas: fusionarIdeales(ofertas),
    reemplazar: (oferta) => correctas.has(oferta.vuelo?.consultaId),
  };
}

export default {
  id: 'ryanair',
  nombre: 'Ryanair',
  web: WEB,
  modo: 'api',
  requiere: [],
  urls: [URL_TARIFAS, URL_AEROPUERTOS],
  obtener,
};
