/** Portada («Este finde»): chollazo destacado, buscador, sorpresa, puente, vuelos y planes. */

import { diasEntre, etiquetaDia } from './fechas.js';
import { contar, escaparHtml as esc, euros, haceCuanto } from './formato.js';
import {
  actividadesPara, buscarActividades, buscarEscapadas, chollazos, chollosDeVuelos, crearHash, filtrarVuelos,
  leerFiltrosActividades, leerFiltrosEscapadas, leerFiltrosVuelos, perfilFavoritos, periodoFinde, planesSorpresa,
  puenteDelFinde, recomendadas, resumenFuentes, sinComprobar, tieneVuelo,
} from './filtros.js';
import { estadoVacio, rejilla, tarjeta, tarjetaConMotivo, tarjetaDestacada } from './plantillas.js';
import { icono, iconoTema } from './iconos.js';
import {
  ACTIVIDADES_FINDE, HORAS_SORPRESA, conIcono, contextoBusqueda, ctxTarjetas, marcado, mostradas, nombreSalida,
  ocultas, seccion, webConProblemas,
} from './vistas-comun.js';

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

/**
 * Escapadas en las que los niños van gratis o con descuento (cualquier fecha): lo que busca
 * una familia. No sale si no hay ninguna.
 */
function bloqueNinos(e, ctx, vistos) {
  const { ofertas } = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ ninos: 'ventaja' }), contextoBusqueda(e));
  const lista = sinVistas(ofertas, vistos, 6);
  if (!lista.length) return '';
  return seccion(conIcono('tema-familia', 'Con niños: gratis o con descuento'), rejilla(lista, ctx, { mostradas: 6, clave: 'finde-ninos' }),
    { href: crearHash('escapadas', { ninos: 'ventaja' }), texto: `Ver las ${ofertas.length}` });
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

/** La primera vez: qué es esto y cómo se usa, en tres pasos (se cierra y no vuelve). */
function bienvenida(e) {
  if (e.bienvenidaVista) return '';
  // Las mismas webs que cuenta la línea de revisión de encima («… ofertas de 20 webs»).
  const webs = resumenFuentes(e.datos.fuentes).ok;
  return `<aside class="bienvenida" aria-label="Bienvenida">
  <p><strong>Ofertas de escapadas de ${webs} webs de viajes, juntas y revisadas cada 15 minutos.</strong> Elige cuándo, filtra lo que te apetece y reserva en la web de la oferta con «Ver en…».</p>
  <div class="acciones"><button type="button" class="boton boton--primario boton--mini" data-cerrar-bienvenida>Entendido</button><a class="boton boton--suave boton--mini" href="#/ayuda">Cómo funciona</a></div>
</aside>`;
}

/**
 * «De un vistazo»: lo que hay este finde en cuatro cifras que llevan a la lista (escapadas y
 * desde cuánto, chollazos, con niños gratis o con descuento y planes gratis).
 */
function vistazoPortada(e, escapadas) {
  const busqueda = contextoBusqueda(e);
  // Las mismas búsquedas que abren los enlaces: la cifra coincide con la lista.
  const top = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ cho: '1' }), busqueda).ofertas;
  const noches = escapadas.map((o) => o.precioNoche).filter((p) => p > 0);
  const ninos = buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas({ cuando: 'finde', ninos: 'ventaja' }), busqueda).ofertas.length;
  const gratis = buscarActividades(e.datos.ofertas, leerFiltrosActividades({ cuando: 'finde', gratis: '1' }), busqueda).length;
  const cifra = (n, texto, href, ic, extra = '') => (n
    ? `<li><a class="vistazo__cifra" href="${href}">${icono(ic)}<span><strong>${n.toLocaleString('es-ES')}</strong> ${esc(texto)}${extra ? `<span class="vistazo__extra">${esc(extra)}</span>` : ''}</span></a></li>`
    : '');
  const items = [
    cifra(escapadas.length, escapadas.length === 1 ? 'escapada este finde' : 'escapadas este finde', crearHash('escapadas', { cuando: 'finde', orden: 'noche' }), 'escapadas',
      noches.length ? `desde ${euros(Math.round(Math.min(...noches)))} por persona y noche` : ''),
    cifra(top.length, top.length === 1 ? 'chollazo' : 'chollazos', crearHash('escapadas', { cho: '1' }), 'fuego', 'muy por debajo de lo normal'),
    cifra(ninos, 'con niños gratis o con descuento', crearHash('escapadas', { cuando: 'finde', ninos: 'ventaja' }), 'tema-familia'),
    cifra(gratis, gratis === 1 ? 'plan gratis' : 'planes gratis', crearHash('actividades', { cuando: 'finde', gratis: '1' }), 'actividades', 'este finde'),
  ].join('');
  return items ? `<ul class="vistazo" aria-label="Este finde de un vistazo">${items}</ul>` : '';
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
  const problemas = webConProblemas(e.datos.fuentes, e.ahora);
  const avisoProblemas = problemas.length
    ? `<a class="portada__problemas" href="#/fuentes" title="${esc(problemas.map((f) => f.nombre).join(', '))}">${icono('alerta')}${contar(problemas.length, 'web', 'webs')} con problemas</a>`
    : '';
  return `<section class="portada">
  <div class="portada__texto">
    <p class="portada__ceja"><span class="pastilla">${icono('calendario')}<span>${esc(etiquetaDia(actual.viernes))} – ${esc(etiquetaDia(actual.domingo))}<span id="cuenta-atras" class="pastilla__extra"></span></span></span><span id="aviso-puente" class="pastilla pastilla--puente" hidden></span><span class="portada__revision"><span class="punto" aria-hidden="true"></span>${esc(revision)}</span>${avisoProblemas}</p>
    <h1 class="titulo-vista" tabindex="-1">¿Dónde nos escapamos <em>este finde</em>?</h1>
    ${bienvenida(e)}
    ${vistazoPortada(e, escapadas)}
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
${bloqueNinos(e, ctx, vistos)}
${bloqueRecomendado(e, params, vistos)}
${bloqueChollazos(e, ctx, top.filter((o) => !vistos.has(o.id)), vistos)}
</div>`;
}

