/**
 * Lógica pura del panel: rutas con los filtros en el hash, filtrado, ordenación
 * y resúmenes. Sin DOM, para poder probarla desde Node.
 */

import { diaSemana, fechaLocal, sumarDias } from './fechas.js';
import { distanciaKm, esMismoPunto, minutosEnCoche, radioKmParaMinutos, tieneCoordenadas } from './geo.js';
import { duracion, euros, normalizar } from './formato.js';

export const VISTAS = ['finde', 'vuelos', 'escapadas', 'mapa', 'calendario', 'puentes', 'vigilados', 'fuentes', 'buscar'];
export const POR_PAGINA = 24;
export const ORDENES_VUELOS = ['precio', 'puntuacion', 'hora'];
export const ORDENES_ESCAPADAS = ['puntuacion', 'precio', 'noche', 'ahorro', 'valoracion', 'distancia', 'novedad'];
/** De menos a más incluido: sirve para el filtro de «régimen mínimo». */
export const REGIMENES_ORDEN = ['solo-alojamiento', 'desayuno', 'media-pension', 'pension-completa', 'todo-incluido'];
export const ALOJAMIENTOS = ['hotel', 'casa-rural', 'camping', 'apartamento', 'parador', 'balneario', 'hostal'];
/** Transportes que no obligan a coger el coche. */
export const SIN_COCHE = ['avion', 'tren', 'bus', 'ferry'];
const ESTADOS_ACTIVOS = ['ok', 'error', 'pendiente'];
const NOCHES_CLASICAS = 2;

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
const lista = (valor) => (valor ?? '').split(',').map((parte) => parte.trim()).filter(Boolean);
const dia = (valor) => (/^\d{4}-\d{2}-\d{2}$/.test(valor ?? '') ? valor : '');

/** Filtros que valen para cualquier oferta (también para la búsqueda global). */
export function leerFiltrosComunes(p = {}) {
  return {
    q: (p.q ?? '').trim(),
    max: positivo(p.max),
    nocheMin: positivo(p.pnMin),
    nocheMax: positivo(p.pnMax),
    dto: positivo(p.dto),
    bajada: p.baja === '1',
    historico: p.hist === '1',
    chollazo: p.cho === '1',
    puntos: positivo(p.pts),
    nota: positivo(p.nota),
    pais: p.pais ?? '',
    region: p.region ?? '',
    nuevas: p.nuevas === '1',
    fav: p.fav === '1',
    sinDescartadas: p.sindesc === '1',
    conDuplicadas: p.dup === '1',
    noTemas: lista(p.notemas),
    noDestinos: lista(p.nodest),
    desde: dia(p.desde),
    hasta: dia(p.hasta),
    cuando: p.cuando ?? '',
  };
}

export function leerFiltrosVuelos(p = {}) {
  return {
    ...leerFiltrosComunes(p),
    finde: p.finde ?? '',
    aero: p.aero ?? '',
    ideal: p.ideal === '1',
    orden: ORDENES_VUELOS.includes(p.orden) ? p.orden : 'precio',
  };
}

export function leerFiltrosEscapadas(p = {}) {
  const lat = coordenada(p.lat);
  const lon = coordenada(p.lon);
  const horas = Number(p.h);
  return {
    ...leerFiltrosComunes(p),
    temas: lista(p.temas),
    noches: ['1', '2', '3'].includes(p.noches) ? Number(p.noches) : null,
    clasica: p.clasica === '1',
    regimen: REGIMENES_ORDEN.includes(p.regimen) ? p.regimen : '',
    transporte: p.transporte ?? '',
    sinCoche: p.sincoche === '1',
    alojamiento: ALOJAMIENTOS.includes(p.aloj) ? p.aloj : '',
    fuente: p.fuente ?? '',
    tipo: p.tipo ?? '',
    punto: lat != null && lon != null ? { nombre: p.lugar || 'Punto elegido', lat, lon } : null,
    horas: [1, 2, 3, 4].includes(horas) ? horas : null,
    km: positivo(p.km),
    orden: ORDENES_ESCAPADAS.includes(p.orden) ? p.orden : 'puntuacion',
  };
}

