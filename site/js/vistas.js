/**
 * HTML de cada vista. Las vistas con filtros separan el formulario (se pinta al
 * entrar) de los resultados (se repintan al cambiar un filtro, sin perder el foco).
 */

import { diasEntre, etiquetaDia, etiquetaRango, findesProximos } from './fechas.js';
import { contar, escaparHtml as esc, euros, haceCuanto, urlSegura, ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE } from './formato.js';
import {
  POR_PAGINA, buscarEscapadas, buscarTexto, chollazos, chollosDeVuelos, crearHash, describirCriterio,
  destinosDeVuelo, filtrarVuelos, leerFiltrosEscapadas, leerFiltrosVuelos, puenteDelFinde, radioBusquedaKm,
  resumenCalendario, resumenFuentes, tieneVuelo, urlEditarVigilados, valoresUnicos, vuelosParaMapa,
} from './filtros.js';
import { ESTADOS_FUENTE, estadoVacio, filaOferta, insigniaEstado, rejilla, textoAyudaUbicacion } from './plantillas.js';

const MODOS_VUELOS_CON_FECHA = ['api', 'afiliado'];
const FILTROS_SECUNDARIOS = ['max', 'noches', 'regimen', 'transporte', 'fuente', 'tipo', 'nuevas', 'fav'];

const mostradas = (e, clave) => e.paginas.get(clave) ?? POR_PAGINA;

/** Contexto que necesitan las plantillas de tarjetas. */
export function ctxTarjetas(e, extra = {}) {
  return {
    temas: e.temas, fuentes: e.fuentes, favoritos: e.favoritos, referencia: e.referencia,
    historial: e.historial, distancias: e.distanciasOrigen, desde: e.datos.origen.nombre, ...extra,
  };
}

function seccion(titulo, contenido, enlace = null) {
  const ver = enlace ? `<a class="seccion__enlace" href="${enlace.href}">${enlace.texto} →</a>` : '';
  return `<section class="seccion"><div class="seccion__cabeza"><h2>${titulo}</h2>${ver}</div>${contenido}</section>`;
}

const resumenResultados = (texto, extra = '') => `<div class="resultados__cabeza" data-resumen="${esc(texto)}"><p class="resultados__cuenta">${esc(texto)}</p>${extra}</div>`;
const botonLimpiar = (vista) => `<a class="boton boton--suave" href="#/${vista}">Quitar filtros</a>`;
const opciones = (lista, actual, vacia) => `${vacia ? `<option value="">${vacia}</option>` : ''}${
  lista.map(([valor, texto]) => `<option value="${esc(valor)}"${String(valor) === String(actual ?? '') ? ' selected' : ''}>${esc(texto)}</option>`).join('')}`;
const marcado = (condicion) => (condicion ? ' checked' : '');

function motivoFuente(f) {
  if (f.motivo) return f.motivo;
  if (f.falta?.length) return `falta configurar ${f.falta.join(', ')}`;
  return f.error ?? '';
}

function etiquetaPuente(p) {
  return `🎉 ${esc(p.nombre)} · ${esc(p.etiqueta ?? etiquetaRango(p.desde, p.hasta))}`;
}

// ── Este finde ───────────────────────────────────────────────────────────────

function bloqueVuelos(e, finde, titulo) {
  const vuelos = filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), finde: finde.id, orden: 'puntuacion' });
  const contenido = vuelos.length
    ? rejilla(vuelos.slice(0, 3), ctxTarjetas(e), { mostradas: 3, clave: `finde-vuelos-${finde.id}` })
    : estadoVacio('Sin vuelos guardados para estas fechas.');
  return seccion(titulo, contenido, vuelos.length > 3 ? { href: crearHash('vuelos', { finde: finde.id }), texto: `Ver los ${vuelos.length}` } : null);
}

