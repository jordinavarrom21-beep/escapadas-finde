/**
 * HTML de cada vista. Las vistas con filtros separan el formulario (se pinta al
 * entrar) de los resultados (se repintan al cambiar un filtro, sin perder el foco).
 */

import { diasEntre, etiquetaDia, etiquetaRango, findesProximos } from './fechas.js';
import {
  contar, duracion, enumerar, escaparHtml as esc, euros, haceCuanto, urlSegura,
  ETIQUETAS_ALOJAMIENTO, ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE,
} from './formato.js';
import {
  ALOJAMIENTOS, ATAJOS_ESCAPADAS, ORDENES_ACTIVIDADES, SIN_COCHE, ORDENES_ESCAPADAS, POR_PAGINA, REGIMENES_ORDEN, actividadesPara,
  buscarActividades, buscarEscapadas, buscarTexto, chollazos, chollosDeVuelos, promocionesDeVuelos, crearHash, describirCriterio,
  destinosDe, destinosDeVuelo, esActividad, esEscapada, filtrarVuelos, filtrosActivos, leerFiltrosActividades, zonasDe,
  leerFiltrosComunes, leerFiltrosEscapadas, leerFiltrosVuelos, perfilFavoritos, periodoFinde, planesSorpresa,
  puenteDelFinde, radioBusquedaKm, recomendadas, viajeDeParams, resumenCalendario, resumenFuentes, resumenPuentes, sinComprobar, tieneVuelo,
  leerRuta, urlEditarVigilados, valoresUnicos, vuelosParaMapa,
} from './filtros.js';
import { NOCHES, VIAJEROS, aeropuertosCercanos } from './viaje.js';
import {
  certeza, costeDe, textoCaducidad, textoFechas, textoLugar,
  ESTADOS_FUENTE, estadoVacio, filaOferta, insigniaEstado, rejilla, tarjeta, tarjetaConMotivo, tarjetaDestacada, textoAyudaUbicacion,
} from './plantillas.js';
import { icono, iconoTema } from './iconos.js';

/** Los filtros que van dentro de «Más filtros» (los de arriba se ven siempre). */
const FILTROS_SECUNDARIOS = [
  'pnMin', 'km', 'dto', 'pts', 'nota', 'noches', 'regimen', 'aloj', 'transporte', 'fuente', 'tipo', 'pais', 'region',
  'nuevas', 'fav', 'cho', 'baja', 'hist', 'sindesc', 'frescas', 'dup', 'cru',
];
/** Los que van en «Más filtros» de la vista de vuelos. */
const FILTROS_MAS_VUELOS = ['dto', 'pts', 'cho', 'baja', 'hist', 'nuevas', 'fav', 'sindesc', 'frescas', 'dup'];
const HORAS_SORPRESA = 3;
const ACTIVIDADES_FINDE = 4;
const ETIQUETAS_ORDEN = {
  puntuacion: 'Puntuación',
  total: 'Coste total del viaje',
  persona: 'Coste total por persona',
  calidad: 'Calidad/precio (nota por persona)',
  comodo: 'Más cómodo (menos viaje)',
  precio: 'Precio publicado (sin igualar unidades)',
  noche: 'Precio por persona y noche',
  ahorro: 'Más por debajo de lo normal',
  valoracion: 'Mejor valoradas',
  distancia: 'Distancia',
  novedad: 'Novedad',
};

const mostradas = (e, clave) => e.paginas.get(clave) ?? POR_PAGINA;

/** Desde dónde sales: lo que elegiste en este navegador o, si no, el origen del escaneo. */
export const puntoSalida = (e) => e.salida ?? e.datos.origen;
export const nombreSalida = (e) => puntoSalida(e).nombre;

/** Tus aeropuertos: los de los ajustes desde el origen del escaneo; desde otra salida, los cercanos. */
export const misAeropuertos = (e) => (e.salida ? aeropuertosCercanos(e.salida) : e.datos.aeropuertos ?? []);

/** «Desde Girona · 2 personas · 2 noches» para el botón de la cabecera. */
export const textoViaje = (e) => `Desde ${nombreSalida(e)} · ${contar(e.viaje.viajeros, 'persona')} · ${contar(e.viaje.noches, 'noche')}`;

/** Contenido de «Tu viaje»: salida (sin geolocalización obligatoria), viajeros y noches. */
export function formularioViaje(e) {
  const s = e.salida;
  const noches = Array.from({ length: NOCHES.max - NOCHES.min + 1 }, (_, i) => [String(NOCHES.min + i), contar(NOCHES.min + i, 'noche')]);
  return `<div class="ficha__barra"><button type="button" class="boton-icono" data-cerrar-viaje aria-label="Cerrar sin guardar">${icono('cerrar')}</button></div>
<div class="ficha__contenido">
  <h2 id="viaje-titulo">Tu viaje</h2>
  <p class="suave">Sirve para medir distancias, elegir tus aeropuertos y calcular el coste total. Se guarda solo en este navegador.</p>
  <fieldset class="ubicacion"><legend>Salgo desde</legend>
    <div class="ubicacion__fila">
      <div class="combo">
        <label class="sr" for="salida-texto">Ciudad o pueblo de salida</label>
        <input id="salida-texto" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="salida-sugerencias" autocomplete="off" placeholder="${esc(e.datos.origen.nombre)}" value="${esc(s?.nombre ?? '')}">
        <ul id="salida-sugerencias" class="combo__lista" role="listbox" aria-label="Sugerencias" hidden></ul>
        <input type="hidden" name="lugar" value="${esc(s?.nombre ?? '')}"><input type="hidden" name="lat" value="${s?.lat ?? ''}"><input type="hidden" name="lon" value="${s?.lon ?? ''}">
      </div>
      <button type="button" class="boton boton--suave" data-mi-ubicacion>${icono('ubicacion')}Usar mi ubicación</button>
    </div>
    <p class="ayuda" id="salida-ayuda" role="status">${s
    ? `Desde ${esc(s.nombre)} las distancias y la gasolina son estimaciones (línea recta × 1,3). Déjalo vacío para volver a ${esc(e.datos.origen.nombre)}.`
    : `Desde ${esc(e.datos.origen.nombre)} hay tiempos reales por carretera. Escribe otra ciudad si sales de otro sitio.`}</p>
  </fieldset>
  <div class="filtros__fila">
    <label class="campo">Viajeros <input type="number" name="viajeros" min="${VIAJEROS.min}" max="${VIAJEROS.max}" step="1" inputmode="numeric" value="${e.viaje.viajeros}"></label>
    <label class="campo">Noches (si la oferta no las fija) <select name="noches">${opciones(noches, String(e.viaje.noches))}</select></label>
  </div>
  <p class="acciones"><button type="submit" class="boton boton--primario">Guardar</button></p>
</div>`;
}

/** Viajeros, noches y coche para calcular el coste del viaje. */
const datosViaje = (e) => ({
  viajeros: e.viaje?.viajeros ?? e.datos.viajeros ?? 2, noches: e.viaje?.noches ?? 2, coche: e.datos.coche ?? null,
});

/** Contexto que necesitan las plantillas de tarjetas. */
export function ctxTarjetas(e, extra = {}) {
  return {
    temas: e.temas, fuentes: e.fuentes, favoritos: e.favoritos, referencia: e.referencia,
    historial: e.historial, distancias: e.distanciasOrigen, desde: nombreSalida(e),
    // El coste de coche que calcula el escaneo es desde su origen: desde otra salida no vale.
    salidaPropia: Boolean(e.salida), ...datosViaje(e), ahora: e.ahora, comparar: e.comparar ?? null, misEstados: e.misEstados ?? null,
    intervalos: intervalosDe(e), ...extra,
  };
}

/**
 * Lo que no se enseña en las listas salvo que se pida («sindesc=0»): las descartadas con ✕ y
 * las que has marcado «Ya no está disponible».
 */
export function ocultas(e) {
  const noDisponibles = [...(e.misEstados ?? new Map())].filter(([, marca]) => marca === 'no-disponible').map(([id]) => id);
  return noDisponibles.length ? new Set([...(e.descartadas ?? []), ...noDisponibles]) : (e.descartadas ?? new Set());
}

/** Intervalo de revisión de cada web (para saber cuándo una oferta lleva tiempo sin comprobarse). */
const intervalosDe = (e) => new Map((e.datos.fuentes ?? []).map((f) => [f.id, f.intervaloMin]));
/** Hora del escaneo: «sin comprobar» se mide hasta ella (si el escaneo se retrasa, no pasan todas a la vez). */
const horaRevision = (e) => (Number.isFinite(Date.parse(e.datos.generado)) ? new Date(e.datos.generado) : e.ahora);

/** Contexto de búsqueda: origen, fechas y preferencias de este navegador. */
export function contextoBusqueda(e) {
  return {
    origen: e.datos.origen,
    salida: e.salida ?? null,
    ...datosViaje(e),
    aeropuertos: misAeropuertos(e),
    finde: e.findes[0],
    puente: e.puente,
    findes: e.findes,
    puentes: e.datos.puentes,
    referencia: e.referencia,
    favoritos: e.favoritos,
    descartadas: ocultas(e),
    temas: e.temas,
    revision: horaRevision(e),
    intervalos: intervalosDe(e),
  };
}

function seccion(titulo, contenido, enlace = null, clase = '') {
  const ver = enlace ? `<a class="seccion__enlace" href="${enlace.href}">${enlace.texto}${icono('flecha')}</a>` : '';
  return `<section class="seccion${clase ? ` seccion--${clase}` : ''}"><div class="seccion__cabeza"><h2>${titulo}</h2>${ver}</div>${contenido}</section>`;
}

/** Título de sección con su icono en una pastilla de color (`clase` cambia el color). */
const conIcono = (nombre, texto, clase = '') => `<span class="seccion__icono${clase ? ` seccion__icono--${clase}` : ''}" aria-hidden="true">${icono(nombre)}</span><span>${texto}</span>`;

/** «Tarjetas» o «Lista»: app.js marca el que está puesto (se guarda en este navegador). */
const selectorModo = `<div class="selector-modo" role="group" aria-label="Cómo ver los resultados">
  <button type="button" class="selector-modo__boton" data-modo-lista="tarjetas" aria-pressed="true" aria-label="Ver en tarjetas">${icono('todo')}<span class="solo-ancho">Tarjetas</span></button>
  <button type="button" class="selector-modo__boton" data-modo-lista="lista" aria-pressed="false" aria-label="Ver en lista">${icono('lista')}<span class="solo-ancho">Lista</span></button>
</div>`;
/** Las pestañas de cada apartado del menú: Explorar, Fechas y Mis cosas. */
const PESTANAS = {
  explorar: ['Explorar', [['escapadas', 'Escapadas', 'escapadas'], ['actividades', 'Planes', 'actividades'], ['vuelos', 'Vuelos', 'vuelos'], ['mapa', 'Mapa', 'mapa']]],
  fechas: ['Fechas', [['calendario', 'Calendario', 'calendario'], ['puentes', 'Puentes', 'puentes']]],
  mis: ['Mis cosas', [['mis', 'Guardado', 'corazon'], ['comparar', 'Comparar lado a lado', 'comparar', 'Comparar'], ['vigilados', 'Avisos por email', 'vigilados', 'Por email']]],
};
export function pestanas(apartado, activa) {
  const [nombre, lista] = PESTANAS[apartado];
  // En el móvil, el nombre corto (si lo hay) para que quepan todas sin deslizar.
  const texto = (largo, corto) => (corto ? `<span class="solo-ancho">${largo}</span><span class="solo-estrecho">${corto}</span>` : `<span>${largo}</span>`);
  return `<nav class="pestanas" aria-label="${esc(nombre)}">${lista.map(([vista, largo, ic, corto]) => `<a class="pestana" href="#/${vista}" data-vista="${vista}"${corto ? ` aria-label="${esc(largo)}"` : ''}${vista === activa ? ' aria-current="page"' : ''}>${icono(ic)}${texto(largo, corto)}</a>`).join('')}</nav>`;
}