// ── Comparadores ─────────────────────────────────────────────────────────────

/** Ascendente con los null al final. */
const ascendente = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);
/** Descendente con los null al final. */
const descendente = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? 1 : -1);
const porPuntuacion = (a, b) => b.puntuacion - a.puntuacion;
const porPrecio = (a, b) => ascendente(a.precio, b.precio) || porPuntuacion(a, b);

// ── Utilidades comunes ───────────────────────────────────────────────────────

export const esVuelo = (o) => o.tipo === 'vuelo';
/** Vuelo con fechas y horas concretas (campo «vuelo»). */
export const tieneVuelo = (o) => esVuelo(o) && o.vuelo != null;
/** La misma oferta ya aparece en otra web con mejor precio (la marca duplicados.js). */
export const esDuplicada = (o) => (o.etiquetas ?? []).includes('duplicada');

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

/** Periodo de `cuando`: 'finde', 'puente' o el id de un finde o un puente concretos. */
function periodoDe(cuando, ctx) {
  if (!cuando) return null;
  if (cuando === 'finde') return periodoFinde(ctx.finde) ?? null;
  if (cuando === 'puente') return periodoPuente(ctx.puente) ?? null;
  const finde = (ctx.findes ?? []).find((f) => f.id === cuando);
  if (finde) return periodoFinde(finde);
  return periodoPuente((ctx.puentes ?? []).find((p) => p.id === cuando)) ?? null;
}

const indiceTexto = new WeakMap();
function textoDe(o) {
  if (!indiceTexto.has(o)) {
    const partes = [o.titulo, o.descripcion, o.lugar?.nombre, o.lugar?.region, o.lugar?.pais,
      o.vuelo?.origen, o.vuelo?.destino, o.fuente, o.alojamiento, ...(o.etiquetas ?? [])];
    indiceTexto.set(o, normalizar(partes.filter(Boolean).join(' ')));
  }
  return indiceTexto.get(o);
}

/** «playa -crucero» → {incluye: ['playa'], excluye: ['crucero']} (sin tildes ni mayúsculas). */
export function analizarConsulta(consulta = '') {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  return {
    incluye: palabras.filter((p) => !p.startsWith('-')),
    excluye: palabras.filter((p) => p.startsWith('-') && p.length > 1).map((p) => p.slice(1)),
  };
}

/** Todas las palabras aparecen en título, lugar, etc. y ninguna de las excluidas con «-». */
export function coincideTexto(oferta, consulta = '') {
  const { incluye, excluye } = analizarConsulta(consulta);
  const texto = textoDe(oferta);
  return incluye.every((palabra) => texto.includes(palabra)) && !excluye.some((palabra) => texto.includes(palabra));
}

