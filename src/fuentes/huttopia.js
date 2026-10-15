/**
 * Huttopia: campings en plena naturaleza (chalets, cabañas y tiendas equipadas) en
 * Francia y otros países de Europa. Sus promociones van en la franja de arriba de la
 * portada («NATURE27: ¡10% de descuento en tus estancias 2027!») y en las diapositivas de
 * debajo («Call of winter 20% de descuento a partir de 7 noches»), y cada una enlaza su página
 * de condiciones: el código, hasta cuándo vale («código válido hasta el 8/11/2026»), las
 * noches mínimas, las fechas de estancia y dónde se aplica: en los campings que enlaza (los 7
 * chalets de invierno de WINTER26) o «en todos los Campings y CityKamp Huttopia en Europa
 * (excepto …)». La portada trae además el mapa de todos sus destinos (`data-map`: nombre,
 * coordenadas, región, apertura, foto y descripción), y las páginas «nuestras ofertas» del
 * menú, la valoración y la localidad de los que listan (JSON-LD `ItemList` de `Campground`).
 *
 * Cada oferta es una promoción en un camping a menos de `MAX_KM` en línea recta del origen.
 * Sin porcentaje no hay oferta de precio y no se coge nada. Se leen la portada, cada página de
 * condiciones (hasta `MAX_PROMOCIONES`) y cada página de ofertas, con 2 s de pausa.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { distanciaKm } from '../enriquecer/geo.js';
import { normalizarTexto, recortar, textoPlano } from '../util/xml.js';

const ID = 'huttopia';
const WEB = 'https://europe.huttopia.com';
const PORTADA = `${WEB}/es/`;
const PAUSA_MS = 2000;
const MAX_PAGINAS = 4;
const MAX_PROMOCIONES = 3;
/** Campings más lejos de esto (en línea recta desde el origen) no se cogen. */
export const MAX_KM = 450;
const PAGINA_OFERTAS = /^https:\/\/europe\.huttopia\.com\/es\/nuestras-ofertas\/[a-z0-9-]+\/$/;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|access denied/i;

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();
/** «FONT ROMEU ODEILLO» → «Font Romeu Odeillo»; lo que ya viene con minúsculas, tal cual. */
const nombrePropio = (texto) => (/[a-zà-ÿ]/.test(texto) ? texto : texto.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()));

/** «Call of winter 20% DE DESCUENTO…» o la franja: {texto, url, descuento, codigo, nochesMin}, o null sin porcentaje. */
function promocionDeEnlace($, enlace) {
  const texto = limpiar($(enlace).text()).replace(/\s*!?\*+$/, '').replace(/\s+!$/, '');
  const descuento = Number(texto.match(/(\d{1,2})\s?%/)?.[1]);
  if (!(descuento > 0)) return null;
  return {
    texto,
    url: $(enlace).attr('href') ?? null,
    descuento,
    codigo: texto.match(/^([A-Z0-9]{4,})\s*:/)?.[1] ?? null,
    nochesMin: Number(texto.match(/(\d+)\s+noches/i)?.[1]) || null,
  };
}

/**
 * La promoción de la franja de arriba, o null si no hay franja o no dice un porcentaje.
 * @param {cheerio.CheerioAPI} $
 */
function promocionDe($) {
  const enlace = $('.htp-banner .banner-text a').first();
  return enlace.length ? promocionDeEnlace($, enlace) : null;
}

/** La franja y las diapositivas con un porcentaje que enlazan sus condiciones: una por página. */
function promocionesDe($) {
  const enlaces = [...$('.htp-banner .banner-text a').toArray(), ...$('main .slides a[href]').toArray()];
  const porUrl = new Map();
  for (const enlace of enlaces) {
    const promocion = promocionDeEnlace($, enlace);
    if (!promocion?.url?.startsWith(`${WEB}/`) || porUrl.has(promocion.url)) continue;
    porUrl.set(promocion.url, promocion);
  }
  return [...porUrl.values()];
}

// Huttopia en Europa: Francia y, por su región en el mapa, estos países.
const PAISES = { España: 'ES', Portugal: 'PT', Bélgica: 'BE', 'Países Bajos': 'NL' };
const decodificar = (texto) => limpiar(cheerio.load(`<p>${texto ?? ''}</p>`)('p').text());

