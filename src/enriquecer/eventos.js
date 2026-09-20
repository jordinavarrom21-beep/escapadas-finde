/**
 * Qué pasa cerca del destino ese fin de semana, con la «Agenda cultural de
 * Catalunya (per localitzacions)» de Dades Obertes (Socrata SODA).
 * Solo cubre Cataluña: para el resto de destinos no hay eventos.
 */
import { fechaLocal, sumarDias } from '../util/fechas.js';
import { distanciaKm } from './geo.js';
import { periodoViaje } from './tiempo.js';

const RECURSO = 'https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json';
const CAMPOS = 'codi,denominaci,data_inici,data_fi,localitat,municipi,latitud,longitud,urlactivitat,url,enlla_os';
const DIAS_VENTANA = 30;
const MAX_DESCARGA = 2000;
const MAX_POR_OFERTA = 3;
const RADIO_KM = 25;
const CADUCIDAD_MS = 6 * 60 * 60 * 1000;
/** Rectángulo que envuelve Cataluña: fuera de aquí la agenda no tiene nada. */
const CATALUNA = { latMin: 40.45, latMax: 42.95, lonMin: 0.1, lonMax: 3.4 };
/** Palabras que en los topónimos catalanes van en minúscula. */
const MINUSCULAS = new Set(['de', 'del', 'la', 'les', 'el', 'els', 'i', 'd', 'l', 'sa', 'ses']);

const enCataluna = (lugar) =>
  typeof lugar?.lat === 'number' && typeof lugar?.lon === 'number' &&
  lugar.lat >= CATALUNA.latMin && lugar.lat <= CATALUNA.latMax &&
  lugar.lon >= CATALUNA.lonMin && lugar.lon <= CATALUNA.lonMax;

/** «vilanova-i-la-geltru» → «Vilanova i la Geltru». */
const deSlug = (slug) => slug
  .split('-')
  .map((palabra, i) => (i > 0 && MINUSCULAS.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)))
  .join(' ');

function municipioDe(fila) {
  if (fila.localitat) return fila.localitat;
  const slug = fila.municipi?.split('/').at(-1);
  return slug ? deSlug(slug) : null;
}

function enlaceDe(fila) {
  const candidatos = [fila.urlactivitat, fila.url, fila.enlla_os?.split(',')[0]];
  return candidatos.map((url) => url?.trim()).find((url) => url && /^https?:\/\//.test(url)) ?? null;
}

/** Fila de la agenda → evento propio, o null si le falta lo imprescindible. */
function normalizar(fila) {
  const lat = Number(fila.latitud);
  const lon = Number(fila.longitud);
  if (!fila.denominaci || !fila.data_inici || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    nombre: fila.denominaci.trim(),
    desde: fila.data_inici.slice(0, 10),
    hasta: (fila.data_fi ?? fila.data_inici).slice(0, 10),
    url: enlaceDe(fila),
    municipio: municipioDe(fila),
    lat,
    lon,
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

/** Agenda de los próximos 30 días: una sola petición por ejecución, en caché 6 h. */
async function descargarAgenda(ctx, desde, hasta) {
  const clave = `eventos:${desde}`;
  const ahora = ctx.ahora.getTime();
  const guardados = ctx.cache.obtener(clave, CADUCIDAD_MS, ahora);
  if (guardados) return guardados;
  try {
    const filas = await ctx.http.json(urlConsulta(desde, hasta));
    if (!Array.isArray(filas)) throw new Error('respuesta inesperada del portal de datos abiertos');
    const eventos = filas.map(normalizar).filter(Boolean);
    ctx.cache.guardar(clave, eventos, ahora);
    return eventos;
  } catch (error) {
    ctx.log(`Agenda cultural no disponible, esta vez sin eventos: ${error.message}`);
    return null;
  }
}

/**
 * Rellena `eventos` con hasta 3 actos a menos de 25 km del destino cuyas fechas
 * coinciden con el finde o el puente de la oferta, del más cercano al más lejano.
 */
export async function anadirEventos(ofertas, ctx) {
  const desde = fechaLocal(ctx.ahora);
  const hasta = sumarDias(desde, DIAS_VENTANA);
  const candidatas = [];
  for (const oferta of ofertas) {
    const periodo = periodoViaje(oferta, ctx);
    if (!enCataluna(oferta.lugar) || !periodo || periodo.desde > hasta || periodo.hasta < desde) continue;
    // Si el viaje ya ha empezado, solo interesa lo que queda por delante.
    candidatas.push({ oferta, periodo: { desde: periodo.desde < desde ? desde : periodo.desde, hasta: periodo.hasta } });
  }
  if (!candidatas.length) return;

  const agenda = await descargarAgenda(ctx, desde, hasta);
  if (!agenda) return;

  for (const { oferta, periodo } of candidatas) {
    oferta.eventos = agenda
      .filter((evento) => evento.desde <= periodo.hasta && evento.hasta >= periodo.desde)
      .map((evento) => ({ evento, km: distanciaKm(oferta.lugar, evento) }))
      .filter(({ km }) => km <= RADIO_KM)
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_POR_OFERTA)
      .map(({ evento }) => ({
        nombre: evento.nombre,
        fecha: evento.desde > periodo.desde ? evento.desde : periodo.desde,
        url: evento.url,
        municipio: evento.municipio,
      }));
  }
}
