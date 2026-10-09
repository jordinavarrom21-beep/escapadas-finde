/**
 * Portada: primero buscar, después inspirarse. Tu viaje (una sola vez), ¿cuándo?, ¿qué
 * buscas?, destino opcional y un botón; debajo, una línea de estado, unos pocos atajos, la
 * «Lo mejor para este finde» en tres listas cortas.
 */

import { etiquetaDia, nombreFinde, nombreFindeEnFrase, nombreSiguienteFinde } from './fechas.js';
import { TIPOS_EVENTO, contar, duracion, escaparHtml as esc, euros, haceCuanto, normalizar, urlSegura } from './formato.js';
import {
  actividadesPara, buscarActividades, buscarEscapadas, chollosDeVuelos, conPeriodo, contenidoMapa, crearHash, filtrarVuelos,
  leerFiltrosActividades, leerFiltrosEscapadas, leerFiltrosVuelos, perfilFavoritos, periodoFinde, planesSorpresa,
  rangoDe, recomendadas, salidaPuente, sinComprobar, tieneVuelo,
} from './filtros.js';
import { colorTema, esFreeTour, estadoVacio, tarjeta, tarjetaConMotivo, textoFechas } from './plantillas.js';
import { escena, icono, tipoEscena } from './iconos.js';
import { camposFechas } from './selector-fechas.js';
import {
  HORAS_SORPRESA, conIcono, contextoBusqueda, ctxTarjetas, diasExplicitos, estadoWebs, etiquetaFinde, marcado, nombreSalida,
  ocultas, seccion,
} from './vistas-comun.js';

/** Cuántas tarjetas enseña «Recomendado para ti»: el resto, en su apartado. */
const IDEAS_POR_GRUPO = 3;

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

// ── Sorpréndeme (se abre desde los atajos) ──────────────────────────────────

/** Planes de la sorpresa (se pinta al pulsar «Sorpréndeme» y se repinta con «Otra ronda»). */
export function contenidoSorpresa(e, params = {}, vistos = null) {
  const f = leerFiltrosEscapadas(params);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, f, contextoBusqueda(e));
  const busqueda = contextoBusqueda(e);
  const planes = sinVistas(planesSorpresa(ofertas.filter((o) => !e.favoritos?.has(o.id) && !vistos?.has(o.id) && !sinComprobar(o, busqueda)), { distancias }, { salto: e.salto ?? 0, horasMax: HORAS_SORPRESA }), vistos);
  if (!planes.length) {
    return estadoVacio(`No hay planes a menos de ${HORAS_SORPRESA} h con estos filtros.`, 'Prueba a quitar alguna temática o a subir el precio máximo.');
  }
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e) });
  return `<div class="rejilla">${planes.map((o) => tarjeta(o, ctx)).join('')}</div>`;
}

/** Plegado hasta que se pulsa «Sorpréndeme»: así no empuja la búsqueda ni se calcula de más. */
function bloqueSorpresa(e) {
  return `<div id="sorpresa-bloque" hidden>${seccion(conIcono('nuevo', 'Sorpréndeme'),
    `<p class="seccion__intro">Tres planes de temáticas distintas a menos de ${HORAS_SORPRESA} h de ${esc(nombreSalida(e))}, de cualquier fecha.</p>
     <p class="enlaces-linea"><button type="button" class="boton boton--tinta" data-sorpresa>${icono('recargar')}Otra ronda</button></p>
     <div id="sorpresa"></div>`)}</div>`;
}

// ── El buscador ─────────────────────────────────────────────────────────────

const ACCION_QUE = { escapadas: 'Ver escapadas', vuelos: 'Ver vuelos', actividades: 'Ver planes' };

/** El texto del botón según lo elegido: «Ver vuelos» / «para vie 2 – dom 4 oct». */
export function textoEnviar(que, dias = '') {
  return { accion: ACCION_QUE[que] ?? ACCION_QUE.escapadas, para: dias ? `para ${dias}` : 'en cualquier fecha' };
}

/**
 * Lo primero del Inicio: tu viaje, qué quieres organizar (una escapada, un vuelo o un plan),
 * para cuándo y, si ya lo sabes, dónde. Las fechas son las mismas para las tres; «Afinar la
 * escapada» (qué te apetece, presupuesto y cómo vas) solo sale con Escapadas.
 */
/**
 * Las opciones de «¿Cuándo?» y cuál arranca marcada: el periodo elegido en Explorar (y aún
 * vigente), para que Inicio y Explorar digan lo mismo. Las usan el buscador y los atajos.
 */
