/**
 * Canal de Telegram (opcional): los chollazos nuevos se publican también en un canal, para quien
 * prefiere seguirlos ahí. Se activa con dos secretos del repositorio: TELEGRAM_BOT_TOKEN (un bot
 * creado con @BotFather y añadido como administrador del canal) y TELEGRAM_CANAL («@nombre» o el
 * id del canal). Sin ellos no hace nada.
 *
 * La primera vez solo toma nota de los chollazos que ya había (no los publica todos de golpe) y
 * después publica como mucho MAX_POR_ESCANEO por escaneo. Lo publicado se recuerda 30 días.
 */
import { escaparHtml as esc, euros } from '../../site/js/formato.js';

const MAX_POR_ESCANEO = 3;
const DIAS_RECORDAR_MS = 30 * 24 * 60 * 60 * 1000;

/** El mensaje (HTML de Telegram: solo <b>, <a>…, y el texto escapado). */
export function mensajeTelegram(oferta, panelUrl) {
  const lugar = oferta.lugar?.nombre ? `📍 ${esc(oferta.lugar.nombre)} · ` : '';
  const precio = typeof oferta.precio === 'number' ? esc(oferta.precioTexto || euros(oferta.precio)) : 'Consultar precio';
  const enlace = panelUrl ? `\n<a href="${esc(`${panelUrl.replace(/\/?$/, '/')}#/oferta/${encodeURIComponent(oferta.id)}`)}">Ver el viaje completo en Escapadas Finde</a>` : '';
  return `🔥 <b>${esc(oferta.titulo)}</b>\n${lugar}${precio}${oferta.chollazoMotivo ? `\n${esc(oferta.chollazoMotivo)}` : ''}${enlace}`;
}

/**
 * Publica los chollazos nuevos y anota en `estado.telegram` qué se ha publicado.
 * @returns {Promise<{publicados: number}>}
 */
export async function publicarEnTelegram({ ofertas, estado, ajustes, env = {}, panelUrl, ahora = new Date(), fetch = globalThis.fetch, log = console.log }) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CANAL: canal } = env;
  if (!token || !canal || !ajustes.emails?.chollazos?.activo) return { publicados: 0 };
  // Un registro guardado con otra forma no puede tumbar el escaneo: se rehace.
  const previo = estado.telegram;
  const publicadosPrevios = previo?.publicados && typeof previo.publicados === 'object' && !Array.isArray(previo.publicados) ? previo.publicados : {};
  const registro = (estado.telegram = { inicializado: previo?.inicializado === true, publicados: publicadosPrevios });
  const iso = ahora.toISOString();
  const vivas = new Set(ofertas.map((o) => o.id));
  for (const [id, cuando] of Object.entries(registro.publicados)) {
    if (!vivas.has(id) && ahora.getTime() - Date.parse(cuando) > DIAS_RECORDAR_MS) delete registro.publicados[id];
  }
  // Los mismos que la web marca como «Chollazo» (puntuar, con las preferencias de los ajustes).
  const chollazos = ofertas.filter((o) => o.chollazo);
  if (!registro.inicializado) {
    for (const o of chollazos) registro.publicados[o.id] = iso;
    registro.inicializado = true;
    return { publicados: 0 };
  }
  let publicados = 0;
  for (const oferta of chollazos.filter((o) => !registro.publicados[o.id]).slice(0, MAX_POR_ESCANEO)) {
    try {
      const respuesta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: canal, text: mensajeTelegram(oferta, panelUrl), parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
        // Si Telegram no responde, no se alarga el escaneo: a los 15 s se deja para el siguiente.
        signal: AbortSignal.timeout(15_000),
      });
      // Rechazado este mensaje en concreto (400…): se salta y no bloquea a los siguientes.
      if (respuesta.status >= 400 && respuesta.status < 500 && ![401, 403, 404, 429].includes(respuesta.status)) {
        log(`Telegram ha rechazado «${oferta.titulo}» (${respuesta.status}): se salta`);
        registro.publicados[oferta.id] = iso;
        continue;
      }
      if (!respuesta.ok) throw new Error(`Telegram ha respondido ${respuesta.status}`);
      registro.publicados[oferta.id] = iso;
      publicados++;
    } catch (error) {
      // (El mensaje nunca lleva el token: solo el estado de la respuesta.)
      log(`No se ha podido publicar en Telegram «${oferta.titulo}»: ${error.message}`);
      break;
    }
  }
  return { publicados };
}
