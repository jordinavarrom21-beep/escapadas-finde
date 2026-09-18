/**
 * Plantillas HTML (cadenas) de tarjetas, listas, estados vacíos y la ficha.
 * Todo el texto externo pasa por escaparHtml y los enlaces por urlSegura.
 */

import { etiquetaDia, horaDe } from './fechas.js';
import {
  ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE, ETIQUETAS_UNIDAD,
  contar, duracion, escaparHtml as esc, euros, haceCuanto, puntosMinigrafica, urlSegura,
} from './formato.js';
import { esNovedad, tieneVuelo } from './filtros.js';

export const ESTADOS_FUENTE = {
  ok: { texto: 'Funciona', clase: 'ok' },
  error: { texto: 'Con errores', clase: 'error' },
  desactivada: { texto: 'Desactivada', clase: 'inactiva' },
  bloqueada: { texto: 'Bloqueada', clase: 'inactiva' },
  pendiente: { texto: 'Pendiente', clase: 'pendiente' },
};

const colorTema = (o) => (o.temas?.[0] ? `var(--tema-${o.temas[0]})` : 'var(--acento)');

function temasEmoji(o, ctx) {
  return (o.temas ?? []).map((id) => ctx.temas.get(id)).filter(Boolean)
    .map((t) => `<span class="emoji-tema" title="${esc(t.nombre)}" role="img" aria-label="${esc(t.nombre)}">${t.emoji}</span>`)
    .join('');
}

function insignias(o, ctx) {
  const etiquetas = o.etiquetas ?? [];
  const lista = [
    esNovedad(o, ctx.referencia) && '<span class="insignia insignia--nueva">Nuevo</span>',
    o.minimoHistorico && '<span class="insignia insignia--minimo">Mínimo histórico</span>',
    o.bajada > 0 && `<span class="insignia insignia--bajada">↓ ${euros(o.bajada)}</span>`,
    etiquetas.includes('error-tarifa') && '<span class="insignia insignia--alerta">Error de tarifa</span>',
    etiquetas.includes('top-chollo') && '<span class="insignia insignia--alerta">Top chollo</span>',
  ];
  return lista.filter(Boolean).join('');
}

function puntuacion(o) {
  const nivel = o.chollazo ? 'alta' : o.puntuacion >= 60 ? 'media' : 'baja';
  return `<span class="puntuacion puntuacion--${nivel}" title="Puntuación ${o.puntuacion} de 100" aria-label="Puntuación ${o.puntuacion} de 100">${o.puntuacion}</span>`;
}

function botonFavorito(o, ctx) {
  const activo = ctx.favoritos.has(o.id);
  return `<button type="button" class="boton-icono boton-fav" data-fav="${esc(o.id)}" aria-pressed="${activo}" aria-label="Guardar en favoritos: ${esc(o.titulo)}">${activo ? '★' : '☆'}</button>`;
}

function enlaceOferta(o, texto = 'Ver oferta') {
  const url = urlSegura(o.url);
  return url ? `<a class="boton boton--primario" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${texto}<span class="sr"> (se abre en otra pestaña)</span></a>` : '';
}

function precio(o) {
  if (typeof o.precio !== 'number') return `<p class="precio"><strong class="precio__consultar">${esc(o.precioTexto || 'Consultar precio')}</strong></p>`;
  const unidad = ETIQUETAS_UNIDAD[o.unidad] ?? '';
  return `<p class="precio"><strong>${euros(o.precio)}</strong>${unidad ? ` <span class="precio__unidad">${unidad}</span>` : ''}${
    o.precioAnterior > o.precio ? ` <s class="precio__anterior">${euros(o.precioAnterior)}</s>` : ''}${
    o.descuento ? ` <span class="precio__descuento">−${o.descuento} %</span>` : ''}</p>`;
}

function textoFechas(o) {
  const { salida, vuelta } = o.fechas ?? {};
  if (salida) return vuelta ? `${etiquetaDia(salida)} – ${etiquetaDia(vuelta)}` : etiquetaDia(salida);
  return o.caduca ? `Fechas flexibles · hasta el ${etiquetaDia(o.caduca)}` : 'Fechas flexibles';
}

function textoCoche(distancia, desde) {
  if (!distancia) return '';
  if (distancia.minutos != null) {
    return `<span class="coche" title="En coche desde ${esc(desde)}">🚗 ${duracion(distancia.minutos)}${distancia.estimado ? ' aprox.' : ''}</span>`;
  }
  return `<span class="coche" title="En línea recta desde ${esc(desde)}">📍 ${Math.round(distancia.km)} km</span>`;
}

function textoLugar(o) {
  const l = o.lugar;
  if (!l?.nombre) return '';
  const zona = [l.region, l.pais !== 'España' ? l.pais : null].filter((parte) => parte && parte !== l.nombre).join(', ');
  return `📍 ${esc(l.nombre)}${zona ? `<span class="suave">, ${esc(zona)}</span>` : ''}`;
}

