/**
 * HTML de cada vista. Las vistas con filtros separan el formulario (se pinta al
 * entrar) de los resultados (se repintan al cambiar un filtro, sin perder el foco).
 * La portada, las vistas de información y las piezas comunes van en vistas-*.js.
 */

import {
  contar, duracion, enumerar, escaparHtml as esc, euros, haceCuanto, urlSegura, ETIQUETAS_ALOJAMIENTO, TIPOS_EVENTO,
  ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE,
} from './formato.js?v=hosting-465dd02d9e68';
import { etiquetaDia } from './fechas.js?v=hosting-465dd02d9e68';
import {
  ALOJAMIENTOS, ATAJOS_ESCAPADAS, ATAJOS_A_LA_VISTA, ORDENES_ACTIVIDADES, SIN_COCHE, ORDENES_ESCAPADAS, REGIMENES_ORDEN,
  buscarActividades, buscarEscapadas, buscarTexto, chollosDeVuelos, conFaltas, promocionesDeVuelos, crearHash, destinosDe, transporteSuelto,
  contenidoMapa, esActividad, esEscapada, filtrarVuelos, filtrosActivos, leerFiltrosActividades, zonasDe,
  leerFiltrosComunes, leerFiltrosEscapadas, leerFiltrosVuelos, radioBusquedaKm, viajeDeParams, tieneVuelo,
  valoresUnicos, KM_CERCA_DE_LO_BUSCADO, lugarDeConsulta, encajeEnRango, periodoPasado, rangoDe,
} from './filtros.js?v=hosting-465dd02d9e68';
import {
  certeza, costeDe, textoAlojamiento, textoCaducidad, textoFechas, textoLugar, estadoVacio, rejilla,
  textoAyudaUbicacion,
} from './plantillas.js?v=hosting-465dd02d9e68';
import { icono, iconoTema } from './iconos.js?v=hosting-465dd02d9e68';
import {
  ETIQUETAS_ORDEN, FILTROS_MAS_VUELOS, FILTROS_SECUNDARIOS, bloqueBusquedas, bloqueExclusiones, botonLimpiar,
  campoTexto, conmutadorListaMapa, contextoBusqueda, ctxTarjetas, barraFechas, filtrosChollo, filtrosListas, interruptor,
  interruptorDefecto, marcado, misAeropuertos, mostradas, nombreSalida, numero, ofertasDe, opciones, pestanas, puntoSalida,
  resumenResultados, avisoSinConfirmar, diasExplicitos, fechasElegidas,
} from './vistas-comun.js?v=hosting-465dd02d9e68';
import { eventosCerca, filaEvento, vistaFinde } from './vistas-portada.js?v=hosting-465dd02d9e68';
import { vistaAyuda, vistaCalendario, vistaFuentes, vistaMis, vistaPuentes, vistaVigilados } from './vistas-info.js?v=hosting-465dd02d9e68';

// Lo que el resto de la web importa de aquí, esté donde esté.
export {
  contextoBusqueda, ctxTarjetas, formularioViaje, misAeropuertos, nombreSalida, ocultas, pestanas, puntoSalida,
  estadoWebs, textoViaje, webConProblemas,
} from './vistas-comun.js?v=hosting-465dd02d9e68';
export { atajosPortada, buscadorFinde, contenidoSorpresa, destinoOrganizar, diasDeFechas, eventosCerca, ideasPortada, paramsBuscadorFinde, periodoDeOpcion, resumenViaje, textoEnviar, vistaFinde } from './vistas-portada.js?v=hosting-465dd02d9e68';
export {
  avisosDeBusquedas, resultadosDeBusqueda, totalNovedadesGuardadas, vistaAyuda, vistaCalendario, vistaFuentes,
  vistaMis, vistaPuentes, vistaVigilados,
} from './vistas-info.js?v=hosting-465dd02d9e68';

/** Con un finde o un puente que ya pasó en la URL no hay nada que enseñar: se dice y se ofrece cambiarlo. */
const vacioPeriodoPasado = (vista) => estadoVacio('Ese finde o puente ya pasó', 'Elige otras fechas arriba o quítalas para ver todo.', botonLimpiar(vista));

// ── Vuelos ───────────────────────────────────────────────────────────────────

