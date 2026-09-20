/**
 * Geolocalización de las ofertas (Nominatim), tiempo en coche desde el origen
 * (OSRM) y lo que cuesta el depósito de ese viaje (precios de carburante del
 * Ministerio), siempre con caché y respetando la política de uso de los servicios.
 */
import { normalizarTexto } from '../util/xml.js';

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=';
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

/**
 * Completa `lugar.lat/lon` de las ofertas que tienen nombre de lugar pero no
 * coordenadas. Hace como mucho `maxNuevas` consultas nuevas por ejecución.
 */
export async function geolocalizar(ofertas, ctx, { maxNuevas = 40 } = {}) {
  const ahora = ctx.ahora.getTime();
  let nuevas = 0;
  let aplazadas = 0;
  for (const { lugar } of ofertas) {
    if (!lugar?.nombre || tieneCoordenadas(lugar)) continue;
    const consulta = [lugar.nombre, lugar.region, lugar.pais].filter(Boolean).join(', ');
    const clave = `geo:${normalizarTexto(consulta)}`;
    let punto = ctx.cache.obtener(clave, CADUCIDAD_GEO_MS, ahora);
    if (punto === undefined) {
      if (nuevas >= maxNuevas) { aplazadas++; continue; }
      if (nuevas > 0) await ctx.http.esperar(PAUSA_NOMINATIM_MS);
      nuevas++;
      try {
        const [resultado] = await ctx.http.json(URL_NOMINATIM + encodeURIComponent(consulta));
        punto = resultado ? { lat: Number(resultado.lat), lon: Number(resultado.lon) } : null;
        ctx.cache.guardar(clave, punto, ahora);
      } catch (error) {
        ctx.log(`No se ha podido geolocalizar «${consulta}»: ${error.message}`);
        continue;
      }
    }
    if (punto) Object.assign(lugar, punto);
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
  const candidatas = ofertas.filter((o) =>
    o.tipo !== 'vuelo' && !['avion', 'ferry'].includes(o.transporte) &&
    tieneCoordenadas(o.lugar) && distanciaKm(origen, o.lugar) <= coche.maxKmLineaRecta);

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
 * Rellena `costeCoche` `{eur, litros}` del viaje de ida y vuelta desde el origen
 * en las ofertas que tienen `cocheKm`.
 */
export async function calcularCosteCoche(ofertas, ctx) {
  const { coche } = ctx.ajustes;
  for (const oferta of ofertas) oferta.costeCoche = null;
  const candidatas = ofertas.filter((oferta) => oferta.cocheKm > 0);
  if (!candidatas.length) return;

  const precioLitro = await precioDelLitro(ctx);
  for (const oferta of candidatas) {
    const litros = (2 * oferta.cocheKm * coche.consumoL100km) / 100;
    oferta.costeCoche = { eur: redondear(litros * precioLitro, 1), litros: redondear(litros, 1) };
  }
}