function opcionesCuando(e) {
  const [actual, siguiente] = e.findes;
  // [valor, rótulo, días]: los días van a la vista y al botón («para vie 2 – dom 4 oct»).
  const periodo = e.periodo ?? {};
  const rango = !periodo.cuando && periodo.desde && periodo.hasta ? [periodo.desde, periodo.hasta] : null;
  const opciones = [
    ['finde', nombreFinde(e.hoy), diasExplicitos(actual.viernes, actual.domingo)],
    ...(siguiente ? [[siguiente.id, nombreSiguienteFinde(e.hoy), etiquetaFinde(siguiente, e.datos.puentes)]] : []),
    // «El puente» y sus días (con la tarde del último laborable para salir).
    ...(e.puente ? [[e.puente.id, 'El puente', diasExplicitos(salidaPuente(e.puente), e.puente.hasta)]] : []),
    ['', 'Cualquier fecha', ''],
    // Otras fechas, con calendario: las de Explorar si había, o las que elijas aquí.
    ['rango', rango ? 'Tus fechas' : 'Otras fechas', rango ? diasExplicitos(...rango) : ''],
  ];
  // Sin nada elegido (o ya pasado: filtrosVigentes quita la clave), «Este finde»; «Cualquier
  // fecha» (cuando: '') solo si se eligió a propósito en Explorar.
  const elegido = rango ? 'rango' : periodo.cuando === actual.id ? 'finde' : periodo.cuando === 'puente' ? e.puente?.id : periodo.cuando;
  const marcada = elegido !== undefined && opciones.some(([valor]) => valor === elegido) ? elegido : 'finde';
  return { opciones, marcada, rango };
}

/** Los días de «Otras fechas» para la opción y el botón: «sáb 10 – lun 12 oct» (vacío sin fecha de inicio). */
export function diasDeFechas(desde, hasta) {
  return desde ? diasExplicitos(desde, hasta && hasta >= desde ? hasta : desde) : '';
}

/** El periodo ({cuando, desde, hasta}) de una opción de «¿Cuándo?» («rango»: las fechas elegidas). */
export function periodoDeOpcion(valor, rango = null) {
  return valor === 'rango' && rango ? { cuando: '', desde: rango[0], hasta: rango[1] } : { cuando: valor ?? '', desde: '', hasta: '' };
}

export function buscadorFinde(e) {
  const { opciones: cuando, marcada: marcadoCuando, rango } = opcionesCuando(e);
  const opcionCuando = ([valor, texto, dias]) => `<label class="opcion opcion--fecha"><input type="radio" name="cuando" value="${esc(valor)}" data-dias="${esc(dias)}"${marcado(valor === marcadoCuando)}${valor === 'rango' ? ' aria-controls="buscador-finde-fechas"' : ''}><small>${esc(texto)}</small><span${valor === 'rango' ? ' data-dias-propios' : ''}>${esc(dias || (valor === 'rango' ? 'elige entrada y salida' : 'lo mejor que haya'))}</span></label>`;
  const como = [['', 'Como sea'], ['coche', 'En coche'], ['sincoche', 'Sin coche']];
  const opcion = (nombre, [valor, texto], marcada) => `<label class="opcion"><input type="radio" name="${nombre}" value="${esc(valor)}"${marcado(marcada)}> ${esc(texto)}</label>`;
  const temas = [['', 'Cualquier plan'], ...e.datos.temas.map((t) => [t.id, t.nombre])]
    .map(([valor, texto]) => `<option value="${esc(valor)}">${esc(texto)}</option>`).join('');
  const que = (valor, ic, titulo, detalle) => `<label class="organizar__opcion"><input class="sr" type="radio" name="que" value="${valor}"${marcado(valor === 'escapadas')}>
      <span class="organizar__icono" aria-hidden="true">${icono(ic)}</span><span class="organizar__texto"><strong>${titulo}</strong><small>${detalle}</small></span><span class="organizar__estado" aria-hidden="true"></span></label>`;
  const enviar = textoEnviar('escapadas', cuando.find(([valor]) => valor === marcadoCuando)[2]);
  return `<form class="buscador-finde" data-buscador-finde aria-labelledby="buscador-finde-titulo">
  <h2 id="buscador-finde-titulo" class="sr">Elige qué buscar y para cuándo</h2>
  <fieldset class="buscador-finde__grupo"><legend>1. ¿Cuándo?</legend>
    <div class="opciones opciones--cuando">${cuando.map(opcionCuando).join('')}</div>
    <div class="buscador-finde__fechas fechas fechas--portada" id="buscador-finde-fechas" data-fechas data-fechas-portada data-fechas-propias data-entrada="${esc(rango?.[0] ?? '')}" data-salida="${esc(rango?.[1] ?? '')}"${marcadoCuando === 'rango' ? '' : ' hidden'}>
      <input type="hidden" name="desde" value="${esc(rango?.[0] ?? '')}"><input type="hidden" name="hasta" value="${esc(rango?.[1] ?? '')}">
      ${camposFechas({ entrada: rango?.[0] ?? '', salida: rango?.[1] ?? '', idPanel: 'buscador-finde-calendario' })}
      <div class="fechas__panel" id="buscador-finde-calendario" data-fechas-panel role="group" aria-label="Calendario: elige la fecha de entrada y la de salida" hidden><div data-calendario></div></div>
    </div>
  </fieldset>
  <fieldset class="buscador-finde__grupo"><legend>2. ¿Qué buscas?</legend>
    <div class="organizar">
      ${que('escapadas', 'escapadas', 'Escapadas', 'Hoteles, casas rurales y paquetes')}
      ${que('vuelos', 'vuelos', 'Vuelos y trenes', 'Billetes de ida y vuelta')}
      ${que('actividades', 'actividades', 'Planes', 'Actividades y entradas')}
    </div>
  </fieldset>
  <details class="buscador-finde__mas">
    <summary>Afinar la escapada <span class="suave">(qué te apetece, presupuesto, coche)</span></summary>
    <div class="buscador-finde__fila">
      <div class="buscador-finde__grupo">
        <label class="buscador-finde__etiqueta" for="buscador-finde-temas">¿Qué te apetece?</label>
        <select id="buscador-finde-temas" name="temas">${temas}</select>
      </div>
      <div class="buscador-finde__grupo">
        <label class="buscador-finde__etiqueta" for="buscador-finde-pres">Máx. por persona</label>
        <span class="campo-euros"><input id="buscador-finde-pres" type="number" name="pres" min="0" step="10" inputmode="numeric" placeholder="Sin límite"></span>
      </div>
    </div>
    <fieldset class="buscador-finde__grupo"><legend>¿Cómo vas?</legend>
      <div class="opciones">${como.map((c, i) => opcion('como', c, i === 0)).join('')}</div>
    </fieldset>
  </details>
  <div class="buscador-finde__accion">
    <div class="buscador-finde__destino">
      <label class="buscador-finde__etiqueta" for="buscador-finde-q">Destino <span class="suave">(opcional)</span></label>
      <input id="buscador-finde-q" type="search" name="q" placeholder="Destino u hotel" autocomplete="off" enterkeyhint="search">
    </div>
    <button type="submit" class="boton boton--primario buscador-finde__enviar"><span data-enviar-accion>${esc(enviar.accion)}</span><small data-enviar-para>${esc(enviar.para)}</small></button>
  </div>
</form>`;
}

