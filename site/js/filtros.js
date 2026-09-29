/**
 * Lógica pura del panel: rutas con los filtros en el hash, filtrado, ordenación
 * y resúmenes. Sin DOM, para poder probarla desde Node.
 */

import { costeViaje } from './coste.js';
import { diaSemana, etiquetaDia, fechaLocal, sumarDias } from './fechas.js';
import { distanciaKm, esMismoPunto, minutosEnCoche, radioKmParaMinutos, tieneCoordenadas } from './geo.js';
import {
  ETIQUETAS_ALOJAMIENTO, ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE, duracion, euros, normalizar,
} from './formato.js';

export const VISTAS = ['finde', 'vuelos', 'escapadas', 'actividades', 'mapa', 'calendario', 'puentes', 'vigilados', 'fuentes', 'buscar', 'comparar', 'mis'];
export const POR_PAGINA = 12;

/**
 * Traduce los campos de formulario que no son parámetros de la URL: el precio único
 * («precio» + «preciotipo») y «¿Cómo vas?» («como»). Así la URL, la memoria y los enlaces
 * antiguos siguen usando pres/prespor, max, pnMax, transporte y sincoche. Modifica y devuelve `p`.
 */
export function traducirFormulario(p) {
  if ('precio' in p || 'preciotipo' in p) {
    const valor = p.precio;
    const tipo = p.preciotipo ?? 'oferta';
    delete p.precio;
    delete p.preciotipo;
    if (valor) {
      if (tipo === 'noche') p.pnMax = valor;
      else if (tipo === 'persona' || tipo === 'total') {
        p.pres = valor;
        if (tipo === 'persona') p.prespor = 'persona';
        else delete p.prespor;
      } else p.max = valor;
    }
  }
  if ('como' in p) {
    const como = p.como;
    delete p.como;
    if (como === 'coche') {
      p.transporte = 'coche';
      delete p.sincoche;
    } else if (como === 'sincoche') {
      p.sincoche = '1';
      if (p.transporte === 'coche') delete p.transporte;
    }
  }
  return p;
}
export const ORDENES_VUELOS = ['precio', 'puntuacion', 'hora'];
export const ORDENES_ESCAPADAS = ['puntuacion', 'total', 'persona', 'calidad', 'comodo', 'precio', 'noche', 'ahorro', 'valoracion', 'distancia', 'novedad'];
export const ORDENES_ACTIVIDADES = ['puntuacion', 'precio', 'valoracion'];
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
const coordenada = (valor, limite) => {
  const n = Number(valor);
  return valor != null && valor !== '' && Number.isFinite(n) && Math.abs(n) <= limite ? n : null;
};
/** Nombre del punto de búsqueda tal como llega del hash: texto corto, sin marcas. */
const nombreLugar = (valor) => (valor ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
const lista = (valor) => (valor ?? '').split(',').map((parte) => parte.trim()).filter(Boolean);
const dia = (valor) => (/^\d{4}-\d{2}-\d{2}$/.test(valor ?? '') ? valor : '');

/**
 * Con niños: 'apto' (cualquier plan para ir con niños), 'ventaja' (niños gratis, con
 * descuento o con tarifa infantil) o 'gratis' (solo niños gratis). Ver src/enriquecer/ninos.js.
 */
export const NINOS = ['apto', 'ventaja', 'gratis'];
export const ETIQUETAS_NINOS = { apto: 'Para ir con niños', ventaja: 'Niños gratis o con descuento', gratis: 'Niños gratis' };

/** ¿Cumple el filtro de niños `valor`? */
export function cumpleNinos(o, valor) {
  if (!valor) return true;
  if (!o.ninos) return false;
  if (valor === 'gratis') return o.ninos.ventaja === 'gratis';
  if (valor === 'ventaja') return Boolean(o.ninos.ventaja);
  return true;
}

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
    // Las descartadas (✕) y las que marcas «Ya no está disponible» se ocultan salvo que se pida verlas («sindesc=0»).
    sinDescartadas: p.sindesc !== '0',
    conDuplicadas: p.dup === '1',
    // Las que su web lleva días sin publicar van al final; con «frescas=1», ni eso.
    soloComprobadas: p.frescas === '1',
    noTemas: lista(p.notemas),
    noDestinos: lista(p.nodest),
    desde: dia(p.desde),
    hasta: dia(p.hasta),
    cuando: p.cuando ?? '',
    // Solo las que ya traen fechas concretas; las flexibles se confirman en la web.
    soloCerradas: p.cerradas === '1',
    ninos: NINOS.includes(p.ninos) ? p.ninos : '',
  };
}

export function leerFiltrosVuelos(p = {}) {
  return {
    ...leerFiltrosComunes(p),
    finde: p.finde ?? '',
    aero: p.aero ?? '',
    ideal: p.ideal === '1',
    // Solo los chollos que pueden salir de tus aeropuertos (los que no lo dicen, también).
    mios: p.mios === '1',
    orden: ORDENES_VUELOS.includes(p.orden) ? p.orden : 'precio',
  };
}

