/**
 * Qué pasa cerca del destino esos días (conciertos, fiestas, ferias, teatro…): la «Agenda
 * cultural de Catalunya (per localitzacions)» de Dades Obertes (Socrata SODA) y las demás
 * agendas por zona de agendas.js (Euskadi, Castilla y León, Madrid y, con clave, Ticketmaster
 * en toda España). Cada oferta se queda con lo que pasa a menos de 25 km en sus fechas.
 */
import { fechaLocal, sumarDias } from '../util/fechas.js';
import { normalizarTexto } from '../util/xml.js';
import { formatearToponimo } from '../util/toponimos.js';
import { distanciaKm } from './geo.js';
import { periodoViaje } from './tiempo.js';
import { PROVEEDORES, noEsUnPlan, tipoEvento } from './agendas.js';

const RECURSO = 'https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json';
const CAMPOS = 'codi,denominaci,data_inici,data_fi,localitat,municipi,latitud,longitud,urlactivitat,url,enlla_os,tags_categor_es,tags_mbits';
const DIAS_VENTANA = 30;
const MAX_DESCARGA = 2000;
/** Los que se guardan por oferta: la ficha los agrupa por tipo; la tarjeta enseña el primero. */
const MAX_POR_OFERTA = 6;
/** Lo que dura más (exposiciones de meses) va detrás de lo que pasa solo esos días. */
const DIAS_PUNTUAL = 7;
const RADIO_KM = 25;
const CADUCIDAD_MS = 6 * 60 * 60 * 1000;
/** Rectángulo que envuelve Cataluña: fuera de aquí la agenda no tiene nada. */
const CATALUNA = { latMin: 40.45, latMax: 42.95, lonMin: 0.1, lonMax: 3.4 };
/** Palabras que en los topónimos catalanes van en minúscula. */
const MINUSCULAS = new Set(['de', 'del', 'la', 'les', 'el', 'els', 'i', 'sa', 'ses']);
/** Artículos y preposiciones que en el identificador pierden el apóstrofo («l-escala»). */
const ELIDIDAS = new Set(['l', 'd', 's']);

const enCataluna = (lugar) =>
  typeof lugar?.lat === 'number' && typeof lugar?.lon === 'number' &&
  lugar.lat >= CATALUNA.latMin && lugar.lat <= CATALUNA.latMax &&
  lugar.lon >= CATALUNA.lonMin && lugar.lon <= CATALUNA.lonMax;

const mayuscula = (palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1);

/**
 * «vilanova-i-la-geltru» → «Vilanova i la Geltru», «l-escala» → «L'Escala»,
 * «castell-platja-d-aro» → «Castell Platja d'Aro». Las tildes no están en el identificador.
 */
export function nombreDeSlug(slug) {
  const palabras = slug.split('-').filter(Boolean);
  const partes = [];
  for (let i = 0; i < palabras.length; i += 1) {
    const palabra = palabras[i];
    if (ELIDIDAS.has(palabra) && i + 1 < palabras.length) {
      partes.push(`${i === 0 ? mayuscula(palabra) : palabra}'${mayuscula(palabras[i + 1])}`);
      i += 1;
    } else {
      partes.push(i > 0 && MINUSCULAS.has(palabra) ? palabra : mayuscula(palabra));
    }
  }
  return partes.join(' ');
}

function municipioDe(fila) {
  if (fila.localitat) return fila.localitat;
  const slug = fila.municipi?.split('/').at(-1);
  return slug ? nombreDeSlug(slug) : null;
}

