/**
 * Arranque del panel: carga los datos, enruta por el hash, conecta filtros,
 * favoritos, ficha, mapa, cabecera y modo de color.
 */

import { abrirFicha, liberarFicha } from './ficha.js';
import { fechasDeBusqueda } from './fechas-enlaces.js';
import { diasEntre, estadoFinde, fechaLocal, findesProximos, proximoPuente } from './fechas.js';
import {
  POR_PAGINA, actividadesCerca, traducirFormulario, buscarTexto, crearHash, criterioVigilado, filtrosVigentes, leerFiltrosActividades,
  leerFiltrosComunes, leerFiltrosEscapadas, leerFiltrosVuelos, leerRuta, medirDistancias, paramsViaje, referenciaNovedades,
  resumenFuentes, viajeDeParams,
} from './filtros.js';
import { contar, cuentaAtras, escaparHtml as esc, haceCuanto, urlSegura } from './formato.js';
import {
  MAX_COMPARAR, borrarBusqueda, cargarBusquedas, marcarBusquedaVista, cargarComparar, cargarDescartadas, cargarMisEstados, guardarComparar, guardarMisEstados, cargarFavoritos, cargarFiltros, cargarSalida, cargarViaje,
  guardarBusqueda, guardarDescartadas, guardarFavoritos, guardarFiltros, guardarModoLista, guardarSalida, guardarTema, guardarViaje,
  tomarVisitaAnterior, bienvenidaVista, esPropietarioGuardado, guardarPropietario, marcarBienvenidaVista,
  exportarGuardados, importarGuardados,
} from './local.js';
import { salidaEfectiva, validarSalida, validarViaje } from './viaje.js';
import { destruirMapa, pintarMapa } from './mapa.js';
import { estadoVacio } from './plantillas.js';
import { icono } from './iconos.js';
import { activarUbicacion } from './ubicacion.js';
import {
  VISTAS_HTML, contarSecundarios, totalNovedadesGuardadas, paramsBuscadorFinde, contenidoSorpresa, contextoBusqueda, ctxTarjetas, datosMapa, formularioViaje, nombreSalida,
  misAeropuertos, resultadosMapa, textoViaje,
} from './vistas.js';

const $ = (selector) => document.querySelector(selector);
const esMovil = () => matchMedia('(max-width: 719px)').matches;
const principal = $('#principal');
const dialogo = $('#ficha');
/** El título de index.html (con lo que se busca: «Escapadas de fin de semana desde…»): la portada lo conserva. */
const TITULO_PORTADA = document.title;
/** «Revisión continua» escanea cada 15 min: si pasan 2 h sin datos nuevos, algo falla. */
const DATOS_ANTIGUOS_MS = 2 * 3_600_000;
const AVISO_MS = 5000;
const SALTO_SORPRESA = 3;
const CAMPOS_QUE_SE_ESCRIBEN = ['number', 'search', 'text'];
/** Vistas que recuerdan sus últimos filtros al volver a ellas. */
const VISTAS_CON_MEMORIA = ['escapadas', 'actividades', 'vuelos'];
const TITULOS = {
  finde: 'Este finde', vuelos: 'Vuelos', escapadas: 'Escapadas', actividades: 'Planes', mapa: 'Mapa',
  calendario: 'Calendario', puentes: 'Puentes', vigilados: 'Avisos por email', fuentes: 'Estado de las webs', buscar: 'Buscar',
  comparar: 'Comparar lado a lado', mis: 'Guardados', ayuda: 'Cómo funciona',
};
/** Qué apartado del menú se marca en cada vista (Inicio, Explorar, Fechas o Mis cosas). */
const APARTADO = {
  finde: 'finde', escapadas: 'escapadas', actividades: 'escapadas', vuelos: 'escapadas', mapa: 'escapadas', buscar: 'escapadas',
  calendario: 'calendario', puentes: 'calendario', mis: 'mis', comparar: 'mis', vigilados: 'mis',
};

let estado = null;
let vistaActual = null;
let temporizadorFiltros = null;
let temporizadorAviso = null;
let origenFicha = null;

/**
 * Origen de los datos. En un hosting propio, `<meta name="escapadas-datos">` (lo pone
 * scripts/preparar-web.js con --datos) apunta a la web de GitHub Pages, que se renueva en
 * cada escaneo: así el hosting siempre enseña las ofertas del momento sin subir nada. Si
 * esa web no responde, se usa la copia que lleva el propio hosting.
 */
const DATOS_REMOTOS = document.querySelector('meta[name="escapadas-datos"]')?.content || null;