/** Tarjeta de escapada, hotel, paquete o chollo de vuelo sin fechas. */
export function tarjetaOferta(o, ctx) {
  const detalles = [
    textoFechas(o),
    o.noches && contar(o.noches, 'noche'),
    ETIQUETAS_REGIMEN[o.regimen],
    ETIQUETAS_TRANSPORTE[o.transporte],
  ].filter(Boolean).map(esc).join(' · ');
  const url = urlSegura(o.imagen);
  return `<article class="tarjeta" style="--color-tema:${colorTema(o)}">
  ${url ? `<img class="tarjeta__imagen" src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="270">` : ''}
  <div class="tarjeta__cuerpo">
    <div class="tarjeta__cabeza">
      <span class="tarjeta__temas">${temasEmoji(o, ctx)}</span>
      <span class="tarjeta__origen">${esc(ETIQUETAS_TIPO[o.tipo] ?? o.tipo)} · ${esc(ctx.fuentes.get(o.fuente) ?? o.fuente)}</span>
      ${puntuacion(o)}
    </div>
    <h3 class="tarjeta__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button></h3>
    <p class="tarjeta__lugar">${textoLugar(o)} ${textoCoche(ctx.distancias?.get(o.id), ctx.desde)}</p>
    <p class="tarjeta__detalles">${detalles}</p>
    <div class="insignias">${insignias(o, ctx)}</div>
    <div class="tarjeta__pie">
      ${precio(o)}
      <div class="acciones">${botonFavorito(o, ctx)}${enlaceOferta(o)}</div>
    </div>
  </div>
</article>`;
}

/** Minigráfica SVG del historial de precios (vacía si hay menos de dos puntos). */
export function minigrafica(serie) {
  const puntos = puntosMinigrafica(serie);
  if (!puntos) return '';
  const [primero, ultimo] = [serie[0][1], serie.at(-1)[1]];
  return `<svg class="minigrafica" viewBox="0 0 96 28" width="96" height="28" role="img" aria-label="Historial de ${serie.length} días: de ${euros(primero)} a ${euros(ultimo)}"><polyline points="${puntos}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function tramo(nombre, t, conNumero = false) {
  if (!t) return '';
  const numero = conNumero && t.numero ? ` <span class="suave">(${esc(t.numero)})</span>` : '';
  return `<div><dt>${nombre}</dt><dd>${esc(etiquetaDia(t.salida))} · <strong>${esc(horaDe(t.salida))}</strong> → ${esc(horaDe(t.llegada))}${numero}</dd></div>`;
}

/** Tarjeta tipo billete de un vuelo con fechas. */
export function tarjetaVuelo(o, ctx) {
  const v = o.vuelo;
  const extras = [
    v.horarioIdeal && '<span class="insignia insignia--ideal">Horario ideal</span>',
    v.patron === 'puente' && '<span class="insignia insignia--puente">Puente</span>',
    v.nuevaRuta && '<span class="insignia insignia--nueva">Nueva ruta</span>',
  ].filter(Boolean).join('');
  const desglose = v.ida?.precio != null && v.vuelta?.precio != null ? `<p class="billete__desglose">${euros(v.ida.precio)} + ${euros(v.vuelta.precio)}</p>` : '';
  const pais = o.lugar?.pais ? `<span class="suave">, ${esc(o.lugar.pais)}</span>` : '';
  return `<article class="billete">
  <div class="billete__cuerpo">
    <div class="billete__principal">
      <p class="billete__ruta" aria-label="De ${esc(v.origen)} a ${esc(v.destino)}"><span>${esc(v.origen)}</span><span class="billete__avion" aria-hidden="true">✈</span><span>${esc(v.destino)}</span></p>
      <h3 class="tarjeta__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.lugar?.nombre ?? o.titulo)}</button>${pais}</h3>
      <dl class="billete__tramos">${tramo('Ida', v.ida)}${tramo('Vuelta', v.vuelta)}</dl>
    </div>
    <div class="billete__talon">
      ${puntuacion(o)}
      ${precio(o)}
      ${desglose}
      ${minigrafica(ctx.historial?.[o.id])}
    </div>
  </div>
  <div class="billete__pie">
    <div class="insignias">${extras}${insignias(o, ctx)}</div>
    <div class="acciones">${botonFavorito(o, ctx)}${enlaceOferta(o, 'Reservar')}</div>
  </div>
</article>`;
}

export const tarjeta = (o, ctx) => (tieneVuelo(o) ? tarjetaVuelo(o, ctx) : tarjetaOferta(o, ctx));

/** Rejilla de tarjetas con botón «Ver más» (`clave` identifica la lista para paginar). */
export function rejilla(lista, ctx, { mostradas, clave }) {
  const visibles = lista.slice(0, mostradas);
  const quedan = lista.length - visibles.length;
  return `<div class="rejilla" data-lista="${esc(clave)}">${visibles.map((o) => tarjeta(o, ctx)).join('')}</div>${
    quedan > 0 ? `<button type="button" class="boton boton--mas" data-mas="${esc(clave)}" data-desde="${visibles.length}">Ver más <span class="suave">(quedan ${quedan.toLocaleString('es-ES')})</span></button>` : ''}`;
}

export function estadoVacio(titulo, texto = '', extra = '') {
  return `<div class="vacio"><p class="vacio__titulo">${titulo}</p>${texto ? `<p>${texto}</p>` : ''}${extra}</div>`;
}

/** Fila compacta (título, precio y fechas) para listas largas como las de vigilados. */
export function filaOferta(o) {
  return `<li class="fila"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button>
  <span class="fila__precio">${euros(o.precio)}</span><span class="suave">${esc(textoFechas(o))}</span></li>`;
}

/** Explica desde dónde se miden las distancias en el buscador por ubicación. */
export function textoAyudaUbicacion(punto, origen) {
  return punto
    ? `Midiendo desde ${punto.nombre} (estimación: línea recta × 1,3 a 80 km/h).`
    : `Midiendo desde ${origen.nombre} con el tiempo real por carretera.`;
}

export function insigniaEstado(estado) {
  const { texto, clase } = ESTADOS_FUENTE[estado] ?? { texto: estado, clase: 'pendiente' };
  return `<span class="estado estado--${clase}"><span class="punto" aria-hidden="true"></span>${esc(texto)}</span>`;
}

function datosFicha(o) {
  const filas = [
    ['Fechas', textoFechas(o)],
    ['Noches', o.noches],
    ['Régimen', ETIQUETAS_REGIMEN[o.regimen]],
    ['Transporte', ETIQUETAS_TRANSPORTE[o.transporte]],
    ['Precio en la web', o.precioTexto],
    ['Publicada', o.publicada && etiquetaDia(o.publicada)],
    ['Vista por primera vez', o.vistaPrimera && haceCuanto(o.vistaPrimera)],
    ['Puntuación', `${o.puntuacion} / 100`],
  ];
  return filas.filter(([, valor]) => valor).map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`).join('');
}