function bloquePuente(e) {
  const p = e.puente;
  if (!p) return '';
  const faltan = diasEntre(e.hoy, p.desde);
  const cuando = faltan <= 0 ? 'ya ha empezado' : faltan === 1 ? 'empieza mañana' : `empieza en ${faltan} días`;
  const vuelos = filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), finde: p.id, orden: 'puntuacion' }).slice(0, 3);
  const { ofertas } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ cuando: 'puente' }), contextoBusqueda(e));
  const lista = [...vuelos, ...ofertas.slice(0, 6 - vuelos.length)];
  return seccion(`🎉 Próximo puente: ${esc(p.nombre)}`,
    `<p class="seccion__intro">${esc(etiquetaDia(p.desde))} – ${esc(etiquetaDia(p.hasta))} · ${contar(p.dias, 'día')} libres · ${cuando}</p>
     ${lista.length ? rejilla(lista, ctxTarjetas(e), { mostradas: 6, clave: 'finde-puente' }) : estadoVacio('Aún no hay ofertas para este puente.')}
     <p class="enlaces-linea"><a href="${crearHash('vuelos', { finde: p.id })}">Vuelos del puente</a> · <a href="${crearHash('escapadas', { cuando: 'puente' })}">Escapadas del puente</a></p>`);
}

export function vistaFinde(e) {
  const [actual, siguiente] = e.findes;
  const ctx = ctxTarjetas(e);
  const hayVuelosConFecha = e.datos.ofertas.some(tieneVuelo);
  const escapadas = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ cuando: 'finde' }), contextoBusqueda(e)).ofertas;
  const top = chollazos(e.datos.ofertas);
  const favoritos = e.datos.ofertas.filter((o) => e.favoritos.has(o.id));
  const puenteSiguiente = siguiente && puenteDelFinde(siguiente, e.datos.puentes);

  const vuelos = hayVuelosConFecha
    ? bloqueVuelos(e, actual, `✈️ Vuelos este finde <span class="suave">(${esc(actual.etiqueta)})</span>`)
      + (siguiente ? bloqueVuelos(e, siguiente, `✈️ Vuelos el finde siguiente <span class="suave">(${esc(siguiente.etiqueta)}${puenteSiguiente ? ' · puente' : ''})</span>`) : '')
    : seccion('✈️ Chollos de vuelos', rejilla(chollosDeVuelos(e.datos.ofertas, leerFiltrosVuelos()).slice(0, 3), ctx, { mostradas: 3, clave: 'finde-chollos' }),
      { href: '#/vuelos', texto: 'Ver todos' });

  return `<h1 class="titulo-vista" tabindex="-1">Este finde <span class="suave">${esc(etiquetaDia(actual.viernes))} – ${esc(etiquetaDia(actual.domingo))}</span></h1>
${favoritos.length ? seccion('⭐ Tus favoritos', rejilla(favoritos, ctx, { mostradas: mostradas(e, 'favoritos'), clave: 'favoritos' })) : ''}
${vuelos}
${seccion('🏡 Mejores escapadas para este finde', escapadas.length
    ? rejilla(escapadas.slice(0, 6), ctx, { mostradas: 6, clave: 'finde-escapadas' })
    : estadoVacio('No hay escapadas para este finde.'), { href: crearHash('escapadas', { cuando: 'finde' }), texto: `Ver las ${escapadas.length}` })}
${seccion('🔥 Chollazos', top.length
    ? rejilla(top, ctx, { mostradas: e.paginas.get('chollazos') ?? 6, clave: 'chollazos' })
    : estadoVacio('Ahora mismo no hay chollazos.', 'Aparecen aquí las ofertas con una puntuación muy alta.'))}
${bloquePuente(e)}`;
}

// ── Vuelos ───────────────────────────────────────────────────────────────────

