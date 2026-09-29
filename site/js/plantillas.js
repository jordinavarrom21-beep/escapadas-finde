/**
 * Plantillas HTML (cadenas) de tarjetas, listas, estados vacíos y la ficha.
 * Todo el texto externo pasa por escaparHtml y los enlaces por urlSegura.
 */

import { diasEntre, etiquetaDia, fechaLocal, horaDe } from './fechas.js';
import {
  ETIQUETAS_ALOJAMIENTO, ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE, ETIQUETAS_UNIDAD, SIN_UNIDAD,
  contar, duracion, emojiTiempo, enumerar, escaparHtml as esc, euros, grados, haceCuanto, nota,
  puntosMinigrafica, urlSegura,
} from './formato.js';
import { SIN_COCHE, duracionActividad, esDuplicada, esNovedad, tieneVuelo } from './filtros.js';

export const ESTADOS_FUENTE = {
  ok: { texto: 'Funciona', clase: 'ok' },
  error: { texto: 'Con errores', clase: 'error' },
  desactivada: { texto: 'Desactivada', clase: 'inactiva' },
  bloqueada: { texto: 'Bloqueada', clase: 'inactiva' },
  pendiente: { texto: 'Pendiente', clase: 'pendiente' },
};

const colorTema = (o) => (o.temas?.[0] ? `var(--tema-${o.temas[0]})` : 'var(--acento)');
const envolverDato = (contenido) => (contenido ? `<p class="dato-extra">${contenido}</p>` : '');

function temasEmoji(o, ctx) {
  return (o.temas ?? []).map((id) => ctx.temas.get(id)).filter(Boolean)
    .map((t) => `<span class="emoji-tema" title="${esc(t.nombre)}" role="img" aria-label="${esc(t.nombre)}">${t.emoji}</span>`)
    .join('');
}

/** «Un 23 % por debajo de lo normal», comparando con ofertas parecidas. */
function insigniaReferencia(o) {
  const r = o.referencia;
  if (!(r?.ahorroPct > 0)) return '';
  const detalle = `Lo normal en ${esc(r.grupo ?? 'ofertas parecidas')}${r.n ? ` (${r.n})` : ''} es ${euros(r.mediana)}`;
  return `<span class="insignia insignia--ahorro" title="${detalle}">Un ${r.ahorroPct} % por debajo de lo normal</span>`;
}

/** «Precio más bajo en 23 días», con los días de historial que lo respaldan. */
function textoMinimo(o, ctx) {
  const serie = ctx.historial?.[o.id];
  if (!o.minimoHistorico) return null;
  if (!serie?.length) return { texto: 'Mínimo histórico', detalle: 'El precio más bajo registrado por el vigilante' };
  const dias = diasEntre(serie[0][0], serie.at(-1)[0]);
  return {
    texto: `Precio más bajo en ${dias} días`,
    detalle: `El más bajo desde el ${etiquetaDia(serie[0][0])} (${serie.length} días con precio; máximo ${euros(Math.max(...serie.map(([, p]) => p)))})`,
  };
}

const textoBajada = (o) => (o.bajada > 0 && typeof o.precio === 'number'
  ? `Ha bajado ${euros(o.bajada)}: el precio más alto de los últimos 7 días fue ${euros(Math.round((o.precio + o.bajada) * 100) / 100)}`
  : null);

function insignias(o, ctx) {
  const etiquetas = o.etiquetas ?? [];
  const minimo = textoMinimo(o, ctx);
  const lista = [
    esNovedad(o, ctx.referencia) && '<span class="insignia insignia--nueva">Nuevo</span>',
    o.chollazo && `<span class="insignia insignia--chollazo"${o.chollazoMotivo ? ` title="${esc(o.chollazoMotivo)}"` : ''}>🔥 Chollazo</span>`,
    minimo && `<span class="insignia insignia--minimo" title="${esc(minimo.detalle)}">${esc(minimo.texto)}</span>`,
    o.bajada > 0 && `<span class="insignia insignia--bajada" title="${esc(textoBajada(o))}">↓ ${euros(o.bajada)}</span>`,
    insigniaReferencia(o),
    etiquetas.includes('error-tarifa') && '<span class="insignia insignia--alerta">Error de tarifa</span>',
    etiquetas.includes('top-chollo') && '<span class="insignia insignia--alerta">Top chollo</span>',
    esDuplicada(o) && `<span class="insignia">${o.equivalentes?.length ? 'Repetida en otra web' : 'Repetida en la misma web'}</span>`,
  ];
  return lista.filter(Boolean).join('');
}

