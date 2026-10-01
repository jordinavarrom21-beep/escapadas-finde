/**
 * HTML de cada vista. Las vistas con filtros separan el formulario (se pinta al
 * entrar) de los resultados (se repintan al cambiar un filtro, sin perder el foco).
 * La portada, las vistas de información y las piezas comunes van en vistas-*.js.
 */

import {
  contar, duracion, enumerar, escaparHtml as esc, euros, haceCuanto, urlSegura, ETIQUETAS_ALOJAMIENTO,
  ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE,
} from './formato.js';
import {
  ALOJAMIENTOS, ATAJOS_ESCAPADAS, ATAJOS_A_LA_VISTA, ORDENES_ACTIVIDADES, SIN_COCHE, ORDENES_ESCAPADAS, REGIMENES_ORDEN,
  buscarActividades, buscarEscapadas, buscarTexto, chollosDeVuelos, conFaltas, promocionesDeVuelos, crearHash, destinosDe,
  destinosDeVuelo, esActividad, esEscapada, filtrarVuelos, filtrosActivos, leerFiltrosActividades, zonasDe,
  leerFiltrosComunes, leerFiltrosEscapadas, leerFiltrosVuelos, radioBusquedaKm, viajeDeParams, tieneVuelo,
  valoresUnicos, vuelosParaMapa,
} from './filtros.js';
import {
  certeza, costeDe, textoAlojamiento, textoCaducidad, textoFechas, textoLugar, estadoVacio, rejilla,
  textoAyudaUbicacion,
} from './plantillas.js';
import { icono, iconoTema } from './iconos.js';
import {
  ETIQUETAS_ORDEN, FILTROS_MAS_VUELOS, FILTROS_SECUNDARIOS, bloqueBusquedas, bloqueExclusiones, botonLimpiar,
  campoTexto, contextoBusqueda, ctxTarjetas, etiquetaPuente, filtrosChollo, filtrosListas, interruptor,
  interruptorDefecto, marcado, misAeropuertos, mostradas, nombreSalida, numero, opciones, pestanas, puntoSalida,
  resumenResultados,
} from './vistas-comun.js';
import { vistaFinde } from './vistas-portada.js';
import { vistaAyuda, vistaCalendario, vistaFuentes, vistaMis, vistaPuentes, vistaVigilados } from './vistas-info.js';

