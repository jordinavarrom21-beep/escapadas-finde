/**
 * Las fechas que busca la persona, para que los enlaces de las ofertas de fechas flexibles
 * (Booking, Airbnb, Trivago, Skyscanner, KAYAK, Google Flights, GetYourGuide, Omio) abran
 * esos días y no «el próximo finde», que es lo que ponía el escaneo al generarlos.
 */
import { etiquetaRango, sumarDias } from './fechas.js';

/** Entrada a un puente: el último día laborable de antes (el viernes por la tarde), como en el resto de la web. */
const entradaPuente = (puente) => puente.salidas?.[0] ?? sumarDias(puente.desde, -1);

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Entrada y salida de lo que se busca: un finde o un puente («cuando»), un rango («desde» y
 * «hasta») o un día («desde» = «hasta», o solo «desde»: se suman las noches del viaje).
 * @param {Record<string, string>} params
 * @param {{finde?: object, puente?: object, findes?: object[], puentes?: object[], noches?: number, hoy?: string}} ctx
 * @returns {{entrada: string, salida: string, etiqueta: string}|null}
 */
export function fechasDeBusqueda(params = {}, ctx = {}) {
  // Lo que ya ha pasado no se puede reservar: el sábado de un finde (o a mitad de un puente)
  // se entra hoy, no el viernes; si ya no queda ninguna noche, sin fechas.
  const desdeHoy = (r) => {
    if (!r || !ctx.hoy || r.entrada >= ctx.hoy) return r;
    return r.salida > ctx.hoy ? rango(ctx.hoy, r.salida) : null;
  };
  return desdeHoy(fechasSinRecortar(params, ctx));
}

function fechasSinRecortar(params, ctx) {
  const cuando = params.cuando;
  if (cuando) {
    const finde = cuando === 'finde' ? ctx.finde : (ctx.findes ?? []).find((f) => f.id === cuando);
    if (finde) return rango(finde.viernes, finde.domingo);
    const puente = cuando === 'puente' ? ctx.puente : (ctx.puentes ?? []).find((p) => p.id === cuando);
    // Con entrada el viernes y salida el último día libre: lo mismo que dicen la franja y el encaje.
    if (puente) return rango(entradaPuente(puente), puente.hasta);
  }
  const { desde, hasta } = params;
  if (!DIA.test(desde ?? '')) return null;
  const noches = Math.max(1, Number(ctx.noches) || 2);
  return rango(desde, DIA.test(hasta ?? '') && hasta > desde ? hasta : sumarDias(desde, noches));
}

const rango = (entrada, salida) => ({ entrada, salida, etiqueta: etiquetaRango(entrada, salida) });

const aaaammdd = (fecha) => fecha.replaceAll('-', '');
const aammdd = (fecha) => aaaammdd(fecha).slice(2);

/**
 * El mismo enlace con las fechas (y los viajeros) de la búsqueda, en las webs que se sabe
 * cómo las llevan en la URL. Las demás, tal cual.
 * @param {string} url
 * @param {{entrada: string, salida: string}} fechas
 * @param {number} [viajeros]
 */
export function conFechas(url, { entrada, salida }, viajeros = 2) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const personas = String(Math.max(1, Math.round(viajeros) || 2));
  const poner = (valores) => { for (const [clave, valor] of Object.entries(valores)) u.searchParams.set(clave, valor); };
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'booking.com') poner({ checkin: entrada, checkout: salida, group_adults: personas });
  else if (host === 'airbnb.es' || host === 'airbnb.com') poner({ checkin: entrada, checkout: salida, adults: personas });
  else if (host === 'trivago.es') {
    const busqueda = u.searchParams.get('search');
    if (busqueda) u.searchParams.set('search', busqueda.replace(/dr-\d{8}-\d{8}/, `dr-${aaaammdd(entrada)}-${aaaammdd(salida)}`).replace(/rc-1-\d+/, `rc-1-${personas}`));
  } else if (host === 'skyscanner.es') {
    u.pathname = u.pathname.replace(/\/\d{6}\/\d{6}\/?$/, `/${aammdd(entrada)}/${aammdd(salida)}/`);
    poner({ adultsv2: personas });
  } else if (host === 'kayak.es') {
    u.pathname = u.pathname.replace(/\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/, `/${entrada}/${salida}${personas === '1' ? '' : `/${personas}adults`}`);
  } else if (host === 'google.com' && u.pathname.startsWith('/travel/flights')) {
    const q = u.searchParams.get('q');
    if (q) u.searchParams.set('q', q.replace(/el \d{4}-\d{2}-\d{2} vuelta \d{4}-\d{2}-\d{2}/, `el ${entrada} vuelta ${salida}`));
  } else if (host === 'getyourguide.es') poner({ date_from: entrada, date_to: salida });
  else if (host === 'omio.es') poner({ departureDate: entrada });
  else return url;
  return u.href;
}

/**
 * Webs de ofertas cuya ficha entiende las fechas en la URL (comprobado con sus páginas: con
 * `checkin`/`checkout` muestran «vie, 13 nov – dom, 15 nov» y el precio de esos días). Las
 * demás (Weekendesk, Atrápalo, BuscoUnChollo, Escapada Rural…) las ignoran: allí se eligen
 * en su calendario.
 */
const FICHA_CON_FECHAS = {
  'holidu.es': (u, { entrada, salida }, personas) => { u.searchParams.set('checkin', entrada); u.searchParams.set('checkout', salida); u.searchParams.set('adults', personas); },
  'clubrural.com': (u, { entrada, salida }, personas) => { u.searchParams.set('checkin', entrada); u.searchParams.set('checkout', salida); u.searchParams.set('adults', personas); },
};

/**
 * La web de la propia oferta con las fechas (y viajeros) de la búsqueda, o null si esa web no
 * las entiende en la URL.
 * @param {string} url
 * @param {{entrada: string, salida: string}} fechas
 * @param {number} [viajeros]
 * @returns {string|null}
 */
export function ofertaConFechas(url, fechas, viajeros = 2) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const poner = FICHA_CON_FECHAS[u.hostname.replace(/^www\./, '')];
  if (!poner) return null;
  poner(u, fechas, String(Math.max(1, Math.round(viajeros) || 2)));
  return u.href;
}
