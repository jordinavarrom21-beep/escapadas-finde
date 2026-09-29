/**
 * Arranque del panel: carga los datos, enruta por el hash, conecta filtros,
 * favoritos, ficha, mapa, cabecera y modo de color.
 */

import { abrirFicha, liberarFicha } from './ficha.js';
import { diasEntre, estadoFinde, fechaLocal, findesProximos, proximoPuente } from './fechas.js';
import {
  POR_PAGINA, actividadesCerca, buscarTexto, crearHash, criterioVigilado, filtrosVigentes, leerFiltrosActividades,
  leerFiltrosComunes, leerFiltrosEscapadas, leerFiltrosVuelos, leerRuta, medirDistancias, referenciaNovedades, resumenFuentes,
} from './filtros.js';
import { contar, cuentaAtras, escaparHtml as esc, haceCuanto } from './formato.js';
import {
  MAX_COMPARAR, borrarBusqueda, cargarBusquedas, cargarComparar, cargarDescartadas, guardarComparar, cargarFavoritos, cargarFiltros, cargarSalida, cargarViaje,
  guardarBusqueda, guardarDescartadas, guardarFavoritos, guardarFiltros, guardarSalida, guardarTema, guardarViaje,
  tomarVisitaAnterior,
} from './local.js';
import { salidaEfectiva, validarSalida, validarViaje } from './viaje.js';
import { destruirMapa, pintarMapa } from './mapa.js';
import { estadoVacio } from './plantillas.js';
import { activarUbicacion } from './ubicacion.js';
import {
  VISTAS_HTML, contarSecundarios, paramsBuscadorFinde, contenidoSorpresa, contextoBusqueda, ctxTarjetas, datosMapa, formularioViaje, nombreSalida,
  resultadosMapa, textoViaje,
} from './vistas.js';

const $ = (selector) => document.querySelector(selector);
const principal = $('#principal');
const dialogo = $('#ficha');
/** GitHub lanza una revisión cada ~4 h (LEEME, «Revisión puntual»): a las 6 h ya es raro. */
const DATOS_ANTIGUOS_MS = 6 * 3_600_000;
const AVISO_MS = 5000;
const SALTO_SORPRESA = 3;
const CAMPOS_QUE_SE_ESCRIBEN = ['number', 'search', 'text'];
/** Vistas que recuerdan sus últimos filtros al volver a ellas. */
const VISTAS_CON_MEMORIA = ['escapadas', 'actividades', 'vuelos'];
const TITULOS = {
  finde: 'Este finde', vuelos: 'Vuelos', escapadas: 'Escapadas', actividades: 'Actividades', mapa: 'Mapa',
  calendario: 'Calendario', puentes: 'Puentes', vigilados: 'Vigilados', fuentes: 'Fuentes', buscar: 'Buscar', comparar: 'Comparar',
};

let estado = null;
let vistaActual = null;
let temporizadorFiltros = null;
let temporizadorAviso = null;
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
  // Tu salida (si no es el origen del escaneo), viajeros y noches: solo en este navegador.
  const salida = salidaEfectiva(validarSalida(cargarSalida()), datos.origen);
  return {
    datos: { ...datos, puentes: datos.puentes ?? [], fuentes: datos.fuentes ?? [], temas: datos.temas ?? [] },
    historial,
    vigilados: vigilados.vigilados ?? [],
    ahora,
    hoy,
    findes: findes.length ? findes : findesProximos(10, ahora),
    puente: proximoPuente(datos.puentes ?? [], hoy),
    favoritos: cargarFavoritos(),
    comparar: cargarComparar(),
    descartadas: cargarDescartadas(),
    busquedas: cargarBusquedas(),
    salto: 0,
    visitaAnterior,
    referencia: referenciaNovedades(visitaAnterior, datos.generado),
    temas: new Map((datos.temas ?? []).map((t) => [t.id, t])),
    fuentes: new Map((datos.fuentes ?? []).map((f) => [f.id, f.nombre])),
    porId: new Map(datos.ofertas.map((o) => [o.id, o])),
    salida,
    viaje: validarViaje(cargarViaje(), datos.viajeros),
    // Desde tu salida: desde el origen del escaneo, con los tiempos reales; si no, estimados.
    distanciasOrigen: medirDistancias(datos.ofertas, salida, datos.origen),
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
  // Es la hora de la última revisión; cada web se consulta a su ritmo y cada oferta dice cuándo se comprobó.
  actualizado.innerHTML = `${antiguo ? '⚠️ ' : ''}Última revisión <time datetime="${esc(generado)}" title="${esc(new Date(generado).toLocaleString('es-ES'))}. Cada web se consulta a su ritmo (de 30 min a 1 día): en cada oferta pone cuándo se comprobó.">${esc(haceCuanto(generado))}</time>`;
  actualizado.classList.toggle('antiguo', antiguo);
}