export function leerFiltrosEscapadas(p = {}) {
  const lat = coordenada(p.lat, 90);
  const lon = coordenada(p.lon, 180);
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
    // Categoría mínima: 2 a 5 estrellas. Las que no dicen sus estrellas no entran.
    estrellas: ['2', '3', '4', '5'].includes(p.est) ? Number(p.est) : null,
    fuente: p.fuente ?? '',
    tipo: p.tipo ?? '',
    punto: lat != null && lon != null ? { nombre: nombreLugar(p.lugar) || 'Punto elegido', lat, lon } : null,
    horas: [1, 2, 3, 4].includes(horas) ? horas : null,
    km: positivo(p.km),
    // Presupuesto del viaje completo (coste.js), en total o por persona.
    presupuesto: positivo(p.pres),
    presupuestoPor: p.prespor === 'persona' ? 'persona' : 'total',
    // Los cruceros se esconden salvo que se pida verlos («cru=0» apaga el interruptor).
    sinCruceros: p.cru !== '0',
    orden: ORDENES_ESCAPADAS.includes(p.orden) ? p.orden : 'puntuacion',
  };
}

/** Filtros de la vista de actividades: los comunes más temática, lugar y «solo gratis». */
export function leerFiltrosActividades(p = {}) {
  return {
    ...leerFiltrosComunes(p),
    temas: lista(p.temas),
    dest: p.dest ?? '',
    gratis: p.gratis === '1',
    orden: ORDENES_ACTIVIDADES.includes(p.orden) ? p.orden : 'puntuacion',
  };
}

// ── Comparadores ─────────────────────────────────────────────────────────────

/** Ascendente con los null al final. */
const ascendente = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);
/** Descendente con los null al final. */
const descendente = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? 1 : -1);
const porPuntuacion = (a, b) => b.puntuacion - a.puntuacion;

/** Sin volver a verla en su web durante más de esto (o de 3 intervalos de su fuente), puede haber cambiado. */
export const HORAS_SIN_COMPROBAR = 24;

/**
 * ¿Lleva su web más de `HORAS_SIN_COMPROBAR` (o 3 intervalos de revisión) sin publicarla?
 * Se mide hasta `ctx.revision` (la hora del escaneo) si viene: así, si el escaneo se
 * retrasa, no pasan todas a «sin comprobar» a la vez. Si no, hasta `ctx.ahora`.
 */
export function sinComprobar(o, ctx = {}) {
  const vista = Date.parse(o.vistaUltima);
  if (!Number.isFinite(vista)) return false;
  const hasta = (ctx.revision ?? ctx.ahora ?? new Date()).getTime();
  const intervaloMin = ctx.intervalos?.get(o.fuente);
  const limiteHoras = Math.max(HORAS_SIN_COMPROBAR, intervaloMin ? (3 * intervaloMin) / 60 : 0);
  return (hasta - vista) / 3_600_000 > limiteHoras;
}

/** Mismo orden, pero las que su web lleva tiempo sin publicar, al final. */
export function alFinalSinComprobar(lista, ctx = {}) {
  const [frescas, viejas] = [[], []];
  for (const o of lista) (sinComprobar(o, ctx) ? viejas : frescas).push(o);
  return frescas.concat(viejas);
}
const porPrecio = (a, b) => ascendente(a.precio, b.precio) || porPuntuacion(a, b);

// ── Utilidades comunes ───────────────────────────────────────────────────────

export const esVuelo = (o) => o.tipo === 'vuelo';
/** Vuelo con fechas y horas concretas (campo «vuelo»). */
export const tieneVuelo = (o) => esVuelo(o) && o.vuelo != null;
/** Entradas, visitas y free tours: tienen su propia vista, no se mezclan con las escapadas. */
export const esActividad = (o) => o.tipo === 'actividad';
export const esCrucero = (o) => o.tipo === 'crucero';
/** Lo que se lista como escapada: todo menos los vuelos y las actividades. */
export const esEscapada = (o) => !esVuelo(o) && !esActividad(o);
/** La misma oferta ya aparece en otra web con mejor precio (la marca duplicados.js). */
export const esDuplicada = (o) => (o.etiquetas ?? []).includes('duplicada');

const PREFIJO_DURACION = 'duracion:';

/** Minutos que dura una actividad, de la etiqueta «duracion:<minutos>», o null. */
export function duracionActividad(o) {
  const etiqueta = (o.etiquetas ?? []).find((e) => e.startsWith(PREFIJO_DURACION));
  const minutos = Number(etiqueta?.slice(PREFIJO_DURACION.length));
  return Number.isFinite(minutos) && minutos > 0 ? minutos : null;
}

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

