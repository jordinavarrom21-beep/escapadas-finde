/**
 * Vigencia de las ofertas: una sola política para el panel (listas, recuentos, portada, mapa)
 * y para las guías para buscadores (src/paginas.js). Cada oferta está en uno de tres estados:
 *  - «caducada»: ya no se puede usar (su fecha de fin, o la de salida, ya ha pasado). No se
 *    enseña en ningún sitio.
 *  - «sin confirmar»: su web no la ha vuelto a mostrar en el tiempo previsto (abajo). Puede
 *    seguir existiendo o no: no cuenta en los recuentos ni sale en las guías ni en lo
 *    destacado; en las listas, solo si se pide («Incluir las sin confirmar»), al final y marcada.
 *  - «vigente»: lo demás.
 *
 * Tiempo máximo sin volver a verla en su web (`vistaUltima`, la hora de la última lectura de su
 * web en la que salía con ese precio):
 *  - vuelos y billetes de tren, bus o ferry: 24 h (sus precios cambian antes);
 *  - hoteles, escapadas y paquetes: 48 h;
 *  - actividades y entradas: 72 h;
 *  - si el viaje es en los próximos 3 días, como mucho 12 h (lo que queda libre cambia rápido);
 *  - y nunca menos de dos revisiones de su web más una hora: una web que se lee una vez al día
 *    no deja sus ofertas «sin confirmar» a las pocas horas de cada lectura.
 * Se mide hasta la hora del escaneo (`revision`), no hasta ahora: si el escaneo se retrasa, no
 * pasan todas a «sin confirmar» a la vez (eso ya lo avisa «Revisado hace…»).
 */
import { fechaLocal } from './fechas.js';

export const HORAS_VIGENCIA = { vuelo: 24, transporte: 24, actividad: 72, alojamiento: 48 };
/** Con el viaje en los próximos DIAS_VIAJE_CERCANO días, el límite baja a HORAS_VIAJE_CERCANO. */
export const DIAS_VIAJE_CERCANO = 3;
export const HORAS_VIAJE_CERCANO = 12;
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/** Billetes sueltos de tren, bus o ferry (como esTransporte de filtros.js). */
const esBillete = (o) => ['bus', 'tren', 'ferry'].includes(o.transporte) && !o.alojamiento && !o.noches && (o.unidad == null || o.unidad === 'trayecto');

/** Qué clase de oferta es para la política: vuelo, transporte, actividad o alojamiento. */
export function claseVigencia(o) {
  if (o.tipo === 'vuelo') return 'vuelo';
  if (o.tipo === 'actividad') return 'actividad';
  return esBillete(o) ? 'transporte' : 'alojamiento';
}

/** El día de salida (AAAA-MM-DD) si la oferta tiene fechas concretas; si no, null. */
export function diaDeSalida(o) {
  const salida = o.vuelo?.ida?.salida ?? o.fechas?.salida;
  return typeof salida === 'string' && salida.length >= 10 ? salida.slice(0, 10) : null;
}

/** ¿Ya no se puede usar? Fecha de fin pasada o salida antes de hoy. */
export function caducada(o, ahora = new Date()) {
  if (o.caduca && Date.parse(o.caduca) < ahora.getTime()) return true;
  const salida = diaDeSalida(o);
  return Boolean(salida) && salida < fechaLocal(ahora);
}

/** Horas que puede pasar sin volver a verse en su web antes de quedar «sin confirmar». */
export function horasLimite(o, ctx = {}) {
  const ahora = ctx.ahora ?? new Date();
  let horas = HORAS_VIGENCIA[claseVigencia(o)];
  const salida = diaDeSalida(o);
  if (salida && Date.parse(`${salida}T00:00:00`) - ahora.getTime() <= DIAS_VIAJE_CERCANO * DIA_MS) horas = Math.min(horas, HORAS_VIAJE_CERCANO);
  const intervaloMin = ctx.intervalos?.get(o.fuente);
  return Math.max(horas, intervaloMin ? (2 * intervaloMin) / 60 + 1 : 0);
}

/** Horas desde que su web la mostró por última vez (hasta la hora del escaneo), o null si no se sabe. */
export function horasSinVer(o, ctx = {}) {
  const vista = Date.parse(o.vistaUltima);
  if (!Number.isFinite(vista)) return null;
  const hasta = (ctx.revision ?? ctx.ahora ?? new Date()).getTime();
  return (hasta - vista) / HORA_MS;
}

/** «caducada», «sin-confirmar» o «vigente». */
export function vigencia(o, ctx = {}) {
  if (caducada(o, ctx.ahora ?? new Date())) return 'caducada';
  const horas = horasSinVer(o, ctx);
  return horas != null && horas > horasLimite(o, ctx) ? 'sin-confirmar' : 'vigente';
}

/** Las ofertas repartidas por estado (en el mismo orden en que llegan). */
export function repartir(ofertas, ctx = {}) {
  const grupos = { vigentes: [], sinConfirmar: [], caducadas: [] };
  for (const o of ofertas) {
    const v = vigencia(o, ctx);
    grupos[v === 'vigente' ? 'vigentes' : v === 'sin-confirmar' ? 'sinConfirmar' : 'caducadas'].push(o);
  }
  return grupos;
}