export function vistaVuelos(e, params) {
  const f = leerFiltrosVuelos(params);
  const vuelos = e.datos.ofertas.filter((o) => o.tipo === 'vuelo');
  const paises = valoresUnicos(vuelos, (o) => o.lugar?.pais);
  const chips = [
    `<label class="chip"><input type="radio" name="finde" value=""${marcado(!f.finde)}> Todos</label>`,
    ...e.findes.map((finde, i) => `<label class="chip${finde.puenteId ? ' chip--puente' : ''}"><input type="radio" name="finde" value="${esc(finde.id)}"${marcado(f.finde === finde.id)}> ${i === 0 ? 'Este finde · ' : ''}${esc(finde.etiqueta)}</label>`),
    ...e.datos.puentes.map((p) => `<label class="chip chip--puente"><input type="radio" name="finde" value="${esc(p.id)}"${marcado(f.finde === p.id)}> ${etiquetaPuente(p)}</label>`),
  ];
  return `<h1 class="titulo-vista" tabindex="-1">Vuelos</h1>
<form class="filtros" data-filtros="vuelos" aria-label="Filtros de vuelos">
  <fieldset class="chips chips--desplazables"><legend>Finde o puente</legend><div class="chips__lista">${chips.join('')}</div></fieldset>
  <div class="filtros__fila">
    <label class="campo">Aeropuerto <select name="aero">${opciones(e.datos.aeropuertos.map((a) => [a, a]), f.aero, 'Todos')}</select></label>
    <label class="campo">País <select name="pais">${opciones(paises.map((p) => [p, p]), f.pais, 'Todos')}</select></label>
    <label class="campo">Precio máx. (€) <input type="number" name="max" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${f.max ?? ''}"></label>
    <label class="campo">Orden <select name="orden">${opciones([['precio', 'Precio'], ['puntuacion', 'Puntuación'], ['hora', 'Hora de salida']], f.orden)}</select></label>
    <label class="interruptor"><input type="checkbox" name="ideal" value="1"${marcado(f.ideal)}> Solo horario ideal</label>
  </div>
</form>
<div id="resultados">${resultadosVuelos(e, params)}</div>`;
}

function sinVuelosConFecha(e) {
  const fuentes = e.datos.fuentes.filter((f) => MODOS_VUELOS_CON_FECHA.includes(f.modo) && f.estado !== 'ok');
  const lista = fuentes.map((f) => `<li><strong>${esc(f.nombre)}</strong>: ${esc((ESTADOS_FUENTE[f.estado]?.texto ?? f.estado).toLowerCase())}${motivoFuente(f) ? ` (${esc(motivoFuente(f))})` : ''}</li>`).join('');
  return estadoVacio('Todavía no hay vuelos con fecha y hora',
    'Los vuelos concretos de cada finde llegan de fuentes como Ryanair, Travelpayouts o SerpApi, y ahora mismo ninguna está disponible. Mientras tanto, aquí abajo tienes los chollos de vuelos que publican blogs y comunidades.',
    `${lista ? `<ul class="vacio__lista">${lista}</ul>` : ''}<a class="boton boton--suave" href="#/fuentes">Ver el estado de las fuentes</a>`);
}

export function resultadosVuelos(e, params) {
  const f = leerFiltrosVuelos(params);
  const ctx = ctxTarjetas(e);
  const hayConFecha = e.datos.ofertas.some(tieneVuelo);
  const vuelos = filtrarVuelos(e.datos.ofertas, f);
  const chollos = chollosDeVuelos(e.datos.ofertas, f);
  const conFecha = !hayConFecha
    ? sinVuelosConFecha(e)
    : vuelos.length
      ? rejilla(vuelos, ctx, { mostradas: mostradas(e, 'vuelos'), clave: 'vuelos' })
      : estadoVacio('Ningún vuelo cumple estos filtros', 'Prueba con otro finde, otro aeropuerto o un precio máximo más alto.', botonLimpiar('vuelos'));
  const resumen = `${contar(vuelos.length, 'vuelo')} con fecha y ${contar(chollos.length, 'chollo')} de vuelos`;
  return `${resumenResultados(resumen)}
${hayConFecha ? `<h2 class="subtitulo">Vuelos con fecha y hora</h2>` : ''}${conFecha}
<section class="seccion">
  <div class="seccion__cabeza"><h2>Chollos de vuelos de blogs y comunidades</h2></div>
  <p class="seccion__intro">Sin fechas concretas: revisa en cada oferta qué días hay plazas. Aquí solo se aplican el precio y el país.</p>
  ${chollos.length ? rejilla(chollos, ctx, { mostradas: mostradas(e, 'chollos'), clave: 'chollos' }) : estadoVacio('No hay chollos de vuelos con estos filtros.')}
</section>`;
}

// ── Escapadas y mapa ─────────────────────────────────────────────────────────

export function contextoBusqueda(e) {
  return { origen: e.datos.origen, finde: e.findes[0], puente: e.puente, referencia: e.referencia, favoritos: e.favoritos };
}