/**
 * Provincias y comunidades de las ofertas (las que deduce el escaneo), para el filtro de
 * zona: con la región tal cual la escribe cada web, «Girona» y «Cataluña» no se encontraban.
 */
export function zonasDe(ofertas) {
  const provincias = valoresUnicos(ofertas, (o) => o.lugar?.provincia);
  const comunidades = valoresUnicos(ofertas, (o) => o.lugar?.comunidad);
  return { provincias, comunidades };
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
    && (!f.region || [o.lugar?.region, o.lugar?.provincia, o.lugar?.comunidad].includes(f.region))
    && (!f.nuevas || esNovedad(o, ctx.referencia))
    && (!f.fav || Boolean(ctx.favoritos?.has(o.id)))
    && (!f.sinDescartadas || !ctx.descartadas?.has(o.id))
    && (f.conDuplicadas || !esDuplicada(o))
    && (!f.soloComprobadas || !sinComprobar(o, ctx))
    && (!f.soloCerradas || Boolean(o.fechas?.salida))
    && cumpleNinos(o, f.ninos)
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
  const lista = ofertas
    .filter((o) => tieneVuelo(o)
      && (!f.finde || o.fechas?.findeId === f.finde || o.fechas?.puenteId === f.finde)
      && (!f.aero || o.vuelo.origen === f.aero)
      && (!f.ideal || o.vuelo.horarioIdeal)
      && cumpleComunes(o, f, ctx))
    .sort(COMPARADORES_VUELOS[f.orden] ?? porPrecio);
  return alFinalSinComprobar(lista, ctx);
}

const PREFIJO_SALIDA = 'sale-de:';
/** Ciudades de salida que publica un chollo de vuelo («sale-de:Alicante», de src/enriquecer/vuelos.js). */
export const salidasDe = (o) => (o.etiquetas ?? []).filter((e) => e.startsWith(PREFIJO_SALIDA)).map((e) => e.slice(PREFIJO_SALIDA.length));
/** Descuentos, códigos o «muchos destinos»: no es un billete que se pueda comparar. */
export const esPromocion = (o) => (o.etiquetas ?? []).includes('promocion');

/** Ciudad de los aeropuertos más habituales, para comparar con «Salidas desde Barcelona». */
const CIUDAD_AEROPUERTO = {
  BCN: 'Barcelona', GRO: 'Girona', REU: 'Reus', MAD: 'Madrid', VLC: 'Valencia', AGP: 'Málaga', ALC: 'Alicante',
  SVQ: 'Sevilla', BIO: 'Bilbao', PMI: 'Palma de Mallorca', ZAZ: 'Zaragoza', SCQ: 'Santiago', OPO: 'Oporto', LIS: 'Lisboa',
};
/** Salidas que no dicen la ciudad: pueden incluir la tuya. */
const SALIDAS_GENERICAS = ['espana', 'varias ciudades europeas'];

/**
 * ¿Puede salir de alguno de `aeropuertos` (o de la ciudad de origen)? Si el chollo no dice
 * desde dónde sale, o da una zona que puede incluirlos («España»), se da por bueno.
 */
export function saleDeMisAeropuertos(o, aeropuertos = [], origen = null) {
  const salidas = salidasDe(o).map(normalizar);
  if (!salidas.length) return true;
  const mias = new Set([...aeropuertos, ...aeropuertos.map((a) => CIUDAD_AEROPUERTO[a]), origen?.nombre].filter(Boolean).map(normalizar));
  return salidas.some((s) => mias.has(s) || SALIDAS_GENERICAS.includes(s));
}

const cumpleChollo = (o, f, ctx) => esVuelo(o) && !o.vuelo && cumpleComunes(o, f, ctx)
  && (!f.mios || saleDeMisAeropuertos(o, ctx.aeropuertos, ctx.origen));

/** Billetes de vuelo sin fechas concretas (blogs y comunidades): no aplican finde ni horario. */
export function chollosDeVuelos(ofertas, f, ctx = {}) {
  return alFinalSinComprobar(ofertas
    .filter((o) => !esPromocion(o) && cumpleChollo(o, f, ctx))
    .sort(f.orden === 'precio' ? porPrecio : porPuntuacion), ctx);
}

/** Promociones de aerolíneas (descuentos, códigos, rebajas): aparte, porque no son billetes. */
export function promocionesDeVuelos(ofertas, f, ctx = {}) {
  return alFinalSinComprobar(ofertas.filter((o) => esPromocion(o) && cumpleChollo(o, f, ctx)).sort(porPuntuacion), ctx);
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
    && (!f.sinCruceros || !esCrucero(o))
    && (!f.noches || (f.noches === 3 ? o.noches >= 3 : o.noches === f.noches))
    && (!f.clasica || o.noches === NOCHES_CLASICAS)
    && cumpleRegimenMinimo(o, f.regimen)
    && (!f.transporte || o.transporte === f.transporte)
    && (!f.sinCoche || SIN_COCHE.includes(o.transporte))
    && (!f.alojamiento || o.alojamiento === f.alojamiento)
    && (!f.estrellas || (o.estrellas ?? 0) >= f.estrellas)
    && (!f.fuente || o.fuente === f.fuente)
    && (!f.tipo || o.tipo === f.tipo)
    && dentroDelLimite(distancia, f);
}