/** Valores distintos y ordenados de `campo(oferta)`. */
export function valoresUnicos(ofertas, campo) {
  return [...new Set(ofertas.map(campo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Destinos que se pueden poner en la lista negra: nombre del lugar de cada oferta. */
export const destinosDe = (ofertas) => valoresUnicos(ofertas, (o) => o.lugar?.nombre);

// ── Filtros comunes ──────────────────────────────────────────────────────────

const enRango = (valor, min, max) => (min == null && max == null)
  || (typeof valor === 'number' && (min == null || valor >= min) && (max == null || valor <= max));

const destinoExcluido = (o, destinos = []) => destinos.some((d) => d === o.lugar?.nombre || d === o.lugar?.region);

function enRangoFechas(o, desde, hasta) {
  const salida = o.fechas?.salida?.slice(0, 10);
  if (!salida) return !desde || !o.caduca || fechaLocal(o.caduca) >= desde;
  const vuelta = (o.fechas.vuelta ?? o.fechas.salida).slice(0, 10);
  return (!desde || vuelta >= desde) && (!hasta || salida <= hasta);
}

function cumpleFechas(o, f, ctx) {
  if ((f.desde || f.hasta) && !enRangoFechas(o, f.desde, f.hasta)) return false;
  return !f.cuando || disponibleEn(o, periodoDe(f.cuando, ctx));
}

/** Filtros que se aplican a cualquier oferta (vuelos incluidos). */
function cumpleComunes(o, f, ctx) {
  return (!f.q || coincideTexto(o, f.q))
    && (!f.temas?.length || f.temas.some((t) => o.temas.includes(t)))
    && !(f.noTemas ?? []).some((t) => o.temas.includes(t))
    && !destinoExcluido(o, f.noDestinos)
    && enRango(o.precio, null, f.max)
    && enRango(o.precioNoche, f.nocheMin, f.nocheMax)
    && (!f.dto || (o.descuento ?? 0) >= f.dto)
    && (!f.bajada || o.bajada > 0)
    && (!f.historico || o.minimoHistorico === true)
    && (!f.chollazo || o.chollazo === true)
    && (!f.puntos || o.puntuacion >= f.puntos)
    && (!f.nota || (o.valoracion?.nota ?? 0) >= f.nota)
    && (!f.pais || o.lugar?.pais === f.pais)
    && (!f.region || o.lugar?.region === f.region)
    && (!f.nuevas || esNovedad(o, ctx.referencia))
    && (!f.fav || Boolean(ctx.favoritos?.has(o.id)))
    && (!f.sinDescartadas || !ctx.descartadas?.has(o.id))
    && (f.conDuplicadas || !esDuplicada(o))
    && cumpleFechas(o, f, ctx);
}

// ── Vuelos ───────────────────────────────────────────────────────────────────

const COMPARADORES_VUELOS = {
  precio: porPrecio,
  puntuacion: (a, b) => porPuntuacion(a, b) || ascendente(a.precio, b.precio),
  hora: (a, b) => ascendente(a.vuelo?.ida?.salida, b.vuelo?.ida?.salida) || porPrecio(a, b),
};

/** Vuelos con fechas que cumplen los filtros, ya ordenados. `finde` admite el id de un finde o de un puente. */
export function filtrarVuelos(ofertas, f, ctx = {}) {
  return ofertas
    .filter((o) => tieneVuelo(o)
      && (!f.finde || o.fechas?.findeId === f.finde || o.fechas?.puenteId === f.finde)
      && (!f.aero || o.vuelo.origen === f.aero)
      && (!f.ideal || o.vuelo.horarioIdeal)
      && cumpleComunes(o, f, ctx))
    .sort(COMPARADORES_VUELOS[f.orden] ?? porPrecio);
}

/** Chollos de vuelos sin fechas concretas (blogs y comunidades): no aplican finde ni horario. */
export function chollosDeVuelos(ofertas, f, ctx = {}) {
  return ofertas
    .filter((o) => esVuelo(o) && !o.vuelo && cumpleComunes(o, f, ctx))
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
 * `kmCoche` son los kilómetros reales por carretera; solo se conocen desde el origen.
 * @returns {Map<string, {km: number, kmCoche: number|null, minutos: number|null, estimado: boolean}>}
 */
export function medirDistancias(ofertas, punto, origen) {
  const desdeOrigen = !punto || esMismoPunto(punto, origen);
  const distancias = new Map();
  for (const o of ofertas) {
    if (esVuelo(o) || !tieneCoordenadas(o.lugar)) continue;
    distancias.set(o.id, {
      km: distanciaKm(punto ?? origen, o.lugar),
      kmCoche: desdeOrigen && typeof o.cocheKm === 'number' ? o.cocheKm : null,
      minutos: minutosEnCoche(o, punto, origen),
      estimado: !(desdeOrigen && typeof o.cocheMin === 'number') || Boolean(o.cocheEstimado),
    });
  }
  return distancias;
}

function dentroDelLimite(distancia, f) {
  if (!f.km && !f.horas) return true;
  if (!distancia) return false;
  const km = distancia.kmCoche ?? distancia.km;
  return (!f.km || km <= f.km)
    && (!f.horas || (distancia.minutos != null && distancia.minutos <= f.horas * 60));
}

const cumpleRegimenMinimo = (o, minimo) => !minimo
  || REGIMENES_ORDEN.indexOf(o.regimen) >= REGIMENES_ORDEN.indexOf(minimo);

function cumpleEscapada(o, f, ctx, distancia) {
  return cumpleComunes(o, f, ctx)
    && (!f.noches || (f.noches === 3 ? o.noches >= 3 : o.noches === f.noches))
    && (!f.clasica || o.noches === NOCHES_CLASICAS)
    && cumpleRegimenMinimo(o, f.regimen)
    && (!f.transporte || o.transporte === f.transporte)
    && (!f.sinCoche || SIN_COCHE.includes(o.transporte))
    && (!f.alojamiento || o.alojamiento === f.alojamiento)
    && (!f.fuente || o.fuente === f.fuente)
    && (!f.tipo || o.tipo === f.tipo)
    && dentroDelLimite(distancia, f);
}

const comparadoresEscapadas = (distancias) => ({
  puntuacion: (a, b) => porPuntuacion(a, b) || ascendente(a.precio, b.precio),
  precio: porPrecio,
  noche: (a, b) => ascendente(a.precioNoche, b.precioNoche) || porPuntuacion(a, b),
  ahorro: (a, b) => descendente(a.referencia?.ahorroPct, b.referencia?.ahorroPct) || porPuntuacion(a, b),
  valoracion: (a, b) => descendente(a.valoracion?.nota, b.valoracion?.nota) || porPuntuacion(a, b),
  distancia: (a, b) => {
    const [da, db] = [distancias.get(a.id), distancias.get(b.id)];
    return ascendente(da?.minutos ?? da?.km, db?.minutos ?? db?.km) || porPuntuacion(a, b);
  },
  novedad: (a, b) => ascendente(b.vistaPrimera, a.vistaPrimera) || porPuntuacion(a, b),
});

/**
 * Escapadas (todo lo que no es vuelo) que cumplen los filtros, ya ordenadas.
 * @param {object} ctx {origen, finde, puente, findes, puentes, referencia, favoritos: Set, descartadas: Set}
 * @returns {{ofertas: object[], distancias: Map}}
 */
export function buscarEscapadas(ofertas, f, ctx) {
  const distancias = medirDistancias(ofertas, f.punto, ctx.origen);
  const lista = ofertas.filter((o) => !esVuelo(o) && cumpleEscapada(o, f, ctx, distancias.get(o.id)));
  const comparador = comparadoresEscapadas(distancias)[f.orden] ?? porPuntuacion;
  return { ofertas: lista.sort(comparador), distancias };
}

/** Vuelos (con o sin fechas) que respetan los filtros de escapadas que tienen sentido para ellos. */
export function vuelosParaMapa(ofertas, f, ctx) {
  return ofertas.filter((o) => esVuelo(o) && cumpleComunes(o, f, ctx));
}

/** Radio en km del círculo de búsqueda (o null si no hay límite). */
export function radioBusquedaKm(f) {
  if (f.km) return f.km;
  return f.horas ? radioKmParaMinutos(f.horas * 60) : null;
}

/** Búsqueda global (vuelos y escapadas) con los filtros comunes, ordenada por puntuación. */
export function buscarTexto(ofertas, f, ctx = {}) {
  return ofertas.filter((o) => cumpleComunes(o, f, ctx)).sort(porPuntuacion);
}

// ── Ayudas para encontrar las mejores ofertas ────────────────────────────────

const nombreTema = (id, ctx) => (ctx.temas?.get(id)?.nombre ?? id).toLowerCase();

/**
 * Tres planes variados y cercanos entre las ofertas ya filtradas: se empieza por las
 * de más puntuación evitando repetir temática, y `salto` cambia la propuesta.
 */
export function planesSorpresa(ofertas, ctx, { max = 3, horasMax = 3, salto = 0 } = {}) {
  const candidatos = ofertas.filter((o) => {
    const d = ctx.distancias?.get(o.id);
    return !esVuelo(o) && d?.minutos != null && d.minutos <= horasMax * 60;
  }).sort(porPuntuacion);
  if (!candidatos.length) return [];
  const inicio = ((salto % candidatos.length) + candidatos.length) % candidatos.length;
  const elegidos = [];
  const temasUsados = new Set();
  for (let vuelta = 0; vuelta < 2 && elegidos.length < max; vuelta += 1) {
    for (let i = 0; i < candidatos.length && elegidos.length < max; i += 1) {
      const o = candidatos[(inicio + i) % candidatos.length];
      const tema = o.temas[0] ?? null;
      if (elegidos.includes(o) || (vuelta === 0 && tema && temasUsados.has(tema))) continue;
      elegidos.push(o);
      if (tema) temasUsados.add(tema);
    }
  }
  return elegidos;
}

/** Gustos deducidos de los favoritos: temáticas y zonas que más se repiten. */
export function perfilFavoritos(ofertas, favoritos) {
  const cuentas = { temas: new Map(), zonas: new Map() };
  let total = 0;
  for (const o of ofertas) {
    if (!favoritos?.has(o.id)) continue;
    total += 1;
    for (const tema of o.temas) cuentas.temas.set(tema, (cuentas.temas.get(tema) ?? 0) + 1);
    const zona = o.lugar?.region || o.lugar?.pais;
    if (zona) cuentas.zonas.set(zona, (cuentas.zonas.get(zona) ?? 0) + 1);
  }
  const ordenar = (mapa) => [...mapa]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, 'es'));
  return { total, temas: ordenar(cuentas.temas), zonas: ordenar(cuentas.zonas) };
}

const PESO_AFINIDAD = { tema: 3, zona: 2, cerca: 2 };
const CERCA_MIN = 120;

/**
 * Ofertas parecidas a los favoritos, con el motivo en palabras.
 * @returns {{oferta: object, puntos: number, motivos: string[]}[]}
 */
export function recomendadas(ofertas, perfil, ctx, { max = 6 } = {}) {
  if (!perfil.total) return [];
  const pesoTema = new Map(perfil.temas.map(({ valor, n }) => [valor, n]));
  const pesoZona = new Map(perfil.zonas.map(({ valor, n }) => [valor, n]));
  return ofertas
    .filter((o) => !ctx.favoritos?.has(o.id) && !esVuelo(o) && !esDuplicada(o))
    .flatMap((o) => {
      const distancia = ctx.distancias?.get(o.id);
      const tema = o.temas.filter((t) => pesoTema.has(t)).sort((a, b) => pesoTema.get(b) - pesoTema.get(a))[0] ?? null;
      const zona = o.lugar?.region || o.lugar?.pais;
      const zonaComun = pesoZona.has(zona) ? zona : null;
      if (!tema && !zonaComun) return [];
      const cerca = distancia?.minutos != null && distancia.minutos <= CERCA_MIN;
      const puntos = (tema ? PESO_AFINIDAD.tema * pesoTema.get(tema) : 0)
        + (zonaComun ? PESO_AFINIDAD.zona * pesoZona.get(zonaComun) : 0)
        + (cerca ? PESO_AFINIDAD.cerca : 0)
        + o.puntuacion / 100;
      const motivos = [
        tema && `te gustan los planes de ${nombreTema(tema, ctx)}`,
        zonaComun && `sueles guardar escapadas por ${zonaComun}`,
        cerca && `está a ${duracion(distancia.minutos)}`,
      ].filter(Boolean);
      return [{ oferta: o, puntos, motivos }];
    })
    .sort((a, b) => b.puntos - a.puntos || porPuntuacion(a.oferta, b.oferta))
    .slice(0, max);
}

// ── Resúmenes ────────────────────────────────────────────────────────────────

/** Chollazos: los marca el escaneo con el mismo criterio que las alertas por email. */
export const chollazos = (ofertas) => ofertas.filter((o) => o.chollazo && !esDuplicada(o)).sort(porPuntuacion);

/** Puente que se solapa con el finde (viernes a domingo), o null. */
export const puenteDelFinde = (finde, puentes = []) =>
  puentes.find((p) => p.desde <= finde.domingo && p.hasta >= finde.viernes) ?? null;

/** Todos los días libres del puente, del primero al último. */
export function diasDelPuente(puente) {
  const dias = [];
  for (let d = puente.desde; d <= puente.hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

/** Días laborables dentro del puente: son los que hay que pedir en el trabajo. */
export function diasAPedir(puente) {
  const festivos = new Set((puente.festivos ?? []).map((f) => f.fecha));
  return diasDelPuente(puente).filter((d) => ![0, 6].includes(diaSemana(d)) && !festivos.has(d));
}

/** Próximos puentes con sus días, el día que hay que pedir y sus mejores ofertas. */
export function resumenPuentes(ofertas, puentes = [], hoy, { descartadas } = {}) {
  return [...puentes]
    .filter((p) => p.hasta >= hoy)
    .sort((a, b) => a.desde.localeCompare(b.desde))
    .map((puente) => {
      const periodo = periodoPuente(puente);
      const suyas = (o) => (o.fechas?.puenteId === puente.id ? 0 : 1);
      const disponibles = ofertas.filter((o) => !esDuplicada(o) && !descartadas?.has(o.id) && disponibleEn(o, periodo));
      return {
        puente,
        dias: diasDelPuente(puente),
        pedir: diasAPedir(puente),
        festivos: puente.festivos ?? [],
        vuelos: disponibles.filter(tieneVuelo).sort(porPrecio),
        escapadas: disponibles.filter((o) => !esVuelo(o)).sort((a, b) => suyas(a) - suyas(b) || porPuntuacion(a, b)),
      };
    });
}

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

/**
 * Criterio para config/vigilados.json equivalente a los filtros actuales.
 * Solo incluye lo que entiende src/vigilados.js; el resto de filtros se pierde.
 */
export function criterioVigilado(nombre, f, { vista = 'escapadas' } = {}) {
  const criterio = {
    nombre: nombre.trim() || 'Mi búsqueda',
    texto: analizarConsulta(f.q ?? '').incluye.join(' ') || undefined,
    tipo: (vista === 'vuelos' ? 'vuelo' : f.tipo) || undefined,
    tema: f.temas?.[0] || undefined,
    fuente: f.fuente || undefined,
    aeropuerto: f.aero || undefined,
    precioMax: f.max ?? undefined,
    cocheMaxMin: f.horas ? f.horas * 60 : undefined,
    cerca: f.punto
      ? { lat: Number(f.punto.lat.toFixed(4)), lon: Number(f.punto.lon.toFixed(4)), radioKm: Math.round(radioBusquedaKm(f) ?? 100) }
      : undefined,
    puente: f.cuando === 'puente' || f.cuando?.startsWith('puente-') || undefined,
  };
  return Object.fromEntries(Object.entries(criterio).filter(([, valor]) => valor !== undefined));
}

/** Enlace para editar config/vigilados.json si el panel está en GitHub Pages (usuario.github.io/repo/). */
export function urlEditarVigilados({ hostname = '', pathname = '/' } = {}) {
  const usuario = hostname.match(/^([^.]+)\.github\.io$/i)?.[1];
  if (!usuario) return null;
  const primero = pathname.split('/').filter(Boolean)[0];
  const repo = primero && !primero.endsWith('.html') ? primero : `${usuario}.github.io`;
  return `https://github.com/${usuario}/${repo}/edit/main/config/vigilados.json`;
}