/**
 * A dónde lleva el buscador con lo elegido: Escapadas con sus filtros (por coste total),
 * Vuelos con ese finde o puente (su id: «finde»/«puente» no los entiende) o Planes. El
 * destino, si se escribe, va a las tres como búsqueda.
 */
export function destinoOrganizar(que, campos, { finde = null, puente = null } = {}) {
  // Sin vuelta (o anterior a la ida), un solo día; sin ida, «Otras fechas» es cualquier fecha.
  if (campos.cuando === 'rango') {
    campos = campos.desde ? { ...campos, hasta: campos.hasta && campos.hasta >= campos.desde ? campos.hasta : campos.desde } : { ...campos, cuando: '' };
  }
  // «Tus fechas» (un rango elegido en Explorar) va como desde/hasta; lo demás, como «cuando».
  const periodo = campos.cuando === 'rango'
    ? { cuando: '', desde: campos.desde ?? '', hasta: campos.hasta ?? '' }
    : { cuando: campos.cuando ?? '', desde: '', hasta: '' };
  const q = (campos.q ?? '').trim();
  const base = q ? { q } : {};
  if (que === 'vuelos') return crearHash('vuelos', conPeriodo('vuelos', base, periodo, { finde, puente }));
  if (que === 'actividades') return crearHash('actividades', conPeriodo('actividades', base, periodo));
  return crearHash('escapadas', paramsBuscadorFinde(campos));
}

/** Los filtros de Escapadas que corresponden a lo elegido en el buscador de la portada. */
export function paramsBuscadorFinde({ cuando = '', pres = '', como = '', temas = '', q = '', desde = '', hasta = '' } = {}) {
  return {
    ...(cuando === 'rango' ? { desde, hasta } : { cuando }), temas, orden: 'total',
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(Number(pres) > 0 ? { pres: String(Number(pres)), prespor: 'persona' } : {}),
    ...(como === 'coche' ? { transporte: 'coche' } : como === 'sincoche' ? { sincoche: '1' } : {}),
  };
}

/** Tu viaje, una sola vez y arriba: desde dónde, cuántos y cuántas noches, con «Cambiar». */
export function resumenViaje(e) {
  const viaje = `${nombreSalida(e)} · ${contar(e.viaje?.viajeros ?? 2, 'persona')} · ${contar(e.viaje?.noches ?? 2, 'noche')}`;
  return `<button type="button" class="viaje-resumen" data-mi-viaje aria-haspopup="dialog" aria-label="Tu viaje: ${esc(viaje)}. Cambiar salida, viajeros o noches">
    <span class="viaje-resumen__icono" aria-hidden="true">${icono('pin')}</span><span class="viaje-resumen__texto"><small>Tu viaje</small><strong>${esc(viaje)}</strong></span><span class="viaje-resumen__cambiar" aria-hidden="true">Cambiar</span></button>`;
}

// ── Debajo del buscador ─────────────────────────────────────────────────────

/**
 * Una sola línea: cuántas ofertas (y de qué), cuándo se actualizaron los datos (cada web se lee a
 * su ritmo, de 15 min a una vez al día: una sola hora engañaba) y, solo si falla más de una cuarta
 * parte de las webs, el aviso; si no, ese estado va en el pie y en «Estado de las webs».
 */
