/**
 * La misma escapada publicada en varias webs. Se agrupan las ofertas del mismo
 * alojamiento (nombre normalizado) en el mismo sitio (localidad o, si las webs la
 * escriben distinto, coordenadas a pocos km); cada una guarda en `equivalentes` las de
 * las otras webs y todas menos la más barata se marcan con la etiqueta «duplicada».
 *
 * Es deliberadamente conservador: ante la duda (título genérico, sin localidad,
 * nombre demasiado corto, otra provincia o una sola web) no agrupa nada. Mejor
 * enseñar dos veces la misma casa que esconder una oferta distinta.
 */
import { normalizarTexto } from '../util/xml.js';
import { distanciaKm } from './geo.js';
import { precioPorPersonaNoche } from './puntuacion.js';
import { deWebDeChollos } from '../fuentes/chollos.js';

export const ETIQUETA_DUPLICADA = 'duplicada';

/** Palabras de categoría que no distinguen un alojamiento de otro. */
const CATEGORIA = /\b(hotel|hoteles|hostal|hostales|aparthotel|apartahotel|apartamentos?|camping|bungalows?|glamping|balneario|spa|wellness|resort|boutique|complejo|alojamiento|hospederia|casa rural|casas rurales|adults only|solo adultos)\b/g;
/** «4*», «4 estrellas»… */
const CATEGORIA_ESTRELLAS = /\b\d\s*(?:\*+|estrellas?\b)/g;
/** Títulos que describen la oferta, no el alojamiento: no sirven para comparar. */
const TITULO_GENERICO = [
  /\b(para|hasta)\s+\d+\s+personas?\b/,
  /\b\d+\s*noches?\b/,
  /^(escapada|escapadas|oferta|ofertas|finde|fin de semana|estancia|plan|chollo|viaje|vuelo|promocion|descuento|circuito)\b/,
];
const MINIMO_PALABRAS = 2;
const MINIMO_CARACTERES = 6;
/** Lo que queda al quitar «Can», «Cal», «Casa» o «Rural» del principio ha de decir algo por sí solo. */
const MINIMO_NUCLEO = 4;
/** Palabras que cada web pone o no delante del nombre: «Can Mas Vila» es «Rural Mas Vila». */
const PREFIJOS = new Set(['rural', 'casa', 'can', 'cal', 'ca']);
/** Formas de decir lo mismo: «Masía ca l'Estrada» es «Mas Ca l'Estrada». */
const SINONIMOS = { masia: 'mas' };
/** El mismo nombre en pueblos distintos (municipio en una web, pedanía en otra) solo si están así de cerca. */
const CERCA_KM = 4;
/** Con el mismo nombre de pueblo pero más lejos son dos pueblos que se llaman igual. */
const HOMONIMOS_KM = 25;

const limpiar = (texto) => texto.replace(/\s+/g, ' ').trim();

/**
 * Nombre del alojamiento de una oferta, normalizado para comparar, o null si el
 * título no sirve para identificarlo.
 * @param {import('../modelo.js').Oferta} oferta
 */
export function nombreAlojamiento(oferta) {
  // Nomolesten titula las escapadas «<oferta> · <alojamiento>».
  const bruto = normalizarTexto(String(oferta.titulo).split('·').pop());
  const sinLugar = quitarLugar(bruto, oferta.lugar?.nombre);
  if (TITULO_GENERICO.some((patron) => patron.test(sinLugar))) return null;
  const nombre = limpiar(sinLugar
    .replace(CATEGORIA_ESTRELLAS, ' ')
    .replace(CATEGORIA, ' ')
    .replace(/[^a-z0-9 ]/g, ' '));
  const palabras = nombre.split(' ').filter(Boolean);
  return palabras.length >= MINIMO_PALABRAS && nombre.length >= MINIMO_CARACTERES ? nombre : null;
}

/** «mas bassó en besalú» → «mas bassó». */
function quitarLugar(texto, lugar) {
  if (!lugar) return texto;
  const sitio = normalizarTexto(lugar).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return limpiar(texto.replace(new RegExp(`\\s+(en|de)\\s+${sitio}\\b.*$`), ''));
}