function cocheFicha(o, ctx) {
  const d = ctx.distancias?.get(o.id);
  if (!d) return '';
  const tiempo = d.minutos != null ? `${duracion(d.minutos)} en coche${d.estimado ? ' (estimado)' : ''}` : 'No se llega en coche';
  return `<p class="ficha__coche">🚗 <strong>${tiempo}</strong> · ${Math.round(d.km)} km en línea recta desde ${esc(ctx.desde)}</p>`;
}

function vueloFicha(v) {
  if (!v) return '';
  return `<dl class="billete__tramos ficha__tramos">${tramo('Ida', v.ida, true)}${tramo('Vuelta', v.vuelta, true)}</dl>`;
}

function enlacesFicha(o) {
  const enlaces = [...(o.enlaces ?? [])];
  if (!enlaces.some((e) => e.url === o.url)) enlaces.unshift({ etiqueta: 'Ver la oferta', url: o.url });
  return enlaces
    .map((e) => ({ ...e, url: urlSegura(e.url) }))
    .filter((e) => e.url)
    .map((e, i) => `<li><a class="boton ${i ? '' : 'boton--primario'}" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.etiqueta)}<span class="sr"> (se abre en otra pestaña)</span></a></li>`)
    .join('');
}

/** Contenido de la ficha (modal) de una oferta; la gráfica se dibuja después en #ficha-grafica. */
export function contenidoFicha(o, ctx) {
  const imagen = urlSegura(o.imagen);
  const serie = ctx.historial?.[o.id] ?? [];
  return `<header class="ficha__cabeza" style="--color-tema:${colorTema(o)}">
  <p class="tarjeta__origen">${temasEmoji(o, ctx)} ${esc(ETIQUETAS_TIPO[o.tipo] ?? o.tipo)} · ${esc(ctx.fuentes.get(o.fuente) ?? o.fuente)}</p>
  <h2 id="ficha-titulo">${esc(o.titulo)}</h2>
  <p class="tarjeta__lugar">${textoLugar(o)}</p>
</header>
${imagen ? `<img class="ficha__imagen" src="${esc(imagen)}" alt="" referrerpolicy="no-referrer">` : ''}
<div class="ficha__precio">${precio(o)}${botonFavorito(o, ctx)}</div>
<div class="insignias">${insignias(o, ctx)}</div>
${vueloFicha(o.vuelo)}
${o.descripcion ? `<p class="ficha__descripcion">${esc(o.descripcion)}</p>` : ''}
${cocheFicha(o, ctx)}
<dl class="ficha__datos">${datosFicha(o)}</dl>
<section class="ficha__historial" aria-labelledby="ficha-historial-titulo">
  <h3 id="ficha-historial-titulo">Historial de precios</h3>
  ${serie.length >= 2
    ? `<div class="ficha__grafica"><canvas id="ficha-grafica" role="img" aria-label="Evolución del precio en ${serie.length} días"></canvas></div>
       <p class="suave">Mínimo ${euros(Math.min(...serie.map(([, p]) => p)))} · máximo ${euros(Math.max(...serie.map(([, p]) => p)))} · desde el ${esc(etiquetaDia(serie[0][0]))}</p>`
    : '<p class="suave">Aún no hay historial suficiente (hacen falta al menos dos días).</p>'}
</section>
<h3>Enlaces</h3>
<ul class="ficha__enlaces">${enlacesFicha(o)}</ul>`;
}