function lineaConfianza(e) {
  const webs = e.webs ?? estadoWebs(e.datos.fuentes, e.ahora);
  const nombres = webs.problemas.map((f) => f.nombre).join(', ');
  // El punto, dentro del texto: suelto, en 320 px se quedaba solo en su línea.
  return `<p class="portada__confianza${webs.grave ? ' portada__confianza--aviso' : ''}">
  <span><span class="punto" aria-hidden="true"></span> ${esc(e.datos.ofertas.length.toLocaleString('es-ES'))} ofertas (escapadas, vuelos y planes) · Datos actualizados ${esc(haceCuanto(e.datos.generado, e.ahora))} · <a href="#/fuentes">cada web a su ritmo</a></span>
  ${webs.grave ? `<a href="#/fuentes" class="portada__problemas"${nombres ? ` title="${esc(nombres)}"` : ''}>${icono('alerta')}${esc(webs.texto)}</a>` : ''}
  <a href="#/ayuda">Cómo funciona</a></p>`;
}

/**
 * Atajos rápidos: chollos, planes gratis y con niños (cada uno con su cifra, la misma que
 * la lista a la que lleva) y «Sorpréndeme». Un único acceso por tema.
 */
export function atajosPortada(e, opcion = null, fechas = null) {
  const busqueda = contextoBusqueda(e);
  // Las fechas elegidas arriba (al cambiarlas, app.js repinta los atajos): las cifras y los
  // enlaces son de ese periodo. Antes cada atajo iba con las suyas («Planes gratis», este
  // finde; los otros, cualquier fecha) y al pulsarlo se perdían las que habías elegido.
  const { opciones, marcada, rango: rangoExplorar } = opcionesCuando(e);
  const valor = opcion ?? marcada;
  // «Otras fechas»: las del calendario de arriba (sin ellas, de cualquier fecha).
  const rango = fechas?.[0] ? [fechas[0], fechas[1] && fechas[1] >= fechas[0] ? fechas[1] : fechas[0]] : rangoExplorar;
  const p = valor === 'rango' && !rango ? periodoDeOpcion('') : periodoDeOpcion(valor, rango);
  const conFechas = (vista, params) => conPeriodo(vista, params, p, { finde: e.findes[0], puente: e.puente });
  const dias = valor === 'rango' ? diasDeFechas(...(rango ?? [])) : opciones.find(([v]) => v === valor)?.[2];
  const cuandoTexto = dias ? ` · ${dias}` : ' · cualquier fecha';
  const cho = conFechas('escapadas', { cho: '1' });
  const gratis = conFechas('actividades', { gratis: '1' });
  const ninos = conFechas('escapadas', { ninos: 'ventaja' });
  // El mapa es una vista de Escapadas (Explorar → «Lista | Mapa»): aquí, a mano desde el Inicio.
  const mapa = conFechas('mapa', {});
  const n = {
    // Lo mismo que pinta el mapa (escapadas con ubicación y destinos de vuelo).
    mapa: ((m) => m.escapadas.length + m.destinos.length)(contenidoMapa(e.datos.ofertas, leerFiltrosEscapadas(mapa), busqueda)),
    cho: buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(cho), busqueda).ofertas.length,
    gratis: buscarActividades(e.datos.ofertas, leerFiltrosActividades(gratis), busqueda).length,
    ninos: buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(ninos), busqueda).ofertas.length,
  };
  const atajo = (cifra, texto, href, ic, titulo) => (cifra
    ? `<li><a class="atajo" href="${href}" title="${esc(titulo)}">${icono(ic)}<span>${esc(texto)}</span><span class="atajo__cifra">${cifra.toLocaleString('es-ES')}</span></a></li>`
    : '');
  const items = [
    atajo(n.cho, 'Chollos', crearHash('escapadas', cho), 'fuego', `Escapadas muy por debajo de su precio normal${cuandoTexto}`),
    atajo(n.gratis, 'Planes gratis', crearHash('actividades', gratis), 'actividades', `Planes gratis${cuandoTexto}`),
    atajo(n.ninos, 'Viajar con niños', crearHash('escapadas', ninos), 'tema-familia', `Escapadas con niños gratis o con descuento${cuandoTexto}`),
    // Como los demás: con lo que se verá en el mapa y solo si hay algo que ver.
    atajo(n.mapa, 'Ver en el mapa', crearHash('mapa', mapa), 'mapa', `Las escapadas en el mapa${cuandoTexto}`),
    `<li><button type="button" class="atajo" data-sorpresa aria-controls="sorpresa-bloque">${icono('nuevo')}<span>Sorpréndeme</span></button></li>`,
  ].join('');
  return `<section class="seccion portada__atajos" aria-labelledby="atajos-titulo">
  <div class="seccion__cabeza"><h2 id="atajos-titulo">Atajos rápidos</h2></div>
  <ul class="atajos-portada">${items}</ul>
</section>`;
}