const resumenResultados = (texto, extra = '', { conModo = true } = {}) => `<div class="resultados__cabeza" data-resumen="${esc(texto)}"><p class="resultados__cuenta">${esc(texto)}</p>${conModo ? selectorModo : ''}${extra}</div>`;
// «data-olvidar-filtros»: al quitar los filtros también se olvidan los recordados de esa vista.
const botonLimpiar = (vista) => `<a class="boton boton--suave" href="#/${vista}" data-olvidar-filtros>${icono('deshacer')}Quitar filtros</a>`;
const opciones = (lista, actual, vacia) => `${vacia ? `<option value="">${vacia}</option>` : ''}${
  lista.map(([valor, texto]) => `<option value="${esc(valor)}"${String(valor) === String(actual ?? '') ? ' selected' : ''}>${esc(texto)}</option>`).join('')}`;
const marcado = (condicion) => (condicion ? ' checked' : '');
const interruptor = (nombre, etiqueta, activo) => `<label class="interruptor"><input type="checkbox" name="${nombre}" value="1"${marcado(activo)}> ${etiqueta}</label>`;
/** Interruptor que viene activado de fábrica: al desmarcarlo, app.js escribe «<nombre>=0» en la URL. */
const interruptorDefecto = (nombre, etiqueta, activo) => `<label class="interruptor"><input type="checkbox" name="${nombre}" value="1" data-defecto${marcado(activo)}> ${etiqueta}</label>`;
const numero = (nombre, etiqueta, valor, extra = '') => `<label class="campo">${etiqueta} <input type="number" name="${nombre}" min="0" step="1" inputmode="numeric" value="${valor ?? ''}"${extra}></label>`;

function motivoFuente(f) {
  if (f.motivo) return f.motivo;
  if (f.falta?.length) return `falta configurar ${f.falta.join(', ')}`;
  return f.error ?? '';
}

function etiquetaPuente(p) {
  return `${icono('puentes')}${esc(p.nombre)} · ${esc(p.etiqueta ?? etiquetaRango(p.desde, p.hasta))}`;
}

// ── Piezas compartidas de los formularios ────────────────────────────────────

function campoTexto(f) {
  return `<label class="campo campo--ancho">Buscar palabras
  <input type="search" name="q" value="${esc(f.q)}" placeholder="playa -crucero" autocomplete="off" enterkeyhint="search">
  <span class="ayuda">Varias palabras a la vez; con «-» delante quitas resultados (<code>playa -crucero</code>).</span>
</label>`;
}

/** Filtros de chollo que valen igual para vuelos y escapadas. */
function filtrosChollo(f) {
  return `${numero('dto', 'Descuento mín. (%)', f.dto, ' max="99" placeholder="Cualquiera"')}
${numero('pts', 'Puntuación mín.', f.puntos, ' max="100" placeholder="0–100"')}
${interruptor('cho', 'Solo chollazos', f.chollazo)}
${interruptor('baja', 'Solo con bajada de precio', f.bajada)}
${interruptor('hist', 'Solo mínimo histórico', f.historico)}`;
}

/** Favoritos, descartadas y duplicadas (las duplicadas se ocultan por defecto). */
function filtrosListas(f) {
  return `${interruptor('fav', 'Solo favoritos', f.fav)}
${interruptor('nuevas', 'Solo novedades', f.nuevas)}
${interruptorDefecto('sindesc', 'Ocultar las descartadas y las no disponibles', f.sinDescartadas)}
${interruptor('frescas', 'Ocultar las que su web lleva días sin publicar', f.soloComprobadas)}
${interruptor('dup', 'Mostrar las repetidas en varias webs', f.conDuplicadas)}`;
}

function chipsExcluidos(nombre, valores, etiqueta) {
  return valores.map((valor) => `<label class="chip chip--excluido"><input type="checkbox" name="${nombre}" value="${esc(valor)}" checked> ${icono('prohibido')}${esc(etiqueta ? etiqueta(valor) : valor)}</label>`).join('');
}

/** Lista negra: temáticas y destinos que no quieres ver. */
function bloqueExclusiones(e, f, ofertas) {
  const destinos = destinosDe(ofertas).filter((d) => !f.noDestinos.includes(d));
  const temasFuera = e.datos.temas.filter((t) => f.noTemas.includes(t.id)).map((t) => t.id);
  const nombreTema = (id) => e.temas.get(id)?.nombre ?? id;
  return `<details class="filtros__mas"${f.noTemas.length || f.noDestinos.length ? ' open' : ''}>
  <summary>No quiero ver…${f.noTemas.length + f.noDestinos.length ? ` <span class="contador">(${f.noTemas.length + f.noDestinos.length})</span>` : ''}</summary>
  <div class="chips__lista">
    ${chipsExcluidos('notemas', temasFuera, nombreTema)}
    ${chipsExcluidos('nodest', f.noDestinos)}
  </div>
  <div class="filtros__fila">
    <label class="campo">Quitar una temática
      <select name="notemas" data-repintar>${opciones(e.datos.temas.filter((t) => !f.noTemas.includes(t.id)).map((t) => [t.id, t.nombre]), '', 'Elige una temática')}</select>
    </label>
    <label class="campo">Quitar un destino
      <select name="nodest" data-repintar>${opciones(destinos.map((d) => [d, d]), '', 'Elige un destino')}</select>
    </label>
  </div>
  <p class="ayuda">Lo que quites aquí no aparece en ninguna lista. Desmarca el chip para volver a verlo.</p>
</details>`;
}

/** Guardar la búsqueda actual y copiarla como criterio de vigilados. */
function bloqueBusquedas(e, vista) {
  const chips = e.busquedas.map((b) => `<span class="chip chip--guardada">
  <a href="${esc(b.hash)}">${esc(b.nombre)}</a>
  <button type="button" class="boton-icono boton-icono--mini" data-borrar-busqueda="${esc(b.nombre)}" aria-label="Borrar la búsqueda guardada ${esc(b.nombre)}">${icono('cerrar')}</button>
</span>`).join('');
  return `<details class="filtros__mas"${e.busquedas.length ? ' open' : ''}>
  <summary>Guardar y avisarme</summary>
  <div class="filtros__fila">
    <label class="campo campo--ancho">Nombre
      <input type="text" data-nombre-busqueda placeholder="Spa cerca y barato" autocomplete="off" maxlength="60">
    </label>
    <button type="button" class="boton boton--primario" data-guardar-busqueda="${esc(vista)}">${icono('guardar')}Guardar y avisarme</button>
    <button type="button" class="boton boton--suave" data-compartir-busqueda="${esc(vista)}">${icono('enlace')}Compartir esta búsqueda</button>
  </div>
  <p class="ayuda">Se guarda en este navegador: en <a href="#/mis">Mis cosas</a> verás cuántas ofertas nuevas la cumplen cada vez que entres. ¿La quieres por email? <button type="button" class="enlace-boton" data-copiar-vigilado="${esc(vista)}">Copiar para los avisos por email</button> y pégala en <code>config/vigilados.json</code>.</p>
  ${chips ? `<div class="chips__lista">${chips}</div>` : ''}
</details>`;
}

// ── Este finde ───────────────────────────────────────────────────────────────

function bloqueVuelos(e, finde, titulo) {
  const vuelos = filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), finde: finde.id, orden: 'puntuacion' }, contextoBusqueda(e));
  const contenido = vuelos.length
    ? rejilla(vuelos.slice(0, 3), ctxTarjetas(e), { mostradas: 3, clave: `finde-vuelos-${finde.id}` })
    : estadoVacio('Sin vuelos guardados para estas fechas.');
  return seccion(titulo, contenido, vuelos.length > 3 ? { href: crearHash('vuelos', { finde: finde.id }), texto: `Ver los ${vuelos.length}` } : null);
}

/**
 * La portada no repite una oferta en varios bloques: cada bloque se queda con las que
 * aún no han salido (hasta `max`) y las apunta en `vistos`.
 */
function sinVistas(lista, vistos, max = Infinity) {
  if (!vistos) return lista.slice(0, max);
  const nuevas = lista.filter((o) => !vistos.has(o.id)).slice(0, max);
  for (const o of nuevas) vistos.add(o.id);
  return nuevas;
}

function bloquePuente(e, vistos = null) {
  const p = e.puente;
  if (!p) return '';
  const faltan = diasEntre(e.hoy, p.desde);
  const cuando = faltan <= 0 ? 'ya ha empezado' : faltan === 1 ? 'empieza mañana' : `empieza en ${faltan} días`;
  const vuelos = filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), finde: p.id, orden: 'puntuacion' }, contextoBusqueda(e)).slice(0, 3);
  const { ofertas } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ cuando: 'puente' }), contextoBusqueda(e));
  const lista = sinVistas([...vuelos, ...ofertas], vistos, 6);
  const cuenta = faltan > 0
    ? `<p class="puente-cuenta"><strong>${faltan}</strong><span>${faltan === 1 ? 'día para salir' : 'días para salir'}</span></p>`
    : '';
  return seccion(conIcono('puentes', `Próximo puente: ${esc(p.nombre)}`),
    `${cuenta}<p class="seccion__intro">${esc(etiquetaDia(p.desde))} – ${esc(etiquetaDia(p.hasta))} · ${contar(p.dias, 'día')} libres · ${cuando}</p>
     ${lista.length ? rejilla(lista, ctxTarjetas(e), { mostradas: 6, clave: 'finde-puente' }) : estadoVacio('Aún no hay ofertas para este puente.')}
     <p class="enlaces-linea"><a class="boton boton--primario" href="${crearHash('escapadas', { cuando: 'puente' })}">Escapadas del puente${icono('flecha')}</a> <a href="${crearHash('vuelos', { finde: p.id })}">Vuelos del puente</a> · <a href="${crearHash('puentes', {})}">Todos los puentes</a></p>`,
    null, 'puente');
}

/** Chollazos que no han salido arriba, y después el puente sin repetir tampoco estos. */
function bloqueChollazos(e, ctx, top, vistos) {
  const mostrados = top.slice(0, e.paginas.get('chollazos') ?? 6);
  for (const o of mostrados) vistos.add(o.id);
  return `${seccion(conIcono('fuego', 'Chollazos', 'chollo'), top.length
    ? rejilla(top, ctx, { mostradas: e.paginas.get('chollazos') ?? 6, clave: 'chollazos' })
    : estadoVacio('Ahora mismo no hay más chollazos.', 'Aparecen aquí las ofertas que cumplen los límites de chollazo (y que no han salido más arriba).'))}
${bloquePuente(e, vistos)}`;
}

/** Planes de la sorpresa (se repinta solo al pulsar «Otra ronda»). */
export function contenidoSorpresa(e, params = {}, vistos = null) {
  const f = leerFiltrosEscapadas(params);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, f, contextoBusqueda(e));
  // Ni tus favoritos (ya salen arriba) ni lo que haya salido antes en la portada.
  const busqueda = contextoBusqueda(e);
  const planes = sinVistas(planesSorpresa(ofertas.filter((o) => !e.favoritos?.has(o.id) && !vistos?.has(o.id) && !sinComprobar(o, busqueda)), { distancias }, { salto: e.salto ?? 0, horasMax: HORAS_SORPRESA }), vistos);
  if (!planes.length) {
    return estadoVacio(`No hay planes a menos de ${HORAS_SORPRESA} h con estos filtros.`, 'Prueba a quitar alguna temática o a subir el precio máximo.');
  }
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e) });
  return `<div class="rejilla">${planes.map((o) => tarjeta(o, ctx)).join('')}</div>`;
}

function bloqueSorpresa(e, params, vistos) {
  return seccion(conIcono('nuevo', 'Sorpréndeme'),
    `<p class="seccion__intro">Tres planes de temáticas distintas a menos de ${HORAS_SORPRESA} h de ${esc(nombreSalida(e))}, con los filtros que tengas puestos.</p>
     <p class="enlaces-linea"><button type="button" class="boton boton--tinta" data-sorpresa>${icono('recargar')}Otra ronda</button></p>
     <div id="sorpresa">${contenidoSorpresa(e, params, vistos)}</div>`);
}

