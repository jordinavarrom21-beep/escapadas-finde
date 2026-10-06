/**
 * Portada: primero buscar, después inspirarse. Tu viaje (una sola vez), ¿cuándo?, ¿qué
 * buscas?, destino opcional y un botón; debajo, una línea de estado, unos pocos atajos, la
 * «Lo mejor para este finde» en tres listas cortas.
 */

import { etiquetaDia, nombreFinde, nombreFindeEnFrase } from './fechas.js';
import { TIPOS_EVENTO, contar, duracion, escaparHtml as esc, euros, haceCuanto, normalizar } from './formato.js';
import {
  actividadesPara, buscarActividades, buscarEscapadas, chollosDeVuelos, conPeriodo, crearHash, filtrarVuelos,
  leerFiltrosActividades, leerFiltrosEscapadas, leerFiltrosVuelos, perfilFavoritos, periodoFinde, planesSorpresa,
  rangoDe, recomendadas, salidaPuente, sinComprobar, tieneVuelo,
} from './filtros.js';
import { estadoVacio, tarjeta, tarjetaConMotivo, textoFechas } from './plantillas.js';
import { icono } from './iconos.js';
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
    ...(siguiente ? [[siguiente.id, 'El siguiente', etiquetaFinde(siguiente, e.datos.puentes)]] : []),
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
  const opcionCuando = ([valor, texto, dias]) => `<label class="opcion opcion--fecha"><input type="radio" name="cuando" value="${esc(valor)}" data-dias="${esc(dias)}"${marcado(valor === marcadoCuando)}${valor === 'rango' ? ' aria-controls="buscador-finde-fechas"' : ''}><small>${esc(texto)}</small><span${valor === 'rango' ? ' data-dias-propios' : ''}>${esc(dias || (valor === 'rango' ? 'elige en el calendario' : 'lo mejor que haya'))}</span></label>`;
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
    <div class="buscador-finde__fechas" id="buscador-finde-fechas" data-fechas-propias${marcadoCuando === 'rango' ? '' : ' hidden'}>
      <label>Ida <input type="date" name="desde" min="${esc(e.hoy)}" value="${esc(rango?.[0] ?? '')}"></label>
      <label>Vuelta <input type="date" name="hasta" min="${esc(rango?.[0] ?? e.hoy)}" value="${esc(rango?.[1] ?? '')}"></label>
    </div>
  </fieldset>
  <fieldset class="buscador-finde__grupo"><legend>2. ¿Qué buscas?</legend>
    <div class="organizar">
      ${que('escapadas', 'escapadas', 'Escapadas', 'Hoteles, casas rurales y paquetes')}
      ${que('vuelos', 'vuelos', 'Vuelos', 'Trayectos de ida y vuelta')}
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
      <input id="buscador-finde-q" type="search" name="q" placeholder="Ciudad, zona u hotel" autocomplete="off" enterkeyhint="search">
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

