/**
 * Enlaces útiles de cada oferta con destino y fechas ya rellenados: comparar el
 * vuelo, buscar alojamiento en la zona y ver cómo llegar en coche. Solo se
 * construyen URLs: nunca se consultan esas webs.
 */
import { fechaLocal, findesProximos } from '../util/fechas.js';

const cod = encodeURIComponent;

/**
 * Ids de destino de Trivago (sacados de su portada y su sitemap público). Trivago no
 * admite búsquedas por texto en la URL, así que solo se enlaza con los destinos conocidos.
 */
const TRIVAGO = {
  barcelona: '200-13437', madrid: '200-13628', roma: '200-25084', londres: '200-17399',
  sevilla: '200-13764', valencia: '200-53826',
};

const aaaammdd = (fecha) => fecha.replaceAll('-', '');
const aammdd = (fecha) => aaaammdd(fecha).slice(2);
const sinTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Fechas de alojamiento: las de la oferta o, si no tiene, el próximo finde (desde hoy si ya ha empezado).
function fechasEstancia(oferta, ahora) {
  const { salida, vuelta } = oferta.fechas;
  if (salida && vuelta) return { entrada: salida.slice(0, 10), salida: vuelta.slice(0, 10) };
  const hoy = fechaLocal(ahora);
  const finde = findesProximos(2, ahora).find((f) => f.domingo > hoy);
  return { entrada: finde.viernes > hoy ? finde.viernes : hoy, salida: finde.domingo };
}

function enlacesAlojamiento(nombre, { entrada, salida }) {
  const enlaces = [
    {
      etiqueta: 'Hoteles en Booking',
      url: `https://www.booking.com/searchresults.es.html?ss=${cod(nombre)}&checkin=${entrada}&checkout=${salida}&group_adults=2&no_rooms=1&group_children=0`,
    },
    {
      etiqueta: 'Alojamientos en Airbnb',
      url: `https://www.airbnb.es/s/${cod(nombre)}/homes?checkin=${entrada}&checkout=${salida}&adults=2`,
    },
  ];
  const idTrivago = TRIVAGO[sinTildes(nombre)];
  if (idTrivago) {
    enlaces.splice(1, 0, {
      etiqueta: 'Comparar en Trivago',
      url: `https://www.trivago.es/es/srl?search=${idTrivago};dr-${aaaammdd(entrada)}-${aaaammdd(salida)};rc-1-2`,
    });
  }
  return enlaces;
}

function enlacesVuelo({ origen, destino, nombreDestino }, { entrada, salida }) {
  const enlaces = [{
    etiqueta: 'Comparar en Google Flights',
    url: `https://www.google.com/travel/flights?q=${cod(`Vuelos de ${origen} a ${destino ?? nombreDestino} el ${entrada} vuelta ${salida}`)}&hl=es`,
  }];
  if (destino) {
    enlaces.push(
      { etiqueta: 'Comparar en Skyscanner', url: `https://www.skyscanner.es/transporte/vuelos/${origen.toLowerCase()}/${destino.toLowerCase()}/${aammdd(entrada)}/${aammdd(salida)}/?adultsv2=1` },
      { etiqueta: 'Comparar en KAYAK', url: `https://www.kayak.es/flights/${origen}-${destino}/${entrada}/${salida}?sort=price_a` },
    );
  }
  return enlaces;
}

function enlaceRuta(origen, { lat, lon }) {
  return {
    etiqueta: 'Cómo llegar en coche',
    grupo: 'llegar',
    url: `https://www.google.com/maps/dir/?api=1&origin=${origen.lat},${origen.lon}&destination=${lat},${lon}&travelmode=driving`,
  };
}

/** Qué hacer en el destino esos días: los buscadores de actividades no dejan leer su catálogo, pero sí enlazar. */
function enlacesActividades(nombre, { entrada }) {
  return [
    { etiqueta: 'Actividades en Civitatis', grupo: 'actividades', url: `https://www.civitatis.com/es/buscar/?q=${cod(nombre)}` },
    { etiqueta: 'Visitas en GetYourGuide', grupo: 'actividades', url: `https://www.getyourguide.es/s/?q=${cod(nombre)}&date_from=${entrada}` },
    { etiqueta: 'Free tours en GuruWalk', grupo: 'actividades', url: `https://www.guruwalk.com/es/search?q=${cod(nombre)}` },
  ];
}

/** Alternativas de transporte a un destino cercano: tren, bus y ferry. */
function enlacesTransporte(oferta, origen, { entrada }) {
  const destino = oferta.lugar?.nombre;
  const enlaces = [
    { etiqueta: 'Tren o bus en Omio', grupo: 'llegar', url: `https://www.omio.es/search-frontend/results?departurePosition=${cod(origen.nombre)}&arrivalPosition=${cod(destino)}&departureDate=${entrada}` },
  ];
  if (oferta.transporte === 'ferry' || /balear|mallorca|menorca|ibiza|formentera|cerdena|cerdeña|sicilia|italia/i.test(`${destino} ${oferta.lugar?.region ?? ''} ${oferta.lugar?.pais ?? ''}`)) {
    enlaces.push({ etiqueta: 'Ferris en Direct Ferries', grupo: 'llegar', url: `https://www.directferries.es/rutas.htm?q=${cod(destino)}` });
  }
  return enlaces;
}

/**
 * Enlaces extra de una oferta (además de su propia URL), agrupados por para qué
 * sirven: comparar el vuelo, buscar alojamiento, llegar y qué hacer allí.
 * @param {import('../modelo.js').Oferta} oferta
 * @param {{origen: {nombre: string, lat: number, lon: number}, ahora?: Date, max?: number}} opciones
 */
export function enlacesPara(oferta, { origen, ahora = new Date(), max = 8 }) {
  const nombre = oferta.lugar?.nombre;
  const fechas = fechasEstancia(oferta, ahora);
  const enlaces = [];
  if (oferta.tipo === 'vuelo' && (oferta.vuelo || nombre)) {
    enlaces.push(...enlacesVuelo({
      origen: oferta.vuelo?.origen ?? origen.nombre,
      destino: oferta.vuelo?.destino ?? null,
      nombreDestino: nombre,
    }, fechas).map((enlace) => ({ ...enlace, grupo: 'comparar' })));
  }
  // Una actividad ya es el plan: no tiene sentido ofrecerle más actividades.
  if (nombre && oferta.tipo !== 'actividad') {
    enlaces.push(...enlacesAlojamiento(nombre, fechas).map((enlace) => ({ ...enlace, grupo: 'alojamiento' })));
    enlaces.push(...enlacesActividades(nombre, fechas));
  }
  if (oferta.tipo !== 'vuelo' && oferta.transporte !== 'avion' && nombre) {
    if (oferta.lugar?.lat != null && oferta.lugar?.lon != null) enlaces.push(enlaceRuta(origen, oferta.lugar));
    enlaces.push(...enlacesTransporte(oferta, origen, fechas));
  }
  return enlaces.slice(0, max);
}
