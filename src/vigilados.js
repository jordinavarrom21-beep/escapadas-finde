/**
 * Criterios vigilados (config/vigilados.json): lo que quieres que el vigilante te
 * avise. Una oferta coincide si cumple **todos** los campos presentes del criterio;
 * los que no pongas no filtran nada. Ver docs/CONTRATOS.md.
 */
import { readFileSync } from 'node:fs';
import { distanciaKm } from './enriquecer/geo.js';
import { normalizarTexto } from './util/xml.js';
import { ALOJAMIENTOS, REGIMENES, TEMAS, TIPOS } from './modelo.js';

const IDS_TEMAS = TEMAS.map((t) => t.id);

/** Todo lo que entiende un criterio (`coincidencias` se la añade el panel al publicarlo). */
const CAMPOS = new Set([
  'nombre', 'activo', 'ofertaId', 'texto', 'tipo', 'tema', 'temas', 'fuente', 'aeropuerto',
  'alojamiento', 'regimenMinimo', 'valoracionMin', 'descuentoMin', 'precioMax', 'precioNocheMax',
  'noches', 'cocheMaxMin', 'cerca', 'pais', 'region', 'puente', 'finde', 'soloChollazos',
  'soloMinimoHistorico', 'coincidencias',
]);
const CAMPOS_TEXTO = ['ofertaId', 'texto', 'fuente', 'aeropuerto', 'pais', 'region', 'finde'];
const CAMPOS_NUMERO = ['precioMax', 'precioNocheMax', 'cocheMaxMin', 'valoracionMin', 'descuentoMin'];
const CAMPOS_BOOLEANO = ['activo', 'puente', 'soloChollazos', 'soloMinimoHistorico'];
const CAMPOS_CATALOGO = { tipo: TIPOS, tema: IDS_TEMAS, alojamiento: ALOJAMIENTOS, regimenMinimo: REGIMENES };

/**
 * Lee los criterios y avisa por `log` de los que tengan algo raro, sin descartarlos:
 * un vigilado mal escrito no debe parar el escaneo.
 */