/** «Planes para este finde»: tres o cuatro planes sueltos (entradas, visitas, free tours) que se pueden reservar ya. */
function bloqueActividades(e, finde, vistos = null) {
  const lista = sinVistas(actividadesPara(e.datos.ofertas, periodoFinde(finde), { max: ACTIVIDADES_FINDE * 3, descartadas: ocultas(e) }), vistos, ACTIVIDADES_FINDE);
  if (!lista.length) return '';
  return seccion(conIcono('actividades', 'Planes para este finde'),
    `<p class="seccion__intro">Entradas, visitas y free tours para estos días, con el precio por persona.</p>
     ${rejilla(lista, ctxTarjetas(e), { mostradas: ACTIVIDADES_FINDE, clave: 'finde-actividades' })}`,
    { href: crearHash('actividades', {}), texto: 'Ver todas' });
}

function bloqueRecomendado(e, params, vistos = null) {
  const perfil = perfilFavoritos(e.datos.ofertas, e.favoritos);
  if (!perfil.total) {
    return seccion(conIcono('corazon', 'Recomendado para ti'),
      estadoVacio('Guarda ofertas con el corazón y aquí verás otras parecidas', 'Aprendemos de las temáticas y las zonas que más guardas. Todo se queda en este navegador.'));
  }
  const f = leerFiltrosEscapadas(params);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, f, contextoBusqueda(e));
  const busqueda = contextoBusqueda(e);
  const lista = recomendadas(ofertas.filter((o) => !vistos?.has(o.id) && !sinComprobar(o, busqueda)), perfil, { ...busqueda, distancias }, { max: 6 });
  for (const r of lista) vistos?.add(r.oferta.id);
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e) });
  const gustos = perfil.temas.slice(0, 2).map(({ valor }) => e.temas.get(valor)?.nombre ?? valor).join(', ');
  return seccion(conIcono('corazon', 'Recomendado para ti'),
    `<p class="seccion__intro">Por tus ${contar(perfil.total, 'favorito')}${gustos ? `: te van los planes de ${esc(gustos.toLowerCase())}` : ''}.</p>
     ${lista.length ? `<div class="rejilla">${lista.map((r) => tarjetaConMotivo(r, ctx)).join('')}</div>` : estadoVacio('Nada nuevo que se parezca a tus favoritos.')}`);
}

/**
 * «Encuéntrame un finde»: desde tu salida, cuándo, qué te apetece, cómo y presupuesto, con
 * las opciones a la vista (botones, no desplegables). Lleva a Escapadas con esos filtros y
 * ordenado por coste total.
 */
export function buscadorFinde(e) {
  const [actual, siguiente] = e.findes;
  const cuando = [
    ['finde', 'Este finde', actual.etiqueta],
    ...(siguiente ? [[siguiente.id, 'El siguiente', siguiente.etiqueta]] : []),
    ...(e.puente ? [[e.puente.id, `Puente de ${e.puente.nombre}`, e.puente.etiqueta]] : []),
    ['', 'Cualquier fecha', 'lo mejor que haya'],
  ];
  const como = [['', 'Como sea'], ['coche', 'En coche'], ['sincoche', 'Sin coche']];
  const opcion = (nombre, [valor, texto, detalle], marcada) => `<label class="opcion"><input type="radio" name="${nombre}" value="${esc(valor)}"${marcado(marcada)}> ${esc(texto)}${detalle ? `<small>${esc(detalle)}</small>` : ''}</label>`;
  const temas = [
    `<label class="opcion opcion--tema"><input type="radio" name="temas" value="" checked> ${icono('todo')}Cualquier plan</label>`,
    ...e.datos.temas.map((t) => `<label class="opcion opcion--tema" style="--color-tema:var(--tema-${esc(t.id)})"><input type="radio" name="temas" value="${esc(t.id)}"> ${iconoTema(t.id)}${esc(t.nombre)}</label>`),
  ];
  return `<form class="buscador-finde" data-buscador-finde aria-labelledby="buscador-finde-titulo">
  <div class="buscador-finde__cabeza">
    <h2 id="buscador-finde-titulo">${icono('buscar')}Encuéntrame un finde</h2>
    <p class="suave">Desde <button type="button" class="enlace-boton" data-mi-viaje>${esc(nombreSalida(e))}, ${esc(contar(e.viaje?.viajeros ?? 2, 'persona'))} y ${esc(contar(e.viaje?.noches ?? 2, 'noche'))}</button></p>
  </div>
  <fieldset class="buscador-finde__grupo"><legend>¿Cuándo?</legend>
    <div class="opciones opciones--cuando">${cuando.map((c, i) => opcion('cuando', c, i === 0)).join('')}</div>
  </fieldset>
  <fieldset class="buscador-finde__grupo"><legend>¿Qué te apetece?</legend>
    <div class="opciones opciones--desplazables">${temas.join('')}</div>
  </fieldset>
  <div class="buscador-finde__fila">
    <fieldset class="buscador-finde__grupo"><legend>¿Cómo?</legend>
      <div class="opciones">${como.map((c, i) => opcion('como', c, i === 0)).join('')}</div>
    </fieldset>
    <div class="buscador-finde__grupo">
      <label class="buscador-finde__etiqueta" for="buscador-finde-pres">Máx. por persona</label>
      <span class="campo-euros"><input id="buscador-finde-pres" type="number" name="pres" min="0" step="10" inputmode="numeric" placeholder="Sin límite"></span>
    </div>
  </div>
  <div class="buscador-finde__pie">
    <span>El total incluye la gasolina estimada si vas en coche.</span>
    <button type="submit" class="boton boton--primario">${icono('buscar')}Buscar planes</button>
  </div>
</form>`;
}

/** Los filtros de Escapadas que corresponden a lo elegido en «Encuéntrame un finde». */
export function paramsBuscadorFinde({ cuando = '', pres = '', como = '', temas = '' } = {}) {
  return {
    cuando, temas, orden: 'total',
    ...(Number(pres) > 0 ? { pres: String(Number(pres)), prespor: 'persona' } : {}),
    ...(como === 'coche' ? { transporte: 'coche' } : como === 'sincoche' ? { sincoche: '1' } : {}),
  };
}

export function vistaFinde(e, params = {}) {
  const [actual, siguiente] = e.findes;
  const ctx = ctxTarjetas(e);
  const hayVuelosConFecha = e.datos.ofertas.some(tieneVuelo);
  const escapadas = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ ...params, cuando: 'finde' }), contextoBusqueda(e)).ofertas;
  // Las descartadas con ✕ no vuelven a salir, tampoco aquí.
  // Tampoco las marcadas «no disponible» ni las que su web lleva días sin publicar.
  const ocultasFinde = ocultas(e);
  const busqueda = contextoBusqueda(e);
  const top = chollazos(e.datos.ofertas).filter((o) => !ocultasFinde.has(o.id) && !sinComprobar(o, busqueda));
  const favoritos = e.datos.ofertas.filter((o) => e.favoritos.has(o.id));
  const puenteSiguiente = siguiente && puenteDelFinde(siguiente, e.datos.puentes);
  // Cada bloque se pinta en orden y no repite lo que ya ha salido más arriba (tampoco el destacado).
  const vistos = new Set(favoritos.map((o) => o.id));
  const destacado = top.find((o) => !vistos.has(o.id)) ?? null;
  if (destacado) vistos.add(destacado.id);
  const sorpresa = bloqueSorpresa(e, params, vistos);

  const vuelos = hayVuelosConFecha
    ? bloqueVuelos(e, actual, conIcono('vuelos', `Vuelos este finde <span class="suave">(${esc(actual.etiqueta)})</span>`))
      + (siguiente ? bloqueVuelos(e, siguiente, conIcono('vuelos', `Vuelos el finde siguiente <span class="suave">(${esc(siguiente.etiqueta)}${puenteSiguiente ? ' · puente' : ''})</span>`)) : '')
    : seccion(conIcono('vuelos', 'Chollos de vuelos <span class="suave">(sin fecha concreta, desde tus aeropuertos)</span>'),
      rejilla(sinVistas(chollosDeVuelos(e.datos.ofertas, leerFiltrosVuelos({ mios: '1' }), contextoBusqueda(e)), vistos, 3), ctx, { mostradas: 3, clave: 'finde-chollos' }),
      { href: crearHash('vuelos', { mios: '1' }), texto: 'Ver todos' });

  const r = resumenFuentes(e.datos.fuentes);
  const revision = `${e.datos.ofertas.length.toLocaleString('es-ES')} ofertas de ${contar(r.ok, 'web')} · revisado ${haceCuanto(e.datos.generado, e.ahora)}`;
  return `<section class="portada">
  <div class="portada__texto">
    <p class="portada__ceja"><span class="pastilla">${icono('calendario')}<span>${esc(etiquetaDia(actual.viernes))} – ${esc(etiquetaDia(actual.domingo))}<span id="cuenta-atras" class="pastilla__extra"></span></span></span><span id="aviso-puente" class="pastilla pastilla--puente" hidden></span><span class="portada__revision"><span class="punto" aria-hidden="true"></span>${esc(revision)}</span></p>
    <h1 class="titulo-vista" tabindex="-1">¿Dónde nos escapamos <em>este finde</em>?</h1>
    ${buscadorFinde(e)}
  </div>
  ${destacado ? `<div class="portada__destacado">${tarjetaDestacada(destacado, ctx)}</div>` : ''}
</section>
<div class="carruseles">
${favoritos.length ? seccion(conIcono('corazon', 'Tus favoritos', 'chollo'), rejilla(favoritos, ctx, { mostradas: mostradas(e, 'favoritos'), clave: 'favoritos' })) : ''}
${sorpresa}
${vuelos}
${seccion(conIcono('escapadas', 'Mejores escapadas para este finde'), escapadas.length
    ? rejilla(sinVistas(escapadas, vistos, 6), ctx, { mostradas: 6, clave: 'finde-escapadas' })
    : estadoVacio('No hay escapadas para este finde.'), { href: crearHash('escapadas', { cuando: 'finde' }), texto: `Ver las ${escapadas.length}` })}
${bloqueActividades(e, actual, vistos)}
${bloqueRecomendado(e, params, vistos)}
${bloqueChollazos(e, ctx, top.filter((o) => !vistos.has(o.id)), vistos)}
</div>`;
}

// ── Vuelos ───────────────────────────────────────────────────────────────────

export function vistaVuelos(e, params) {
  const f = leerFiltrosVuelos(params);
  const vuelos = e.datos.ofertas.filter((o) => o.tipo === 'vuelo');
  const paises = valoresUnicos(vuelos, (o) => o.lugar?.pais);
  const abiertos = FILTROS_MAS_VUELOS.some((clave) => params[clave]);
  // Sin vuelos con día y hora (ahora no hay ninguna fuente que los dé), la pestaña es lo que
  // hay de verdad: chollos de blogs y comunidades, sin los filtros de finde, aeropuerto y horario.
  if (!e.datos.ofertas.some(tieneVuelo)) return vistaChollosVuelos(e, params, f, paises);
  const chips = [
    `<label class="chip"><input type="radio" name="finde" value=""${marcado(!f.finde)}> Todos</label>`,
    ...e.findes.map((finde, i) => `<label class="chip${finde.puenteId ? ' chip--puente' : ''}"><input type="radio" name="finde" value="${esc(finde.id)}"${marcado(f.finde === finde.id)}> ${i === 0 ? 'Este finde · ' : ''}${esc(finde.etiqueta)}</label>`),
    ...e.datos.puentes.map((p) => `<label class="chip chip--puente"><input type="radio" name="finde" value="${esc(p.id)}"${marcado(f.finde === p.id)}> ${etiquetaPuente(p)}</label>`),
  ];
  return `${pestanas('explorar', 'vuelos')}<h1 class="titulo-vista" tabindex="-1">Vuelos</h1>
${avisoMemoria(e, 'vuelos')}${avisoViajeCompartido(e, params)}
${plegableMovil(e, 'vuelos', params)}<form class="filtros" data-filtros="vuelos" aria-label="Filtros de vuelos">
  <fieldset class="chips chips--desplazables"><legend>Finde o puente</legend><div class="chips__lista">${chips.join('')}</div></fieldset>
  <div class="filtros__fila">
    ${campoTexto(f)}
    <label class="campo">Aeropuerto <select name="aero">${opciones(e.datos.aeropuertos.map((a) => [a, a]), f.aero, 'Todos')}</select></label>
    <label class="campo">País <select name="pais">${opciones(paises.map((p) => [p, p]), f.pais, 'Todos')}</select></label>
    <label class="campo">Precio máx. (€) <input type="number" name="max" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${f.max ?? ''}"></label>
    <label class="campo">Orden <select name="orden">${opciones([['precio', 'Precio'], ['puntuacion', 'Puntuación'], ['hora', 'Hora de salida']], f.orden)}</select></label>
    <label class="interruptor"><input type="checkbox" name="ideal" value="1"${marcado(f.ideal)}> Solo horario ideal</label>
    <label class="interruptor"><input type="checkbox" name="mios" value="1"${marcado(f.mios)}> Solo desde ${esc(listaAeropuertos(e))}</label>
  </div>
  <details class="filtros__mas"${abiertos ? ' open' : ''}><summary>Más filtros</summary>
    <div class="filtros__fila">${filtrosChollo(f)}${filtrosListas(f)}</div>
  </details>
  ${bloqueBusquedas(e, 'vuelos')}
</form></details>
<div id="resultados">${resultadosVuelos(e, params)}</div>`;
}