export function vistaVuelos(e, params) {
  const f = leerFiltrosVuelos(params);
  const vuelos = e.datos.ofertas.filter((o) => o.tipo === 'vuelo');
  const paises = valoresUnicos(vuelos, (o) => o.lugar?.pais);
  const abiertos = FILTROS_MAS_VUELOS.some((clave) => params[clave]);
  // Sin vuelos con día y hora (ahora no hay ninguna fuente que los dé), la pestaña es lo que
  // hay de verdad: chollos de blogs y comunidades, sin los filtros de finde, aeropuerto y horario.
  if (!e.datos.ofertas.some(tieneVuelo)) return vistaChollosVuelos(e, params, f, paises);
  return `${pestanas('explorar', 'vuelos')}<h1 class="titulo-vista" tabindex="-1">Vuelos y trenes</h1>
${avisoMemoria(e, 'vuelos')}${avisoViajeCompartido(e, params)}
${barraDeVista(e, 'vuelos', params)}
${plegableMovil(e, 'vuelos', params)}<form class="filtros" id="filtros-vuelos" data-filtros="vuelos" aria-label="Filtros de vuelos">
  <div class="filtros__fila">
    ${campoTexto(f, 'vuelos')}
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
<p class="seccion__intro">Vuelos baratos que publican blogs y comunidades, con <strong>fechas flexibles</strong>: el precio es el mínimo para unos días que no dicen, así que revisa en cada oferta cuándo hay plazas y desde qué aeropuerto sale. </p>
<div class="explorar">
<div class="explorar__filtros">${plegableMovil(e, 'vuelos', params)}<form class="filtros" data-filtros="vuelos" aria-label="Filtros de chollos de vuelos">
  <div class="filtros__fila">${campoTexto(f, 'vuelos')}</div>
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

/**
 * Un apartado secundario plegado («Billetes sin fecha», «Promociones», «Tren, bus y ferry»),
 * con cuántos hay a la vista: lo primero son los vuelos de las fechas elegidas.
 */
function apartadoPlegado(titulo, cuantos, intro, contenido, { abierto = false, ic = '' } = {}) {
  return `<details class="seccion seccion-plegable"${abierto ? ' open' : ''}>
  <summary><h2>${ic ? icono(ic) : ''}${titulo}</h2><span class="contador">${esc(String(cuantos))}</span></summary>
  ${intro ? `<p class="seccion__intro">${intro}</p>` : ''}${contenido}
</details>`;
}

/** Tren, bus y ferry: billetes sueltos que antes salían como escapadas. */
function apartadoTransporte(e, f, ctx, contexto, abierto = false, base = e.datos.ofertas) {
  const lista = transporteSuelto(base, f, contexto);
  if (!lista.length) return '';
  return apartadoPlegado('Tren, bus y ferry', lista.length,
    'Billetes y promociones de tren, autobús y barco desde tu zona: solo el viaje, sin alojamiento.',
    rejilla(lista, ctx, { mostradas: mostradas(e, 'transporte'), clave: 'transporte' }), { abierto, ic: 'tren' });
}

/**
 * En Vuelos, cada atajo de fechas dice cuántos vuelos hay y desde cuánto («12 · desde 48 €»):
 * los mismos que cuenta el Calendario y salen al elegirlo (dentro y alrededor de esas fechas).
 * Antes iba aparte («¿Para cuándo?»), repitiendo los findes de los filtros.
 */
function cifrasVuelos(e, params) {
  const contexto = contextoBusqueda(e);
  const cifras = new Map();
  for (const p of [...e.findes.slice(0, 2), ...e.datos.puentes]) {
    const lista = filtrarVuelos(ofertasDe(e, params), { ...leerFiltrosVuelos({ ...params, finde: p.id, desde: '', hasta: '' }), orden: 'precio' }, contexto);
    if (lista.length) cifras.set(p.id, `${lista.length} · desde ${euros(lista[0].precio)}`);
  }
  return cifras;
}

const AYUDA_FECHAS = {
  escapadas: 'Las de <strong>fechas cerradas</strong> salen si caben en tus fechas; las de <strong>fechas flexibles</strong> valen cualquier día hasta que caducan y la disponibilidad la confirma su web.',
  mapa: 'Las de <strong>fechas cerradas</strong> salen si caben en tus fechas; las de <strong>fechas flexibles</strong> valen cualquier día hasta que caducan.',
  vuelos: 'Salen los vuelos que van y vuelven dentro de esos días; los que se salen un poco, aparte. Los billetes sin fecha concreta no dependen de esto.',
  actividades: 'Las entradas y visitas casi nunca dicen qué días hay plazas: salen las que siguen a la venta esos días (la disponibilidad exacta, en su web). Las que tienen fecha concreta, solo ese día.',
  buscar: 'Las ofertas con fecha concreta salen si caben en tus fechas; las flexibles, si no caducan antes.',
};

/** La barra «¿Cuándo?» de cada vista (app.js la repinta al cambiar los filtros). */
export function barraDeVista(e, vista, params) {
  const cifras = vista === 'vuelos' && e.datos.ofertas.some(tieneVuelo) ? cifrasVuelos(e, params) : undefined;
  return barraFechas(e, vista, params, { cifras, ayuda: AYUDA_FECHAS[vista] ?? '' });
}

export function resultadosVuelos(e, params) {
  const f = leerFiltrosVuelos(params);
  const contexto = contextoBusqueda(e);
  const rango = rangoDe(f.finde, contexto);
  const ctx = ctxTarjetas(e, { rango });
  const hayConFecha = e.datos.ofertas.some(tieneVuelo);
  const base = ofertasDe(e, params);
  const { resultado: [vuelos, chollos, promociones], aproximado } = conFaltas((g) => [
    filtrarVuelos(base, g, contexto), chollosDeVuelos(base, g, contexto), promocionesDeVuelos(base, g, contexto),
  ], f, (r) => r.every((lista) => !lista.length));
  const parecido = `${aproximado ? avisoAproximado(f.q) : ''}${avisoSinConfirmar(e, 'vuelos', params, (lista) => filtrarVuelos(lista, f, contexto).length + chollosDeVuelos(lista, f, contexto).length)}`;
  if (!hayConFecha) {
    const resumen = `${contar(chollos.length, 'chollo')} de vuelos${promociones.length ? ` y ${contar(promociones.length, 'promoción', 'promociones')}` : ''}`;
    return `${filaActivos(e, 'vuelos', params)}${resumenResultados(resumen)}${parecido}
${chollos.length ? rejilla(chollos, ctx, { mostradas: mostradas(e, 'chollos'), clave: 'chollos' }) : estadoVacio('Ningún chollo de vuelos cumple estos filtros.', f.mios ? `Prueba a quitar «Solo desde ${esc(listaAeropuertos(e))}».` : 'Prueba a quitar algún filtro.', botonLimpiar('vuelos'))}
${promociones.length ? `<section class="seccion">
  <div class="seccion__cabeza"><h2>Promociones y descuentos de aerolíneas</h2></div>
  <p class="seccion__intro">Códigos, rebajas y selecciones de «muchos destinos»: no son un billete, sino una forma de pagar menos en la web de la aerolínea.</p>
  ${rejilla(promociones, ctx, { mostradas: mostradas(e, 'promociones'), clave: 'promociones' })}
</section>` : ''}
${apartadoTransporte(e, f, ctx, contexto, false, base)}`;
  }
  // Con un finde o un puente elegido: primero los que salen y vuelven dentro de esos días;
  // aparte, los que se solapan (salen antes o vuelven después), diciendo en qué.
  const dentro = rango ? vuelos.filter((o) => encajeEnRango(o, rango)?.cabe !== false) : vuelos;
  const alrededor = rango ? vuelos.filter((o) => encajeEnRango(o, rango)?.cabe === false) : [];
  const dias = rango ? `${etiquetaDia(rango.inicio)} – ${etiquetaDia(rango.fin)}` : '';
  const conFecha = `${rango ? `<p class="seccion__intro">Salen y vuelven entre el <strong>${esc(dias)}</strong>${rango.tipo === 'puente' ? ' (el primer día es el último laborable, para salir por la tarde)' : ''}.</p>` : ''}${dentro.length
    ? rejilla(dentro, ctx, { mostradas: mostradas(e, 'vuelos'), clave: 'vuelos' })
    : periodoPasado(f.finde, contexto) ? vacioPeriodoPasado('vuelos')
      : estadoVacio(rango ? `Ningún vuelo sale y vuelve entre el ${esc(dias)}` : 'Ningún vuelo cumple estos filtros',
      rango && alrededor.length ? 'Abajo tienes los que salen un poco antes o vuelven un poco después.' : 'Prueba con otro finde, otro aeropuerto o un precio máximo más alto.', botonLimpiar('vuelos'))}${alrededor.length ? `
<section class="seccion">
  <div class="seccion__cabeza"><h2>Alrededor de esas fechas</h2><span class="contador">${esc(contar(alrededor.length, 'vuelo'))}</span></div>
  <p class="seccion__intro">No caben enteros en el ${esc(dias)}: cada uno dice si sale antes o vuelve después.</p>
  ${rejilla(alrededor, ctx, { mostradas: mostradas(e, 'vuelos-alrededor'), clave: 'vuelos-alrededor' })}
</section>` : ''}`;
  const resumen = `${contar(dentro.length, 'vuelo')} con fecha${alrededor.length ? ` (y ${alrededor.length} alrededor)` : ''}`;
  return `${filaActivos(e, 'vuelos', params)}${resumenResultados(resumen)}${parecido}
<h2 class="subtitulo">Vuelos con fecha y hora</h2>${conFecha}
${apartadoPlegado('Billetes sin fecha concreta', chollos.length,
    'De blogs y comunidades. El precio es el mínimo para unas fechas que no dicen: revisa en cada oferta qué días hay plazas y desde qué aeropuerto sale. Aquí no se aplican el finde ni el horario.',
    chollos.length ? rejilla(chollos, ctx, { mostradas: mostradas(e, 'chollos'), clave: 'chollos' }) : estadoVacio('No hay billetes sin fecha con estos filtros.', f.mios ? `Prueba a quitar «Solo desde ${esc(listaAeropuertos(e))}».` : ''))}
${promociones.length ? apartadoPlegado('Promociones de aerolíneas', promociones.length,
    'Códigos, rebajas y selecciones de «muchos destinos»: no son un billete, sino una forma de pagar menos en la web de la aerolínea.',
    rejilla(promociones, ctx, { mostradas: mostradas(e, 'promociones'), clave: 'promociones' })) : ''}
${apartadoTransporte(e, f, ctx, contexto, false, base)}`;
}

// ── Escapadas y mapa ─────────────────────────────────────────────────────────

/** Temáticas que son del alojamiento: en Planes no filtran nada (un museo no admite mascotas ni tiene spa). */
const TEMAS_DE_ALOJAMIENTO = ['mascotas', 'singular', 'spa'];

function chipsTemas(e, f, { sinAlojamiento = false } = {}) {
  // «Familia» va en «¿Vas con niños?», que además distingue si los niños van gratis o con
  // descuento; aquí solo sale si ya venía marcada (enlaces antiguos), para poder quitarla.
  const fuera = (t) => (t.id === 'familia' || (sinAlojamiento && TEMAS_DE_ALOJAMIENTO.includes(t.id))) && !f.temas.includes(t.id);
  return e.datos.temas.filter((t) => !fuera(t)).map((t) => `<label class="chip chip--tema" style="--color-tema:var(--tema-${esc(t.id)})"><input type="checkbox" name="temas" value="${esc(t.id)}"${marcado(f.temas.includes(t.id))}> ${iconoTema(t.id)}${esc(t.nombre)}</label>`).join('');
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
  return `<fieldset class="chips"><legend class="bloque__titulo">¿Cómo vas?</legend><div class="chips__lista">${opcion('', 'Da igual')}${opcion('coche', 'En coche')}${opcion('sincoche', 'Sin coche')}</div></fieldset>`;
}

/** «¿Con niños?»: da igual, planes para ir con niños, niños gratis o con descuento, o solo gratis. */
function campoNinos(f) {
  const opcion = (valor, texto) => `<label class="chip"><input type="radio" name="ninos" value="${valor}"${marcado(f.ninos === valor)}> ${texto}</label>`;
  return `<fieldset class="chips chips--desplazables"><legend>¿Vas con niños?</legend><div class="chips__lista">${opcion('', 'Da igual')}${opcion('apto', 'Para ir con niños')}${opcion('ventaja', 'Gratis o con descuento')}${opcion('gratis', 'Niños gratis')}</div></fieldset>`;
}

/** Conciertos, fiestas, ferias… a menos de 25 km esos días. */
function campoEventos(f) {
  const opcion = (valor, texto) => `<label class="chip"><input type="radio" name="evtipo" value="${valor}"${marcado(f.evento === valor)}> ${texto}</label>`;
  const tipos = ['musica', 'fiestas', 'festivales', 'ferias', 'escena', 'familia'].map((t) => opcion(t, TIPOS_EVENTO[t][1]));
  return `<fieldset class="chips chips--desplazables"><legend>¿Algo que hacer cerca esos días?</legend><div class="chips__lista">${opcion('', 'Da igual')}${opcion('todos', 'Cualquier evento')}${tipos.join('')}</div></fieldset>`;
}

/** Cuántos filtros de «Más filtros» hay puestos (para su contador). */
// «En coche» se elige arriba, en «¿Cómo vas?»: no es un filtro de «Más filtros».
export const contarSecundarios = (params = {}) => FILTROS_SECUNDARIOS
  .filter((clave) => params[clave] && !(clave === 'transporte' && params[clave] === 'coche')).length;

/** Cuántos atajos se ven en el móvil sin abrir «Más ideas». */
const ATAJOS_A_LA_VISTA_MOVIL = 3;

/**
 * Atajos de un clic: enlaces con su hash. Conservan las fechas elegidas (antes «Spa» las
 * quitaba y había que volver a elegirlas).
 */
export function atajosEscapadas(vista, params = {}) {
  const fechas = Object.fromEntries(['cuando', 'desde', 'hasta'].filter((clave) => params[clave]).map((clave) => [clave, params[clave]]));
  const enlace = (a, clase = '') => `<a class="chip chip--atajo${clase}" href="${esc(crearHash(vista, { ...fechas, ...a.params }))}">${icono(a.icono)}${esc(a.texto)}</a>`;
  const [vistos, mas] = [ATAJOS_ESCAPADAS.slice(0, ATAJOS_A_LA_VISTA), ATAJOS_ESCAPADAS.slice(ATAJOS_A_LA_VISTA)];
  // En el móvil, solo los primeros a la vista (los demás, en «Más ideas»): con todos, la lista
  // empezaba fuera de la primera pantalla. En varias filas y sin deslizar de lado.
  const enMovil = vistos.slice(ATAJOS_A_LA_VISTA_MOVIL);
  const cuenta = enMovil.length ? `<span class="solo-ancho">${mas.length}</span><span class="solo-estrecho">${mas.length + enMovil.length}</span>` : mas.length;
  return `<nav class="atajos" aria-label="Atajos de búsqueda"><div class="chips__lista">${vistos.map((a, i) => enlace(a, i >= ATAJOS_A_LA_VISTA_MOVIL ? ' solo-ancho-flex' : '')).join('')}
  ${mas.length || enMovil.length ? `<details class="atajos__mas"><summary class="chip chip--atajo chip--mas">${icono('nuevo')}<span>Más ideas (${cuenta})</span></summary><div class="chips__lista">${enMovil.map((a) => enlace(a, ' solo-estrecho-flex')).join('')}${mas.map((a) => enlace(a)).join('')}</div></details>` : ''}</div></nav>`;
}

/** Icono de cada filtro puesto (por su clave; las temáticas, el de la suya). */
const ICONOS_FILTRO = {
  notemas: 'prohibido', nodest: 'prohibido', cuando: 'calendario', finde: 'calendario', desde: 'calendario', hasta: 'calendario',
  lugar: 'pin', h: 'coche', km: 'regla', pres: 'cartera', max: 'cartera', nota: 'estrella', clasica: 'cama', noches: 'cama', sincoche: 'tren',
  dest: 'pin', aero: 'avion', ideal: 'reloj', mios: 'despegue', nuevas: 'nuevo', fav: 'corazon', cho: 'fuego', baja: 'bajada',
  cerradas: 'calendario', gratis: 'actividades', ninos: 'tema-familia', cru: 'crucero', q: 'buscar', aloj: 'cama', est: 'estrella', regimen: 'cubiertos', transporte: 'coche',
};
const iconoFiltro = (c) => (c.clave === 'temas' ? iconoTema(c.valor) : icono(ICONOS_FILTRO[c.clave] ?? ''));

/**
 * «Lo que tienes puesto»: un chip por filtro con su ✕ (un enlace a la misma búsqueda
 * sin él) y «Quitar todos». Va con los resultados para seguir al día al cambiar filtros.
 */
/** Fechas que ya enseña (y deja cambiar o quitar) la franja del periodo: no se repiten como chip. */
const CLAVES_PERIODO = ['cuando', 'finde', 'desde', 'hasta'];

function filaActivos(e, vista, params) {
  const conFranja = ['escapadas', 'vuelos', 'actividades', 'mapa'].includes(vista);
  const chips = filtrosActivos(vista, params, {
    temas: e.temas, fuentes: e.fuentes, findes: e.findes, puentes: e.datos.puentes, hoy: e.hoy,
  }).filter((c) => !conFranja || !CLAVES_PERIODO.includes(c.clave));
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
  // Las fechas no cuentan: se eligen fuera, en la barra «¿Cuándo?».
  const n = filtrosActivos(vista, params, { temas: e.temas, fuentes: e.fuentes, findes: e.findes, puentes: e.datos.puentes })
    .filter((c) => !CLAVES_PERIODO.includes(c.clave)).length;
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
  // Las fechas se eligen en la barra «¿Cuándo?» de arriba (sus campos son de este formulario)
  // y el orden encima de los resultados: aquí estaban repetidos.
  return `<form class="filtros" id="filtros-${vista}" data-filtros="${vista}" aria-label="Filtros de escapadas">
  <input type="hidden" name="orden" value="${f.orden === 'puntuacion' ? '' : esc(f.orden)}">
  <div class="filtros__fila">${campoTexto(f, 'escapadas')}</div>
  <fieldset class="bloque"><legend class="bloque__titulo">¿Qué te apetece?</legend>
    <div class="chips chips--desplazables"><div class="chips__lista">${chipsTemas(e, f)}</div></div>
  </fieldset>
  <div class="bloque"><h2 class="bloque__titulo">¿Dónde?</h2>${campoUbicacion(e, f)}</div>
  <div class="bloque">${campoComo(f)}</div>
  <fieldset class="bloque"><legend class="bloque__titulo">¿Cuánto?</legend>
    ${campoPrecio(f)}
  </fieldset>
  <details class="filtros__mas filtros__mas--panel"${f.ninos || f.evento || f.noches ? ' open' : ''}>
    <summary>Más filtros <span class="contador" data-contador-mas>${secundarios ? `(${contar(secundarios, 'puesto')})` : ''}</span></summary>
    <div class="grupo"><h3 class="grupo__titulo">Con niños, planes cerca y noches</h3>
      ${campoNinos(f)}
      ${campoEventos(f)}
      <div class="filtros__fila">
        <label class="campo">Noches que incluye la oferta <select name="noches">${opciones([[1, '1 noche'], [2, '2 noches (escapada clásica)'], [3, '3 o más']], f.noches, 'Cualquiera')}</select></label>
      </div>
    </div>
    <div class="grupo"><h3 class="grupo__titulo">Precio y chollos</h3><div class="filtros__fila">
      ${numero('pnMin', '€ por persona y noche, mín.', f.nocheMin, ' step="5" placeholder="Sin mínimo"')}
      ${filtrosChollo(f)}
    </div></div>
    <div class="grupo"><h3 class="grupo__titulo">Viaje y alojamiento</h3><div class="filtros__fila">
      <label class="campo">Distancia máx. (km) <input type="number" name="km" min="1" step="10" inputmode="numeric" placeholder="Sin límite" value="${f.km ?? ''}"></label>
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
    <div class="grupo"><h3 class="grupo__titulo">Fechas de las ofertas</h3><div class="filtros__fila">
      ${interruptor('cerradas', 'Solo con fechas cerradas (dicen el día exacto)', f.soloCerradas)}
      ${interruptor('encaje', 'Las de fechas cerradas, solo si caben enteras en el finde o puente elegido', f.soloEncajan)}
    </div></div>
    <div class="grupo"><h3 class="grupo__titulo">Mis listas</h3><div class="filtros__fila">${filtrosListas(f)}</div></div>
    <div class="filtros__acciones">
      <a class="boton boton--suave" href="#/${vista}" data-olvidar-filtros>${icono('deshacer')}Quitar todos los filtros</a>
      <button type="button" class="boton boton--primario filtros__ver" data-cerrar-mas>Ver los resultados</button>
    </div>
  </details>
  ${bloqueExclusiones(e, f, escapadas)}
  ${bloqueBusquedas(e, vista)}
</form>`;
}

export function vistaEscapadas(e, params) {
  return `${pestanas('explorar', 'escapadas')}<h1 class="titulo-vista" tabindex="-1">Escapadas</h1>
${avisoMemoria(e, 'escapadas')}${avisoViajeCompartido(e, params)}
${barraDeVista(e, 'escapadas', params)}
${atajosEscapadas('escapadas', params)}
<div class="explorar">
  <div class="explorar__filtros">${plegableMovil(e, 'escapadas', params)}${formularioEscapadas(e, params, 'escapadas')}</details></div>
  <div id="resultados" class="explorar__resultados">${resultadosEscapadas(e, params)}</div>
</div>`;
}

/** Los órdenes más usados, a un toque encima de los resultados (el resto, en «Ordenar por»). */
const ORDEN_RAPIDO = [
  ['puntuacion', 'Recomendadas'], ['noche', 'Más baratas por noche'], ['total', 'Viaje más barato'],
  ['comodo', 'Más cerca'], ['valoracion', 'Mejor valoradas'], ['ahorro', 'Más baratas que la media'],
];

/**
 * El orden, en un solo sitio: los más usados a un toque y el resto en «Otro orden» (antes
 * también había un «Ordenar por» en los filtros con los mismos).
 */
function ordenRapido(vista, params, actual) {
  const enlaces = ORDEN_RAPIDO.map(([orden, texto]) => {
    const href = crearHash(vista, { ...params, orden: orden === 'puntuacion' ? '' : orden });
    return orden === actual
      ? `<a class="chip chip--elegido" aria-current="true" href="${href}">${esc(texto)}</a>`
      : `<a class="chip" href="${href}">${esc(texto)}</a>`;
  }).join('');
  const otros = ORDENES_ESCAPADAS.filter((o) => !ORDEN_RAPIDO.some(([rapido]) => rapido === o));
  const otro = otros.includes(actual) ? actual : '';
  const selector = `<label class="orden-rapido__otro${otro ? ' orden-rapido__otro--elegido' : ''}"><span class="sr">Otro orden</span><select data-otro-orden="${esc(vista)}">
    <option value=""${otro ? '' : ' selected'}>Otro orden…</option>${otros.map((o) => `<option value="${o}"${o === otro ? ' selected' : ''}>${esc(ETIQUETAS_ORDEN[o])}</option>`).join('')}
  </select></label>`;
  return `<nav class="orden-rapido chips--desplazables-lista" aria-label="Ordenar">${enlaces}${selector}</nav>`;
}

/** Por qué salen en este orden: qué se suma, desde dónde, para cuántos y qué va al final. */
function explicacionOrden(e, f, costes) {
  // El coste y la comodidad son desde tu salida; la distancia, desde «Cerca de…» si lo hay.
  const desde = nombreSalida(e);
  const cerca = f.punto?.nombre ?? desde;
  const para = `${contar(e.viaje?.viajeros ?? 2, 'persona')} y ${contar(e.viaje?.noches ?? 2, 'noche')} si la oferta no las fija`;
  const sinTotal = [...costes.values()].filter((c) => c.total == null).length;
  const textos = {
    total: `Ordenadas por lo que cuesta el viaje completo por persona y noche desde ${desde} para ${para}: la oferta y, si vas en coche, la gasolina estimada (sin aparcamiento; los peajes conocidos, avisados). Así una de 1 noche y otra de 2 se comparan igual; con fecha de entrada y salida, primero las que encajan con esas noches.`,
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

/**
 * Buscando un pueblo («Cadaqués»), las ofertas de al lado no dicen su nombre: se avisa de
 * cuántas hay a menos de 30 km y se enlazan con «Cerca de…».
 */
function tambienCerca(e, f, params, encontradas) {
  if (!f.q || f.punto) return '';
  const lugar = lugarDeConsulta(e.datos.ofertas, f.q);
  if (!lugar) return '';
  const ya = new Set(encontradas.map((o) => o.id));
  const cerca = buscarEscapadas(e.datos.ofertas, { ...f, q: '', punto: lugar, km: KM_CERCA_DE_LO_BUSCADO, horas: null }, contextoBusqueda(e)).ofertas
    .filter((o) => !ya.has(o.id)).length;
  if (!cerca) return '';
  const hash = crearHash('escapadas', { ...params, q: '', lugar: lugar.nombre, lat: String(lugar.lat), lon: String(lugar.lon), km: String(KM_CERCA_DE_LO_BUSCADO), h: '' });
  return `<p class="aviso-memoria aviso-cerca">${icono('mapa')}<span>Hay ${esc(contar(cerca, 'escapada'))} más a menos de ${KM_CERCA_DE_LO_BUSCADO} km de ${esc(lugar.nombre)} que no lo dicen en el título. <a href="${esc(hash)}">Ver todo lo que hay cerca de ${esc(lugar.nombre)}</a></span></p>`;
}

/**
 * Con unas fechas elegidas, la lista en tres partes: primero las que tienen fechas de verdad en
 * ese finde o puente (o en tus días), después las de fechas cerradas que se salen un poco
 * (salen antes o vuelven después) y al final las de fechas flexibles, que valen esos días según
 * disponibilidad. Casi todas son flexibles: mezcladas, las que de verdad caben salían entre la
 * 25 y la 993. Dentro de cada parte, el orden elegido. null si no hay fechas elegidas o no hay
 * ninguna con fechas cerradas (entonces, la lista de siempre).
 */
export function partesPorFechas(f, ofertas, rango) {
  if ((!f.cuando && !f.desde && !f.hasta) || f.soloCerradas) return null;
  const cerradas = ofertas.filter((o) => o.fechas?.salida);
  if (!cerradas.length) return null;
  const caben = rango ? cerradas.filter((o) => encajeEnRango(o, rango)?.cabe !== false) : cerradas;
  const alrededor = rango ? cerradas.filter((o) => encajeEnRango(o, rango)?.cabe === false) : [];
  return { caben, alrededor, flexibles: ofertas.filter((o) => !o.fechas?.salida) };
}

function listaPorFechas(e, f, params, ofertas, ctx) {
  const partes = partesPorFechas(f, ofertas, ctx.rango);
  if (!partes) return rejilla(ofertas, ctx, { mostradas: mostradas(e, 'escapadas'), clave: 'escapadas' });
  const { caben, alrededor, flexibles } = partes;
  const enEsas = ctx.rango?.tipo === 'puente' ? 'en ese puente' : ctx.rango ? 'en ese finde' : 'en esos días';
  const contador = (n, uno, varios) => `<span class="contador">${esc(contar(n, uno, varios))}</span>`;
  const bloque = (titulo, n, intro, lista, clave, ic = '') => `<section class="seccion seccion--fechas">
  <div class="seccion__cabeza"><h2>${ic ? icono(ic) : ''}${esc(titulo)}</h2>${contador(n, 'escapada')}</div>
  ${intro ? `<p class="seccion__intro">${intro}</p>` : ''}
  ${rejilla(lista, ctx, { mostradas: mostradas(e, clave), clave })}
</section>`;
  return [
    caben.length
      ? bloque(`Con fechas ${enEsas}`, caben.length, 'Salen y vuelven dentro de esos días: el precio es para esas fechas.', caben, 'escapadas-fechas', 'calendario')
      : `<p class="desglose-fechas">${icono('calendario')}<span>Ninguna con fechas cerradas que quepa ${enEsas}${alrededor.length ? ': abajo, las que se salen un poco' : ''}.</span></p>`,
    alrededor.length ? bloque('Salen un poco antes o vuelven después', alrededor.length, 'Cada una dice en qué se sale de esos días.', alrededor, 'escapadas-alrededor') : '',
    flexibles.length ? bloque('De fechas flexibles', flexibles.length, 'Valen esos días según disponibilidad, que confirma su web (el botón de la oferta la abre con tus fechas cuando se puede).', flexibles, 'escapadas') : '',
  ].join('\n');
}

export function resultadosEscapadas(e, params) {
  const f = leerFiltrosEscapadas(params);
  const { resultado, aproximado } = conFaltas((g) => buscarEscapadas(ofertasDe(e, params), g, contextoBusqueda(e)), f);
  const { ofertas, distancias, costes, sinTotal } = resultado;
  const sinConfirmar = avisoSinConfirmar(e, 'escapadas', params, (lista) => buscarEscapadas(lista, f, contextoBusqueda(e)).ofertas.length);
  // Filtrando por eventos, cada tarjeta enseña el suyo (también en las de fechas flexibles).
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e), rango: rangoDe(f.cuando, contextoBusqueda(e)), conEventos: Boolean(f.evento), tipoEvento: f.evento });
  // En el móvil el «Mapa» ya está en la pastilla flotante: aquí sobra.
  const acciones = conmutadorListaMapa(params, 'escapadas');
  // Cada cifra dice a qué corresponde: «1.017 escapadas · cualquier fecha», «84 escapadas · vie 9 – dom 11 oct».
  const { entrada, salida } = fechasElegidas(e, 'escapadas', params);
  const periodo = entrada ? diasExplicitos(entrada, salida || entrada) : 'cualquier fecha';
  return `${filaActivos(e, 'escapadas', params)}${resumenResultados(`${contar(ofertas.length, 'escapada')} · ${periodo}`, acciones)}${aproximado ? avisoAproximado(f.q) : ''}${sinConfirmar}${tambienCerca(e, f, params, ofertas)}
${ordenRapido('escapadas', params, f.orden)}${explicacionOrden(e, f, costes)}${f.presupuesto ? `<p class="seccion__intro">Presupuesto: viaje completo (oferta y gasolina estimada) de hasta ${esc(euros(f.presupuesto))} ${f.presupuestoPor === 'persona' ? 'por persona' : 'en total'} para ${esc(contar(e.viaje?.viajeros ?? 2, 'persona'))}.${sinTotal ? ` ${esc(contar(sinTotal, 'oferta'))} sin datos suficientes para un total no se pueden comprobar y no salen.` : ''}</p>` : ''}
${ofertas.length
    ? listaPorFechas(e, f, params, ofertas, ctx)
    : periodoPasado(f.cuando, contextoBusqueda(e)) ? vacioPeriodoPasado('escapadas')
      : estadoVacio('Ninguna escapada cumple estos filtros', 'Prueba a quitar alguna temática, ampliar la distancia o subir el precio máximo.', `${buscarFuera(f.q)}${botonLimpiar('escapadas')}`)}`;
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
${barraDeVista(e, 'actividades', params)}
<div class="explorar">
<div class="explorar__filtros">${plegableMovil(e, 'actividades', params)}<form class="filtros" id="filtros-actividades" data-filtros="actividades" aria-label="Filtros de actividades">
  <div class="filtros__fila">${campoTexto(f, 'planes')}</div>
  <fieldset class="chips chips--desplazables"><legend>Temática</legend><div class="chips__lista">${chipsTemas(e, f, { sinAlojamiento: true })}</div></fieldset>
  ${campoNinos(f)}
  <div class="filtros__fila">
    <label class="campo">Lugar o destino <select name="dest">${opciones(lugares.map((l) => [l, l]), f.dest, 'Todos')}</select></label>
    <label class="campo">Precio máx. por persona (€) <input type="number" name="max" min="0" step="5" inputmode="numeric" placeholder="Sin límite" value="${f.max ?? ''}"></label>
    ${numero('nota', 'Valoración mín. (0–10)', f.nota, ' max="10" step="0.5" placeholder="Cualquiera"')}
    <label class="campo">Ordenar por <select name="orden">${opciones(ORDENES_ACTIVIDADES.map((o) => [o, ETIQUETAS_ORDEN_ACTIVIDADES[o]]), f.orden)}</select></label>
    ${interruptor('gratis', 'Solo gratis', f.gratis)}
    ${interruptorDefecto('sindesc', 'Ocultar las descartadas y las no disponibles', f.sinDescartadas)}
    ${interruptor('sinconf', 'Incluir las sin confirmar (su web no las ha vuelto a mostrar)', f.incluirSinConfirmar)}
  </div>
  ${bloqueBusquedas(e, 'actividades')}
</form></details></div>
<div id="resultados" class="explorar__resultados">${resultadosActividades(e, params)}</div>
</div>`;
}