// Lo que el resto de la web importa de aquí, esté donde esté.
export {
  contextoBusqueda, ctxTarjetas, formularioViaje, misAeropuertos, nombreSalida, ocultas, pestanas, puntoSalida,
  textoViaje, webConProblemas,
} from './vistas-comun.js';
export { buscadorFinde, contenidoSorpresa, paramsBuscadorFinde, vistaFinde } from './vistas-portada.js';
export {
  avisosDeBusquedas, resultadosDeBusqueda, totalNovedadesGuardadas, vistaAyuda, vistaCalendario, vistaFuentes,
  vistaMis, vistaPuentes, vistaVigilados,
} from './vistas-info.js';

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
    <label class="campo">Orden <select name="orden">${opciones([['precio', 'Precio'], ['puntuacion', 'Valor de la oferta'], ['hora', 'Hora de salida']], f.orden)}</select></label>
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
    <label class="campo">Orden <select name="orden">${opciones([['precio', 'Precio'], ['puntuacion', 'Valor de la oferta']], f.orden)}</select></label>
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
  const { resultado: [vuelos, chollos, promociones], aproximado } = conFaltas((g) => [
    filtrarVuelos(e.datos.ofertas, g, contexto), chollosDeVuelos(e.datos.ofertas, g, contexto), promocionesDeVuelos(e.datos.ofertas, g, contexto),
  ], f, (r) => r.every((lista) => !lista.length));
  const parecido = aproximado ? avisoAproximado(f.q) : '';
  if (!hayConFecha) {
    const resumen = `${contar(chollos.length, 'chollo')} de vuelos${promociones.length ? ` y ${contar(promociones.length, 'promoción', 'promociones')}` : ''}`;
    return `${filaActivos(e, 'vuelos', params)}${resumenResultados(resumen)}${parecido}
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
  return `${filaActivos(e, 'vuelos', params)}${resumenResultados(resumen)}${parecido}
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
  // «Familia» va en «¿Vas con niños?», que además distingue si los niños van gratis o con
  // descuento; aquí solo sale si ya venía marcada (enlaces antiguos), para poder quitarla.
  return e.datos.temas.filter((t) => t.id !== 'familia' || f.temas.includes(t.id)).map((t) => `<label class="chip chip--tema" style="--color-tema:var(--tema-${esc(t.id)})"><input type="checkbox" name="temas" value="${esc(t.id)}"${marcado(f.temas.includes(t.id))}> ${iconoTema(t.id)}${esc(t.nombre)}</label>`).join('');
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
    <button type="button" class="boton boton--suave boton-ubicacion" data-mi-ubicacion title="Usar mi ubicación" aria-label="Usar mi ubicación">${icono('ubicacion')}<span class="boton-ubicacion__texto">Mi ubicación</span></button>
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

/** «¿Con niños?»: da igual, planes para ir con niños, niños gratis o con descuento, o solo gratis. */
function campoNinos(f) {
  const opcion = (valor, texto) => `<label class="chip"><input type="radio" name="ninos" value="${valor}"${marcado(f.ninos === valor)}> ${texto}</label>`;
  return `<fieldset class="chips chips--desplazables"><legend>¿Vas con niños?</legend><div class="chips__lista">${opcion('', 'Da igual')}${opcion('apto', 'Para ir con niños')}${opcion('ventaja', 'Gratis o con descuento')}${opcion('gratis', 'Niños gratis')}</div></fieldset>`;
}

/** Cuántos filtros de «Más filtros» hay puestos (para su contador). */
// «En coche» se elige arriba, en «¿Cómo vas?»: no es un filtro de «Más filtros».
export const contarSecundarios = (params = {}) => FILTROS_SECUNDARIOS
  .filter((clave) => params[clave] && !(clave === 'transporte' && params[clave] === 'coche')).length;

/** Atajos de un clic: enlaces con su hash. */
function atajosEscapadas(vista) {
  const enlace = (a) => `<a class="chip chip--atajo" href="${esc(crearHash(vista, a.params))}">${icono(a.icono)}${esc(a.texto)}</a>`;
  const [vistos, mas] = [ATAJOS_ESCAPADAS.slice(0, ATAJOS_A_LA_VISTA), ATAJOS_ESCAPADAS.slice(ATAJOS_A_LA_VISTA)];
  // En varias filas y sin deslizar de lado: en una sola fila no se notaba que había más.
  return `<nav class="atajos" aria-label="Atajos de búsqueda"><div class="chips__lista">${vistos.map(enlace).join('')}
  ${mas.length ? `<details class="atajos__mas"><summary class="chip chip--atajo chip--mas">${icono('nuevo')}Más ideas (${mas.length})</summary><div class="chips__lista">${mas.map(enlace).join('')}</div></details>` : ''}</div></nav>`;
}

/** Icono de cada filtro puesto (por su clave; las temáticas, el de la suya). */
const ICONOS_FILTRO = {
  notemas: 'prohibido', nodest: 'prohibido', cuando: 'calendario', finde: 'calendario', desde: 'calendario', hasta: 'calendario',
  lugar: 'pin', h: 'coche', km: 'regla', pres: 'cartera', max: 'cartera', nota: 'estrella', clasica: 'cama', sincoche: 'tren',
  dest: 'pin', aero: 'avion', ideal: 'reloj', mios: 'despegue', nuevas: 'nuevo', fav: 'corazon', cho: 'fuego', baja: 'bajada',
  cerradas: 'calendario', gratis: 'actividades', ninos: 'tema-familia', cru: 'crucero', q: 'buscar', aloj: 'cama', est: 'estrella', regimen: 'cubiertos', transporte: 'coche',
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
    <div class="filtros__fila filtros__fila--fechas">
      <label class="campo">Un día concreto <input type="date" name="dia" value="${esc(unDia ? f.desde : '')}"></label>
      <label class="campo">O entre el <input type="date" name="desde" value="${esc(unDia ? '' : f.desde)}"></label>
      <label class="campo">y el <input type="date" name="hasta" value="${esc(unDia ? '' : f.hasta)}"></label>
      ${interruptor('cerradas', 'Solo con fechas cerradas', f.soloCerradas)}
    </div>
    <p class="ayuda">Las ofertas con <strong>fechas cerradas</strong> dicen el día exacto («vie 16 – dom 18 oct»). Las de <strong>fechas flexibles</strong> se pueden usar cualquier día hasta que caducan: salen en todas las fechas, pero la disponibilidad exacta la confirma la web del anunciante (el botón de la oferta la abre).</p>
  </fieldset>
  <fieldset class="bloque"><legend class="bloque__titulo">¿Qué te apetece?</legend>
    <div class="chips chips--desplazables"><div class="chips__lista">${chipsTemas(e, f)}</div></div>
    ${campoNinos(f)}
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
      <label class="campo">Categoría mín. <select name="est">${opciones([[2, '2★ o más'], [3, '3★ o más'], [4, '4★ o más'], [5, '5★']], f.estrellas, 'Cualquiera')}</select></label>
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

/** Los órdenes más usados, a un toque encima de los resultados (el resto, en «Ordenar por»). */
const ORDEN_RAPIDO = [
  ['puntuacion', 'Recomendadas'], ['noche', 'Más baratas por noche'], ['total', 'Viaje más barato'],
  ['comodo', 'Más cerca'], ['valoracion', 'Mejor valoradas'], ['ahorro', 'Más rebajadas'],
];

function ordenRapido(vista, params, actual) {
  const enlaces = ORDEN_RAPIDO.map(([orden, texto]) => {
    const href = crearHash(vista, { ...params, orden: orden === 'puntuacion' ? '' : orden });
    return orden === actual
      ? `<a class="chip chip--elegido" aria-current="true" href="${href}">${esc(texto)}</a>`
      : `<a class="chip" href="${href}">${esc(texto)}</a>`;
  }).join('');
  return `<nav class="orden-rapido chips--desplazables-lista" aria-label="Ordenar">${enlaces}</nav>`;
}

/** Por qué salen en este orden: qué se suma, desde dónde, para cuántos y qué va al final. */
function explicacionOrden(e, f, costes) {
  // El coste y la comodidad son desde tu salida; la distancia, desde «Cerca de…» si lo hay.
  const desde = nombreSalida(e);
  const cerca = f.punto?.nombre ?? desde;
  const para = `${contar(e.viaje?.viajeros ?? 2, 'persona')} y ${contar(e.viaje?.noches ?? 2, 'noche')} si la oferta no las fija`;
  const sinTotal = [...costes.values()].filter((c) => c.total == null).length;
  const textos = {
    total: `Ordenadas por lo que cuesta el viaje completo desde ${desde} para ${para}: la oferta y, si vas en coche, la gasolina estimada (sin peajes ni aparcamiento).`,
    persona: `Ordenadas por lo que cuesta el viaje completo por persona desde ${desde} (${para}): la oferta y, si vas en coche, la gasolina estimada.`,
    calidad: `Primero lo que más nota (sobre 10) da por cada euro por persona del viaje completo desde ${desde}. Sin nota o sin total, al final.`,
    comodo: `Primero lo que está a menos tiempo de ${desde}; a igualdad, lo que incluye más (régimen) y lo mejor valorado. Lo que no tiene tiempo de viaje conocido (islas, avión), al final.`,
    distancia: `Primero lo que está a menos tiempo en coche de ${cerca}; lo que no se puede ir en coche (islas), al final.`,
    alojamiento: 'Agrupadas por tipo de alojamiento (hotel, casa rural, apartamento…) y, dentro de cada uno, por valor de la oferta.',
  };
  if (!textos[f.orden]) return '';
  const alFinal = sinTotal ? ` ${contar(sinTotal, 'oferta')} sin datos suficientes para un total van al final.` : '';
  return `<p class="seccion__intro explicacion-orden">${esc(textos[f.orden])}${esc(alFinal)} <button type="button" class="enlace-boton" data-mi-viaje>Cambiar salida, viajeros o noches</button></p>`;
}

export function resultadosEscapadas(e, params) {
  const f = leerFiltrosEscapadas(params);
  const { resultado, aproximado } = conFaltas((g) => buscarEscapadas(e.datos.ofertas, g, contextoBusqueda(e)), f);
  const { ofertas, distancias, costes, sinTotal } = resultado;
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e) });
  // En el móvil el «Mapa» ya está en la pastilla flotante: aquí sobra.
  const acciones = `<a class="boton boton--suave solo-ancho-flex" href="${crearHash('mapa', params)}">${icono('mapa')}Ver en el mapa</a>`;
  return `${filaActivos(e, 'escapadas', params)}${resumenResultados(contar(ofertas.length, 'escapada'), acciones)}${aproximado ? avisoAproximado(f.q) : ''}
${ordenRapido('escapadas', params, f.orden)}${explicacionOrden(e, f, costes)}${f.presupuesto ? `<p class="seccion__intro">Presupuesto: viaje completo (oferta y gasolina estimada) de hasta ${esc(euros(f.presupuesto))} ${f.presupuestoPor === 'persona' ? 'por persona' : 'en total'} para ${esc(contar(e.viaje?.viajeros ?? 2, 'persona'))}.${sinTotal ? ` ${esc(contar(sinTotal, 'oferta'))} sin datos suficientes para un total no se pueden comprobar y no salen.` : ''}</p>` : ''}
${ofertas.length
    ? rejilla(ofertas, ctx, { mostradas: mostradas(e, 'escapadas'), clave: 'escapadas' })
    : estadoVacio('Ninguna escapada cumple estos filtros', 'Prueba a quitar alguna temática, ampliar la distancia o subir el precio máximo.', botonLimpiar('escapadas'))}`;
}