// ── Lo mejor para este finde: tres listas cortas, el resto en su sección ────

/** Cuántas filas enseña cada columna de «Lo mejor para este finde». */
const FILAS_IDEAS = 4;
/** Las escapadas de la portada, a un rato de casa: las lejanas ya salen en Escapadas. */
const HORAS_IDEAS = 3;
/** Primero lo que se busca como «plan» de finde; las visitas guiadas y el cine, al final. */
const ORDEN_EVENTOS = ['musica', 'festivales', 'fiestas', 'ferias', 'escena', 'familia', 'exposiciones', 'deporte', 'cine', 'otros'];
const UNIDAD_CORTA = { pp: '/pers.', 'pp/noche': '/pers. y noche', total: 'en total', 'i/v': 'i/v por pers.', noche: '/noche', trayecto: '/trayecto' };

const precioCorto = (o) => (o.precio === 0 ? `Gratis${esFreeTour(o) ? ' <small>(propina voluntaria)</small>' : ''}` : `${euros(o.precio)}${UNIDAD_CORTA[o.unidad] ? ` <small>${UNIDAD_CORTA[o.unidad]}</small>` : ''}`);

/** La miniatura de una escapada: su foto o, sin ella, la ilustración de su tipo con su color. */
function miniatura(o) {
  const imagen = urlSegura(o.imagen);
  return `<span class="idea__foto" aria-hidden="true">${escena(tipoEscena(o))}${imagen ? `<img src="${esc(imagen)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
}

/** Vuelos: la ruta («BCN → LTN») en vez de una foto, sobre el cielo de su escena. */
function miniaturaVuelo(o) {
  const [de, a] = [o.vuelo?.origen, o.vuelo?.destino];
  return `<span class="idea__foto idea__foto--vuelo" aria-hidden="true">${escena('cielo')}${de && a ? `<span class="idea__ruta">${esc(de)}<span>→</span>${esc(a)}</span>` : ''}</span>`;
}

/**
 * Una mini tarjeta: miniatura, título (abre la ficha; toda la tarjeta es pulsable), un dato
 * que ayuda a decidir y el precio. Toma el color de la temática, como las tarjetas grandes.
 */
function filaIdea(o, detalle, foto = miniatura(o)) {
  return `<li class="idea" style="--color-tema:${colorTema(o)}">${foto}
  <span class="idea__cuerpo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button>${detalle ? `<span class="idea__detalle">${detalle}</span>` : ''}</span>
  <span class="idea__precio">${precioCorto(o)}</span></li>`;
}

/** Una columna: cabecera con su icono de color y «Ver…» arriba, y sus mini tarjetas. */
function columnaIdeas(ic, titulo, filas, vacio, enlace, clase) {
  return `<section class="ideas__columna ideas__columna--${clase}" aria-label="${esc(titulo.replace(/<[^>]+>/g, ''))}">
  <header class="ideas__cabeza"><span class="ideas__icono" aria-hidden="true">${icono(ic)}</span><h3>${titulo}</h3></header>
  ${filas.length ? `<ul class="ideas__lista">${filas.join('')}</ul>` : `<p class="suave ideas__vacio">${vacio}</p>`}
  <a class="ideas__mas" href="${enlace.href}">${esc(enlace.texto)}${icono('flecha')}</a></section>`;
}

function textoDistancia(d) {
  if (d?.minutos == null) return '';
  return `${icono('coche')} a ${d.minutos < 5 ? 'menos de 5 min' : esc(duracion(d.minutos))}`;
}

/**
 * El periodo de «Lo mejor para…»: el marcado en «¿Cuándo?» (`opcion`: «finde», el id de un finde
 * o puente, «» para cualquier fecha o «rango» con `rango` = [desde, hasta]). Las tres columnas,
 * sus enlaces y el título siguen a ese periodo.
 */
export function periodoIdeas(e, opcion = 'finde', rango = null) {
  const [actual] = e.findes;
  const conRango = opcion === 'rango' && rango?.[0];
  const p = conRango ? periodoDeOpcion('rango', [rango[0], rango[1] && rango[1] >= rango[0] ? rango[1] : rango[0]]) : periodoDeOpcion(opcion === 'rango' ? 'finde' : opcion);
  if (!p.cuando && !p.desde) return { periodo: p, titulo: 'Lo mejor de ahora', dias: 'cualquier fecha', todas: true };
  if (p.desde) {
    const dentro = (o) => { const s = o.fechas?.salida?.slice(0, 10); return Boolean(s) && s >= p.desde && s <= p.hasta; };
    return { periodo: p, titulo: 'Lo mejor para tus fechas', dias: diasExplicitos(p.desde, p.hasta), delPeriodo: dentro };
  }
  const id = p.cuando === 'finde' ? actual.id : p.cuando;
  const r = rangoDe(id, contextoBusqueda(e));
  const esPuente = r?.tipo === 'puente';
  const titulo = id === actual.id ? `Lo mejor para ${nombreFindeEnFrase(e.hoy)}`
    : esPuente ? `Lo mejor para el puente${e.puente?.id === id && e.puente.nombre ? ` de ${e.puente.nombre}` : ''}` : 'Lo mejor para el finde siguiente';
  return {
    periodo: p, titulo, dias: r ? diasExplicitos(r.inicio, r.fin) : '',
    delPeriodo: (o) => o.fechas?.findeId === id || o.fechas?.puenteId === id,
  };
}