/**
 * Conciertos, festivales y fiestas en Planes: no son entradas que vendan estas webs, sino lo
 * que pasa junto a las escapadas esas fechas (cada uno abre la escapada de al lado). Sin
 * fechas elegidas, los de este finde; con un lugar o un texto buscado, no se enseñan.
 */
function eventosEnPlanes(e, f) {
  if (f.q || f.dest || f.gratis || f.temas.length || periodoPasado(f.cuando, contextoBusqueda(e))) return '';
  const { eventos, fechas } = eventosCerca(e, f, { max: 6 });
  if (!eventos.length) return '';
  return `<section class="planes-eventos" aria-labelledby="planes-eventos-titulo">
  <h2 id="planes-eventos-titulo">${icono('tema-eventos')}Conciertos, festivales y fiestas <span class="suave">${f.cuando || f.desde ? 'esas fechas' : 'este finde'}</span></h2>
  <ul class="ideas__lista planes-eventos__lista">${eventos.map(filaEvento).join('')}</ul>
  <a class="ideas__mas" href="${crearHash('escapadas', { ...fechas, evtipo: 'todos' })}">Ver escapadas con eventos cerca${icono('flecha')}</a>
</section>`;
}

export function resultadosActividades(e, params) {
  const f = leerFiltrosActividades(params);
  const { resultado: lista, aproximado } = conFaltas((g) => buscarActividades(ofertasDe(e, params), g, contextoBusqueda(e)), f);
  const gratis = lista.filter((o) => o.precio === 0).length;
  const resumen = `${contar(lista.length, 'plan', 'planes')}${gratis ? ` · ${gratis} ${gratis === 1 ? 'gratis' : 'gratis'}` : ''}`;
  return `${filaActivos(e, 'actividades', params)}${eventosEnPlanes(e, f)}${resumenResultados(resumen)}${aproximado ? avisoAproximado(f.q) : ''}${avisoSinConfirmar(e, 'actividades', params, (otras) => buscarActividades(otras, f, contextoBusqueda(e)).length)}
${lista.length
    ? rejilla(lista, ctxTarjetas(e), { mostradas: mostradas(e, 'actividades'), clave: 'actividades' })
    : periodoPasado(f.cuando, contextoBusqueda(e)) ? vacioPeriodoPasado('actividades')
      : estadoVacio('Ninguna actividad cumple estos filtros', 'Prueba a quitar alguna temática, cambiar de lugar o subir el precio máximo.', botonLimpiar('actividades'))}`;
}