async function pedirJson(url) {
  const respuesta = await fetch(url, { cache: 'no-cache' });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en ${url}`);
  return respuesta.json();
}

async function cargarJson(ruta, porDefecto) {
  try {
    if (DATOS_REMOTOS && ruta.startsWith('data/')) {
      try {
        return await pedirJson(new URL(ruta, DATOS_REMOTOS).href);
      } catch (error) {
        console.warn(`Sin datos de ${DATOS_REMOTOS}, se usa la copia local:`, error);
      }
    }
    return await pedirJson(ruta);
  } catch (error) {
    if (porDefecto === undefined) throw error;
    return porDefecto;
  }
}

/**
 * ¿Es quien administra la web? Entrando una vez con «?propietario=1» (o «#/mis?propietario=1»)
 * se recuerda en este navegador («=0» lo quita); en local, siempre. Solo enseña herramientas
 * de configuración (avisos por email en GitHub): no da acceso a nada.
 */
function detectarPropietario() {
  const enHash = new URLSearchParams(location.hash.split('?')[1] ?? '').get('propietario');
  const valor = new URLSearchParams(location.search).get('propietario') ?? enHash;
  if (valor === '1' || valor === '0') guardarPropietario(valor === '1');
  return esPropietarioGuardado() || ['localhost', '127.0.0.1'].includes(location.hostname);
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
    misEstados: cargarMisEstados(),
    descartadas: cargarDescartadas(),
    busquedas: cargarBusquedas(),
    salto: 0,
    visitaAnterior,
    referencia: referenciaNovedades(visitaAnterior, datos.generado),
    temas: new Map((datos.temas ?? []).map((t) => [t.id, t])),
    fuentes: new Map((datos.fuentes ?? []).map((f) => [f.id, f.nombre])),
    porId: new Map(datos.ofertas.map((o) => [o.id, o])),
    salida,
    propietario: detectarPropietario(),
    bienvenidaVista: bienvenidaVista(),
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
  // La cuenta atrás va en la portada (no está en las demás vistas).
  const cuenta = $('#cuenta-atras');
  if (cuenta) cuenta.textContent = esFinde ? ' · ¡Es finde!' : ` · en ${cuentaAtras(faltaMs)}`;
  const generado = estado.datos.generado;
  const antiguo = Date.now() - Date.parse(generado) > DATOS_ANTIGUOS_MS;
  const actualizado = $('#actualizado');
  // En la cabecera solo si los datos son viejos (la portada ya dice cuándo se revisó).
  actualizado.innerHTML = `${icono('alerta')}Revisado <time datetime="${esc(generado)}" title="${esc(new Date(generado).toLocaleString('es-ES'))}. Cada web se consulta a su ritmo (de 15 min a 1 día): en cada oferta pone cuándo se comprobó.">${esc(haceCuanto(generado))}</time>`;
  actualizado.classList.toggle('antiguo', antiguo);
  actualizado.hidden = !antiguo;
}

/**
 * Pie: si hay enlaces de afiliado o patrocinios, cómo funcionan; si no, que no los hay.
 * Lo dice el escaneo (ofertas.json → afiliacion), no se supone.
 */
function pintarAvisoComercial() {
  const proveedores = estado.datos.afiliacion?.proveedores ?? [];
  const patrocinadas = estado.datos.ofertas.some((o) => o.patrocinada);
  const nombres = proveedores.map((id) => estado.fuentes.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1));
  $('#aviso-comercial').textContent = proveedores.length || patrocinadas
    ? `${proveedores.length ? `Los enlaces a ${nombres.join(', ')} son de afiliado («Enlace de afiliado»): si reservas, la web puede pagarnos una comisión. ` : ''}${patrocinadas ? 'Las ofertas patrocinadas llevan «Patrocinado». ' : ''}Nada de esto cambia tu precio ni el orden de las ofertas, que depende solo de precio, fechas y calidad.`
    : 'Ahora mismo ningún enlace es de afiliado y no hay ofertas patrocinadas: el orden depende solo de precio, fechas y calidad.';
}

/**
 * Cuenta un clic en un enlace externo (proveedor, tipo de enlace y de oferta, vista), sin
 * datos personales, solo si ofertas.json trae una dirección de medición. Un clic no es una venta.
 */
function contarClic(enlace) {
  const destino = urlSegura(estado?.datos.afiliacion?.medicion ?? '');
  if (!destino || !navigator.sendBeacon) return;
  const { clic, clicTipo, clicOferta } = enlace.dataset;
  navigator.sendBeacon(destino, JSON.stringify({ proveedor: clic, enlace: clicTipo, oferta: clicOferta, vista: vistaActual }));
}

/** El próximo puente, en la portada junto a la cuenta atrás. */
function pintarPuente() {
  const p = estado.puente;
  const aviso = $('#aviso-puente');
  if (!p || !aviso) return;
  const faltan = diasEntre(estado.hoy, p.desde);
  const cuando = faltan <= 0 ? 'ahora' : faltan === 1 ? 'mañana' : `en ${faltan} días`;
  aviso.innerHTML = `<a href="${crearHash('puentes', {})}" title="Puente de ${esc(p.nombre)}">${icono('puentes')}Puente ${esc(p.etiqueta)} · ${cuando}</a>`;
  aviso.hidden = false;
}

function pintarCabecera() {
  pintarReloj();
  pintarAvisoComercial();
  pintarBotonViaje();
  // El estado de las webs va en el pie: en la cabecera, «21/21» no se entendía.
  const r = resumenFuentes(estado.datos.fuentes);
  const enlace = $('#estado-fuentes');
  enlace.classList.toggle('estado-fuentes--error', r.conError > 0);
  enlace.querySelector('.estado-fuentes__texto').textContent = `${r.ok} de ${r.activas} webs funcionan${r.conError ? ` · ${r.conError} con errores` : ''} · ver el estado`;
}

function pintarNovedades() {
  // Contadas igual que las enseña «Verlas» (sin repetidas ni descartadas), para que cuadren.
  const nuevas = buscarTexto(estado.datos.ofertas, leerFiltrosComunes({ nuevas: '1' }), contextoBusqueda(estado)).length;
  const aviso = $('#novedades');
  if (!nuevas) return;
  // Una pastilla junto a «Tu salida», no una franja en todas las vistas.
  const desde = estado.visitaAnterior ? `desde tu última visita (${haceCuanto(estado.visitaAnterior)})` : 'en las últimas 24 h';
  aviso.innerHTML = `${icono('nuevo')}<span>${nuevas.toLocaleString('es-ES')}<span class="solo-ancho"> ${nuevas === 1 ? 'novedad' : 'novedades'}</span></span>`;
  aviso.setAttribute('aria-label', `${contar(nuevas, 'novedad', 'novedades')} ${desde}`);
  aviso.title = `${contar(nuevas, 'oferta nueva', 'ofertas nuevas')} ${desde}. Pulsa para verlas.`;
  aviso.hidden = false;
}

function temaEfectivo() {
  return document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function pintarBotonTema() {
  const oscuro = temaEfectivo() === 'dark';
  const boton = $('#cambiar-tema');
  boton.innerHTML = icono(oscuro ? 'sol' : 'luna');
  boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

/** El número del menú «Mis cosas»: ofertas nuevas que cumplen tus búsquedas guardadas. */
function pintarAvisoMis() {
  const aviso = $('#aviso-mis');
  if (!aviso) return;
  const n = totalNovedadesGuardadas(estado);
  aviso.textContent = n > 99 ? '99+' : String(n);
  aviso.hidden = n === 0;
  aviso.closest('a')?.setAttribute('aria-label', n ? `Guardados: ${n} ${n === 1 ? 'oferta nueva' : 'ofertas nuevas'} en tus búsquedas guardadas` : 'Guardados');
}

/** Marca «Tarjetas» o «Lista» según el modo puesto (una clase en <html>, ver tema.js). */
function sincronizarModoLista() {
  const lista = document.documentElement.classList.contains('modo-lista');
  document.querySelectorAll('[data-modo-lista]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.modoLista === 'lista') === lista)));
}

function cambiarModoLista(modo) {
  document.documentElement.classList.toggle('modo-lista', modo === 'lista');
  guardarModoLista(modo);
  sincronizarModoLista();
  anunciar(modo === 'lista' ? 'Resultados en lista' : 'Resultados en tarjetas');
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

/**
 * El desplegable «Más» del menú se cierra al cambiar de vista, al tocar fuera o al elegir
 * una de sus vistas (también la que ya está abierta, que no cambia el hash).
 */
function cerrarMenuMas(evento = null) {
  const mas = document.querySelector('.navegacion__mas details');
  if (!mas?.open) return;
  const dentro = evento && mas.contains(evento.target);
  if (!dentro || evento.target.closest('.navegacion__submenu a')) mas.open = false;
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
  for (const enlace of document.querySelectorAll('.navegacion a[data-vista], .pestanas a[data-vista]')) {
    const vista = enlace.dataset.vista;
    if (!VISTAS_CON_MEMORIA.includes(vista)) continue;
    const guardados = filtrosVigentes(cargarFiltros(vista) ?? {}, contextoFechas());
    enlace.setAttribute('href', crearHash(vista, guardados));
    enlace.toggleAttribute('data-con-memoria', Object.keys(guardados).length > 0);
  }
}

/**
 * Las fechas que se buscan (finde, puente, día o rango): con ellas los enlaces de las
 * ofertas de fechas flexibles abren esos días. Solo en las vistas que filtran por fecha.
 */
function anotarBusqueda(vista, params) {
  estado.busqueda = ['escapadas', 'actividades', 'mapa', 'buscar'].includes(vista)
    ? fechasDeBusqueda(params, { finde: estado.findes[0], puente: estado.puente, findes: estado.findes, puentes: estado.datos.puentes, noches: estado.viaje?.noches })
    : null;
}

function render({ enfocar = true } = {}) {
  const { vista, params } = rutaActual();
  anotarBusqueda(vista, params);
  const cambiaVista = vista !== vistaActual;
  if (cambiaVista) estado.paginas.clear();
  if (dialogo.open) dialogo.close();
  cerrarMenuMas();
  if (vista !== 'mapa') destruirMapa();
  vistaActual = vista;
  principal.innerHTML = VISTAS_HTML[vista].html(estado, params);
  // El aviso «con los filtros de la última vez» solo vale para la entrada desde el menú.
  estado.filtrosRecordados = false;
  enlacesConMemoria();
  document.title = vista === 'finde' ? TITULO_PORTADA : `${TITULOS[vista]} · Escapadas Finde`;
  document.querySelectorAll('.navegacion a').forEach((a) => {
    if (a.dataset.vista === APARTADO[vista]) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#q').value = vista === 'buscar' ? params.q ?? '' : '';
  principal.querySelectorAll('form[data-filtros]').forEach((form) => activarUbicacion(form, estado.datos.origen, { salida: estado.salida }));
  if (vista === 'mapa') prepararMapa(params);
  // En el móvil los filtros empiezan plegados: primero las ofertas.
  if (cambiaVista && esMovil()) principal.querySelectorAll('[data-plegable-movil]').forEach((d) => { d.open = false; });
  sincronizarMasFiltros(params);
  sincronizarModoLista();
  pintarAvisoMis();
  if (vista === 'finde') {
    pintarReloj();
    pintarPuente();
  }
  pintarBarraComparar();
  if (cambiaVista && enfocar) {
    window.scrollTo(0, 0);
    principal.querySelector('.titulo-vista')?.focus({ preventScroll: true });
  }
  // «#/ayuda?seccion=privacidad»: directo a esa sección.
  if (params.seccion) principal.querySelector(`#${CSS.escape(params.seccion)}`)?.scrollIntoView();
}

