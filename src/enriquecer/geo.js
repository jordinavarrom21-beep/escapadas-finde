/**
 * Geolocalización de las ofertas (Nominatim), tiempo en coche desde el origen
 * (OSRM) y lo que cuesta el depósito de ese viaje (precios de carburante del
 * Ministerio), siempre con caché y respetando la política de uso de los servicios.
 */
import { normalizarTexto } from '../util/xml.js';
import { enIsla } from '../../site/js/geo.js';
import { provinciaEnTexto, zonaDe } from './zona.js';

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=es&q=';
const URL_OSRM = 'https://router.project-osrm.org/table/v1/driving/';
const URL_CARBURANTES = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/';
const DIA_MS = 24 * 60 * 60 * 1000;
const CADUCIDAD_GEO_MS = 90 * DIA_MS;
const CADUCIDAD_RUTA_MS = 180 * DIA_MS;
const CADUCIDAD_CARBURANTE_MS = DIA_MS;
const CADUCIDAD_PROVINCIAS_MS = 30 * DIA_MS;
const PAUSA_NOMINATIM_MS = 1100;
const PAUSA_OSRM_MS = 1000;
const PAUSA_CARBURANTES_MS = 1000;
const LOTE_OSRM = 80;
const FACTOR_CARRETERA = 1.3;

/** `ajustes.coche.carburante` → nombre exacto del campo de precio del Ministerio. */
const CAMPOS_CARBURANTE = {
  gasolina95: 'Precio Gasolina 95 E5',
  gasolina98: 'Precio Gasolina 98 E5',
  gasoleo: 'Precio Gasoleo A',
  gasoleoPremium: 'Precio Gasoleo Premium',
  glp: 'Precio Gases licuados del petróleo',
};

const redondear = (numero, decimales) => Number(numero.toFixed(decimales));

/** Distancia en línea recta (haversine) en km. */
export function distanciaKm(a, b) {
  const rad = (grados) => (grados * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const tieneCoordenadas = (lugar) => typeof lugar?.lat === 'number' && typeof lugar?.lon === 'number';
const clavePunto = ({ lat, lon }) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

// Las mismas islas que usa el panel para no estimar coche cruzando el mar.
export { enIsla } from '../../site/js/geo.js';

/**
 * Andorra: «La Massana» y «Andorra» a secas se buscaban primero en España y salían una
 * urbanización junto a Castelldefels (a 40 min de Barcelona) y Andorra (Teruel). Las
 * parroquias y las estaciones de esquí andorranas van a su país; «Andorra» sola, también,
 * salvo que la oferta diga Teruel.
 */
const LUGARES_ANDORRA = new Set(['andorra', 'andorra la vella', 'la massana', 'massana', 'canillo', 'encamp', 'ordino',
  'sant julia de loria', 'escaldes engordany', 'escaldes', 'pas de la casa', 'soldeu', 'arinsal', 'grandvalira', 'vallnord', 'pal arinsal', 'el tarter']);
export function esDeAndorra(lugar) {
  if (!lugar?.nombre || /teruel|aragon/.test(normalizarTexto(`${lugar.region ?? ''} ${lugar.provincia ?? ''} ${lugar.comunidad ?? ''}`))) return false;
  return LUGARES_ANDORRA.has(normalizarTexto(lugar.nombre).replace(/[^a-z0-9]+/g, ' ').trim());
}

/** País de un lugar en ISO-3166 (minúsculas), si se sabe. */
const codigoPais = (lugar) => (lugar.codigoPais ?? (normalizarTexto(lugar.pais ?? '') === 'espana' ? 'ES' : ''))?.toLowerCase() || '';
/** España con Canarias: un punto de «España» fuera de esta caja es otro sitio con el mismo nombre. */
const CAJA_ESPANA = { latMin: 27.4, latMax: 44, lonMin: -18.5, lonMax: 4.6 };

/**
 * Si la coordenada puede ser la de ese lugar: «Centro Barcelona» daba un Barcelona de
 * Brasil, y con él distancias, mapas y tiempo en coche absurdos.
 */
export function puntoCreible(lugar, punto) {
  if (!punto) return true;
  if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lon)) return false;
  // Sin país, pero nombrando una provincia («Costa de Huelva»): también tiene que estar en España.
  const pais = codigoPais(lugar);
  if (pais !== 'es' && (pais || !provinciaEnTexto(lugar.nombre ?? ''))) return true;
  const c = CAJA_ESPANA;
  return punto.lat >= c.latMin && punto.lat <= c.latMax && punto.lon >= c.lonMin && punto.lon <= c.lonMax;
}

/**
 * Lo que no es un sitio al que se viaja: una calle, un edificio, una tienda o un bar que se
 * llaman como el destino («Calle Granada», «Bar Dublín»).
 */
