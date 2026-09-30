/**
 * Núcleo del escaneo: fuentes → almacén → enriquecimiento → datos del panel → emails.
 * No toca el disco (de eso se encarga la CLI en src/escanear.js).
 * El orden y los formatos están en docs/CONTRATOS.md.
 */
import { performance } from 'node:perf_hooks';
import { Cache } from '../cache.js';
import { estadoInicial, fusionar, podar } from '../almacen.js';
import { FUENTES } from '../fuentes/index.js';
import { TEMAS, completarOferta } from '../modelo.js';
import { aplicarClasificacion } from '../enriquecer/temas.js';
import { aplicarAlojamiento } from '../enriquecer/alojamiento.js';
import { aplicarNinos } from '../enriquecer/ninos.js';
import { aplicarCategoria } from '../enriquecer/categoria.js';
import { aplicarZona } from '../enriquecer/zona.js';
import { clasificarVueloSinFecha } from '../enriquecer/vuelos.js';
import { aplicarAfiliacion, proveedoresActivos } from '../afiliacion.js';
import { enlacesPara } from '../enriquecer/enlaces.js';
import { asignarFechas, calcularPuentes, obtenerFestivos } from '../enriquecer/festivos.js';
import { calcularCoche, calcularCosteCoche, geolocalizar } from '../enriquecer/geo.js';
import { revisarPrecios } from '../enriquecer/precios.js';
import { calcularReferencia } from '../enriquecer/referencia.js';
import { marcarEquivalentes } from '../enriquecer/duplicados.js';
import { anadirTiempo } from '../enriquecer/tiempo.js';
import { anadirEventos } from '../enriquecer/eventos.js';
import { precioPorPersonaNoche, puntuar } from '../enriquecer/puntuacion.js';
import { claveSerie, compactar, registrarPrecios, seriesPara } from '../historial.js';
import { coincide } from '../vigilados.js';
import { procesarEmails } from '../emails/decidir.js';
import { configuracionEnvio, crearTransporte, enviarEmail } from '../emails/enviar.js';
import { clienteHttp, crearClienteHttp, metricasHttp, reiniciarMetricas } from '../util/http.js';
import { ErrorRobots, comprobarRobots } from '../util/robots.js';
import { fechaLocal, findesProximos, sumarDias } from '../util/fechas.js';
import { ejecutarFuentes } from './source-runner.js';

/** Una fuente se vuelve a consultar cuando ha pasado este porcentaje de su intervalo (los crons se retrasan). */
const MARGEN_INTERVALO = 0.8;
/**
 * Una lectura que trae menos de esta parte de lo normal (con al menos `MINIMO_COMPARABLE`
 * ofertas de referencia), o en la que la parte con precio cae a menos de la mitad, huele a
 * que la web ha cambiado: se avisa y no se borra nada de golpe. Si dura `DIAS_NUEVA_NORMALIDAD`,
 * se acepta como lo normal (la web tiene de verdad menos ofertas).
 */
const CAIDA_FUERTE = 0.3;
const MINIMO_COMPARABLE = 10;
const DIAS_NUEVA_NORMALIDAD = 7;
const HORIZONTE_PUENTES_DIAS = 120;
const DIA_MS = 24 * 60 * 60 * 1000;
const CADUCIDAD_CACHE_MS = 200 * DIA_MS;
/** El tiempo y la agenda llevan el día en la clave o solo valen unas horas: a los 1–2 días sobran. */
const CADUCIDAD_POR_PREFIJO = { 'tiempo:': DIA_MS, 'eventos:': 2 * DIA_MS };

/** Módulos que usa el escaneo; los tests pueden sustituir cualquiera. */
export const MODULOS = {
  obtenerFestivos, calcularPuentes, asignarFechas, clasificarVueloSinFecha, aplicarClasificacion, aplicarAlojamiento, aplicarZona,
  geolocalizar, calcularCoche, calcularCosteCoche, calcularReferencia, marcarEquivalentes,
  revisarPrecios, anadirTiempo, anadirEventos, enlacesPara, registrarPrecios, compactar, seriesPara, puntuar,
  procesarEmails, crearTransporte, enviarEmail,
};