export function vistaMapa(e, params) {
  // El mapa es otra forma de ver las escapadas: su pestaña es la de Escapadas.
  return `${pestanas('explorar', 'escapadas')}<h1 class="titulo-vista" tabindex="-1">Escapadas en el mapa</h1>
${barraDeVista(e, 'mapa', params)}
${atajosEscapadas('mapa', params)}<details class="filtros-plegables"><summary>Filtros del mapa</summary>${formularioEscapadas(e, params, 'mapa')}</details>
<div id="resultados">${resultadosMapa(e, params)}</div>
<div id="mapa" class="mapa" role="region" aria-label="Mapa de escapadas y destinos de vuelo"><p class="mapa__cargando">Cargando el mapa…</p></div>`;
}

/** Lo que se pinta en el mapa con los filtros actuales. */
export function datosMapa(e, params) {
  const f = leerFiltrosEscapadas(params);
  return {
    ...contenidoMapa(ofertasDe(e, params), f, contextoBusqueda(e)),
    punto: f.punto ?? puntoSalida(e),
    radioKm: radioBusquedaKm(f),
    desde: f.punto?.nombre ?? nombreSalida(e),
  };
}

export function resultadosMapa(e, params, d = datosMapa(e, params)) {
  const sin = d.sinUbicacion ? ` (${contar(d.sinUbicacion, 'escapada')} sin ubicación no aparecen)` : '';
  const texto = `${contar(d.escapadas.length, 'escapada')} y ${contar(d.destinos.length, 'destino')} de vuelo en el mapa${sin}`;
  // Las que no se pueden situar siguen a un clic, en la lista, con los mismos filtros.
  const verSin = d.sinUbicacion
    ? `<p class="aviso-memoria">${icono('lista')}${esc(contar(d.sinUbicacion, 'escapada'))} sin ubicación no ${d.sinUbicacion === 1 ? 'sale' : 'salen'} en el mapa. <a href="${esc(crearHash('escapadas', { ...params, sinubic: '1' }))}">${d.sinUbicacion === 1 ? 'Verla' : 'Verlas'} en la lista</a></p>`
    : '';
  return `${resumenResultados(texto, conmutadorListaMapa(params, 'mapa'), { conModo: false })}${verSin}`;
}