const CATEGORIAS_NO_LUGAR = new Set(['highway', 'building', 'shop', 'amenity', 'office', 'railway', 'craft', 'man_made']);
const nombreClave = (texto) => normalizarTexto(texto ?? '').replace(/[^a-z0-9]+/g, ' ').trim();

/** ¿El resultado de Nominatim es ese lugar? Mismo nombre (o uno contiene al otro) y es un sitio. */
function esElLugar(resultado, nombre) {
  if (!resultado || CATEGORIAS_NO_LUGAR.has(resultado.category)) return false;
  const [a, b] = [nombreClave(resultado.name), nombreClave(nombre)];
  return Boolean(a && b) && (a.includes(b) || b.includes(a));
}

/** Punto guardado a partir de un resultado de Nominatim, con su país y su provincia si los dice. */
function puntoDe(resultado) {
  if (!resultado) return null;
  const direccion = resultado.address ?? {};
  return {
    lat: Number(resultado.lat), lon: Number(resultado.lon),
    ...(direccion.country_code ? { codigoPais: direccion.country_code.toUpperCase() } : {}),
    ...(direccion.province || direccion.state ? { regionGeo: direccion.province || direccion.state } : {}),
  };
}

/**
 * Busca un lugar sin país conocido. Casi todas las ofertas son de webs españolas: primero en
 * España (si sale un sitio con ese nombre), y solo si no, en todo el mundo. Sin esto,
 * «Granada» acababa en Nicaragua, «Guadalajara» en México y «Laguardia» en Nueva York.
 */
async function buscarSinPais(consulta, nombre, ctx) {
  const [enEspana] = await ctx.http.json(`${URL_NOMINATIM}${encodeURIComponent(consulta)}&countrycodes=es`);
  if (esElLugar(enEspana, nombre)) return puntoDe(enEspana);
  // «Costa de Huelva» no es un sitio en el mapa, pero dice la provincia: se sitúa en ella
  // (aproximado, pero a 0 km y no en México).
  const provincia = provinciaEnTexto(nombre);
  if (provincia) {
    await ctx.http.esperar(PAUSA_NOMINATIM_MS);
    const [enProvincia] = await ctx.http.json(`${URL_NOMINATIM}${encodeURIComponent(`${provincia}, España`)}&countrycodes=es`);
    if (enProvincia) return { ...puntoDe(enProvincia), regionGeo: provincia, codigoPais: 'ES' };
  }
  await ctx.http.esperar(PAUSA_NOMINATIM_MS);
  const [enElMundo] = await ctx.http.json(URL_NOMINATIM + encodeURIComponent(consulta));
  return puntoDe(enElMundo);
}

/** Las coordenadas son las que dio la búsqueda antigua (sin país, en todo el mundo): hay que repetirla. */
const deBusquedaAntigua = (lugar, cache, consulta) => {
  const vieja = cache.obtener(`geo:${normalizarTexto(consulta)}`);
  return Boolean(vieja) && vieja.lat === lugar.lat && vieja.lon === lugar.lon;
};

/**
 * Completa `lugar.lat/lon` de las ofertas que tienen nombre de lugar pero no
 * coordenadas. Hace como mucho `maxNuevas` consultas nuevas por ejecución.
 */