/**
 * El nombre sin lo que cada web pone o no delante («can mas vila» y «rural mas vila» →
 * «mas vila»). Si lo que queda es demasiado corto para distinguir nada, el nombre entero.
 */
export function nucleoNombre(nombre) {
  const palabras = nombre.split(' ').map((palabra) => SINONIMOS[palabra] ?? palabra).filter((palabra) => palabra.length > 1);
  while (palabras.length > 1 && PREFIJOS.has(palabras[0])) palabras.shift();
  const nucleo = palabras.join(' ');
  return nucleo.length >= MINIMO_NUCLEO ? nucleo : nombre;
}

// Sin signos: «Vilobí d'Onyar», «Vilobi d Onyar» y «Castell de l´Areny» se escriben de muchas formas.
const localidadDe = (oferta) => normalizarTexto(oferta.lugar?.nombre ?? '').replace(/[^a-z0-9]+/g, ' ').trim() || null;
const provinciaDe = (oferta) => normalizarTexto(oferta.lugar?.provincia ?? '').trim() || null;
const tieneCoordenadas = (lugar) => Number.isFinite(lugar?.lat) && Number.isFinite(lugar?.lon);

/**
 * ¿Están las dos en el mismo sitio? Misma localidad (y no a más de `HOMONIMOS_KM`) o,
 * con el mismo nombre exacto, localidades distintas a menos de `CERCA_KM`. Nunca en
 * provincias distintas.
 */
function mismoSitio(a, b) {
  if (a.provincia && b.provincia && a.provincia !== b.provincia) return false;
  const km = tieneCoordenadas(a.oferta.lugar) && tieneCoordenadas(b.oferta.lugar) ? distanciaKm(a.oferta.lugar, b.oferta.lugar) : null;
  if (a.localidad === b.localidad) return km === null || km <= HOMONIMOS_KM;
  return a.nombre === b.nombre && km !== null && km <= CERCA_KM;
}

/** Lo comparable entre webs: precio por persona y noche y, si no se sabe, el precio. */
function valorComparable(oferta) {
  const noche = oferta.precioNoche ?? precioPorPersonaNoche(oferta);
  return noche ?? oferta.precio ?? Infinity;
}

/** Un precio comparable igual a otro (hasta 1 € o un 2 % de diferencia, lo que sea más). */
const mismoPrecio = (a, b) => Math.abs(valorComparable(a) - valorComparable(b)) <= Math.max(1, 0.02 * valorComparable(b));

/**
 * La que queda a la vista de un grupo ya ordenado de más barata a más cara: la más barata; pero
 * si es de una web de chollos y una web directa la tiene al mismo precio, la directa (el botón
 * lleva a quien vende, no a quien la ha reenviado). Ni la nota ni el orden cambian por esto.
 */
function elegirVisible(ordenadas) {
  const [primera] = ordenadas;
  if (!deWebDeChollos(primera)) return ordenadas;
  const directa = ordenadas.find((o) => !deWebDeChollos(o) && mismoPrecio(o, primera));
  return directa ? [directa, ...ordenadas.filter((o) => o !== directa)] : ordenadas;
}

/** Lo que el panel necesita para comparar: web, precio, unidad, precio por persona y noche y enlace. */
const resumir = (oferta) => ({
  id: oferta.id, fuente: oferta.fuente, precio: oferta.precio, unidad: oferta.unidad,
  precioNoche: oferta.precioNoche ?? precioPorPersonaNoche(oferta), url: oferta.url,
});

/** Reparte las ofertas del mismo núcleo de nombre en grupos del mismo sitio (componentes conexas). */
function porSitio(candidatas) {
  const grupos = [];
  const pendientes = new Set(candidatas);
  for (const inicio of candidatas) {
    if (!pendientes.delete(inicio)) continue;
    const grupo = [inicio];
    for (let i = 0; i < grupo.length; i++) {
      for (const otra of [...pendientes]) {
        if (mismoSitio(grupo[i], otra)) {
          pendientes.delete(otra);
          grupo.push(otra);
        }
      }
    }
    grupos.push(grupo.map((c) => c.oferta));
  }
  return grupos;
}