/** Vuelos cuando solo hay chollos sin fecha: sus filtros y nada más. */
function vistaChollosVuelos(e, params, f, paises) {
  return `${pestanas('explorar', 'vuelos')}<h1 class="titulo-vista" tabindex="-1">Chollos de vuelos</h1>
${avisoMemoria(e, 'vuelos')}${avisoViajeCompartido(e, params)}
<p class="seccion__intro">Vuelos baratos que publican blogs y comunidades, con <strong>fechas flexibles</strong>: el precio es el mínimo para unos días que no dicen, así que revisa en cada oferta cuándo hay plazas y desde qué aeropuerto sale. Los vuelos con día y hora concretos llegarán cuando haya una fuente que los dé (<a href="#/fuentes">estado de las webs</a>).</p>
<div class="explorar">
<div class="explorar__filtros">${plegableMovil(e, 'vuelos', params)}<form class="filtros" data-filtros="vuelos" aria-label="Filtros de chollos de vuelos">
  <div class="filtros__fila">${campoTexto(f)}</div>
  <div class="filtros__fila">
    <label class="campo">País <select name="pais">${opciones(paises.map((p) => [p, p]), f.pais, 'Todos')}</select></label>
    <label class="campo">Precio máx. (€) <input type="number" name="max" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${f.max ?? ''}"></label>
    <label class="campo">Orden <select name="orden">${opciones([['precio', 'Precio'], ['puntuacion', 'Nota del chollo']], f.orden)}</select></label>
    <label class="interruptor"><input type="checkbox" name="mios" value="1"${marcado(f.mios)}> Solo desde ${esc(listaAeropuertos(e))}</label>
  </div>
  <details class="filtros__mas"${FILTROS_MAS_VUELOS.some((clave) => params[clave]) ? ' open' : ''}><summary>Más filtros</summary>
    <div class="filtros__fila">${filtrosChollo(f)}${filtrosListas(f)}</div>
  </details>
  ${bloqueBusquedas(e, 'vuelos')}
</form></details></div>
<div id="resultados" class="explorar__resultados">${resultadosVuelos(e, params)}</div>
</div>`;
}

/** «BCN, GRO o REU». */
const listaAeropuertos = (e) => enumerar(misAeropuertos(e), 'o') || `aeropuertos cerca de ${nombreSalida(e)}`;

export function resultadosVuelos(e, params) {
  const f = leerFiltrosVuelos(params);
  const ctx = ctxTarjetas(e);
  const contexto = contextoBusqueda(e);
  const hayConFecha = e.datos.ofertas.some(tieneVuelo);
  const vuelos = filtrarVuelos(e.datos.ofertas, f, contexto);
  const chollos = chollosDeVuelos(e.datos.ofertas, f, contexto);
  const promociones = promocionesDeVuelos(e.datos.ofertas, f, contexto);
  if (!hayConFecha) {
    const resumen = `${contar(chollos.length, 'chollo')} de vuelos${promociones.length ? ` y ${contar(promociones.length, 'promoción', 'promociones')}` : ''}`;
    return `${filaActivos(e, 'vuelos', params)}${resumenResultados(resumen)}
${chollos.length ? rejilla(chollos, ctx, { mostradas: mostradas(e, 'chollos'), clave: 'chollos' }) : estadoVacio('Ningún chollo de vuelos cumple estos filtros.', f.mios ? `Prueba a quitar «Solo desde ${esc(listaAeropuertos(e))}».` : 'Prueba a quitar algún filtro.', botonLimpiar('vuelos'))}
${promociones.length ? `<section class="seccion">
  <div class="seccion__cabeza"><h2>Promociones y descuentos de aerolíneas</h2></div>
  <p class="seccion__intro">Códigos, rebajas y selecciones de «muchos destinos»: no son un billete, sino una forma de pagar menos en la web de la aerolínea.</p>
  ${rejilla(promociones, ctx, { mostradas: mostradas(e, 'promociones'), clave: 'promociones' })}
</section>` : ''}`;
  }
  const conFecha = vuelos.length
    ? rejilla(vuelos, ctx, { mostradas: mostradas(e, 'vuelos'), clave: 'vuelos' })
    : estadoVacio('Ningún vuelo cumple estos filtros', 'Prueba con otro finde, otro aeropuerto o un precio máximo más alto.', botonLimpiar('vuelos'));
  const resumen = `${contar(vuelos.length, 'vuelo')} con fecha, ${contar(chollos.length, 'billete')} sin fecha y ${contar(promociones.length, 'promoción', 'promociones')}`;
  return `${filaActivos(e, 'vuelos', params)}${resumenResultados(resumen)}
<h2 class="subtitulo">Vuelos con fecha y hora</h2>${conFecha}
<section class="seccion">
  <div class="seccion__cabeza"><h2>Billetes sin fecha concreta, de blogs y comunidades</h2></div>
  <p class="seccion__intro">El precio es el mínimo que publican para unas fechas que no dicen: revisa en cada oferta qué días hay plazas y desde qué aeropuerto sale. Aquí no se aplican el finde ni el horario.</p>
  ${chollos.length ? rejilla(chollos, ctx, { mostradas: mostradas(e, 'chollos'), clave: 'chollos' }) : estadoVacio('No hay billetes sin fecha con estos filtros.', f.mios ? `Prueba a quitar «Solo desde ${esc(listaAeropuertos(e))}».` : '')}
</section>
${promociones.length ? `<section class="seccion">
  <div class="seccion__cabeza"><h2>Promociones y descuentos de aerolíneas</h2></div>
  <p class="seccion__intro">Códigos, rebajas y selecciones de «muchos destinos»: no son un billete, sino una forma de pagar menos en la web de la aerolínea.</p>
  ${rejilla(promociones, ctx, { mostradas: mostradas(e, 'promociones'), clave: 'promociones' })}
</section>` : ''}`;
}

// ── Escapadas y mapa ─────────────────────────────────────────────────────────

function chipsTemas(e, f) {
  return e.datos.temas.map((t) => `<label class="chip chip--tema" style="--color-tema:var(--tema-${esc(t.id)})"><input type="checkbox" name="temas" value="${esc(t.id)}"${marcado(f.temas.includes(t.id))}> ${iconoTema(t.id)}${esc(t.nombre)}</label>`).join('');
}

function chipsCuando(e, f) {
  const chip = (valor, texto, clase = '') => `<label class="chip${clase}"><input type="radio" name="cuando" value="${esc(valor)}"${marcado(f.cuando === valor)}> ${texto}</label>`;
  return [
    chip('', 'Cualquier fecha'),
    chip('finde', `Este finde · ${esc(e.findes[0].etiqueta)}`),
    ...e.findes.slice(1, 6).map((finde) => chip(finde.id, esc(finde.etiqueta))),
    ...e.datos.puentes.map((p) => chip(p.id, etiquetaPuente(p), ' chip--puente')),
  ].join('');
}

function campoUbicacion(e, f) {
  const p = f.punto;
  const horas = [1, 2, 3, 4].map((h) => [h, `A menos de ${h} h en coche`]);
  return `<fieldset class="ubicacion"><legend>Cerca de…</legend>
  <div class="ubicacion__fila">
    <div class="combo">
      <label class="sr" for="lugar-texto">Pueblo, ciudad o zona</label>
      <input id="lugar-texto" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="lugar-sugerencias" autocomplete="off" placeholder="${esc(nombreSalida(e))} (tu salida)" value="${esc(p?.nombre ?? '')}">
      <ul id="lugar-sugerencias" class="combo__lista" role="listbox" aria-label="Sugerencias" hidden></ul>
      <input type="hidden" name="lugar" value="${esc(p?.nombre ?? '')}"><input type="hidden" name="lat" value="${p?.lat ?? ''}"><input type="hidden" name="lon" value="${p?.lon ?? ''}">
    </div>
    <button type="button" class="boton boton--suave" data-mi-ubicacion>${icono('ubicacion')}Usar mi ubicación</button>
  </div>
  <div class="filtros__fila">
    <label class="campo">Tiempo en coche <select name="h">${opciones(horas, f.horas, 'Sin límite de tiempo')}</select></label>
  </div>
  <p class="ayuda" id="lugar-ayuda" role="status">${esc(textoAyudaUbicacion(p, e.datos.origen, e.salida))}</p>
</fieldset>`;
}

/** Qué cuenta el campo único de precio («Hasta X €»): se traduce a pres/prespor, max o pnMax. */
const TIPOS_PRECIO = [
  ['oferta', 'Precio de la oferta'],
  ['noche', 'Por persona y noche'],
  ['persona', 'Viaje completo, por persona'],
  ['total', 'Viaje completo, en total'],
];

/**
 * Un solo «Hasta … €» con un selector de qué cuenta, en vez de cuatro campos de precio. Si
 * la URL trae varios a la vez (enlaces antiguos), el campo enseña uno y el resto sigue
 * puesto en campos ocultos (y en los filtros activos, donde se pueden quitar).
 */
function campoPrecio(f) {
  const puestos = [
    f.presupuesto && [f.presupuestoPor === 'persona' ? 'persona' : 'total', f.presupuesto],
    f.nocheMax && ['noche', f.nocheMax],
    f.max && ['oferta', f.max],
  ].filter(Boolean);
  const [tipo, valor] = puestos[0] ?? ['oferta', ''];
  const ocultos = puestos.slice(1).map(([t, v]) => {
    const nombre = { persona: 'pres', total: 'pres', noche: 'pnMax', oferta: 'max' }[t];
    return `<input type="hidden" name="${nombre}" value="${esc(v)}">${nombre === 'pres' && t === 'persona' ? '<input type="hidden" name="prespor" value="persona">' : ''}`;
  }).join('');
  return `<div class="campo-precio">
    <label class="campo">Hasta (€) <input type="number" name="precio" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${esc(valor)}"></label>
    <label class="campo">Contando <select name="preciotipo">${opciones(TIPOS_PRECIO, tipo)}</select></label>
  </div>${ocultos}
  <p class="ayuda">El <strong>viaje completo</strong> suma la oferta y, si vas en coche, la gasolina estimada para tu viaje.</p>`;
}

/** «¿Cómo vas?»: en coche, sin coche (tren, bus, avión o ferry) o da igual. */
function campoComo(f) {
  const como = f.sinCoche ? 'sincoche' : f.transporte === 'coche' ? 'coche' : '';
  const opcion = (valor, texto) => `<label class="chip"><input type="radio" name="como" value="${valor}"${marcado(como === valor)}> ${texto}</label>`;
  return `<fieldset class="chips"><legend>¿Cómo vas?</legend><div class="chips__lista">${opcion('', 'Da igual')}${opcion('coche', 'En coche')}${opcion('sincoche', 'Sin coche')}</div></fieldset>`;
}

