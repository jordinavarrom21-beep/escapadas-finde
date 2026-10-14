/**
 * Canales públicos de Telegram de chollos de viajes, desde su vista web (t.me/s/<canal>):
 * la página pública con los últimos ~20 mensajes, la misma que ve cualquiera sin cuenta.
 * t.me no tiene robots.txt (comprobado el 5 de octubre de 2026: 404), así que no hay
 * nada vetado.
 *
 * Cada mensaje con un precio y un enlace a la oferta es una oferta. Lo demás (sorteos,
 * tarjetas, «#clip» de destinos, otros canales) se descarta. El texto se interpreta con
 * las mismas reglas que Viajeros Piratas (precio, noches, régimen y lugar).
 *
 * Canales elegidos con un sondeo de mensajes reales (5 de octubre de 2026), por aportar
 * ofertas que no traen otras fuentes:
 *  - Exprime Viajes: un titular por oferta y el botón «IR A OFERTA» a su web.
 *  - Escapada Barata: hoteles en España con fechas cerradas («3 noches del 10/12 al 13/12
 *    por 158 €»), con el enlace tras «Enlace:».
 * Descartados: Cazaviajes (repite Chollometro), Holidayguru y Viajeros Piratas (ya son
 * fuentes), Guía Low Cost (sobre todo vuelos largos sin precio claro) y Ofertas de Viajes
 * (no es de viajes).
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { diasEntre, fechaLocal, sumarDias } from '../util/fechas.js';
import { normalizarTexto, recortar } from '../util/xml.js';
import { extraerLugar, extraerNoches, extraerRegimen, interpretarPrecio, limpiarTitulo } from './viajerospiratas.js';

/** Enlaces que no son la oferta: Telegram, compartir, imágenes. */
const NO_ES_OFERTA = /(^|\.)(t\.me|telegram\.(me|org)|telesco\.pe|whatsapp\.com|imgur\.com)$/;
/** Mensajes que no son una oferta de viaje. */
const DESCARTE = /#clip\b|\bsorteo\b|\bavios\b|\brevolut\b|\btarjeta\b|\bpuntos? mr\b|\bamazon\b|\baliexpress\b|\bmiravia\b|\bcupon(es)?\b/;
const PRECIO = /\d\s?(€|euros?)|€\s?\d/i;

/** Lo que dice cada mensaje sobre el tipo de oferta. */
function tipoDe(texto, porDefecto) {
  const t = normalizarTexto(texto);
  const vuelos = /\bvuelos?\b|\bida y vuelta\b|\bi\/v\b/.test(t);
  const alojamiento = /\bhotel(es)?\b|\bnoches?\b|\b\d+ dias\b|\bcasas? rural(es)?\b|\bapartamento|\bbalneario|\bresort\b|\bcamping\b|\bcabana\b/.test(t);
  if (vuelos && alojamiento) return 'paquete';
  if (vuelos) return 'vuelo';
  if (/\bcircuito\b|\bcrucero\b|\btodo incluido\b/.test(t) && !alojamiento) return 'paquete';
  return alojamiento ? 'hotel' : porDefecto;
}

/** Cuántos días antes de publicarse puede empezar una estancia (una de última hora ya empezada). */
const DIAS_ANTES = 7;
/** Más días que esto entre las dos fechas, sin noches que cuadren, es un periodo de validez. */
const DIAS_ESTANCIA = 7;