function pintarCabecera() {
  pintarReloj();
  pintarBotonViaje();
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
  // Contadas igual que las enseña «Verlas» (sin repetidas ni descartadas), para que cuadren.
  const nuevas = buscarTexto(estado.datos.ofertas, leerFiltrosComunes({ nuevas: '1' }), contextoBusqueda(estado)).length;
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
  if (!texto) return;
  const aviso = $('#aviso');
  aviso.textContent = texto;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { aviso.textContent = ''; }, AVISO_MS);
}

function prepararMapa(params) {
  const d = datosMapa(estado, params);
  $('#resultados').innerHTML = resultadosMapa(estado, params, d);
  pintarMapa($('#mapa'), d, ctxTarjetas(estado, { distancias: d.distancias, desde: d.desde }));
}

/** La URL manda siempre; en las vistas con memoria, lo que trae se guarda como «lo último». */
function rutaActual() {
  const ruta = leerRuta(location.hash);
  if (VISTAS_CON_MEMORIA.includes(ruta.vista) && Object.keys(ruta.params).length) guardarFiltros(ruta.vista, ruta.params);
  return ruta;
}

const contextoFechas = () => ({ hoy: estado.hoy, findes: estado.findes, puentes: estado.datos.puentes });

/**
 * Los enlaces del menú de las vistas con memoria llevan sus últimos filtros (sin lo que
 * ya ha caducado). Así se recuperan al entrar desde el menú, pero Atrás y Adelante
 * siguen el historial de verdad (antes se reescribía la entrada «sin filtros»).
 */
function enlacesConMemoria() {
  for (const enlace of document.querySelectorAll('.navegacion a[data-vista]')) {
    const vista = enlace.dataset.vista;
    if (!VISTAS_CON_MEMORIA.includes(vista)) continue;
    const guardados = filtrosVigentes(cargarFiltros(vista) ?? {}, contextoFechas());
    enlace.setAttribute('href', crearHash(vista, guardados));
    enlace.toggleAttribute('data-con-memoria', Object.keys(guardados).length > 0);
  }
}