/** «También en Atrápalo por 86 €». */
function equivalentes(o, ctx) {
  const lista = o.equivalentes ?? [];
  if (!lista.length) return '';
  const [primera] = lista;
  const nombre = esc(ctx.fuentes?.get(primera.fuente) ?? primera.fuente);
  const url = urlSegura(primera.url);
  const precio = typeof primera.precio === 'number' ? ` por ${euros(primera.precio)}` : '';
  const resto = lista.length > 1 ? ` y en ${contar(lista.length - 1, 'web')} más` : '';
  const enlace = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${nombre}</a>` : nombre;
  return `<p class="dato-extra">🔁 También en ${enlace}${precio}${resto}</p>`;
}

/** Tren, bus, avión o ferry: la oferta ya dice cómo se llega y el coche no es el plan. */
const conTransporteIncluido = (o) => SIN_COCHE.includes(o.transporte);

/** «⛽ ≈ 34 € de gasolina ida y vuelta · estimado, un coche para 2 personas» (sin etiqueta: se envuelve fuera). */
function textoCosteCoche(o, ctx) {
  if (!(o.costeCoche?.eur > 0) || conTransporteIncluido(o)) return '';
  const personas = ctx.viajeros ? ` para ${contar(ctx.viajeros, 'persona')}` : '';
  const litros = o.costeCoche.litros ? `: ${o.costeCoche.litros.toLocaleString('es-ES', { maximumFractionDigits: 1 })} l` : '';
  return `<span class="coste-coche" title="Estimación con el consumo y el precio medio del carburante${litros}. Sin peajes ni aparcamiento.">⛽ ≈ ${euros(Math.round(o.costeCoche.eur))} de gasolina ida y vuelta · estimado, un coche${personas}</span>`;
}

/**
 * ¿La oferta tiene sus propias fechas de viaje (salida, finde o puente)? Si no, el tiempo
 * y los eventos que trae son los del próximo finde: una suposición, no los de su viaje.
 */
const conFechasDeViaje = (o) => Boolean(o.fechas?.salida || o.fechas?.findeId || o.fechas?.puenteId);

/** «☀️ 24° · 10 % de lluvia» del finde o puente de la oferta. */
function tiempo(o) {
  const t = o.tiempo;
  if (!t) return '';
  const supuesto = !conFechasDeViaje(o) && t.dia ? `Si vas el ${esc(etiquetaDia(t.dia))}: ` : '';
  const partes = [
    `${emojiTiempo(t.codigo)} ${t.texto ? esc(t.texto) : ''}`.trim(),
    t.maxC != null && grados(t.maxC),
    t.lluviaPct != null && `${t.lluviaPct} % de lluvia`,
    t.dia && esc(etiquetaDia(t.dia)),
  ].filter(Boolean);
  return `<p class="dato-extra">${supuesto}${partes.join(' · ')}</p>`;
}

/** Hasta tres eventos cerca del destino esos días. */
function eventos(o, { conEnlace = false } = {}) {
  const lista = (o.eventos ?? []).slice(0, 3);
  if (!lista.length) return '';
  const filas = lista.map((ev) => {
    const url = conEnlace ? urlSegura(ev.url) : null;
    const nombre = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(ev.nombre)}</a>`
      : esc(ev.nombre);
    const cuando = ev.fecha ? ` <span class="suave">${esc(etiquetaDia(ev.fecha))}</span>` : '';
    return `<li>${nombre}${cuando}</li>`;
  });
  return `<ul class="eventos" aria-label="Eventos esos días">${filas.join('')}</ul>`;
}