/** Cuántos filtros de «Más filtros» hay puestos (para su contador). */
// «En coche» se elige arriba, en «¿Cómo vas?»: no es un filtro de «Más filtros».
export const contarSecundarios = (params = {}) => FILTROS_SECUNDARIOS
  .filter((clave) => params[clave] && !(clave === 'transporte' && params[clave] === 'coche')).length;

/** Atajos de un clic: enlaces con su hash. */
function atajosEscapadas(vista) {
  const enlaces = ATAJOS_ESCAPADAS.map((a) => `<a class="chip chip--atajo" href="${esc(crearHash(vista, a.params))}">${icono(a.icono)}${esc(a.texto)}</a>`).join('');
  return `<nav class="atajos" aria-label="Atajos de búsqueda"><div class="chips__lista chips--desplazables-lista">${enlaces}</div></nav>`;
}

/** Icono de cada filtro puesto (por su clave; las temáticas, el de la suya). */
const ICONOS_FILTRO = {
  notemas: 'prohibido', nodest: 'prohibido', cuando: 'calendario', finde: 'calendario', desde: 'calendario', hasta: 'calendario',
  lugar: 'pin', h: 'coche', km: 'regla', pres: 'cartera', max: 'cartera', nota: 'estrella', clasica: 'cama', sincoche: 'tren',
  dest: 'pin', aero: 'avion', ideal: 'reloj', mios: 'despegue', nuevas: 'nuevo', fav: 'corazon', cho: 'fuego', baja: 'bajada',
  cerradas: 'calendario', gratis: 'actividades', cru: 'crucero', q: 'buscar', aloj: 'cama', regimen: 'cubiertos', transporte: 'coche',
};
const iconoFiltro = (c) => (c.clave === 'temas' ? iconoTema(c.valor) : icono(ICONOS_FILTRO[c.clave] ?? ''));

/**
 * «Lo que tienes puesto»: un chip por filtro con su ✕ (un enlace a la misma búsqueda
 * sin él) y «Quitar todos». Va con los resultados para seguir al día al cambiar filtros.
 */
function filaActivos(e, vista, params) {
  const chips = filtrosActivos(vista, params, {
    temas: e.temas, fuentes: e.fuentes, findes: e.findes, puentes: e.datos.puentes,
  });
  if (!chips.length) return '';
  // Si al quitarlo no queda ninguno, también se olvida la memoria (si no, volvería al entrar).
  const olvidar = (c) => (c.hash === `#/${vista}` ? ' data-olvidar-filtros' : '');
  const lista = chips.map((c) => `<a class="chip chip--activo" href="${esc(c.hash)}"${olvidar(c)} aria-label="Quitar el filtro ${esc(c.texto)}">${iconoFiltro(c)}${esc(c.texto)} <span aria-hidden="true">${icono('cerrar')}</span></a>`).join('');
  return `<div class="activos" aria-label="Filtros puestos"><div class="chips__lista">${lista}
  <a class="boton boton--suave boton--mini" href="#/${vista}" data-olvidar-filtros>Quitar todos</a></div></div>`;
}

/**
 * En el móvil, los filtros van plegados detrás de «Filtros (n puestos)» para llegar antes a
 * las ofertas (app.js los pliega al pintar; en pantallas anchas el botón no se ve).
 */
function plegableMovil(e, vista, params) {
  const n = filtrosActivos(vista, params, { temas: e.temas, fuentes: e.fuentes, findes: e.findes, puentes: e.datos.puentes }).length;
  return `<details class="filtros-plegables filtros-plegables--movil" data-plegable-movil open><summary>${icono('filtros')}Filtros${n ? ` <span class="suave">(${contar(n, 'puesto')})</span>` : ''}</summary>`;
}

/**
 * Un enlace compartido que trae otra salida, viajeros o noches: se ofrece usarlos (no se
 * cambian solos: son preferencias de este navegador).
 */
export function avisoViajeCompartido(e, params) {
  const compartido = viajeDeParams(params);
  if (!compartido) return '';
  const salida = compartido.salida?.nombre ?? e.datos.origen.nombre;
  const texto = `${salida}, ${contar(Number(compartido.viaje.viajeros) || 2, 'persona')} y ${contar(Number(compartido.viaje.noches) || 2, 'noche')}`;
  const actual = `${nombreSalida(e)}, ${contar(e.viaje?.viajeros ?? 2, 'persona')} y ${contar(e.viaje?.noches ?? 2, 'noche')}`;
  if (texto === actual) return '';
  return `<p class="aviso-memoria" role="status">${icono('enlace')}Esta búsqueda se compartió para <strong>${esc(texto)}</strong>; tú la ves para ${esc(actual)}. <button type="button" class="enlace-boton" data-usar-viaje>Usar ${esc(texto)}</button></p>`;
}

/** Aviso de que se han recuperado los filtros de la última vez. */
function avisoMemoria(e, vista) {
  if (!e.filtrosRecordados) return '';
  return `<p class="aviso-memoria" role="status">${icono('deshacer')}Con los filtros de la última vez · <a href="#/${vista}" data-olvidar-filtros>Empezar de cero</a></p>`;
}

function formularioEscapadas(e, params, vista) {
  const f = leerFiltrosEscapadas(params);
  const escapadas = e.datos.ofertas.filter(esEscapada);
  const tipos = ['escapada', 'hotel', 'paquete', 'crucero'].filter((t) => escapadas.some((o) => o.tipo === t));
  const fuentes = [...new Set(escapadas.map((o) => o.fuente))].map((id) => [id, e.fuentes.get(id) ?? id]);
  const paises = valoresUnicos(escapadas, (o) => o.lugar?.pais);
  const zonas = zonasDe(escapadas.filter((o) => !f.pais || o.lugar?.pais === f.pais));
  const alojamientos = ALOJAMIENTOS.filter((a) => escapadas.some((o) => o.alojamiento === a)).map((a) => [a, ETIQUETAS_ALOJAMIENTO[a]]);
  const secundarios = contarSecundarios(params);
  // Un solo día va en su campo y el rango en los suyos, nunca a la vez: si no, cambiar el
  // rango no haría nada porque el día concreto manda.
  const unDia = Boolean(f.desde) && f.desde === f.hasta;
  return `<form class="filtros" data-filtros="${vista}" aria-label="Filtros de escapadas">
  <div class="filtros__fila">${campoTexto(f)}
    <label class="campo">Ordenar por <select name="orden">${opciones(ORDENES_ESCAPADAS.map((o) => [o, ETIQUETAS_ORDEN[o]]), f.orden)}</select></label>
  </div>
  <fieldset class="bloque"><legend class="bloque__titulo">¿Cuándo?</legend>
    <div class="chips chips--desplazables"><div class="chips__lista">${chipsCuando(e, f)}</div></div>
    <div class="filtros__fila">
      <label class="campo">Un día concreto <input type="date" name="dia" value="${esc(unDia ? f.desde : '')}"></label>
      <label class="campo">O entre el <input type="date" name="desde" value="${esc(unDia ? '' : f.desde)}"></label>
      <label class="campo">y el <input type="date" name="hasta" value="${esc(unDia ? '' : f.hasta)}"></label>
      ${interruptor('cerradas', 'Solo con fechas cerradas', f.soloCerradas)}
    </div>
    <p class="ayuda">Las ofertas con <strong>fechas cerradas</strong> dicen el día exacto («vie 16 – dom 18 oct»). Las de <strong>fechas flexibles</strong> se pueden usar cualquier día hasta que caducan: salen en todas las fechas, pero la disponibilidad exacta la confirma la web del anunciante (el botón de la oferta la abre).</p>
  </fieldset>
  <fieldset class="bloque"><legend class="bloque__titulo">¿Qué te apetece?</legend>
    <div class="chips chips--desplazables"><div class="chips__lista">${chipsTemas(e, f)}</div></div>
  </fieldset>
  <div class="bloque"><h2 class="bloque__titulo">¿Dónde?</h2>${campoUbicacion(e, f)}</div>
  <div class="bloque"><h2 class="bloque__titulo">¿Cómo vas?</h2>${campoComo(f)}</div>
  <fieldset class="bloque"><legend class="bloque__titulo">¿Cuánto?</legend>
    ${campoPrecio(f)}
    <div class="filtros__fila">${interruptor('clasica', 'Escapada clásica de finde (2 noches)', f.clasica)}</div>
  </fieldset>
  <details class="filtros__mas filtros__mas--panel">
    <summary>Más filtros <span class="contador" data-contador-mas>${secundarios ? `(${contar(secundarios, 'puesto')})` : ''}</span></summary>
    <div class="grupo"><h3 class="grupo__titulo">Precio y chollos</h3><div class="filtros__fila">
      ${numero('pnMin', '€ por persona y noche, mín.', f.nocheMin, ' step="5" placeholder="Sin mínimo"')}
      ${filtrosChollo(f)}
    </div></div>
    <div class="grupo"><h3 class="grupo__titulo">Viaje y alojamiento</h3><div class="filtros__fila">
      <label class="campo">Distancia máx. (km) <input type="number" name="km" min="1" step="10" inputmode="numeric" placeholder="Sin límite" value="${f.km ?? ''}"></label>
      <label class="campo">Noches <select name="noches">${opciones([[1, '1 noche'], [2, '2 noches'], [3, '3 o más']], f.noches, 'Cualquiera')}</select></label>
      <label class="campo">Régimen mínimo <select name="regimen">${opciones(REGIMENES_ORDEN.map((r) => [r, `Al menos ${ETIQUETAS_REGIMEN[r].toLowerCase()}`]), f.regimen, 'Cualquiera')}</select></label>
      <label class="campo">Alojamiento <select name="aloj">${opciones(alojamientos, f.alojamiento, 'Cualquiera')}</select></label>
      ${numero('nota', 'Valoración mín. (0–10)', f.nota, ' max="10" step="0.5" placeholder="Cualquiera"')}
      <label class="campo">Transporte concreto <select name="transporte">${opciones(Object.entries(ETIQUETAS_TRANSPORTE).filter(([t]) => t !== 'coche'), f.transporte === 'coche' ? '' : f.transporte, 'Cualquiera')}</select></label>
    </div></div>
    <div class="grupo"><h3 class="grupo__titulo">Zona, web y tipo</h3><div class="filtros__fila">
      <label class="campo">País <select name="pais" data-repintar>${opciones(paises.map((p) => [p, p]), f.pais, 'Todos')}</select></label>
      <label class="campo">Provincia o comunidad <select name="region"><option value="">Todas</option>${
        zonas.provincias.length ? `<optgroup label="Provincias">${opciones(zonas.provincias.map((z) => [z, z]), f.region)}</optgroup>` : ''}${
        zonas.comunidades.length ? `<optgroup label="Comunidades">${opciones(zonas.comunidades.map((z) => [z, z]), f.region)}</optgroup>` : ''}</select></label>
      <label class="campo">Web <select name="fuente">${opciones(fuentes, f.fuente, 'Todas')}</select></label>
      <label class="campo">Tipo <select name="tipo">${opciones(tipos.map((t) => [t, ETIQUETAS_TIPO[t]]), f.tipo, 'Todos')}</select></label>
      ${interruptorDefecto('cru', 'Ocultar cruceros', f.sinCruceros)}
    </div></div>
    <div class="grupo"><h3 class="grupo__titulo">Mis listas</h3><div class="filtros__fila">${filtrosListas(f)}</div></div>
    <button type="button" class="boton boton--primario filtros__ver" data-cerrar-mas>Ver los resultados</button>
  </details>
  ${bloqueExclusiones(e, f, escapadas)}
  ${bloqueBusquedas(e, vista)}
</form>`;
}

export function vistaEscapadas(e, params) {
  return `${pestanas('explorar', 'escapadas')}<h1 class="titulo-vista" tabindex="-1">Escapadas</h1>
${avisoMemoria(e, 'escapadas')}${avisoViajeCompartido(e, params)}
${atajosEscapadas('escapadas')}
<div class="explorar">
  <div class="explorar__filtros">${plegableMovil(e, 'escapadas', params)}${formularioEscapadas(e, params, 'escapadas')}</details></div>
  <div id="resultados" class="explorar__resultados">${resultadosEscapadas(e, params)}</div>
</div>`;
}