function actualizarResultados(vista, params) {
  anotarBusqueda(vista, params);
  if (vista === 'mapa') prepararMapa(params);
  else $('#resultados').innerHTML = VISTAS_HTML[vista].resultados(estado, params);
  anunciar($('#resultados [data-resumen]')?.dataset.resumen);
  sincronizarMasFiltros(params);
  sincronizarModoLista();
  pintarBarraComparar(); // el «Mapa»/«Lista» de la barra lleva los filtros nuevos
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
  traducirFormulario(params);
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
  anunciar(`Búsqueda «${nombre}» guardada: cuando vuelvas, en «Guardados» verás las ofertas nuevas que la cumplan.`);
}

function borrarBusquedaGuardada(nombre) {
  estado.busquedas = borrarBusqueda(nombre);
  render({ enfocar: false });
  pintarAvisoMis();
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
  const json = JSON.stringify(criterioVigilado(nombreEscrito(), filtros, {
    vista, salida: estado.salida, viajeros: estado.viaje.viajeros, aeropuertos: misAeropuertos(estado),
  }), null, 2);
  const copiado = await copiarTexto(json);
  const caja = boton.closest('details')?.querySelector('.vigilado-json')
    ?? Object.assign(document.createElement('pre'), { className: 'vigilado-json' });
  caja.textContent = json;
  boton.closest('details')?.append(caja);
  anunciar(copiado
    ? 'Criterio copiado para los avisos por email: pégalo en config/vigilados.json, dentro de la lista "vigilados".'
    : 'No se ha podido copiar solo: tienes el criterio debajo del botón para copiarlo a mano.');
}