/** «⭐ 8,6» con el número de opiniones. */
function valoracion(o) {
  const v = o.valoracion;
  if (!(v?.nota >= 0)) return '';
  const opiniones = v.n ? ` (${contar(v.n, 'opinión', 'opiniones')})` : '';
  return `<span class="valoracion" title="Valoración ${nota(v.nota)} sobre 10${opiniones}">⭐ ${nota(v.nota)}</span>`;
}

function puntuacion(o) {
  const nivel = o.chollazo ? 'alta' : o.puntuacion >= 60 ? 'media' : 'baja';
  return `<span class="puntuacion puntuacion--${nivel}" title="Puntuación ${o.puntuacion} de 100" aria-label="Puntuación ${o.puntuacion} de 100">${o.puntuacion}</span>`;
}

function botonFavorito(o, ctx) {
  const activo = ctx.favoritos.has(o.id);
  return `<button type="button" class="boton-icono boton-fav" data-fav="${esc(o.id)}" aria-pressed="${activo}" aria-label="Guardar en favoritos: ${esc(o.titulo)}">${activo ? '★' : '☆'}</button>`;
}

/** ✕ para ocultar la oferta en este navegador. */
function botonDescartar(o) {
  return `<button type="button" class="boton-icono boton-icono--mini boton-descartar" data-descartar="${esc(o.id)}" title="Ocultar esta oferta" aria-label="Ocultar esta oferta: ${esc(o.titulo)}">✕</button>`;
}

function enlaceOferta(o, texto = 'Ver oferta') {
  const url = urlSegura(o.url);
  return url ? `<a class="boton boton--primario" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${texto}<span class="sr"> (se abre en otra pestaña)</span></a>` : '';
}

/** Lo que añade la web al «Gratis» («con propina voluntaria»), sin repetir la palabra. */
function matiz(precioTexto = '') {
  const resto = String(precioTexto ?? '').replace(/^\s*gratis\s*[·,:-]?\s*/i, '').trim();
  return resto ? ` <span class="precio__unidad">${esc(resto)}</span>` : '';
}

/**
 * Sin fechas concretas (o si la web dice «desde»), el importe es el mínimo publicado: el de
 * unas fechas concretas puede ser otro y la disponibilidad no está confirmada.
 */
export const esPrecioDesde = (o) => !o.fechas?.salida || /\bdesde\b/i.test(o.precioTexto ?? '');

/** Qué certeza hay sobre el precio y la disponibilidad, para la ficha. */
function certeza(o) {
  if (typeof o.precio !== 'number') return 'La web no publica precio: consúltalo al reservar';
  const cuando = o.vistaUltima ? ' cuando se comprobó' : '';
  return esPrecioDesde(o)
    ? `Precio mínimo que publicaba la web${cuando}; el de tus fechas y la disponibilidad se confirman al reservar`
    : `Precio para estas fechas según la web${cuando}; puede cambiar hasta que reserves`;
}

/** Cómo sale el «≈ por persona y noche» a partir de lo que publica la web. */
function calculoPorNoche(o) {
  const noches = o.noches ? ` entre ${contar(o.noches, 'noche')}` : '';
  const personas = ['noche', 'total'].includes(o.unidad) && o.precio && o.precioNoche
    ? ` y entre ${Math.round(o.precio / o.precioNoche / (o.unidad === 'total' ? o.noches || 1 : 1))} personas`
    : '';
  return `Cálculo: ${euros(o.precio)} ${ETIQUETAS_UNIDAD[o.unidad] ?? ''}${noches}${personas}`;
}

