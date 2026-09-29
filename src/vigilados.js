/**
 * Criterios vigilados (config/vigilados.json): lo que quieres que el vigilante te
 * avise. Una oferta coincide si cumple **todos** los campos presentes del criterio;
 * los que no pongas no filtran nada. Ver docs/CONTRATOS.md.
 */
import { readFileSync } from 'node:fs';
import { distanciaKm } from './enriquecer/geo.js';
import { normalizarTexto } from './util/xml.js';
import { ALOJAMIENTOS, REGIMENES, TEMAS, TIPOS } from './modelo.js';
import { fechaLocal } from './util/fechas.js';
// El mismo cálculo del coste del viaje que el panel (sin DOM: se puede usar desde Node).
import { costeViaje } from '../site/js/coste.js';

const IDS_TEMAS = TEMAS.map((t) => t.id);

/** Todo lo que entiende un criterio (`coincidencias` se la añade el panel al publicarlo). */
const CAMPOS = new Set([
  'nombre', 'activo', 'ofertaId', 'texto', 'tipo', 'tema', 'temas', 'fuente', 'aeropuerto',
  'alojamiento', 'regimenMinimo', 'valoracionMin', 'descuentoMin', 'precioMax', 'precioNocheMax',
  'noches', 'cocheMaxMin', 'cerca', 'pais', 'region', 'puente', 'finde', 'soloChollazos',
  'soloMinimoHistorico', 'desde', 'hasta', 'presupuestoMax', 'presupuestoPor', 'viajeros', 'coincidencias',
]);
const CAMPOS_TEXTO = ['ofertaId', 'texto', 'fuente', 'aeropuerto', 'pais', 'region', 'finde'];
const CAMPOS_NUMERO = ['precioMax', 'precioNocheMax', 'cocheMaxMin', 'valoracionMin', 'descuentoMin', 'presupuestoMax', 'viajeros'];
const esDia = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
const CAMPOS_BOOLEANO = ['activo', 'puente', 'soloChollazos', 'soloMinimoHistorico'];
const CAMPOS_CATALOGO = { tipo: TIPOS, tema: IDS_TEMAS, alojamiento: ALOJAMIENTOS, regimenMinimo: REGIMENES };

/**
 * Lee los criterios y avisa por `log` de los que tengan algo raro. Un vigilado mal
 * escrito no debe parar el escaneo: con el JSON roto o sin lista se sigue sin vigilados,
 * y lo que no es un objeto se descarta; el resto se conserva aunque tenga avisos.
 */
export function cargarVigilados(ruta, log = console.warn) {
  let contenido;
  try {
    contenido = JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    log(`⚠️  ${ruta} no se puede leer (${error.message}): esta vez sin vigilados`);
    return [];
  }
  const lista = contenido?.vigilados ?? [];
  if (!Array.isArray(lista)) {
    log(`⚠️  ${ruta}: «vigilados» debe ser una lista [ … ]: esta vez sin vigilados`);
    return [];
  }
  const vigilados = lista.filter((criterio) => criterio && typeof criterio === 'object' && !Array.isArray(criterio));
  if (vigilados.length < lista.length) log(`⚠️  ${ruta}: ${lista.length - vigilados.length} elementos de «vigilados» no son un criterio {…} y se ignoran`);
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
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, (caracter) => `\\${caracter}`);
/** Palabras completas: «reus» no es «Santes Creus» ni «sort» un «resort». */
const contienePalabras = (donde, buscado) => {
  const aguja = normalizarTexto(String(buscado)).trim();
  return new RegExp(`(^|[^a-z0-9])${escaparRegex(aguja)}($|[^a-z0-9])`).test(normalizarTexto(donde ?? ''));
};
const cumpleRegimen = (regimen, minimo) => regimen != null && REGIMENES.indexOf(regimen) >= REGIMENES.indexOf(minimo);

