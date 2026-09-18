/**
 * Escapadas de BuscoUnChollo a partir de su feed XML oficial, que trae el
 * catálogo completo de ofertas activas (robots.txt permite /xml/). El precio
 * es «desde X €/pers.» por la estancia completa de la opción más barata.
 */
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { normalizarTexto, parsearXml, recortar, textoPlano } from '../util/xml.js';

const ID = 'buscounchollo';
const WEB = 'https://www.buscounchollo.com';
const URL_FEED = `${WEB}/xml/rss.xml`;
const SIN_DATO = 'No apply';
const LISTAS = ['listing', 'description', 'url', 'image', 'tag', 'component'];
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

const REGIMENES = {
  'solo alojamiento': 'solo-alojamiento',
  'alojamiento y desayuno': 'desayuno',
  desayuno: 'desayuno',
  'media pension': 'media-pension',
  'pension completa': 'pension-completa',
  'todo incluido': 'todo-incluido',
};

// Se comparan con la etiqueta sin tildes y en minúsculas.
const TEMAS_POR_ETIQUETA = [
  [/playa/, 'playa'],
  [/mascota/, 'mascotas'],
  [/ninos|familia|toboganes/, 'familia'],
  [/rural|montana|camping/, 'rural'],
  [/\bspa\b|balneario|termal|relax|caldea/, 'spa'],
  [/romantic|novios/, 'romantico'],
  [/nieve|esqui|\baventura/, 'aventura'],
  [/portaventura|tematico|disney|warner|cabarceno|acuatico/, 'parques'],
  [/navidad|fin de ano|nochevieja|halloween|carnaval/, 'eventos'],
  [/gastronom|enoturismo|vino|bodega/, 'gastronomia'],
  [/ciudad|cultura/, 'ciudad'],
  [/singular|glamping|encanto|cueva|cabana|burbuja|castillo/, 'singular'],
];

// Campo <type> del feed: «beach», «city, culture», «food»…
const TEMAS_POR_TIPO = { beach: 'playa', city: 'ciudad', culture: 'ciudad', food: 'gastronomia' };

const PAISES_POR_CARRETERA = new Set(['España', 'Andorra', 'Francia', 'Portugal']);