// ── Búsqueda global ──────────────────────────────────────────────────────────

/** Sin nada exacto para lo escrito, se enseña lo más parecido (una falta, una letra de más…) y se dice. */
/**
 * Sin resultados para un texto (un hotel concreto, un pueblo): no está entre las ofertas que
 * se vigilan, pero se puede buscar fuera con un clic.
 */
export function buscarFuera(q) {
  const texto = (q ?? '').replace(/(^|\s)-\S+/g, ' ').trim();
  if (!texto) return '';
  const enlaces = [
    ['Booking', `https://www.booking.com/searchresults.es.html?ss=${encodeURIComponent(texto)}`],
    ['Google', `https://www.google.com/search?q=${encodeURIComponent(`${texto} escapada oferta`)}`],
  ];
  return `<p class="buscar-fuera">No está entre las ofertas que vigilamos ahora mismo. Búscalo directamente: ${enlaces
    .map(([web, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">«${esc(texto)}» en ${web}${icono('externo')}</a>`).join(' · ')}</p>`;
}

function avisoAproximado(q) {
  return `<p class="aviso-memoria" role="status">${icono('buscar')}Nada coincide exactamente con «${esc(q)}»: te enseñamos lo más parecido.</p>`;
}

export function vistaBuscar(e, params) {
  const q = (params.q ?? '').trim();
  const titulo = params.nuevas === '1' ? 'Novedades' : q ? `Resultados para «${esc(q)}»` : 'Buscar';
  return `${pestanas('explorar', null)}<h1 class="titulo-vista" tabindex="-1">${titulo}</h1>