const iso = (d, mes, a) => `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** ¿Existe ese día? «31/11» no. */
const existe = (fecha) => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return mes >= 1 && mes <= 12 && dia >= 1 && new Date(Date.UTC(anio, mes - 1, dia)).getUTCDate() === dia;
};

/**
 * Fechas cerradas «del 10/12 al 13/12» (o «10/12/26»). Sin año, el de la primera vez que caen
 * así a partir de `referencia` (el día en que se publicó el mensaje; como mucho DIAS_ANTES
 * antes). Antes se contaba desde el día del escaneo: una estancia que ya había pasado (el canal
 * enseña los mensajes de semanas atrás) pasaba al año siguiente y no se retiraba.
 * La vuelta, del año de la salida (o del siguiente: «del 28/12 al 02/01»).
 */
export function fechasDe(texto, referencia) {
  const m = texto.match(/\bdel?\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+al?\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i);
  if (!m) return null;
  const escrito = (dato) => (dato.length === 2 ? 2000 + Number(dato) : Number(dato));
  const [d1, m1, d2, m2] = [m[1], m[2], m[4], m[5]].map(Number);
  const anio = Number(referencia.slice(0, 4));
  const desde = sumarDias(referencia, -DIAS_ANTES);
  const salida = m[3] ? iso(d1, m1, escrito(m[3])) : [anio - 1, anio, anio + 1].map((a) => iso(d1, m1, a)).find((f) => f >= desde);
  let vuelta = iso(d2, m2, m[6] ? escrito(m[6]) : Number(salida.slice(0, 4)));
  if (!m[6] && vuelta < salida) vuelta = iso(d2, m2, Number(salida.slice(0, 4)) + 1);
  if (!existe(salida) || !existe(vuelta) || vuelta < salida) return null;
  return { salida, vuelta };
}

/**
 * ¿Son las fechas de la estancia o hasta cuándo vale la oferta? «De 2 a 5 noches hasta enero
 * … del 27/11 al 03/01» son 37 días para 2 noches: un periodo, no una estancia de 37 días.
 */
export function esEstancia({ salida, vuelta }, noches) {
  const dias = diasEntre(salida, vuelta);
  return noches ? Math.abs(dias - noches) <= 1 : dias <= DIAS_ESTANCIA;
}

/** El último momento de ese día en Madrid (hora de invierno: como mucho una hora tarde en verano). */
const finDelDia = (dia) => new Date(`${dia}T23:59:59+01:00`).toISOString();

/** La URL sin las marcas de campaña (utm_*), que no cambian la oferta. */
function sinCampana(href) {
  const url = new URL(href);
  for (const clave of [...url.searchParams.keys()]) if (/^utm_/i.test(clave)) url.searchParams.delete(clave);
  url.hash = '';
  return url.href;
}

/**
 * El enlace de la oferta: el del botón o el que sigue a «Enlace:»; si no, el primero a la
 * web del canal; si no, el primero que no sea de Telegram.
 */
function enlaceDe($, $m, hosts) {
  const candidatos = [
    ...$m.find('a.tgme_widget_message_inline_button').toArray(),
    ...$m.find('.tgme_widget_message_text a').toArray(),
  ].map((a) => ({ href: $(a).attr('href'), antes: $(a)[0].prev?.data ?? '', texto: $(a).text() }))
    .filter(({ href }) => {
      try {
        const { protocol, hostname } = new URL(href);
        return /^https?:$/.test(protocol) && !NO_ES_OFERTA.test(hostname.replace(/^www\./, ''));
      } catch {
        return false;
      }
    });
  const elegido = candidatos.find((c) => /ir a (la )?oferta/i.test(c.texto) || /enlace:\s*$/i.test(c.antes))
    ?? candidatos.find((c) => hosts.includes(new URL(c.href).hostname.replace(/^www\./, '')))
    ?? candidatos[0];
  return elegido ? sinCampana(elegido.href) : null;
}

/** El titular: la primera línea con letras, sin emojis ni etiquetas (#chollos…). */
function titularDe(texto) {
  const lineas = texto.split('\n').map((l) => limpiarTitulo(l.replace(/#[\p{L}\d_]+,?/gu, '')).replace(/^[¡!]+\s*$/, '').trim());
  return lineas.find((l) => /\p{L}{3}/u.test(l)) ?? '';
}

/**
 * Las ofertas de la vista web de un canal.
 * @param {string} html la página t.me/s/<canal>
 * @param {{id: string, canal: string, hosts: string[], tipo: string}} canal
 * @param {{log: (m: string) => void, ahora?: Date}} ctx
 */
export function parsearCanal(html, canal, ctx) {
  const $ = cheerio.load(html);
  const mensajes = $('.tgme_widget_message[data-post]').toArray();
  if (!mensajes.length && !/tgme_channel_info/.test(html)) throw new Error('La página no es la vista pública de un canal de Telegram');
  const hoy = fechaLocal(ctx.ahora ?? new Date());
  return mensajes.flatMap((nodo) => {
    const $m = $(nodo);
    const $texto = $m.find('.tgme_widget_message_text').first().clone();
    $texto.find('br').replaceWith('\n');
    const texto = $texto.text().replace(/[ \t]+/g, ' ').trim();
    if (!texto || !PRECIO.test(texto) || DESCARTE.test(normalizarTexto(texto))) return [];
    const url = enlaceDe($, $m, canal.hosts);
    const titulo = titularDe(texto);
    if (!url || !titulo) return [];
    const plano = limpiarTitulo(texto.replace(/#[\p{L}\d_]+,?/gu, '').replace(/\n+/g, '. '));
    const tipo = tipoDe(texto, canal.tipo);
    const cuando = $m.find('time[datetime]').attr('datetime');
    const publicada = cuando && !Number.isNaN(Date.parse(cuando)) ? new Date(cuando).toISOString() : null;
    const noches = extraerNoches(plano);
    const leidas = fechasDe(texto, publicada ? fechaLocal(publicada) : hoy);
    const fechas = leidas && esEstancia(leidas, noches) ? leidas : null;
    // «3 noches del 10/12 al 13/12 por 158 €»: con fechas, es el precio de toda la estancia.
    const precio = interpretarPrecio(plano);
    const lugar = extraerLugar(titulo) ?? extraerLugar(plano.match(/situad[oa] en ([^.,]+)/i)?.[0] ?? '');
    try {
      return [crearOferta({
        id: `${canal.id}:${nodo.attribs['data-post'].split('/').pop()}`,
        fuente: canal.id,
        tipo,
        titulo: recortar(titulo, 140),
        descripcion: recortar(plano),
        url,
        ...precio,
        unidad: fechas && precio.unidad == null ? 'total' : precio.unidad,
        noches,
        regimen: extraerRegimen(plano),
        transporte: tipo === 'vuelo' || tipo === 'paquete' ? 'avion' : null,
        lugar: lugar ? { nombre: lugar } : null,
        fechas: fechas ?? {},
        // Un periodo («hasta enero»): vale hasta su último día.
        caduca: leidas && !fechas ? finDelDia(leidas.vuelta) : null,
        publicada,
      })];
    } catch (error) {
      ctx.log(`Mensaje omitido («${titulo}»): ${error.message}`);
      return [];
    }
  });
}

/** Una fuente por canal: cada uno sale con su nombre en las tarjetas y en «Estado de las webs». */
function canalTelegram({ id, canal, nombre, hosts, tipo }) {
  const url = `https://t.me/s/${canal}`;
  return {
    id,
    nombre,
    web: `https://t.me/${canal}`,
    modo: 'feed',
    requiere: [],
    urls: [url],
    async obtener(ctx) {
      const html = await ctx.http.texto(url, { cabeceras: { Accept: 'text/html' } });
      return { ofertas: parsearCanal(html, { id, canal, hosts, tipo }, ctx) };
    },
  };
}

export const exprimeviajes = canalTelegram({ id: 'exprimeviajes', canal: 'exprimeviajes_ofertas', nombre: 'Exprime Viajes', hosts: ['exprimeviajes.com'], tipo: 'paquete' });
export const escapadabarata = canalTelegram({ id: 'escapadabarata', canal: 'escapadabarata', nombre: 'Escapada Barata', hosts: ['t.eeny.it', 'ebarata.com'], tipo: 'hotel' });