function precio(o) {
  if (typeof o.precio !== 'number') return `<p class="precio"><strong class="precio__consultar">${esc(o.precioTexto || 'Consultar precio')}</strong></p>`;
  if (o.precio === 0) return `<p class="precio"><strong class="precio__gratis">Gratis</strong>${matiz(o.precioTexto)}</p>`;
  const unidad = ETIQUETAS_UNIDAD[o.unidad] ?? SIN_UNIDAD;
  const noche = o.precioNoche != null && o.unidad !== 'pp/noche'
    ? ` <span class="precio__noche" title="${esc(calculoPorNoche(o))}">≈ ${euros(Math.round(o.precioNoche))} por persona y noche</span>`
    : '';
  const desde = esPrecioDesde(o) ? '<span class="precio__desde" title="Precio mínimo publicado: depende de las fechas y la disponibilidad">desde </span>' : '';
  return `<p class="precio">${desde}<strong>${euros(o.precio)}</strong>${unidad ? ` <span class="precio__unidad">${unidad}</span>` : ''}${
    o.precioAnterior > o.precio ? ` <s class="precio__anterior">${euros(o.precioAnterior)}</s>` : ''}${
    o.descuento ? ` <span class="precio__descuento">−${o.descuento} %</span>` : ''}${noche}</p>`;
}

/** Fechas del viaje: las concretas o «Fechas flexibles». La caducidad de la promoción va aparte. */
function textoFechas(o) {
  const { salida, vuelta } = o.fechas ?? {};
  if (salida) return vuelta ? `${etiquetaDia(salida)} – ${etiquetaDia(vuelta)}` : etiquetaDia(salida);
  return 'Fechas flexibles';
}

/**
 * «Promoción hasta el mié 30 sep»: hasta cuándo se puede reservar, que no es cuándo se viaja.
 * No se enseña si la oferta ya tiene fechas (la caducidad es la propia salida) ni si la
 * fecha la ha supuesto el vigilante (las newsletters no la publican).
 */
function textoCaducidad(o) {
  if (!o.caduca || o.fechas?.salida || (o.etiquetas ?? []).includes('caduca-estimada')) return '';
  return `Promoción hasta el ${etiquetaDia(fechaLocal(o.caduca))}`;
}