/** URL del panel: la de los ajustes o la de GitHub Pages del repo. */
export function urlPanel(ajustes, env) {
  if (ajustes.panelUrl) return ajustes.panelUrl;
  const [propietario, repo] = env.GITHUB_REPOSITORY?.split('/') ?? [];
  return propietario && repo ? `https://${propietario}.github.io/${repo}/` : null;
}

function tocaEjecutar(fuente, config, previo, ahora, opciones) {
  if (opciones.solo) return opciones.solo === fuente.id;
  if (opciones.forzar || !previo.ultimoIntento) return true;
  const intervaloMs = (config.intervaloMin ?? 60) * 60_000;
  return ahora - Date.parse(previo.ultimoIntento) >= intervaloMs * MARGEN_INTERVALO;
}

/**
 * ¿Se parece esta lectura a las anteriores? Compara con `previo.referencia` (lo normal de
 * la fuente: ofertas y parte con precio). Si trae muchas menos o casi sin precio, devuelve
 * un aviso y no deja borrar las guardadas de golpe; si no, la referencia pasa a ser esta.
 * @returns {{aviso: string|null, reemplazar: boolean|Function, referencia: {total: number, conPrecio: number}}}
 */
export function revisarLectura(resultado, previo, ahora) {
  const n = resultado.ofertas.length;
  const conPrecio = n ? resultado.ofertas.filter((o) => typeof o.precio === 'number').length / n : 0;
  const actual = { total: n, conPrecio: Math.round(conPrecio * 100) / 100 };
  // Referencias guardadas antes de existir este campo: lo que se leyó la última vez.
  const normal = previo.referencia ?? (previo.total ? { total: previo.total, conPrecio: null } : null);
  const viejo = previo.desdeAviso && ahora - Date.parse(previo.desdeAviso) >= DIAS_NUEVA_NORMALIDAD * DIA_MS;
  if (!normal || normal.total < MINIMO_COMPARABLE || viejo) return { aviso: null, reemplazar: resultado.reemplazar, referencia: actual };
  const avisos = [];
  const menos = n < normal.total * CAIDA_FUERTE;
  if (menos) {
    avisos.push(`Solo ${n} ofertas (lo normal son unas ${normal.total}): no se borran las demás de golpe; si de verdad ya no están, se retiran solas en unos días`);
  }
  if (normal.conPrecio >= 0.6 && n >= 5 && actual.conPrecio < normal.conPrecio / 2) {
    avisos.push(`Solo el ${Math.round(actual.conPrecio * 100)} % trae precio (lo normal es el ${Math.round(normal.conPrecio * 100)} %): puede que la web haya cambiado cómo lo muestra`);
  }
  if (!avisos.length) return { aviso: null, reemplazar: resultado.reemplazar, referencia: actual };
  return { aviso: `${avisos.join('. ')}. ¿Ha cambiado la web?`, reemplazar: menos ? false : resultado.reemplazar, referencia: normal };
}

