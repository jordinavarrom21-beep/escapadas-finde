/**
 * Precios de Google Hoteles para comparar: lo que cuesta una noche en ese mismo hotel en
 * Booking, Hotels.com, su web oficial… (`preciosGoogle`, en la ficha, en «Comparar precios»).
 * OPCIONAL y de pago: lo lee Apify (actor vittuhy/google-travel-hotel-prices,
 * src/util/apify.js) y solo con el secreto APIFY_TOKEN.
 *
 * - Solo hoteles, paradores, balnearios, hostales y apartamentos con nombre propio
 *   (`establecimiento`): las casas rurales casi nunca están en Google Hoteles.
 * - La noche de referencia es el viernes del finde de la oferta o, si no tiene, el del próximo
 *   finde, para `ajustes.viajeros` adultos. Es una referencia: la oferta puede incluir más cosas
 *   (desayuno, spa…) o ser para otras fechas, y la ficha lo dice.
 * - Google no dice qué hotel ha encontrado, pero sí cuál es su web oficial: si no hay web
 *   oficial con el mismo nombre, no se enseña nada (podría ser otro hotel).
 * - Como mucho `apify.googleHoteles.maxPorDia` hoteles al día, los de mejor nota primero, y
 *   cada precio vale `diasValidez` días (o hasta que pasa su viernes). Los enlaces de Google son
 *   de anuncios con seguimiento: no se guardan.
 */
import { mismoNombre } from './google-maps.js';
import { anotarConsultas, consultasDeHoy, ejecutarActor } from '../util/apify.js';
import { fechaLocal } from '../util/fechas.js';
import { normalizarTexto } from '../util/xml.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const POR_DEFECTO = { activo: true, maxPorDia: 2, diasValidez: 7 };
const ALOJAMIENTOS = new Set(['hotel', 'parador', 'balneario', 'hostal', 'apartamento']);
const MAX_PROVEEDORES = 6;
const MAX_USD_POR_HOTEL = 0.05;

const plano = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, ' ').trim();
const clave = (o) => `ghoteles:${plano(o.establecimiento)}|${plano(o.lugar.nombre)}`;

export const candidatasHoteles = (ofertas) => ofertas.filter((o) => o.tipo !== 'vuelo' && o.establecimiento && o.lugar?.nombre && ALOJAMIENTOS.has(o.alojamiento));

/** Viernes de referencia: el del finde de la oferta si aún no ha pasado; si no, el del próximo. */
export function nocheDeReferencia(oferta, findes, hoy) {
  const suyo = findes.find((f) => f.id === oferta.fechas?.findeId);
  if (suyo && suyo.viernes > hoy) return suyo.viernes;
  return findes.find((f) => f.viernes > hoy)?.viernes ?? null;
}

/**
 * De las filas del actor (una por web que vende la habitación), lo que se enseña: la web
 * oficial tiene que llamarse como el alojamiento; los precios, en euros y de esa noche.
 * @returns {{fecha, adultos, minimo, proveedores: {nombre, precio, oficial}[]}|null}
 */
export function preciosDeFilas(filas, oferta, fecha) {
  const validas = (Array.isArray(filas) ? filas : [])
    .filter((f) => f?.currency === 'EUR' && f.checkInDate === fecha && f.price > 0 && typeof f.provider === 'string' && f.provider.trim());
  const oficial = validas.find((f) => f.isOfficial);
  if (!oficial || !mismoNombre(oferta.establecimiento, oficial.provider)) return null;
  const porWeb = new Map();
  for (const f of validas) {
    const nombre = f.provider.trim();
    if (!porWeb.has(nombre) || f.price < porWeb.get(nombre).precio) porWeb.set(nombre, { nombre, precio: f.price, oficial: Boolean(f.isOfficial) });
  }
  const ordenados = [...porWeb.values()].sort((a, b) => a.precio - b.precio);
  const proveedores = ordenados.slice(0, MAX_PROVEEDORES);
  const web = ordenados.find((p) => p.oficial);
  if (web && !proveedores.includes(web)) proveedores.push(web);
  return { fecha, adultos: oficial.adults ?? null, minimo: ordenados[0].precio, proveedores };
}

/** Vale lo guardado si es de un viernes que aún no ha pasado. */
const vigente = (guardado, hoy) => guardado && guardado.fecha > hoy;

export async function anadirPreciosGoogle(ofertas, ctx) {
  const config = { ...POR_DEFECTO, ...ctx.ajustes.apify?.googleHoteles };
  const ahora = ctx.ahora.getTime();
  const hoy = fechaLocal(ctx.ahora);
  const pendientes = new Map();
  // Lo de un escaneo anterior se vuelve a poner solo si sigue valiendo.
  for (const oferta of ofertas) oferta.preciosGoogle = null;
  for (const oferta of candidatasHoteles(ofertas)) {
    const guardado = ctx.cache.obtener(clave(oferta), config.diasValidez * DIA_MS, ahora);
    if (vigente(guardado, hoy)) {
      if (guardado.precios) oferta.preciosGoogle = guardado.precios;
    } else if (!pendientes.has(clave(oferta))) {
      pendientes.set(clave(oferta), oferta);
    }
  }
  if (!ctx.env.APIFY_TOKEN || config.activo === false || !pendientes.size) return;
  const cupo = config.maxPorDia - consultasDeHoy(ctx.cache, 'googleHoteles', ctx.ahora);
  if (cupo <= 0) return;
  // Las de mejor nota primero (este paso va después de puntuar): son las que más se ven.
  const tanda = [...pendientes.values()].sort((a, b) => (b.puntuacion ?? 0) - (a.puntuacion ?? 0)).slice(0, cupo);
  let conPrecios = 0;
  for (const oferta of tanda) {
    const fecha = nocheDeReferencia(oferta, ctx.findes ?? [], hoy);
    if (!fecha) continue;
    // Se cuenta antes de lanzar: un intento fallido también gasta el cupo del día.
    anotarConsultas(ctx.cache, 'googleHoteles', ctx.ahora, 1);
    let filas;
    try {
      filas = await ejecutarActor(ctx, 'googleHoteles', {
        entity: `${oferta.establecimiento}, ${oferta.lugar.nombre}`, checkInDate: fecha, days: 1,
        adults: ctx.ajustes.viajeros ?? 2, currency: 'EUR',
      }, { maxUsd: MAX_USD_POR_HOTEL });
    } catch (error) {
      ctx.log(`Google Hoteles: ${error.message}`);
      break;
    }
    const precios = preciosDeFilas(filas, oferta, fecha);
    ctx.cache.guardar(clave(oferta), { fecha, precios }, ahora);
    if (precios) {
      conPrecios += 1;
      for (const o of candidatasHoteles(ofertas)) if (clave(o) === clave(oferta)) o.preciosGoogle = precios;
    }
  }
  ctx.log(`Google Hoteles: precios de ${conPrecios} de ${tanda.length} hoteles consultados (${pendientes.size - tanda.length} pendientes)`);
}