function textoCoche(distancia, desde, o) {
  if (!distancia) return '';
  if (conTransporteIncluido(o)) {
    return `<span class="coche" title="Distancia en línea recta desde ${esc(desde)}">📍 ${Math.round(distancia.km)} km</span>`;
  }
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
  const minutos = duracionActividad(o);
  const detalles = [
    textoFechas(o),
    textoCaducidad(o) && `⏳ ${textoCaducidad(o)}`,
    minutos && `⏱️ ${duracion(minutos)}`,
    o.noches && contar(o.noches, 'noche'),
    ETIQUETAS_ALOJAMIENTO[o.alojamiento],
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
      ${botonDescartar(o)}
    </div>
    <h3 class="tarjeta__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button></h3>
    <p class="tarjeta__lugar">${textoLugar(o)} ${textoCoche(ctx.distancias?.get(o.id), ctx.desde, o)}</p>
    <p class="tarjeta__detalles">${detalles} ${valoracion(o)}</p>
    ${conFechasDeViaje(o) ? tiempo(o) : ''}${envolverDato(textoCosteCoche(o, ctx))}${equivalentes(o, ctx)}${conFechasDeViaje(o) ? eventos(o) : ''}
    <div class="insignias">${insignias(o, ctx)}</div>
    ${textoComprobada(o, ctx)}
    <div class="tarjeta__pie">
      ${precio(o)}
      <div class="acciones">${botonFavorito(o, ctx)}${enlaceOferta(o)}</div>
    </div>
  </div>
</article>`;
}

/** Sin volver a verla en su web durante más de esto (o de 3 intervalos de su fuente), puede haber cambiado. */
const HORAS_SIN_COMPROBAR = 24;

/**
 * Cuándo se vio la oferta en su web por última vez y si ya puede estar desactualizada.
 * @returns {{texto: string, cuando: string, desactualizada: boolean}|null}
 */
export function frescura(o, ctx = {}) {
  const vista = Date.parse(o.vistaUltima);
  if (!Number.isFinite(vista)) return null;
  const ahora = ctx.ahora ?? new Date();
  const intervaloMin = ctx.intervalos?.get(o.fuente);
  const limiteHoras = Math.max(HORAS_SIN_COMPROBAR, intervaloMin ? (3 * intervaloMin) / 60 : 0);
  return {
    texto: haceCuanto(o.vistaUltima, ahora),
    cuando: new Date(vista).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }),
    desactualizada: (ahora.getTime() - vista) / 3_600_000 > limiteHoras,
  };
}

/** «Comprobada en Weekendesk hace 2 h» o el aviso de que puede haber cambiado. */
function textoComprobada(o, ctx) {
  const f = frescura(o, ctx);
  if (!f) return '';
  const web = esc(ctx.fuentes?.get(o.fuente) ?? o.fuente);
  return f.desactualizada
    ? `<p class="dato-extra comprobada comprobada--antigua" title="Visto por última vez el ${esc(f.cuando)}">⚠️ Sin comprobar en ${web} desde ${esc(f.texto)}: puede haber cambiado o terminado</p>`
    : `<p class="dato-extra comprobada" title="${esc(f.cuando)}">Comprobada en ${web} ${esc(f.texto)}</p>`;
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
    ${textoComprobada(o, ctx)}
    <div class="acciones">${botonDescartar(o)}${botonFavorito(o, ctx)}${enlaceOferta(o, 'Reservar')}</div>
  </div>
</article>`;
}

export const tarjeta = (o, ctx) => (tieneVuelo(o) ? tarjetaVuelo(o, ctx) : tarjetaOferta(o, ctx));

/** Tarjeta con la frase que explica por qué se recomienda («porque te gusta el spa…»). */
export function tarjetaConMotivo({ oferta, motivos }, ctx) {
  const frase = enumerar(motivos);
  return `<div class="con-motivo">${tarjeta(oferta, ctx)}${frase ? `<p class="motivo">✨ Porque ${esc(frase)}.</p>` : ''}</div>`;
}

/** Rejilla de tarjetas con botón «Ver más» (`clave` identifica la lista para paginar). */
export function rejilla(lista, ctx, { mostradas, clave }) {
  const visibles = lista.slice(0, mostradas);
  const quedan = lista.length - visibles.length;
  return `<div class="rejilla" data-lista="${esc(clave)}">${visibles.map((o) => tarjeta(o, ctx)).join('')}</div>${
    quedan > 0 ? `<button type="button" class="boton boton--mas" data-mas="${esc(clave)}" data-desde="${visibles.length}">Ver más <span class="suave">(quedan ${quedan.toLocaleString('es-ES')})</span></button>` : ''}`;
}

/** Aviso de lista vacía. Los tres argumentos son HTML: lo que venga del usuario, ya escapado. */
export function estadoVacio(titulo, texto = '', extra = '') {
  return `<div class="vacio"><p class="vacio__titulo">${titulo}</p>${texto ? `<p>${texto}</p>` : ''}${extra}</div>`;
}

/** Fila compacta (título, precio y fechas) para listas largas como las de vigilados. */
export function filaOferta(o) {
  return `<li class="fila"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button>
  <span class="fila__precio">${euros(o.precio)}</span><span class="suave">${esc(textoFechas(o))}</span></li>`;
}

/** Fila compacta de una actividad: título, precio, duración y valoración. */
export function filaActividad(o) {
  const minutos = duracionActividad(o);
  return `<li class="fila"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button>
  <span class="fila__precio">${o.precio === 0 ? 'Gratis' : euros(o.precio)}</span>${
  minutos ? `<span class="suave">⏱️ ${esc(duracion(minutos))}</span>` : ''}${valoracion(o)}</li>`;
}

/** «Qué hacer allí»: hasta tres actividades en el mismo lugar que la oferta de la ficha. */
function queHacerAlli(ctx) {
  const lista = ctx.actividades ?? [];
  if (!lista.length) return '';
  return `<section class="ficha__actividades" aria-labelledby="ficha-actividades-titulo">
  <h3 id="ficha-actividades-titulo">🎟️ Qué hacer allí</h3>
  <ul class="filas">${lista.map(filaActividad).join('')}</ul>
</section>`;
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

function datosFicha(o, ctx) {
  const v = o.valoracion;
  const filas = [
    ['Fechas de viaje', o.fechas?.salida ? textoFechas(o) : 'Flexibles: la web no publica fechas concretas; la disponibilidad se confirma al reservar'],
    ['Reserva', textoCaducidad(o)],
    ['Noches', o.noches],
    ['Alojamiento', ETIQUETAS_ALOJAMIENTO[o.alojamiento]],
    ['Valoración', v?.nota >= 0 && `${nota(v.nota)} / 10${v.n ? ` · ${contar(v.n, 'opinión', 'opiniones')}` : ''}`],
    ['Régimen', ETIQUETAS_REGIMEN[o.regimen]],
    ['Transporte', ETIQUETAS_TRANSPORTE[o.transporte]],
    ['Precio en la web', o.precioTexto],
    ['Certeza', certeza(o)],
    ['Por persona y noche', o.precioNoche != null && euros(Math.round(o.precioNoche))],
    ['Precio habitual', o.referencia && `${euros(o.referencia.mediana)}: la mediana de ${o.referencia.n ? `${o.referencia.n} ofertas parecidas` : 'las ofertas parecidas'} (${o.referencia.grupo})`],
    ['Por qué es chollazo', o.chollazo && o.chollazoMotivo],
    ['Bajada', textoBajada(o)],
    ['Mínimo', textoMinimo(o, ctx)?.detalle],
    ['Publicada', o.publicada && etiquetaDia(o.publicada)],
    ['Vista por primera vez', o.vistaPrimera && haceCuanto(o.vistaPrimera)],
    ['Puntuación', `${o.puntuacion} / 100`],
  ];
  return filas.filter(([, valor]) => valor).map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`).join('');
}

function cocheFicha(o, ctx) {
  const d = ctx.distancias?.get(o.id);
  if (!d) return '';
  const viaje = d.minutos != null ? `${duracion(d.minutos)} en coche${d.estimado ? ' (estimado)' : ''}` : 'No se llega en coche';
  const km = d.kmCoche != null ? `${Math.round(d.kmCoche)} km por carretera` : `${Math.round(d.km)} km en línea recta`;
  if (conTransporteIncluido(o)) {
    // Solo como comparación explícita: la oferta va en tren, bus, avión o ferry.
    const medio = (ETIQUETAS_TRANSPORTE[o.transporte] ?? '').replace(/^\S+\s/, '').toLowerCase();
    return `<p class="ficha__coche">Esta oferta va en ${esc(medio)}. <span class="suave">Para comparar: en coche serían ${esc(viaje)} · ${esc(km)} desde ${esc(ctx.desde)}.</span></p>`;
  }
  const coste = textoCosteCoche(o, ctx);
  return `<p class="ficha__coche">🚗 <strong>${viaje}</strong> · ${km} desde ${esc(ctx.desde)}${coste ? `<br>${coste}` : ''}</p>`;
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
<div class="ficha__precio">${precio(o)}<span class="acciones">${botonDescartar(o)}${botonFavorito(o, ctx)}</span></div>
<div class="insignias">${insignias(o, ctx)}</div>
${textoComprobada(o, ctx)}
${vueloFicha(o.vuelo)}
${o.descripcion ? `<p class="ficha__descripcion">${esc(o.descripcion)}</p>` : ''}
${cocheFicha(o, ctx)}
${tiempo(o)}
${equivalentes(o, ctx)}
${o.eventos?.length ? `<section class="ficha__eventos"><h3>${conFechasDeViaje(o) ? 'Qué hay esos días por la zona' : 'Qué hay el próximo finde por la zona (si vas entonces)'}</h3>${eventos(o, { conEnlace: true })}</section>` : ''}
${queHacerAlli(ctx)}
<dl class="ficha__datos">${datosFicha(o, ctx)}</dl>
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
