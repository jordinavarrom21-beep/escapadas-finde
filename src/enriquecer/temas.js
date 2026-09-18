/**
 * Clasificador por reglas (sin red): temáticas, régimen, noches y transporte a
 * partir del título, la descripción, las etiquetas y el lugar de la oferta.
 */
import { normalizarTexto } from '../util/xml.js';

/** Palabras clave por tema, sin tildes. Admiten sintaxis de expresión regular (\w*). */
export const REGLAS_TEMAS = {
  spa: ['spa', 'balneario\\w*', 'wellness', 'termal\\w*', 'jacuzzi', 'hidromasaje', 'circuito de aguas', 'masajes?', 'relax'],
  romantico: ['romantic\\w*', 'parejas?', 'solo adultos', 'solo para adultos', 'adults only', 'lovebox', 'san valentin', 'luna de miel'],
  rural: ['rural\\w*', 'montana\\w*', 'pirineo\\w*', 'naturaleza', 'bosques?', 'parque natural', 'valles?', 'masia', 'sierra', 'hiking'],
  playa: ['playas?', 'costa', 'calas?', 'primera linea', 'islas?', 'beach', 'mar', 'mediterraneo', 'caribe'],
  gastronomia: ['gastronom\\w*', 'enoturismo', 'bodegas?', 'vinos?', 'cata', 'catas', 'michelin', 'menu degustacion', 'wine', 'foodie'],
  familia: ['ninos?', 'familias?', 'familiar\\w*', 'parque acuatico', 'toboganes', 'infantil', 'kids', 'family', 'miniclub'],
  ciudad: ['ciudad', 'cultural', 'cultura', 'museos?', 'city', 'urbana', 'capital'],
  aventura: ['aventura', 'multiaventura', 'esqui', 'ski', 'nieve', 'senderismo', 'rafting', 'kayak', 'barranquismo', 'escalada', 'forfait', 'surf', 'buceo', 'trekking'],
  parques: ['portaventura', 'port aventura', 'parques? tematicos?', 'warner', 'disney\\w*', 'ferrari land', 'isla magica', 'terra mitica', 'parque de atracciones'],
  eventos: ['navidad', 'navidenos?', 'navidenas?', 'fin de ano', 'nochevieja', 'halloween', 'conciertos?', 'festival\\w*', 'carnaval', 'semana santa', 'reyes magos'],
  mascotas: ['mascotas?', 'perros?', 'pet friendly', 'petfriendly', 'dog friendly', 'admite animales'],
  singular: ['cabanas?', 'arbol', 'arboles', 'glamping', 'cuevas?', 'castillos?', 'burbujas?', 'iglus?', 'faro', 'tipi', 'yurta', 'insolito', 'singular\\w*'],
};

// Destinos de vuelo con temática implícita.
const CIUDADES = [
  'roma', 'paris', 'londres', 'lisboa', 'oporto', 'berlin', 'praga', 'viena', 'budapest', 'amsterdam', 'bruselas',
  'milan', 'venecia', 'florencia', 'napoles', 'bolonia', 'turin', 'pisa', 'bergamo', 'bari', 'dublin', 'edimburgo',
  'copenhague', 'estocolmo', 'oslo', 'cracovia', 'varsovia', 'atenas', 'estambul', 'marrakech', 'sevilla', 'madrid',
  'bilbao', 'valencia', 'granada', 'malaga', 'zaragoza', 'santiago', 'burdeos', 'marsella', 'lyon', 'ginebra',
  'zurich', 'munich', 'colonia', 'hamburgo', 'manchester', 'liverpool', 'riga', 'vilna', 'tallin', 'luxemburgo',
  'nueva york', 'new york', 'edinburgh',
];
const DESTINOS_SOL = [
  'palma', 'mallorca', 'ibiza', 'menorca', 'formentera', 'tenerife', 'gran canaria', 'lanzarote', 'fuerteventura',
  'canarias', 'algarve', 'faro', 'malta', 'cerdena', 'cagliari', 'alghero', 'olbia', 'sicilia', 'catania', 'palermo',
  'chipre', 'pafos', 'larnaca', 'grecia', 'corfu', 'creta', 'heraklion', 'rodas', 'santorini', 'mykonos', 'agadir',
];