/** Por qué salen en este orden: qué se suma, desde dónde, para cuántos y qué va al final. */
function explicacionOrden(e, f, costes) {
  const desde = f.punto?.nombre ?? nombreSalida(e);
  const para = `${contar(e.viaje?.viajeros ?? 2, 'persona')} y ${contar(e.viaje?.noches ?? 2, 'noche')} si la oferta no las fija`;
  const sinTotal = [...costes.values()].filter((c) => c.total == null).length;
  const textos = {
    total: `Ordenadas por lo que cuesta el viaje completo desde ${desde} para ${para}: la oferta y, si vas en coche, la gasolina estimada (sin peajes ni aparcamiento).`,
    persona: `Ordenadas por lo que cuesta el viaje completo por persona desde ${desde} (${para}): la oferta y, si vas en coche, la gasolina estimada.`,
    calidad: `Primero lo que más nota (sobre 10) da por cada euro por persona del viaje completo desde ${desde}. Sin nota o sin total, al final.`,
    comodo: `Primero lo que está a menos tiempo de ${desde}; a igualdad, lo que incluye más (régimen) y lo mejor valorado. Lo que no tiene tiempo de viaje conocido (islas, avión), al final.`,
  };
  if (!textos[f.orden]) return '';
  const alFinal = sinTotal ? ` ${contar(sinTotal, 'oferta')} sin datos suficientes para un total van al final.` : '';
  return `<p class="seccion__intro explicacion-orden">${esc(textos[f.orden])}${esc(alFinal)} <button type="button" class="enlace-boton" data-mi-viaje>Cambiar salida, viajeros o noches</button></p>`;
}

export function resultadosEscapadas(e, params) {
  const f = leerFiltrosEscapadas(params);
  const { ofertas, distancias, costes, sinTotal } = buscarEscapadas(e.datos.ofertas, f, contextoBusqueda(e));
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e) });
  // En el móvil el «Mapa» ya está en la pastilla flotante: aquí sobra.
  const acciones = `<a class="boton boton--suave solo-ancho-flex" href="${crearHash('mapa', params)}">${icono('mapa')}Ver en el mapa</a>`;
  return `${filaActivos(e, 'escapadas', params)}${resumenResultados(contar(ofertas.length, 'escapada'), acciones)}
${explicacionOrden(e, f, costes)}${f.presupuesto ? `<p class="seccion__intro">Presupuesto: viaje completo (oferta y gasolina estimada) de hasta ${esc(euros(f.presupuesto))} ${f.presupuestoPor === 'persona' ? 'por persona' : 'en total'} para ${esc(contar(e.viaje?.viajeros ?? 2, 'persona'))}.${sinTotal ? ` ${esc(contar(sinTotal, 'oferta'))} sin datos suficientes para un total no se pueden comprobar y no salen.` : ''}</p>` : ''}
${ofertas.length
    ? rejilla(ofertas, ctx, { mostradas: mostradas(e, 'escapadas'), clave: 'escapadas' })
    : estadoVacio('Ninguna escapada cumple estos filtros', 'Prueba a quitar alguna temática, ampliar la distancia o subir el precio máximo.', botonLimpiar('escapadas'))}`;
}

// ── Actividades ──────────────────────────────────────────────────────────────

const ETIQUETAS_ORDEN_ACTIVIDADES = { puntuacion: 'Puntuación', precio: 'Precio', valoracion: 'Mejor valoradas' };

export function vistaActividades(e, params) {
  const f = leerFiltrosActividades(params);
  const actividades = e.datos.ofertas.filter(esActividad);
  const lugares = destinosDe(actividades);
  return `${pestanas('explorar', 'actividades')}<h1 class="titulo-vista" tabindex="-1">Planes</h1>
${avisoMemoria(e, 'actividades')}${avisoViajeCompartido(e, params)}
<p class="seccion__intro">Entradas, visitas guiadas y free tours cerca de casa o en el destino de tu escapada. El precio es por persona.</p>
<div class="explorar">
<div class="explorar__filtros">${plegableMovil(e, 'actividades', params)}<form class="filtros" data-filtros="actividades" aria-label="Filtros de actividades">
  <div class="filtros__fila">${campoTexto(f)}</div>
  <fieldset class="chips chips--desplazables"><legend>Temática</legend><div class="chips__lista">${chipsTemas(e, f)}</div></fieldset>
  <div class="filtros__fila">
    <label class="campo">Lugar o destino <select name="dest">${opciones(lugares.map((l) => [l, l]), f.dest, 'Todos')}</select></label>
    <label class="campo">Precio máx. por persona (€) <input type="number" name="max" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${f.max ?? ''}"></label>
    ${numero('nota', 'Valoración mín. (0–10)', f.nota, ' max="10" step="0.5" placeholder="Cualquiera"')}
    <label class="campo">Ordenar por <select name="orden">${opciones(ORDENES_ACTIVIDADES.map((o) => [o, ETIQUETAS_ORDEN_ACTIVIDADES[o]]), f.orden)}</select></label>
    ${interruptor('gratis', 'Solo gratis', f.gratis)}
    ${interruptorDefecto('sindesc', 'Ocultar las descartadas y las no disponibles', f.sinDescartadas)}
    ${interruptor('frescas', 'Ocultar las que su web lleva días sin publicar', f.soloComprobadas)}
  </div>
  ${bloqueBusquedas(e, 'actividades')}
</form></details></div>
<div id="resultados" class="explorar__resultados">${resultadosActividades(e, params)}</div>
</div>`;
}

export function resultadosActividades(e, params) {
  const f = leerFiltrosActividades(params);
  const lista = buscarActividades(e.datos.ofertas, f, contextoBusqueda(e));
  const gratis = lista.filter((o) => o.precio === 0).length;
  const resumen = `${contar(lista.length, 'plan', 'planes')}${gratis ? ` · ${gratis} ${gratis === 1 ? 'gratis' : 'gratis'}` : ''}`;
  return `${filaActivos(e, 'actividades', params)}${resumenResultados(resumen)}
${lista.length
    ? rejilla(lista, ctxTarjetas(e), { mostradas: mostradas(e, 'actividades'), clave: 'actividades' })
    : estadoVacio('Ninguna actividad cumple estos filtros', 'Prueba a quitar alguna temática, cambiar de lugar o subir el precio máximo.', botonLimpiar('actividades'))}`;
}

export function vistaMapa(e, params) {
  return `${pestanas('explorar', 'mapa')}<h1 class="titulo-vista" tabindex="-1">Mapa</h1>
${atajosEscapadas('mapa')}<details class="filtros-plegables"><summary>Filtros del mapa</summary>${formularioEscapadas(e, params, 'mapa')}</details>
<div id="resultados">${resultadosMapa(e, params)}</div>
<div id="mapa" class="mapa" role="region" aria-label="Mapa de escapadas y destinos de vuelo"><p class="mapa__cargando">Cargando el mapa…</p></div>`;
}

/** Lo que se pinta en el mapa con los filtros actuales. */
export function datosMapa(e, params) {
  const f = leerFiltrosEscapadas(params);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, f, contextoBusqueda(e));
  const destinos = destinosDeVuelo(vuelosParaMapa(e.datos.ofertas, f, contextoBusqueda(e)));
  return {
    escapadas: ofertas.filter((o) => distancias.has(o.id)),
    sinUbicacion: ofertas.filter((o) => !distancias.has(o.id)).length,
    destinos,
    distancias,
    punto: f.punto ?? puntoSalida(e),
    radioKm: radioBusquedaKm(f),
    desde: f.punto?.nombre ?? nombreSalida(e),
  };
}

export function resultadosMapa(e, params, d = datosMapa(e, params)) {
  const sin = d.sinUbicacion ? ` (${contar(d.sinUbicacion, 'escapada')} sin ubicación no aparecen)` : '';
  const texto = `${contar(d.escapadas.length, 'escapada')} y ${contar(d.destinos.length, 'destino')} de vuelo en el mapa${sin}`;
  return resumenResultados(texto, `<a class="boton boton--suave solo-ancho-flex" href="${crearHash('escapadas', params)}">Ver en lista</a>`, { conModo: false });
}

// ── Calendario ───────────────────────────────────────────────────────────────

export function vistaCalendario(e) {
  const findes = findesProximos(12, e.ahora);
  // Sin ninguna fuente de vuelos con fecha, cada finde lleva a sus escapadas y no dice «sin vuelos» doce veces.
  const hayVuelos = e.datos.ofertas.some(tieneVuelo);
  const celdas = resumenCalendario(e.datos.ofertas, findes, e.datos.puentes).map(({ finde, puente, vuelo, vuelos, escapadas }, i) => {
    const cuando = i === 0 ? 'Este finde' : i === 1 ? 'El siguiente' : `En ${i} semanas`;
    const textoVuelo = !hayVuelos ? '' : vuelo
      ? `${icono('vuelos')}<span>desde <strong>${euros(vuelo.precio)}</strong> · ${esc(vuelo.lugar?.nombre ?? '')}</span>`
      : `${icono('vuelos')}<span class="suave">Sin vuelos con fecha</span>`;
    const destino = hayVuelos ? crearHash('vuelos', { finde: finde.id }) : crearHash('escapadas', { cuando: finde.id });
    return `<li><a class="finde-celda${puente ? ' finde-celda--puente' : ''}" href="${destino}">
  <span class="finde-celda__cuando">${cuando}</span>
  <span class="finde-celda__fecha">${esc(finde.etiqueta)}</span>
  ${puente ? `<span class="insignia insignia--puente">${icono('puentes')}${esc(puente.nombre)}</span>` : ''}
  ${textoVuelo ? `<span class="finde-celda__dato">${textoVuelo}${vuelos > 1 ? ` <span class="suave">(${vuelos})</span>` : ''}</span>` : ''}
  <span class="finde-celda__dato">${icono('escapadas')}${contar(escapadas, 'escapada')}</span>
</a></li>`;
  });
  return `${pestanas('fechas', 'calendario')}<h1 class="titulo-vista" tabindex="-1">Calendario</h1>
<p class="seccion__intro">${hayVuelos
    ? 'Los próximos 12 findes con el vuelo más barato y las escapadas disponibles (con fecha o flexibles). Los puentes van resaltados. Pulsa uno para ver sus vuelos.'
    : 'Los próximos 12 findes con las escapadas disponibles (con fecha o flexibles). Los puentes van resaltados. Pulsa uno para ver sus escapadas.'}</p>
<ol class="calendario">${celdas.join('')}</ol>`;
}

// ── Puentes ──────────────────────────────────────────────────────────────────

/** «pide el vie 25 sep» o «no hay que pedir ningún día». */
function textoPedir(pedir) {
  if (!pedir.length) return 'No hay que pedir ningún día: caen todos en festivo o fin de semana.';
  return `Pide ${pedir.length === 1 ? 'el día' : 'los días'} ${pedir.map(etiquetaDia).join(' y ')} y tendrás el puente entero.`;
}