<p class="seccion__intro">Busca en <strong>todas</strong> las ofertas: escapadas, vuelos y planes. Para afinar con filtros, sigue en la pestaña que te interese.</p>
${barraDeVista(e, 'buscar', params)}
<div id="resultados">${resultadosBuscar(e, params)}</div>`;
}

export function resultadosBuscar(e, params) {
  const f = leerFiltrosComunes(params);
  const { resultado: lista, aproximado } = conFaltas((g) => buscarTexto(ofertasDe(e, params), g, contextoBusqueda(e)), f);
  const sinConfirmar = avisoSinConfirmar(e, 'buscar', params, (otras) => buscarTexto(otras, f, contextoBusqueda(e)).length);
  if (!lista.length) {
    return `${resumenResultados('0 ofertas')}${sinConfirmar}${estadoVacio(f.nuevas ? 'No hay novedades desde tu última visita.' : `Nada coincide con «${esc(f.q)}».`, 'Prueba con otra palabra: un destino, una región, un tema… Con «-» delante quitas resultados.', f.nuevas ? '' : buscarFuera(f.q))}`;
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
  return `${resumenResultados(contar(lista.length, 'oferta'))}${aproximado ? avisoAproximado(f.q) : ''}${sinConfirmar}${seguir}${rejilla(lista, ctxTarjetas(e), { mostradas: mostradas(e, 'buscar'), clave: 'buscar' })}`;
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