/** Nombre del país (sin tildes) → código ISO, para las webs que no dan el código. */
const CODIGOS_PAIS = {
  espana: 'ES', portugal: 'PT', francia: 'FR', italia: 'IT', andorra: 'AD', alemania: 'DE', 'reino unido': 'GB',
  irlanda: 'IE', 'paises bajos': 'NL', holanda: 'NL', belgica: 'BE', suiza: 'CH', austria: 'AT', grecia: 'GR',
  marruecos: 'MA', 'republica checa': 'CZ', chequia: 'CZ', hungria: 'HU', polonia: 'PL', croacia: 'HR', malta: 'MT',
  egipto: 'EG', turquia: 'TR', 'estados unidos': 'US', noruega: 'NO', suecia: 'SE', dinamarca: 'DK', islandia: 'IS',
  rumania: 'RO', bulgaria: 'BG', tunez: 'TN', chipre: 'CY', albania: 'AL', montenegro: 'ME', eslovenia: 'SI',
  eslovaquia: 'SK', finlandia: 'FI', letonia: 'LV', lituania: 'LT', estonia: 'EE', luxemburgo: 'LU', mexico: 'MX',
  cuba: 'CU', 'republica dominicana': 'DO', tailandia: 'TH', japon: 'JP', vietnam: 'VN', 'corea del sur': 'KR',
};
/**
 * Un código de dos letras se compara con el código (antes «MA» casaba con «Alemania»
 * por subcadena); un nombre, por igualdad.
 */
function cumplePais(lugar, pais) {
  const buscado = normalizarTexto(pais).trim();
  const nombre = normalizarTexto(lugar?.pais ?? '').trim();
  if (/^[a-z]{2}$/.test(buscado)) return (lugar?.codigoPais ?? CODIGOS_PAIS[nombre] ?? '').toLowerCase() === buscado;
  return nombre === buscado;
}

/** `noches: 2` son exactamente 2; `noches: {min, max}` es un rango (cualquiera de los dos puede faltar). */
function cumpleNoches(noches, criterio) {
  if (noches == null) return false;
  if (typeof criterio === 'number') return noches === criterio;
  return noches >= (criterio.min ?? 0) && noches <= (criterio.max ?? Infinity);
}

/**
 * Fechas «desde»/«hasta» (AAAA-MM-DD): con fechas, el viaje las solapa; sin fechas
 * (flexible), la promoción no ha caducado antes de «desde».
 */
function cumpleFechas(oferta, { desde, hasta }) {
  const salida = oferta.fechas.salida?.slice(0, 10);
  if (!salida) return !desde || !oferta.caduca || fechaLocal(new Date(oferta.caduca)) >= desde;
  const vuelta = (oferta.fechas.vuelta ?? oferta.fechas.salida).slice(0, 10);
  return (!desde || vuelta >= desde) && (!hasta || salida <= hasta);
}

/**
 * Coste del viaje completo con el mismo cálculo que el panel (site/js/coste.js), desde el
 * origen del escaneo: la gasolina, la que ya calculó geo.js. null si no se puede saber.
 */
export function costeDesdeOrigen(oferta, viajeros = 2) {
  const { eur, litros } = oferta.costeCoche ?? {};
  const coche = eur > 0 && litros > 0 && oferta.cocheKm > 0
    ? { consumoL100km: (litros * 100) / (2 * oferta.cocheKm), precioLitro: eur / litros }
    : null;
  const distancia = oferta.cocheKm > 0 ? { km: oferta.cocheKm, kmCoche: oferta.cocheKm, minutos: oferta.cocheMin } : null;
  return costeViaje(oferta, { viajeros, noches: 2, distancia, coche });
}

