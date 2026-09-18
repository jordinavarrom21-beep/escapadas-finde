/**
 * Lógica pura del panel: rutas con los filtros en el hash, filtrado, ordenación
 * y resúmenes. Sin DOM, para poder probarla desde Node.
 */

import { fechaLocal } from './fechas.js';
import { distanciaKm, esMismoPunto, minutosEnCoche, radioKmParaMinutos, tieneCoordenadas } from './geo.js';
import { duracion, euros, normalizar } from './formato.js';

export const VISTAS = ['finde', 'vuelos', 'escapadas', 'mapa', 'calendario', 'vigilados', 'fuentes', 'buscar'];
export const POR_PAGINA = 24;
export const ORDENES_VUELOS = ['precio', 'puntuacion', 'hora'];
export const ORDENES_ESCAPADAS = ['puntuacion', 'precio', 'distancia', 'novedad'];
const ESTADOS_ACTIVOS = ['ok', 'error', 'pendiente'];

// ── Rutas ────────────────────────────────────────────────────────────────────

/** '#/escapadas?temas=spa,rural' → {vista: 'escapadas', params: {temas: 'spa,rural'}}. */
export function leerRuta(hash = '') {
  const [ruta, consulta = ''] = hash.replace(/^#\/?/, '').split('?');
  return {
    vista: VISTAS.includes(ruta) ? ruta : 'finde',
    params: Object.fromEntries(new URLSearchParams(consulta)),
  };
}

/** Hash de una vista con sus parámetros, sin los vacíos (las listas van separadas por comas). */
export function crearHash(vista, params = {}) {
  const partes = Object.entries(params).flatMap(([clave, valor]) => {
    const texto = Array.isArray(valor) ? valor.join(',') : valor === true ? '1' : valor;
    if (texto == null || texto === '' || texto === false) return [];
    return [`${encodeURIComponent(clave)}=${encodeURIComponent(texto).replace(/%2C/g, ',')}`];
  });
  return `#/${vista}${partes.length ? `?${partes.join('&')}` : ''}`;
}

const positivo = (valor) => {
  const n = Number(valor);
  return valor != null && valor !== '' && Number.isFinite(n) && n > 0 ? n : null;
};
const coordenada = (valor) => {
  const n = Number(valor);
  return valor != null && valor !== '' && Number.isFinite(n) ? n : null;
};

export function leerFiltrosVuelos(p = {}) {
  return {
    finde: p.finde ?? '',
    aero: p.aero ?? '',
    ideal: p.ideal === '1',
    max: positivo(p.max),
    pais: p.pais ?? '',
    orden: ORDENES_VUELOS.includes(p.orden) ? p.orden : 'precio',
  };
}

export function leerFiltrosEscapadas(p = {}) {
  const lat = coordenada(p.lat);
  const lon = coordenada(p.lon);
  const horas = Number(p.h);
  return {
    temas: (p.temas ?? '').split(',').filter(Boolean),
    max: positivo(p.max),
    noches: ['1', '2', '3'].includes(p.noches) ? Number(p.noches) : null,
    regimen: p.regimen ?? '',
    transporte: p.transporte ?? '',
    fuente: p.fuente ?? '',
    tipo: p.tipo ?? '',
    nuevas: p.nuevas === '1',
    fav: p.fav === '1',
    cuando: ['finde', 'puente'].includes(p.cuando) ? p.cuando : '',
    punto: lat != null && lon != null ? { nombre: p.lugar || 'Punto elegido', lat, lon } : null,
    horas: [1, 2, 3, 4].includes(horas) ? horas : null,
    km: positivo(p.km),
    orden: ORDENES_ESCAPADAS.includes(p.orden) ? p.orden : 'puntuacion',
  };
}

// ── Comparadores ─────────────────────────────────────────────────────────────

/** Ascendente con los null al final. */
const ascendente = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);
const porPuntuacion = (a, b) => b.puntuacion - a.puntuacion;
const porPrecio = (a, b) => ascendente(a.precio, b.precio) || porPuntuacion(a, b);

// ── Utilidades comunes ───────────────────────────────────────────────────────