export async function geolocalizar(ofertas, ctx, { maxNuevas = 40 } = {}) {
  const ahora = ctx.ahora.getTime();
  let nuevas = 0;
  let aplazadas = 0;
  for (const { lugar } of ofertas) {
    if (!lugar?.nombre) continue;
    // Un sitio de Andorra que se situó en España se vuelve a buscar, ya en Andorra.
    if (esDeAndorra(lugar) && lugar.codigoPais !== 'AD') {
      Object.assign(lugar, { pais: 'Andorra', codigoPais: 'AD', lat: null, lon: null, provincia: null, comunidad: null });
    }
    const pais = codigoPais(lugar);
    const consulta = [lugar.nombre, lugar.region, lugar.pais].filter(Boolean).join(', ');
    if (tieneCoordenadas(lugar) && puntoCreible(lugar, lugar) && (pais || !deBusquedaAntigua(lugar, ctx.cache, consulta))) continue;
    // Una coordenada imposible que viniera de antes se descarta (y se vuelve a buscar).
    if (tieneCoordenadas(lugar)) Object.assign(lugar, { lat: null, lon: null });
    // Sin país se busca primero en España (`buscarSinPais`): otra clave que la de antes, que
    // buscaba en todo el mundo, para no reutilizar sus resultados.
    const clave = `${pais ? 'geo' : 'geo2'}:${normalizarTexto(consulta)}`;
    // Lo guardado que no puede ser de ese país se vuelve a pedir (ya acotado al país).
    const increible = (p) => (p === undefined || puntoCreible(lugar, p) ? p : undefined);
    let punto = increible(ctx.cache.obtener(clave, CADUCIDAD_GEO_MS, ahora));
    if (punto === undefined) {
      // Una coordenada caducada sigue valiendo si no se puede renovar: los pueblos no se mueven.
      const caducada = increible(ctx.cache.obtener(clave));
      if (nuevas >= maxNuevas) {
        if (caducada === undefined) { aplazadas++; continue; }
        punto = caducada;
      } else {
        if (nuevas > 0) await ctx.http.esperar(PAUSA_NOMINATIM_MS);
        nuevas++;
        try {
          if (pais) {
            const [resultado] = await ctx.http.json(URL_NOMINATIM + encodeURIComponent(consulta) + `&countrycodes=${pais}`);
            punto = puntoDe(resultado);
          } else {
            punto = await buscarSinPais(consulta, lugar.nombre, ctx);
          }
          if (!puntoCreible(lugar, punto)) punto = null;
          ctx.cache.guardar(clave, punto, ahora);
        } catch (error) {
          ctx.log(`No se ha podido geolocalizar «${consulta}»: ${error.message}`);
          if (caducada === undefined) continue;
          punto = caducada;
        }
      }
    }
    if (punto) {
      const { regionGeo, codigoPais: codigo, ...coordenadas } = punto;
      Object.assign(lugar, coordenadas);
      if (codigo && !lugar.codigoPais) lugar.codigoPais = codigo;
      // La provincia que no se dedujo del texto de la web, de la geolocalización: así el
      // filtro por zona encuentra también estas ofertas.
      if (!lugar.provincia && !lugar.comunidad && codigo === 'ES' && regionGeo) Object.assign(lugar, zonaDe({ region: regionGeo, pais: 'España' }));
    }
  }
  if (aplazadas) ctx.log(`${aplazadas} lugares se geolocalizarán en la próxima ejecución`);
}

async function pedirRutas(origen, puntos, ctx) {
  const ahora = ctx.ahora.getTime();
  for (let i = 0; i < puntos.length; i += LOTE_OSRM) {
    if (i > 0) await ctx.http.esperar(PAUSA_OSRM_MS);
    const lote = puntos.slice(i, i + LOTE_OSRM);
    const coordenadas = [origen, ...lote].map(({ lat, lon }) => `${lon},${lat}`).join(';');
    try {
      const respuesta = await ctx.http.json(`${URL_OSRM}${coordenadas}?sources=0&annotations=duration,distance`);
      if (respuesta.code !== 'Ok') throw new Error(`OSRM respondió ${respuesta.code}`);
      lote.forEach((punto, j) => {
        const segundos = respuesta.durations[0][j + 1];
        const metros = respuesta.distances?.[0]?.[j + 1];
        if (segundos != null) {
          ctx.cache.guardar(`ruta:${clavePunto(origen)}>${clavePunto(punto)}`, { min: Math.round(segundos / 60), km: Math.round((metros ?? 0) / 1000) }, ahora);
        }
      });
    } catch (error) {
      ctx.log(`No se han podido calcular rutas en coche: ${error.message}`);
    }
  }
}

/**
 * Rellena `cocheMin`, `cocheKm` y `cocheEstimado` desde `ajustes.origen` para las
 * ofertas que no son de avión y están a menos de `ajustes.coche.maxKmLineaRecta`.
 */
export async function calcularCoche(ofertas, ctx) {
  const { origen, coche } = ctx.ajustes;
  const ahora = ctx.ahora.getTime();
  const clave = (lugar) => `ruta:${clavePunto(origen)}>${clavePunto(lugar)}`;
  // A las islas no se llega por carretera: OSRM cuenta el ferry como kilómetros de coche
  // (y su servidor público no permite excluirlo), así que ni tiempo ni gasolina.
  for (const oferta of ofertas) {
    if (tieneCoordenadas(oferta.lugar) && enIsla(oferta.lugar)) Object.assign(oferta, { cocheMin: null, cocheKm: null, cocheEstimado: false });
  }
  const candidatas = ofertas.filter((o) =>
    o.tipo !== 'vuelo' && !['avion', 'ferry'].includes(o.transporte) &&
    tieneCoordenadas(o.lugar) && !enIsla(o.lugar) && distanciaKm(origen, o.lugar) <= coche.maxKmLineaRecta);

  const pendientes = new Map();
  for (const { lugar } of candidatas) {
    if (ctx.cache.obtener(clave(lugar), CADUCIDAD_RUTA_MS, ahora) === undefined) pendientes.set(clavePunto(lugar), lugar);
  }
  if (pendientes.size) await pedirRutas(origen, [...pendientes.values()], ctx);

  for (const oferta of candidatas) {
    const ruta = ctx.cache.obtener(clave(oferta.lugar), CADUCIDAD_RUTA_MS, ahora);
    if (ruta) {
      Object.assign(oferta, { cocheMin: ruta.min, cocheKm: ruta.km, cocheEstimado: false });
    } else {
      const km = distanciaKm(origen, oferta.lugar) * FACTOR_CARRETERA;
      Object.assign(oferta, { cocheMin: Math.round((km / coche.velocidadMediaKmh) * 60), cocheKm: Math.round(km), cocheEstimado: true });
    }
  }
}

