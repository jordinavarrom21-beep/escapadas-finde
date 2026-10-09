/**
 * Nota de Google Maps para los alojamientos que su web publica sin opiniones (muchas casas
 * rurales y hoteles de Muchoviaje, Rusticae, Nomolesten…). OPCIONAL y de pago: lo lee Apify
 * (actor compass/crawler-google-places, src/util/apify.js) y solo con el secreto APIFY_TOKEN.
 *
 * - Solo ofertas con el nombre propio del alojamiento (`establecimiento`) y su localidad.
 * - La valoración de la propia web manda: la de Google solo se pone si la web no da ninguna.
 * - Se acepta el sitio que encuentra Google solo si se llama igual y está en el mismo sitio
 *   (a menos de `MAX_KM` o, sin coordenadas, en la misma localidad o provincia). Ante la duda,
 *   no se pone nada: una nota de otro sitio sería peor que ninguna.
 * - Cada alojamiento se consulta una vez cada 90 días (también los «no encontrado»), como
 *   mucho `apify.googleMaps.maxPorEscaneo` por escaneo y `maxPorDia` al día.
 * - Si la web no da coordenadas, se usan las de Google (más exactas que las del pueblo).
 */
import { distanciaKm } from './geo.js';
import { anotarConsultas, consultasDeHoy, costeEstimado, ejecutarActor } from '../util/apify.js';
import { normalizarTexto } from '../util/xml.js';

const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_KM = 25;
const POR_DEFECTO = { activo: true, maxPorEscaneo: 5, maxPorDia: 10 };
/** Palabras que no distinguen un alojamiento de otro («Hotel», «Can», «Rural»…). */
const GENERICAS = new Set([
  'hotel', 'hotels', 'hostal', 'hostel', 'aparthotel', 'apartamento', 'apartamentos', 'apartaments', 'apartments', 'casa', 'casas',
  'rural', 'rurales', 'can', 'cal', 'ca', 'mas', 'masia', 'spa', 'resort', 'boutique', 'suites', 'adults', 'only', 'solo', 'adultos',
  'camping', 'albergue', 'the', 'el', 'la', 'les', 'los', 'las', 'lo', 'de', 'del', 'des', 'dels', 'd', 'l', 'i', 'y', 'and', 'by', 'en',
]);

const palabras = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const distintivas = (texto) => palabras(texto).filter((p) => p.length > 1 && !GENERICAS.has(p));
const plano = (texto) => palabras(texto).join(' ');

/**
 * ¿Es el mismo alojamiento? Al menos el 60 % de las palabras distintivas del nombre buscado
 * («Can Panxa» → «panxa») están en el encontrado. Sin palabras distintivas, nombre idéntico.
 */
export function mismoNombre(buscado, encontrado) {
  const clave = distintivas(buscado);
  const otro = new Set(palabras(encontrado));
  if (!clave.length) return plano(buscado) === plano(encontrado) && plano(buscado) !== '';
  const coinciden = clave.filter((p) => otro.has(p)).length;
  return coinciden >= 1 && coinciden / clave.length >= 0.6;
}

const tieneCoordenadas = (lugar) => Number.isFinite(lugar?.lat) && Number.isFinite(lugar?.lon);

/** ¿Está el sitio de Google donde dice la oferta? */
export function coincideLugar(fila, oferta) {
  const lugar = oferta.lugar;
  const punto = fila.location;
  if (tieneCoordenadas(lugar) && Number.isFinite(punto?.lat) && Number.isFinite(punto?.lng)) {
    return distanciaKm(lugar, { lat: punto.lat, lon: punto.lng }) <= MAX_KM;
  }
  const direccion = plano([fila.address, fila.city, fila.state].filter(Boolean).join(' '));
  const contiene = (texto) => Boolean(texto) && plano(texto) !== '' && ` ${direccion} `.includes(` ${plano(texto)} `);
  return contiene(lugar?.nombre) || contiene(lugar?.provincia);
}

/** Lo que se guarda de un sitio de Google: nota sobre 10 (Google da estrellas de 1 a 5). */
export function notaDeLugar(fila) {
  if (!(fila?.totalScore > 0) || !(fila.reviewsCount > 0)) return null;
  return {
    nota: Math.round(fila.totalScore * 20) / 10,
    n: fila.reviewsCount,
    url: typeof fila.url === 'string' && /^https:\/\/www\.google\.[a-z.]+\/maps\//.test(fila.url) ? fila.url : null,
    lat: Number.isFinite(fila.location?.lat) ? fila.location.lat : null,
    lon: Number.isFinite(fila.location?.lng) ? fila.location.lng : null,
  };
}

