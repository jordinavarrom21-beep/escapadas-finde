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
import { aplicarZona } from '../enriquecer/zona.js';
import { enlacesPara } from '../enriquecer/enlaces.js';
import { asignarFechas, calcularPuentes, obtenerFestivos } from '../enriquecer/festivos.js';
import { calcularCoche, calcularCosteCoche, geolocalizar } from '../enriquecer/geo.js';
import { revisarPrecios } from '../enriquecer/precios.js';
import { calcularReferencia } from '../enriquecer/referencia.js';
import { marcarEquivalentes } from '../enriquecer/duplicados.js';
import { anadirTiempo } from '../enriquecer/tiempo.js';
import { anadirEventos } from '../enriquecer/eventos.js';
import { precioPorPersonaNoche, puntuar } from '../enriquecer/puntuacion.js';
import { compactar, registrarPrecios, seriesPara } from '../historial.js';
import { coincide } from '../vigilados.js';
import { procesarEmails } from '../emails/decidir.js';
import { crearTransporte, enviarEmail } from '../emails/enviar.js';
import { clienteHttp, crearClienteHttp, metricasHttp, reiniciarMetricas } from '../util/http.js';
import { ErrorRobots, comprobarRobots } from '../util/robots.js';
import { fechaLocal, findesProximos, sumarDias } from '../util/fechas.js';
import { ejecutarFuentes } from './source-runner.js';

/** Una fuente se vuelve a consultar cuando ha pasado este porcentaje de su intervalo (los crons se retrasan). */
const MARGEN_INTERVALO = 0.8;
const HORIZONTE_PUENTES_DIAS = 120;
const DIA_MS = 24 * 60 * 60 * 1000;
const CADUCIDAD_CACHE_MS = 200 * DIA_MS;
/** El tiempo y la agenda llevan el día en la clave o solo valen unas horas: a los 1–2 días sobran. */
const CADUCIDAD_POR_PREFIJO = { 'tiempo:': DIA_MS, 'eventos:': 2 * DIA_MS };

/** Módulos que usa el escaneo; los tests pueden sustituir cualquiera. */
export const MODULOS = {
  obtenerFestivos, calcularPuentes, asignarFechas, aplicarClasificacion, aplicarAlojamiento, aplicarZona,
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
    const { nuevas, total } = fusionar(estado, fuente.id, resultado, ahora);
    estado.fuentes[fuente.id] = {
      estado: 'ok', motivo: null, error: null, desdeError: null, falta: [],
      ultimoIntento: iso, ultimoOk: iso, nuevas, total, duracionMs: Math.round(performance.now() - inicio),
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
  fuentes = FUENTES, http = clienteHttp, ahora = new Date(), opciones = {}, env = process.env,
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
  const podadas = podar(estado, ahora, { retencionDias: ajustes.retencionDias });

  // Se completan por si vienen de un estado guardado antes de añadir campos nuevos.
  for (const [id, oferta] of Object.entries(estado.ofertas)) estado.ofertas[id] = completarOferta(oferta);
  const ofertas = Object.values(estado.ofertas);
  for (const oferta of ofertas) {
    m.aplicarClasificacion(oferta);
    m.aplicarAlojamiento(oferta);
    m.aplicarZona(oferta);
    oferta.precioNoche = precioPorPersonaNoche(oferta, ajustes.viajeros ?? 2);
    Object.assign(oferta.fechas, m.asignarFechas(oferta, findes, puentes));
  }
  await m.geolocalizar(ofertas, crearCtx('geo'));
  await m.calcularCoche(ofertas, crearCtx('coche'));
  await m.calcularCosteCoche(ofertas, crearCtx('coche'));
  const dudosos = m.revisarPrecios(ofertas, conPrefijo('precios'));
  if (dudosos) conPrefijo('precios')(`${dudosos} ofertas con un precio no creíble: se muestran sin precio`);
  m.calcularReferencia(ofertas);
  m.marcarEquivalentes(ofertas);
  await m.anadirTiempo(ofertas, { ...crearCtx('tiempo'), findes, puentes });
  await m.anadirEventos(ofertas, { ...crearCtx('eventos'), findes, puentes });
  for (const oferta of ofertas) oferta.enlaces = m.enlacesPara(oferta, { origen: ajustes.origen, ahora });
  m.registrarPrecios(historial, ofertas, ahora);
  m.compactar(historial, ahora, { idsVivos: ofertas.map((o) => o.id) });
  m.puntuar(ofertas, ajustes, { ahora, findeActual: findes[0]?.id ?? null });
  ofertas.sort((a, b) => b.puntuacion - a.puntuacion);

  const estadoFuentes = estadoParaPanel(fuentes, estado, ajustes);
  const panelUrl = urlPanel(ajustes, env);
  const salida = {
    ofertas: {
      generado: ahora.toISOString(), origen: ajustes.origen, aeropuertos: ajustes.vuelos.aeropuertos, viajeros: ajustes.viajeros ?? 2,
      temas: TEMAS, findes, puentes, fuentes: estadoFuentes, ofertas,
    },
    historial: m.seriesPara(historial, ofertas.map((o) => o.id)),
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