export function vistaPuentes(e) {
  const resumen = resumenPuentes(e.datos.ofertas, e.datos.puentes, e.hoy, { descartadas: ocultas(e) });
  if (!resumen.length) {
    return `${pestanas('fechas', 'puentes')}<h1 class="titulo-vista" tabindex="-1">Puentes</h1>
${estadoVacio('No hay ningún puente a la vista', 'Se miran los próximos cuatro meses con los festivos de tu comunidad y los locales que tengas en los ajustes.')}`;
  }
  const ctx = ctxTarjetas(e);
  const bloques = resumen.map(({ puente, dias, pedir, festivos, vuelos, escapadas }) => {
    const faltan = diasEntre(e.hoy, puente.desde);
    const cuando = faltan <= 0 ? 'ya ha empezado' : faltan === 1 ? 'empieza mañana' : `empieza en ${faltan} días`;
    const lista = [...vuelos.slice(0, 3), ...escapadas.slice(0, 6 - Math.min(vuelos.length, 3))];
    const dia = (d) => {
      const festivo = festivos.find((f) => f.fecha === d);
      const clase = festivo ? ' dia--festivo' : pedir.includes(d) ? ' dia--pedir' : '';
      const nota = festivo ? festivo.nombre : pedir.includes(d) ? 'Hay que pedirlo' : 'Fin de semana';
      return `<li class="dia${clase}" title="${esc(nota)}"><span class="dia__fecha">${esc(etiquetaDia(d))}</span><span class="dia__nota">${esc(nota)}</span></li>`;
    };
    return `<section class="puente">
  <div class="seccion__cabeza"><h2>${conIcono('puentes', esc(puente.nombre))}</h2><span class="contador">${esc(puente.etiqueta ?? etiquetaRango(puente.desde, puente.hasta))} · ${cuando}</span></div>
  <p class="seccion__intro">${contar(dias.length, 'día')} libres seguidos. ${esc(textoPedir(pedir))}</p>
  <ol class="dias">${dias.map(dia).join('')}</ol>
  <p class="enlaces-linea">${vuelos.length ? `<a class="chip chip--atajo" href="${crearHash('vuelos', { finde: puente.id })}">${icono('vuelos')}${contar(vuelos.length, 'vuelo')}</a> ` : ''}<a class="chip chip--atajo" href="${crearHash('escapadas', { cuando: puente.id })}">${icono('escapadas')}${contar(escapadas.length, 'escapada')}</a></p>
  ${lista.length ? rejilla(lista, ctx, { mostradas: 6, clave: `puente-${puente.id}` }) : estadoVacio('Aún no hay ofertas para este puente.')}
</section>`;
  });
  return `${pestanas('fechas', 'puentes')}<h1 class="titulo-vista" tabindex="-1">Puentes</h1>
<p class="seccion__intro">Los próximos puentes con sus días libres, el día que hay que pedir en el trabajo y sus mejores ofertas.</p>
<div class="carruseles">${bloques.join('')}</div>`;
}

// ── Vigilados ────────────────────────────────────────────────────────────────

const EJEMPLO_VIGILADOS = `{
  "vigilados": [
    { "nombre": "Oporto en avión", "texto": "oporto", "tipo": "vuelo", "precioMax": 60 },
    { "nombre": "Spa a menos de 2 h", "tema": "spa", "cocheMaxMin": 120, "precioMax": 70 },
    { "nombre": "Puentes cerca de casa", "cerca": { "lat": 41.39, "lon": 2.17, "radioKm": 300 }, "puente": true }
  ]
}`;

/**
 * Si los vigilados avisan de verdad: lo publica el escaneo (ofertas.json → avisos). Sin
 * email configurado se dice, en vez de dar a entender que llegará algo.
 */
function estadoAvisos(e) {
  const email = e.datos.avisos?.email;
  if (email === true) {
    return `<p class="seccion__intro estado-avisos">${icono('check')}<span><strong>Avisos por email activos.</strong> Cuando una oferta cumple un criterio y su precio baja respecto al último aviso, llega un email en la siguiente revisión (varias veces al día), y los viernes, un resumen con todos.</span></p>`;
  }
  if (email === false) {
    return `<p class="aviso-memoria" role="status">${icono('alerta')}<strong>Los avisos por email no están configurados</strong>: faltan los secretos del correo en el repositorio (LEEME, «Emails»). Los criterios se comprueban igual y aquí ves lo que cumplen, pero no te llegará ningún aviso.</p>`;
  }
  return '<p class="seccion__intro">Se sabrá si los avisos por email están activos tras la próxima revisión.</p>';
}

export function vistaVigilados(e) {
  const criterios = e.vigilados.map((c) => {
    const coincidencias = (c.coincidencias ?? []).map((id) => e.porId.get(id)).filter(Boolean);
    const condiciones = describirCriterio(c, { temas: e.datos.temas, origen: e.datos.origen });
    return `<section class="vigilado">
  <div class="seccion__cabeza"><h2>${esc(c.nombre)}</h2><span class="contador">${contar(coincidencias.length, 'coincidencia')}</span></div>
  <ul class="condiciones">${condiciones.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>Sin condiciones</li>'}</ul>
  ${coincidencias.length ? `<ul class="filas">${coincidencias.map(filaOferta).join('')}</ul>` : '<p class="suave">Ahora mismo ninguna oferta cumple este criterio.</p>'}
</section>`;
  });
  const url = urlEditarVigilados(e.ubicacion);
  const enlace = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">config/vigilados.json en GitHub</a>`
    : '<code>config/vigilados.json</code> en tu repositorio de GitHub';
  return `${pestanas('mis', 'vigilados')}<h1 class="titulo-vista" tabindex="-1">Avisos por email</h1>
${estadoAvisos(e)}
${criterios.join('') || estadoVacio('Aún no vigilas nada', 'Añade criterios como se explica abajo.')}
<section class="ayuda-caja">
  <h2>Cómo añadir o cambiar vigilados</h2>
  <ol>
    <li>Monta la búsqueda en <a href="#/escapadas">Escapadas</a> o <a href="#/vuelos">Vuelos</a> y pulsa «Copiar como vigilado».</li>
    <li>Abre ${enlace} y pulsa el lápiz para editarlo.</li>
    <li>Pega el criterio dentro de la lista <code>"vigilados"</code>. Solo <code>nombre</code> es obligatorio; una oferta coincide si cumple <strong>todos</strong> los demás campos que pongas.</li>
    <li>Guarda con «Commit changes». Se aplicará en la próxima revisión.</li>
  </ol>
  <p>Para <strong>pausar</strong> un vigilado sin borrarlo, ponle <code>"activo": false</code>; para dejar de recibir cualquier email, borra el secreto <code>EMAIL_TO</code> del repositorio.</p>
  <p>Campos: <code>texto</code>, <code>tipo</code> (vuelo, escapada, hotel, paquete), <code>desde</code> y <code>hasta</code> (fechas), <code>presupuestoMax</code> con <code>presupuestoPor</code> («total» o «persona») y <code>viajeros</code>, <code>tema</code> (${e.datos.temas.map((t) => `<code>${esc(t.id)}</code>`).join(', ')}), <code>fuente</code>, <code>aeropuerto</code>, <code>precioMax</code>, <code>cocheMaxMin</code>, <code>cerca</code> (<code>lat</code>, <code>lon</code>, <code>radioKm</code>) y <code>puente</code>.</p>
  <pre><code>${esc(EJEMPLO_VIGILADOS)}</code></pre>
</section>`;
}

// ── Fuentes ──────────────────────────────────────────────────────────────────

export function vistaFuentes(e) {
  const r = resumenFuentes(e.datos.fuentes);
  const filas = e.datos.fuentes.map((f) => {
    const web = urlSegura(f.web);
    const detalle = motivoFuente(f);
    return `<tr>
  <th scope="row">${esc(f.nombre)}<span class="suave tabla__modo">${esc(f.modo ?? '')}</span></th>
  <td data-etiqueta="Estado">${insigniaEstado(f.estado)}</td>
  <td data-etiqueta="Detalle"${detalle ? '' : ' class="tabla__vacia"'}>${detalle ? esc(detalle) : '<span class="suave">—</span>'}</td>
  <td data-etiqueta="Actualizada">${f.ultimoOk ? `<time datetime="${esc(f.ultimoOk)}" title="${esc(new Date(f.ultimoOk).toLocaleString('es-ES'))}">${esc(haceCuanto(f.ultimoOk, e.ahora))}</time>` : '<span class="suave">Nunca</span>'}</td>
  <td data-etiqueta="Ofertas" class="num">${(f.total ?? 0).toLocaleString('es-ES')}</td>
  <td data-etiqueta="Web">${web ? `<a href="${esc(web)}" target="_blank" rel="noopener noreferrer">${esc(new URL(web).hostname.replace(/^www\./, ''))}</a>` : ''}</td>
</tr>`;
  });
  return `<h1 class="titulo-vista" tabindex="-1">Fuentes</h1>
<p class="seccion__intro">${r.ok} de ${contar(r.activas, 'fuente activa', 'fuentes activas')} funcionan${r.conError ? ` y ${r.conError} con errores` : ''}. ${r.inactivas ? `${contar(r.inactivas, 'fuente')} ${r.inactivas === 1 ? 'está desactivada o bloqueada' : 'están desactivadas o bloqueadas'} a propósito.` : ''} Datos generados ${esc(haceCuanto(e.datos.generado, e.ahora))}.</p>
<div class="tabla-envoltorio"><table class="tabla-fuentes">
  <caption class="sr">Estado de cada fuente de ofertas</caption>
  <thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Detalle</th><th scope="col">Actualizada</th><th scope="col" class="num">Ofertas</th><th scope="col">Web</th></tr></thead>
  <tbody>${filas.join('')}</tbody>
</table></div>`;
}

// ── Búsqueda global ──────────────────────────────────────────────────────────

export function vistaBuscar(e, params) {
  const q = (params.q ?? '').trim();
  const titulo = params.nuevas === '1' ? 'Novedades' : q ? `Resultados para «${esc(q)}»` : 'Buscar';
  return `${pestanas('explorar', null)}<h1 class="titulo-vista" tabindex="-1">${titulo}</h1><div id="resultados">${resultadosBuscar(e, params)}</div>`;
}

export function resultadosBuscar(e, params) {
  const f = leerFiltrosComunes(params);
  const lista = buscarTexto(e.datos.ofertas, f, contextoBusqueda(e));
  if (!lista.length) {
    return `${resumenResultados('0 ofertas')}${estadoVacio(f.nuevas ? 'No hay novedades desde tu última visita.' : `Nada coincide con «${esc(f.q)}».`, 'Prueba con otra palabra: un destino, una región, un tema… Con «-» delante quitas resultados.')}`;
  }
  // Una sola forma de buscar: desde aquí se sigue en la pestaña de Explorar que toque, con
  // la búsqueda puesta y todos sus filtros.
  const pestana = (vista, texto, ic, n) => (n ? `<a class="chip chip--atajo" href="${esc(crearHash(vista, { q: f.q }))}">${icono(ic)}${texto} <span class="suave">(${n.toLocaleString('es-ES')})</span></a>` : '');
  const seguir = f.q && !f.nuevas
    ? `<nav class="enlaces-linea buscar__pestanas" aria-label="Seguir buscando con filtros">${[
      pestana('escapadas', 'En Escapadas', 'escapadas', lista.filter(esEscapada).length),
      pestana('actividades', 'En Planes', 'actividades', lista.filter(esActividad).length),
      pestana('vuelos', 'En Vuelos', 'vuelos', lista.filter((o) => o.tipo === 'vuelo').length),
    ].join(' ')}</nav>`
    : '';
  return `${resumenResultados(contar(lista.length, 'oferta'))}${seguir}${rejilla(lista, ctxTarjetas(e), { mostradas: mostradas(e, 'buscar'), clave: 'buscar' })}`;
}

// ── Comparar ─────────────────────────────────────────────────────────────────

/** Ids de la comparación: los de la URL (enlace compartido) o los elegidos en este navegador. */
export const idsComparar = (e, params = {}) => (params.ids ? params.ids.split(',').filter(Boolean).slice(0, 3) : [...(e.comparar ?? [])]);

