/**
 * Portada: primero buscar, después inspirarse. Tu viaje (una sola vez), ¿cuándo?, ¿qué
 * buscas?, destino opcional y un botón; debajo, una línea de estado, unos pocos atajos, la
 * sugerencia de hoy en corto y, plegadas, unas pocas ideas por apartado.
 */

import { nombreFinde, nombreFindeEnFrase } from './fechas.js';
import { contar, escaparHtml as esc, haceCuanto } from './formato.js';
import {
  actividadesPara, buscarActividades, buscarEscapadas, chollazos, chollosDeVuelos, conPeriodo, crearHash, filtrarVuelos,
  leerFiltrosActividades, leerFiltrosEscapadas, leerFiltrosVuelos, perfilFavoritos, periodoFinde, planesSorpresa,
  recomendadas, salidaPuente, sinComprobar, tieneVuelo,
} from './filtros.js';
import { estadoVacio, rejilla, tarjeta, tarjetaConMotivo, tarjetaSugerencia } from './plantillas.js';
import { icono } from './iconos.js';
import {
  HORAS_SORPRESA, conIcono, contextoBusqueda, ctxTarjetas, diasExplicitos, estadoWebs, etiquetaFinde, marcado, nombreSalida,
  ocultas, seccion,
} from './vistas-comun.js';

/** Cuántas tarjetas enseña cada grupo de «Más ideas»: el resto, en su apartado. */
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
    ...(rango ? [['rango', 'Tus fechas', diasExplicitos(...rango)]] : []),
    ['', 'Cualquier fecha', ''],
  ];
  // Sin nada elegido (o ya pasado: filtrosVigentes quita la clave), «Este finde»; «Cualquier
  // fecha» (cuando: '') solo si se eligió a propósito en Explorar.
  const elegido = rango ? 'rango' : periodo.cuando === actual.id ? 'finde' : periodo.cuando === 'puente' ? e.puente?.id : periodo.cuando;
  const marcada = elegido !== undefined && opciones.some(([valor]) => valor === elegido) ? elegido : 'finde';
  return { opciones, marcada, rango };
}

/** El periodo ({cuando, desde, hasta}) de una opción de «¿Cuándo?» («rango»: las fechas de Explorar). */
export function periodoDeOpcion(valor, rango = null) {
  return valor === 'rango' && rango ? { cuando: '', desde: rango[0], hasta: rango[1] } : { cuando: valor ?? '', desde: '', hasta: '' };
}

export function buscadorFinde(e) {
  const { opciones: cuando, marcada: marcadoCuando, rango } = opcionesCuando(e);
  const opcionCuando = ([valor, texto, dias]) => `<label class="opcion opcion--fecha"><input type="radio" name="cuando" value="${esc(valor)}" data-dias="${esc(dias)}"${marcado(valor === marcadoCuando)}><small>${esc(texto)}</small><span>${esc(dias || 'lo mejor que haya')}</span></label>`;
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
    ${rango ? `<input type="hidden" name="desde" value="${esc(rango[0])}"><input type="hidden" name="hasta" value="${esc(rango[1])}">` : ''}
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
export function atajosPortada(e, opcion = null) {
  const busqueda = contextoBusqueda(e);
  // Las fechas elegidas arriba (al cambiarlas, app.js repinta los atajos): las cifras y los
  // enlaces son de ese periodo. Antes cada atajo iba con las suyas («Planes gratis», este
  // finde; los otros, cualquier fecha) y al pulsarlo se perdían las que habías elegido.
  const { opciones, marcada, rango } = opcionesCuando(e);
  const valor = opcion ?? marcada;
  const p = periodoDeOpcion(valor, rango);
  const conFechas = (vista, params) => conPeriodo(vista, params, p, { finde: e.findes[0], puente: e.puente });
  const dias = opciones.find(([v]) => v === valor)?.[2];
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

// ── Más ideas: pocas por apartado, el resto en su sección ───────────────────

function grupoEscapadas(e, ctx, vistos) {
  const { ofertas } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ cuando: 'finde' }), contextoBusqueda(e));
  const lista = sinVistas(ofertas, vistos, IDEAS_POR_GRUPO);
  return seccion(conIcono('escapadas', `Escapadas para ${nombreFindeEnFrase(e.hoy)}`),
    lista.length ? rejilla(lista, ctx, { mostradas: IDEAS_POR_GRUPO, clave: 'finde-escapadas' }) : estadoVacio(`No hay escapadas para ${nombreFindeEnFrase(e.hoy)}.`),
    { href: crearHash('escapadas', { cuando: 'finde' }), texto: `Ver las ${ofertas.length}` });
}

