/**
 * Arranque del panel: carga los datos, enruta por el hash, conecta filtros,
 * favoritos, ficha, mapa, cabecera y modo de color.
 */

import { abrirFicha, liberarFicha } from './ficha.js';
import { diasEntre, estadoFinde, fechaLocal, findesProximos, proximoPuente } from './fechas.js';
import {
  POR_PAGINA, crearHash, esNovedad, leerFiltrosEscapadas, leerRuta, medirDistancias,
  referenciaNovedades, resumenFuentes,
} from './filtros.js';
import { contar, cuentaAtras, escaparHtml as esc, haceCuanto } from './formato.js';
import { cargarFavoritos, guardarFavoritos, guardarTema, tomarVisitaAnterior } from './local.js';
import { destruirMapa, pintarMapa } from './mapa.js';
import { estadoVacio } from './plantillas.js';
import { activarUbicacion } from './ubicacion.js';
import { VISTAS_HTML, ctxTarjetas, datosMapa, resultadosMapa } from './vistas.js';

const $ = (selector) => document.querySelector(selector);
const principal = $('#principal');
const dialogo = $('#ficha');
const DATOS_ANTIGUOS_MS = 3 * 3_600_000;
const TITULOS = {
  finde: 'Este finde', vuelos: 'Vuelos', escapadas: 'Escapadas', mapa: 'Mapa', calendario: 'Calendario',
  vigilados: 'Vigilados', fuentes: 'Fuentes', buscar: 'Buscar',
};

let estado = null;
let vistaActual = null;
let temporizadorFiltros = null;
let origenFicha = null;

