/**
 * Holidayguru: ofertas de último minuto, escapadas de fin de semana y las
 * destacadas de /deals/. Las secciones antiguas (WordPress) pintan tarjetas
 * `div#deal-id-<uuid>`; las nuevas (Next.js) traen los datos de cada oferta en
 * los bloques `self.__next_f.push` (payload RSC). `parsear` entiende los dos formatos.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { normalizarTexto, recortar } from '../util/xml.js';

const WEB = 'https://www.holidayguru.es';
const HOST = new URL(WEB).host;
/** /deals/ va primero: si una oferta se repite, se queda su versión, que trae caducidad y etiquetas. */
const PAGINAS = [
  `${WEB}/deals/`,
  `${WEB}/ofertas-ultimo-minuto/`,
  `${WEB}/escapadas-fin-de-semana/`,
];
const PAUSA_MS = 2000;

/** Segmento de las URL `/deal/<categoría>/…`: etiqueta que usa la web y tipo de oferta («b» se decide por el texto). */
const CATEGORIAS = {
  pt: { nombre: 'Viaje combinado', tipo: 'paquete' },
  alojamientos: { nombre: 'Alojamiento', tipo: 'hotel' },
  vuelos: { nombre: 'Vuelos', tipo: 'vuelo' },
  b: { nombre: 'Viaje', tipo: null },
};