/**
 * Más cómodo: menos tiempo de viaje desde tu salida y, a igualdad, lo que incluye más
 * (régimen) y lo mejor valorado. Sin tiempo conocido (islas, avión), al final.
 */
function porComodidad(distancias) {
  return (a, b) => ascendente(distancias.get(a.id)?.minutos, distancias.get(b.id)?.minutos)
    || descendente(REGIMENES_ORDEN.indexOf(a.regimen), REGIMENES_ORDEN.indexOf(b.regimen))
    || descendente(a.valoracion?.nota, b.valoracion?.nota)
    || porPuntuacion(a, b);
}

function calidadPrecio(o, costes) {
  const porPersona = costes.get(o.id)?.porPersona;
  return o.valoracion?.nota > 0 && porPersona > 0 ? (o.valoracion.nota / porPersona) * 100 : null;
}

const cabeEnPresupuesto = (coste, f) => coste?.total != null
  && (f.presupuestoPor === 'persona' ? coste.porPersona : coste.total) <= f.presupuesto;

const comparadoresEscapadas = (distancias, costes) => ({
  // Sin total (falta precio, unidad o cómo llegar) van al final: no se comparan con lo que sí lo tiene.
  total: (a, b) => ascendente(costes.get(a.id)?.total, costes.get(b.id)?.total) || porPuntuacion(a, b),
  persona: (a, b) => ascendente(costes.get(a.id)?.porPersona, costes.get(b.id)?.porPersona) || porPuntuacion(a, b),
  comodo: porComodidad(distancias),
  // Calidad/precio: nota sobre 10 por cada 100 € por persona. Sin nota o sin total, al final.
  calidad: (a, b) => descendente(calidadPrecio(a, costes), calidadPrecio(b, costes)) || porPuntuacion(a, b),
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
  // Sin un punto en los filtros, desde tu salida (o desde el origen del escaneo).
  const distancias = medirDistancias(ofertas, f.punto ?? ctx.salida ?? null, ctx.origen);
  let lista = ofertas.filter((o) => esEscapada(o) && cumpleEscapada(o, f, ctx, distancias.get(o.id)));
  const costes = new Map(f.presupuesto || ['total', 'persona', 'calidad'].includes(f.orden)
    ? lista.map((o) => [o.id, costeViaje(o, { viajeros: ctx.viajeros, noches: ctx.noches, distancia: distancias.get(o.id), coche: ctx.coche })])
    : []);
  // Con presupuesto solo entran las que tienen un total que se puede comprobar.
  const sinTotal = f.presupuesto ? lista.filter((o) => costes.get(o.id).total == null).length : 0;
  if (f.presupuesto) lista = lista.filter((o) => cabeEnPresupuesto(costes.get(o.id), f));
  const comparador = comparadoresEscapadas(distancias, costes)[f.orden] ?? porPuntuacion;
  return { ofertas: alFinalSinComprobar(lista.sort(comparador), ctx), distancias, costes, sinTotal };
}

// ── Actividades ──────────────────────────────────────────────────────────────

const COMPARADORES_ACTIVIDADES = {
  puntuacion: (a, b) => porPuntuacion(a, b) || ascendente(a.precio, b.precio),
  precio: porPrecio,
  valoracion: (a, b) => descendente(a.valoracion?.nota, b.valoracion?.nota) || porPuntuacion(a, b),
};

const cumpleActividad = (o, f, ctx) => cumpleComunes(o, f, ctx)
  && (!f.gratis || o.precio === 0)
  && (!f.dest || o.lugar?.nombre === f.dest || o.lugar?.region === f.dest);

/**
 * Actividades (entradas, visitas y free tours) que cumplen los filtros, ya ordenadas.
 * Las distancias son siempre desde el origen: se toman de `ctx.distancias` si vienen.
 */
export function buscarActividades(ofertas, f, ctx = {}) {
  return alFinalSinComprobar(ofertas.filter((o) => esActividad(o) && cumpleActividad(o, f, ctx))
    .sort(COMPARADORES_ACTIVIDADES[f.orden] ?? porPuntuacion), ctx);
}

/** Las mejores actividades que se pueden hacer en un periodo {id, desde}. */
export function actividadesPara(ofertas, periodo, { max = 4, descartadas } = {}) {
  return ofertas
    .filter((o) => esActividad(o) && !esDuplicada(o) && !descartadas?.has(o.id) && disponibleEn(o, periodo))
    .sort(porPuntuacion)
    .slice(0, max);
}

/** Mismo pueblo o ciudad (por nombre), o a menos de 25 km si hay coordenadas. */
const KM_MISMO_LUGAR = 25;
function mismoLugar(a, b) {
  if (!a || !b) return false;
  if (a.nombre && b.nombre && normalizar(a.nombre) === normalizar(b.nombre)) return true;
  const km = distanciaKm(a, b);
  return km != null && km <= KM_MISMO_LUGAR;
}

/** Actividades en el mismo lugar que `oferta` («Qué hacer allí» de la ficha). */
export function actividadesCerca(ofertas, oferta, { max = 3 } = {}) {
  if (!oferta || esActividad(oferta)) return [];
  return ofertas
    .filter((o) => esActividad(o) && o.id !== oferta.id && !esDuplicada(o) && mismoLugar(o.lugar, oferta.lugar))
    .sort(porPuntuacion)
    .slice(0, max);
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
  return alFinalSinComprobar(ofertas.filter((o) => cumpleComunes(o, f, ctx)).sort(porPuntuacion), ctx);
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
    return esEscapada(o) && d?.minutos != null && d.minutos <= horasMax * 60;
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
    .filter((o) => !ctx.favoritos?.has(o.id) && esEscapada(o) && !esDuplicada(o))
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
        escapadas: disponibles.filter((o) => esEscapada(o)).sort((a, b) => suyas(a) - suyas(b) || porPuntuacion(a, b)),
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
    const escapadas = ofertas.filter((o) => esEscapada(o) && disponibleEn(o, periodo)).length;
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

/** «2 noches», «de 2 a 3 noches», «3 noches o más». */
function textoNoches(noches) {
  if (typeof noches === 'number') return `${noches} ${noches === 1 ? 'noche' : 'noches'}`;
  const { min, max } = noches ?? {};
  if (min != null && max != null) return `de ${min} a ${max} noches`;
  if (min != null) return `${min} noches o más`;
  return `${max} noches o menos`;
}

/** Condiciones de un criterio de vigilados en frases cortas. */
export function describirCriterio(c, { temas = [], origen = null, periodos = [] } = {}) {
  const nombreTema = (id) => {
    const tema = temas.find((t) => t.id === id);
    return tema ? tema.nombre : `tema ${id}`;
  };
  const cerca = c.cerca && (esMismoPunto(c.cerca, origen) ? origen.nombre : `${c.cerca.lat.toFixed(2)}, ${c.cerca.lon.toFixed(2)}`);
  const periodo = periodos.find((p) => p.id === c.finde);
  return [
    c.ofertaId && 'una oferta concreta',
    c.texto && `contiene «${c.texto}»`,
    c.tipo && `tipo ${c.tipo}`,
    c.tema && nombreTema(c.tema),
    c.temas?.length && c.temas.map(nombreTema).join(' o '),
    c.alojamiento && (ETIQUETAS_ALOJAMIENTO[c.alojamiento] ?? c.alojamiento),
    c.regimenMinimo && `${ETIQUETAS_REGIMEN[c.regimenMinimo] ?? c.regimenMinimo} o mejor`,
    c.fuente && `fuente ${c.fuente}`,
    c.aeropuerto && `desde ${c.aeropuerto}`,
    c.precioMax && `hasta ${euros(c.precioMax)} publicados`,
    c.presupuestoMax && `viaje completo hasta ${euros(c.presupuestoMax)} ${c.presupuestoPor === 'persona' ? 'por persona' : 'en total'}${c.viajeros ? ` (${c.viajeros} ${c.viajeros === 1 ? 'persona' : 'personas'})` : ''}`,
    (c.desde || c.hasta) && `${c.desde ? `del ${etiquetaDia(c.desde)}` : ''}${c.desde && c.hasta ? ' ' : ''}${c.hasta ? `al ${etiquetaDia(c.hasta)}` : ''}`,
    c.precioNocheMax && `hasta ${euros(c.precioNocheMax)} por persona y noche`,
    c.valoracionMin && `valoración ${c.valoracionMin} o más`,
    c.descuentoMin && `descuento del ${c.descuentoMin} % o más`,
    c.noches != null && textoNoches(c.noches),
    c.cocheMaxMin && `a menos de ${duracion(c.cocheMaxMin)} en coche`,
    c.cerca && `a menos de ${c.cerca.radioKm} km de ${cerca}`,
    c.pais && `en ${c.pais}`,
    c.region && `en ${c.region}`,
    c.puente && 'solo en puentes',
    c.finde && `solo ${periodo?.etiqueta ?? c.finde}`,
    c.soloChollazos && 'solo chollazos',
    c.soloMinimoHistorico && 'solo en mínimo histórico',
  ].filter(Boolean);
}

/**
 * El precio en la unidad de su historial: por noche si la oferta es una estancia con
 * fechas que cambian (`historialPorNoche`, ver src/historial.js); si no, el publicado.
 */
export const precioDeSerie = (o) => (o.historialPorNoche && o.unidad === 'total' && o.noches > 0 && typeof o.precio === 'number'
  ? Math.round((o.precio / o.noches) * 100) / 100
  : o.precio);
/** « por noche» si el historial y la bajada de la oferta son por noche. */
export const sufijoSerie = (o) => (o.historialPorNoche ? ' por noche' : '');

/**
 * Estado de un vigilado con los datos que publica el escaneo: qué ofertas cumple
 * ahora mismo, cuál es la mejor y si esa mejor está en su precio más bajo.
 */
export function resumenVigilado(criterio, { porId = new Map(), historial = {} } = {}) {
  const ofertas = (criterio.coincidencias ?? []).map((id) => porId.get(id)).filter(Boolean);
  const precios = ofertas.map((o) => o.precio).filter((precio) => typeof precio === 'number');
  const mejor = [...ofertas].sort(porPrecio)[0] ?? null;
  const serie = (mejor && historial[mejor.id]) ?? [];
  const minimoSerie = serie.length >= 2 ? Math.min(...serie.map(([, precio]) => precio)) : null;
  return {
    criterio,
    activo: criterio.activo !== false,
    ofertas,
    total: ofertas.length,
    mejor,
    precioMin: precios.length ? Math.min(...precios) : null,
    enMinimo: Boolean(mejor?.minimoHistorico || (minimoSerie != null && precioDeSerie(mejor) <= minimoSerie)),
    diasHistorial: serie.length,
  };
}

/** Marca de `data-copiar-vigilado` para un criterio que ya está hecho (no sale de los filtros). */
export const marcaVigilado = (criterio) => `json:${encodeURIComponent(JSON.stringify(criterio))}`;

/**
 * Criterio para config/vigilados.json equivalente a los filtros actuales, o el que
 * lleve dentro la marca de `marcaVigilado`. Solo incluye lo que entiende
 * src/vigilados.js; el resto de filtros se pierde.
 */
export function criterioVigilado(nombre, f, { vista = 'escapadas', salida = null, viajeros = null } = {}) {
  if (vista.startsWith('json:')) return JSON.parse(decodeURIComponent(vista.slice('json:'.length)));
  const criterio = {
    nombre: nombre.trim() || 'Mi búsqueda',
    texto: analizarConsulta(f.q ?? '').incluye.join(' ') || undefined,
    tipo: ({ vuelos: 'vuelo', actividades: 'actividad' }[vista] ?? f.tipo) || undefined,
    tema: f.temas?.length === 1 ? f.temas[0] : undefined,
    temas: f.temas?.length > 1 ? f.temas : undefined,
    fuente: f.fuente || undefined,
    aeropuerto: f.aero || undefined,
    alojamiento: f.alojamiento || undefined,
    regimenMinimo: f.regimen || undefined,
    valoracionMin: f.nota ?? undefined,
    descuentoMin: f.dto ?? undefined,
    precioMax: f.max ?? undefined,
    precioNocheMax: f.nocheMax ?? undefined,
    noches: f.noches ?? undefined,
    // El tiempo en coche del escaneo es desde su origen: desde otro punto (el de los filtros
    // o tu salida) se vigila un radio equivalente alrededor de ese punto.
    cocheMaxMin: f.horas && !(f.punto ?? salida) ? f.horas * 60 : undefined,
    cerca: (f.punto ?? (f.horas || f.km ? salida : null))
      ? { lat: Number((f.punto ?? salida).lat.toFixed(4)), lon: Number((f.punto ?? salida).lon.toFixed(4)), radioKm: Math.round(radioBusquedaKm(f) ?? 100) }
      : undefined,
    desde: f.desde || undefined,
    hasta: f.hasta || undefined,
    presupuestoMax: f.presupuesto ?? undefined,
    presupuestoPor: f.presupuesto && f.presupuestoPor === 'persona' ? 'persona' : undefined,
    viajeros: f.presupuesto && viajeros ? viajeros : undefined,
    pais: f.pais || undefined,
    region: f.region || undefined,
    // «cuando» es 'finde', 'puente' o el id de un finde o de un puente concretos (su
    // fecha: '2026-10-10'); src/vigilados.js acepta los dos ids en `finde`.
    puente: f.cuando === 'puente' || undefined,
    finde: (vista === 'vuelos' ? f.finde : !['', 'finde', 'puente'].includes(f.cuando ?? '') && f.cuando) || undefined,
    soloChollazos: f.chollazo || undefined,
    soloMinimoHistorico: f.historico || undefined,
  };
  return Object.fromEntries(Object.entries(criterio).filter(([, valor]) => valor !== undefined));
}

/**
 * Enlace al editor de GitHub de config/vigilados.json cuando el panel está en
 * Pages (usuario.github.io/repo/); null si se está viendo en local.
 */
export function urlEditarVigilados({ hostname = '', pathname = '/' } = {}) {
  const usuario = hostname.match(/^([^.]+).github.io$/i)?.[1];
  if (!usuario) return null;
  const primero = pathname.split('/').filter(Boolean)[0];
  const repo = primero && !primero.endsWith('.html') ? primero : `${usuario}.github.io`;
  return `https://github.com/${usuario}/${repo}/edit/main/config/vigilados.json`;
}

// ── Filtros puestos y atajos ─────────────────────────────────────────────────

/**
 * Atajos de la vista de escapadas: un clic pone varios filtros a la vez. Son enlaces
 * con su hash, así que también se pueden compartir o guardar en marcadores.
 */
export const ATAJOS_ESCAPADAS = [
  { texto: 'Lo más barato en total', icono: 'cartera', params: { orden: 'total' } },
  { texto: 'Lo más cómodo', icono: 'coche', params: { orden: 'comodo' } },
  { texto: 'Este finde, lo más barato', icono: 'finde', params: { cuando: 'finde', orden: 'total' } },
  { texto: 'Por debajo de lo normal', icono: 'bajada', params: { orden: 'ahorro' } },
  { texto: 'Spa a menos de 2 h', icono: 'tema-spa', params: { temas: 'spa', h: '2' } },
  { texto: 'Con niños', icono: 'tema-familia', params: { ninos: 'apto' } },
  { texto: 'Niños gratis o con descuento', icono: 'tema-familia', params: { ninos: 'ventaja' } },
  { texto: 'Campings', icono: 'camping', params: { aloj: 'camping' } },
  { texto: 'Sin coche', icono: 'tren', params: { sincoche: '1' } },
  { texto: 'Solo chollazos', icono: 'fuego', params: { cho: '1' } },
  { texto: 'Con fechas cerradas', icono: 'calendario', params: { cerradas: '1' } },
];

/**
 * Los filtros guardados sin lo que ya ha caducado: un finde o un puente que ya pasó y
 * fechas anteriores a hoy. Si no, la memoria de filtros dejaría la vista vacía.
 * @param {Record<string, string>} params
 * @param {{hoy: string, findes?: object[], puentes?: object[]}} contexto
 */
export function filtrosVigentes(params = {}, { hoy, findes = [], puentes = [] } = {}) {
  const vigentes = { ...params };
  const periodoVivo = (id) => ['finde', 'puente'].includes(id)
    || findes.some((f) => f.id === id && f.domingo >= hoy) || puentes.some((p) => p.id === id && p.hasta >= hoy);
  for (const clave of ['cuando', 'finde']) if (vigentes[clave] && !periodoVivo(vigentes[clave])) delete vigentes[clave];
  if (vigentes.hasta && vigentes.hasta < hoy) {
    delete vigentes.desde;
    delete vigentes.hasta;
  } else if (vigentes.desde && vigentes.desde < hoy) {
    vigentes.desde = hoy;
  }
  return vigentes;
}

/** Parámetros que no filtran (ordenan o acompañan a otro) y no salen como chip. */
const NO_SON_FILTROS = new Set(['orden', 'lat', 'lon', 'prespor', 'sal', 'slat', 'slon', 'vj', 'nc']);

/**
 * Tu salida, viajeros y noches en los parámetros de un enlace compartido (sal, slat, slon,
 * vj, nc), para que quien lo abra vea lo mismo si quiere. No son filtros.
 */
export function paramsViaje(salida, viaje) {
  return {
    ...(salida ? { sal: salida.nombre, slat: salida.lat.toFixed(2), slon: salida.lon.toFixed(2) } : {}),
    vj: String(viaje.viajeros), nc: String(viaje.noches),
  };
}

/** Lo que trae un enlace compartido, o null si no trae nada. Sin validar (lo hace viaje.js). */
export function viajeDeParams(p = {}) {
  if (!p.vj && !p.sal) return null;
  return {
    salida: p.sal ? { nombre: p.sal, lat: p.slat, lon: p.slon } : null,
    viaje: { viajeros: p.vj, noches: p.nc },
  };
}
/** Listas separadas por comas: un chip por cada valor. */
const LISTAS = new Set(['temas', 'notemas', 'nodest']);
const textoNochesFiltro = (n) => (n === '3' ? '3 noches o más' : n === '1' ? '1 noche' : `${n} noches`);

/**
 * Texto de cada filtro para la fila de «lo que tienes puesto». Devuelve null para
 * los valores que no filtran nada (p. ej. «cru=1», que es lo de fábrica).
 */
function textoFiltro(clave, valor, ctx) {
  const tema = (id) => {
    const t = ctx.temas?.get(id);
    return t ? t.nombre : id;
  };
  const periodo = (id) => {
    if (id === 'finde') return 'Este finde';
    if (id === 'puente') return 'Próximo puente';
    return ctx.findes?.find((f) => f.id === id)?.etiqueta ?? ctx.puentes?.find((p) => p.id === id)?.nombre ?? id;
  };
  const numeroEuros = (v) => euros(Number(v));
  const textos = {
    q: () => `«${valor}»`,
    temas: () => tema(valor),
    notemas: () => `Sin ${tema(valor)}`,
    nodest: () => `Sin ${valor}`,
    cuando: () => periodo(valor),
    finde: () => periodo(valor),
    lugar: () => `Cerca de ${valor}`,
    h: () => `Menos de ${valor} h en coche`,
    km: () => `Hasta ${valor} km`,
    max: () => `Hasta ${numeroEuros(valor)} publicados`,
    pres: () => `Hasta ${numeroEuros(valor)} ${ctx.params?.prespor === 'persona' ? 'por persona' : 'en total'} (viaje completo)`,
    pnMin: () => `Desde ${numeroEuros(valor)} por persona y noche`,
    pnMax: () => `Hasta ${numeroEuros(valor)} por persona y noche`,
    dto: () => `Descuento del ${valor} % o más`,
    pts: () => `Puntuación ${valor} o más`,
    nota: () => `Valoración ${valor} o más`,
    noches: () => textoNochesFiltro(valor),
    clasica: () => 'Escapada clásica (2 noches)',
    regimen: () => `Al menos ${(ETIQUETAS_REGIMEN[valor] ?? valor).toLowerCase()}`,
    aloj: () => ETIQUETAS_ALOJAMIENTO[valor] ?? valor,
    est: () => (valor === '5' ? '5★' : `${valor}★ o más`),
    transporte: () => ETIQUETAS_TRANSPORTE[valor] ?? valor,
    sincoche: () => 'Sin coche',
    fuente: () => `Solo ${ctx.fuentes?.get(valor) ?? valor}`,
    tipo: () => `Solo ${(ETIQUETAS_TIPO[valor] ?? valor).toLowerCase()}`,
    pais: () => valor,
    region: () => valor,
    dest: () => valor,
    aero: () => `Desde ${valor}`,
    ideal: () => 'Horario ideal',
    mios: () => 'Desde mis aeropuertos',
    nuevas: () => 'Solo novedades',
    fav: () => 'Solo favoritos',
    cho: () => 'Solo chollazos',
    baja: () => 'Con bajada de precio',
    hist: () => 'Mínimo histórico',
    sindesc: () => (valor === '0' ? 'Con las descartadas y las no disponibles' : null),
    frescas: () => 'Solo comprobadas hace poco',
    dup: () => 'Con las repetidas',
    cru: () => (valor === '0' ? 'Con cruceros' : null),
    cerradas: () => 'Solo con fechas cerradas',
    gratis: () => 'Solo gratis',
    ninos: () => ETIQUETAS_NINOS[valor] ?? valor,
  };
  return (textos[clave] ?? (() => `${clave}: ${valor}`))();
}

/**
 * Lo que tienes puesto en `params`, como chips: [{clave, texto, hash}], donde `hash`
 * es la misma búsqueda sin ese filtro. Las listas dan un chip por valor; el lugar se
 * quita con sus coordenadas, y «desde» y «hasta» iguales son un solo día.
 * @param {string} vista
 * @param {Record<string, string>} params
 * @param {{temas?: Map, fuentes?: Map, findes?: object[], puentes?: object[]}} [ctx]
 */
export function filtrosActivos(vista, params = {}, ctx = {}) {
  const sin = (...claves) => crearHash(vista, Object.fromEntries(Object.entries(params).filter(([c]) => !claves.includes(c))));
  const chips = [];
  for (const [clave, valor] of Object.entries(params)) {
    if (!valor || NO_SON_FILTROS.has(clave)) continue;
    if (LISTAS.has(clave)) {
      for (const parte of lista(valor)) {
        const resto = lista(valor).filter((v) => v !== parte).join(',');
        chips.push({ clave, valor: parte, texto: textoFiltro(clave, parte, { ...ctx, params }), hash: crearHash(vista, { ...params, [clave]: resto }) });
      }
      continue;
    }
    if (clave === 'desde' || clave === 'hasta') {
      const { desde, hasta } = params;
      if (desde && desde === hasta) {
        if (clave === 'desde') chips.push({ clave: 'desde', texto: `El ${etiquetaDia(desde)}`, hash: sin('desde', 'hasta') });
        continue;
      }
      if (dia(valor)) chips.push({ clave, texto: `${clave === 'desde' ? 'Desde' : 'Hasta'} el ${etiquetaDia(valor)}`, hash: sin(clave) });
      continue;
    }
    const texto = textoFiltro(clave, valor, { ...ctx, params });
    if (texto) chips.push({ clave, texto, hash: clave === 'lugar' ? sin('lugar', 'lat', 'lon') : sin(clave) });
  }
  // Un punto sin nombre (solo coordenadas) también es un filtro.
  if (!params.lugar && params.lat && params.lon) chips.push({ clave: 'lugar', texto: 'Cerca del punto elegido', hash: sin('lat', 'lon') });
  return chips;
}