// ── Favoritos, descartadas y ficha ───────────────────────────────────────────

function alternarFavorito(id) {
  const activo = !estado.favoritos.has(id);
  if (activo) estado.favoritos.add(id);
  else estado.favoritos.delete(id);
  guardarFavoritos(estado.favoritos);
  document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach((boton) => boton.setAttribute('aria-pressed', String(activo)));
  anunciar(activo ? 'Guardada en favoritos: la tienes en «Guardados»' : 'Quitada de favoritos');
}

/** Vistas con filtros: en el móvil, la barra de abajo tiene «Filtros» y, si toca, «Mapa» o «Lista». */
const VISTAS_CON_BARRA = ['escapadas', 'vuelos', 'actividades', 'mapa'];

/**
 * Barra flotante de abajo: «Comparar (2 de 3)» con algo elegido (fuera de la propia
 * comparación) y, en el móvil, «Filtros» y el cambio entre lista y mapa sin perder filtros.
 */
function pintarBarraComparar() {
  const barra = $('#barra-comparar');
  const n = estado.comparar.size;
  const { params } = leerRuta(location.hash);
  const acciones = [];
  if (esMovil() && VISTAS_CON_BARRA.includes(vistaActual)) {
    acciones.push(`<button type="button" class="boton boton--suave" data-abrir-filtros>${icono('filtros')}Filtros</button>`);
    if (vistaActual === 'escapadas') acciones.push(`<a class="boton boton--suave" href="${esc(crearHash('mapa', params))}">${icono('mapa')}Mapa</a>`);
    if (vistaActual === 'mapa') acciones.push(`<a class="boton boton--suave" href="${esc(crearHash('escapadas', params))}">${icono('lista')}Lista</a>`);
  }
  if (n && vistaActual !== 'comparar') {
    acciones.push(`<a class="boton boton--primario" href="#/comparar">${icono('comparar')}${esMovil() ? `Comparar (${n})` : `Comparar lado a lado (${n} de ${MAX_COMPARAR})`}</a>`,
      `<button type="button" class="boton boton--suave boton--mini" data-vaciar-comparar aria-label="Vaciar la comparación">${icono('cerrar')}<span class="barra-comparar__texto">Vaciar</span></button>`);
  }
  barra.hidden = acciones.length === 0;
  barra.classList.toggle('barra-comparar--compacta', !(n && vistaActual !== 'comparar'));
  barra.innerHTML = acciones.join('');
}