/** Una sola línea: cuántas ofertas, cuándo se revisaron y cómo están las webs (lo mismo que el pie). */
function lineaConfianza(e) {
  const webs = estadoWebs(e.datos.fuentes, e.ahora);
  const nombres = webs.problemas.map((f) => f.nombre).join(', ');
  return `<p class="portada__confianza${webs.error ? ' portada__confianza--aviso' : ''}"><span class="punto" aria-hidden="true"></span>
  <span>${esc(e.datos.ofertas.length.toLocaleString('es-ES'))} ofertas · revisadas ${esc(haceCuanto(e.datos.generado, e.ahora))}</span>
  ${e.propietario ? `<a href="#/fuentes"${nombres ? ` title="${esc(nombres)}"` : ''}>${webs.error ? icono('alerta') : ''}${esc(webs.texto)}</a>` : ''}
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
  const n = {
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

const precioCorto = (o) => (o.precio === 0 ? 'Gratis' : `${euros(o.precio)}${UNIDAD_CORTA[o.unidad] ? ` <small>${UNIDAD_CORTA[o.unidad]}</small>` : ''}`);

/** Una fila: título (abre la ficha), precio y un dato que ayuda a decidir. */
function filaIdea(o, detalle) {
  return `<li class="idea"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button>
  <span class="idea__precio">${precioCorto(o)}</span>${detalle ? `<span class="idea__detalle">${detalle}</span>` : ''}</li>`;
}

function columnaIdeas(ic, titulo, filas, vacio, enlace) {
  return `<section class="ideas__columna" aria-label="${esc(titulo.replace(/<[^>]+>/g, ''))}">
  <h3>${icono(ic)}<span>${titulo}</span></h3>
  ${filas.length ? `<ul class="ideas__lista">${filas.join('')}</ul>` : `<p class="suave">${vacio}</p>`}
  <a class="ideas__mas" href="${enlace.href}">${esc(enlace.texto)}${icono('flecha')}</a></section>`;
}

function textoDistancia(d) {
  if (d?.minutos == null) return '';
  return `${icono('coche')} a ${d.minutos < 5 ? 'menos de 5 min' : esc(duracion(d.minutos))}`;
}

function columnaEscapadas(e, vistos) {
  const busqueda = contextoBusqueda(e);
  const params = { cuando: 'finde', h: String(HORAS_IDEAS), orden: 'total' };
  const { ofertas, distancias } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(params), busqueda);
  const lista = sinVistas(ofertas.filter((o) => !sinComprobar(o, busqueda)), vistos, FILAS_IDEAS);
  return columnaIdeas('escapadas', `Escapadas a menos de ${HORAS_IDEAS} h`,
    lista.map((o) => filaIdea(o, textoDistancia(distancias.get(o.id)))),
    `Nada a menos de ${HORAS_IDEAS} h de ${esc(nombreSalida(e))} para estas fechas.`,
    { href: crearHash('escapadas', params), texto: ofertas.length ? `Ver las ${ofertas.length}` : 'Ver escapadas' });
}

function columnaVuelos(e, vistos) {
  const [actual] = e.findes;
  const busqueda = contextoBusqueda(e);
  const vuelos = e.datos.ofertas.some(tieneVuelo)
    ? filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), finde: actual.id, orden: 'precio' }, busqueda)
    : [];
  if (vuelos.length) {
    // Un vuelo por destino (el más barato): cuatro a Londres no ayudan a decidir.
    const destinos = new Set();
    const variados = vuelos.filter((o) => { const d = o.lugar?.nombre ?? o.titulo; if (destinos.has(d)) return false; destinos.add(d); return true; });
    return columnaIdeas('vuelos', 'Vuelos', sinVistas(variados, vistos, FILAS_IDEAS).map((o) => filaIdea(o, esc(textoFechas(o)))), '',
      { href: crearHash('vuelos', { finde: actual.id }), texto: `Ver los ${vuelos.length}` });
  }
  // Sin vuelos con esas fechas, los chollos desde tus aeropuertos (de cualquier fecha, y lo dice).
  const chollos = sinVistas(chollosDeVuelos(e.datos.ofertas, leerFiltrosVuelos({ mios: '1' }), busqueda), vistos, FILAS_IDEAS);
  return columnaIdeas('vuelos', 'Chollos de vuelos <small class="suave">(otras fechas)</small>',
    chollos.map((o) => filaIdea(o, esc(textoFechas(o)))), 'Sin vuelos baratos desde tus aeropuertos ahora mismo.',
    { href: crearHash('vuelos', { mios: '1' }), texto: 'Ver vuelos' });
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

/** Una fila de evento: nombre (abre la escapada de al lado), tipo, día y pueblo. */
export function filaEvento(ev) {
  const tipo = TIPOS_EVENTO[ev.tipo]?.[0] ?? 'Evento';
  const donde = ev.oferta.lugar?.nombre ? ` · ${esc(ev.oferta.lugar.nombre)}` : '';
  return `<li class="idea idea--evento"><button type="button" class="enlace-ficha" data-ficha="${esc(ev.oferta.id)}" title="Ver la escapada más barata al lado">${esc(ev.nombre)}</button>
  <span class="idea__detalle">${esc(tipo)} · ${esc(etiquetaDia(ev.fecha))}${donde}</span></li>`;
}

function columnaEventos(e, vistos) {
  const [actual] = e.findes;
  const { eventos } = eventosCerca(e);
  if (eventos.length) {
    return columnaIdeas('tema-eventos', 'Conciertos y fiestas', eventos.map(filaEvento), '',
      { href: crearHash('escapadas', { cuando: 'finde', evtipo: 'todos' }), texto: 'Escapadas con eventos cerca' });
  }
  const planes = sinVistas(actividadesPara(e.datos.ofertas, periodoFinde(actual), { max: FILAS_IDEAS * 3, descartadas: ocultas(e) }), vistos, FILAS_IDEAS);
  return columnaIdeas('actividades', 'Planes', planes.map((o) => filaIdea(o, '')), `No hay planes con fecha para ${nombreFindeEnFrase(e.hoy)}.`,
    { href: crearHash('actividades', {}), texto: 'Ver planes' });
}

/** Lo mejor para este finde, a la vista: tres listas cortas que se leen de un vistazo. */
function ideasFinde(e, vistos) {
  const [actual] = e.findes;
  return `<section class="seccion portada__ideas" aria-labelledby="ideas-titulo">
  <div class="seccion__cabeza"><h2 id="ideas-titulo">Lo mejor para ${nombreFindeEnFrase(e.hoy)} <span class="suave">(${esc(actual.etiqueta)})</span></h2></div>
  <div class="ideas">${columnaEscapadas(e, vistos)}${columnaVuelos(e, vistos)}${columnaEventos(e, vistos)}</div>
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

export function vistaFinde(e, params = {}) {
  // Cada bloque de abajo no repite lo que ya ha salido. Sin «Sugerencia de hoy»: era un
  // cuarto bloque de ideas y a menudo la misma oferta que la primera de la lista, desde otra web.
  const vistos = new Set();
  return `<section class="portada">
  ${resumenViaje(e)}
  <h1 class="titulo-vista" tabindex="-1">¿Qué quieres <em>organizar</em>?</h1>
  <p class="portada__intro">Elige las fechas y el tipo de oferta. Puedes cambiarlo antes de ver resultados.</p>
  ${buscadorFinde(e)}
  ${lineaConfianza(e)}
</section>
${atajosPortada(e)}
${bloqueSorpresa(e)}
${ideasFinde(e, vistos)}
${grupoRecomendado(e, params, vistos)}`;
}