/** Ofertas a las que les vale una nota de Google: con nombre y lugar y sin valoración de su web. */
export const candidatasMaps = (ofertas) => ofertas.filter((o) => o.tipo !== 'vuelo' && o.establecimiento && o.lugar?.nombre
  && (!(o.valoracion?.nota >= 0) || o.valoracion.fuente === 'google'));

export const busquedaMaps = (o) => `${o.establecimiento}, ${o.lugar.nombre}`;
const clave = (o) => `gmaps:${plano(o.establecimiento)}|${plano(o.lugar.nombre)}`;

/** Pone la nota guardada (si la hay) y, si la oferta no trae coordenadas, las de Google. */
export function aplicarNotaGoogle(oferta, guardado) {
  if (!(guardado?.nota >= 0)) return false;
  oferta.valoracion = { nota: guardado.nota, n: guardado.n, fuente: 'google', url: guardado.url ?? null };
  if (oferta.lugar && !tieneCoordenadas(oferta.lugar) && Number.isFinite(guardado.lat) && Number.isFinite(guardado.lon)) {
    oferta.lugar.lat = guardado.lat;
    oferta.lugar.lon = guardado.lon;
  }
  return true;
}

/** Lo que se guarda tras consultar un alojamiento: su nota o «sin nota» (no se repite en 90 días). */
export function resultadoMaps(oferta, fila) {
  const valido = fila && !fila.permanentlyClosed && mismoNombre(oferta.establecimiento, fila.title) && coincideLugar(fila, oferta);
  return (valido && notaDeLugar(fila)) || { sinNota: true };
}

export async function anadirNotasGoogle(ofertas, ctx) {
  const config = { ...POR_DEFECTO, ...ctx.ajustes.apify?.googleMaps };
  const ahora = ctx.ahora.getTime();
  const pendientes = new Map();
  for (const oferta of candidatasMaps(ofertas)) {
    // La de un escaneo anterior se vuelve a poner solo si sigue guardada.
    if (oferta.valoracion?.fuente === 'google') oferta.valoracion = null;
    const guardado = ctx.cache.obtener(clave(oferta), NOVENTA_DIAS_MS, ahora);
    if (guardado !== undefined) aplicarNotaGoogle(oferta, guardado);
    else pendientes.set(clave(oferta), [...(pendientes.get(clave(oferta)) ?? []), oferta]);
  }
  if (!ctx.env.APIFY_TOKEN || config.activo === false || !pendientes.size) return;
  const cupo = Math.min(config.maxPorEscaneo, config.maxPorDia - consultasDeHoy(ctx.cache, 'googleMaps', ctx.ahora));
  if (cupo <= 0) return;
  // Las más nuevas primero: son las que más gente va a ver.
  const reciente = (lista) => String(lista[0].vistaPrimera ?? '');
  const tanda = [...pendientes.values()].sort((a, b) => reciente(b).localeCompare(reciente(a))).slice(0, cupo);
  const busquedas = tanda.map((lista) => busquedaMaps(lista[0]));
  // Se cuentan antes de lanzar: si Apify falla, los intentos también gastan el cupo del día
  // (si no, un fallo se repetiría en cada escaneo, cada 15 minutos).
  anotarConsultas(ctx.cache, 'googleMaps', ctx.ahora, busquedas.length);
  let filas;
  try {
    filas = await ejecutarActor(ctx, 'googleMaps', {
      searchStringsArray: busquedas, maxCrawledPlacesPerSearch: 1, language: 'es', skipClosedPlaces: false,
    }, { maxUsd: costeEstimado('googleMaps', busquedas.length) + 0.01 });
  } catch (error) {
    ctx.log(`Google Maps: ${error.message}`);
    return;
  }
  const porBusqueda = new Map(filas.filter((f) => f?.searchString).map((f) => [f.searchString, f]));
  let conNota = 0;
  for (const lista of tanda) {
    const resultado = resultadoMaps(lista[0], porBusqueda.get(busquedaMaps(lista[0])));
    ctx.cache.guardar(clave(lista[0]), resultado, ahora);
    for (const oferta of lista) aplicarNotaGoogle(oferta, resultado);
    if (!resultado.sinNota) conNota += 1;
  }
  ctx.log(`Google Maps: ${conNota} notas nuevas de ${tanda.length} alojamientos consultados (${pendientes.size - tanda.length} pendientes)`);
}