/**
 * Los campings y CityKamp de Europa del mapa de la portada (`data-map`), por URL: nombre,
 * coordenadas, región, país, foto, descripción, etiquetas, apertura y si es un chalet de
 * invierno. Los vivacs (bivouacs) y los de América, no.
 * @param {cheerio.CheerioAPI} $
 * @returns {Map<string, object>}
 */
function sitiosDe($) {
  let mapa;
  try {
    mapa = JSON.parse($('[data-map]').first().attr('data-map') ?? '{}');
  } catch {
    return new Map();
  }
  // En otoño el mapa solo trae la cara de invierno de los campings con chalets de invierno
  // («…/site/camping-font-romeu/hiver/»), pero el menú enlaza también su camping de verano.
  const verano = (id) => $(`a[data-site="${String(id).replace(/[^\w-]/g, '')}"]`).map((_, a) => $(a).attr('href')).get()
    .find((url) => url?.startsWith(`${WEB}/`) && !/\/hiver\/$/.test(url)) ?? null;
  const sitios = new Map();
  for (const s of Object.values(mapa ?? {})) {
    const lat = Number(s?.lat);
    const lon = Number(s?.lng);
    if (!['camping', 'citykamp'].includes(s?.universe) || !/^https:\/\//.test(s.url ?? '') || /americas\.huttopia/.test(s.url)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const region = decodificar(s.region);
    const apertura = s.openingPeriods?.universalFormat;
    const invierno = s.season === 'winter' || /\/hiver\/$/.test(s.url);
    sitios.set(s.url, {
      nombre: decodificar(s.title),
      url: s.url,
      citykamp: s.universe === 'citykamp',
      invierno,
      // La página de su camping de verano, si es un chalet de invierno: ver `caraDeVerano`.
      verano: invierno && s.id != null ? verano(s.id) : null,
      lat,
      lon,
      region: PAISES[region] ? null : region.split(' - ')[0] || null,
      codigoPais: PAISES[region] ?? 'FR',
      imagen: s.thumbnail?.large ? new URL(s.thumbnail.large, WEB).href : null,
      descripcion: textoPlano(s.description ?? ''),
      etiquetas: (s.tags ?? []).map(decodificar).filter(Boolean),
      apertura: apertura?.dateStart && apertura?.dateEnd ? { desde: apertura.dateStart, hasta: apertura.dateEnd } : null,
    });
  }
  return sitios;
}

/**
 * Portada: las promociones (franja y diapositivas), las páginas de ofertas del menú y los
 * campings del mapa. `promocion` es la de la franja (la de las páginas de ofertas antiguas).
 * @param {string} html
 */
export function parsearPortada(html) {
  const $ = cheerio.load(html);
  const paginas = [...new Set($('a[href]').map((_, a) => $(a).attr('href')).get().filter((url) => PAGINA_OFERTAS.test(url)))];
  return { promocion: promocionDe($), promociones: promocionesDe($), paginas, sitios: sitiosDe($) };
}

/** «Código válido hasta el 18/10/26» o «…hasta el 8/11/2026» → '2026-10-18', o null. */
function diaLimite(texto) {
  const m = String(texto).match(/v[aá]lid[oa] hasta el (\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/i);
  return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** «Código válido hasta el 18/10/26» o «…hasta el 8/11/2026» → fin de ese día en Madrid (ISO), o null. */
export function fechaLimite(texto) {
  const dia = diaLimite(texto);
  return dia ? new Date(`${dia}T23:59:59+01:00`).toISOString() : null;
}

/** «Chalets de Invierno», «Camping de Paris», «los de Estrasburgo» → con qué se reconoce cada uno. */
const EXONIMOS = { estrasburgo: 'strasbourg', paris: 'paris', ginebra: 'geneve', lion: 'lyon' };
function excepciones(textos) {
  return textos
    .flatMap((texto) => texto.replace(/\([^()]*\)/g, ' ').split(/,\s*|\s+y\s+/))
    // Sin lo que no son letras: «Chalets de Invierno*», «Paris (Bois de Boulogne)».
    .map((parte) => normalizarTexto(parte).replace(/[^a-z\s-]+/g, ' ').replace(/\s+/g, ' ').trim())
    .map((parte) => parte.replace(/^(?:los|las|el|la|nuestros|nuestras)\s+(?:de\s+)?/, '').replace(/^(?:campings?|citykamps?)\s+(?:de\s+)?/, '').trim())
    .filter(Boolean);
}
// Los términos solo llevan letras, espacios y guiones: van tal cual en la expresión.
const excluido = (sitio, terminos) => terminos.some((termino) => {
  if (/^chalets? de invierno$/.test(termino)) return sitio.invierno;
  const nombre = normalizarTexto(`${sitio.nombre} ${new URL(sitio.url).hostname} ${new URL(sitio.url).pathname}`).replace(/[^a-z\s-]+/g, ' ');
  return [termino, EXONIMOS[termino]].filter(Boolean).some((t) => new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(nombre));
});

/**
 * El camping de verano de un chalet de invierno: mismo sitio, sin lo de invierno (descripción,
 * etiquetas, apertura y foto, que son de los chalets y la nieve). La foto, de su ficha.
 */
const caraDeVerano = (sitio) => ({ ...sitio, url: sitio.verano, invierno: false, verano: null, imagen: null, descripcion: '', etiquetas: [], apertura: null });

/** Los campings de una promoción «en todos los campings» salvo `excepto`. */
function sitiosDeTodos(sitios, excepto) {
  return [...sitios.values()].flatMap((sitio) => {
    if (!excluido(sitio, excepto)) return [sitio];
    if (!sitio.verano || sitios.has(sitio.verano)) return [];
    const deVerano = caraDeVerano(sitio);
    return excluido(deVerano, excepto) ? [] : [deVerano];
  });
}

/**
 * Página de condiciones de una promoción: {caduca, limite, codigo, descuento, nochesMin,
 * periodos, todos, excepto, sitios}. `todos`: vale «en todos los campings / destinos» salvo `excepto`;
 * si no, `sitios` son los campings que enlaza (sin el menú).
 * @param {string} html
 */
export function parsearCondiciones(html) {
  const $ = cheerio.load(html);
  const principal = $('main').length ? $('main') : $('body');
  const sitios = [...new Set(principal.find('a[href*="/site/"]').map((_, a) => $(a).attr('href')).get())];
  principal.find('script, style, noscript').remove();
  const texto = limpiar(principal.text()).replace(/\u200b/g, '');
  const ambito = /en tod[oa]s (?:los|las|nuestros|nuestras) (?:campings|destinos)/i;
  const excepto = [...texto.matchAll(/en tod[oa]s (?:los|las|nuestros|nuestras) (?:campings|destinos)[^()\d]{0,80}\(excepto ((?:[^()]|\([^()]*\))+)\)/gi)].map((m) => m[1]);
  // Con excepciones que no se entienden (paréntesis sin cerrar…), mejor nada que dar la promoción
  // donde no vale: obtener se salta esta promoción y lo guardado sigue.
  if (!excepto.length && /en tod[oa]s (?:los|las|nuestros|nuestras) (?:campings|destinos)[^()\d]{0,80}\(excepto\b/i.test(texto)) {
    throw new Error('No se entienden las excepciones de la promoción');
  }
  const periodos = [...new Set([...texto.matchAll(/\bdel (\d{1,2}\/\d{1,2}\/\d{4}) al (\d{1,2}\/\d{1,2}\/\d{4})/g)].map((m) => `${m[1]}|${m[2]}`))]
    .map((p) => p.split('|'));
  const limite = diaLimite(texto);
  return {
    caduca: fechaLimite(texto),
    // «18/10/2026», para decirlo en la oferta.
    limite: limite ? limite.split('-').reverse().join('/') : null,
    codigo: texto.match(/c[oó]digo:?\s*([A-Z0-9]{4,})\b/)?.[1] ?? null,
    descuento: Number(texto.match(/(\d{1,2})\s?% de descuento/)?.[1]) || null,
    nochesMin: Number(texto.match(/(?:a partir de|al menos|m[ií]nimo(?: de)?)\s+(\d+)\s+noches/i)?.[1]) || null,
    periodos,
    todos: ambito.test(texto),
    excepto: excepciones(excepto),
    sitios,
  };
}

/** La primera foto del JSON-LD de un camping (`image`: una URL, una lista o un ImageObject). */
const fotoDe = (ficha) => [ficha?.image].flat().map((i) => (typeof i === 'string' ? i : i?.url)).find((u) => typeof u === 'string' && u.startsWith('https://')) ?? null;

const aDia = (fecha) => {
  const [d, m, a] = fecha.split('/');
  return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};
const solapan = (apertura, periodos) => periodos.some(([desde, hasta]) => aDia(apertura.desde) <= aDia(hasta) && aDia(apertura.hasta) >= aDia(desde));

/**
 * Las ofertas de una promoción: un camping por oferta, de los que dice su página de
 * condiciones, a menos de `MAX_KM` del origen. `valoraciones`: JSON-LD de las páginas de
 * ofertas por URL (valoración y localidad).
 */
export function ofertasDePromocion(promocion, condiciones, sitios, { valoraciones = new Map(), ajustes, log = () => {} } = {}) {
  const descuento = promocion.descuento ?? condiciones.descuento;
  const codigo = promocion.codigo ?? condiciones.codigo;
  const nochesMin = promocion.nochesMin ?? condiciones.nochesMin;
  if (!(descuento > 0)) return [];
  const elegidos = condiciones.todos
    ? sitiosDeTodos(sitios, condiciones.excepto)
    : condiciones.sitios.map((url) => sitios.get(url)).filter(Boolean);
  const origen = ajustes?.origen;
  const estancias = condiciones.periodos.map(([desde, hasta]) => `del ${desde} al ${hasta}`).join(' y ');
  const reserva = condiciones.limite ? `, reservando hasta el ${condiciones.limite}` : '';
  const ofertas = [];
  for (const sitio of elegidos) {
    if (origen && distanciaKm(origen, sitio) > MAX_KM) continue;
    const ficha = [...valoraciones.entries()].find(([base]) => sitio.url.startsWith(base))?.[1];
    const nota = Number(ficha?.aggregateRating?.ratingValue);
    const opiniones = Number(ficha?.aggregateRating?.ratingCount);
    const mejor = Number(ficha?.aggregateRating?.bestRating) || 5;
    const nombre = sitio.citykamp ? `CityKamp ${sitio.nombre}` : `Camping Huttopia ${sitio.nombre}`;
    const abierto = sitio.apertura && (!condiciones.periodos.length || solapan(sitio.apertura, condiciones.periodos))
      ? ` Abierto del ${sitio.apertura.desde} al ${sitio.apertura.hasta}.` : '';
    const ruta = new URL(sitio.url);
    const clave = ruta.hostname === new URL(WEB).hostname ? ruta.pathname.split('/').filter(Boolean)[2] : ruta.hostname.replace(/^www\./, '');
    try {
      ofertas.push(crearOferta({
        id: `${ID}:${clave}:${codigo ?? descuento}`,
        fuente: ID,
        tipo: 'hotel',
        titulo: `${nombre}: ${descuento} % de descuento${nochesMin ? ` a partir de ${nochesMin} noches` : ''}`,
        establecimiento: nombre,
        descripcion: recortar(`${descuento} % de descuento${nochesMin ? ` a partir de ${nochesMin} noches` : ''}${estancias ? ` en estancias ${estancias}` : ''}${codigo ? ` con el código ${codigo}` : ''}${reserva}.${abierto} ${sitio.descripcion}`),
        url: sitio.url,
        imagen: sitio.imagen ?? fotoDe(ficha),
        precio: null,
        precioTexto: `${descuento} % de descuento`,
        descuento,
        alojamiento: 'camping',
        temas: [],
        valoracion: nota > 0 ? { nota: Math.round((nota / mejor) * 100) / 10, n: Number.isFinite(opiniones) ? opiniones : null } : null,
        lugar: {
          nombre: nombrePropio(limpiar(ficha?.address?.addressLocality)) || sitio.nombre,
          region: sitio.region,
          pais: { ES: 'España', FR: 'Francia', PT: 'Portugal', BE: 'Bélgica', NL: 'Países Bajos' }[sitio.codigoPais] ?? null,
          codigoPais: sitio.codigoPais,
          lat: sitio.lat,
          lon: sitio.lon,
          iata: null,
        },
        etiquetas: [sitio.citykamp ? 'CityKamp' : 'Camping', ...sitio.etiquetas],
        caduca: condiciones.caduca,
      }));
    } catch (error) {
      log(`${sitio.nombre}: ${error.message}`);
    }
  }
  return ofertas;
}

/** Campings del JSON-LD por URL: coordenadas y valoración. */
function campingsJsonLd($) {
  const campings = new Map();
  $('script[type="application/ld+json"]').each((_, script) => {
    let datos;
    try {
      datos = JSON.parse($(script).text());
    } catch {
      return;
    }
    for (const elemento of datos?.itemListElement ?? []) {
      const c = elemento?.item;
      if (c?.['@type'] !== 'Campground' || !c.url) continue;
      campings.set(c.url, c);
    }
  });
  return campings;
}

/**
 * Ofertas de una página «nuestras ofertas»: la promoción de su franja en cada camping
 * cercano. Null si la página no trae ni promoción ni campings.
 * @param {string} html
 * @param {{ajustes?: {origen?: {lat: number, lon: number}}, log?: (m: string) => void, caduca?: string|null,
 *   caducas?: Map<string, string>}} [ctx] `caducas`: fecha límite de cada código, de su página de condiciones.
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsearOfertas(html, ctx = {}) {
  const $ = cheerio.load(html);
  const promocion = promocionDe($);
  const tarjetas = $('.card-site');
  if (!promocion || !tarjetas.length) return null;
  const jsonLd = campingsJsonLd($);
  const origen = ctx.ajustes?.origen;
  const log = ctx.log ?? (() => {});
  const ofertas = [];
  tarjetas.each((_, tarjeta) => {
    const t = $(tarjeta);
    const enlace = t.find('.title-favorite a').first();
    const url = enlace.attr('href');
    const nombre = limpiar(enlace.text());
    // La tarjeta enlaza la página de invierno del camping («…/site/camping-font-romeu/hiver/»).
    const datos = [...jsonLd.entries()].find(([base]) => url?.startsWith(base))?.[1];
    const lat = Number(datos?.geo?.latitude);
    const lon = Number(datos?.geo?.longitude);
    if (!url || !nombre || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (origen && distanciaKm(origen, { lat, lon }) > MAX_KM) return;
    const [region, fechas] = t.find('.subtitle-favorite').map((_, s) => limpiar($(s).text())).get();
    const nota = Number(datos.aggregateRating?.ratingValue);
    const opiniones = Number(datos.aggregateRating?.ratingCount);
    const mejor = Number(datos.aggregateRating?.bestRating) || 5;
    const codigo = promocion.codigo ? ` con el código ${promocion.codigo}` : '';
    try {
      ofertas.push(crearOferta({
        id: `${ID}:${new URL(url).pathname.split('/').filter(Boolean)[2] ?? nombre}:${promocion.codigo ?? promocion.descuento}`,
        fuente: ID,
        tipo: 'hotel',
        titulo: `Camping ${nombre}: ${promocion.descuento} % de descuento${promocion.nochesMin ? ` a partir de ${promocion.nochesMin} noches` : ''}`,
        establecimiento: `Camping ${nombre}`,
        descripcion: recortar(`${promocion.texto.replace(/^[A-Z0-9]{4,}\s*:\s*/, '')}${codigo}.${fechas ? ` Abierto ${fechas.replace(/^Del/, 'del')}.` : ''} ${limpiar(t.find('.description').first().text())}`),
        url,
        imagen: t.find('.illustration img').attr('src') ?? datos.image?.[0] ?? null,
        precio: null,
        precioTexto: `${promocion.descuento} % de descuento`,
        descuento: promocion.descuento,
        alojamiento: 'camping',
        temas: [],
        valoracion: nota > 0 ? { nota: Math.round((nota / mejor) * 100) / 10, n: Number.isFinite(opiniones) ? opiniones : null } : null,
        lugar: {
          nombre: nombrePropio(limpiar(datos.address?.addressLocality)) || nombre,
          region: region?.split(' - ')[0] || null,
          pais: datos.address?.addressCountry === 'FR' ? 'Francia' : datos.address?.addressCountry === 'ES' ? 'España' : null,
          codigoPais: datos.address?.addressCountry ?? null,
          lat,
          lon,
          iata: null,
        },
        etiquetas: ['Camping', ...t.find('.tag').map((_, e) => limpiar($(e).text())).get()],
        caduca: ctx.caduca ?? ctx.caducas?.get(promocion.codigo) ?? null,
      }));
    } catch (error) {
      log(`${nombre}: ${error.message}`);
    }
  });
  return ofertas;
}

const esBloqueo = (error) => error.bloqueo || [403, 429].includes(error.estado);

async function pedir(ctx, url) {
  try {
    return await ctx.http.texto(url, { reintentos: 0 });
  } catch (error) {
    if (esBloqueo(error)) throw new Error(`Huttopia ha bloqueado o limitado la petición (HTTP ${error.estado})`, { cause: error });
    throw error;
  }
}

async function obtener(ctx) {
  const portada = await pedir(ctx, PORTADA);
  const { promociones, paginas, sitios } = parsearPortada(portada);
  if (!promociones.length && !paginas.length) {
    if (DESAFIO.test(portada)) throw new Error('Huttopia ha devuelto un desafío anti-bot');
    // Ni promociones ni páginas de ofertas: no hay promoción ahora mismo, nada que guardar.
    return { ofertas: [], reemplazar: true };
  }
  let leidas = 0;
  const condiciones = [];
  // Códigos de las promociones que hoy han fallado: lo guardado de ellas no se borra.
  const fallidos = new Set();
  for (const promocion of promociones.slice(0, MAX_PROMOCIONES)) {
    await ctx.http.esperar(PAUSA_MS);
    try {
      condiciones.push([promocion, parsearCondiciones(await pedir(ctx, promocion.url))]);
      leidas += 1;
    } catch (error) {
      ctx.log(`${promocion.url}: ${error.message}`);
      if (promocion.codigo) fallidos.add(promocion.codigo);
    }
  }
  const caducas = new Map(condiciones.map(([p, c]) => [p.codigo ?? c.codigo, c.caduca]).filter(([codigo, caduca]) => codigo && caduca));
  const ofertas = [];
  const valoraciones = new Map();
  for (const url of paginas.slice(0, MAX_PAGINAS)) {
    await ctx.http.esperar(PAUSA_MS);
    try {
      const html = await pedir(ctx, url);
      leidas += 1;
      for (const [base, camping] of campingsJsonLd(cheerio.load(html))) valoraciones.set(base, camping);
      // Las páginas de ofertas con su propia franja (como hasta octubre de 2026).
      ofertas.push(...(parsearOfertas(html, { ...ctx, caducas }) ?? []));
    } catch (error) {
      ctx.log(`${url}: ${error.message}`);
    }
  }
  if (!leidas) throw new Error('No se ha podido leer ninguna página de condiciones ni de ofertas de Huttopia');
  const mirados = new Set();
  for (const [promocion, condicion] of condiciones) {
    const codigo = promocion.codigo ?? condicion.codigo;
    try {
      ofertas.push(...ofertasDePromocion(promocion, condicion, sitios, { ...ctx, valoraciones }));
      if (codigo) mirados.add(codigo);
    } catch (error) {
      ctx.log(`${promocion.url}: ${error.message}`);
      if (codigo) fallidos.add(codigo);
    }
  }
  const unicas = [...new Map(ofertas.map((o) => [o.id, o])).values()];
  // Las de una promoción mirada hoy se cambian por lo de hoy. Las de una que hoy no sale en la
  // portada siguen hasta la fecha límite de su código (sin fecha, fuera). Las de una que ha
  // fallado no se borran salvo que su fecha límite ya haya pasado.
  const ahora = ctx.ahora.getTime();
  const reemplazar = (guardada) => {
    const codigo = guardada.id.split(':').at(-1);
    if (mirados.has(codigo)) return true;
    const caduca = Date.parse(guardada.caduca);
    return fallidos.has(codigo) ? caduca <= ahora : !(caduca > ahora);
  };
  return { ofertas: unicas, reemplazar };
}

export default {
  id: ID,
  nombre: 'Huttopia',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: [PORTADA],
  obtener,
};