function grupoVuelos(e, ctx, vistos) {
  const [actual] = e.findes;
  if (e.datos.ofertas.some(tieneVuelo)) {
    const vuelos = filtrarVuelos(e.datos.ofertas, { ...leerFiltrosVuelos(), finde: actual.id, orden: 'puntuacion' }, contextoBusqueda(e));
    return seccion(conIcono('vuelos', `Vuelos ${nombreFindeEnFrase(e.hoy)} <span class="suave">(${esc(actual.etiqueta)})</span>`),
      vuelos.length ? rejilla(sinVistas(vuelos, vistos, IDEAS_POR_GRUPO), ctx, { mostradas: IDEAS_POR_GRUPO, clave: `finde-vuelos-${actual.id}` }) : estadoVacio('Sin vuelos guardados para estas fechas.'),
      { href: crearHash('vuelos', { finde: actual.id }), texto: vuelos.length ? `Ver los ${vuelos.length}` : 'Ver vuelos' });
  }
  const chollos = sinVistas(chollosDeVuelos(e.datos.ofertas, leerFiltrosVuelos({ mios: '1' }), contextoBusqueda(e)), vistos, IDEAS_POR_GRUPO);
  return seccion(conIcono('vuelos', 'Chollos de vuelos <span class="suave">(sin fecha concreta, desde tus aeropuertos)</span>'),
    chollos.length ? rejilla(chollos, ctx, { mostradas: IDEAS_POR_GRUPO, clave: 'finde-chollos' }) : estadoVacio('Ahora mismo no hay chollos de vuelos desde tus aeropuertos.'),
    { href: crearHash('vuelos', { mios: '1' }), texto: 'Ver todos' });
}

/** «Planes para este finde»: entradas, visitas y free tours que se pueden reservar ya. */
function grupoPlanes(e, ctx, vistos) {
  const [actual] = e.findes;
  const lista = sinVistas(actividadesPara(e.datos.ofertas, periodoFinde(actual), { max: IDEAS_POR_GRUPO * 3, descartadas: ocultas(e) }), vistos, IDEAS_POR_GRUPO);
  return seccion(conIcono('actividades', `Planes para ${nombreFindeEnFrase(e.hoy)}`),
    lista.length ? rejilla(lista, ctx, { mostradas: IDEAS_POR_GRUPO, clave: 'finde-actividades' }) : estadoVacio(`No hay planes con fecha para ${nombreFindeEnFrase(e.hoy)}.`),
    { href: crearHash('actividades', {}), texto: 'Ver todos' });
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
  const ctx = ctxTarjetas(e);
  const busqueda = contextoBusqueda(e);
  // Las descartadas con ✕ no vuelven a salir, tampoco aquí; ni las que su web lleva días sin publicar.
  const ocultasFinde = ocultas(e);
  const destacado = chollazos(e.datos.ofertas).find((o) => !ocultasFinde.has(o.id) && !sinComprobar(o, busqueda)) ?? null;
  // Cada bloque de «Más ideas» no repite lo que ya ha salido (tampoco la sugerencia).
  const vistos = new Set(destacado ? [destacado.id] : []);
  return `<section class="portada">
  ${resumenViaje(e)}
  <h1 class="titulo-vista" tabindex="-1">¿Qué quieres <em>organizar</em>?</h1>
  <p class="portada__intro">Elige las fechas y el tipo de oferta. Puedes cambiarlo antes de ver resultados.</p>
  ${buscadorFinde(e)}
  ${lineaConfianza(e)}
</section>
${atajosPortada(e)}
${bloqueSorpresa(e)}
${destacado ? `<div class="portada__destacado">${tarjetaSugerencia(destacado, ctx)}</div>` : ''}
<details class="portada__mas">
<summary>Más ideas para ${nombreFindeEnFrase(e.hoy)} <span class="suave">(escapadas, vuelos y planes)</span></summary>
<div class="carruseles">
${grupoEscapadas(e, ctx, vistos)}
${grupoVuelos(e, ctx, vistos)}
${grupoPlanes(e, ctx, vistos)}
${grupoRecomendado(e, params, vistos)}
</div>
</details>`;
}