const texto = (valor) => textoPlano(valor ?? '');
const dato = (valor) => {
  const limpio = texto(valor);
  return limpio && limpio !== SIN_DATO ? limpio : null;
};
const numero = (valor) => {
  const n = Number.parseFloat(valor);
  return Number.isFinite(n) ? n : null;
};
const fechaIso = (valor) => {
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

function urlSinIdioma(url) {
  const limpia = new URL(url);
  limpia.searchParams.delete('_locale');
  return limpia.toString();
}

function etiquetasDe(listing) {
  const crudas = listing.product_type?.tag ?? [];
  return [...new Set(crudas.map((etiqueta) => texto(etiqueta).replace(/,$/, '').trim()).filter(Boolean))];
}

function temasDe(etiquetas, tipo) {
  const porEtiqueta = etiquetas.flatMap((etiqueta) => {
    const normal = normalizarTexto(etiqueta);
    return TEMAS_POR_ETIQUETA.filter(([patron]) => patron.test(normal)).map(([, tema]) => tema);
  });
  const porTipo = texto(tipo).split(',').map((t) => TEMAS_POR_TIPO[t.trim()]).filter(Boolean);
  return [...new Set([...porEtiqueta, ...porTipo])];
}

const regimenDeTexto = (valor = '') => REGIMENES[normalizarTexto(valor).trim()] ?? null;

// El de la descripción principal («… | Todo incluido | …»); si no lo trae, el
// del detalle («en régimen de …») o el de las etiquetas cuando solo hay uno.
function regimenDe(principal, detalle, etiquetas) {
  const dePrincipal = principal.split('|').map(regimenDeTexto).find(Boolean);
  if (dePrincipal) return dePrincipal;
  const deDetalle = regimenDeTexto(normalizarTexto(detalle).match(/en regimen de ([a-z ]+)/)?.[1]);
  if (deDetalle) return deDetalle;
  const deEtiquetas = [...new Set(etiquetas.map(regimenDeTexto).filter(Boolean))];
  return deEtiquetas.length === 1 ? deEtiquetas[0] : null;
}

// Las noches del detalle («3 días y 2 noches en …») son las del precio. Si no
// las trae, la estancia más corta que anuncian las etiquetas.
function nochesDe(detalle, etiquetas) {
  const explicitas = detalle.match(/(\d+)\s+noches?/);
  if (explicitas) return Number(explicitas[1]);
  if (etiquetas.includes('Escapada 1-2 noches')) return 2;
  if (etiquetas.includes('Escapada de 3 a 6 noches')) return 3;
  if (etiquetas.includes('Vacaciones 1 semana o más')) return 7;
  return null;
}

function transporteDe(etiquetas, pais) {
  if (etiquetas.includes('Con vuelo incluido')) return 'avion';
  if (etiquetas.includes('Viajes con ferry')) return 'ferry';
  if (PAISES_POR_CARRETERA.has(pais) && !etiquetas.includes('Isla')) return 'coche';
  return null;
}

// Los circuitos no traen dirección («No apply»): entonces el destino sale del
// detalle («6 noches en Venecia · Roma, …»).
function lugarDe(listing, detalle) {
  const direccion = Object.fromEntries((listing.address?.component ?? []).map((c) => [c['@_name'], dato(c['#text'])]));
  const nombre = direccion.city ?? detalle.match(/\bnoches? en ([^,(]+)/)?.[1].trim();
  if (!nombre) return null;
  return {
    nombre,
    region: direccion.region?.replace(/\s+Provincia$/i, '') ?? null,
    pais: direccion.country ?? null,
    lat: numero(listing.latitude),
    lon: numero(listing.longitude),
  };
}

function ofertaDe(listing) {
  const descripciones = (listing.description ?? []).map(texto);
  const principal = descripciones.find((d) => d.includes(' | ')) ?? '';
  const detalle = (descripciones.find((d) => d && d !== principal) ?? '')
    .replace(/\\\*/g, '*')
    .replace(/\s+,/g, ',');
  const etiquetas = etiquetasDe(listing);
  const lugar = lugarDe(listing, detalle);
  const transporte = transporteDe(etiquetas, lugar?.pais);
  const precio = parsearPrecio(texto(listing.price)) || null;

  return crearOferta({
    id: `${ID}:${texto(listing.id)}`,
    fuente: ID,
    tipo: transporte === 'avion' ? 'paquete' : 'escapada',
    titulo: texto(listing.title || listing.name),
    descripcion: recortar(detalle),
    url: urlSinIdioma(texto(listing.url?.[0])),
    imagen: dato(listing.image?.[0]?.url?.[0]),
    precio,
    precioTexto: precio === null ? '' : `desde ${EUROS.format(precio)} € por persona`,
    unidad: precio === null ? null : 'pp',
    noches: nochesDe(detalle, etiquetas),
    regimen: regimenDe(principal, detalle, etiquetas),
    temas: temasDe(etiquetas, listing.type),
    transporte,
    lugar,
    etiquetas: texto(listing.topChollo) === 'Yes' ? [...etiquetas, 'top-chollo'] : etiquetas,
    publicada: fechaIso(listing.pubDate),
    caduca: fechaIso(listing.endDate),
  });
}

/**
 * Interpreta el feed XML de BuscoUnChollo. Descarta (y registra) las ofertas
 * que no cumplen el contrato y lanza un error si la respuesta no es el feed.
 * @param {string} xml
 * @param {{log: (mensaje: string) => void}} ctx
 * @returns {import('../modelo.js').Oferta[]}
 */
export function parsear(xml, ctx) {
  const documento = parsearXml(xml, { arrays: LISTAS });
  if (documento.listings === undefined) {
    throw new Error('La respuesta no es el feed de ofertas de BuscoUnChollo (falta <listings>)');
  }
  const ofertas = [];
  for (const listing of documento.listings.listing ?? []) {
    try {
      ofertas.push(ofertaDe(listing));
    } catch (error) {
      ctx.log(`Oferta ${texto(listing.id) || '(sin id)'} descartada: ${error.message}`);
    }
  }
  return ofertas;
}

export default {
  id: ID,
  nombre: 'BuscoUnChollo',
  web: WEB,
  modo: 'feed',
  requiere: [],
  urls: [URL_FEED],
  async obtener(ctx) {
    const ofertas = parsear(await ctx.http.texto(URL_FEED), ctx);
    if (!ofertas.length) throw new Error('El feed de BuscoUnChollo no trae ninguna oferta válida');
    return { ofertas, reemplazar: true };
  },
};
