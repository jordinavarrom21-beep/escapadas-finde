/**
 * Previsión del tiempo en el destino (Open-Meteo: gratis, sin clave y con varias
 * coordenadas por petición) para el fin de semana o el puente de cada oferta.
 */
import { ZONA, fechaLocal, sumarDias } from '../util/fechas.js';

const URL_OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const VARIABLES = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
const DIAS_PREVISION = 16;
const MAX_COORDENADAS = 50;
const PAUSA_MS = 1000;
const CADUCIDAD_MS = 3 * 60 * 60 * 1000;

/** Códigos WMO que devuelve Open-Meteo, con su descripción en español. */
export const CODIGOS_TIEMPO = {
  0: { texto: 'despejado', emoji: '☀️' },
  1: { texto: 'casi despejado', emoji: '🌤️' },
  2: { texto: 'parcialmente nublado', emoji: '⛅' },
  3: { texto: 'nublado', emoji: '☁️' },
  45: { texto: 'niebla', emoji: '🌫️' },
  48: { texto: 'niebla con escarcha', emoji: '🌫️' },
  51: { texto: 'llovizna ligera', emoji: '🌦️' },
  53: { texto: 'llovizna', emoji: '🌦️' },
  55: { texto: 'llovizna intensa', emoji: '🌦️' },
  56: { texto: 'llovizna helada', emoji: '🌧️' },
  57: { texto: 'llovizna helada intensa', emoji: '🌧️' },
  61: { texto: 'lluvia ligera', emoji: '🌦️' },
  63: { texto: 'lluvia', emoji: '🌧️' },
  65: { texto: 'lluvia fuerte', emoji: '🌧️' },
  66: { texto: 'lluvia helada', emoji: '🌧️' },
  67: { texto: 'lluvia helada fuerte', emoji: '🌧️' },
  71: { texto: 'nieve ligera', emoji: '🌨️' },
  73: { texto: 'nieve', emoji: '❄️' },
  75: { texto: 'nieve intensa', emoji: '❄️' },
  77: { texto: 'granos de nieve', emoji: '🌨️' },
  80: { texto: 'chubascos ligeros', emoji: '🌦️' },
  81: { texto: 'chubascos', emoji: '🌧️' },
  82: { texto: 'chubascos fuertes', emoji: '⛈️' },
  85: { texto: 'chubascos de nieve', emoji: '🌨️' },
  86: { texto: 'chubascos de nieve fuertes', emoji: '🌨️' },
  95: { texto: 'tormenta', emoji: '⛈️' },
  96: { texto: 'tormenta con granizo', emoji: '⛈️' },
  99: { texto: 'tormenta con granizo fuerte', emoji: '⛈️' },
};

const DESCONOCIDO = { texto: 'tiempo variable', emoji: '🌡️' };

/** Emoji del código WMO, para el panel y los emails. */
export function emojiTiempo(codigo) {
  return (CODIGOS_TIEMPO[codigo] ?? DESCONOCIDO).emoji;
}

const tieneCoordenadas = (lugar) => typeof lugar?.lat === 'number' && typeof lugar?.lon === 'number';
const redondear = ({ lat, lon }) => ({ lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) });
const clave = ({ lat, lon }, dia) => `tiempo:${lat},${lon}:${dia}`;

/**
 * Días que ocupa el viaje de una oferta: su puente, su fin de semana o, si no
 * tiene fechas, el próximo fin de semana.
 * @returns {{desde: string, hasta: string}|null}
 */
export function periodoViaje(oferta, ctx) {
  const { findeId, puenteId } = oferta.fechas;
  const puente = ctx.puentes.find((p) => p.id === puenteId);
  if (puente) return { desde: puente.desde, hasta: puente.hasta };
  const finde = findeId ? ctx.findes.find((f) => f.id === findeId) : ctx.findes[0];
  return finde ? { desde: finde.viernes, hasta: finde.domingo } : null;
}

/** Día central del periodo: el sábado de un finde, el día de en medio de un puente. */
function diaRepresentativo({ desde, hasta }) {
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
  return sumarDias(desde, Math.floor(dias / 2));
}

function guardarPrevision(punto, prevision, ctx) {
  const dias = prevision?.daily;
  if (!Array.isArray(dias?.time)) return;
  dias.time.forEach((dia, i) => {
    const codigo = dias.weather_code[i];
    ctx.cache.guardar(clave(punto, dia), {
      dia,
      maxC: Math.round(dias.temperature_2m_max[i]),
      minC: Math.round(dias.temperature_2m_min[i]),
      lluviaPct: dias.precipitation_probability_max[i] ?? null,
      codigo,
      texto: (CODIGOS_TIEMPO[codigo] ?? DESCONOCIDO).texto,
    }, ctx.ahora.getTime());
  });
}

async function pedirPrevisiones(puntos, ctx) {
  for (let i = 0; i < puntos.length; i += MAX_COORDENADAS) {
    if (i > 0) await ctx.http.esperar(PAUSA_MS);
    const lote = puntos.slice(i, i + MAX_COORDENADAS);
    const parametros = new URLSearchParams({
      latitude: lote.map((p) => p.lat).join(','),
      longitude: lote.map((p) => p.lon).join(','),
      daily: VARIABLES,
      timezone: ZONA,
      forecast_days: String(DIAS_PREVISION),
    });
    try {
      const respuesta = await ctx.http.json(`${URL_OPEN_METEO}?${parametros}`);
      const previsiones = Array.isArray(respuesta) ? respuesta : [respuesta];
      lote.forEach((punto, j) => guardarPrevision(punto, previsiones[j], ctx));
    } catch (error) {
      ctx.log(`No se ha podido consultar la previsión del tiempo: ${error.message}`);
    }
  }
}

/**
 * Rellena `tiempo` en las ofertas con coordenadas cuyo finde o puente cae dentro
 * de los 16 días de previsión. Si Open-Meteo falla, las deja como estaban.
 */
export async function anadirTiempo(ofertas, ctx) {
  const hoy = fechaLocal(ctx.ahora);
  const ultimoDia = sumarDias(hoy, DIAS_PREVISION - 1);
  const ahora = ctx.ahora.getTime();

  const candidatas = [];
  for (const oferta of ofertas) {
    if (!tieneCoordenadas(oferta.lugar)) continue;
    const periodo = periodoViaje(oferta, ctx);
    if (!periodo || periodo.desde > ultimoDia || periodo.hasta < hoy) continue;
    // Si el viaje ya ha empezado, el día útil es hoy.
    const dia = diaRepresentativo(periodo);
    candidatas.push({ oferta, punto: redondear(oferta.lugar), dia: dia < hoy ? hoy : dia });
  }
  if (!candidatas.length) return;

  const pendientes = new Map();
  for (const { punto, dia } of candidatas) {
    if (ctx.cache.obtener(clave(punto, dia), CADUCIDAD_MS, ahora) === undefined) {
      pendientes.set(`${punto.lat},${punto.lon}`, punto);
    }
  }
  if (pendientes.size) await pedirPrevisiones([...pendientes.values()], ctx);

  for (const { oferta, punto, dia } of candidatas) {
    const prevision = ctx.cache.obtener(clave(punto, dia), CADUCIDAD_MS, ahora);
    if (prevision) oferta.tiempo = prevision;
  }
}
