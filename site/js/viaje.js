/**
 * Datos de tu viaje que elige cada persona en su navegador: desde dónde sale, cuántos
 * viajan y cuántas noches. Sin DOM. Nada de esto sale del navegador.
 */

import { distanciaKm, esMismoPunto, tieneCoordenadas } from './geo.js';

export const VIAJEROS = { min: 1, max: 10, porDefecto: 2 };
export const NOCHES = { min: 1, max: 7, porDefecto: 2 };
/** Un aeropuerto a menos de esto (en línea recta) cuenta como «tuyo». */
export const KM_AEROPUERTO_CERCANO = 150;

/** Aeropuertos con más chollos de salida en España y alrededores. */
export const AEROPUERTOS = [
  { iata: 'BCN', ciudad: 'Barcelona', lat: 41.2974, lon: 2.0833 },
  { iata: 'GRO', ciudad: 'Girona', lat: 41.901, lon: 2.7606 },
  { iata: 'REU', ciudad: 'Reus', lat: 41.1474, lon: 1.1672 },
  { iata: 'MAD', ciudad: 'Madrid', lat: 40.4719, lon: -3.5626 },
  { iata: 'VLC', ciudad: 'Valencia', lat: 39.4893, lon: -0.4816 },
  { iata: 'ALC', ciudad: 'Alicante', lat: 38.2822, lon: -0.5582 },
  { iata: 'AGP', ciudad: 'Málaga', lat: 36.6749, lon: -4.4991 },
  { iata: 'SVQ', ciudad: 'Sevilla', lat: 37.418, lon: -5.8931 },
  { iata: 'BIO', ciudad: 'Bilbao', lat: 43.3011, lon: -2.9106 },
  { iata: 'ZAZ', ciudad: 'Zaragoza', lat: 41.6662, lon: -1.0415 },
  { iata: 'PMI', ciudad: 'Palma de Mallorca', lat: 39.5517, lon: 2.7388 },
  { iata: 'IBZ', ciudad: 'Ibiza', lat: 38.8729, lon: 1.3731 },
  { iata: 'MAH', ciudad: 'Menorca', lat: 39.8626, lon: 4.2186 },
  { iata: 'SCQ', ciudad: 'Santiago', lat: 42.8963, lon: -8.4151 },
  { iata: 'VGO', ciudad: 'Vigo', lat: 42.2318, lon: -8.6268 },
  { iata: 'OVD', ciudad: 'Asturias', lat: 43.5636, lon: -6.0346 },
  { iata: 'SDR', ciudad: 'Santander', lat: 43.4271, lon: -3.82 },
  { iata: 'GRX', ciudad: 'Granada', lat: 37.1887, lon: -3.7774 },
  { iata: 'XRY', ciudad: 'Jerez', lat: 36.7446, lon: -6.0601 },
  { iata: 'LPA', ciudad: 'Gran Canaria', lat: 27.9319, lon: -15.3866 },
  { iata: 'TFN', ciudad: 'Tenerife', lat: 28.4827, lon: -16.3415 },
  { iata: 'TFS', ciudad: 'Tenerife', lat: 28.0445, lon: -16.5725 },
  { iata: 'OPO', ciudad: 'Oporto', lat: 41.2481, lon: -8.6814 },
  { iata: 'LIS', ciudad: 'Lisboa', lat: 38.7742, lon: -9.1342 },
  { iata: 'PGF', ciudad: 'Perpiñán', lat: 42.7404, lon: 2.8707 },
  { iata: 'TLS', ciudad: 'Toulouse', lat: 43.6291, lon: 1.3638 },
];

export const CIUDAD_AEROPUERTO = Object.fromEntries(AEROPUERTOS.map((a) => [a.iata, a.ciudad]));

/** IATA de los aeropuertos a menos de `km` de `punto`, del más cercano al más lejano. */
export function aeropuertosCercanos(punto, km = KM_AEROPUERTO_CERCANO) {
  if (!tieneCoordenadas(punto)) return [];
  return AEROPUERTOS
    .map((a) => ({ iata: a.iata, km: distanciaKm(punto, a) }))
    .filter((a) => a.km <= km)
    .sort((a, b) => a.km - b.km)
    .map((a) => a.iata);
}

const numero = (valor, { min, max }) => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** Lo guardado lo pudo tocar cualquiera: solo pasa un punto con nombre corto y coordenadas válidas. */
export function validarSalida(valor) {
  if (!valor || typeof valor !== 'object') return null;
  // Number('') es 0: un campo vacío no es el meridiano de Greenwich.
  const coordenada = (v) => (v === '' || v == null ? NaN : Number(v));
  const lat = coordenada(valor.lat);
  const lon = coordenada(valor.lon);
  const nombre = String(valor.nombre ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!nombre || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { nombre, lat, lon };
}

/** Viajeros y noches válidos, con los valores por defecto para lo que falte o no valga. */
export function validarViaje(valor = {}, viajerosPorDefecto = VIAJEROS.porDefecto) {
  return {
    viajeros: numero(valor?.viajeros, VIAJEROS) ?? numero(viajerosPorDefecto, VIAJEROS) ?? VIAJEROS.porDefecto,
    noches: numero(valor?.noches, NOCHES) ?? NOCHES.porDefecto,
  };
}

/**
 * La salida elegida, o null si es el origen del escaneo (desde ahí hay tiempos reales por
 * carretera y no hace falta estimar nada).
 */
export const salidaEfectiva = (salida, origen) => (salida && !esMismoPunto(salida, origen) ? salida : null);