/** Los parámetros de una vista con el periodo de «Lo mejor para…». */
const conPeriodoIdeas = (e, vista, params, pi) => conPeriodo(vista, params, pi.periodo, { finde: e.findes[0], puente: e.puente });

function columnaEscapadas(e, vistos, pi) {
  const busqueda = contextoBusqueda(e);
  const params = conPeriodoIdeas(e, 'escapadas', { h: String(HORAS_IDEAS), orden: 'total' }, pi);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(params), busqueda);
  const lista = sinVistas(ofertas.filter((o) => !sinComprobar(o, busqueda)), vistos, FILAS_IDEAS);
  return columnaIdeas('escapadas', `Escapadas a menos de ${HORAS_IDEAS} h`,
    lista.map((o) => filaIdea(o, textoDistancia(distancias.get(o.id)))),
    `Nada a menos de ${HORAS_IDEAS} h de ${esc(nombreSalida(e))} para estas fechas.`,
    { href: crearHash('escapadas', params), texto: ofertas.length ? `Ver las ${ofertas.length}` : 'Ver escapadas' }, 'escapadas');
}

function columnaVuelos(e, vistos, pi) {
  const busqueda = contextoBusqueda(e);
  // Todos los vuelos con fecha de una vez (del más barato al más caro), y luego se separan los
  // del periodo elegido (lo mismo que filtrarVuelos con ese finde o puente) de los de otras fechas.
  const todos = e.datos.ofertas.some(tieneVuelo) ? filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), orden: 'precio' }, busqueda) : [];
  const esDelFinde = pi.todas ? () => true : pi.delPeriodo;
  const vuelos = todos.filter(esDelFinde);
  // Un vuelo por destino (el más barato): cuatro a Londres no ayudan a decidir.
  const destinos = new Set();
  const otroDestino = (o) => { const d = o.lugar?.nombre ?? o.titulo; if (destinos.has(d)) return false; destinos.add(d); return true; };
  const filaVuelo = (o) => filaIdea(o, esc(textoFechas(o)), miniaturaVuelo(o));
  if (vuelos.length) {
    const delFinde = sinVistas(vuelos.filter(otroDestino), vistos, FILAS_IDEAS);
    // Con pocos para el finde, la columna se completa con los más baratos de otras fechas (y lo
    // dice): así no queda medio vacía al lado de las otras dos.
    const otras = delFinde.length < FILAS_IDEAS
      ? sinVistas(todos.filter((o) => !esDelFinde(o) && o.fechas?.salida && otroDestino(o)), vistos, FILAS_IDEAS - delFinde.length)
      : [];
    const filas = [...delFinde.map(filaVuelo), ...(otras.length ? ['<li class="ideas__sub">Otras fechas</li>', ...otras.map(filaVuelo)] : [])];
    return columnaIdeas('vuelos', 'Vuelos', filas, '',
      { href: crearHash('vuelos', conPeriodoIdeas(e, 'vuelos', {}, pi)), texto: pi.todas ? 'Ver vuelos' : `Ver ${vuelos.length === 1 ? 'el' : `los ${vuelos.length}`} de estas fechas` }, 'vuelos');
  }
  // Sin vuelos con esas fechas, los chollos desde tus aeropuertos (de cualquier fecha, y lo dice).
  const chollos = sinVistas(chollosDeVuelos(e.datos.ofertas, leerFiltrosVuelos({ mios: '1' }), busqueda), vistos, FILAS_IDEAS);
  return columnaIdeas('vuelos', 'Chollos de vuelos <small class="suave">(otras fechas)</small>',
    chollos.map((o) => filaIdea(o, esc(textoFechas(o)), miniaturaVuelo(o))), 'Sin vuelos baratos desde tus aeropuertos ahora mismo.',
    { href: crearHash('vuelos', { mios: '1' }), texto: 'Ver vuelos' }, 'vuelos');
}

/**
 * Conciertos, festivales y fiestas junto a las escapadas de un periodo (los que trae cada
 * oferta: src/enriquecer/eventos.js), primero los de a menos de `horas` de tu salida. Cada
 * uno lleva la escapada más barata de al lado. Sin periodo, este finde.
 */