export function cargarVigilados(ruta, log = console.warn) {
  let vigilados;
  try {
    vigilados = JSON.parse(readFileSync(ruta, 'utf8')).vigilados ?? [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const vistos = new Set();
  for (const criterio of vigilados) {
    const nombre = criterio?.nombre ?? '(sin nombre)';
    const problemas = validarVigilado(criterio);
    if (vistos.has(nombre)) problemas.push('el nombre está repetido: los avisos de los dos se mezclarían');
    vistos.add(nombre);
    if (problemas.length) log(`⚠️  Vigilado «${nombre}»: ${problemas.join('; ')}`);
  }
  return vigilados;
}

const tieneCoordenadas = (lugar) => typeof lugar?.lat === 'number' && typeof lugar?.lon === 'number';
const contiene = (donde, buscado) => normalizarTexto(donde ?? '').includes(normalizarTexto(buscado));
const cumpleRegimen = (regimen, minimo) => regimen != null && REGIMENES.indexOf(regimen) >= REGIMENES.indexOf(minimo);
const cumplePais = (lugar, pais) => contiene(lugar?.pais, pais) || normalizarTexto(lugar?.codigoPais ?? '') === normalizarTexto(pais);

/** `noches: 2` son exactamente 2; `noches: {min, max}` es un rango (cualquiera de los dos puede faltar). */
function cumpleNoches(noches, criterio) {
  if (noches == null) return false;
  if (typeof criterio === 'number') return noches === criterio;
  return noches >= (criterio.min ?? 0) && noches <= (criterio.max ?? Infinity);
}

/**
 * @param {import('./modelo.js').Oferta} oferta
 * @param {Criterio} c
 * @returns {boolean} si la oferta cumple todas las condiciones del criterio
 */
export function coincide(oferta, c) {
  if (c.activo === false) return false;
  if (c.ofertaId && oferta.id !== c.ofertaId) return false;
  if (c.tipo && oferta.tipo !== c.tipo) return false;
  if (c.tema && !oferta.temas.includes(c.tema)) return false;
  if (c.temas?.length && !c.temas.some((tema) => oferta.temas.includes(tema))) return false;
  if (c.fuente && oferta.fuente !== c.fuente) return false;
  if (c.aeropuerto && oferta.vuelo?.origen !== c.aeropuerto) return false;
  if (c.alojamiento && oferta.alojamiento !== c.alojamiento) return false;
  if (c.regimenMinimo && !cumpleRegimen(oferta.regimen, c.regimenMinimo)) return false;
  if (c.valoracionMin != null && !(oferta.valoracion?.nota >= c.valoracionMin)) return false;
  if (c.descuentoMin != null && !(oferta.descuento >= c.descuentoMin)) return false;
  if (c.precioMax != null && !(oferta.precio != null && oferta.precio <= c.precioMax)) return false;
  if (c.precioNocheMax != null && !(oferta.precioNoche != null && oferta.precioNoche <= c.precioNocheMax)) return false;
  if (c.noches != null && !cumpleNoches(oferta.noches, c.noches)) return false;
  if (c.cocheMaxMin != null && !(oferta.cocheMin != null && oferta.cocheMin <= c.cocheMaxMin)) return false;
  if (c.pais && !cumplePais(oferta.lugar, c.pais)) return false;
  if (c.region && !contiene(oferta.lugar?.region, c.region)) return false;
  if (c.puente && !oferta.fechas.puenteId) return false;
  if (c.finde && ![oferta.fechas.findeId, oferta.fechas.puenteId].includes(c.finde)) return false;
  if (c.soloChollazos && !oferta.chollazo) return false;
  if (c.soloMinimoHistorico && !oferta.minimoHistorico) return false;
  if (c.cerca && !(tieneCoordenadas(oferta.lugar) && distanciaKm(c.cerca, oferta.lugar) <= c.cerca.radioKm)) return false;
  if (c.texto && !contiene([oferta.titulo, oferta.lugar?.nombre, oferta.lugar?.iata, oferta.vuelo?.destino].join(' '), c.texto)) return false;
  return true;
}

const esNumeroPositivo = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const esCercaValido = (cerca) => ['lat', 'lon', 'radioKm'].every((campo) => typeof cerca?.[campo] === 'number' && Number.isFinite(cerca[campo]));
const esNochesValido = (noches) => esNumeroPositivo(noches)
  || (typeof noches === 'object' && noches !== null && !Array.isArray(noches)
    && ['min', 'max'].some((campo) => noches[campo] != null)
    && ['min', 'max'].every((campo) => noches[campo] == null || esNumeroPositivo(noches[campo])));

/**
 * Problemas legibles de un criterio (lista vacía si está bien). Se usa al cargar la
 * configuración: un campo mal escrito pasaría desapercibido y ese vigilado no
 * avisaría nunca, así que mejor decirlo por el log.
 * @returns {string[]}
 */
export function validarVigilado(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['no es un objeto'];
  const problemas = [];
  if (typeof c.nombre !== 'string' || !c.nombre.trim()) problemas.push('falta «nombre» (es obligatorio y es lo que sale en los avisos)');
  for (const campo of Object.keys(c)) {
    if (!CAMPOS.has(campo)) problemas.push(`campo desconocido: «${campo}»`);
  }
  for (const campo of CAMPOS_TEXTO) {
    if (c[campo] != null && typeof c[campo] !== 'string') problemas.push(`«${campo}» debe ser texto`);
  }
  for (const campo of CAMPOS_NUMERO) {
    if (c[campo] != null && !esNumeroPositivo(c[campo])) problemas.push(`«${campo}» debe ser un número positivo`);
  }
  for (const campo of CAMPOS_BOOLEANO) {
    if (c[campo] != null && typeof c[campo] !== 'boolean') problemas.push(`«${campo}» debe ser true o false`);
  }
  for (const [campo, validos] of Object.entries(CAMPOS_CATALOGO)) {
    if (c[campo] != null && !validos.includes(c[campo])) problemas.push(`«${campo}» debe ser uno de: ${validos.join(', ')}`);
  }
  if (c.temas != null) {
    if (!Array.isArray(c.temas)) problemas.push('«temas» debe ser una lista, p. ej. ["spa", "rural"]');
    else {
      const desconocidos = c.temas.filter((tema) => !IDS_TEMAS.includes(tema));
      if (desconocidos.length) problemas.push(`temas desconocidos: ${desconocidos.join(', ')}`);
    }
  }
  if (c.valoracionMin > 10) problemas.push('«valoracionMin» va de 0 a 10');
  if (c.descuentoMin > 100) problemas.push('«descuentoMin» es un porcentaje de 0 a 100');
  if (c.noches != null && !esNochesValido(c.noches)) problemas.push('«noches» debe ser un número o {min, max}');
  if (c.cerca != null && !esCercaValido(c.cerca)) problemas.push('«cerca» debe ser {lat, lon, radioKm} con números');
  return problemas;
}

/** Los criterios en marcha: `activo: false` pausa un vigilado sin borrarlo. */
export const vigiladosActivos = (vigilados = []) => vigilados.filter((c) => c.activo !== false);

/** La más barata; a igualdad de precio, la de más puntuación. Las que no tienen precio, al final. */
export const mejorOferta = (ofertas) => [...ofertas]
  .sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity) || b.puntuacion - a.puntuacion)[0] ?? null;

