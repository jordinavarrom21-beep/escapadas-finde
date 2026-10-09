/**
 * Clasificador por reglas (sin red): temáticas, régimen, noches y transporte a partir del
 * título y la descripción de la oferta (el régimen también de sus etiquetas; el transporte,
 * también del lugar).
 */
import { normalizarTexto } from '../util/xml.js';

/** Palabras clave por tema, sin tildes. Admiten sintaxis de expresión regular (\w*). */
export const REGLAS_TEMAS = {
  // Spa de verdad: «relax», «masajes» o un jacuzzi en la habitación no son un spa.
  spa: ['spa', 'balneario\\w*', 'wellness', 'termal\\w*', 'termas', 'circuito (?:de aguas|termal|hidrotermal|spa)', 'talasoterapia', 'caldea'],
  romantico: ['romantic\\w*', 'parejas?', 'solo adultos', 'solo para adultos', 'adults only', 'lovebox', 'san valentin', 'luna de miel'],
  rural: ['rural\\w*', 'montana\\w*', 'pirineo\\w*', 'naturaleza', 'bosques?', 'parque natural', 'valles?', 'masia', 'sierra', 'hiking'],
  // «Isla Mágica» es un parque de Sevilla, no una isla.
  playa: ['playas?', 'costa', 'calas?', 'primera linea', 'islas?(?! magica)', 'beach', 'mar', 'mediterraneo', 'caribe'],
  gastronomia: ['gastronom\\w*', 'enoturismo', 'bodegas?', 'vinos?', 'cata', 'catas', 'michelin', 'menu degustacion', 'wine', 'foodie'],
  // «Sagrada Familia» es un templo y «bodegas familiares», un negocio: no son planes con niños.
  familia: [
    'ninos?', 'ninas?', 'en familia', '(?<!sagrada )familias', 'para (?:toda )?la familia', 'parque acuatico', 'toboganes',
    'infantil\\w*', 'kids', 'family', 'mini ?club',
    '(?:escapada|viajes?|plan|vacaciones|habitacion(?:es)?|doble|suite|grupos?|ocio|ambiente|parque|actividad(?:es)?) familiar(?:es)?',
  ],
  ciudad: ['ciudad', 'cultural', 'cultura', 'museos?', 'city', 'urbana', 'capital'],
  aventura: ['aventura', 'multiaventura', 'esqui', 'ski', 'nieve', 'senderismo', 'rafting', 'kayak', 'barranquismo', 'escalada', 'forfait', 'surf', 'buceo', 'trekking'],
  parques: ['portaventura', 'port aventura', 'parques? tematicos?', 'warner', 'disney\\w*', 'ferrari land', 'isla magica', 'terra mitica', 'parque de atracciones'],
  eventos: ['navidad', 'navidenos?', 'navidenas?', 'fin de ano', 'nochevieja', 'halloween', 'conciertos?', 'festival\\w*', 'carnaval', 'semana santa', 'reyes magos'],
  mascotas: ['mascotas?', 'perros?', 'pet friendly', 'petfriendly', 'dog friendly', 'admite animales'],
  // Dormir en un árbol o en un castillo, no «árboles centenarios» o «a los pies del castillo».
  singular: [
    'cabanas?', '(?:casas?|cabanas?|dormir|noche) (?:en|de|del) (?:el |un |los |unos )?arbol(?:es)?', 'glamping', 'cuevas?',
    '(?:hotel|dormir en un|noche en un|alojamiento en un) castillo', 'castillo hotel', 'burbujas?', 'iglus?', 'faro', 'tipi',
    'yurta', 'insolito', 'singular\\w*',
  ],
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

function textoDe(oferta) {
  const { titulo, descripcion, etiquetas = [], lugar } = oferta;
  return normalizarTexto([titulo, descripcion, ...etiquetas, lugar?.nombre, lugar?.region].filter(Boolean).join(' · '));
}

/** «No se admiten niños ni mascotas», «sin perros»: lo que se niega no es un tema. */
const NEGACIONES = /\b(?:no|sin)\s+(?:se\s+)?(?:admite[ns]?|acepta[ns]?|permite[ns]?)?\s*(?:ninos?|mascotas?|perros?|animales)(?:\s*(?:,|ni|y|o)\s*(?:ninos?|mascotas?|perros?|animales))*\b/g;
const SOLO_ADULTOS = /\b(?:solo (?:para )?adultos|adults only)\b/;

/**
 * Los temas salen solo del título y la descripción. Las etiquetas de muchas webs son su menú
 * de navegación («Spa», «Mascotas», «Románticos», «Navidad»…) o fechas de disponibilidad, y el
 * nombre de la zona no dice qué es la oferta: con ellos, un hotel de Andorra con «solo
 * alojamiento + parking + miniclub» salía con spa, mascotas y romántico.
 */
function detectarTemas(oferta) {
  const principal = normalizarTexto(`${oferta.titulo} · ${oferta.descripcion}`).replace(NEGACIONES, ' ');
  const temas = PATRONES_TEMAS
    .filter(([, patron]) => patron.test(principal))
    .map(([tema]) => tema)
    // Un sitio solo para adultos no es un plan con niños.
    .filter((tema) => tema !== 'familia' || !SOLO_ADULTOS.test(principal));
  if (oferta.tipo === 'vuelo') {
    const destino = normalizarTexto(`${oferta.titulo} ${oferta.lugar?.nombre ?? ''}`);
    if (PATRON_CIUDADES.test(destino)) temas.push('ciudad');
    if (PATRON_SOL.test(destino)) temas.push('playa');
  }
  return [...new Set(temas)];
}

/**
 * Noches de la estancia según el título y la descripción (no las etiquetas: algunas
 * fuentes ponen a la vez todas sus categorías, «1-2 noches» y «3 a 6 noches»). Un rango
 * no es un número de noches, y «5 días a la semana» es una frecuencia, no una estancia.
 */
function detectarNoches(texto) {
  if (/\b\d{1,2}\s*(?:-|a|o)\s*\d{1,2}\s*(?:noches?|nights?)\b/.test(texto)) return null;
  const noches = texto.match(/\b(\d{1,2})\s*(?:noches?|nights?)\b/);
  if (noches) return Number(noches[1]);
  const dias = texto.match(/\b(\d{1,2})\s*(?:dias|days)\b(?!\s*(?:a la|por|each|per) (?:semana|week))/);
  if (dias && Number(dias[1]) > 1) return Number(dias[1]) - 1;
  return /\b(fin de semana|finde|weekend)\b/.test(texto) ? 2 : null;
}

/**
 * Cómo se llega. Del título, la descripción y el lugar (no de las etiquetas, que son el menú de
 * la web). Ferry solo si lo dice («ferry», «naviera»): «paseo en barco por el Guadalquivir» es
 * una actividad, no el transporte (salía en «sin coche» como «En ferry»).
 */
function detectarTransporte(oferta) {
  if (oferta.tipo === 'vuelo') return 'avion';
  const texto = normalizarTexto([oferta.titulo, oferta.descripcion, oferta.lugar?.nombre, oferta.lugar?.region].filter(Boolean).join(' · '));
  if (/\b(vuelos? incluidos?|con vuelos?|vuelo \+ hotel|vuelo y hotel|flights? (from|\+)|avion incluido)\b/.test(texto)) return 'avion';
  if (/\b(ferry|ferris|ferries|naviera)\b/.test(texto)) return 'ferry';
  if (/\b(tren|ave|avlo|renfe|ouigo|iryo)\b/.test(texto)) return 'tren';
  if (/\b(autobus|flixbus|alsa)\b/.test(texto)) return 'bus';
  const pais = normalizarTexto(oferta.lugar?.pais ?? '');
  const esIsla = /\b(islas?(?! magica)|baleares|canarias|mallorca|menorca|ibiza|tenerife)\b/.test(texto);
  return PAISES_EN_COCHE.some((p) => pais.includes(p)) && !esIsla ? 'coche' : null;
}

/**
 * Lo que el texto de la oferta dice sobre temas, régimen, noches y transporte.
 * No modifica la oferta.
 */
export function clasificar(oferta) {
  const texto = textoDe(oferta);
  return {
    temas: detectarTemas(oferta),
    regimen: REGIMENES.find(([, patron]) => patron.test(texto))?.[0] ?? null,
    // Un vuelo o una actividad sin alojamiento no tiene noches: «2 días de forfait» no es 1 noche.
    noches: oferta.tipo === 'vuelo' || (oferta.tipo === 'actividad' && !oferta.alojamiento)
      ? null : detectarNoches(normalizarTexto(`${oferta.titulo} · ${oferta.descripcion}`)),
    transporte: detectarTransporte(oferta),
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
