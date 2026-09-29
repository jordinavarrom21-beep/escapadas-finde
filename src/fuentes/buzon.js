/**
 * Buzón de newsletters: lee por IMAP un Gmail dedicado a ofertas (INBOX y la
 * etiqueta «Ofertas», últimos 3 días, en solo lectura: no marca ni borra nada) y
 * convierte las newsletters de viajes de remitentes conocidos en ofertas.
 *
 * Solo se leen newsletters auténticas: remitente de un comercio conocido (por la
 * dirección real, no por el nombre visible), verificado por Gmail con DMARC o DKIM
 * del dominio del comercio y con cabeceras de lista de correo (List-Unsubscribe o
 * List-Id). Los transaccionales (reservas, localizadores, códigos) se descartan.
 *
 * Privacidad (el panel es público): los enlaces de las newsletters llevan tokens
 * personales, así que nunca se publican tal cual. Se siguen sus redirecciones
 * hasta la web del comercio (sin llegar a pedirla) y se guarda la URL sin query ni
 * fragmento; si no se puede, se usa la portada del comercio. Los textos se limpian
 * de direcciones de email, saludos, nombres, teléfonos y números largos, y nunca se
 * toma nada del pie. Las imágenes solo se aceptan de la web del comercio o de su CDN.
 *
 * El precio es el que anuncia la newsletter para cada oferta («desde X €»), con la
 * unidad que indique el propio bloque (por noche, por persona, total…) o null si no
 * lo dice: los «desde X €» de las aerolíneas suelen ser por trayecto.
 */
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { crearOferta } from '../modelo.js';
import { extraerPrecios } from '../util/precio.js';
import { normalizarTexto, recortar, textoPlano } from '../util/xml.js';

const ID = 'buzon';
const DIA_MS = 86_400_000;
const DIAS_LEIDOS = 3;
const DIAS_VIGENCIA = 7;
const ETIQUETA_GMAIL = 'ofertas';
const MAX_MENSAJES = 60;          // por carpeta
const MAX_BLOQUES = 12;           // ofertas por email
const MAX_ENLACES = 20;           // enlaces seguidos por ejecución
const MAX_SALTOS = 5;
const LIMITE_ENLACE_MS = 3_000;
const LIMITE_IMAP_MS = 60_000;
const PAUSA_MS = 2_000;
const CACHE_ENLACE_MS = 7 * DIA_MS;
const MAX_TEXTO_BLOQUE = 500;
const MAX_AMPLIACION = 250;
const PRECIO_MAX = 5_000;

/**
 * Remitentes conocidos, por dominio del remitente. `web` es la portada que se usa
 * cuando un enlace no se puede limpiar; `hosts` son otras webs del comercio (además
 * del dominio y www.), `ruta` limita las URLs válidas a esa sección e `imagenes`
 * son los dominios de su CDN de imágenes (además de los suyos).
 */
