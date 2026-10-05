/**
 * Piezas compartidas por las vistas: tu salida y tu viaje, el contexto de las tarjetas,
 * las secciones, las pestañas y los campos de los formularios de filtros.
 */

import { etiquetaDia, nombreFinde } from './fechas.js';
import { contar, escaparHtml as esc } from './formato.js';
import { POR_PAGINA, TEXTO_PERIODO_PASADO, crearHash, destinosDe, resumenFuentes, salidaPuente } from './filtros.js';
import { NOCHES, VIAJEROS, aeropuertosCercanos } from './viaje.js';
import { icono } from './iconos.js';

/** Los filtros que van dentro de «Más filtros» (los de arriba se ven siempre). */
export const FILTROS_SECUNDARIOS = [
  'pnMin', 'km', 'dto', 'pts', 'nota', 'noches', 'regimen', 'aloj', 'est', 'transporte', 'fuente', 'tipo', 'pais', 'region',
  'nuevas', 'fav', 'cho', 'baja', 'hist', 'sindesc', 'frescas', 'dup', 'cru',
];
/** Los que van en «Más filtros» de la vista de vuelos. */
export const FILTROS_MAS_VUELOS = ['dto', 'pts', 'cho', 'baja', 'hist', 'nuevas', 'fav', 'sindesc', 'frescas', 'dup'];
export const HORAS_SORPRESA = 3;
export const ACTIVIDADES_FINDE = 4;
export const ETIQUETAS_ORDEN = {
  puntuacion: 'Valor de la oferta',
  total: 'Coste total del viaje',
  persona: 'Coste total por persona',
  calidad: 'Calidad/precio (nota por persona)',
  comodo: 'Más cómodo (menos viaje)',
  precio: 'Precio publicado (sin igualar unidades)',
  noche: 'Precio por persona y noche',
  ahorro: 'Más por debajo de lo normal',
  valoracion: 'Mejor valoradas',
  distancia: 'Distancia (más cerca primero)',
  alojamiento: 'Tipo de alojamiento',
  novedad: 'Novedad',
};