export const esVuelo = (o) => o.tipo === 'vuelo';
/** Vuelo con fechas y horas concretas (campo «vuelo»). */
export const tieneVuelo = (o) => esVuelo(o) && o.vuelo != null;
const precioHasta = (o, max) => max == null || (typeof o.precio === 'number' && o.precio <= max);

/** ¿Se vio por primera vez después de `referencia` (ISO)? */
export function esNovedad(oferta, referencia) {
  return Boolean(referencia && oferta.vistaPrimera) && Date.parse(oferta.vistaPrimera) > Date.parse(referencia);
}

/** Referencia para las novedades: la última visita o, la primera vez, 24 h antes de generar los datos. */
export function referenciaNovedades(ultimaVisita, generado) {
  if (ultimaVisita) return ultimaVisita;
  const base = Date.parse(generado);
  return Number.isFinite(base) ? new Date(base - 86_400_000).toISOString() : null;
}

/**
 * ¿Se puede disfrutar en el periodo {id, desde}? Las ofertas con fechas deben ser de
 * ese finde o puente; las de fechas flexibles, no haber caducado antes de `desde`.
 */
export function disponibleEn(oferta, periodo) {
  if (!periodo) return false;
  const { salida, findeId, puenteId } = oferta.fechas ?? {};
  if (salida) return findeId === periodo.id || puenteId === periodo.id;
  return !oferta.caduca || fechaLocal(oferta.caduca) >= periodo.desde;
}

export const periodoFinde = (finde) => finde && { id: finde.id, desde: finde.viernes };
export const periodoPuente = (puente) => puente && { id: puente.id, desde: puente.desde };

const indiceTexto = new WeakMap();
function textoDe(o) {
  if (!indiceTexto.has(o)) {
    const partes = [o.titulo, o.descripcion, o.lugar?.nombre, o.lugar?.region, o.lugar?.pais,
      o.vuelo?.origen, o.vuelo?.destino, o.fuente, ...(o.etiquetas ?? [])];
    indiceTexto.set(o, normalizar(partes.filter(Boolean).join(' ')));
  }
  return indiceTexto.get(o);
}

/** Todas las palabras de la consulta aparecen (sin tildes ni mayúsculas) en título, lugar, etc. */
export function coincideTexto(oferta, consulta = '') {
  return normalizar(consulta).split(/\s+/).filter(Boolean).every((t) => textoDe(oferta).includes(t));
}