async function ejecutarFuente(fuente, { estado, ajustes, env, ahora, opciones, crearCtx }) {
  const config = ajustes.fuentes?.[fuente.id] ?? {};
  const previo = estado.fuentes[fuente.id] ?? {};
  if (config.activa === false) {
    estado.fuentes[fuente.id] = { ...previo, estado: 'desactivada', motivo: config.motivo ?? 'Desactivada en config/ajustes.json', error: null };
    return;
  }
  const falta = (fuente.requiere ?? []).filter((variable) => !env[variable]);
  if (falta.length) {
    estado.fuentes[fuente.id] = { ...previo, estado: 'desactivada', motivo: `Falta configurar: ${falta.join(', ')}`, falta, error: null };
    return;
  }
  if (!tocaEjecutar(fuente, config, previo, ahora, opciones)) return;

  const iso = ahora.toISOString();
  const inicio = performance.now();
  const ctx = crearCtx(fuente.id);
  try {
    // El buzón lee un correo propio por IMAP: no es una web y no tiene robots.txt.
    if (fuente.modo !== 'buzon') {
      if (!fuente.urls?.length) throw new Error('La fuente no declara sus urls: no se puede comprobar robots.txt');
      await comprobarRobots(ctx, fuente.urls);
    }
    const resultado = await fuente.obtener(ctx);
    // Una fuente copiada de otra que no cambió su ID publicaría ofertas «ajenas», y el
    // «reemplazar» de la original las borraría sin avisar a nadie.
    const ajenas = resultado.ofertas.filter((o) => o.fuente !== fuente.id);
    if (ajenas.length) throw new Error(`${ajenas.length} ofertas con fuente «${ajenas[0].fuente}» en vez de «${fuente.id}»`);
    // Una lectura que no trae nada con «reemplazar» borraría todo el catálogo guardado y
    // la fuente quedaría «ok» sin avisar. Casi siempre es que la web ha cambiado: error.
    if (!resultado.ofertas.length && resultado.reemplazar && (previo.total ?? 0) > 0) {
      throw new Error(`0 ofertas (la última vez ${previo.total}): no se borra lo guardado (¿ha cambiado la web?)`);
    }
    const revision = revisarLectura(resultado, previo, ahora);
    const { nuevas, total } = fusionar(estado, fuente.id, { ...resultado, reemplazar: revision.reemplazar }, ahora);
    estado.fuentes[fuente.id] = {
      estado: 'ok', motivo: null, error: null, desdeError: null, falta: [],
      ultimoIntento: iso, ultimoOk: iso, nuevas, total, duracionMs: Math.round(performance.now() - inicio),
      aviso: revision.aviso, desdeAviso: revision.aviso ? previo.desdeAviso ?? iso : null,
      referencia: revision.referencia,
    };
  } catch (error) {
    const bloqueada = error instanceof ErrorRobots;
    estado.fuentes[fuente.id] = {
      ...previo,
      estado: bloqueada ? 'bloqueada' : 'error',
      motivo: bloqueada ? error.message : null,
      error: bloqueada ? null : error.message,
      desdeError: bloqueada ? null : (previo.estado === 'error' && previo.desdeError) || iso,
      // Lo que faltaba configurar ya no es el motivo: si no, taparía el error real.
      falta: [],
      ultimoIntento: iso,
      nuevas: 0,
      duracionMs: Math.round(performance.now() - inicio),
    };
  }
}

/**
 * Estado de cada fuente para el panel. `total` son las ofertas suyas que se enseñan
 * ahora (tras la poda); `leidas`, cuántas trajo su última lectura; `intervaloMin`, cada
 * cuánto se consulta (el panel lo usa para avisar de las ofertas sin comprobar).
 */
function estadoParaPanel(fuentes, estado, ajustes) {
  const porFuente = {};
  for (const o of Object.values(estado.ofertas)) porFuente[o.fuente] = (porFuente[o.fuente] ?? 0) + 1;
  return fuentes.map((f) => {
    const s = estado.fuentes[f.id] ?? {};
    return {
      id: f.id, nombre: f.nombre, web: f.web, modo: f.modo,
      estado: s.estado ?? 'pendiente', motivo: s.motivo ?? null, error: s.error ?? null,
      desdeError: s.desdeError ?? null, ultimoOk: s.ultimoOk ?? null, ultimoIntento: s.ultimoIntento ?? null,
      aviso: s.estado === 'ok' ? s.aviso ?? null : null, desdeAviso: s.estado === 'ok' ? s.desdeAviso ?? null : null,
      total: porFuente[f.id] ?? 0, leidas: s.total ?? 0, nuevas: s.nuevas ?? 0, falta: s.falta ?? [],
      intervaloMin: ajustes.fuentes?.[f.id]?.intervaloMin ?? null,
    };
  });
}

