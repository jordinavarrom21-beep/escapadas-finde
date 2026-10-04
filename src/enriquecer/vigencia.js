/**
 * ¿Sigue activa la oferta? En cada escaneo se mira, poco a poco, la página de las ofertas de
 * las webs que dicen en ella si el chollo ha terminado. Las terminadas se retiran; las que
 * siguen activas cuentan como vistas en su web (`vistaUltima`), así no salen con «Puede
 * haber terminado» ni se borran por llevar días fuera de su feed.
 *
 * Solo se comprueba donde la página lo dice de forma fiable (sondeo del 4 de octubre de 2026
 * con ofertas reales que su web ya no listaba):
 *  - Chollometro: cada chollo lleva `"threadId":"<id>"` y, a continuación, `"isExpired"`.
 *  - Weekendesk, Escapada Rural, Tus Casas Rurales, Muchoviaje, Viajeros Piratas y Fly4free
 *    enseñan la misma página (200, sin ninguna marca) cuando la oferta sigue que cuando ya no:
 *    ahí manda volver a leer su listado (las que lo dejan de publicar se retiran a los 2 días,
 *    ver `podar`). Holidu no deja leer sus fichas (403).
 */
import { comprobarRobots } from '../util/robots.js';

/** Cada cuánto se vuelve a mirar la misma oferta. */
export const VIGENCIA_CADA_MS = 6 * 3_600_000;
/** Cuántas páginas como mucho por escaneo (cada 15 minutos): unas 80 por hora, con pausa. */
export const VIGENCIA_POR_ESCANEO = 20;
const PAUSA_MS = 1500;

/**
 * Lo que dice la página de una oferta: 'terminada', 'activa' o null si no se puede saber
 * (la página es de otro chollo —Chollometro fusiona duplicados en el más antiguo— o no lo dice).
 */
export const COMPROBADORES = {
  chollometro(html, oferta) {
    const id = oferta.id.split(':')[1];
    const inicio = html.indexOf(`"threadId":"${id}"`);
    if (inicio < 0) return null;
    const marca = html.slice(inicio, inicio + 6000).match(/"isExpired"\s*:\s*(true|false)/);
    if (!marca) return null;
    return marca[1] === 'true' ? 'terminada' : 'activa';
  },
};

const clave = (oferta) => `vigencia:${oferta.id}`;

/**
 * Las que toca mirar: de una web con comprobador, sin mirar en las últimas `VIGENCIA_CADA_MS`.
 * Primero las que su web ya no lista (las de `vistaUltima` más antigua), que son las dudosas.
 */
export function pendientesDeVigencia(ofertas, ctx) {
  const ahora = ctx.ahora.getTime();
  return ofertas
    .filter((o) => COMPROBADORES[o.fuente] && /^https?:\/\//.test(o.url ?? '') && ctx.cache.obtener(clave(o), VIGENCIA_CADA_MS, ahora) === undefined)
    .sort((a, b) => Date.parse(a.vistaUltima) - Date.parse(b.vistaUltima))
    .slice(0, VIGENCIA_POR_ESCANEO);
}

/**
 * Mira las pendientes y aplica lo que dice cada página. Modifica `estado.ofertas`.
 * @returns {Promise<{miradas: number, terminadas: number, activas: number}>}
 */
export async function comprobarVigencia(estado, ctx) {
  const resultado = { miradas: 0, terminadas: 0, activas: 0 };
  const pendientes = pendientesDeVigencia(Object.values(estado.ofertas), ctx);
  const ahora = ctx.ahora.getTime();
  for (const oferta of pendientes) {
    if (resultado.miradas) await ctx.http.esperar(PAUSA_MS);
    let veredicto = null;
    try {
      await comprobarRobots(ctx, [oferta.url]);
      veredicto = COMPROBADORES[oferta.fuente](await ctx.http.texto(oferta.url), oferta);
    } catch (error) {
      // Una página que ya no existe (404/410) es una oferta terminada; otro fallo, se reintenta luego.
      if ([404, 410].includes(error.estado)) veredicto = 'terminada';
      else ctx.log(`no se ha podido mirar ${oferta.id}: ${error.message}`);
    }
    resultado.miradas += 1;
    ctx.cache.guardar(clave(oferta), veredicto ?? 'desconocida', ahora);
    if (veredicto === 'terminada') {
      delete estado.ofertas[oferta.id];
      resultado.terminadas += 1;
    } else if (veredicto === 'activa') {
      oferta.vistaUltima = ctx.ahora.toISOString();
      resultado.activas += 1;
    }
  }
  if (resultado.miradas) ctx.log(`${resultado.miradas} ofertas miradas en su web: ${resultado.terminadas} terminadas (retiradas), ${resultado.activas} siguen activas`);
  return resultado;
}