/** Valores distintos y ordenados de `campo(oferta)`. */
export function valoresUnicos(ofertas, campo) {
  return [...new Set(ofertas.map(campo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

// ── Vuelos ───────────────────────────────────────────────────────────────────

const COMPARADORES_VUELOS = {
  precio: porPrecio,
  puntuacion: (a, b) => porPuntuacion(a, b) || ascendente(a.precio, b.precio),
  hora: (a, b) => ascendente(a.vuelo?.ida?.salida, b.vuelo?.ida?.salida) || porPrecio(a, b),
};

/** Vuelos con fechas que cumplen los filtros, ya ordenados. `finde` admite el id de un finde o de un puente. */
export function filtrarVuelos(ofertas, f) {
  return ofertas
    .filter((o) => tieneVuelo(o)
      && (!f.finde || o.fechas?.findeId === f.finde || o.fechas?.puenteId === f.finde)
      && (!f.aero || o.vuelo.origen === f.aero)
      && (!f.ideal || o.vuelo.horarioIdeal)
      && precioHasta(o, f.max)
      && (!f.pais || o.lugar?.pais === f.pais))
    .sort(COMPARADORES_VUELOS[f.orden] ?? porPrecio);
}

/** Chollos de vuelos sin fechas concretas (blogs y comunidades): solo aplican precio y país. */
export function chollosDeVuelos(ofertas, f) {
  return ofertas
    .filter((o) => esVuelo(o) && !o.vuelo && precioHasta(o, f.max) && (!f.pais || o.lugar?.pais === f.pais))
    .sort(f.orden === 'precio' ? porPrecio : porPuntuacion);
}

/** El vuelo más barato de cada destino (para el mapa). */
export function destinosDeVuelo(vuelos) {
  const porDestino = new Map();
  for (const o of vuelos) {
    if (!tieneCoordenadas(o.lugar) || typeof o.precio !== 'number') continue;
    const clave = o.lugar.iata || o.lugar.nombre;
    const actual = porDestino.get(clave);
    if (!actual || o.precio < actual.oferta.precio) porDestino.set(clave, { oferta: o, total: (actual?.total ?? 0) + 1 });
    else actual.total += 1;
  }
  return [...porDestino.values()];
}

// ── Escapadas ────────────────────────────────────────────────────────────────

/**
 * Distancia desde `punto` (o desde el origen) a cada oferta con coordenadas que no es un vuelo.
 * @returns {Map<string, {km: number, minutos: number|null, estimado: boolean}>}
 */
export function medirDistancias(ofertas, punto, origen) {
  const desdeOrigen = !punto || esMismoPunto(punto, origen);
  const distancias = new Map();
  for (const o of ofertas) {
    if (esVuelo(o) || !tieneCoordenadas(o.lugar)) continue;
    distancias.set(o.id, {
      km: distanciaKm(punto ?? origen, o.lugar),
      minutos: minutosEnCoche(o, punto, origen),
      estimado: !(desdeOrigen && typeof o.cocheMin === 'number') || Boolean(o.cocheEstimado),
    });
  }
  return distancias;
}

function dentroDelLimite(distancia, f) {
  if (f.km) return distancia != null && distancia.km <= f.km;
  if (f.horas) return distancia?.minutos != null && distancia.minutos <= f.horas * 60;
  return true;
}

/** Filtros compartidos por escapadas y vuelos del mapa. */
function cumpleComunes(o, f, ctx) {
  return (!f.temas.length || f.temas.some((t) => o.temas.includes(t)))
    && precioHasta(o, f.max)
    && (!f.nuevas || esNovedad(o, ctx.referencia))
    && (!f.fav || Boolean(ctx.favoritos?.has(o.id)))
    && (!f.cuando || disponibleEn(o, ctx.periodo));
}

function cumpleEscapada(o, f, ctx, distancia) {
  return cumpleComunes(o, f, ctx)
    && (!f.noches || (f.noches === 3 ? o.noches >= 3 : o.noches === f.noches))
    && (!f.regimen || o.regimen === f.regimen)
    && (!f.transporte || o.transporte === f.transporte)
    && (!f.fuente || o.fuente === f.fuente)
    && (!f.tipo || o.tipo === f.tipo)
    && dentroDelLimite(distancia, f);
}

const comparadoresEscapadas = (distancias) => ({
  puntuacion: (a, b) => porPuntuacion(a, b) || ascendente(a.precio, b.precio),
  precio: porPrecio,
  distancia: (a, b) => {
    const [da, db] = [distancias.get(a.id), distancias.get(b.id)];
    return ascendente(da?.minutos ?? da?.km, db?.minutos ?? db?.km) || porPuntuacion(a, b);
  },
  novedad: (a, b) => ascendente(b.vistaPrimera, a.vistaPrimera) || porPuntuacion(a, b),
});

const periodoDe = (cuando, ctx) => (cuando === 'finde' ? periodoFinde(ctx.finde) : cuando === 'puente' ? periodoPuente(ctx.puente) : null);

/**
 * Escapadas (todo lo que no es vuelo) que cumplen los filtros, ya ordenadas.
 * @param {object} ctx {origen, finde, puente, referencia, favoritos: Set}
 * @returns {{ofertas: object[], distancias: Map}}
 */
export function buscarEscapadas(ofertas, f, ctx) {
  const distancias = medirDistancias(ofertas, f.punto, ctx.origen);
  const contexto = { ...ctx, periodo: periodoDe(f.cuando, ctx) };
  const lista = ofertas.filter((o) => !esVuelo(o) && cumpleEscapada(o, f, contexto, distancias.get(o.id)));
  const comparador = comparadoresEscapadas(distancias)[f.orden] ?? porPuntuacion;
  return { ofertas: lista.sort(comparador), distancias };
}

/** Vuelos (con o sin fechas) que respetan los filtros de escapadas que tienen sentido para ellos. */
export function vuelosParaMapa(ofertas, f, ctx) {
  const contexto = { ...ctx, periodo: periodoDe(f.cuando, ctx) };
  return ofertas.filter((o) => esVuelo(o) && cumpleComunes(o, f, contexto));
}

/** Radio en km del círculo de búsqueda (o null si no hay límite). */
export function radioBusquedaKm(f) {
  if (f.km) return f.km;
  return f.horas ? radioKmParaMinutos(f.horas * 60) : null;
}

/** Búsqueda global por texto y novedades, ordenada por puntuación. */
export function buscarTexto(ofertas, { q = '', nuevas = false }, referencia) {
  return ofertas
    .filter((o) => (!q || coincideTexto(o, q)) && (!nuevas || esNovedad(o, referencia)))
    .sort(porPuntuacion);
}

// ── Resúmenes ────────────────────────────────────────────────────────────────

/** Chollazos: los marca el escaneo con el mismo criterio que las alertas por email. */
export const chollazos = (ofertas) => ofertas.filter((o) => o.chollazo).sort(porPuntuacion);

/** Puente que se solapa con el finde (viernes a domingo), o null. */
export const puenteDelFinde = (finde, puentes = []) =>
  puentes.find((p) => p.desde <= finde.domingo && p.hasta >= finde.viernes) ?? null;

/** Para cada finde: su puente, el vuelo más barato, cuántos vuelos y cuántas escapadas disponibles. */
export function resumenCalendario(ofertas, findes, puentes = []) {
  return findes.map((finde) => {
    const puente = puenteDelFinde(finde, puentes);
    const vuelos = ofertas.filter((o) => tieneVuelo(o)
      && (o.fechas?.findeId === finde.id || (puente != null && o.fechas?.puenteId === puente.id)));
    const vuelo = vuelos.filter((o) => typeof o.precio === 'number').sort(porPrecio)[0] ?? null;
    const periodo = periodoFinde(finde);
    const escapadas = ofertas.filter((o) => !esVuelo(o) && disponibleEn(o, periodo)).length;
    return { finde, puente, vuelo, vuelos: vuelos.length, escapadas };
  });
}

/** Cuántas fuentes activas hay, cuántas van bien y cuántas fallan (bloqueadas y desactivadas no cuentan). */
export function resumenFuentes(fuentes = []) {
  const activas = fuentes.filter((f) => ESTADOS_ACTIVOS.includes(f.estado));
  return {
    activas: activas.length,
    ok: activas.filter((f) => f.estado === 'ok').length,
    conError: activas.filter((f) => f.estado === 'error').length,
    inactivas: fuentes.length - activas.length,
  };
}

/** Condiciones de un criterio de vigilados en frases cortas. */
export function describirCriterio(c, { temas = [], origen = null } = {}) {
  const tema = temas.find((t) => t.id === c.tema);
  const cerca = c.cerca && (esMismoPunto(c.cerca, origen) ? origen.nombre : `${c.cerca.lat.toFixed(2)}, ${c.cerca.lon.toFixed(2)}`);
  return [
    c.texto && `contiene «${c.texto}»`,
    c.tipo && `tipo ${c.tipo}`,
    c.tema && (tema ? `${tema.emoji} ${tema.nombre}` : `tema ${c.tema}`),
    c.fuente && `fuente ${c.fuente}`,
    c.aeropuerto && `desde ${c.aeropuerto}`,
    c.precioMax && `hasta ${euros(c.precioMax)}`,
    c.cocheMaxMin && `a menos de ${duracion(c.cocheMaxMin)} en coche`,
    c.cerca && `a menos de ${c.cerca.radioKm} km de ${cerca}`,
    c.puente && 'solo en puentes',
  ].filter(Boolean);
}

/** Enlace para editar config/vigilados.json si el panel está en GitHub Pages (usuario.github.io/repo/). */
export function urlEditarVigilados({ hostname = '', pathname = '/' } = {}) {
  const usuario = hostname.match(/^([^.]+)\.github\.io$/i)?.[1];
  if (!usuario) return null;
  const primero = pathname.split('/').filter(Boolean)[0];
  const repo = primero && !primero.endsWith('.html') ? primero : `${usuario}.github.io`;
  return `https://github.com/${usuario}/${repo}/edit/main/config/vigilados.json`;
}
