#!/usr/bin/env node
/**
 * Escaneo completo: fuentes → almacén → enriquecimiento → datos del panel → emails.
 * El orden y los formatos están en docs/CONTRATOS.md.
 *
 * Uso: node src/escanear.js [--forzar] [--solo=<fuente>] [--sin-emails]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Cache } from './cache.js';
import { cargarJson, estadoInicial, fusionar, guardarJson, podar } from './almacen.js';
import { FUENTES } from './fuentes/index.js';
import { TEMAS } from './modelo.js';
import { aplicarClasificacion } from './enriquecer/temas.js';
import { enlacesPara } from './enriquecer/enlaces.js';
import { asignarFechas, calcularPuentes, obtenerFestivos } from './enriquecer/festivos.js';
import { calcularCoche, geolocalizar } from './enriquecer/geo.js';
import { puntuar } from './enriquecer/puntuacion.js';
import { compactar, registrarPrecios, seriesPara } from './historial.js';
import { cargarVigilados, coincide } from './vigilados.js';
import { procesarEmails } from './emails/decidir.js';
import { crearTransporte, enviarEmail } from './emails/enviar.js';
import { clienteHttp } from './util/http.js';
import { ErrorRobots, comprobarRobots } from './util/robots.js';
import { fechaLocal, findesProximos, sumarDias } from './util/fechas.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTAS = {
  ajustes: 'config/ajustes.json',
  vigilados: 'config/vigilados.json',
  estado: 'data/estado.json',
  cache: 'data/cache.json',
  historial: 'data/historial.json',
  panelOfertas: 'site/data/ofertas.json',
  panelHistorial: 'site/data/historial.json',
  panelVigilados: 'site/data/vigilados.json',
};
/** Una fuente se vuelve a consultar cuando ha pasado este porcentaje de su intervalo (los crons se retrasan). */
const MARGEN_INTERVALO = 0.8;
const HORIZONTE_PUENTES_DIAS = 120;
const CADUCIDAD_CACHE_MS = 200 * 24 * 60 * 60 * 1000;

/** Módulos que usa el escaneo; los tests pueden sustituir cualquiera. */
export const MODULOS = {
  obtenerFestivos, calcularPuentes, asignarFechas, aplicarClasificacion, geolocalizar, calcularCoche,
  enlacesPara, registrarPrecios, compactar, seriesPara, puntuar, procesarEmails, crearTransporte, enviarEmail,
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
      ultimoIntento: iso,
      nuevas: 0,
      duracionMs: Math.round(performance.now() - inicio),
    };
  }
}