function chipsTemas(e, f) {
  return e.datos.temas.map((t) => `<label class="chip chip--tema" style="--color-tema:var(--tema-${esc(t.id)})"><input type="checkbox" name="temas" value="${esc(t.id)}"${marcado(f.temas.includes(t.id))}> <span aria-hidden="true">${t.emoji}</span> ${esc(t.nombre)}</label>`).join('');
}

function chipsCuando(e, f) {
  const finde = e.findes[0];
  const puente = e.puente;
  return `<label class="chip"><input type="radio" name="cuando" value=""${marcado(!f.cuando)}> Cualquier fecha</label>
<label class="chip"><input type="radio" name="cuando" value="finde"${marcado(f.cuando === 'finde')}> Este finde · ${esc(finde.etiqueta)}</label>
${puente ? `<label class="chip chip--puente"><input type="radio" name="cuando" value="puente"${marcado(f.cuando === 'puente')}> ${etiquetaPuente(puente)}</label>` : ''}`;
}

function campoUbicacion(e, f) {
  const p = f.punto;
  const horas = [1, 2, 3, 4].map((h) => [h, `A menos de ${h} h en coche`]);
  return `<fieldset class="ubicacion"><legend>Cerca de…</legend>
  <div class="ubicacion__fila">
    <div class="combo">
      <label class="sr" for="lugar-texto">Pueblo, ciudad o zona</label>
      <input id="lugar-texto" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="lugar-sugerencias" autocomplete="off" placeholder="${esc(e.datos.origen.nombre)} (origen)" value="${esc(p?.nombre ?? '')}">
      <ul id="lugar-sugerencias" class="combo__lista" role="listbox" aria-label="Sugerencias" hidden></ul>
      <input type="hidden" name="lugar" value="${esc(p?.nombre ?? '')}"><input type="hidden" name="lat" value="${p?.lat ?? ''}"><input type="hidden" name="lon" value="${p?.lon ?? ''}">
    </div>
    <button type="button" class="boton boton--suave" data-mi-ubicacion>📍 Usar mi ubicación</button>
  </div>
  <div class="filtros__fila">
    <label class="campo">Distancia <select name="h">${opciones(horas, f.horas, 'Sin límite de tiempo')}</select></label>
    <label class="campo">o a menos de (km) <input type="number" name="km" min="1" step="5" inputmode="numeric" placeholder="km" value="${f.km ?? ''}"></label>
  </div>
  <p class="ayuda" id="ubicacion-ayuda" role="status">${esc(textoAyudaUbicacion(p, e.datos.origen))}</p>
</fieldset>`;
}

function formularioEscapadas(e, params, vista) {
  const f = leerFiltrosEscapadas(params);
  const fuentes = [...new Set(e.datos.ofertas.filter((o) => o.tipo !== 'vuelo').map((o) => o.fuente))]
    .map((id) => [id, e.fuentes.get(id) ?? id]);
  const abiertos = FILTROS_SECUNDARIOS.some((clave) => params[clave]);
  return `<form class="filtros" data-filtros="${vista}" aria-label="Filtros de escapadas">
  <fieldset class="chips chips--desplazables"><legend>Temática</legend><div class="chips__lista">${chipsTemas(e, f)}</div></fieldset>
  <fieldset class="chips"><legend>Cuándo</legend><div class="chips__lista">${chipsCuando(e, f)}</div></fieldset>
  ${campoUbicacion(e, f)}
  <details class="filtros__mas"${abiertos ? ' open' : ''}><summary>Más filtros</summary>
    <div class="filtros__fila">
      <label class="campo">Precio máx. (€) <input type="number" name="max" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${f.max ?? ''}"></label>
      <label class="campo">Noches <select name="noches">${opciones([[1, '1 noche'], [2, '2 noches'], [3, '3 o más']], f.noches, 'Cualquiera')}</select></label>
      <label class="campo">Régimen <select name="regimen">${opciones(Object.entries(ETIQUETAS_REGIMEN), f.regimen, 'Cualquiera')}</select></label>
      <label class="campo">Transporte <select name="transporte">${opciones(Object.entries(ETIQUETAS_TRANSPORTE), f.transporte, 'Cualquiera')}</select></label>
      <label class="campo">Fuente <select name="fuente">${opciones(fuentes, f.fuente, 'Todas')}</select></label>
      <label class="campo">Tipo <select name="tipo">${opciones(['escapada', 'hotel', 'paquete'].map((t) => [t, ETIQUETAS_TIPO[t]]), f.tipo, 'Todos')}</select></label>
      <label class="interruptor"><input type="checkbox" name="nuevas" value="1"${marcado(f.nuevas)}> Solo novedades</label>
      <label class="interruptor"><input type="checkbox" name="fav" value="1"${marcado(f.fav)}> Solo favoritos</label>
    </div>
  </details>
  <div class="filtros__fila">
    <label class="campo">Ordenar por <select name="orden">${opciones([['puntuacion', 'Puntuación'], ['precio', 'Precio'], ['distancia', 'Distancia'], ['novedad', 'Novedad']], f.orden)}</select></label>
  </div>
</form>`;
}