async function cargarJson(ruta, porDefecto) {
  try {
    const respuesta = await fetch(ruta, { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en ${ruta}`);
    return await respuesta.json();
  } catch (error) {
    if (porDefecto === undefined) throw error;
    return porDefecto;
  }
}

function crearEstado(datos, historial, vigilados) {
  const ahora = new Date();
  const hoy = fechaLocal(ahora);
  const findes = (datos.findes ?? []).filter((f) => f.domingo >= hoy);
  const visitaAnterior = tomarVisitaAnterior(ahora);
  return {
    datos: { ...datos, puentes: datos.puentes ?? [], fuentes: datos.fuentes ?? [], temas: datos.temas ?? [] },
    historial,
    vigilados: vigilados.vigilados ?? [],
    ahora,
    hoy,
    findes: findes.length ? findes : findesProximos(10, ahora),
    puente: proximoPuente(datos.puentes ?? [], hoy),
    favoritos: cargarFavoritos(),
    visitaAnterior,
    referencia: referenciaNovedades(visitaAnterior, datos.generado),
    temas: new Map((datos.temas ?? []).map((t) => [t.id, t])),
    fuentes: new Map((datos.fuentes ?? []).map((f) => [f.id, f.nombre])),
    porId: new Map(datos.ofertas.map((o) => [o.id, o])),
    distanciasOrigen: medirDistancias(datos.ofertas, null, datos.origen),
    paginas: new Map(),
    ubicacion: { hostname: location.hostname, pathname: location.pathname },
  };
}

// ── Cabecera ─────────────────────────────────────────────────────────────────

function pintarReloj() {
  const { esFinde, faltaMs } = estadoFinde(new Date());
  $('#cuenta-atras').textContent = esFinde ? '🎉 ¡Es finde!' : `⏳ Faltan ${cuentaAtras(faltaMs)} para el finde`;
  const generado = estado.datos.generado;
  const antiguo = Date.now() - Date.parse(generado) > DATOS_ANTIGUOS_MS;
  const actualizado = $('#actualizado');
  actualizado.innerHTML = `${antiguo ? '⚠️ ' : ''}Actualizado <time datetime="${esc(generado)}" title="${esc(new Date(generado).toLocaleString('es-ES'))}">${esc(haceCuanto(generado))}</time>`;
  actualizado.classList.toggle('antiguo', antiguo);
}

function pintarCabecera() {
  pintarReloj();
  const p = estado.puente;
  const aviso = $('#aviso-puente');
  if (p) {
    const faltan = diasEntre(estado.hoy, p.desde);
    const cuando = faltan <= 0 ? 'ahora' : faltan === 1 ? 'mañana' : `en ${faltan} días`;
    aviso.innerHTML = `<a href="${crearHash('vuelos', { finde: p.id })}">🎉 Puente de ${esc(p.nombre)} · ${esc(p.etiqueta)} (${cuando})</a>`;
    aviso.hidden = false;
  }
  const r = resumenFuentes(estado.datos.fuentes);
  const enlace = $('#estado-fuentes');
  enlace.classList.toggle('estado-fuentes--error', r.conError > 0);
  enlace.setAttribute('aria-label', `Fuentes: ${r.ok} de ${r.activas} funcionan${r.conError ? `, ${r.conError} con errores` : ''}`);
  enlace.querySelector('.estado-fuentes__texto').textContent = `${r.ok}/${r.activas}`;
}

function pintarNovedades() {
  const nuevas = estado.datos.ofertas.filter((o) => esNovedad(o, estado.referencia)).length;
  const aviso = $('#novedades');
  if (!nuevas) return;
  const desde = estado.visitaAnterior ? `desde tu última visita (${haceCuanto(estado.visitaAnterior)})` : 'en las últimas 24 h';
  aviso.innerHTML = `<p>🆕 <strong>${contar(nuevas, 'novedad', 'novedades')}</strong> ${esc(desde)}</p>
<a class="boton boton--primario" href="#/buscar?nuevas=1">Verlas</a>
<button type="button" class="boton-icono" data-cerrar-novedades aria-label="Ocultar el aviso de novedades">✕</button>`;
  aviso.hidden = false;
}

function temaEfectivo() {
  return document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function pintarBotonTema() {
  const oscuro = temaEfectivo() === 'dark';
  const boton = $('#cambiar-tema');
  boton.textContent = oscuro ? '☀️' : '🌙';
  boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

function cambiarTema() {
  const nuevo = temaEfectivo() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nuevo;
  guardarTema(nuevo === 'dark' ? 'oscuro' : 'claro');
  pintarBotonTema();
}

// ── Vistas ───────────────────────────────────────────────────────────────────

function anunciar(texto) {
  if (texto) $('#aviso').textContent = texto;
}

function prepararMapa(params) {
  const d = datosMapa(estado, params);
  $('#resultados').innerHTML = resultadosMapa(estado, params, d);
  pintarMapa($('#mapa'), d, ctxTarjetas(estado, { distancias: d.distancias, desde: d.desde }));
}

function render({ enfocar = true } = {}) {
  const { vista, params } = leerRuta(location.hash);
  const cambiaVista = vista !== vistaActual;
  if (cambiaVista) estado.paginas.clear();
  if (dialogo.open) dialogo.close();
  if (vista !== 'mapa') destruirMapa();
  vistaActual = vista;
  principal.innerHTML = VISTAS_HTML[vista].html(estado, params);
  document.title = `${TITULOS[vista]} · Escapadas Finde`;
  document.querySelectorAll('.navegacion a').forEach((a) => {
    if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#q').value = vista === 'buscar' ? params.q ?? '' : '';
  principal.querySelectorAll('form[data-filtros]').forEach((form) => activarUbicacion(form, estado.datos.origen));
  if (vista === 'mapa') prepararMapa(params);
  if (cambiaVista && enfocar) {
    window.scrollTo(0, 0);
    principal.querySelector('.titulo-vista')?.focus({ preventScroll: true });
  }
}

function actualizarResultados(vista, params) {
  if (vista === 'mapa') prepararMapa(params);
  else $('#resultados').innerHTML = VISTAS_HTML[vista].resultados(estado, params);
  anunciar($('#resultados [data-resumen]')?.dataset.resumen);
}

function paramsDeFormulario(formulario) {
  const params = {};
  for (const [clave, valor] of new FormData(formulario)) {
    if (valor === '') continue;
    params[clave] = params[clave] ? `${params[clave]},${valor}` : valor;
  }
  return params;
}

function aplicarFiltros(formulario) {
  const vista = formulario.dataset.filtros;
  const params = paramsDeFormulario(formulario);
  history.replaceState(null, '', crearHash(vista, params));
  estado.paginas.clear();
  actualizarResultados(vista, params);
}

function alCambiarFiltro(evento) {
  const formulario = evento.target.closest?.('form[data-filtros]');
  if (!formulario || (!evento.target.name && evento.target !== formulario)) return;
  const escribiendo = evento.type === 'input' && evento.target.type === 'number';
  clearTimeout(temporizadorFiltros);
  temporizadorFiltros = setTimeout(() => aplicarFiltros(formulario), escribiendo ? 300 : 0);
}

function verMas(boton) {
  const { mas: clave, desde } = boton.dataset;
  estado.paginas.set(clave, Number(desde) + POR_PAGINA);
  const { vista, params } = leerRuta(location.hash);
  if (VISTAS_HTML[vista].resultados && $('#resultados')?.contains(boton)) actualizarResultados(vista, params);
  else render({ enfocar: false });
  document.querySelector(`[data-lista="${CSS.escape(clave)}"] > :nth-child(${Number(desde) + 1}) .enlace-ficha`)?.focus();
}

// ── Favoritos y ficha ────────────────────────────────────────────────────────

function alternarFavorito(id) {
  const activo = !estado.favoritos.has(id);
  if (activo) estado.favoritos.add(id);
  else estado.favoritos.delete(id);
  guardarFavoritos(estado.favoritos);
  document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach((boton) => {
    boton.setAttribute('aria-pressed', String(activo));
    boton.textContent = activo ? '★' : '☆';
  });
  anunciar(activo ? 'Guardada en favoritos' : 'Quitada de favoritos');
}

function mostrarFicha(id, disparador) {
  const oferta = estado.porId.get(id);
  if (!oferta) return;
  const { vista, params } = leerRuta(location.hash);
  const { punto } = ['escapadas', 'mapa'].includes(vista) ? leerFiltrosEscapadas(params) : {};
  const distancias = punto ? medirDistancias([oferta], punto, estado.datos.origen) : estado.distanciasOrigen;
  origenFicha = disparador;
  abrirFicha(dialogo, oferta, ctxTarjetas(estado, { distancias, desde: punto?.nombre ?? estado.datos.origen.nombre }));
}

function manejarClic(evento) {
  const objetivo = evento.target.closest('[data-ficha], [data-fav], [data-mas], [data-cerrar-ficha], [data-cerrar-novedades]');
  if (!objetivo) return;
  const { ficha, fav } = objetivo.dataset;
  if (ficha) mostrarFicha(ficha, objetivo);
  else if (fav) alternarFavorito(fav);
  else if ('mas' in objetivo.dataset) verMas(objetivo);
  else if ('cerrarFicha' in objetivo.dataset) dialogo.close();
  else $('#novedades').hidden = true;
}

// ── Arranque ─────────────────────────────────────────────────────────────────

function conectarEventos() {
  document.addEventListener('click', manejarClic);
  principal.addEventListener('input', alCambiarFiltro);
  principal.addEventListener('change', alCambiarFiltro);
  principal.addEventListener('submit', (evento) => evento.preventDefault());
  window.addEventListener('hashchange', () => render());
  $('#buscador').addEventListener('submit', (evento) => {
    evento.preventDefault();
    location.hash = crearHash('buscar', { q: $('#q').value.trim() });
  });
  $('#cambiar-tema').addEventListener('click', cambiarTema);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintarBotonTema);
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });
  // Escape ya cierra el <dialog>, pero Chrome lo ignora a veces (protección de close watcher).
  dialogo.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    dialogo.close();
  });
  dialogo.addEventListener('close', () => {
    liberarFicha();
    if (origenFicha?.isConnected) origenFicha.focus();
    origenFicha = null;
  });
  document.addEventListener('error', (evento) => {
    if (evento.target.matches?.('img.tarjeta__imagen, img.ficha__imagen')) evento.target.remove();
  }, true);
}

async function iniciar() {
  pintarBotonTema();
  try {
    const [datos, historial, vigilados] = await Promise.all([
      cargarJson('data/ofertas.json'),
      cargarJson('data/historial.json', {}),
      cargarJson('data/vigilados.json', { vigilados: [] }),
    ]);
    estado = crearEstado(datos, historial, vigilados);
  } catch {
    principal.innerHTML = estadoVacio('No se han podido cargar las ofertas',
      'Puede que aún no se haya hecho la primera revisión o que no haya conexión.', '<a class="boton boton--primario" href="">Reintentar</a>');
    return;
  }
  conectarEventos();
  pintarCabecera();
  pintarNovedades();
  render({ enfocar: false });
  setInterval(pintarReloj, 30_000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

iniciar();