/**
 * Qué cumple ahora mismo cada vigilado activo: lo usan el resumen del viernes y
 * cualquiera que quiera pintar su estado sin repetir el filtrado.
 * @returns {{criterio: Criterio, ofertas: Oferta[], total: number, mejor: Oferta|null, precioMin: number|null}[]}
 */
export function resumenVigilados(ofertas, vigilados = []) {
  return vigiladosActivos(vigilados).map((criterio) => {
    const coincidencias = ofertas.filter((oferta) => coincide(oferta, criterio));
    const precios = coincidencias.map((o) => o.precio).filter((precio) => precio != null);
    return {
      criterio,
      ofertas: coincidencias,
      total: coincidencias.length,
      mejor: mejorOferta(coincidencias),
      precioMin: precios.length ? Math.min(...precios) : null,
    };
  });
}

/**
 * @typedef {Object} Criterio
 * @property {string} nombre
 * @property {boolean} [activo] por defecto true; con false se pausa (ni compara ni avisa)
 * @property {string} [ofertaId] vigilar una oferta concreta por su id
 * @property {string} [texto] en título, lugar, código IATA y destino del vuelo
 * @property {string} [tipo] vuelo | escapada | hotel | paquete
 * @property {string} [tema] un tema obligatorio
 * @property {string[]} [temas] basta con que tenga uno de ellos
 * @property {string} [fuente]
 * @property {string} [aeropuerto] aeropuerto de salida del vuelo
 * @property {string} [alojamiento] hotel | casa-rural | camping | apartamento | parador | balneario | hostal
 * @property {string} [regimenMinimo] ese régimen o mejor
 * @property {number} [valoracionMin] nota mínima (0–10)
 * @property {number} [descuentoMin] porcentaje de descuento mínimo
 * @property {number} [precioMax] precio objetivo
 * @property {number} [precioNocheMax] precio máximo por persona y noche
 * @property {number|{min?: number, max?: number}} [noches]
 * @property {number} [cocheMaxMin] minutos en coche desde casa como mucho
 * @property {{lat: number, lon: number, radioKm: number}} [cerca]
 * @property {string} [pais] nombre o código del país
 * @property {string} [region]
 * @property {boolean} [puente] solo ofertas que caen en un puente
 * @property {string} [finde] id de un finde o de un puente concreto
 * @property {boolean} [soloChollazos]
 * @property {boolean} [soloMinimoHistorico]
 */