export function vistaComparar(e, params = {}) {
  const ofertas = idsComparar(e, params).map((id) => e.porId.get(id)).filter(Boolean);
  const titulo = `${pestanas('mis', 'comparar')}<h1 class="titulo-vista" tabindex="-1">Comparar lado a lado</h1>`;
  if (!ofertas.length) {
    return `${titulo}${estadoVacio('No has elegido nada para comparar', 'Pulsa el botón de comparar (dos columnas) en hasta tres ofertas (escapadas, vuelos o planes) y vuelve aquí.', '<a class="boton boton--primario" href="#/escapadas">Ir a Explorar</a>')}`;
  }
  const ctx = ctxTarjetas(e);
  const costes = ofertas.map((o) => costeDe(o, ctx));
  const totales = costes.map((c) => c.total).filter((t) => t != null);
  const minimo = totales.length > 1 ? Math.min(...totales) : null;
  const celda = (contenido) => `<td>${contenido || '<span class="suave">—</span>'}</td>`;
  const fila = (nombre, valores) => `<tr><th scope="row">${nombre}</th>${valores.map(celda).join('')}</tr>`;
  const dist = (o) => {
    const d = ctx.distancias?.get(o.id);
    if (!d) return '';
    return d.minutos != null && !SIN_COCHE.includes(o.transporte)
      ? `${icono('coche')} ${esc(d.minutos < 5 ? 'menos de 5 min' : duracion(d.minutos))}${d.estimado ? ' aprox.' : ''}`
      : `${Math.round(d.km)} km en línea recta`;
  };
  const filas = [
    fila('Qué es', ofertas.map((o) => `${esc(ETIQUETAS_TIPO[o.tipo] ?? o.tipo)} · ${esc(e.fuentes.get(o.fuente) ?? o.fuente)}`)),
    fila('Destino', ofertas.map((o) => textoLugar(o))),
    fila('Fechas', ofertas.map((o) => esc([textoFechas(o), textoCaducidad(o)].filter(Boolean).join(' · ')))),
    fila(`Viaje completo<br><span class="suave">${esc(contar(ctx.viajeros, 'persona'))} desde ${esc(ctx.desde)}</span>`, costes.map((c) => (c.total != null
      ? `<strong>${c.estimado ? '≈ ' : ''}${esc(euros(Math.round(c.total)))}</strong>${c.total === minimo ? ' <span class="insignia insignia--ahorro">El más barato</span>' : ''}`
      : `<span class="suave">Sin total: falta ${esc(enumerar(c.falta))}</span>`))),
    fila('Por persona', costes.map((c) => (c.porPersona != null ? `${c.estimado ? '≈ ' : ''}${esc(euros(Math.round(c.porPersona)))}` : ''))),
    fila('Incluye', costes.map((c) => esc(c.partes.map((p) => `${p.concepto}${p.estimado ? ' (estimado)' : ''}`).join(' + ')))),
    fila('Precio publicado', ofertas.map((o) => esc(o.precioTexto || (typeof o.precio === 'number' ? euros(o.precio) : '')))),
    fila('Noches', ofertas.map((o, i) => (costes[i].noches ? esc(contar(costes[i].noches, 'noche')) + (o.noches ? '' : ' <span class="suave">(supuestas)</span>') : ''))),
    fila('Régimen', ofertas.map((o) => esc(ETIQUETAS_REGIMEN[o.regimen] ?? ''))),
    fila('Alojamiento', ofertas.map((o) => esc(ETIQUETAS_ALOJAMIENTO[o.alojamiento] ?? ''))),
    fila('Valoración', ofertas.map((o) => (o.valoracion?.nota >= 0 ? `${icono('estrella')} ${esc(String(o.valoracion.nota).replace('.', ','))}${o.valoracion.n ? ` <span class="suave">(${esc(contar(o.valoracion.n, 'opinión', 'opiniones'))})</span>` : ''}` : ''))),
    fila('Cómo llegar', ofertas.map((o) => [ETIQUETAS_TRANSPORTE[o.transporte], dist(o)].filter(Boolean).join(' · '))),
    fila('Certeza', ofertas.map((o) => esc(certeza(o)))),
    fila('Comprobada', ofertas.map((o) => esc(o.vistaUltima ? haceCuanto(o.vistaUltima, e.ahora) : ''))),
    fila('', ofertas.map((o) => {
      const url = urlSegura(o.url);
      return `<div class="acciones">${url ? `<a class="boton boton--primario boton--mini" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver oferta<span class="sr"> (se abre en otra pestaña)</span></a>` : ''}<button type="button" class="boton boton--suave boton--mini" data-comparar="${esc(o.id)}" aria-pressed="true">Quitar</button></div>`;
    })),
  ];
  const cabecera = ofertas.map((o) => `<th scope="col"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button></th>`).join('');
  const enlace = crearHash('comparar', { ids: ofertas.map((o) => o.id).join(',') });
  return `${titulo}
<p class="seccion__intro">El viaje completo con tu salida, viajeros y noches: lo publicado y lo estimado por separado. <button type="button" class="enlace-boton" data-mi-viaje>Cambiar salida, viajeros o noches</button> · <a href="${esc(enlace)}">Enlace a esta comparación</a></p>
<div class="comparar__caja" role="region" aria-label="Tabla de comparación" tabindex="0">
  <table class="comparar"><thead><tr><td></td>${cabecera}</tr></thead><tbody>${filas.join('')}</tbody></table>
</div>`;
}

// ── Mis cosas ────────────────────────────────────────────────────────────────

/** Las ofertas que cumple ahora una búsqueda guardada (su hash), con los filtros de su vista. */
export function resultadosDeBusqueda(e, busqueda) {
  const { vista, params } = leerRuta(busqueda.hash);
  const ctx = contextoBusqueda(e);
  if (vista === 'actividades') return buscarActividades(e.datos.ofertas, leerFiltrosActividades(params), ctx);
  if (vista === 'vuelos') {
    const f = leerFiltrosVuelos(params);
    return [...filtrarVuelos(e.datos.ofertas, f, ctx), ...chollosDeVuelos(e.datos.ofertas, f, ctx)];
  }
  if (vista === 'buscar') return buscarTexto(e.datos.ofertas, leerFiltrosComunes(params), ctx);
  return buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(params), ctx).ofertas;
}

/**
 * Cada búsqueda guardada con lo que cumple ahora y las que han aparecido desde que la
 * miraste por última vez (`visto`). Es el aviso de la web: sin email ni GitHub.
 */
export function avisosDeBusquedas(e) {
  return (e.busquedas ?? []).map((busqueda) => {
    const lista = resultadosDeBusqueda(e, busqueda);
    const desde = Date.parse(busqueda.visto ?? '');
    const nuevas = Number.isFinite(desde) ? lista.filter((o) => Date.parse(o.vistaPrimera) > desde) : [];
    return { busqueda, lista, nuevas };
  });
}

/** Cuántas ofertas nuevas cumplen tus búsquedas guardadas (el número del menú «Mis cosas»). */
export const totalNovedadesGuardadas = (e) => avisosDeBusquedas(e).reduce((suma, a) => suma + a.nuevas.length, 0);

function bloqueAvisos(e) {
  const avisos = avisosDeBusquedas(e);
  if (!avisos.length) {
    return estadoVacio('Aún no has guardado ninguna búsqueda',
      'En Explorar, pon los filtros que quieras y pulsa «Guardar y avisarme». Aquí verás cuántas ofertas nuevas la cumplen cada vez que entres.',
      '<a class="boton boton--primario" href="#/escapadas">Ir a Explorar</a>');
  }
  const contexto = { temas: e.temas, fuentes: e.fuentes, findes: e.findes, puentes: e.datos.puentes };
  return `<div class="avisos">${avisos.map(({ busqueda, lista, nuevas }) => {
    const { vista, params } = leerRuta(busqueda.hash);
    const filtros = filtrosActivos(vista, params, contexto).map((c) => c.texto);
    const visto = busqueda.visto ? `desde que la miraste ${haceCuanto(busqueda.visto, e.ahora)}` : '';
    return `<article class="aviso-busqueda${nuevas.length ? ' aviso-busqueda--nuevas' : ''}">
  <div class="aviso-busqueda__cabeza">
    <h3>${esc(busqueda.nombre)}</h3>
    ${nuevas.length ? `<span class="insignia insignia--nueva">${icono('nuevo')}${contar(nuevas.length, 'nueva')}</span>` : ''}
  </div>
  <p class="suave">${esc(TITULOS_VISTA[vista] ?? vista)}${filtros.length ? ` · ${esc(filtros.join(' · '))}` : ''}</p>
  <p>${contar(lista.length, 'oferta')} la cumplen ahora${nuevas.length ? `; <strong>${contar(nuevas.length, 'es nueva', 'son nuevas')}</strong> ${esc(visto)}` : visto ? ` · nada nuevo ${esc(visto)}` : ''}.</p>
  ${nuevas.length ? `<ul class="filas">${nuevas.slice(0, 3).map(filaOferta).join('')}</ul>` : ''}
  <p class="acciones"><a class="boton boton--primario boton--mini" href="${esc(busqueda.hash)}" data-abrir-busqueda="${esc(busqueda.nombre)}">Ver ${nuevas.length ? 'las ofertas' : 'la búsqueda'}${icono('flecha')}</a>
    <button type="button" class="boton boton--suave boton--mini" data-borrar-busqueda="${esc(busqueda.nombre)}">${icono('cerrar')}Borrar</button></p>
</article>`;
  }).join('')}</div>`;
}

const TITULOS_VISTA = { escapadas: 'Escapadas', actividades: 'Planes', vuelos: 'Vuelos', mapa: 'Escapadas en el mapa', buscar: 'Búsqueda' };

export function vistaMis(e) {
  const ctx = ctxTarjetas(e);
  const favoritos = e.datos.ofertas.filter((o) => e.favoritos.has(o.id));
  const marcadas = (estadoMio) => [...(e.misEstados ?? new Map())].filter(([, v]) => v === estadoMio).map(([id]) => e.porId.get(id)).filter(Boolean);
  const reservadas = marcadas('reservada');
  const noDisponibles = marcadas('no-disponible');
  const comparar = [...(e.comparar ?? [])].filter((id) => e.porId.has(id)).length;
  const email = e.datos.avisos?.email;
  return `${pestanas('mis', 'mis')}<h1 class="titulo-vista" tabindex="-1">Mis cosas</h1>
<p class="seccion__intro">Tus búsquedas guardadas, favoritos y marcas. Todo se guarda solo en este navegador.</p>
<div class="carruseles">
${seccion(conIcono('nuevo', 'Búsquedas guardadas y avisos'), bloqueAvisos(e))}
${seccion(conIcono('corazon', 'Favoritos', 'chollo'), favoritos.length
    ? rejilla(favoritos, ctx, { mostradas: mostradas(e, 'favoritos'), clave: 'favoritos' })
    : estadoVacio('Aún no tienes favoritos', 'Pulsa el corazón de cualquier oferta para guardarla aquí.'))}
</div>
${seccion(conIcono('comparar', 'Comparar lado a lado'), comparar
    ? `<p>${contar(comparar, 'oferta elegida', 'ofertas elegidas')} para comparar. <a class="boton boton--suave boton--mini" href="#/comparar">Ver la comparación${icono('flecha')}</a></p>`
    : '<p class="suave">Pulsa el botón de comparar (dos columnas) en hasta tres ofertas para verlas lado a lado.</p>')}
${reservadas.length || noDisponibles.length ? seccion(conIcono('check', 'Marcadas por ti'), `${reservadas.length ? `<h3 class="subtitulo">Reservadas</h3><ul class="filas">${reservadas.map(filaOferta).join('')}</ul>` : ''}${noDisponibles.length ? `<h3 class="subtitulo">Ya no disponibles <span class="suave">(no salen en las listas)</span></h3><ul class="filas">${noDisponibles.map(filaOferta).join('')}</ul>` : ''}`) : ''}
${seccion(conIcono('vigilados', 'Avisos por email'), `<p>${email === true ? 'Activos: te llega un email cuando una oferta cumple uno de tus criterios y baja de precio.' : 'Para recibirlos por email hay que configurar el correo y los criterios en GitHub.'} <a class="boton boton--suave boton--mini" href="#/vigilados">Ver los avisos por email${icono('flecha')}</a></p>`)}`;
}

export const VISTAS_HTML = {
  finde: { html: vistaFinde },
  vuelos: { html: vistaVuelos, resultados: resultadosVuelos },
  escapadas: { html: vistaEscapadas, resultados: resultadosEscapadas },
  actividades: { html: vistaActividades, resultados: resultadosActividades },
  mapa: { html: vistaMapa, resultados: resultadosMapa },
  calendario: { html: vistaCalendario },
  puentes: { html: vistaPuentes },
  vigilados: { html: vistaVigilados },
  fuentes: { html: vistaFuentes },
  buscar: { html: vistaBuscar, resultados: resultadosBuscar },
  comparar: { html: vistaComparar },
  mis: { html: vistaMis },
};
