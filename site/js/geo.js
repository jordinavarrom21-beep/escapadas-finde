/**
 * Distancias, tiempo en coche y geocodificación con Photon. Sin DOM.
 */

export const FACTOR_CARRETERA = 1.3;
export const VELOCIDAD_MEDIA_KMH = 80;
/** Dos puntos a menos de esta distancia se consideran el mismo (p. ej. el origen). */
const MISMO_PUNTO_KM = 2;
const URL_PHOTON = 'https://photon.komoot.io/api/';

export const tieneCoordenadas = (p) => p != null && Number.isFinite(p.lat) && Number.isFinite(p.lon);

/** Distancia en línea recta (haversine) en km, o null si falta alguna coordenada. */
export function distanciaKm(a, b) {
  if (!tieneCoordenadas(a) || !tieneCoordenadas(b)) return null;
  const rad = (grados) => (grados * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Minutos en coche estimados: línea recta × 1,3 a 80 km/h. */
export function estimarMinutos(km) {
  return Math.round(((km * FACTOR_CARRETERA) / VELOCIDAD_MEDIA_KMH) * 60);
}

/** Radio en línea recta equivalente a `minutos` en coche según la estimación. */
export function radioKmParaMinutos(minutos) {
  return ((minutos / 60) * VELOCIDAD_MEDIA_KMH) / FACTOR_CARRETERA;
}

export function esMismoPunto(a, b) {
  const km = distanciaKm(a, b);
  return km != null && km <= MISMO_PUNTO_KM;
}

/**
 * Minutos en coche desde `punto` (o desde el origen si no hay punto) hasta la oferta.
 * Desde el origen usa `cocheMin` calculado por el escáner; desde otro punto, la estimación.
 * null si la oferta no tiene coordenadas o no se llega en coche (vuelos, islas…).
 */
export function minutosEnCoche(oferta, punto, origen) {
  const lugar = oferta.lugar;
  if (!tieneCoordenadas(lugar) || oferta.tipo === 'vuelo' || oferta.transporte === 'avion' || oferta.transporte === 'ferry') return null;
  const desde = punto ?? origen;
  if ((!punto || esMismoPunto(punto, origen)) && typeof oferta.cocheMin === 'number') return oferta.cocheMin;
  const km = distanciaKm(desde, lugar);
  return km == null ? null : estimarMinutos(km);
}

/** URL de autocompletado de Photon, sesgada hacia `cerca` si se indica. */
export function urlPhoton(texto, cerca = null) {
  // Photon no admite lang=es (solo default, de, en, fr): «default» devuelve los nombres locales.
  const parametros = new URLSearchParams({ q: texto, lang: 'default', limit: '5' });
  if (tieneCoordenadas(cerca)) {
    parametros.set('lat', cerca.lat.toFixed(2));
    parametros.set('lon', cerca.lon.toFixed(2));
  }
  return `${URL_PHOTON}?${parametros}`;
}

/**
 * Sugerencias a partir de la respuesta GeoJSON de Photon, sin repetidas.
 * @returns {{nombre: string, detalle: string, lat: number, lon: number}[]}
 */
export function parsearPhoton(json) {
  const vistas = new Set();
  return (json?.features ?? []).flatMap(({ geometry, properties: p = {} }) => {
    const [lon, lat] = geometry?.coordinates ?? [];
    if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const detalle = [...new Set([p.city, p.county, p.state, p.country])].filter((parte) => parte && parte !== p.name).join(', ');
    const clave = `${p.name}|${detalle}`;
    if (vistas.has(clave)) return [];
    vistas.add(clave);
    return [{ nombre: p.name, detalle, lat, lon }];
  });
}