// ── Actividades ──────────────────────────────────────────────────────────────

const ETIQUETAS_ORDEN_ACTIVIDADES = { puntuacion: 'Valor de la oferta', precio: 'Precio', valoracion: 'Mejor valoradas' };

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
  ${campoNinos(f)}
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
  const { resultado: lista, aproximado } = conFaltas((g) => buscarActividades(e.datos.ofertas, g, contextoBusqueda(e)), f);
  const gratis = lista.filter((o) => o.precio === 0).length;
  const resumen = `${contar(lista.length, 'plan', 'planes')}${gratis ? ` · ${gratis} ${gratis === 1 ? 'gratis' : 'gratis'}` : ''}`;
  return `${filaActivos(e, 'actividades', params)}${resumenResultados(resumen)}${aproximado ? avisoAproximado(f.q) : ''}
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

// ── Búsqueda global ──────────────────────────────────────────────────────────

/** Sin nada exacto para lo escrito, se enseña lo más parecido (una falta, una letra de más…) y se dice. */
function avisoAproximado(q) {
  return `<p class="aviso-memoria" role="status">${icono('buscar')}Nada coincide exactamente con «${esc(q)}»: te enseñamos lo más parecido.</p>`;
}

export function vistaBuscar(e, params) {
  const q = (params.q ?? '').trim();
  const titulo = params.nuevas === '1' ? 'Novedades' : q ? `Resultados para «${esc(q)}»` : 'Buscar';
  return `${pestanas('explorar', null)}<h1 class="titulo-vista" tabindex="-1">${titulo}</h1><div id="resultados">${resultadosBuscar(e, params)}</div>`;
}

export function resultadosBuscar(e, params) {
  const f = leerFiltrosComunes(params);
  const { resultado: lista, aproximado } = conFaltas((g) => buscarTexto(e.datos.ofertas, g, contextoBusqueda(e)), f);
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
  return `${resumenResultados(contar(lista.length, 'oferta'))}${aproximado ? avisoAproximado(f.q) : ''}${seguir}${rejilla(lista, ctxTarjetas(e), { mostradas: mostradas(e, 'buscar'), clave: 'buscar' })}`;
}

// ── Comparar ─────────────────────────────────────────────────────────────────

/** Ids de la comparación: los de la URL (enlace compartido) o los elegidos en este navegador. */
export const idsComparar = (e, params = {}) => (params.ids ? params.ids.split(',').filter(Boolean).slice(0, 3) : [...(e.comparar ?? [])]);

export function vistaComparar(e, params = {}) {
  const ofertas = idsComparar(e, params).map((id) => e.porId.get(id)).filter(Boolean);
  const titulo = `${pestanas('mis', 'comparar', e)}<h1 class="titulo-vista" tabindex="-1">Comparar lado a lado</h1>`;
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
    fila('Alojamiento', ofertas.map((o) => esc([textoAlojamiento(o), (o.etiquetas ?? []).includes('solo-adultos') && 'solo adultos'].filter(Boolean).join(' · ')))),
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
  ayuda: { html: vistaAyuda },
  buscar: { html: vistaBuscar, resultados: resultadosBuscar },
  comparar: { html: vistaComparar },
  mis: { html: vistaMis },
};