function cumplePresupuesto(oferta, c) {
  const coste = costeDesdeOrigen(oferta, c.viajeros ?? 2);
  const valor = c.presupuestoPor === 'persona' ? coste.porPersona : coste.total;
  return valor != null && valor <= c.presupuestoMax;
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
  if (Array.isArray(c.temas) && c.temas.length && !c.temas.some((tema) => oferta.temas.includes(tema))) return false;
  if (c.fuente && oferta.fuente !== String(c.fuente).toLowerCase()) return false;
  // Casi ninguna web publica el aeropuerto de salida: solo descarta los vuelos que lo dicen
  // y es otro. Antes exigía conocerlo y el vigilado no coincidía nunca con nada.
  if (c.aeropuerto && oferta.vuelo?.origen && oferta.vuelo.origen !== String(c.aeropuerto).toUpperCase()) return false;
  if (c.alojamiento && oferta.alojamiento !== c.alojamiento) return false;
  if (c.regimenMinimo && !cumpleRegimen(oferta.regimen, c.regimenMinimo)) return false;
  if (c.valoracionMin != null && !(oferta.valoracion?.nota >= c.valoracionMin)) return false;
  if (c.descuentoMin != null && !(oferta.descuento >= c.descuentoMin)) return false;
  if (c.precioMax != null && !(oferta.precio != null && oferta.precio <= c.precioMax)) return false;
  if (c.precioNocheMax != null && !(oferta.precioNoche != null && oferta.precioNoche <= c.precioNocheMax)) return false;
  if (c.noches != null && !cumpleNoches(oferta.noches, c.noches)) return false;
  if (c.cocheMaxMin != null && !(oferta.cocheMin != null && oferta.cocheMin <= c.cocheMaxMin)) return false;
  if (c.pais && !cumplePais(oferta.lugar, c.pais)) return false;
  // La región puede ser la que dice la web, la provincia o la comunidad («Girona» o «Cataluña»).
  if (c.region && ![oferta.lugar?.region, oferta.lugar?.provincia, oferta.lugar?.comunidad].some((zona) => contiene(zona, c.region))) return false;
  if (c.puente && !oferta.fechas.puenteId) return false;
  // Los ids de finde y de puente son su fecha; se acepta el «puente-…» que documentaba el leeme.
  if (c.finde && ![oferta.fechas.findeId, oferta.fechas.puenteId].includes(String(c.finde).replace(/^puente-/, ''))) return false;
  if (c.soloChollazos && !oferta.chollazo) return false;
  if (c.soloMinimoHistorico && !oferta.minimoHistorico) return false;
  if ((c.desde || c.hasta) && !cumpleFechas(oferta, c)) return false;
  if (c.presupuestoMax != null && !cumplePresupuesto(oferta, c)) return false;
  if (c.cerca && !(tieneCoordenadas(oferta.lugar) && distanciaKm(c.cerca, oferta.lugar) <= c.cerca.radioKm)) return false;
  if (c.texto && !contienePalabras([oferta.titulo, oferta.lugar?.nombre, oferta.lugar?.iata, oferta.vuelo?.destino].join(' '), c.texto)) return false;
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
  else if (c.nombre.includes('|')) problemas.push('«nombre» no puede llevar «|» (se usa para separar el nombre del id de la oferta)');
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
  else if (c.noches?.min != null && c.noches?.max != null && c.noches.min > c.noches.max) problemas.push('«noches»: min es mayor que max y no coincidiría con nada');
  if (c.cerca != null && !esCercaValido(c.cerca)) problemas.push('«cerca» debe ser {lat, lon, radioKm} con números');
  else if (c.cerca && (c.cerca.radioKm <= 0 || Math.abs(c.cerca.lat) > 90 || Math.abs(c.cerca.lon) > 180)) problemas.push('«cerca»: radioKm debe ser mayor que 0 y lat/lon estar en rango');
  if (typeof c.aeropuerto === 'string' && !/^[a-z]{3}$/i.test(c.aeropuerto)) problemas.push('«aeropuerto» es un código IATA de 3 letras, como «BCN»');
  if (typeof c.aeropuerto === 'string') problemas.push('aviso: «aeropuerto» solo descarta vuelos cuyo origen se conoce, y hoy casi ninguna web lo publica');
  if (typeof c.finde === 'string' && !/^(puente-)?\d{4}-\d{2}-\d{2}$/.test(c.finde)) problemas.push('«finde» es la fecha de un finde o de un puente, como «2026-12-05»');
  for (const campo of ['desde', 'hasta']) {
    if (c[campo] != null && !esDia(c[campo])) problemas.push(`«${campo}» es una fecha como «2026-10-01»`);
  }
  if (esDia(c.desde) && esDia(c.hasta) && c.desde > c.hasta) problemas.push('«desde» es posterior a «hasta» y no coincidiría con nada');
  if (c.presupuestoPor != null && !['total', 'persona'].includes(c.presupuestoPor)) problemas.push('«presupuestoPor» es "total" o "persona"');
  if (c.viajeros != null && !(Number.isInteger(c.viajeros) && c.viajeros >= 1)) problemas.push('«viajeros» es un número entero, 1 o más');
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
 * @property {string} [desde] AAAA-MM-DD: viajes que acaban ese día o después (flexibles: sin caducar antes)
 * @property {string} [hasta] AAAA-MM-DD: viajes que empiezan ese día o antes
 * @property {number} [presupuestoMax] coste del viaje completo (oferta + gasolina desde el origen)
 * @property {'total'|'persona'} [presupuestoPor] por defecto «total»
 * @property {number} [viajeros] para el presupuesto (2 por defecto)
 */
