/**
 * Kilómetros y minutos reales por carretera desde tu salida. El escaneo los calcula con OSRM
 * desde su origen; desde otra salida, el panel los pide a OSRM (el mismo servicio) para los
 * destinos de las ofertas y los guarda en este navegador. Mientras llegan, o si no se puede,
 * se sigue con la estimación (línea recta × 1,3). Sin DOM: `pedir` y `esperar` se inyectan.
 */

import { distanciaKm, tieneCoordenadas } from './geo.js';

export const URL_OSRM = 'https://router.project-osrm.org/table/v1/driving/';
/** Destinos por petición (el servidor público admite 100 puntos por tabla). */
export const LOTE_RUTAS = 80;
/** Entre petición y petición: el servidor público pide no pasar de una por segundo. */
export const PAUSA_RUTAS_MS = 1100;
/** Más lejos que esto en línea recta no se pide ruta (como el escaneo). */
const MAX_KM_LINEA_RECTA = 1200;

/** Clave de un punto con unos 100 m de precisión: la misma para el mismo pueblo. */
export const clavePunto = ({ lat, lon }) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;

/**
 * Destinos distintos a los que hay que pedir ruta desde `salida`: los de `distancias` que
 * se pueden hacer en coche (con minutos estimados) y no están ya en `conocidas`.
 * @param {Map<string, {minutos: number|null}>} distancias de medirDistancias desde la salida
 */
export function destinosSinRuta(ofertas, distancias, salida, conocidas = new Map()) {
  const destinos = new Map();
  for (const o of ofertas) {
    const d = distancias.get(o.id);
    if (!d || d.minutos == null || !tieneCoordenadas(o.lugar)) continue;
    const clave = clavePunto(o.lugar);
    if (conocidas.has(clave) || destinos.has(clave) || distanciaKm(salida, o.lugar) > MAX_KM_LINEA_RECTA) continue;
    destinos.set(clave, { lat: o.lugar.lat, lon: o.lugar.lon });
  }
  return destinos;
}

/**
 * Pide a OSRM las rutas desde `salida` a `destinos` (Map clave → punto), por lotes.
 * Devuelve las que ha conseguido (clave → {min, km}); un lote que falla se salta.
 */
export async function pedirRutas(salida, destinos, { pedir, esperar = () => Promise.resolve() }) {
  const rutas = new Map();
  const lista = [...destinos];
  for (let i = 0; i < lista.length; i += LOTE_RUTAS) {
    if (i > 0) await esperar(PAUSA_RUTAS_MS);
    const lote = lista.slice(i, i + LOTE_RUTAS);
    const coordenadas = [salida, ...lote.map(([, p]) => p)].map(({ lat, lon }) => `${Number(lon).toFixed(5)},${Number(lat).toFixed(5)}`).join(';');
    try {
      const respuesta = await pedir(`${URL_OSRM}${coordenadas}?sources=0&annotations=duration,distance`);
      if (respuesta?.code !== 'Ok') continue;
      lote.forEach(([clave], j) => {
        const segundos = respuesta.durations?.[0]?.[j + 1];
        const metros = respuesta.distances?.[0]?.[j + 1];
        if (Number.isFinite(segundos) && Number.isFinite(metros)) rutas.set(clave, { min: Math.round(segundos / 60), km: Math.round(metros / 1000) });
      });
    } catch {
      // Sin red o con el servidor ocupado: esas siguen estimadas y se reintentan otro día.
    }
  }
  return rutas;
}