const REGIMENES = [
  ['todo-incluido', /\btodo incluido\b|\ball inclusive\b/],
  ['pension-completa', /\bpension completa\b|\bfull board\b/],
  ['media-pension', /\bmedia pension\b|\bhalf board\b/],
  ['desayuno', /\b(alojamiento y )?desayuno\b|\bbreakfast\b|\bb&b\b/],
  ['solo-alojamiento', /\bsolo alojamiento\b|\broom only\b/],
];

const PAISES_EN_COCHE = ['espana', 'andorra', 'francia', 'portugal'];

const palabras = (lista) => new RegExp(`\\b(?:${lista.join('|')})\\b`);
const PATRONES_TEMAS = Object.entries(REGLAS_TEMAS).map(([tema, lista]) => [tema, palabras(lista)]);
const PATRON_CIUDADES = palabras(CIUDADES);
const PATRON_SOL = palabras(DESTINOS_SOL);

/** Temas que solo cuentan si aparecen en el título o la descripción: en las etiquetas suelen ser fechas de disponibilidad («Navidad»). */
const TEMAS_SOLO_TEXTO = new Set(['eventos']);

function textoDe(oferta) {
  const { titulo, descripcion, etiquetas = [], lugar } = oferta;
  return normalizarTexto([titulo, descripcion, ...etiquetas, lugar?.nombre, lugar?.region].filter(Boolean).join(' · '));
}

function detectarTemas(texto, oferta) {
  const principal = normalizarTexto(`${oferta.titulo} · ${oferta.descripcion}`);
  const temas = PATRONES_TEMAS
    .filter(([tema, patron]) => patron.test(TEMAS_SOLO_TEXTO.has(tema) ? principal : texto))
    .map(([tema]) => tema);
  if (oferta.tipo === 'vuelo') {
    const destino = normalizarTexto(`${oferta.titulo} ${oferta.lugar?.nombre ?? ''}`);
    if (PATRON_CIUDADES.test(destino)) temas.push('ciudad');
    if (PATRON_SOL.test(destino)) temas.push('playa');
  }
  return [...new Set(temas)];
}

function detectarNoches(texto) {
  const noches = texto.match(/\b(\d{1,2})\s*(?:noches?|nights?)\b/);
  if (noches) return Number(noches[1]);
  const dias = texto.match(/\b(\d{1,2})\s*(?:dias|days)\b/);
  if (dias && Number(dias[1]) > 1) return Number(dias[1]) - 1;
  return /\b(fin de semana|finde|weekend)\b/.test(texto) ? 2 : null;
}

function detectarTransporte(texto, oferta) {
  if (oferta.tipo === 'vuelo') return 'avion';
  if (/\b(vuelos? incluidos?|con vuelos?|vuelo \+ hotel|vuelo y hotel|flights? (from|\+)|avion incluido)\b/.test(texto)) return 'avion';
  if (/\b(ferry|en barco)\b/.test(texto)) return 'ferry';
  if (/\b(tren|ave|avlo|renfe|ouigo|iryo)\b/.test(texto)) return 'tren';
  const pais = normalizarTexto(oferta.lugar?.pais ?? '');
  const esIsla = /\b(islas?|baleares|canarias|mallorca|menorca|ibiza|tenerife)\b/.test(texto);
  return PAISES_EN_COCHE.some((p) => pais.includes(p)) && !esIsla ? 'coche' : null;
}

/**
 * Lo que el texto de la oferta dice sobre temas, régimen, noches y transporte.
 * No modifica la oferta.
 */
export function clasificar(oferta) {
  const texto = textoDe(oferta);
  return {
    temas: detectarTemas(texto, oferta),
    regimen: REGIMENES.find(([, patron]) => patron.test(texto))?.[0] ?? null,
    noches: oferta.tipo === 'vuelo' ? null : detectarNoches(texto),
    transporte: detectarTransporte(texto, oferta),
  };
}

/** Une los temas detectados y rellena régimen, noches y transporte solo si la fuente no los dio. */
export function aplicarClasificacion(oferta) {
  const detectado = clasificar(oferta);
  oferta.temas = [...new Set([...oferta.temas, ...detectado.temas])];
  oferta.regimen ??= detectado.regimen;
  oferta.noches ??= detectado.noches;
  oferta.transporte ??= detectado.transporte;
  return oferta;
}