export const COMERCIOS = [
  { nombre: 'Booking.com', dominios: ['booking.com'], imagenes: ['bstatic.com'], web: 'https://www.booking.com', tipo: 'hotel' },
  { nombre: 'Groupon', dominios: ['groupon.es', 'groupon.com'], imagenes: ['grouponcdn.com'], web: 'https://www.groupon.es', tipo: 'escapada' },
  { nombre: 'Voyage Privé', dominios: ['voyage-prive.es', 'voyage-prive.com'], web: 'https://www.voyage-prive.es', tipo: 'escapada' },
  { nombre: 'Travelzoo', dominios: ['travelzoo.com'], web: 'https://www.travelzoo.com/es/', tipo: 'escapada' },
  { nombre: 'Weekendesk', dominios: ['weekendesk.es', 'weekendesk.com'], web: 'https://www.weekendesk.es', tipo: 'escapada' },
  { nombre: 'Atrápalo', dominios: ['atrapalo.com'], web: 'https://www.atrapalo.com', tipo: 'escapada' },
  { nombre: 'Rusticae', dominios: ['rusticae.es'], web: 'https://www.rusticae.es', tipo: 'hotel', temas: ['singular'] },
  { nombre: 'Paradores', dominios: ['paradores.es', 'parador.es'], web: 'https://paradores.es', tipo: 'hotel' },
  { nombre: 'Escapada Rural', dominios: ['escapadarural.com'], web: 'https://www.escapadarural.com', tipo: 'escapada', temas: ['rural'] },
  { nombre: 'Vueling', dominios: ['vueling.com'], web: 'https://www.vueling.com/es', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'easyJet', dominios: ['easyjet.com'], web: 'https://www.easyjet.com/es', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Wizz Air', dominios: ['wizzair.com'], web: 'https://wizzair.com/es-es', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Volotea', dominios: ['volotea.com'], web: 'https://www.volotea.com/es/', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Ryanair', dominios: ['ryanair.com'], web: 'https://www.ryanair.com/es/es', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Iberia Express', dominios: ['iberiaexpress.com'], web: 'https://www.iberiaexpress.com', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Iberia', dominios: ['iberia.com', 'iberia.es'], web: 'https://www.iberia.com/es/', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Renfe', dominios: ['renfe.com', 'renfe.es'], hosts: ['venta.renfe.com'], web: 'https://www.renfe.com', tipo: 'escapada', transporte: 'tren' },
  { nombre: 'Ouigo', dominios: ['ouigo.com', 'ouigo.es'], web: 'https://www.ouigo.com/es/', tipo: 'escapada', transporte: 'tren' },
  { nombre: 'iryo', dominios: ['iryo.eu'], web: 'https://iryo.eu/es', tipo: 'escapada', transporte: 'tren' },
  { nombre: 'Secret Flying', dominios: ['secretflying.com'], web: 'https://www.secretflying.com', tipo: 'vuelo', transporte: 'avion' },
  { nombre: "Jack's Flight Club", dominios: ['jacksflightclub.com', 'jacksflightclub.co.uk'], web: 'https://jacksflightclub.com', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'Skyscanner', dominios: ['skyscanner.es', 'skyscanner.net', 'skyscanner.com'], web: 'https://www.skyscanner.es', tipo: 'vuelo', transporte: 'avion' },
  { nombre: 'KAYAK', dominios: ['kayak.es', 'kayak.com'], web: 'https://www.kayak.es', tipo: 'vuelo', transporte: 'avion' },
  {
    nombre: 'Google Flights', dominios: ['google.com'], remitente: /travel|flights|vuelos/,
    ruta: '/travel', web: 'https://www.google.com/travel/flights', tipo: 'vuelo', transporte: 'avion',
  },
];

// Enlaces que nunca son una oferta. BAJA marca además el pie: un bloque que lo
// contiene no es una oferta.
const BAJA = /\bbaja\b|unsubscribe|cancelar (la |tu )?suscripcion|gestionar (tus |las |la )?(suscripcion|preferencias)|preferencias|preferences|opt-?out|ver (este )?(email|correo|mensaje)? ?en (el|tu) navegador|ver online|version (web|online)|view (it )?(in|on) (your )?browser|web ?version/;
const DESCARTE_TEXTO = /^(pulsa|haz clic|haz click|clic|click|clica|pincha) (aqui|here)$|^(aqui|here)$|no (ves|se ve|puedes ver) bien|privacidad|privacy|aviso legal|\blegal\b|condiciones|terminos|\bterms\b|cookies|centro de ayuda|\bayuda\b|\bhelp\b|contacto|\bcontact\b|mi cuenta|my account|iniciar sesion|\blog ?in\b|\bsign ?in\b|app store|google play|descarga (la|nuestra) app|^(facebook|instagram|twitter|x|youtube|linkedin|tiktok|pinterest|whatsapp|telegram)$/;
const DESCARTE_HREF = /^(mailto|tel|sms):|unsubscribe|opt-?out|\/baja\b|preferenc|subscription|privacy|privacidad|legal|cookies|terms|condiciones|facebook\.com|instagram\.com|twitter\.com|\/\/(www\.)?x\.com|youtube\.com|linkedin\.com|tiktok\.com|pinterest\.|wa\.me|whatsapp|\/\/t\.me\/|apps\.apple\.com|play\.google\.com|view-?online|webversion|viewinbrowser/;
const CTA = /^(ver|reserva|reservar|reserva ya|comprar|compra|descubre|descubrir|consulta|consultar|mas info|mas informacion|me interesa|buscar|busca|lo quiero|aprovecha|vuela|book|go)\b/;
const CONTENEDORES = new Set(['td', 'tr', 'table', 'div', 'p', 'li', 'section', 'article', 'center']);
const TACHADO = 's, del, strike, [style*="line-through"]';

/** Correos que no son publicidad sino de una cuenta o una compra (sobre el texto normalizado). */
const TRANSACCIONAL = /tu reserva|reserva (confirmada|cancelada|modificada|n\.?[ºo°]|numero)|confirmacion de (tu |la )?(reserva|compra|pedido)|localizador|tarjeta de embarque|check-?in|codigo de (verificacion|acceso|seguridad|confirmacion)|contrasena|password|factura|recibo|tu pedido|tu cuenta|inicio de sesion/;
/** Un bloque con datos de una reserva concreta nunca es una oferta. */
const DATOS_RESERVA = /localizador|(numero|codigo|n\.?[ºo°]) de (reserva|pedido|confirmacion)|\bpin\b|codigo de (verificacion|acceso|seguridad)|tarjeta de embarque/;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
/** Números que pueden identificar a alguien: teléfonos españoles y cifras de 6 dígitos o más. */
const TELEFONO = /(?:\+34[\s.-]?)?\b[6-9](?:[\s.-]?\d){8}\b/g;
const NUMERO_LARGO = /\b\d{6,}\b/g;
const SALUDO = '(?:[Hh]ola|[Hh]i|[Hh]ello|[Hh]ey|[Qq]uerid[oa]|[Ee]stimad[oa]|[Bb]on dia|[Bb]uenos d[ií]as|[Bb]uenas(?: tardes| noches)?)';
const NOMBRE_PROPIO = '\\p{Lu}\\p{Ll}{2,}(?:\\s+\\p{Lu}\\p{Ll}{2,}){0,2}';
const NOMBRE_EN_SALUDO = new RegExp(`(?:${SALUDO}|[Pp]ara ti|[Gg]racias)[\\s,]+(${NOMBRE_PROPIO})`, 'gu');
/** Vocativos del asunto: «Jordi, …», «¡Jordi Navarro, …» o «…, Jordi: …». */
const VOCATIVOS = [
  new RegExp(`^[¡¿]?\\s*(${NOMBRE_PROPIO}),\\s`, 'u'),
  new RegExp(`,\\s*(\\p{Lu}\\p{Ll}{2,})\\s*[:!.?]`, 'u'),
];
/** Tras estas palabras un nombre es parte de un lugar («Mas Sant Jordi»), no el destinatario. */
const ANTES_DE_LUGAR = '(?:sant|san|santa|sta\\.?|can|mas|son|sa|ca)\\s+';
const VARIANTES = { a: 'aáàâä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôö', u: 'uúùûü', n: 'nñ', c: 'cç' };

const hash = (texto, largo = 12) => createHash('sha256').update(String(texto)).digest('hex').slice(0, largo);
const perteneceA = (host, dominio) => host === dominio || host.endsWith(`.${dominio}`);
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Un segmento de ruta que parece un identificador personal (con o sin extensión). */
export function pareceToken(segmento) {
  const base = segmento.replace(/\.[a-z\d]{1,5}$/i, '');
  if (UUID.test(base) || /^[\w=-]{40,}$/.test(base) || /^\d{12,}$/.test(base)) return true;
  return base.split(/[-._]/).some((parte) => /^[\da-f]{24,}$/i.test(parte) || /^(?=.*\d)(?=.*[a-z])[a-z\d_=]{16,}$/i.test(parte));
}

/** Patrón de un nombre que casa con y sin tildes (se usa con la bandera «i»). */
const patronNombre = (nombre) => [...normalizarTexto(nombre)].map((c) => (VARIANTES[c] ? `[${VARIANTES[c]}]` : escaparRegex(c))).join('');
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

export class ErrorBloqueo extends Error {
  constructor(estado, url) {
    super(`${new URL(url).host} responde ${estado} (posible protección anti-bot): no se siguen más enlaces en esta ejecución`);
    this.name = 'ErrorBloqueo';
    this.estado = estado;
  }
}

/**
 * Comercio conocido del remitente («Booking.com <x@sg.booking.com>» o la dirección
 * sola), o null. Solo cuenta la dirección de dentro de <…>: el nombre visible lo
 * escribe quien envía («"ofertas@booking.com" <atacante@otro.com>»).
 */
export function comercioDe(de) {
  const texto = String(de ?? '').toLowerCase().trim();
  const direccion = (texto.match(/<([^<>]*)>$/)?.[1] ?? texto).trim().match(/^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/)?.[0];
  if (!direccion) return null;
  const [local, dominio] = direccion.split('@');
  return COMERCIOS.find((c) => c.dominios.some((d) => perteneceA(dominio, d)) && (!c.remitente || c.remitente.test(local))) ?? null;
}

/**
 * ¿Ha comprobado Gmail que el correo es de verdad del comercio? Mira solo la primera
 * cabecera Authentication-Results (la que añade el servidor de Gmail al recibirlo; las
 * de más abajo las puede escribir cualquiera) y exige DMARC o DKIM con el dominio del
 * comercio. Sin eso, el remitente se puede falsificar.
 */
export function remitenteVerificado({ autenticacion = '' } = {}, comercio) {
  const resultados = String(autenticacion).replace(/\s+/g, ' ');
  if (!comercio || !/^\s*mx\.google\.com\s*;/i.test(resultados)) return false;
  const delComercio = (dominio) => comercio.dominios.some((d) => perteneceA(dominio.toLowerCase(), d));
  const dmarc = resultados.match(/\bdmarc=pass\b[^;]*?\bheader\.from=([\w.-]+)/i);
  if (dmarc && delComercio(dmarc[1])) return true;
  return [...resultados.matchAll(/\bdkim=pass\b[^;]*?\bheader\.(?:i=[\w.+-]*@|d=)([\w.-]+)/gi)].some(([, dominio]) => delComercio(dominio));
}

/**
 * El enlace sin query ni fragmento si ya apunta a la web del comercio (y no a un
 * rastreador de su dominio ni a una ruta con aspecto de token); si no, null.
 */
export function urlDirecta(enlace, comercio) {
  let url;
  try {
    url = new URL(enlace);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const esWeb = comercio.dominios.some((d) => host === d || host === `www.${d}`) || comercio.hosts?.includes(host);
  if (!esWeb || (comercio.ruta && !url.pathname.startsWith(comercio.ruta))) return null;
  let ruta;
  try {
    ruta = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (ruta.includes('@') || ruta.split('/').some(pareceToken)) return null;
  return `${url.origin}${url.pathname}`;
}

/**
 * Sigue las redirecciones de un enlace de newsletter (como mucho `maxSaltos`
 * peticiones y `limiteMs` en total) hasta que apunta a la web del comercio, sin
 * llegar a pedirla. Devuelve esa URL limpia o null si acaba en otro sitio.
 * Lanza ErrorBloqueo si algún servidor responde 403 o 429.
 * @param {{redireccion: (url: string, opciones: {timeoutMs: number}) => Promise<{estado: number, destino: string|null}>}} http
 */
export async function resolverEnlace(enlace, comercio, http, { maxSaltos = MAX_SALTOS, limiteMs = LIMITE_ENLACE_MS } = {}) {
  const fin = Date.now() + limiteMs;
  let actual = enlace;
  for (let salto = 0; salto < maxSaltos; salto++) {
    const directa = urlDirecta(actual, comercio);
    if (directa) return directa;
    const restante = fin - Date.now();
    if (restante <= 0 || !/^https?:\/\//.test(actual)) return null;
    const { estado, destino } = await http.redireccion(actual, { timeoutMs: restante });
    if (estado === 403 || estado === 429) throw new ErrorBloqueo(estado, actual);
    if (estado < 300 || estado >= 400 || !destino) return null;
    actual = destino;
  }
  return urlDirecta(actual, comercio);
}

// ---------------------------------------------------------------------------
// Interpretación del HTML
// ---------------------------------------------------------------------------

const textoEnlace = ($, a) => textoPlano(`${$(a).text()} ${$(a).find('img').attr('alt') ?? ''} ${$(a).attr('title') ?? ''}`);

function esEnlaceDeBaja($, a) {
  return BAJA.test(normalizarTexto(textoEnlace($, a))) || /unsubscribe|opt-?out|\/baja\b/i.test($(a).attr('href') ?? '');
}

function esEnlaceDescartado($, a) {
  const href = ($(a).attr('href') ?? '').trim();
  if (!/^https?:\/\//i.test(href) || DESCARTE_HREF.test(href.toLowerCase())) return true;
  const texto = normalizarTexto(textoEnlace($, a));
  return BAJA.test(texto) || DESCARTE_TEXTO.test(texto);
}

function contiene(padre, nodo) {
  for (let actual = nodo.parent; actual; actual = actual.parent) if (actual === padre) return true;
  return false;
}

function crearLector($) {
  const textos = new Map();
  const texto = (nodo) => {
    if (!textos.has(nodo)) textos.set(nodo, textoPlano($.html(nodo)));
    return textos.get(nodo);
  };
  const tieneBaja = (nodo) => $(nodo).find('a[href]').toArray().some((a) => esEnlaceDeBaja($, a));
  return { texto, tieneBaja };
}

// El contenedor más pequeño alrededor del enlace que menciona un precio en euros.
function contenedorConPrecio(a, lector) {
  for (let nodo = a.parent; nodo?.type === 'tag'; nodo = nodo.parent) {
    if (!CONTENEDORES.has(nodo.name)) continue;
    if (lector.texto(nodo).length > MAX_TEXTO_BLOQUE || lector.tieneBaja(nodo)) return null;
    if (extraerPrecios(lector.texto(nodo)).length) return nodo;
  }
  return null;
}

// Sube desde el contenedor mínimo mientras no se junte con otra oferta, para
// recoger la imagen y el título de la misma tarjeta.
function ampliar(contenedor, elegidos, lector) {
  const largo = lector.texto(contenedor).length;
  let mejor = contenedor;
  for (let nodo = contenedor.parent; nodo?.type === 'tag'; nodo = nodo.parent) {
    if (elegidos.some((otro) => otro !== contenedor && contiene(nodo, otro))) break;
    const texto = lector.texto(nodo);
    if (texto.length > MAX_TEXTO_BLOQUE || texto.length > largo + MAX_AMPLIACION || lector.tieneBaja(nodo)) break;
    if (CONTENEDORES.has(nodo.name)) mejor = nodo;
  }
  return mejor;
}

const esTitulo = (texto) => {
  const normal = normalizarTexto(texto);
  return texto.length >= 8 && !/^https?:\/\//.test(texto) && !/^\W*[\d.,]+\s*€/.test(texto) && !(texto.length <= 25 && CTA.test(normal));
};

function tituloAlternativo($, nodo) {
  const candidatos = $(nodo).find('h1, h2, h3, h4, strong, b, [style*="bold"]').toArray().map((e) => textoPlano($(e).text()));
  const alternativos = $(nodo).find('img[alt]').toArray().map((e) => textoPlano($(e).attr('alt')));
  return [...candidatos, ...alternativos].find(esTitulo) ?? null;
}

/**
 * Primera imagen de la tarjeta (sin píxeles de seguimiento ni logos), sin query: los
 * CDN no la necesitan y podría identificar al destinatario. Solo de la web del
 * comercio o de su CDN: las de terceros suelen ser imágenes personalizadas o de
 * seguimiento, y cada visitante del panel se las pediría a ese tercero.
 */
function imagenDe($, nodo, comercio) {
  const permitidos = [...comercio.dominios, ...(comercio.imagenes ?? [])];
  for (const img of $(nodo).find('img[src]').toArray()) {
    const $img = $(img);
    if ($img.attr('width') === '1' || $img.attr('height') === '1') continue;
    if (/logo|pixel|spacer|\/open\b/i.test(`${$img.attr('src')} ${$img.attr('alt') ?? ''}`)) continue;
    const src = $img.attr('src').trim();
    if (!URL.canParse(src)) continue; // src relativo o mal formado
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.username || url.pathname.includes('@')) continue;
    if (!permitidos.some((dominio) => perteneceA(url.hostname.toLowerCase(), dominio))) continue;
    return `${url.origin}${url.pathname}`;
  }
  return null;
}

/** Bloques «enlace + título + precio (+ imagen)» de un HTML de newsletter del `comercio`. */
export function extraerBloques(html, comercio) {
  const $ = cheerio.load(html);
  $('script, style, head, title').remove();
  $('[style*="display:none"], [style*="display: none"]').remove();
  const lector = crearLector($);
  const enlaces = $('a[href]').toArray().filter((a) => !esEnlaceDescartado($, a));

  const minimos = [...new Set(enlaces.map((a) => contenedorConPrecio(a, lector)).filter(Boolean))];
  const elegidos = minimos.filter((c) => !minimos.some((otro) => otro !== c && contiene(c, otro)));
  const bloques = [];
  for (const contenedor of elegidos) {
    const tarjeta = ampliar(contenedor, elegidos, lector);
    const propios = $(tarjeta).find('a[href]').toArray().filter((a) => !esEnlaceDescartado($, a));
    const conTitulo = propios.find((a) => esTitulo(textoPlano($(a).text())));
    const titulo = conTitulo ? textoPlano($(conTitulo).text()) : tituloAlternativo($, tarjeta);
    if (!propios.length || !titulo || DATOS_RESERVA.test(normalizarTexto(lector.texto(tarjeta)))) continue;
    const tachados = $(tarjeta).find(TACHADO).toArray().flatMap((e) => extraerPrecios(lector.texto(e)).map((p) => p.valor));
    const ctas = propios.map((a) => textoPlano($(a).text())).filter((t) => t && !esTitulo(t));
    bloques.push({
      enlace: $(conTitulo ?? propios[0]).attr('href').trim(),
      titulo,
      texto: lector.texto(tarjeta),
      ctas,
      tachados,
      imagen: imagenDe($, tarjeta, comercio),
    });
  }
  return { bloques: bloques.slice(0, MAX_BLOQUES), principal: enlacePrincipal($, enlaces) };
}

// Para los emails sin bloques: el primer enlace con texto (los logos solo llevan imagen).
function enlacePrincipal($, enlaces) {
  const elegido = enlaces.find((a) => textoPlano($(a).text()).length >= 3) ?? enlaces[0];
  return elegido ? $(elegido).attr('href').trim() : null;
}

function htmlDeTexto(texto = '') {
  const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(texto)
    .split(/\r?\n\s*\r?\n/)
    .map((parrafo) => `<div>${escapar(parrafo).replace(/https?:\/\/[^\s<>"]+/g, (url) => `<a href="${url}">${url}</a>`)}</div>`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Precio, unidad, lugar
// ---------------------------------------------------------------------------

function unidadDe(texto) {
  const t = normalizarTexto(texto);
  const noche = /por noche|\/\s*noche|la noche|per night/.test(t);
  const persona = /por persona|\/\s*persona|\/\s*pers\b|p\.p\.|\bpp\b|por pax|per person/.test(t);
  if (noche) return persona ? 'pp/noche' : 'noche';
  if (/ida y vuelta|\bi\/v\b|round trip/.test(t)) return 'i/v';
  if (persona) return 'pp';
  if (/para (2|dos|3|tres|4|cuatro) (personas|adultos)|precio total|en total/.test(t)) return 'total';
  return null;
}

function precioDe(texto, tachados = []) {
  const precios = extraerPrecios(texto).filter((p) => p.valor > 0 && p.valor <= PRECIO_MAX);
  const actual = precios.find((p) => !tachados.includes(p.valor));
  if (!actual) return { precio: null, precioTexto: '', unidad: null, precioAnterior: null, descuento: null };
  const antes = texto.slice(0, actual.indice).match(/(?:desde|por solo|solo|a partir de|por)\s*$/i)?.[0] ?? '';
  const despues = texto.slice(actual.indice + actual.fragmento.length)
    .match(/^\s*\*?\s*(?:\/\s*noche|por noche|la noche|por persona|\/\s*persona|por trayecto|ida y vuelta)/i)?.[0] ?? '';
  const anterior = Math.max(0, ...tachados);
  const precioAnterior = anterior > actual.valor ? anterior : null;
  const porcentaje = texto.match(/-\s?(\d{1,2})\s?%/);
  const descuento = porcentaje ? Number(porcentaje[1])
    : precioAnterior ? Math.round((1 - actual.valor / precioAnterior) * 100) : null;
  const precioTexto = `${antes}${EUROS.format(actual.valor)} €${despues.replace(/^\s*\*?/, ' ')}`.replace(/\s+/g, ' ').trim();
  return { precio: actual.valor, precioTexto, unidad: unidadDe(texto), precioAnterior, descuento };
}

const LUGAR = '(\\p{Lu}[\\p{L}\'’-]+(?:\\s+(?:de|del|la|las|el|los|d\'|i)?\\s*\\p{Lu}[\\p{L}\'’-]+){0,3})';
const PATRONES_LUGAR = [
  new RegExp(`(?:→|->|⇄|↔|✈)\\s*${LUGAR}`, 'u'),
  new RegExp(`^${LUGAR}\\s*:`, 'u'),
  new RegExp(`(?:[Vv]uelos?|[Vv]uela|[Vv]olar|[Ee]sc[aá]pate|[Ee]scapadas?|[Vv]iaja|[Vv]iajes?)\\s+(?:a|hasta)\\s+${LUGAR}`, 'u'),
  new RegExp(`(?:[Hh]otel(?:es)?|[Aa]lojamientos?|[Nn]oches?|[Ee]stancias?|[Aa]partamentos?)\\s+en\\s+${LUGAR}`, 'u'),
];

/** Destino que se deduce del título («Barcelona → Roma», «Costa Brava: …», «Vuelos a Oporto»…). */
export function lugarDelTitulo(titulo) {
  for (const patron of PATRONES_LUGAR) {
    const nombre = titulo.match(patron)?.[1]?.trim();
    if (nombre && !/^(Hotel|Vuelos?|Oferta|Ofertas|Escapadas?)$/.test(nombre)) {
      return { nombre, region: null, pais: null, lat: null, lon: null };
    }
  }
  return null;
}

function tipoDe(comercio, texto) {
  if (/vuelo\s*(\+|y)\s*hotel|hotel\s*(\+|y)\s*vuelo/.test(normalizarTexto(texto))) return 'paquete';
  return comercio.tipo;
}

// ---------------------------------------------------------------------------
// Privacidad
// ---------------------------------------------------------------------------

const palabrasDe = (texto) => String(texto).match(/\p{L}{3,}/gu) ?? [];

/**
 * Nombres que se sabe que son del destinatario, sin leer ningún correo: los de
 * BUZON_NOMBRES («Jordi Navarro, Jordina») y las partes del usuario de GMAIL_USER
 * («escapadas.jordi» → escapadas, jordi).
 */
export function nombresConfigurados(env = {}) {
  const nombres = palabrasDe(env.BUZON_NOMBRES ?? '');
  const local = String(env.GMAIL_USER ?? '').split('@')[0];
  return [...new Set([...nombres, ...palabrasDe(local.replace(/\d+/g, ' '))])];
}

/**
 * Nombres propios del destinatario: los configurados, los de la cabecera «Para», los
 * del saludo («Hola Jordi Navarro», «solo para ti, Jordi») y los vocativos del asunto
 * («¡Jordi, …», «…, Jordi: …») salvo que aparezcan en los títulos de las ofertas
 * (entonces son un destino: «Roma, desde 29 €»).
 */
export function nombresPrivados({ para = '', asunto = '', html = '', texto = '' } = {}, titulos = [], configurados = []) {
  const nombres = new Set(configurados);
  const enPara = String(para).replace(/<[^>]*>|"/g, ' ').replace(EMAIL, ' ');
  for (const palabra of enPara.match(/\p{Lu}\p{Ll}{2,}/gu) ?? []) nombres.add(palabra);
  const cuerpo = `${textoPlano(html)} ${texto}`;
  for (const [, nombre] of cuerpo.matchAll(NOMBRE_EN_SALUDO)) palabrasDe(nombre).forEach((n) => nombres.add(n));
  for (const patron of VOCATIVOS) {
    for (const nombre of palabrasDe(String(asunto).match(patron)?.[1] ?? '')) {
      if (!titulos.some((t) => t.includes(nombre))) nombres.add(nombre);
    }
  }
  return [...nombres];
}

/**
 * Quita de un texto emails, teléfonos, números de 6 cifras o más (localizadores,
 * clientes…), saludos con nombre y los nombres del destinatario, con o sin tildes y
 * en mayúsculas o minúsculas, salvo cuando forman parte de un lugar («Mas Sant Jordi»).
 */
export function limpiarTexto(texto, nombres = []) {
  let limpio = String(texto ?? '').replace(EMAIL, ' ').replace(TELEFONO, ' ').replace(NUMERO_LARGO, ' ');
  for (const nombre of nombres) {
    const n = patronNombre(nombre);
    limpio = limpio
      .replace(new RegExp(`${SALUDO}[\\s,]*${n}(?![\\p{L}])\\s*[,:!.]?`, 'giu'), ' ')
      .replace(new RegExp(`(?<![\\p{L}])(?<!${ANTES_DE_LUGAR})${n}(?![\\p{L}])`, 'giu'), '');
  }
  limpio = limpio
    .replace(/([¡¿])\s*[,;:]\s*/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*([:;!.?])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:·|–—-]+/, '')
    .trim();
  // Mayúscula en la primera letra, también tras «¡», «¿» o comillas.
  return limpio.replace(/^([¡¿"«(]*)(\p{Ll})/u, (_, signos, letra) => signos + letra.toUpperCase());
}

// ---------------------------------------------------------------------------
// Email → ofertas
// ---------------------------------------------------------------------------

/** ¿Es de una cuenta o una compra (reserva, código, factura…) y no publicidad? */
export const esTransaccional = (email) => TRANSACCIONAL.test(normalizarTexto(email.asunto ?? ''));

function analizarEmail(email) {
  const comercio = comercioDe(email.de);
  if (!comercio || esTransaccional(email)) return null;
  return { comercio, ...extraerBloques(email.html || htmlDeTexto(email.texto), comercio) };
}

/**
 * Enlaces crudos que usan las ofertas de un email y que hay que seguir para
 * limpiarlos (los que no apuntan ya a la web del comercio).
 * @returns {{enlace: string, comercio: object}[]}
 */
export function enlacesPorResolver(email) {
  const analisis = analizarEmail(email);
  if (!analisis) return [];
  const { comercio, bloques, principal } = analisis;
  const enlaces = bloques.length ? bloques.map((b) => b.enlace) : [principal].filter(Boolean);
  return [...new Set(enlaces)].filter((e) => !urlDirecta(e, comercio)).map((enlace) => ({ enlace, comercio }));
}

const urlSegura = (enlace, comercio, resueltos) =>
  (enlace && (resueltos.has(enlace) ? resueltos.get(enlace) : urlDirecta(enlace, comercio))) || comercio.web;

const aIso = (fecha) => {
  const ms = fecha instanceof Date ? fecha.getTime() : Date.parse(fecha);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/**
 * Convierte una newsletter en ofertas. Función pura: los enlaces ya resueltos
 * llegan en `resueltos` (enlace crudo → URL limpia o null); los demás se limpian
 * si ya apuntan a la web del comercio o se sustituyen por su portada.
 * @param {{de: string, para?: string, asunto: string, fecha: Date|string, html?: string, texto?: string, messageId?: string}} email
 * No comprueba la autenticidad del remitente: eso lo hace `obtener` con las cabeceras.
 * @param {{resueltos?: Map<string, string|null>, log?: (mensaje: string) => void,
 *   nombres?: string[]}} [opciones] `nombres`: los del destinatario que ya se conocen.
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsearEmail(email, { resueltos = new Map(), log = () => {}, nombres: configurados = [] } = {}) {
  const analisis = analizarEmail(email);
  if (!analisis) return [];
  const { comercio, bloques, principal } = analisis;
  const publicada = aIso(email.fecha);
  const idMensaje = hash(email.messageId || `${email.de}|${email.asunto}|${publicada}`);
  const nombres = nombresPrivados(email, bloques.map((b) => b.titulo), configurados);
  const limpiar = (texto) => limpiarTexto(texto, nombres);
  const comun = {
    fuente: ID,
    temas: comercio.temas ?? [],
    transporte: comercio.transporte ?? null,
    // «caduca-estimada»: la newsletter no dice hasta cuándo vale; son DIAS_VIGENCIA supuestos.
    etiquetas: ['newsletter', comercio.nombre, 'caduca-estimada'],
    publicada,
    caduca: publicada ? new Date(Date.parse(publicada) + DIAS_VIGENCIA * DIA_MS).toISOString() : null,
  };

  const datos = bloques.length
    ? bloques.map((bloque, indice) => {
      const titulo = limpiar(bloque.titulo);
      const descripcion = [bloque.titulo, ...bloque.ctas].reduce((texto, quitar) => texto.replace(quitar, ' '), bloque.texto);
      const noches = Number(normalizarTexto(bloque.texto).match(/(\d{1,2})\s+noches?\b/)?.[1]) || null;
      return {
        indice,
        titulo,
        descripcion: recortar(limpiar(descripcion)),
        url: urlSegura(bloque.enlace, comercio, resueltos),
        imagen: bloque.imagen,
        ...precioDe(bloque.texto, bloque.tachados),
        noches,
        tipo: tipoDe(comercio, bloque.texto),
        lugar: lugarDelTitulo(titulo),
      };
    })
    : [{
      indice: 0,
      titulo: limpiar(email.asunto) || `Ofertas de ${comercio.nombre}`,
      descripcion: '',
      url: urlSegura(principal, comercio, resueltos),
      ...precioDe(textoPlano(email.asunto)),
      tipo: tipoDe(comercio, email.asunto ?? ''),
      lugar: lugarDelTitulo(limpiar(email.asunto)),
    }];

  const vistos = new Set();
  const ofertas = [];
  for (const { indice, ...campos } of datos) {
    if (vistos.has(campos.titulo)) continue;
    vistos.add(campos.titulo);
    try {
      ofertas.push(crearOferta({ ...comun, ...campos, id: `${ID}:${idMensaje}-${indice}` }));
    } catch (error) {
      log(`Oferta de ${comercio.nombre} descartada: ${error.message}`);
    }
  }
  return ofertas;
}

// ---------------------------------------------------------------------------
// IMAP
// ---------------------------------------------------------------------------

function crearClienteImap(env) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: LIMITE_IMAP_MS,
  });
}

async function conectar(cliente) {
  try {
    await cliente.connect();
  } catch (error) {
    throw new Error(error.authenticationFailed
      ? 'Gmail rechaza GMAIL_USER/GMAIL_APP_PASSWORD (¿contraseña de aplicación correcta e IMAP activado?)'
      : `No se pudo conectar a imap.gmail.com: ${error.message}`);
  }
}

async function descargarMensajes(cliente, desde) {
  await conectar(cliente);
  const carpetas = await cliente.list();
  const etiqueta = carpetas.find((c) => c.path.toLowerCase() === ETIQUETA_GMAIL);
  const fuentes = [];
  for (const carpeta of ['INBOX', ...(etiqueta ? [etiqueta.path] : [])]) {
    // readOnly = EXAMINE: los mensajes no se marcan como leídos.
    const cerrojo = await cliente.getMailboxLock(carpeta, { readOnly: true });
    try {
      const uids = ((await cliente.search({ since: desde }, { uid: true })) || []).slice(-MAX_MENSAJES);
      if (!uids.length) continue;
      for await (const mensaje of cliente.fetch(uids, { source: true }, { uid: true })) {
        if (mensaje.source) fuentes.push(mensaje.source);
      }
    } finally {
      cerrojo.release();
    }
  }
  return fuentes;
}

async function cerrar(cliente) {
  try {
    if (cliente.usable) {
      await cliente.logout();
      return;
    }
  } catch {
    // la conexión ya estaba rota: se cierra sin más
  }
  cliente.close();
}

/**
 * Mensajes crudos (RFC 822) de INBOX y de la etiqueta «Ofertas» desde `desde`,
 * en solo lectura. Corta a los `limiteMs` y cierra siempre la conexión.
 */
export async function leerBuzon(cliente, { desde, limiteMs = LIMITE_IMAP_MS }) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => {
      cliente.close();
      rechazar(new Error(`El buzón IMAP no ha respondido en ${limiteMs / 1000} s`));
    }, limiteMs);
  });
  try {
    return await Promise.race([descargarMensajes(cliente, desde), limite]);
  } finally {
    clearTimeout(temporizador);
    await cerrar(cliente);
  }
}

/**
 * Mensaje RFC 822 → {de, para, asunto, fecha, html, texto, messageId, autenticacion,
 * esLista}. `de` es solo la dirección (el nombre visible no cuenta para nada);
 * `autenticacion` es la PRIMERA cabecera Authentication-Results, la más reciente, que
 * es la que pone Gmail al recibirlo; `esLista` dice si trae cabeceras de lista de correo.
 */
export async function interpretarMensaje(fuente) {
  const correo = await simpleParser(fuente, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
  const remitentes = correo.from?.value ?? [];
  return {
    de: remitentes.length === 1 ? remitentes[0].address ?? '' : '',
    autenticacion: [correo.headers.get('authentication-results') ?? []].flat()[0] ?? '',
    // mailparser agrupa las List-* en otra clave: se miran las líneas originales.
    esLista: correo.headerLines.some(({ key }) => key === 'list-unsubscribe' || key === 'list-id'),
    para: [correo.to ?? []].flat().map((d) => d.text).join(', '),
    asunto: correo.subject ?? '',
    fecha: correo.date ?? null,
    html: correo.html || '',
    texto: correo.text ?? '',
    messageId: correo.messageId ?? null,
  };
}

async function interpretarMensajes(fuentes, desde, ctx) {
  const emails = new Map();
  for (const fuente of fuentes) {
    try {
      const email = await interpretarMensaje(fuente);
      const clave = email.messageId ?? hash(fuente.toString('latin1'));
      if (email.fecha && email.fecha >= desde) emails.set(clave, email);
    } catch (error) {
      ctx.log(`Mensaje ilegible descartado: ${error.message}`);
    }
  }
  return [...emails.values()].sort((a, b) => b.fecha - a.fecha);
}

/**
 * Se queda con las newsletters de verdad: comercio conocido, remitente verificado por
 * Gmail (DMARC/DKIM), con cabeceras de lista de correo y que no sean transaccionales.
 * Devuelve también cuántos se han descartado por cada motivo, para el registro.
 */
export function newslettersAutenticas(emails) {
  const descartes = {
    'remitente que no es un comercio conocido': 0,
    'remitente sin verificar por Gmail (posible suplantación)': 0,
    'no son newsletters (sin List-Unsubscribe ni List-Id)': 0,
    'transaccionales (reservas, códigos, facturas…)': 0,
  };
  const [desconocido, sinVerificar, noLista, transaccional] = Object.keys(descartes);
  const validos = emails.filter((email) => {
    const comercio = comercioDe(email.de);
    const motivo = !comercio ? desconocido
      : !remitenteVerificado(email, comercio) ? sinVerificar
        : !email.esLista ? noLista
          : esTransaccional(email) ? transaccional : null;
    if (motivo) descartes[motivo] += 1;
    return !motivo;
  });
  return { emails: validos, descartes };
}

// Sigue (con caché por hash, sin guardar nunca el enlace con su token) los enlaces
// de las ofertas, como mucho MAX_ENLACES por ejecución y con PAUSA_MS entre ellos.
async function resolverEnlaces(emails, ctx) {
  const resueltos = new Map();
  if (typeof ctx.http.redireccion !== 'function') {
    ctx.log('ctx.http.redireccion no está disponible: los enlaces irán a la portada de cada comercio');
    return resueltos;
  }
  const ahora = ctx.ahora.getTime();
  let pedidos = 0;
  let bloqueado = false;
  for (const { enlace, comercio } of emails.flatMap(enlacesPorResolver)) {
    if (resueltos.has(enlace)) continue;
    const clave = `buzon:enlace:${hash(enlace, 32)}`;
    const guardado = ctx.cache?.obtener(clave, CACHE_ENLACE_MS, ahora);
    if (guardado !== undefined) {
      resueltos.set(enlace, guardado);
      continue;
    }
    if (bloqueado || pedidos >= MAX_ENLACES) continue;
    if (pedidos > 0) await ctx.http.esperar(PAUSA_MS);
    pedidos += 1;
    try {
      const final = await resolverEnlace(enlace, comercio, ctx.http);
      resueltos.set(enlace, final);
      ctx.cache?.guardar(clave, final, ahora);
    } catch (error) {
      if (error instanceof ErrorBloqueo) bloqueado = true;
      ctx.log(`Enlace de ${comercio.nombre} sin resolver: ${error.message}`);
    }
  }
  return resueltos;
}

export default {
  id: ID,
  nombre: 'Buzón de newsletters',
  web: 'https://mail.google.com',
  modo: 'buzon',
  requiere: ['GMAIL_USER', 'GMAIL_APP_PASSWORD'],
  // IMAP (imap.gmail.com:993), no HTTP: el orquestador no comprueba robots.txt en modo «buzon».
  urls: [],
  /**
   * @param {object} ctx contexto de fuente; admite `ctx.crearClienteImap(env)` para
   *   sustituir el cliente IMAP (tests) y usa `ctx.http.redireccion` para los enlaces.
   */
  async obtener(ctx) {
    const desde = new Date(ctx.ahora.getTime() - DIAS_LEIDOS * DIA_MS);
    const cliente = (ctx.crearClienteImap ?? crearClienteImap)(ctx.env);
    const leidos = await interpretarMensajes(await leerBuzon(cliente, { desde }), desde, ctx);
    const { emails, descartes } = newslettersAutenticas(leidos);
    for (const [motivo, cuantos] of Object.entries(descartes)) if (cuantos) ctx.log(`${cuantos} emails ignorados: ${motivo}`);
    const resueltos = await resolverEnlaces(emails, ctx);
    const nombres = nombresConfigurados(ctx.env);
    const ofertas = emails.flatMap((email) => parsearEmail(email, { resueltos, log: ctx.log, nombres }));
    ctx.log(`${emails.length} newsletters de los últimos ${DIAS_LEIDOS} días → ${ofertas.length} ofertas`);
    return { ofertas };
  },
};