/**
 * La barra flotante se aparta al bajar por la lista (para no tapar los botones de las
 * tarjetas) y vuelve al subir, al pararse un momento o cerca del principio.
 */
function vigilarDesplazamiento() {
  let ultimo = window.scrollY;
  let parada = null;
  const mostrar = () => $('#barra-comparar')?.classList.remove('barra-comparar--oculta');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const barra = $('#barra-comparar');
    if (barra && !barra.hidden) barra.classList.toggle('barra-comparar--oculta', y > ultimo && y > 200);
    ultimo = y;
    clearTimeout(parada);
    parada = setTimeout(mostrar, 900);
  }, { passive: true });
}

/** «Filtros» de la barra: despliega los filtros y lleva a ellos. */
function abrirFiltros() {
  const plegable = principal.querySelector('[data-plegable-movil], .filtros-plegables');
  if (!plegable) return;
  plegable.open = true;
  plegable.scrollIntoView({ block: 'start' });
  plegable.querySelector('summary')?.focus({ preventScroll: true });
}

/** Añade o quita una oferta de la comparación (como mucho MAX_COMPARAR). */
function alternarComparar(id) {
  const activo = !estado.comparar.has(id);
  if (activo && estado.comparar.size >= MAX_COMPARAR) {
    anunciar(`Solo se comparan ${MAX_COMPARAR} a la vez: quita una antes de añadir otra.`);
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
  // El chollazo destacado de la portada no lleva ✕, pero se puede descartar desde su ficha.
  document.querySelectorAll(`.destacado [data-ficha="${CSS.escape(id)}"]`).forEach((enlace) => enlace.closest('.destacado')?.remove());
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
  anunciar('Oferta descartada. Para volver a verla, desmarca «Ocultar las descartadas y las no disponibles» en los filtros.');
}

/**
 * Lo que solo usa la ficha (enlaces y eventos) va en data/detalles.json: se baja al abrir
 * la primera ficha, una vez por escaneo, y se añade a las ofertas. Sin él, la ficha sale
 * igual, solo que sin esos bloques.
 */
let detalles = null;
function cargarDetalles() {
  if (!detalles) {
    const datos = estado.datos;
    detalles = cargarJson('data/detalles.json', {}).then((porId) => {
      for (const o of datos.ofertas) if (porId[o.id]) Object.assign(o, porId[o.id]);
    }).catch((error) => console.warn('No se han podido cargar los detalles de las fichas:', error));
  }
  return detalles;
}

async function mostrarFicha(id, disparador) {
  const oferta = estado.porId.get(id);
  if (!oferta) return;
  await cargarDetalles();
  const { vista, params } = leerRuta(location.hash);
  const { punto } = ['escapadas', 'mapa'].includes(vista) ? leerFiltrosEscapadas(params) : {};
  const distancias = punto ? medirDistancias([oferta], punto, estado.datos.origen) : estado.distanciasOrigen;
  origenFicha = disparador;
  abrirFicha(dialogo, oferta, ctxTarjetas(estado, {
    distancias,
    desde: punto?.nombre ?? nombreSalida(estado),
    actividades: actividadesCerca(estado.datos.ofertas, oferta),
    // Para enlazar las otras webs de «Comparar precios» con su enlace de reserva.
    porId: estado.porId,
  }));
}

// ── Tu viaje: salida, viajeros y noches ──────────────────────────────────────

const dialogoViaje = $('#mi-viaje');
let origenViaje = null;

function pintarBotonViaje() {
  // En el móvil sobra el «Desde»: así caben «Tu salida» y las novedades en una fila.
  const texto = textoViaje(estado);
  $('#boton-viaje').innerHTML = `${icono('pin')}<span><span class="solo-ancho">Desde </span>${esc(texto.replace(/^Desde /, ''))}</span>`;
  $('#boton-viaje').setAttribute('aria-label', `${texto}. Cambiar salida, viajeros o noches`);
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
  dialogoViaje.close();
  aplicarViaje(salida, viaje);
}

/** Guarda salida, viajeros y noches y rehace distancias, aeropuertos y costes. */
function aplicarViaje(salida, viaje) {
  guardarSalida(salida);
  guardarViaje(viaje);
  estado.salida = salidaEfectiva(salida, estado.datos.origen);
  estado.viaje = viaje;
  estado.distanciasOrigen = medirDistancias(estado.datos.ofertas, estado.salida, estado.datos.origen);
  pintarBotonViaje();
  render({ enfocar: false });
  anunciar(`Guardado en este navegador: ${textoViaje(estado)}.`);
}

/** «Usar …» de un enlace compartido: adopta su salida, viajeros y noches. */
function usarViajeCompartido() {
  const compartido = viajeDeParams(leerRuta(location.hash).params);
  if (!compartido) return;
  aplicarViaje(validarSalida(compartido.salida), validarViaje(compartido.viaje, estado.datos.viajeros));
}

/** Copia el enlace de la búsqueda con tu salida, viajeros y noches (quien lo abra elige si los usa). */
async function compartirBusqueda(vista) {
  const { params } = leerRuta(location.hash);
  const hash = crearHash(vista, { ...params, ...paramsViaje(estado.salida, estado.viaje) });
  const enlace = `${location.origin}${location.pathname}${hash}`;
  anunciar(await copiarTexto(enlace)
    ? 'Enlace copiado: abre la misma búsqueda, con tu salida, viajeros y noches.'
    : `No se ha podido copiar solo. El enlace es: ${enlace}`);
}

/** «La he reservado» o «Ya no está disponible» (volver a pulsar lo quita). */
function alternarMiEstado(id, nuevo) {
  if (estado.misEstados.get(id) === nuevo) estado.misEstados.delete(id);
  else estado.misEstados.set(id, nuevo);
  guardarMisEstados(estado.misEstados);
  const marcado = estado.misEstados.get(id);
  document.querySelectorAll(`[data-mi-estado][data-oferta="${CSS.escape(id)}"]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.miEstado === marcado)));
  const { vista, params } = leerRuta(location.hash);
  if (VISTAS_HTML[vista].resultados) actualizarResultados(vista, params);
  anunciar(marcado === 'reservada' ? 'Marcada como reservada (solo en este navegador)' : marcado ? 'Marcada como no disponible: ya no sale en las listas (solo en este navegador; para verla, desmarca «Ocultar las descartadas y las no disponibles»)' : 'Marca quitada');
}

const ACCIONES = '[data-actualizar], [data-compartir-busqueda], [data-usar-viaje], [data-mi-estado], [data-abrir-filtros], [data-comparar], [data-vaciar-comparar], [data-mi-viaje], [data-cerrar-viaje], [data-ficha], [data-fav], [data-descartar], [data-mas], [data-sorpresa],'
  + ' [data-guardar-busqueda], [data-borrar-busqueda], [data-copiar-vigilado], [data-cerrar-ficha], [data-cerrar-novedades],'
  + ' [data-olvidar-filtros], [data-cerrar-mas], [data-modo-lista], [data-abrir-busqueda], [data-ver-datos-nuevos], [data-cerrar-bienvenida], [data-ir-buscador], [data-exportar-guardados]';

function manejarClic(evento) {
  const objetivo = evento.target.closest(ACCIONES);
  if (!objetivo) return;
  const d = objetivo.dataset;
  if ('actualizar' in d) location.reload();
  else if ('verDatosNuevos' in d) aplicarDatosNuevos();
  else if ('exportarGuardados' in d) descargarGuardados();
  else if ('irBuscador' in d) {
    // «Ya sé dónde quiero ir»: al buscador de la cabecera, que busca en todo.
    const q = $('#q');
    q.scrollIntoView({ block: 'center' });
    q.focus({ preventScroll: true });
  }
  else if ('cerrarBienvenida' in d) {
    marcarBienvenidaVista();
    estado.bienvenidaVista = true;
    objetivo.closest('.bienvenida')?.remove();
  }
  else if (d.compartirBusqueda) compartirBusqueda(d.compartirBusqueda);
  else if ('usarViaje' in d) usarViajeCompartido();
  else if (d.miEstado) alternarMiEstado(d.oferta, d.miEstado);
  else if ('abrirFiltros' in d) abrirFiltros();
  else if (d.comparar) alternarComparar(d.comparar);
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
  else if (d.modoLista) cambiarModoLista(d.modoLista);
  else if (d.abrirBusqueda) {
    // El enlace sigue su curso; desde ahora, lo que aparezca es lo nuevo.
    estado.busquedas = marcarBusquedaVista(d.abrirBusqueda);
    pintarAvisoMis();
  }
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

/** «Descargar mis guardados»: un archivo JSON con lo de este navegador (nada sale de él). */
function descargarGuardados() {
  const archivo = new Blob([JSON.stringify(exportarGuardados(), null, 2)], { type: 'application/json' });
  const enlace = Object.assign(document.createElement('a'), { href: URL.createObjectURL(archivo), download: `escapadas-finde-guardados-${estado.hoy}.json` });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
  anunciar('Copia descargada: cárgala en otro navegador desde «Guardados» → «Cargar una copia».');
}

/** «Cargar una copia»: sustituye lo de este navegador y vuelve a pintar con ello. */
async function cargarGuardados(entrada) {
  const [archivo] = entrada.files ?? [];
  if (!archivo) return;
  try {
    const cargadas = importarGuardados(JSON.parse(await archivo.text()));
    anunciar(`Copia cargada (${cargadas} apartados). Recargando…`);
    setTimeout(() => location.reload(), 600);
  } catch (error) {
    anunciar(error instanceof SyntaxError ? 'Ese archivo no es una copia de «Guardados» (no es JSON).' : error.message);
  } finally {
    entrada.value = '';
  }
}

// ── Arranque ─────────────────────────────────────────────────────────────────

function conectarEventos() {
  document.addEventListener('click', manejarClic);
  document.addEventListener('click', cerrarMenuMas);
  // Escape cierra «Más» y devuelve el foco a su botón.
  document.querySelector('.navegacion__mas details')?.addEventListener('keydown', (evento) => {
    const mas = evento.currentTarget;
    if (evento.key !== 'Escape' || !mas.open) return;
    mas.open = false;
    mas.querySelector('summary')?.focus();
  });
  document.addEventListener('click', (evento) => {
    const enlace = evento.target.closest?.('a[data-clic]');
    if (enlace) contarClic(enlace);
  });
  principal.addEventListener('input', alCambiarFiltro);
  principal.addEventListener('change', alCambiarFiltro);
  principal.addEventListener('change', (evento) => { if (evento.target.matches?.('[data-importar-guardados]')) cargarGuardados(evento.target); });
  principal.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (evento.target.matches('[data-buscador-finde]')) {
      location.hash = crearHash('escapadas', paramsBuscadorFinde(Object.fromEntries(new FormData(evento.target))));
    }
  });
  // «#principal» (el enlace de saltar al contenido) no es una ruta: no se cambia de vista.
  window.addEventListener('hashchange', () => { if (!location.hash || location.hash.startsWith('#/')) render(); });
  vigilarDesplazamiento();
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
  matchMedia('(max-width: 719px)').addEventListener('change', pintarBarraComparar);
  dialogoViaje.addEventListener('click', (evento) => {
    if (evento.target === dialogoViaje) dialogoViaje.close();
  });
  dialogoViaje.addEventListener('close', () => {
    if (origenViaje?.isConnected) origenViaje.focus();
    origenViaje = null;
  });
  dialogo.addEventListener('close', () => {
    liberarFicha();
    // Si la lista se ha repintado con la ficha abierta (p. ej. al marcarla como reservada), el
    // botón que la abrió ya no existe: el foco va al de la misma oferta en la lista nueva.
    const mismo = origenFicha?.dataset?.ficha ? principal.querySelector(`[data-ficha="${CSS.escape(origenFicha.dataset.ficha)}"]`) : null;
    (origenFicha?.isConnected ? origenFicha : mismo)?.focus();
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
  if (fechaLocal(new Date()) === estado.hoy && Date.now() - cargadoEn < REFRESCO_MS) {
    comprobarDatosNuevos();
    return;
  }
  try {
    usarDatos(await cargarTodo());
  } catch (error) {
    console.warn('No se han podido renovar los datos al volver a la pestaña:', error);
  }
}

const cargarTodo = () => Promise.all([
  cargarJson('data/ofertas.json'),
  cargarJson('data/historial.json', {}),
  cargarJson('data/vigilados.json', { vigilados: [] }),
]);

function usarDatos([datos, historial, vigilados]) {
  const { paginas, salto } = estado;
  detalles = null;
  estado = { ...crearEstado(datos, historial, vigilados), paginas, salto };
  cargadoEn = Date.now();
  datosNuevos = null;
  $('#datos-nuevos').hidden = true;
  pintarCabecera();
  render({ enfocar: false });
}

/** Con la pestaña abierta se mira cada 10 min si hay un escaneo nuevo (llega uno cada 15). */
const NOVEDADES_MS = 10 * 60_000;
let datosNuevos = null;

/**
 * Si hay un escaneo más reciente, no se repinta por sorpresa (movería lo que estás mirando):
 * sale «Hay ofertas nuevas» con un botón para verlas.
 */
async function comprobarDatosNuevos() {
  if (document.visibilityState !== 'visible' || !estado) return;
  try {
    // Primero la fecha del último escaneo (unos bytes); todo lo demás, solo si es nuevo.
    const version = await cargarJson('data/version.json', null).catch(() => null);
    if (version?.generado && Date.parse(version.generado) <= Date.parse(estado.datos.generado)) return;
    const todo = await cargarTodo();
    if (todo[0].generado === estado.datos.generado || Date.parse(todo[0].generado) < Date.parse(estado.datos.generado)) return;
    datosNuevos = todo;
    const aviso = $('#datos-nuevos');
    // «Actualizar» (versión nueva) ya trae también los datos nuevos: no se tapa.
    if (aviso.querySelector('[data-actualizar]')) return;
    aviso.innerHTML = `<span>${icono('nuevo')} Hay ofertas nuevas (revisado ${esc(haceCuanto(todo[0].generado))})</span><button type="button" class="boton boton--primario" data-ver-datos-nuevos>Ver</button>`;
    aviso.hidden = false;
  } catch (error) {
    console.warn('No se ha podido mirar si hay ofertas nuevas:', error);
  }
}

function aplicarDatosNuevos() {
  if (datosNuevos) usarDatos(datosNuevos);
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
  setInterval(comprobarDatosNuevos, NOVEDADES_MS);
  activarActualizaciones();
}

/** A mitad de algo (una ficha o «Tu viaje» abiertos, escribiendo): mejor no recargar de golpe. */
const ocupado = () => dialogo.open || dialogoViaje.open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

/**
 * En el aviso flotante, no en la pastilla de novedades: esa es un enlace a «#/buscar?nuevas=1»
 * y, dentro de él, pulsar «Actualizar» llevaba a las novedades en vez de solo recargar.
 */
function avisarVersionNueva() {
  const aviso = $('#datos-nuevos');
  aviso.innerHTML = `<span>${icono('nuevo')} Hay una versión nueva del panel</span><button type="button" class="boton boton--primario" data-actualizar>Actualizar</button>`;
  aviso.hidden = false;
}

/**
 * Versiones nuevas sin tener que recargar a mano: cada despliegue trae un service worker
 * nuevo (sw.js lleva el SHA) que toma el control en cuanto se instala, y entonces la página
 * se recarga sola con la interfaz nueva; si estás a mitad de algo, sale «Actualizar».
 * Al volver a la pestaña o a la app se mira si hay versión nueva.
 */
function activarActualizaciones() {
  // Sin service worker el panel funciona igual, solo que no se instala ni va sin conexión.
  if (!('serviceWorker' in navigator)) return;
  // La primera instalación también cambia de controlador, pero entonces no había nada viejo.
  const habiaVersion = Boolean(navigator.serviceWorker.controller);
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion || recargando) return;
    if (ocupado()) {
      avisarVersionNueva();
      return;
    }
    recargando = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js')
    .then((registro) => {
      // También al abrir: Safari del iPhone puede tardar en mirar si hay sw.js nuevo y la
      // web seguía con la interfaz anterior.
      registro?.update?.().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registro?.update?.().catch(() => {});
      });
    })
    .catch((error) => console.warn('No se ha podido registrar el service worker:', error));
}

iniciar();