function agrupar(ofertas) {
  const porNucleo = new Map();
  for (const oferta of ofertas) {
    const nombre = nombreAlojamiento(oferta);
    const localidad = localidadDe(oferta);
    if (!nombre || !localidad) continue;
    const nucleo = nucleoNombre(nombre);
    if (!porNucleo.has(nucleo)) porNucleo.set(nucleo, []);
    porNucleo.get(nucleo).push({ oferta, nombre, localidad, provincia: provinciaDe(oferta) });
  }
  // La misma escapada en varias webs: dos ofertas de la misma web son cosas distintas.
  return [...porNucleo.values()]
    .flatMap(porSitio)
    .filter((grupo) => new Set(grupo.map((o) => o.fuente)).size >= 2);
}

/**
 * Lo que ve quien compara dos ofertas de la misma web. Si todo coincide (título, precio,
 * unidad, noches, lugar, régimen, descripción y etiquetas), para esa persona son la misma
 * oferta publicada dos veces con distinto id (Weekendesk lo hace). Basta con que cambie
 * una etiqueta («Cena gastronómica») o la descripción para que sean productos distintos.
 */
/**
 * Reclamos que la web pone o quita sin que cambie el producto («Noche adicional con
 * descuento», «Escapada barata», «Nuevo»): no distinguen dos ofertas.
 */
const RECLAMO = /\b(?:descuento|barat[ao]s?|ofertas?|promo(?:cion)?|nuev[ao]s?|novedad(?:es)?|popular|exclusiv[ao]|ultim[ao]s?\s+plazas|mas vendid[ao]|top)\b/;

function huella(oferta) {
  return JSON.stringify([
    oferta.fuente, normalizarTexto(oferta.titulo).trim(), oferta.precio, oferta.unidad, oferta.noches,
    normalizarTexto(oferta.lugar?.nombre ?? ''), oferta.regimen, normalizarTexto(oferta.descripcion ?? '').trim(),
    oferta.fechas?.salida ?? null, oferta.fechas?.vuelta ?? null,
    [...oferta.etiquetas].filter((e) => e !== ETIQUETA_DUPLICADA && !RECLAMO.test(normalizarTexto(e))).sort(),
  ]);
}

/** Cuántos datos útiles trae: de dos copias se queda la más completa. */
const datos = (o) => ['establecimiento', 'estrellas', 'valoracion', 'imagen', 'regimen', 'alojamiento'].filter((k) => o[k] != null).length;

/** Las copias idénticas de la misma web: se queda la más completa, las demás se marcan «duplicada». */
function marcarCopias(ofertas) {
  const vistas = new Set();
  for (const oferta of [...ofertas].sort((a, b) => datos(b) - datos(a) || (a.id < b.id ? -1 : 1))) {
    const clave = huella(oferta);
    if (vistas.has(clave)) oferta.etiquetas.push(ETIQUETA_DUPLICADA);
    else vistas.add(clave);
  }
}

/** Un reenvío y su original: mismo sitio a menos de esto. */
const REENVIO_KM = 5;
/** …y precios parecidos: el «desde» del reenvío puede ser de otra fecha o habitación. */
const REENVIO_DIFERENCIA = 0.2;

/**
 * La oferta original de un reenvío: Chollometro o un canal que publican «Hotel 3* en La
 * Massana desde 15 €» de BuscoUnChollo (lo dicen en sus etiquetas), cuando esa misma web
 * también se lee directamente. Solo si la web nombrada tiene una oferta en el mismo sitio,
 * con la misma unidad, precio parecido y, si las dos lo dicen, las mismas estrellas y
 * noches. Ante la duda, nada: los títulos de unos y otros no se parecen.
 */