function enlaceDe(fila) {
  const candidatos = [fila.urlactivitat, fila.url, fila.enlla_os?.split(',')[0]];
  return candidatos.map((url) => url?.trim()).find((url) => url && /^https?:\/\//.test(url)) ?? null;
}

/** Fila de la agenda → evento propio, o null si le falta lo imprescindible o no es un plan. */
function normalizar(fila) {
  const lat = Number(fila.latitud);
  const lon = Number(fila.longitud);
  if (!fila.denominaci || !fila.data_inici || !Number.isFinite(lat) || !Number.isFinite(lon) || noEsUnPlan(fila.denominaci)) return null;
  return {
    nombre: fila.denominaci.trim(),
    desde: fila.data_inici.slice(0, 10),
    hasta: (fila.data_fi ?? fila.data_inici).slice(0, 10),
    url: enlaceDe(fila),
    municipio: municipioDe(fila),
    lat,
    lon,
    // «agenda:categories/concerts,agenda:categories/infantil»: lo primero que se reconozca.
    tipo: tipoEvento(fila.tags_categor_es, fila.tags_mbits, fila.denominaci),
  };
}

function urlConsulta(desde, hasta) {
  const parametros = new URLSearchParams({
    $select: CAMPOS,
    $where: `data_inici <= '${hasta}T23:59:59' AND data_fi >= '${desde}T00:00:00' AND latitud IS NOT NULL`,
    $order: 'data_inici',
    $limit: String(MAX_DESCARGA),
  });
  return `${RECURSO}?${parametros}`;
}

/**
 * Agenda de los próximos 30 días: una sola petición por ejecución, en caché 6 h bajo
 * una única clave (antes una por día, que se quedaban meses en data/cache.json). Si
 * el portal falla, vale la última agenda guardada: sus actos siguen teniendo fecha.
 */
const VERSION_AGENDA = 2;

async function descargarAgenda(ctx, desde, hasta) {
  const clave = 'eventos:agenda';
  const ahora = ctx.ahora.getTime();
  const fresca = ctx.cache.obtener(clave, CADUCIDAD_MS, ahora);
  // La versión 2 trae el tipo de cada acto: lo guardado antes se vuelve a descargar.
  if (fresca?.desde === desde && fresca.version === VERSION_AGENDA) return fresca.eventos;
  try {
    const filas = await ctx.http.json(urlConsulta(desde, hasta));
    if (!Array.isArray(filas)) throw new Error('respuesta inesperada del portal de datos abiertos');
    const eventos = filas.map(normalizar).filter(Boolean);
    ctx.cache.guardar(clave, { desde, version: VERSION_AGENDA, eventos }, ahora);
    return eventos;
  } catch (error) {
    const anterior = ctx.cache.obtener(clave)?.eventos;
    ctx.log(`Agenda cultural no disponible (${error.message}): ${anterior ? 'se usa la última guardada' : 'esta vez sin eventos'}`);
    return anterior ?? null;
  }
}

/**
 * Agenda de un proveedor de agendas.js para los próximos días, en caché 6 h (una clave por
 * fuente). Si la fuente falla, vale la última guardada; si tampoco hay, sin eventos de esa zona.
 */
async function descargarDe(proveedor, ctx, desde, hasta) {
  const clave = `eventos:${proveedor.id}`;
  const ahora = ctx.ahora.getTime();
  const fresca = ctx.cache.obtener(clave, CADUCIDAD_MS, ahora);
  // Con `version` un proveedor invalida lo guardado cuando cambia qué descarga.
  if (fresca?.desde === desde && (fresca.version ?? 1) === (proveedor.version ?? 1)) return fresca.eventos;
  try {
    const eventos = await proveedor.descargar(ctx, desde, hasta);
    ctx.cache.guardar(clave, { desde, version: proveedor.version ?? 1, eventos }, ahora);
    return eventos;
  } catch (error) {
    const anterior = ctx.cache.obtener(clave)?.eventos;
    ctx.log(`${proveedor.nombre} no disponible (${error.message}): ${anterior ? 'se usa la última guardada' : 'esta vez sin eventos de esa zona'}`);
    return anterior ?? [];
  }
}

const duracion = (e) => Math.round((Date.parse(e.hasta) - Date.parse(e.desde)) / 86_400_000);
/** Una exposición de meses «está» cualquier finde: cuenta como si estuviera 15 km más lejos. */
const KM_DE_MAS_LARGAS = 15;
const lejania = ({ evento, km }) => km + (evento.tipo === 'exposiciones' && duracion(evento) > DIAS_PUNTUAL ? KM_DE_MAS_LARGAS : 0);

/**
 * Rellena `eventos` con hasta 6 actos a menos de 25 km del destino cuyas fechas coinciden
 * con el finde o el puente de la oferta, del más cercano al más lejano (las exposiciones de
 * semanas, como si estuvieran más lejos: no tapan un concierto o una fiesta de esos días).
 */
export async function anadirEventos(ofertas, ctx) {
  // Los de la ejecución anterior podrían ser de un finde ya pasado.
  for (const oferta of ofertas) oferta.eventos = [];
  const desde = fechaLocal(ctx.ahora);
  const hasta = sumarDias(desde, DIAS_VENTANA);
  const candidatas = [];
  for (const oferta of ofertas) {
    const periodo = periodoViaje(oferta, ctx);
    if (typeof oferta.lugar?.lat !== 'number' || typeof oferta.lugar?.lon !== 'number' || !periodo || periodo.desde > hasta || periodo.hasta < desde) continue;
    // Si el viaje ya ha empezado, solo interesa lo que queda por delante.
    candidatas.push({ oferta, periodo: { desde: periodo.desde < desde ? desde : periodo.desde, hasta: periodo.hasta } });
  }
  if (!candidatas.length) return;

  // Solo se descarga la agenda de una zona si hay alguna oferta en ella.
  const agenda = [];
  if (candidatas.some(({ oferta }) => enCataluna(oferta.lugar))) agenda.push(...((await descargarAgenda(ctx, desde, hasta)) ?? []));
  for (const proveedor of PROVEEDORES) {
    if (proveedor.activo && !proveedor.activo(ctx)) continue;
    if (!candidatas.some(({ oferta }) => proveedor.zona(oferta.lugar))) continue;
    agenda.push(...await descargarDe(proveedor, ctx, desde, hasta));
  }
  if (!agenda.length) return;

  for (const { oferta, periodo } of candidatas) {
    const cercanos = agenda
      .filter((evento) => evento.desde <= periodo.hasta && evento.hasta >= periodo.desde)
      .map((evento) => ({ evento, km: distanciaKm(oferta.lugar, evento) }))
      .filter(({ km }) => km <= RADIO_KM)
      .sort((a, b) => lejania(a) - lejania(b))
      .map(({ evento, km }) => ({
        nombre: evento.nombre,
        fecha: evento.desde > periodo.desde ? evento.desde : periodo.desde,
        url: evento.url,
        // El pueblo del propio evento, bien escrito («Vall d'Aran»): no el de la oferta más cercana.
        municipio: formatearToponimo(evento.municipio),
        // Lo guardado por una versión anterior puede no traer el tipo: se saca del nombre.
        tipo: evento.tipo ?? tipoEvento(evento.nombre),
        km: Math.round(km * 10) / 10,
        ...(evento.precio ? { precio: evento.precio } : {}),
      }));
    oferta.eventos = sinRepetir(cercanos).slice(0, MAX_POR_OFERTA);
  }
}

/**
 * El mismo acto en el mismo municipio publicado varias veces («GospelPraise» el sábado y
 * «Gospelpraise» el domingo) cuenta una vez: se queda el primer día y el enlace que haya.
 */
export function sinRepetir(eventos) {
  const vistos = new Map();
  for (const evento of eventos) {
    const clave = `${normalizarTexto(evento.nombre).replace(/[^a-z0-9]/g, '')}|${normalizarTexto(evento.municipio ?? '')}`;
    const previo = vistos.get(clave);
    if (!previo) vistos.set(clave, { ...evento });
    else {
      if (evento.fecha < previo.fecha) previo.fecha = evento.fecha;
      previo.url ??= evento.url;
    }
  }
  return [...vistos.values()];
}