export const mostradas = (e, clave) => e.paginas.get(clave) ?? POR_PAGINA;

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
      <button type="button" class="boton boton--suave boton-ubicacion" data-mi-ubicacion title="Usar mi ubicación" aria-label="Usar mi ubicación">${icono('ubicacion')}<span class="boton-ubicacion__texto">Mi ubicación</span></button>
    </div>
    <p class="ayuda" id="salida-ayuda" role="status">${s
    ? `Desde ${esc(s.nombre)} se piden los km y el tiempo reales por carretera (tarda unos segundos la primera vez; mientras, se estiman). Déjalo vacío para volver a ${esc(e.datos.origen.nombre)}.`
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
export const datosViaje = (e) => ({
  viajeros: e.viaje?.viajeros ?? e.datos.viajeros ?? 2, noches: e.viaje?.noches ?? 2, coche: e.datos.coche ?? null,
});

/** Contexto que necesitan las plantillas de tarjetas. */
export function ctxTarjetas(e, extra = {}) {
  return {
    temas: e.temas, fuentes: e.fuentes, favoritos: e.favoritos, referencia: e.referencia,
    historial: e.historial, distancias: e.distanciasOrigen, desde: nombreSalida(e),
    // Aunque las distancias que se enseñan sean desde «Cerca de…», el viaje sale de tu salida.
    distanciasCoste: e.distanciasOrigen,
    // El coste de coche que calcula el escaneo es desde su origen: desde otra salida no vale.
    salidaPropia: Boolean(e.salida), ...datosViaje(e), ahora: e.ahora, comparar: e.comparar ?? null, misEstados: e.misEstados ?? null,
    intervalos: intervalosDe(e), busqueda: e.busqueda ?? null, ...extra,
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
export const intervalosDe = (e) => new Map((e.datos.fuentes ?? []).map((f) => [f.id, f.intervaloMin]));
/** Hora del escaneo: «sin comprobar» se mide hasta ella (si el escaneo se retrasa, no pasan todas a la vez). */
export const horaRevision = (e) => (Number.isFinite(Date.parse(e.datos.generado)) ? new Date(e.datos.generado) : e.ahora);

/** Contexto de búsqueda: origen, fechas y preferencias de este navegador. */
export function contextoBusqueda(e) {
  return {
    origen: e.datos.origen,
    salida: e.salida ?? null,
    distanciasSalida: e.distanciasOrigen ?? null,
    ...datosViaje(e),
    aeropuertos: misAeropuertos(e),
    hoy: e.hoy,
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

export function seccion(titulo, contenido, enlace = null, clase = '') {
  const ver = enlace ? `<a class="seccion__enlace" href="${enlace.href}">${enlace.texto}${icono('flecha')}</a>` : '';
  return `<section class="seccion${clase ? ` seccion--${clase}` : ''}"><div class="seccion__cabeza"><h2>${titulo}</h2>${ver}</div>${contenido}</section>`;
}

/** Título de sección con su icono en una pastilla de color (`clase` cambia el color). */
export const conIcono = (nombre, texto, clase = '') => `<span class="seccion__icono${clase ? ` seccion__icono--${clase}` : ''}" aria-hidden="true">${icono(nombre)}</span><span>${texto}</span>`;

/** «Tarjetas» o «Lista»: app.js marca el que está puesto (se guarda en este navegador). */
export const selectorModo = `<div class="selector-modo" role="group" aria-label="Cómo ver los resultados">
  <button type="button" class="selector-modo__boton" data-modo-lista="tarjetas" aria-pressed="true" aria-label="Ver en tarjetas">${icono('todo')}<span class="solo-ancho">Tarjetas</span></button>
  <button type="button" class="selector-modo__boton" data-modo-lista="lista" aria-pressed="false" aria-label="Ver en lista">${icono('lista')}<span class="solo-ancho">Lista</span></button>
</div>`;
/** Las pestañas de cada apartado del menú: Explorar, Fechas y Mis cosas. */
export const PESTANAS = {
  // El Mapa no es otra categoría: es otra forma de ver las escapadas (conmutador Lista / Mapa).
  explorar: ['Explorar', [['escapadas', 'Escapadas', 'escapadas'], ['vuelos', 'Vuelos', 'vuelos'], ['actividades', 'Planes', 'actividades']]],
  fechas: ['Fechas', [['calendario', 'Calendario', 'calendario'], ['puentes', 'Puentes', 'puentes']]],
  // Tres cosas distintas, cada una en su pestaña: lo que guardas, lo que buscas y lo que comparas.
  mis: ['Guardados', [['mis', 'Favoritos', 'corazon'], ['mis?ver=busquedas', 'Búsquedas guardadas', 'guardar', 'Búsquedas'], ['comparar', 'Comparar lado a lado', 'comparar', 'Comparar'], ['vigilados', 'Avisos por email', 'vigilados', 'Por email']]],
};
export function pestanas(apartado, activa, e = null) {
  const [nombre, todas] = PESTANAS[apartado];
  // «Avisos por email» es de quien administra la web (se configuran en GitHub): solo en modo propietario.
  const lista = todas.filter(([vista]) => vista !== 'vigilados' || e?.propietario);
  // En el móvil, el nombre corto (si lo hay) para que quepan todas sin deslizar.
  const texto = (largo, corto) => (corto ? `<span class="solo-ancho">${largo}</span><span class="solo-estrecho">${corto}</span>` : `<span>${largo}</span>`);
  // `ruta` puede llevar parámetros («mis?ver=busquedas»): la vista es lo de antes del «?».
  return `<nav class="pestanas" aria-label="${esc(nombre)}">${lista.map(([ruta, largo, ic, corto]) => `<a class="pestana" href="#/${ruta}"${ruta.includes('?') ? '' : ` data-vista="${ruta}"`}${corto ? ` aria-label="${esc(largo)}"` : ''}${ruta === activa ? ' aria-current="page"' : ''}>${icono(ic)}${texto(largo, corto)}</a>`).join('')}</nav>`;
}

export const resumenResultados = (texto, extra = '', { conModo = true } = {}) => `<div class="resultados__cabeza" data-resumen="${esc(texto)}"><p class="resultados__cuenta">${esc(texto)}</p>${conModo ? selectorModo : ''}${extra}</div>`;
// «data-olvidar-filtros»: al quitar los filtros también se olvidan los recordados de esa vista.
export const botonLimpiar = (vista) => `<a class="boton boton--suave" href="#/${vista}" data-olvidar-filtros>${icono('deshacer')}Quitar filtros</a>`;
export const opciones = (lista, actual, vacia) => `${vacia ? `<option value="">${vacia}</option>` : ''}${
  lista.map(([valor, texto]) => `<option value="${esc(valor)}"${String(valor) === String(actual ?? '') ? ' selected' : ''}>${esc(texto)}</option>`).join('')}`;
export const marcado = (condicion) => (condicion ? ' checked' : '');
export const interruptor = (nombre, etiqueta, activo) => `<label class="interruptor"><input type="checkbox" name="${nombre}" value="1"${marcado(activo)}> ${etiqueta}</label>`;
/** Interruptor que viene activado de fábrica: al desmarcarlo, app.js escribe «<nombre>=0» en la URL. */
export const interruptorDefecto = (nombre, etiqueta, activo) => `<label class="interruptor"><input type="checkbox" name="${nombre}" value="1" data-defecto${marcado(activo)}> ${etiqueta}</label>`;
export const numero = (nombre, etiqueta, valor, extra = '') => `<label class="campo">${etiqueta} <input type="number" name="${nombre}" min="0" step="1" inputmode="numeric" value="${valor ?? ''}"${extra}></label>`;

/** Horas fallando para contarlo en la portada: un fallo suelto se arregla solo en la siguiente revisión. */
export const HORAS_PROBLEMA = 12;

/** Webs que llevan horas fallando o que leen mucho menos de lo normal (aviso). */
export function webConProblemas(fuentes = [], ahora = new Date()) {
  return fuentes.filter((f) => f.aviso
    || (f.estado === 'error' && f.desdeError && ahora - Date.parse(f.desdeError) >= HORAS_PROBLEMA * 3_600_000));
}

/**
 * El estado de las webs en una frase, la misma en la portada y en el pie (antes una decía
 * «1 web con problemas» y la otra «26 de 26 webs funcionan» a la vez). Un fallo reciente
 * suele arreglarse en la siguiente revisión: se dice que se reintenta, no que hay problemas.
 */
export function estadoWebs(fuentes = [], ahora = new Date()) {
  const r = resumenFuentes(fuentes);
  const problemas = webConProblemas(fuentes, ahora);
  const reintentando = fuentes.filter((f) => f.estado === 'error' && !problemas.includes(f)).length;
  const texto = problemas.length
    ? `${problemas.length} de ${contar(r.activas, 'web')} con problemas`
    : reintentando
      ? `${r.activas - reintentando} de ${contar(r.activas, 'web')} al día · ${reintentando} reintentando`
      : `Las ${contar(r.activas, 'web')} funcionan`;
  return { texto, problemas, error: problemas.length > 0 };
}

export function motivoFuente(f) {
  if (f.motivo) return f.motivo;
  if (f.aviso) return f.aviso;
  if (f.falta?.length) return `falta configurar ${f.falta.join(', ')}`;
  return f.error ?? '';
}

/** «sáb 10 – lun 12 oct»: los días con su nombre, para no confundir un finde con un puente. */
export const diasExplicitos = (desde, hasta) => {
  const [a, b] = [etiquetaDia(desde), etiquetaDia(hasta)];
  // «sáb 10 oct – lun 12 oct» → «sáb 10 – lun 12 oct» si es el mismo mes.
  return a.split(' ')[2] === b.split(' ')[2] ? `${a.split(' ').slice(0, 2).join(' ')} – ${b}` : `${a} – ${b}`;
};

/**
 * El puente con sus días, contando la tarde del último laborable para salir:
 * «Fiesta Nacional · vie 9 – lun 12 oct · todo el puente».
 */
export function etiquetaPuente(p) {
  return `${icono('puentes')}${esc(p.nombre)} · ${esc(diasExplicitos(salidaPuente(p), p.hasta))} · todo el puente`;
}

/**
 * El finde con sus días y, si toca un puente, qué parte coge: «vie 9 – dom 11 oct · vuelve
 * antes del festivo» (el puente sigue hasta el lunes).
 */
export function etiquetaFinde(finde, puentes = []) {
  const dias = diasExplicitos(finde.viernes, finde.domingo);
  const puente = puentes.find((p) => p.id === finde.puenteId);
  if (!puente) return dias;
  if (puente.hasta > finde.domingo) return `${dias} · vuelve antes del festivo`;
  if (puente.desde < finde.viernes) return `${dias} · sin el festivo de antes`;
  return dias;
}

// ── Piezas compartidas de los formularios ────────────────────────────────────

export function campoTexto(f) {
  return `<label class="campo campo--ancho">Buscar palabras
  <input type="search" name="q" value="${esc(f.q)}" placeholder="playa -crucero" autocomplete="off" enterkeyhint="search">
  <span class="ayuda">Varias palabras a la vez; con «-» delante quitas resultados (<code>playa -crucero</code>).</span>
</label>`;
}

/** Filtros de chollo que valen igual para vuelos y escapadas. */
export function filtrosChollo(f) {
  return `${numero('dto', 'Descuento mín. (%)', f.dto, ' max="99" placeholder="Cualquiera"')}
${numero('pts', 'Valor de la oferta mín. (0–100)', f.puntos, ' max="100" placeholder="0–100"')}
${interruptor('cho', 'Solo chollazos', f.chollazo)}
${interruptor('baja', 'Solo con bajada de precio', f.bajada)}
${interruptor('hist', 'Solo mínimo histórico', f.historico)}`;
}

/** Favoritos, descartadas y duplicadas (las duplicadas se ocultan por defecto). */
export function filtrosListas(f) {
  return `${interruptor('fav', 'Solo favoritos', f.fav)}
${interruptor('nuevas', 'Solo novedades', f.nuevas)}
${interruptorDefecto('sindesc', 'Ocultar las descartadas y las no disponibles', f.sinDescartadas)}
${interruptor('frescas', 'Ocultar las que su web lleva días sin publicar', f.soloComprobadas)}
${interruptor('dup', 'Mostrar las repetidas en varias webs', f.conDuplicadas)}`;
}

export function chipsExcluidos(nombre, valores, etiqueta) {
  return valores.map((valor) => `<label class="chip chip--excluido"><input type="checkbox" name="${nombre}" value="${esc(valor)}" checked> ${icono('prohibido')}${esc(etiqueta ? etiqueta(valor) : valor)}</label>`).join('');
}

/** Lista negra: temáticas y destinos que no quieres ver. */
export function bloqueExclusiones(e, f, ofertas) {
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
export function bloqueBusquedas(e, vista) {
  const chips = e.busquedas.map((b) => `<span class="chip chip--guardada">
  <a href="${esc(b.hash)}" title="${esc(b.nombre)}">${esc(b.nombre)}</a>
  <button type="button" class="boton-icono boton-icono--mini" data-borrar-busqueda="${esc(b.nombre)}" aria-label="Borrar la búsqueda guardada ${esc(b.nombre)}">${icono('cerrar')}</button>
</span>`).join('');
  return `<details class="filtros__mas"${e.busquedas.length ? ' open' : ''}>
  <summary>Guardar búsqueda</summary>
  <div class="filtros__fila">
    <label class="campo campo--ancho">Nombre
      <input type="text" data-nombre-busqueda placeholder="Spa cerca y barato" autocomplete="off" maxlength="60">
    </label>
    <button type="button" class="boton boton--primario" data-guardar-busqueda="${esc(vista)}">${icono('guardar')}Guardar búsqueda</button>
    <button type="button" class="boton boton--suave" data-compartir-busqueda="${esc(vista)}">${icono('enlace')}Compartir esta búsqueda</button>
  </div>
  <p class="ayuda">Se guarda en este navegador. No te llega nada: cuando vuelvas, en <a href="#/mis">Guardados</a> verás las ofertas nuevas que la cumplen.${e.propietario ? ` ¿La quieres por email? <button type="button" class="enlace-boton" data-copiar-vigilado="${esc(vista)}">Copiar para los avisos por email</button> y pégala en <code>config/vigilados.json</code>.` : ''}</p>
  ${chips ? `<div class="chips__lista">${chips}</div>` : ''}
</details>`;
}


/**
 * La franja con el periodo elegido, arriba de los resultados de Escapadas, Vuelos, Planes y
 * Mapa: «Puente · Fiesta Nacional · vie 9 – lun 12 oct · Cambiar fechas». Es la misma en
 * todas las pestañas (el periodo pasa de una a otra), así se ve enseguida si algo no cuadra.
 */
export function franjaPeriodo(e, vista, params = {}) {
  const cuando = (vista === 'vuelos' ? params.finde : params.cuando) ?? '';
  const id = cuando === 'finde' ? e.findes[0]?.id : cuando === 'puente' ? e.puente?.id : cuando;
  const finde = e.findes.find((f) => f.id === id);
  const puente = (e.datos.puentes ?? []).find((p) => p.id === id);
  const { desde = '', hasta = '' } = params;
  let texto;
  if (finde) texto = `<strong>${finde.id === e.findes[0]?.id ? nombreFinde(e.hoy) : 'Finde'}</strong> · ${esc(etiquetaFinde(finde, e.datos.puentes))}`;
  else if (puente) texto = `<strong>Puente</strong> · ${esc(puente.nombre)} · ${esc(diasExplicitos(salidaPuente(puente), puente.hasta))}`;
  else if (desde && hasta) texto = desde === hasta ? `<strong>El ${esc(etiquetaDia(desde))}</strong>` : `<strong>Fechas</strong> · ${esc(diasExplicitos(desde, hasta))}`;
  else if (desde || hasta) texto = `<strong>${desde ? `Desde el ${esc(etiquetaDia(desde))}` : `Hasta el ${esc(etiquetaDia(hasta))}`}</strong>`;
  // Un finde o puente que ya pasó (enlace viejo): se dice, no se finge «cualquier fecha» con 0 resultados.
  else if (cuando) texto = `<strong>${TEXTO_PERIODO_PASADO}</strong>`;
  else texto = '<strong>Cualquier fecha</strong>';
  const elegido = texto !== '<strong>Cualquier fecha</strong>';
  const sinFechas = Object.fromEntries(Object.entries(params).filter(([clave]) => !['cuando', 'finde', 'desde', 'hasta'].includes(clave)));
  const quitar = elegido ? `<a class="franja-periodo__quitar" href="${esc(crearHash(vista, sinFechas))}" aria-label="Quitar las fechas">${icono('cerrar')}</a>` : '';
  return `<div class="franja-periodo${!finde && !puente && !desde && !hasta && cuando ? ' franja-periodo--pasado' : ''}">${icono('calendario')}<span class="franja-periodo__texto">${texto}</span><button type="button" class="enlace-boton" data-cambiar-fechas>${elegido ? 'Cambiar<span class="solo-ancho"> fechas</span>' : 'Elegir fechas'}</button>${quitar}</div>`;
}

/** «Lista | Mapa»: la misma búsqueda (categoría, fechas y filtros) vista de una u otra forma. */
export function conmutadorListaMapa(params, actual) {
  const opcion = (vista, ic, texto) => `<a class="conmutador__opcion" href="${esc(crearHash(vista, params))}"${actual === vista ? ' aria-current="page"' : ''}>${icono(ic)}${texto}</a>`;
  return `<nav class="conmutador solo-ancho-flex" aria-label="Ver como">${opcion('escapadas', 'lista', 'Lista')}${opcion('mapa', 'mapa', 'Mapa')}</nav>`;
}