/**
 * Código INE de la provincia (el listado del Ministerio lo llama «IDPovincia»,
 * sin la «r»). Se guarda un mes: la lista de provincias no cambia.
 */
async function codigoProvincia(nombre, ctx) {
  const ahora = ctx.ahora.getTime();
  let provincias = ctx.cache.obtener('carburante:provincias', CADUCIDAD_PROVINCIAS_MS, ahora);
  if (provincias === undefined) {
    provincias = await ctx.http.json(`${URL_CARBURANTES}Listados/Provincias/`);
    ctx.cache.guardar('carburante:provincias', provincias, ahora);
    await ctx.http.esperar(PAUSA_CARBURANTES_MS);
  }
  const buscada = normalizarTexto(nombre);
  return provincias.find((p) => normalizarTexto(p.Provincia) === buscada)?.IDPovincia ?? null;
}

/**
 * Precio medio del litro de `ajustes.coche.carburante` en la provincia del origen,
 * según las estaciones que publica el Ministerio (caché de un día). Si la consulta
 * falla o el origen no es una provincia, se usa `ajustes.coche.precioLitro`.
 */
async function precioDelLitro(ctx) {
  const { origen, coche } = ctx.ajustes;
  const ahora = ctx.ahora.getTime();
  const campo = CAMPOS_CARBURANTE[coche.carburante];
  if (!campo) {
    ctx.log(`Carburante desconocido «${coche.carburante}»: se usa el precio de los ajustes`);
    return coche.precioLitro;
  }
  const clave = `carburante:${normalizarTexto(origen.nombre)}:${coche.carburante}`;
  const guardado = ctx.cache.obtener(clave, CADUCIDAD_CARBURANTE_MS, ahora);
  if (guardado !== undefined) return guardado;

  try {
    const codigo = await codigoProvincia(origen.nombre, ctx);
    if (!codigo) throw new Error(`«${origen.nombre}» no aparece como provincia`);
    const respuesta = await ctx.http.json(`${URL_CARBURANTES}EstacionesTerrestres/FiltroProvincia/${codigo}`);
    const precios = (respuesta.ListaEESSPrecio ?? [])
      .map((estacion) => Number.parseFloat(String(estacion[campo] ?? '').replace(',', '.')))
      .filter((precio) => precio > 0);
    if (!precios.length) throw new Error(`ninguna estación de ${origen.nombre} publica «${campo}»`);
    const medio = redondear(precios.reduce((suma, precio) => suma + precio, 0) / precios.length, 3);
    ctx.cache.guardar(clave, medio, ahora);
    ctx.log(`${campo} en ${origen.nombre}: ${medio} €/l de media en ${precios.length} estaciones`);
    return medio;
  } catch (error) {
    ctx.log(`No se ha podido consultar el precio del carburante (${error.message}): se usa ${coche.precioLitro} €/l`);
    return coche.precioLitro;
  }
}

/**
 * ¿Se llega en coche propio? Una oferta que ya incluye el tren, el bus, el avión o el
 * ferry (o una actividad que va en uno) no gasta gasolina: el coste de coche sería
 * un dato inventado que además no se puede comparar con el precio del billete.
 */
export const vaEnCoche = (oferta) => oferta.transporte == null || oferta.transporte === 'coche';

/**
 * Rellena `costeCoche` `{eur, litros}` del viaje de ida y vuelta desde el origen
 * en las ofertas que tienen `cocheKm` y a las que se va en coche. Devuelve el precio
 * del litro usado (el panel lo necesita para estimar desde otra salida), o null si
 * no había nada que calcular.
 */
export async function calcularCosteCoche(ofertas, ctx) {
  const { coche } = ctx.ajustes;
  for (const oferta of ofertas) oferta.costeCoche = null;
  const candidatas = ofertas.filter((oferta) => oferta.cocheKm > 0 && vaEnCoche(oferta));
  if (!candidatas.length) return null;

  const precioLitro = await precioDelLitro(ctx);
  for (const oferta of candidatas) {
    const litros = (2 * oferta.cocheKm * coche.consumoL100km) / 100;
    oferta.costeCoche = { eur: redondear(litros * precioLitro, 1), litros: redondear(litros, 1) };
  }
  return precioLitro;
}