function estadoParaPanel(fuentes, estado) {
  return fuentes.map((f) => {
    const s = estado.fuentes[f.id] ?? {};
    return {
      id: f.id, nombre: f.nombre, web: f.web, modo: f.modo,
      estado: s.estado ?? 'pendiente', motivo: s.motivo ?? null, error: s.error ?? null,
      desdeError: s.desdeError ?? null, ultimoOk: s.ultimoOk ?? null, ultimoIntento: s.ultimoIntento ?? null,
      total: s.total ?? 0, nuevas: s.nuevas ?? 0, falta: s.falta ?? [],
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

  const hoy = fechaLocal(ahora);
  const hastaPuentes = sumarDias(hoy, HORIZONTE_PUENTES_DIAS);
  const anios = [...new Set([hoy, hastaPuentes].map((fecha) => Number(fecha.slice(0, 4))))];
  const festivos = await m.obtenerFestivos({ ...ctxBase, log: conPrefijo('festivos') }, anios);
  const puentes = m.calcularPuentes(festivos, { desde: hoy, hasta: hastaPuentes });
  const findes = findesProximos(ajustes.vuelos.findes, ahora).map((finde) => ({
    ...finde,
    puenteId: puentes.find((p) => p.desde <= finde.domingo && p.hasta >= finde.viernes)?.id ?? null,
  }));

  const crearCtx = (id) => ({ ...ctxBase, log: conPrefijo(id), findes, puentes });
  await Promise.all(fuentes.map((fuente) => ejecutarFuente(fuente, { estado, ajustes, env, ahora, opciones, crearCtx })));
  const podadas = podar(estado, ahora, { retencionDias: ajustes.retencionDias });

  const ofertas = Object.values(estado.ofertas);
  for (const oferta of ofertas) {
    m.aplicarClasificacion(oferta);
    Object.assign(oferta.fechas, m.asignarFechas(oferta, findes, puentes));
  }
  await m.geolocalizar(ofertas, crearCtx('geo'));
  await m.calcularCoche(ofertas, crearCtx('coche'));
  for (const oferta of ofertas) oferta.enlaces = m.enlacesPara(oferta, { origen: ajustes.origen, ahora });
  m.registrarPrecios(historial, ofertas, ahora);
  m.compactar(historial, ahora, { idsVivos: ofertas.map((o) => o.id) });
  m.puntuar(ofertas, ajustes, { ahora, findeActual: findes[0]?.id ?? null });
  ofertas.sort((a, b) => b.puntuacion - a.puntuacion);

  const estadoFuentes = estadoParaPanel(fuentes, estado);
  const panelUrl = urlPanel(ajustes, env);
  const salida = {
    ofertas: {
      generado: ahora.toISOString(), origen: ajustes.origen, aeropuertos: ajustes.vuelos.aeropuertos,
      temas: TEMAS, findes, puentes, fuentes: estadoFuentes, ofertas,
    },
    historial: m.seriesPara(historial, ofertas.map((o) => o.id)),
    vigilados: { vigilados: vigilados.map((c) => ({ ...c, coincidencias: ofertas.filter((o) => coincide(o, c)).map((o) => o.id) })) },
  };

  let emails = { enviados: [], errores: [] };
  if (!opciones.sinEmails) {
    const transporte = m.crearTransporte(env);
    emails = await m.procesarEmails({
      ofertas, estado, ajustes, vigilados, findes, puentes, fuentes: estadoFuentes, panelUrl, ahora,
      enviar: transporte ? (mensaje) => m.enviarEmail(transporte, mensaje, env) : null,
      log: conPrefijo('emails'),
    });
  }
  cache.podar(CADUCIDAD_CACHE_MS, ahora.getTime());
  return { estado, cache, historial, salida, informe: { fuentes: estadoFuentes, podadas, total: ofertas.length, emails, puentes } };
}

// ---------------------------------------------------------------- CLI

function leerOpciones(argumentos) {
  return {
    forzar: argumentos.includes('--forzar'),
    sinEmails: argumentos.includes('--sin-emails'),
    solo: argumentos.find((a) => a.startsWith('--solo='))?.slice('--solo='.length) ?? null,
  };
}

// Los datos corruptos no deben parar el vigilante: se avisa y se empieza de cero.
function leerDatos(ruta, porDefecto) {
  try {
    return cargarJson(ruta, porDefecto);
  } catch (error) {
    console.warn(`⚠️  ${path.relative(RAIZ, ruta)} no se puede leer (${error.message}); se empieza de cero`);
    return structuredClone(porDefecto);
  }
}

function imprimirInforme({ fuentes, total, podadas, emails, puentes }) {
  const iconos = { ok: '✅', error: '❌', desactivada: '⏸️ ', bloqueada: '🚫', pendiente: '⏳' };
  console.log('\nFuente              Estado  Nuevas  Total  Detalle');
  for (const f of fuentes) {
    const detalle = f.error ?? f.motivo ?? (f.ultimoOk ? `ok ${f.ultimoOk.slice(11, 16)} UTC` : '');
    console.log(`${f.nombre.padEnd(20)}${(iconos[f.estado] ?? f.estado).padEnd(8)}${String(f.nuevas).padStart(6)}${String(f.total).padStart(7)}  ${detalle}`);
  }
  console.log(`\n${total} ofertas en total (${podadas} retiradas por caducadas o antiguas).`);
  console.log(`Puentes a la vista: ${puentes.map((p) => `${p.etiqueta} (${p.nombre})`).join('; ') || 'ninguno'}.`);
  if (emails.enviados.length) console.log(`Emails enviados: ${emails.enviados.join(', ')}.`);
  if (emails.errores.length) console.log(`Emails con error: ${emails.errores.join('; ')}.`);
}

async function principal() {
  const ruta = (clave) => path.join(RAIZ, RUTAS[clave]);
  const opciones = leerOpciones(process.argv.slice(2));
  const ajustes = cargarJson(ruta('ajustes'));
  const resultado = await escanear({
    ajustes,
    vigilados: cargarVigilados(ruta('vigilados')),
    estado: leerDatos(ruta('estado'), estadoInicial()),
    cache: new Cache(leerDatos(ruta('cache'), {})),
    historial: leerDatos(ruta('historial'), {}),
    opciones,
  });
  guardarJson(ruta('estado'), resultado.estado);
  guardarJson(ruta('cache'), resultado.cache.exportar());
  guardarJson(ruta('historial'), resultado.historial);
  guardarJson(ruta('panelOfertas'), resultado.salida.ofertas);
  guardarJson(ruta('panelHistorial'), resultado.salida.historial);
  guardarJson(ruta('panelVigilados'), resultado.salida.vigilados);
  imprimirInforme(resultado.informe);

  const ejecutadas = resultado.informe.fuentes.filter((f) => ['ok', 'error'].includes(f.estado));
  if (ejecutadas.length && ejecutadas.every((f) => f.estado === 'error')) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