export function eventosCerca(e, periodo = {}, { max = FILAS_IDEAS, horas = HORAS_IDEAS } = {}) {
  const busqueda = contextoBusqueda(e);
  const [actual] = e.findes;
  const r = rangoDe(periodo.cuando, busqueda);
  const [inicio, fin] = r ? [r.inicio, r.fin] : periodo.desde ? [periodo.desde, periodo.hasta || periodo.desde] : [actual.viernes, actual.domingo];
  const fechas = r ? { cuando: periodo.cuando } : { desde: inicio, hasta: fin };
  const cerca = (h) => buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ ...fechas, evtipo: 'todos', ...(h ? { h: String(h) } : {}), orden: 'total' }), busqueda).ofertas;
  const elegir = (ofertas) => {
    const porEvento = new Map();
    for (const o of ofertas) {
      if (sinComprobar(o, busqueda)) continue;
      for (const ev of o.eventos ?? []) {
        if (!ev.fecha || ev.fecha < inicio || ev.fecha > fin) continue;
        const clave = `${normalizar(ev.nombre)}|${ev.fecha}`;
        // Las ofertas ya van de más barata a más cara: se queda la primera.
        if (!porEvento.has(clave)) porEvento.set(clave, { ...ev, oferta: o });
      }
    }
    const orden = (ev) => { const i = ORDEN_EVENTOS.indexOf(ev.tipo); return i < 0 ? ORDEN_EVENTOS.length : i; };
    const lista = [...porEvento.values()].sort((a, b) => orden(a) - orden(b) || a.fecha.localeCompare(b.fecha));
    // Variedad: un evento por pueblo y como mucho dos del mismo tipo antes de repetir.
    const lugares = new Set();
    const tipos = new Map();
    const variados = lista.filter((ev) => {
      const lugar = ev.oferta.lugar?.nombre ?? ev.oferta.id;
      if (lugares.has(lugar) || (tipos.get(ev.tipo) ?? 0) >= 2) return false;
      lugares.add(lugar);
      tipos.set(ev.tipo, (tipos.get(ev.tipo) ?? 0) + 1);
      return true;
    });
    return [...variados, ...lista.filter((ev) => !variados.includes(ev))].slice(0, max);
  };
  const cercanos = horas ? elegir(cerca(horas)) : [];
  return { eventos: cercanos.length >= Math.min(2, max) ? cercanos : elegir(cerca(null)), fechas };
}

/**
 * Una fila de evento: el día como una hoja de calendario, el nombre (abre la escapada más
 * barata de al lado), qué es y dónde, y desde cuánto se puede dormir allí.
 */
export function filaEvento(ev) {
  const tipo = TIPOS_EVENTO[ev.tipo]?.[0] ?? 'Evento';
  // Dónde es el evento (no la escapada de al lado, que abre el enlace): «Temporada Alta» en
  // Palafrugell salía en Platja d'Aro.
  const sitio = ev.municipio ?? ev.oferta.lugar?.nombre;
  const donde = sitio ? ` · ${esc(sitio)}` : '';
  const [dia, numero, mes] = etiquetaDia(ev.fecha).split(' ');
  const dormir = typeof ev.oferta.precio === 'number' && ev.oferta.precio > 0 ? `<span class="idea__precio idea__precio--dormir"><small>dormir desde</small>${precioCorto(ev.oferta)}</span>` : '';
  return `<li class="idea idea--evento"><span class="idea__foto idea__fecha" aria-hidden="true"><small>${esc(dia)}</small><strong>${esc(numero)}</strong><small>${esc(mes)}</small></span>
  <span class="idea__cuerpo"><button type="button" class="enlace-ficha" data-ficha="${esc(ev.oferta.id)}" title="Ver la escapada más barata al lado">${esc(ev.nombre)}</button><span class="idea__detalle">${esc(tipo)} · ${esc(etiquetaDia(ev.fecha))}${donde}</span></span>
  ${dormir}</li>`;
}

function columnaEventos(e, vistos, pi) {
  const [actual] = e.findes;
  // Los eventos van con fecha: con «cualquier fecha», los de este finde (y lo dice).
  const periodo = pi.todas ? {} : pi.periodo;
  const { eventos } = eventosCerca(e, periodo);
  const deEsteFinde = pi.todas ? ` <small class="suave">(${esc(nombreFindeEnFrase(e.hoy))})</small>` : '';
  if (eventos.length) {
    return columnaIdeas('tema-eventos', `Conciertos y fiestas${deEsteFinde}`, eventos.map(filaEvento), '',
      { href: crearHash('escapadas', conPeriodoIdeas(e, 'escapadas', { evtipo: 'todos' }, pi.todas ? { periodo: { cuando: 'finde' } } : pi)), texto: 'Escapadas con eventos cerca' }, 'eventos');
  }
  // Los planes del periodo elegido (un finde o un puente; con otras fechas, desde la entrada), no
  // siempre los de este finde: estaban dentro de «Lo mejor para…» con otras fechas.
  const r = pi.periodo.cuando ? rangoDe(pi.periodo.cuando === 'finde' ? actual.id : pi.periodo.cuando, contextoBusqueda(e)) : null;
  // Con otras fechas, las de fecha cerrada no se cuentan como de un finde (su id no coincide con ninguno).
  const periodoPlanes = r ? { id: r.id, desde: r.inicio } : pi.periodo.desde ? { id: `fechas:${pi.periodo.desde}`, desde: pi.periodo.desde } : periodoFinde(actual);
  const cuando = pi.todas ? nombreFindeEnFrase(e.hoy) : pi.dias || nombreFindeEnFrase(e.hoy);
  const planes = sinVistas(actividadesPara(e.datos.ofertas, periodoPlanes, { max: FILAS_IDEAS * 3, descartadas: ocultas(e) }), vistos, FILAS_IDEAS);
  return columnaIdeas('actividades', `Planes${pi.todas ? ` <small class="suave">(${esc(cuando)})</small>` : ''}`, planes.map((o) => filaIdea(o, '')), `No hay planes para ${esc(cuando)}.`,
    { href: crearHash('actividades', pi.todas ? {} : conPeriodoIdeas(e, 'actividades', {}, pi)), texto: 'Ver planes' }, 'eventos');
}