export function vistaEscapadas(e, params) {
  return `<h1 class="titulo-vista" tabindex="-1">Escapadas</h1>
${formularioEscapadas(e, params, 'escapadas')}
<div id="resultados">${resultadosEscapadas(e, params)}</div>`;
}

export function resultadosEscapadas(e, params) {
  const f = leerFiltrosEscapadas(params);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, f, contextoBusqueda(e));
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? e.datos.origen.nombre });
  const acciones = `<a class="boton boton--suave" href="${crearHash('mapa', params)}">🗺️ Ver en el mapa</a>`;
  return `${resumenResultados(contar(ofertas.length, 'escapada'), acciones)}
${ofertas.length
    ? rejilla(ofertas, ctx, { mostradas: mostradas(e, 'escapadas'), clave: 'escapadas' })
    : estadoVacio('Ninguna escapada cumple estos filtros', 'Prueba a quitar alguna temática, ampliar la distancia o subir el precio máximo.', botonLimpiar('escapadas'))}`;
}

export function vistaMapa(e, params) {
  return `<h1 class="titulo-vista" tabindex="-1">Mapa</h1>
<details class="filtros-plegables"><summary>Filtros del mapa</summary>${formularioEscapadas(e, params, 'mapa')}</details>
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
    punto: f.punto ?? e.datos.origen,
    radioKm: radioBusquedaKm(f),
    desde: f.punto?.nombre ?? e.datos.origen.nombre,
  };
}

export function resultadosMapa(e, params, d = datosMapa(e, params)) {
  const sin = d.sinUbicacion ? ` (${contar(d.sinUbicacion, 'escapada')} sin ubicación no aparecen)` : '';
  const texto = `${contar(d.escapadas.length, 'escapada')} y ${contar(d.destinos.length, 'destino')} de vuelo en el mapa${sin}`;
  return resumenResultados(texto, `<a class="boton boton--suave" href="${crearHash('escapadas', params)}">Ver en lista</a>`);
}

// ── Calendario ───────────────────────────────────────────────────────────────

export function vistaCalendario(e) {
  const findes = findesProximos(12, e.ahora);
  const celdas = resumenCalendario(e.datos.ofertas, findes, e.datos.puentes).map(({ finde, puente, vuelo, vuelos, escapadas }, i) => {
    const cuando = i === 0 ? 'Este finde' : i === 1 ? 'El siguiente' : `En ${i} semanas`;
    const textoVuelo = vuelo
      ? `✈️ desde <strong>${euros(vuelo.precio)}</strong> · ${esc(vuelo.lugar?.nombre ?? '')}`
      : '✈️ <span class="suave">Sin vuelos con fecha</span>';
    return `<li><a class="finde-celda${puente ? ' finde-celda--puente' : ''}" href="${crearHash('vuelos', { finde: finde.id })}">
  <span class="finde-celda__cuando">${cuando}</span>
  <span class="finde-celda__fecha">${esc(finde.etiqueta)}</span>
  ${puente ? `<span class="insignia insignia--puente">🎉 ${esc(puente.nombre)}</span>` : ''}
  <span class="finde-celda__dato">${textoVuelo}${vuelos > 1 ? ` <span class="suave">(${vuelos})</span>` : ''}</span>
  <span class="finde-celda__dato">🏡 ${contar(escapadas, 'escapada')}</span>
</a></li>`;
  });
  return `<h1 class="titulo-vista" tabindex="-1">Calendario</h1>
<p class="seccion__intro">Los próximos 12 findes con el vuelo más barato y las escapadas disponibles (con fecha o flexibles). Los puentes van resaltados. Pulsa uno para ver sus vuelos.</p>
<ol class="calendario">${celdas.join('')}</ol>`;
}

// ── Vigilados ────────────────────────────────────────────────────────────────

const EJEMPLO_VIGILADOS = `{
  "vigilados": [
    { "nombre": "Oporto en avión", "texto": "oporto", "tipo": "vuelo", "precioMax": 60 },
    { "nombre": "Spa a menos de 2 h", "tema": "spa", "cocheMaxMin": 120, "precioMax": 70 },
    { "nombre": "Puentes cerca de casa", "cerca": { "lat": 41.39, "lon": 2.17, "radioKm": 300 }, "puente": true }
  ]
}`;

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
  return `<h1 class="titulo-vista" tabindex="-1">Vigilados</h1>
<p class="seccion__intro">Cuando una oferta cumple un criterio y su precio baja respecto al último aviso, te llega un email.</p>
${criterios.join('') || estadoVacio('Aún no vigilas nada', 'Añade criterios como se explica abajo.')}
<section class="ayuda-caja">
  <h2>Cómo añadir o cambiar vigilados</h2>
  <ol>
    <li>Abre ${enlace} y pulsa el lápiz (✏️) para editarlo.</li>
    <li>Añade un criterio a la lista. Solo <code>nombre</code> es obligatorio; una oferta coincide si cumple <strong>todos</strong> los demás campos que pongas.</li>
    <li>Guarda con «Commit changes». Se aplicará en la próxima revisión (cada 30 min).</li>
  </ol>
  <p>Campos: <code>texto</code>, <code>tipo</code> (vuelo, escapada, hotel, paquete), <code>tema</code> (${e.datos.temas.map((t) => `<code>${esc(t.id)}</code>`).join(', ')}), <code>fuente</code>, <code>aeropuerto</code>, <code>precioMax</code>, <code>cocheMaxMin</code>, <code>cerca</code> (<code>lat</code>, <code>lon</code>, <code>radioKm</code>) y <code>puente</code>.</p>
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
  <td data-etiqueta="Detalle">${detalle ? esc(detalle) : '<span class="suave">—</span>'}</td>
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
  const nuevas = params.nuevas === '1';
  const titulo = nuevas ? 'Novedades' : q ? `Resultados para «${esc(q)}»` : 'Buscar';
  return `<h1 class="titulo-vista" tabindex="-1">${titulo}</h1><div id="resultados">${resultadosBuscar(e, params)}</div>`;
}

export function resultadosBuscar(e, params) {
  const q = (params.q ?? '').trim();
  const nuevas = params.nuevas === '1';
  const lista = buscarTexto(e.datos.ofertas, { q, nuevas }, e.referencia);
  if (!lista.length) {
    return `${resumenResultados('0 ofertas')}${estadoVacio(nuevas ? 'No hay novedades desde tu última visita.' : `Nada coincide con «${esc(q)}».`, 'Prueba con otra palabra: un destino, una región, un tema…')}`;
  }
  return `${resumenResultados(contar(lista.length, 'oferta'))}${rejilla(lista, ctxTarjetas(e), { mostradas: mostradas(e, 'buscar'), clave: 'buscar' })}`;
}

export const VISTAS_HTML = {
  finde: { html: vistaFinde },
  vuelos: { html: vistaVuelos, resultados: resultadosVuelos },
  escapadas: { html: vistaEscapadas, resultados: resultadosEscapadas },
  mapa: { html: vistaMapa, resultados: resultadosMapa },
  calendario: { html: vistaCalendario },
  vigilados: { html: vistaVigilados },
  fuentes: { html: vistaFuentes },
  buscar: { html: vistaBuscar, resultados: resultadosBuscar },
};
