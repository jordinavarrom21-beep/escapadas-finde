/**
 * Modelo común «Oferta» y catálogos compartidos por backend, emails y panel.
 * Ver docs/CONTRATOS.md para el significado de cada campo.
 */

export const TEMAS = [
  { id: 'spa', nombre: 'Relax y spa', emoji: '🧖' },
  { id: 'romantico', nombre: 'Romántico', emoji: '💑' },
  { id: 'rural', nombre: 'Rural y naturaleza', emoji: '🌲' },
  { id: 'playa', nombre: 'Playa', emoji: '🏖️' },
  { id: 'gastronomia', nombre: 'Gastronomía y vino', emoji: '🍷' },
  { id: 'familia', nombre: 'Familia y niños', emoji: '👨‍👩‍👧' },
  { id: 'ciudad', nombre: 'Ciudad y cultura', emoji: '🏛️' },
  { id: 'aventura', nombre: 'Aventura y nieve', emoji: '🧗' },
  { id: 'parques', nombre: 'Parques temáticos', emoji: '🎢' },
  { id: 'eventos', nombre: 'Eventos y Navidad', emoji: '🎄' },
  { id: 'mascotas', nombre: 'Mascotas', emoji: '🐾' },
  { id: 'singular', nombre: 'Alojamientos singulares', emoji: '✨' },
];

export const TIPOS = ['vuelo', 'escapada', 'hotel', 'paquete'];
/** pp = por persona · pp/noche = por persona y noche · i/v = ida y vuelta por persona. */
export const UNIDADES = ['pp', 'pp/noche', 'total', 'i/v', 'noche'];
export const REGIMENES = ['solo-alojamiento', 'desayuno', 'media-pension', 'pension-completa', 'todo-incluido'];
export const TRANSPORTES = ['avion', 'coche', 'tren', 'ferry'];

const IDS_TEMAS = new Set(TEMAS.map((t) => t.id));

const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);
const esFechaIso = (valor) => typeof valor === 'string' && !Number.isNaN(Date.parse(valor));

/** Lista de problemas de una oferta (vacía si es válida). */
export function validarOferta(o) {
  const errores = [];
  if (typeof o.fuente !== 'string' || !o.fuente) errores.push('falta fuente');
  if (typeof o.id !== 'string' || !o.id.startsWith(`${o.fuente}:`)) errores.push('id debe empezar por «fuente:»');
  if (typeof o.titulo !== 'string' || !o.titulo.trim()) errores.push('falta título');
  if (typeof o.url !== 'string' || !/^https?:\/\//.test(o.url)) errores.push(`url no válida: ${o.url}`);
  if (!TIPOS.includes(o.tipo)) errores.push(`tipo no válido: ${o.tipo}`);
  if (o.precio !== null && !(esNumero(o.precio) && o.precio >= 0)) errores.push(`precio no válido: ${o.precio}`);
  if (o.unidad !== null && !UNIDADES.includes(o.unidad)) errores.push(`unidad no válida: ${o.unidad}`);
  if (o.regimen !== null && !REGIMENES.includes(o.regimen)) errores.push(`régimen no válido: ${o.regimen}`);
  if (o.transporte !== null && !TRANSPORTES.includes(o.transporte)) errores.push(`transporte no válido: ${o.transporte}`);
  if (!Array.isArray(o.temas) || o.temas.some((t) => !IDS_TEMAS.has(t))) errores.push(`temas no válidos: ${o.temas}`);
  if (o.lugar && ((o.lugar.lat != null && !esNumero(o.lugar.lat)) || (o.lugar.lon != null && !esNumero(o.lugar.lon)))) {
    errores.push('coordenadas no válidas');
  }
  for (const campo of ['publicada', 'caduca']) {
    if (o[campo] !== null && !esFechaIso(o[campo])) errores.push(`${campo} no es una fecha ISO`);
  }
  return errores;
}

/**
 * Crea una oferta completa a partir de los campos que conoce la fuente.
 * Lanza TypeError si el resultado no cumple el contrato.
 * @param {Partial<import('./modelo.js').Oferta>} datos
 */
export function crearOferta(datos) {
  const oferta = {
    id: null,
    fuente: null,
    tipo: 'escapada',
    titulo: '',
    descripcion: '',
    url: '',
    imagen: null,
    precio: null,
    precioTexto: '',
    unidad: null,
    precioAnterior: null,
    descuento: null,
    noches: null,
    regimen: null,
    temas: [],
    transporte: null,
    lugar: null,
    cocheMin: null,
    cocheKm: null,
    cocheEstimado: false,
    vuelo: null,
    etiquetas: [],
    publicada: null,
    caduca: null,
    vistaPrimera: null,
    vistaUltima: null,
    bajada: null,
    minimoHistorico: false,
    puntuacion: 0,
    chollazo: false,
    enlaces: [],
    ...datos,
    fechas: { salida: null, vuelta: null, findeId: null, puenteId: null, ...datos.fechas },
  };
  oferta.temas = [...new Set(oferta.temas)];
  const errores = validarOferta(oferta);
  if (errores.length) throw new TypeError(`Oferta ${oferta.id ?? '(sin id)'} no válida: ${errores.join('; ')}`);
  return oferta;
}

/**
 * @typedef {Object} Oferta
 * @property {string} id
 * @property {string} fuente
 * @property {'vuelo'|'escapada'|'hotel'|'paquete'} tipo
 * @property {string} titulo
 * @property {string} descripcion
 * @property {string} url
 * @property {string|null} imagen
 * @property {number|null} precio
 * @property {string} precioTexto
 * @property {string|null} unidad
 * @property {number|null} precioAnterior
 * @property {number|null} descuento
 * @property {number|null} noches
 * @property {string|null} regimen
 * @property {string[]} temas
 * @property {string|null} transporte
 * @property {{nombre: string, region?: string|null, pais?: string|null, codigoPais?: string|null, lat?: number|null, lon?: number|null, iata?: string|null}|null} lugar
 * @property {number|null} cocheMin
 * @property {number|null} cocheKm
 * @property {boolean} cocheEstimado
 * @property {{salida: string|null, vuelta: string|null, findeId: string|null, puenteId: string|null}} fechas
 * @property {Object|null} vuelo
 * @property {string[]} etiquetas
 * @property {string|null} publicada
 * @property {string|null} caduca
 * @property {string|null} vistaPrimera
 * @property {string|null} vistaUltima
 * @property {number|null} bajada
 * @property {boolean} minimoHistorico
 * @property {number} puntuacion
 * @property {boolean} chollazo
 * @property {{etiqueta: string, url: string}[]} enlaces
 */