function originalDe(oferta, porFuente, webs) {
  const nombradas = new Set((oferta.etiquetas ?? []).map((e) => webs.get(normalizarTexto(e).trim())).filter((f) => f && f !== oferta.fuente));
  if (!nombradas.size || oferta.tipo === 'actividad' || oferta.tipo === 'vuelo' || !(oferta.precio > 0)) return null;
  const localidad = localidadDe(oferta);
  const cerca = (o) => (tieneCoordenadas(oferta.lugar) && tieneCoordenadas(o.lugar)
    ? distanciaKm(oferta.lugar, o.lugar) <= REENVIO_KM
    : Boolean(localidad) && localidadDe(o) === localidad);
  const iguales = (a, b) => a == null || b == null || a === b;
  const diferencia = (o) => Math.abs(o.precio - oferta.precio) / Math.min(o.precio, oferta.precio);
  const candidatas = [...nombradas].flatMap((fuente) => porFuente.get(fuente) ?? [])
    .filter((o) => o.tipo !== 'actividad' && o.tipo !== 'vuelo' && o.precio > 0 && o.unidad === oferta.unidad
      && iguales(o.estrellas, oferta.estrellas) && iguales(o.noches, oferta.noches) && cerca(o)
      && diferencia(o) <= REENVIO_DIFERENCIA);
  // Si hay varias del mismo sitio, no se sabe cuál es: mejor no juntar.
  return candidatas.length === 1 ? candidatas[0] : null;
}

/**
 * Rellena `equivalentes` (y la etiqueta «duplicada» en las repetidas) en todas las
 * ofertas. Es idempotente: cada ejecución parte de cero. Con `webs` (nombre de cada web
 * en minúsculas → su id), los reenvíos de otra web que también se lee se juntan con su
 * original, que es la que queda a la vista (enlaza a la reserva).
 * @param {import('../modelo.js').Oferta[]} ofertas
 * @param {{webs?: Map<string, string>}} [opciones]
 */
export function marcarEquivalentes(ofertas, { webs = new Map() } = {}) {
  for (const oferta of ofertas) {
    oferta.equivalentes = [];
    oferta.etiquetas = oferta.etiquetas.filter((etiqueta) => etiqueta !== ETIQUETA_DUPLICADA);
  }

  for (const grupo of agrupar(ofertas)) {
    const [mejor, ...resto] = elegirVisible([...grupo].sort((a, b) => valorComparable(a) - valorComparable(b)));
    // Dos ofertas de la misma web son cosas distintas (otra habitación, otro régimen): la
    // hermana de la más barata no se esconde como «duplicada», aunque haya una tercera web.
    const repetidas = resto.filter((oferta) => oferta.fuente !== mejor.fuente);
    // Cada una ve las de las otras webs, de la más barata a la más cara (la primera de una
    // repetida es siempre la más barata del grupo).
    const comparadas = [mejor, ...repetidas];
    for (const oferta of comparadas) {
      oferta.equivalentes = comparadas.filter((otra) => otra.fuente !== oferta.fuente).map(resumir);
    }
    for (const oferta of repetidas) oferta.etiquetas.push(ETIQUETA_DUPLICADA);
  }
  if (webs.size) {
    const porFuente = new Map();
    for (const oferta of ofertas) {
      if (oferta.etiquetas.includes(ETIQUETA_DUPLICADA) || oferta.equivalentes.length) continue;
      if (!porFuente.has(oferta.fuente)) porFuente.set(oferta.fuente, []);
      porFuente.get(oferta.fuente).push(oferta);
    }
    const usadas = new Set();
    for (const oferta of ofertas) {
      if (oferta.etiquetas.includes(ETIQUETA_DUPLICADA) || oferta.equivalentes.length) continue;
      const original = originalDe(oferta, porFuente, webs);
      if (!original || usadas.has(original.id)) continue;
      usadas.add(original.id);
      original.equivalentes = [resumir(oferta)];
      oferta.equivalentes = [resumir(original)];
      oferta.etiquetas.push(ETIQUETA_DUPLICADA);
    }
  }
  marcarCopias(ofertas.filter((oferta) => !oferta.etiquetas.includes(ETIQUETA_DUPLICADA)));
  return ofertas;
}