const PUSH_RSC = /^\s*self\.__next_f\.push\((\[[\s\S]*\])\)\s*;?\s*$/;
const INICIO_OFERTA_RSC = /\{"__typename":"\w+Deal"/g;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha/i;
const NUMERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/**
 * Ofertas de una página de Holidayguru (tarjetas de WordPress y datos RSC de
 * Next.js), sin repetidas. Las tarjetas sin precio son enlaces promocionales
 * a buscadores y se ignoran.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const $ = cheerio.load(html);
  const datos = [...datosDeTarjetas($), ...datosDeRsc(payloadRsc($), log)];
  const ofertas = datos
    .filter((dato) => dato.precio != null)
    .flatMap((dato) => {
      try {
        return [ofertaDe(dato)];
      } catch (error) {
        log(`Oferta descartada (${dato.titulo || dato.href}): ${error.message}`);
        return [];
      }
    });
  return deduplicar(ofertas);
}

function datosDeTarjetas($) {
  return $('[id^="deal-id-"]').get().map((elemento) => {
    const tarjeta = $(elemento);
    const imagen = tarjeta.find('.image img').first();
    const precio = tarjeta.find('.price').first().text();
    return {
      uuid: tarjeta.attr('data-post-id') || tarjeta.attr('id').slice('deal-id-'.length),
      titulo: tarjeta.find('h2').first().text(),
      subtitulo: tarjeta.find('h3').first().text(),
      href: tarjeta.find('h2').closest('a').attr('href') ?? tarjeta.find('a[href]').first().attr('href'),
      imagen: imagen.attr('src') || imagen.attr('data-src') || null,
      precio: parsearPrecio(precio),
      precioTexto: precio.replace(/\bEUR\b/, '€').replace(/p\.\s?P\./, 'por persona'),
      publicada: fechaCorta(tarjeta.find('.date').first().text()),
      etiquetas: [],
    };
  });
}

/** Texto del payload RSC de Next.js: la unión de los bloques `self.__next_f.push([1, "…"])`. */
function payloadRsc($) {
  return $('script').get()
    .map((elemento) => PUSH_RSC.exec($(elemento).text())?.[1])
    .filter(Boolean)
    .map((json) => JSON.parse(json))
    .filter(([tipo, texto]) => tipo === 1 && typeof texto === 'string')
    .map(([, texto]) => texto)
    .join('');
}

function datosDeRsc(payload, log) {
  return [...payload.matchAll(INICIO_OFERTA_RSC)].flatMap(({ index }) => {
    try {
      return [datosDeOfertaRsc(JSON.parse(objetoJson(payload, index)))];
    } catch (error) {
      log(`Oferta RSC ilegible en la posición ${index}: ${error.message}`);
      return [];
    }
  });
}

function datosDeOfertaRsc(oferta) {
  const precio = euros(oferta.price);
  return {
    uuid: oferta.id,
    titulo: oferta.title ?? '',
    subtitulo: oferta.subtitle ?? '',
    href: oferta.url,
    imagen: oferta.featuredImages?.[0]?.image?.url ?? null,
    precio,
    precioTexto: precio == null ? '' : `desde ${NUMERO.format(precio)} € por persona`,
    precioAnterior: euros(oferta.initialPrice),
    caduca: oferta.expiryDate ?? null,
    pais: oferta.accommodations?.[0]?.hotel?.location?.address?.country ?? null,
    etiquetas: [oferta.badge, ...(oferta.tags ?? []).map((etiqueta) => etiqueta.tag?.name)],
  };
}

/** Los precios de la API vienen en céntimos. */
const euros = (precio) =>
  Number.isFinite(precio?.value) && (precio.currency ?? 'EUR') === 'EUR' ? precio.value / 100 : null;

/** Objeto JSON completo que empieza en `inicio`, contando llaves fuera de las cadenas. */
function objetoJson(texto, inicio) {
  let profundidad = 0;
  let enCadena = false;
  for (let i = inicio; i < texto.length; i++) {
    const caracter = texto[i];
    if (enCadena) {
      if (caracter === '\\') i++;
      else if (caracter === '"') enCadena = false;
    } else if (caracter === '"') {
      enCadena = true;
    } else if (caracter === '{') {
      profundidad++;
    } else if (caracter === '}' && --profundidad === 0) {
      return texto.slice(inicio, i + 1);
    }
  }
  throw new Error('objeto JSON sin cerrar');
}

function ofertaDe(dato) {
  if (!dato.uuid) throw new Error('sin identificador');
  const url = limpiarUrl(dato.href);
  const categoria = CATEGORIAS[categoriaDeUrl(url)];
  const titulo = limpiar(dato.titulo);
  const subtitulo = limpiar(dato.subtitulo);
  const tipo = categoria?.tipo ?? tipoPorTexto(`${titulo} ${subtitulo}`);
  const nombreLugar = lugarDe(titulo, subtitulo);
  return crearOferta({
    id: `holidayguru:${dato.uuid}`,
    fuente: 'holidayguru',
    tipo,
    titulo,
    descripcion: recortar(subtitulo),
    url,
    imagen: dato.imagen ? new URL(dato.imagen, WEB).href : null,
    ...precioDe(dato, tipo, titulo, subtitulo),
    precioAnterior: dato.precioAnterior ?? null,
    descuento: descuento(dato.precio, dato.precioAnterior),
    transporte: tipo === 'vuelo' ? 'avion' : null,
    lugar: nombreLugar
      ? { nombre: nombreLugar, region: null, pais: dato.pais ?? null, codigoPais: null, lat: null, lon: null, iata: null }
      : null,
    etiquetas: etiquetasDe(categoria, dato.etiquetas),
    publicada: dato.publicada ?? null,
    caduca: dato.caduca ?? null,
  });
}

const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').trim();

function limpiarUrl(href) {
  if (!href) throw new Error('sin enlace');
  const url = new URL(href, WEB);
  for (const clave of [...url.searchParams.keys()]) {
    if (/^(utm_|ref_)/i.test(clave)) url.searchParams.delete(clave);
  }
  return url.href;
}

function categoriaDeUrl(url) {
  const { host, pathname } = new URL(url);
  const [, seccion, categoria] = pathname.split('/');
  return host === HOST && seccion === 'deal' ? categoria : null;
}

/** '08.09.26' → '2026-09-08'. */
function fechaCorta(texto) {
  const partes = texto.trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  return partes ? `20${partes[3]}-${partes[2]}-${partes[1]}` : null;
}

/**
 * Los vuelos se anuncian «por trayecto»: si el texto da el precio de ida y
 * vuelta se usa ese; si no, se deja el del trayecto sin unidad. Los títulos
 * del tipo «¡desde 20€/noche!» indican precio por persona y noche.
 */
function precioDe({ precio, precioTexto }, tipo, titulo, subtitulo) {
  const texto = limpiar(precioTexto);
  const porPersona = /por persona/i.test(texto);
  if (tipo === 'vuelo') {
    const detalle = normalizarTexto(subtitulo);
    const idaVuelta = detalle.match(/ida y vuelta\D{0,5}(\d+(?:[.,]\d+)?)\s?€/);
    if (idaVuelta) return { precio: parsearPrecio(idaVuelta[1]), unidad: 'i/v', precioTexto: `${idaVuelta[1]} € ida y vuelta` };
    if (detalle.includes('por trayecto')) return { precio, unidad: null, precioTexto: `${texto} y trayecto` };
  }
  if (porPersona && /\/\s?noche|por noche/i.test(titulo)) return { precio, unidad: 'pp/noche', precioTexto: `${texto} y noche` };
  return { precio, unidad: porPersona ? 'pp' : null, precioTexto: texto };
}

function descuento(precio, anterior) {
  return precio != null && anterior > precio ? Math.round((1 - precio / anterior) * 100) : null;
}

function etiquetasDe(categoria, etiquetas) {
  const limpias = [categoria?.nombre, ...etiquetas]
    .filter(Boolean)
    .map((etiqueta) => limpiar(etiqueta.replace(/[^\p{L}\p{N}\s'’&.,-]/gu, ' ')))
    .filter(Boolean);
  if (limpias.some((etiqueta) => /top chollo/i.test(etiqueta))) limpias.push('top-chollo');
  return [...new Set(limpias)];
}

/** Tipo de oferta a partir del título y el subtítulo, para las categorías que no lo fijan. */
export function tipoPorTexto(texto) {
  const t = normalizarTexto(texto);
  const hayVuelos = /\bvuelos?\b/.test(t);
  if (hayVuelos && !/hotel|noche|alojamiento|apartamento|crucero/.test(t)) return 'vuelo';
  if (hayVuelos || /crucero|ferry/.test(t)) return 'paquete';
  const esEscapada = /spa|termas|balneario|desayuno|pension|todo incluido|entradas|cena/.test(t);
  if (!esEscapada && /hotel|alojamiento|apartamento|suite|villa/.test(t)) return 'hotel';
  return 'escapada';
}

const GENERICAS = new Set([
  'ultimo', 'minuto', 'vuelo', 'vuelos', 'hotel', 'hoteles', 'pension', 'completa', 'media', 'fin', 'finde',
  'semana', 'escapada', 'escapadas', 'ruta', 'circuito', 'crucero', 'cruceros', 'chollo', 'chollos', 'chollazo', 'ganga',
  'oferta', 'ofertas', 'especial', 'suite', 'suites', 'villa', 'villas', 'balneario', 'termas', 'spa',
  'alojamiento', 'alojamientos', 'apartamento', 'apartamentos', 'casa', 'casas', 'rural', 'rurales', 'todo',
  'incluido', 'junto', 'frente', 'con', 'solo', 'desde', 'gratis', 'mercados', 'navidad', 'nochevieja',
  'viaje', 'viajes', 'noche', 'noches', 'mediterraneo', 'verano', 'otono', 'invierno', 'primavera',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
  'noviembre', 'diciembre',
]);
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el']);
const ARTICULOS = new Set(['el', 'la', 'los', 'las']);
const PREPOSICIONES = new Set(['a', 'al', 'en', 'por', 'de', 'del']);

/**
 * Destino que se deduce del título, o null. Prioridad: lo que va antes de «:»
 * («Benidorm: …»), un nombre propio tras una preposición («… en Praga») y, si
 * no, el primer nombre propio que no sea una palabra genérica de oferta.
 * @param {string} titulo
 * @returns {string|null}
 */
export function lugarDelTitulo(titulo) {
  const dosPuntos = titulo.indexOf(':');
  if (dosPuntos > 0) {
    const antes = nombresPropios(titulo.slice(0, dosPuntos))[0];
    if (antes) return antes.nombre;
  }
  const candidatos = nombresPropios(titulo);
  return (candidatos.find((candidato) => candidato.trasPreposicion) ?? candidatos[0])?.nombre ?? null;
}

/** Destino del título o, si no hay, de la zona con la que empieza el subtítulo («Costa Toscana: crucero…»). */
function lugarDe(titulo, subtitulo) {
  const dosPuntos = subtitulo.indexOf(':');
  return lugarDelTitulo(titulo) ?? (dosPuntos > 0 ? lugarDelTitulo(subtitulo.slice(0, dosPuntos)) : null);
}

/** Secuencias de nombres propios («Cabo de Gata», «La Palma») sin cruzar signos, cifras ni emojis. */
function nombresPropios(texto) {
  return texto.split(/[^\p{L}\s'’-]+/u).flatMap((segmento) => {
    const palabras = segmento.split(/\s+/).filter(Boolean);
    const encontrados = [];
    let actual = null;
    palabras.forEach((palabra, i) => {
      if (esNombrePropio(palabra)) {
        if (actual) actual.palabras.push(palabra);
        else actual = { palabras: [palabra], trasPreposicion: trasPreposicion(palabras, i) };
      } else if (actual && CONECTORES.has(palabra) && esNombrePropio(palabras[i + 1])) {
        actual.palabras.push(palabra);
      } else if (actual) {
        encontrados.push(actual);
        actual = null;
      }
    });
    if (actual) encontrados.push(actual);
    return encontrados.map(({ palabras: nombre, trasPreposicion }) => ({ nombre: nombre.join(' '), trasPreposicion }));
  });
}

function esNombrePropio(palabra = '') {
  const siglas = palabra.length > 1 && palabra === palabra.toUpperCase();
  return /^\p{Lu}/u.test(palabra) && !siglas && !GENERICAS.has(normalizarTexto(palabra));
}

function trasPreposicion(palabras, i) {
  let j = i - 1;
  while (j >= 0 && ARTICULOS.has(palabras[j].toLowerCase())) j--;
  return j >= 0 && PREPOSICIONES.has(palabras[j].toLowerCase());
}

/** Quita las repetidas (misma URL o mismo id) y conserva la primera aparición. */
function deduplicar(ofertas) {
  const vistas = new Set();
  return ofertas.filter((oferta) => {
    if (vistas.has(oferta.url) || vistas.has(oferta.id)) return false;
    vistas.add(oferta.url).add(oferta.id);
    return true;
  });
}

function leerPagina(html, ctx) {
  const ofertas = parsear(html, ctx);
  if (ofertas.length) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Holidayguru ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('no se ha encontrado ninguna oferta (¿ha cambiado la página?)');
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function obtener(ctx) {
  const ofertas = [];
  let leidas = 0;
  let ultimoError = null;
  for (const [i, url] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      ofertas.push(...leerPagina(await ctx.http.texto(url), ctx));
      leidas++;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Holidayguru ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Holidayguru (último error: ${ultimoError.message})`);
  return { ofertas: deduplicar(ofertas), reemplazar: leidas === PAGINAS.length };
}

export default {
  id: 'holidayguru',
  nombre: 'Holidayguru',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