/**
 * Núcleo del escaneo, sin tocar el disco. Modifica y devuelve `estado`, `cache` e `historial`.
 */
export async function escanear({
  ajustes, vigilados = [], estado = estadoInicial(), cache = new Cache(), historial = {},
  fuentes = FUENTES, http = clienteHttp, ahora = new Date(), opciones = {}, env = process.env, afiliacion = {},
  modulos = {}, log = console.log,
}) {
  const m = { ...MODULOS, ...modulos };
  const conPrefijo = (prefijo) => (mensaje) => log(`[${prefijo}] ${mensaje}`);
  const ctxBase = { ahora, ajustes, http, cache, env };
  reiniciarMetricas();

  const hoy = fechaLocal(ahora);
  const hastaPuentes = sumarDias(hoy, HORIZONTE_PUENTES_DIAS);
  const anios = [...new Set([hoy, hastaPuentes].map((fecha) => Number(fecha.slice(0, 4))))];
  const festivos = await m.obtenerFestivos({ ...ctxBase, log: conPrefijo('festivos') }, anios);
  const puentes = m.calcularPuentes(festivos, { desde: hoy, hasta: hastaPuentes });
  const findes = findesProximos(ajustes.vuelos.findes, ahora).map((finde) => ({
    ...finde,
    puenteId: puentes.find((p) => p.desde <= finde.domingo && p.hasta >= finde.viernes)?.id ?? null,
  }));

  // Con el cliente de verdad, cada parte pide con su nombre puesto: así los reintentos
  // se leen como «viajerospiratas: reintento 2/3 tras HTTP 429…». Los tests inyectan el suyo.
  const httpDe = (id) => (http === clienteHttp ? crearClienteHttp({ etiqueta: id, log: conPrefijo(id) }) : http);
  const crearCtx = (id) => ({ ...ctxBase, http: httpDe(id), log: conPrefijo(id), findes, puentes });
  const ejecutadas = await ejecutarFuentes(fuentes, {
    maxParalelo: ajustes.maxFuentesEnParalelo,
    ejecutar: (fuente) => ejecutarFuente(fuente, { estado, ajustes, env, ahora, opciones, crearCtx }),
  });
  // ejecutarFuente ya anota sus propios errores en el estado; esto solo cazaría un fallo del orquestador.
  for (const { fuente, error } of ejecutadas) {
    if (error) conPrefijo(fuente.id)(`fallo inesperado al ejecutar la fuente: ${error.message}`);
  }
  // Cada web con su ritmo: las que se leen enteras (html, api) retiran antes lo que dejan de
  // publicar; los feeds y el buzón, por días sin verlas (los de la web o los generales).
  const podadas = podar(estado, ahora, {
    retencionDias: ajustes.retencionDias,
    fuentes: Object.fromEntries(fuentes.map((f) => [f.id, {
      intervaloMin: ajustes.fuentes?.[f.id]?.intervaloMin ?? 60,
      retencionDias: ajustes.fuentes?.[f.id]?.retencionDias,
      adaptable: ['html', 'api'].includes(f.modo),
    }])),
  });

  // Se completan por si vienen de un estado guardado antes de añadir campos nuevos.
  for (const [id, oferta] of Object.entries(estado.ofertas)) estado.ofertas[id] = completarOferta(oferta);
  const ofertas = Object.values(estado.ofertas);
  for (const oferta of ofertas) {
    m.clasificarVueloSinFecha(oferta);
    m.aplicarClasificacion(oferta);
    aplicarNinos(oferta);
    aplicarCategoria(oferta);
    m.aplicarAlojamiento(oferta);
    m.aplicarZona(oferta);
    oferta.precioNoche = precioPorPersonaNoche(oferta, ajustes.viajeros ?? 2);
    Object.assign(oferta.fechas, m.asignarFechas(oferta, findes, puentes));
  }
  await m.geolocalizar(ofertas, crearCtx('geo'));
  await m.calcularCoche(ofertas, crearCtx('coche'));
  const precioLitro = await m.calcularCosteCoche(ofertas, crearCtx('coche'));
  const dudosos = m.revisarPrecios(ofertas, conPrefijo('precios'));
  if (dudosos) conPrefijo('precios')(`${dudosos} ofertas con un precio no creíble: se muestran sin precio`);
  m.calcularReferencia(ofertas);
  m.marcarEquivalentes(ofertas);
  await m.anadirTiempo(ofertas, { ...crearCtx('tiempo'), findes, puentes });
  await m.anadirEventos(ofertas, { ...crearCtx('eventos'), findes, puentes });
  for (const oferta of ofertas) oferta.enlaces = m.enlacesPara(oferta, { origen: ajustes.origen, ahora });
  // Después de los enlaces (también se marcan) y sin tocar la puntuación ni el orden.
  const afiliados = proveedoresActivos(afiliacion, conPrefijo('afiliacion'));
  for (const oferta of ofertas) aplicarAfiliacion(oferta, { activos: afiliados, patrocinadas: afiliacion.patrocinadas ?? [], ahora });
  m.registrarPrecios(historial, ofertas, ahora);
  m.compactar(historial, ahora, { idsVivos: ofertas.flatMap((o) => [o.id, claveSerie(o)]) });
  m.puntuar(ofertas, ajustes, { ahora, findeActual: findes[0]?.id ?? null });
  ofertas.sort((a, b) => b.puntuacion - a.puntuacion);

  const estadoFuentes = estadoParaPanel(fuentes, estado, ajustes);
  const panelUrl = urlPanel(ajustes, env);
  const salida = {
    ofertas: {
      generado: ahora.toISOString(), origen: ajustes.origen, aeropuertos: ajustes.vuelos.aeropuertos, viajeros: ajustes.viajeros ?? 2,
      // Para que el panel estime la gasolina desde la salida que elija cada persona.
      // Qué proveedores marcan enlaces de afiliado (para el aviso del panel) y dónde se cuentan los clics.
      afiliacion: { proveedores: afiliados.map((p) => p.id), medicion: afiliacion.medicion?.url || null },
      // Si los vigilados avisan de verdad por email (sin decir a qué dirección).
      avisos: { email: !opciones.sinEmails && configuracionEnvio(env).estado === 'lista' },
      coche: { consumoL100km: ajustes.coche.consumoL100km, precioLitro: precioLitro ?? ajustes.coche.precioLitro, carburante: ajustes.coche.carburante },
      temas: TEMAS, findes, puentes, fuentes: estadoFuentes, ofertas,
    },
    historial: m.seriesPara(historial, ofertas.map((o) => [o.id, claveSerie(o)])),
    vigilados: { vigilados: vigilados.map((c) => ({ ...c, coincidencias: ofertas.filter((o) => coincide(o, c)).map((o) => o.id) })) },
  };

  let emails = { enviados: [], errores: [] };
  if (!opciones.sinEmails) {
    const transporte = m.crearTransporte(env, conPrefijo('emails'));
    emails = await m.procesarEmails({
      ofertas, estado, ajustes, vigilados, findes, puentes, fuentes: estadoFuentes, panelUrl, ahora,
      enviar: transporte ? (mensaje) => m.enviarEmail(transporte, mensaje, env) : null,
      log: conPrefijo('emails'),
    });
  }
  cache.podar(CADUCIDAD_CACHE_MS, ahora.getTime(), CADUCIDAD_POR_PREFIJO);
  return {
    estado,
    cache,
    historial,
    salida,
    informe: { fuentes: estadoFuentes, podadas, total: ofertas.length, emails, puentes, red: metricasHttp() },
  };
}