function render({ enfocar = true } = {}) {
  const { vista, params } = rutaActual();
  const cambiaVista = vista !== vistaActual;
  if (cambiaVista) estado.paginas.clear();
  if (dialogo.open) dialogo.close();
  if (vista !== 'mapa') destruirMapa();
  vistaActual = vista;
  principal.innerHTML = VISTAS_HTML[vista].html(estado, params);
  // El aviso «con los filtros de la última vez» solo vale para la entrada desde el menú.
  estado.filtrosRecordados = false;
  enlacesConMemoria();
  document.title = `${TITULOS[vista]} · Escapadas Finde`;
  document.querySelectorAll('.navegacion a').forEach((a) => {
    if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#q').value = vista === 'buscar' ? params.q ?? '' : '';
  principal.querySelectorAll('form[data-filtros]').forEach((form) => activarUbicacion(form, estado.datos.origen, { salida: estado.salida }));
  if (vista === 'mapa') prepararMapa(params);
  sincronizarMasFiltros(params);
  pintarBarraComparar();
  if (cambiaVista && enfocar) {
    window.scrollTo(0, 0);
    principal.querySelector('.titulo-vista')?.focus({ preventScroll: true });
  }
}

function actualizarResultados(vista, params) {
  if (vista === 'mapa') prepararMapa(params);
  else $('#resultados').innerHTML = VISTAS_HTML[vista].resultados(estado, params);
  anunciar($('#resultados [data-resumen]')?.dataset.resumen);
  sincronizarMasFiltros(params);
}

/** El contador de «Más filtros» y su botón del móvil siguen a los filtros sin repintar el formulario. */
function sincronizarMasFiltros(params) {
  const secundarios = contarSecundarios(params);
  const contador = principal.querySelector('[data-contador-mas]');
  if (contador) contador.textContent = secundarios ? `(${contar(secundarios, 'puesto')})` : '';
  const resumen = $('#resultados [data-resumen]')?.dataset.resumen;
  const ver = principal.querySelector('[data-cerrar-mas]');
  if (ver && resumen) ver.textContent = `Ver ${resumen}`;
}

function paramsDeFormulario(formulario) {
  const params = {};
  for (const [clave, valor] of new FormData(formulario)) {
    if (valor === '') continue;
    params[clave] = params[clave] ? `${params[clave]},${valor}` : valor;
  }
  // «Un día concreto» es un atajo del rango: ese día como principio y como fin.
  if (params.dia) {
    params.desde = params.dia;
    params.hasta = params.dia;
  }
  delete params.dia;
  // Las casillas que vienen marcadas de fábrica («Ocultar cruceros») tienen que dejar
  // constancia en la URL de que se han desmarcado; si no, se volverían a activar solas.
  // Marcadas son lo normal y no se escriben.
  for (const casilla of formulario.querySelectorAll('input[type="checkbox"][data-defecto]')) {
    if (casilla.checked) delete params[casilla.name];
    else params[casilla.name] = '0';
  }
  // Un desplegable en su primera opción (el orden por defecto) tampoco es un filtro:
  // así la URL y la memoria solo guardan lo que de verdad se ha tocado.
  for (const lista of formulario.querySelectorAll('select[name]:not([multiple])')) {
    if (params[lista.name] !== undefined && params[lista.name] === lista.options[0]?.value) delete params[lista.name];
  }
  return params;
}

/** `repintar` es el nombre del campo que obliga a rehacer el formulario (país, listas negras). */
function aplicarFiltros(formulario, { repintar = null } = {}) {
  const vista = formulario.dataset.filtros;
  const params = paramsDeFormulario(formulario);
  history.replaceState(null, '', crearHash(vista, params));
  if (VISTAS_CON_MEMORIA.includes(vista)) {
    guardarFiltros(vista, params);
    enlacesConMemoria();
  }
  estado.paginas.clear();
  if (!repintar) {
    actualizarResultados(vista, params);
    return;
  }
  // Repintar el formulario no debe cerrar «Más filtros» (en el móvil, a pantalla completa)
  // ni los demás desplegables que estuvieran abiertos.
  const abiertos = [...principal.querySelectorAll('details')].map((d) => d.open);
  render({ enfocar: false });
  principal.querySelectorAll('details').forEach((d, i) => { if (abiertos[i]) d.open = true; });
  principal.querySelector(`[name="${CSS.escape(repintar)}"][data-repintar]`)?.focus();
}

function alCambiarFiltro(evento) {
  const campo = evento.target;
  const formulario = campo.closest?.('form[data-filtros]');
  if (!formulario || (!campo.name && campo !== formulario)) return;
  // «Un día concreto» y el rango se excluyen: el que se toca manda y el otro se vacía.
  const fechas = formulario.elements;
  if ((campo.name === 'desde' || campo.name === 'hasta') && fechas.dia) fechas.dia.value = '';
  if (campo.name === 'dia' && fechas.desde && fechas.hasta) {
    fechas.desde.value = '';
    fechas.hasta.value = '';
  }
  const repintar = campo.dataset?.repintar === undefined ? null : campo.name;
  const escribiendo = evento.type === 'input' && CAMPOS_QUE_SE_ESCRIBEN.includes(campo.type);
  clearTimeout(temporizadorFiltros);
  temporizadorFiltros = setTimeout(() => aplicarFiltros(formulario, { repintar }), escribiendo ? 300 : 0);
}

function verMas(boton) {
  const { mas: clave, desde } = boton.dataset;
  estado.paginas.set(clave, Number(desde) + POR_PAGINA);
  const { vista, params } = leerRuta(location.hash);
  if (VISTAS_HTML[vista].resultados && $('#resultados')?.contains(boton)) actualizarResultados(vista, params);
  else render({ enfocar: false });
  document.querySelector(`[data-lista="${CSS.escape(clave)}"] > :nth-child(${Number(desde) + 1}) .enlace-ficha`)?.focus();
}

// ── Sorpresa y búsquedas guardadas ───────────────────────────────────────────

function otraSorpresa() {
  estado.salto += SALTO_SORPRESA;
  const contenedor = $('#sorpresa');
  if (contenedor) contenedor.innerHTML = contenidoSorpresa(estado, leerRuta(location.hash).params);
  anunciar('Tres planes nuevos');
}

const nombreEscrito = () => principal.querySelector('[data-nombre-busqueda]')?.value.trim() ?? '';

function guardarBusquedaActual(vista) {
  const nombre = nombreEscrito();
  if (!nombre) {
    principal.querySelector('[data-nombre-busqueda]')?.focus();
    anunciar('Ponle un nombre a la búsqueda para poder guardarla.');
    return;
  }
  estado.busquedas = guardarBusqueda({ nombre, vista, hash: location.hash || crearHash(vista, {}) });
  render({ enfocar: false });
  anunciar(`Búsqueda «${nombre}» guardada en este navegador.`);
}

function borrarBusquedaGuardada(nombre) {
  estado.busquedas = borrarBusqueda(nombre);
  render({ enfocar: false });
  anunciar(`Búsqueda «${nombre}» borrada.`);
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return copiarConSeleccion(texto);
  }
}

/** Respaldo para navegadores sin API de portapapeles o sin permiso. */
function copiarConSeleccion(texto) {
  const area = Object.assign(document.createElement('textarea'), { value: texto, readOnly: true });
  area.style.cssText = 'position:fixed;opacity:0';
  document.body.append(area);
  area.select();
  const copiado = document.execCommand?.('copy') ?? false;
  area.remove();
  return copiado;
}

async function copiarVigilado(vista, boton) {
  const { params } = leerRuta(location.hash);
  const leer = { vuelos: leerFiltrosVuelos, actividades: leerFiltrosActividades }[vista] ?? leerFiltrosEscapadas;
  const filtros = leer(params);
  const json = JSON.stringify(criterioVigilado(nombreEscrito(), filtros, { vista }), null, 2);
  const copiado = await copiarTexto(json);
  const caja = boton.closest('details')?.querySelector('.vigilado-json')
    ?? Object.assign(document.createElement('pre'), { className: 'vigilado-json' });
  caja.textContent = json;
  boton.closest('details')?.append(caja);
  anunciar(copiado
    ? 'Criterio copiado: pégalo en config/vigilados.json, dentro de la lista "vigilados".'
    : 'No se ha podido copiar solo: tienes el criterio debajo del botón para copiarlo a mano.');
}

// ── Favoritos, descartadas y ficha ───────────────────────────────────────────

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

/** Barra flotante «⚖️ Comparar (2)»: solo con algo elegido y fuera de la propia comparación. */
function pintarBarraComparar() {
  const barra = $('#barra-comparar');
  const n = estado.comparar.size;
  barra.hidden = n === 0 || vistaActual === 'comparar';
  barra.innerHTML = n ? `<a class="boton boton--primario" href="#/comparar">⚖️ Comparar (${n} de ${MAX_COMPARAR})</a>
<button type="button" class="boton boton--suave boton--mini" data-vaciar-comparar>Vaciar</button>` : '';
}

/** Añade o quita una oferta de la comparación (como mucho MAX_COMPARAR). */
function alternarComparar(id) {
  const activo = !estado.comparar.has(id);
  if (activo && estado.comparar.size >= MAX_COMPARAR) {
    anunciar(`Solo se comparan ${MAX_COMPARAR} a la vez: quita una con ⚖️ antes de añadir otra.`);
    return;
  }
  if (activo) estado.comparar.add(id);
  else estado.comparar.delete(id);
  guardarComparar(estado.comparar);
  if (vistaActual === 'comparar') render({ enfocar: false });
  document.querySelectorAll(`[data-comparar="${CSS.escape(id)}"].boton-comparar`).forEach((boton) => boton.setAttribute('aria-pressed', String(activo)));
  pintarBarraComparar();
  anunciar(activo ? `Añadida a la comparación (${estado.comparar.size} de ${MAX_COMPARAR})` : 'Quitada de la comparación');
}

function vaciarComparar() {
  estado.comparar.clear();
  guardarComparar(estado.comparar);
  document.querySelectorAll('.boton-comparar').forEach((boton) => boton.setAttribute('aria-pressed', 'false'));
  pintarBarraComparar();
  anunciar('Comparación vacía');
}

function ocultarTarjetas(id) {
  document.querySelectorAll(`[data-descartar="${CSS.escape(id)}"]`)
    .forEach((boton) => boton.closest('.con-motivo, .tarjeta, .billete')?.remove());
}

/** La primera vez que se descarta algo se activa el filtro, para que no vuelva a aparecer. */
function alternarDescartada(id) {
  const descartar = !estado.descartadas.has(id);
  if (descartar) estado.descartadas.add(id);
  else estado.descartadas.delete(id);
  guardarDescartadas(estado.descartadas);
  if (!descartar) {
    anunciar('Oferta recuperada');
    return;
  }
  if (dialogo.open) dialogo.close();
  ocultarTarjetas(id);
  // Las descartadas se ocultan por defecto en todas las listas (salvo «sindesc=0»).
  const { vista, params } = leerRuta(location.hash);
  if (VISTAS_HTML[vista].resultados) actualizarResultados(vista, params);
  anunciar('Oferta descartada. Para volver a verla, desmarca «Ocultar las descartadas» en los filtros.');
}

function mostrarFicha(id, disparador) {
  const oferta = estado.porId.get(id);
  if (!oferta) return;
  const { vista, params } = leerRuta(location.hash);
  const { punto } = ['escapadas', 'mapa'].includes(vista) ? leerFiltrosEscapadas(params) : {};
  const distancias = punto ? medirDistancias([oferta], punto, estado.datos.origen) : estado.distanciasOrigen;
  origenFicha = disparador;
  abrirFicha(dialogo, oferta, ctxTarjetas(estado, {
    distancias,
    desde: punto?.nombre ?? nombreSalida(estado),
    actividades: actividadesCerca(estado.datos.ofertas, oferta),
  }));
}

// ── Tu viaje: salida, viajeros y noches ──────────────────────────────────────

const dialogoViaje = $('#mi-viaje');
let origenViaje = null;

function pintarBotonViaje() {
  $('#boton-viaje').textContent = textoViaje(estado);
}

function abrirViaje(disparador) {
  const formulario = $('#form-viaje');
  formulario.innerHTML = formularioViaje(estado);
  activarUbicacion(formulario, estado.datos.origen, { salida: estado.salida, prefijo: 'salida' });
  origenViaje = disparador;
  dialogoViaje.showModal();
  formulario.querySelector('#salida-texto')?.focus();
}

/** Guarda tu viaje y rehace distancias, aeropuertos y costes (nada sale del navegador). */
function guardarMiViaje(evento) {
  evento.preventDefault();
  const d = Object.fromEntries(new FormData(evento.target));
  const salida = validarSalida({ nombre: d.lugar, lat: d.lat, lon: d.lon });
  const viaje = validarViaje({ viajeros: d.viajeros, noches: d.noches }, estado.datos.viajeros);
  guardarSalida(salida);
  guardarViaje(viaje);
  estado.salida = salidaEfectiva(salida, estado.datos.origen);
  estado.viaje = viaje;
  estado.distanciasOrigen = medirDistancias(estado.datos.ofertas, estado.salida, estado.datos.origen);
  dialogoViaje.close();
  pintarBotonViaje();
  render({ enfocar: false });
  anunciar(`Guardado en este navegador: ${textoViaje(estado).replace(/^📍 /, '')}.`);
}

const ACCIONES = '[data-comparar], [data-vaciar-comparar], [data-mi-viaje], [data-cerrar-viaje], [data-ficha], [data-fav], [data-descartar], [data-mas], [data-sorpresa],'
  + ' [data-guardar-busqueda], [data-borrar-busqueda], [data-copiar-vigilado], [data-cerrar-ficha], [data-cerrar-novedades],'
  + ' [data-olvidar-filtros], [data-cerrar-mas]';

function manejarClic(evento) {
  const objetivo = evento.target.closest(ACCIONES);
  if (!objetivo) return;
  const d = objetivo.dataset;
  if (d.comparar) alternarComparar(d.comparar);
  else if ('vaciarComparar' in d) vaciarComparar();
  else if ('miViaje' in d) abrirViaje(objetivo);
  else if ('cerrarViaje' in d) dialogoViaje.close();
  else if (d.ficha) mostrarFicha(d.ficha, objetivo);
  else if (d.fav) alternarFavorito(d.fav);
  else if (d.descartar) alternarDescartada(d.descartar);
  else if ('mas' in d) verMas(objetivo);
  else if ('sorpresa' in d) otraSorpresa();
  else if (d.guardarBusqueda) guardarBusquedaActual(d.guardarBusqueda);
  else if (d.borrarBusqueda) borrarBusquedaGuardada(d.borrarBusqueda);
  else if (d.copiarVigilado) copiarVigilado(d.copiarVigilado, objetivo);
  else if ('cerrarFicha' in d) dialogo.close();
  else if ('olvidarFiltros' in d) guardarFiltros(leerRuta(objetivo.getAttribute('href')).vista, {}); // el enlace sigue su curso
  else if ('cerrarMas' in d) cerrarMasFiltros(objetivo);
  else $('#novedades').hidden = true;
}

/** Cierra «Más filtros» (en el móvil ocupa toda la pantalla) y lleva a los resultados. */
function cerrarMasFiltros(boton) {
  const panel = boton.closest('details');
  if (panel) panel.open = false;
  // El foco va a donde se lleva la vista (la cuenta de resultados), no al «Más filtros» de arriba.
  const cuenta = $('#resultados .resultados__cuenta');
  cuenta?.setAttribute('tabindex', '-1');
  cuenta?.focus({ preventScroll: true });
  $('#resultados')?.scrollIntoView({ block: 'start' });
}

// ── Arranque ─────────────────────────────────────────────────────────────────

function conectarEventos() {
  document.addEventListener('click', manejarClic);
  principal.addEventListener('input', alCambiarFiltro);
  principal.addEventListener('change', alCambiarFiltro);
  principal.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (evento.target.matches('[data-buscador-finde]')) {
      location.hash = crearHash('escapadas', paramsBuscadorFinde(Object.fromEntries(new FormData(evento.target))));
    }
  });
  // «#principal» (el enlace de saltar al contenido) no es una ruta: no se cambia de vista.
  window.addEventListener('hashchange', () => { if (!location.hash || location.hash.startsWith('#/')) render(); });
  $('.saltar')?.addEventListener('click', (evento) => {
    evento.preventDefault();
    principal.focus();
    principal.scrollIntoView();
  });
  // Entrar desde el menú a una vista con memoria enseña el aviso de «filtros de la última vez».
  document.querySelector('.navegacion')?.addEventListener('click', (evento) => {
    if (evento.target.closest('a[data-con-memoria]')) estado.filtrosRecordados = true;
  });
  document.addEventListener('visibilitychange', refrescarSiHaceFalta);
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
  $('#form-viaje').addEventListener('submit', guardarMiViaje);
  dialogoViaje.addEventListener('click', (evento) => {
    if (evento.target === dialogoViaje) dialogoViaje.close();
  });
  dialogoViaje.addEventListener('close', () => {
    if (origenViaje?.isConnected) origenViaje.focus();
    origenViaje = null;
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

const REFRESCO_MS = 30 * 60_000;
let cargadoEn = Date.now();

/**
 * Con la pestaña o la app instalada abiertas días, al volver a ella se renuevan los
 * datos si ha cambiado el día o han pasado 30 min: si no, «Este finde» seguiría con el
 * finde pasado.
 */
async function refrescarSiHaceFalta() {
  if (document.visibilityState !== 'visible' || !estado) return;
  if (fechaLocal(new Date()) === estado.hoy && Date.now() - cargadoEn < REFRESCO_MS) return;
  try {
    const [datos, historial, vigilados] = await Promise.all([
      cargarJson('data/ofertas.json'),
      cargarJson('data/historial.json', {}),
      cargarJson('data/vigilados.json', { vigilados: [] }),
    ]);
    const { paginas, salto } = estado;
    estado = { ...crearEstado(datos, historial, vigilados), paginas, salto };
    cargadoEn = Date.now();
    pintarCabecera();
    render({ enfocar: false });
  } catch (error) {
    console.warn('No se han podido renovar los datos al volver a la pestaña:', error);
  }
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
  } catch (error) {
    console.error('No se han podido cargar los datos del panel:', error);
    principal.innerHTML = estadoVacio('No se han podido cargar las ofertas',
      'Puede que aún no se haya hecho la primera revisión o que no haya conexión.', '<a class="boton boton--primario" href="">Reintentar</a>');
    return;
  }
  conectarEventos();
  pintarCabecera();
  pintarNovedades();
  render({ enfocar: false });
  setInterval(pintarReloj, 30_000);
  if ('serviceWorker' in navigator) {
    // Sin service worker el panel funciona igual, solo que no se instala ni va sin conexión.
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('No se ha podido registrar el service worker:', error));
  }
}

iniciar();