/**
 * Lo mejor para el periodo marcado en «¿Cuándo?» (por defecto, este finde): tres listas cortas
 * que se leen de un vistazo. Al cambiar las fechas arriba, app.js lo repinta (ideasPortada).
 */
export function ideasPortada(e, opcion = null, fechas = null, vistos = new Set()) {
  const { marcada, rango } = opcionesCuando(e);
  const valor = opcion ?? marcada;
  const pi = periodoIdeas(e, valor, fechas?.[0] ? fechas : rango);
  return `<section class="seccion portada__ideas" aria-labelledby="ideas-titulo" aria-live="polite">
  <div class="seccion__cabeza"><h2 id="ideas-titulo">${esc(pi.titulo)}${pi.dias ? ` <span class="suave">(${esc(pi.dias)})</span>` : ''}</h2></div>
  <div class="ideas">${columnaEscapadas(e, vistos, pi)}${columnaVuelos(e, vistos, pi)}${columnaEventos(e, vistos, pi)}</div>
</section>`;
}

/** Solo con favoritos: otras parecidas a lo que guardas (sin favoritos no hay nada que aprender). */
function grupoRecomendado(e, params, vistos) {
  const perfil = perfilFavoritos(e.datos.ofertas, e.favoritos);
  if (!perfil.total) return '';
  const f = leerFiltrosEscapadas(params);
  const busqueda = contextoBusqueda(e);
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, f, busqueda);
  const lista = recomendadas(ofertas.filter((o) => !vistos.has(o.id) && !sinComprobar(o, busqueda)), perfil, { ...busqueda, distancias }, { max: IDEAS_POR_GRUPO });
  if (!lista.length) return '';
  for (const r of lista) vistos.add(r.oferta.id);
  const ctx = ctxTarjetas(e, { distancias, desde: f.punto?.nombre ?? nombreSalida(e) });
  const gustos = perfil.temas.slice(0, 2).map(({ valor }) => e.temas.get(valor)?.nombre ?? valor).join(', ');
  return seccion(conIcono('corazon', 'Recomendado para ti'),
    `<p class="seccion__intro">Por tus ${contar(perfil.total, 'favorito')}${gustos ? `: te van los planes de ${esc(gustos.toLowerCase())}` : ''}.</p>
     <div class="rejilla">${lista.map((r) => tarjetaConMotivo(r, ctx)).join('')}</div>`);
}

/**
 * Desde la segunda visita, el buscador plegado en una línea («Este finde · Escapadas · Cambiar»):
 * así la primera oferta se ve sin bajar dos pantallas en el móvil. La primera vez, abierto.
 */
function buscadorPlegable(e) {
  const { opciones, marcada } = opcionesCuando(e);
  const [, rotulo, dias] = opciones.find(([valor]) => valor === marcada) ?? opciones[0];
  const resumen = [marcada === 'rango' && dias ? dias : rotulo, 'Escapadas'].join(' · ');
  return `<details class="buscador-plegable"${e.visitaAnterior ? '' : ' open'}>
  <summary class="buscador-plegable__resumen"><span class="buscador-plegable__texto">${icono('calendario')}${esc(resumen)}</span><span class="buscador-plegable__cambiar">Cambiar</span></summary>
  ${buscadorFinde(e)}
</details>`;
}

export function vistaFinde(e, params = {}) {
  // Cada bloque de abajo no repite lo que ya ha salido. Sin «Sugerencia de hoy»: era un
  // cuarto bloque de ideas y a menudo la misma oferta que la primera de la lista, desde otra web.
  // «Lo mejor para tus fechas» justo debajo del buscador: las ofertas, antes que los atajos.
  const vistos = new Set();
  return `<section class="portada">
  ${resumenViaje(e)}
  <h1 class="titulo-vista" tabindex="-1">Escapadas de fin de semana desde <em>${esc(nombreSalida(e))}</em></h1>
  <p class="portada__intro">¿Qué quieres organizar?</p>
  ${buscadorPlegable(e)}
  ${lineaConfianza(e)}
</section>
${ideasPortada(e, null, null, vistos)}
${atajosPortada(e)}
${bloqueSorpresa(e)}
${grupoRecomendado(e, params, vistos)}`;
}
