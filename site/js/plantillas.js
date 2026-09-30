/**
 * Plantillas HTML (cadenas) de tarjetas, listas, estados vacíos y la ficha.
 * Todo el texto externo pasa por escaparHtml y los enlaces por urlSegura.
 */

import { costeViaje, resumenCoste } from './coste.js';
import { diasEntre, etiquetaDia, fechaLocal, horaDe } from './fechas.js';
import {
  ETIQUETAS_ALOJAMIENTO, ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE, ETIQUETAS_UNIDAD, SIN_UNIDAD,
  contar, duracion, enumerar, escaparHtml as esc, euros, grados, haceCuanto, normalizar, nota,
  puntosMinigrafica, urlSegura,
} from './formato.js';
import { SIN_COCHE, duracionActividad, esDuplicada, esNovedad, precioDeSerie, salidasDe, sinComprobar, sufijoSerie, tieneVuelo } from './filtros.js';
import { escena, icono, iconoTema, iconoTiempo, tipoEscena } from './iconos.js';
import { conFechas, ofertaConFechas } from './fechas-enlaces.js';

export const ESTADOS_FUENTE = {
  ok: { texto: 'Funciona', clase: 'ok' },
  error: { texto: 'Con errores', clase: 'error' },
  // Funciona, pero lee mucho menos de lo normal o casi sin precios: puede que la web haya cambiado.
  aviso: { texto: 'Revisar', clase: 'aviso' },
  desactivada: { texto: 'Desactivada', clase: 'inactiva' },
  bloqueada: { texto: 'Bloqueada', clase: 'inactiva' },
  pendiente: { texto: 'Pendiente', clase: 'pendiente' },
};

const colorTema = (o) => (o.temas?.[0] ? `var(--tema-${o.temas[0]})` : 'var(--acento)');
/** Un dato con su icono delante; el texto va en un <span> para que no se parta en trozos. */
const conIcono = (nombre, contenido) => `${icono(nombre)}<span>${contenido}</span>`;
const envolverDato = (contenido) => (contenido ? `<p class="dato-extra">${contenido}</p>` : '');

/** Iconos de las temáticas; en la tarjeta, como mucho 3 (la ficha las enseña todas). */
function temasIconos(o, ctx, max = Infinity) {
  return (o.temas ?? []).map((id) => ctx.temas.get(id)).filter(Boolean).slice(0, max)
    .map((t) => `<span class="tema-icono" style="--color-tema:var(--tema-${esc(t.id)})" title="${esc(t.nombre)}" role="img" aria-label="${esc(t.nombre)}">${iconoTema(t.id)}</span>`)
    .join('');
}

/** Detalle de la comparación con ofertas parecidas («lo normal en … es 70 €»). */
function detalleReferencia(r) {
  return `Lo normal en ${esc(r.descripcion ?? 'ofertas parecidas')}${r.n ? `, con ${r.n} ofertas,` : ''} es ${euros(r.mediana)}`;
}

/** «Un 23 % por debajo de lo normal», comparando con ofertas parecidas. */
function insigniaReferencia(o) {
  const r = o.referencia;
  if (!(r?.ahorroPct > 0)) return '';
  return `<span class="insignia insignia--ahorro" title="${detalleReferencia(r)}">${icono('bajada')}Un ${r.ahorroPct} % por debajo de lo normal</span>`;
}

/** «Precio más bajo en 23 días», con los días de historial que lo respaldan. */
function textoMinimo(o, ctx) {
  const serie = ctx.historial?.[o.id];
  if (!o.minimoHistorico) return null;
  if (!serie?.length) return { texto: 'Mínimo histórico', detalle: 'El precio más bajo registrado por el vigilante' };
  const dias = diasEntre(serie[0][0], serie.at(-1)[0]);
  return {
    texto: `Precio más bajo en ${dias} días`,
    detalle: `El más bajo${sufijoSerie(o)} desde el ${etiquetaDia(serie[0][0])} (${serie.length} días con precio; máximo ${euros(Math.max(...serie.map(([, p]) => p)))}${sufijoSerie(o)})`,
  };
}

const textoBajada = (o) => (o.bajada > 0 && typeof o.precio === 'number'
  ? `Ha bajado ${euros(o.bajada)}${sufijoSerie(o)}: el precio${sufijoSerie(o)} más alto de los últimos 7 días fue ${euros(Math.round((precioDeSerie(o) + o.bajada) * 100) / 100)}`
  : null);
/** «5 €» o «5 €/noche»: la bajada en la unidad de su historial. */
const bajadaCorta = (o) => `${euros(o.bajada)}${o.historialPorNoche ? '/noche' : ''}`;

/** Lo que tienen los niños: «Niños gratis», «Niños −60 %», «Tarifa niños»; null si nada especial. */
export function textoNinos(o) {
  const n = o.ninos;
  if (!n?.ventaja) return null;
  if (n.ventaja === 'gratis') return /^1 niño/.test(n.detalle ?? '') ? '1 niño gratis' : 'Niños gratis';
  if (n.ventaja === 'descuento') return `Niños −${n.descuento} %`;
  return 'Tarifa para niños';
}
const insigniaNinos = (o) => {
  const texto = textoNinos(o);
  return texto && `<span class="insignia insignia--ninos"${o.ninos.detalle ? ` title="${esc(o.ninos.detalle)}"` : ''}>${icono('tema-familia')}${esc(texto)}</span>`;
};

const insigniaChollazo = (o, clase = 'insignia insignia--chollazo') => `<span class="${clase}"${o.chollazoMotivo ? ` title="${esc(o.chollazoMotivo)}"` : ''}>${icono('fuego')}Chollazo</span>`;

/**
 * Las insignias de la oferta. En la tarjeta, el chollazo (o, si no lo es, lo que baja de lo
 * normal) va como sello sobre la foto: `enFoto` los quita de aquí para no repetirlos.
 */
function insignias(o, ctx, { enFoto = false } = {}) {
  const etiquetas = o.etiquetas ?? [];
  const minimo = textoMinimo(o, ctx);
  const lista = [
    ctx.misEstados?.get(o.id) === 'reservada' && `<span class="insignia insignia--mio">${icono('check')}Reservada (marcada por ti)</span>`,
    ctx.misEstados?.get(o.id) === 'no-disponible' && `<span class="insignia insignia--alerta">${icono('prohibido')}No disponible (marcada por ti)</span>`,
    o.patrocinada && `<span class="insignia insignia--patrocinado" title="Un anunciante paga por destacarla; no sube en el orden normal">Patrocinado · ${esc(o.patrocinada.anunciante)}</span>`,
    esNovedad(o, ctx.referencia) && `<span class="insignia insignia--nueva">${icono('nuevo')}Nuevo</span>`,
    o.chollazo && !enFoto && insigniaChollazo(o),
    insigniaNinos(o),
    minimo && `<span class="insignia insignia--minimo" title="${esc(minimo.detalle)}">${esc(minimo.texto)}</span>`,
    o.bajada > 0 && `<span class="insignia insignia--bajada" title="${esc(textoBajada(o))}">↓ ${bajadaCorta(o)}</span>`,
    (!enFoto || o.chollazo) && insigniaReferencia(o),
    etiquetas.includes('error-tarifa') && `<span class="insignia insignia--alerta">${icono('alerta')}Error de tarifa</span>`,
    etiquetas.includes('top-chollo') && '<span class="insignia insignia--alerta">Top chollo</span>',
    esDuplicada(o) && `<span class="insignia">${icono('repetir')}${o.equivalentes?.length ? 'Repetida en otra web' : 'Repetida en la misma web'}</span>`,
  ];
  return lista.filter(Boolean).join('');
}

/** El sello que va sobre la foto: chollazo o, si no lo es, cuánto baja de lo normal. */
function selloFoto(o) {
  if (o.chollazo) return insigniaChollazo(o, 'sello sello--chollazo');
  const r = o.referencia;
  if (r?.ahorroPct > 0) return `<span class="sello" title="Un ${r.ahorroPct} % por debajo de lo normal. ${detalleReferencia(r)}">${icono('bajada')}−${r.ahorroPct} % de lo normal</span>`;
  return '';
}

/** Precio por persona y noche de una oferta o de un resumen de `equivalentes` (null si no se sabe). */
const porNoche = (x) => (Number.isFinite(x?.precioNoche) && x.precioNoche > 0 ? x.precioNoche : null);
const nombreWeb = (fuente, ctx) => esc(ctx.fuentes?.get(fuente) ?? fuente);
/** El nombre de la otra web enlazando a la oferta en ella. */
function webEnlazada(f, ctx) {
  const url = urlSegura(f.url);
  return url ? `<a href="${esc(url)}" target="_blank" rel="${relEnlace(Boolean(f.afiliado))}">${nombreWeb(f.fuente, ctx)}</a>` : nombreWeb(f.fuente, ctx);
}
/** «El mismo alojamiento» en casas y hoteles; en un paquete o una actividad, «la misma oferta». */
const loMismo = (o) => (o.tipo === 'hotel' ? 'El mismo alojamiento' : 'La misma oferta');

/**
 * Esta oferta y la misma en otras webs (`equivalentes`), de la más barata a la más cara.
 * Solo se ordena y se dice cuál es más barata si todas tienen precio por persona y noche:
 * si no, se compararía un total con un precio por noche. Con `ctx.porId`, los enlaces de
 * las otras webs son los de reserva (con afiliado, si lo hay).
 */
export function comparativa(o, ctx = {}) {
  const otras = (o.equivalentes ?? []).map((e) => {
    const completa = ctx.porId?.get(e.id);
    return { ...e, url: completa?.urlReserva ?? e.url, afiliado: completa?.afiliado ?? null };
  });
  if (!otras.length) return null;
  const filas = [{ fuente: o.fuente, precio: o.precio, unidad: o.unidad, precioNoche: o.precioNoche, url: o.urlReserva ?? o.url, afiliado: o.afiliado, actual: true }, ...otras];
  const comparable = filas.every((f) => porNoche(f) != null);
  // Orden estable: a igual precio, esta oferta va primero.
  if (comparable) filas.sort((a, b) => Math.round(porNoche(a)) - Math.round(porNoche(b)));
  return { filas, comparable, minimo: comparable ? Math.round(porNoche(filas[0])) : null };
}

/** En la tarjeta, una línea: «Más barata en Tus Casas Rurales: 27 € por persona y noche (13 € menos)». */
function equivalentes(o, ctx) {
  const c = comparativa(o, ctx);
  if (!c) return '';
  const otras = c.filas.filter((f) => !f.actual);
  const [otra] = otras;
  const resto = otras.length > 1 ? ` y en ${contar(otras.length - 1, 'web')} más` : '';
  let texto;
  const web = webEnlazada(otra, ctx);
  if (!c.comparable) {
    texto = `También en ${web}${typeof otra.precio === 'number' ? ` por ${euros(otra.precio)}` : ''}${resto}`;
  } else {
    const diferencia = Math.round(porNoche(o)) - Math.round(porNoche(otra));
    const suPrecio = euros(Math.round(porNoche(otra)));
    const todasIguales = otras.every((f) => Math.round(porNoche(f)) === Math.round(porNoche(o)));
    texto = diferencia > 0
      ? `<strong>Más barata en ${web}</strong>: ${suPrecio} por persona y noche (${euros(diferencia)} menos)`
      : diferencia < 0
        ? `<strong>La más barata de ${c.filas.length} webs</strong>: en ${web}, ${suPrecio} (${euros(-diferencia)} más)`
        : todasIguales
          ? `Mismo precio en ${web}${resto}`
          : `<strong>La más barata de ${c.filas.length} webs</strong>, igual que en ${web}`;
  }
  return `<span class="insignia insignia--comparar" title="${esc(texto.replace(/<[^>]+>/g, ''))}">${conIcono('balanza', texto)}</span>`;
}

/** Tren, bus, avión o ferry: la oferta ya dice cómo se llega y el coche no es el plan. */
const conTransporteIncluido = (o) => SIN_COCHE.includes(o.transporte);

/** «≈ 34 € de gasolina ida y vuelta · estimado, un coche para 2 personas» (sin etiqueta: se envuelve fuera). */
function textoCosteCoche(o, ctx) {
  // El del escaneo es desde su origen: con otra salida lo da el coste del viaje (coste.js).
  // Menos de medio euro («≈ 0 €») es ir a la misma ciudad: no es un dato útil.
  if (!(o.costeCoche?.eur >= 0.5) || conTransporteIncluido(o) || ctx.salidaPropia) return '';
  const personas = ctx.viajeros ? ` para ${contar(ctx.viajeros, 'persona')}` : '';
  const litros = o.costeCoche.litros ? `: ${o.costeCoche.litros.toLocaleString('es-ES', { maximumFractionDigits: 1 })} l` : '';
  return `<span class="coste-coche" title="Estimación con el consumo y el precio medio del carburante${litros}. Sin peajes ni aparcamiento.">${conIcono('gasolina', `≈ ${euros(Math.round(o.costeCoche.eur))} de gasolina ida y vuelta · estimado, un coche${personas}`)}</span>`;
}

/**
 * ¿La oferta tiene sus propias fechas de viaje (salida, finde o puente)? Si no, el tiempo
 * y los eventos que trae son los del próximo finde: una suposición, no los de su viaje.
 */
const conFechasDeViaje = (o) => Boolean(o.fechas?.salida || o.fechas?.findeId || o.fechas?.puenteId);

/** «24° · 10 % de lluvia» del finde o puente de la oferta, con su icono. */
/**
 * ¿Es de otro día del que se busca? La previsión y los eventos se calculan para el próximo
 * finde: si buscas otras fechas, no son los tuyos y no se enseñan.
 */
const fueraDeBusqueda = (dia, o, ctx) => {
  const b = busquedaPara(o, ctx);
  return Boolean(b && dia && (dia < b.entrada || dia > b.salida));
};

function tiempo(o, ctx = {}) {
  const t = o.tiempo;
  if (!t || fueraDeBusqueda(t.dia, o, ctx)) return '';
  const supuesto = !conFechasDeViaje(o) && t.dia ? `Si vas el ${esc(etiquetaDia(t.dia))}: ` : '';
  const partes = [
    t.texto && esc(t.texto),
    t.maxC != null && grados(t.maxC),
    t.lluviaPct != null && `${t.lluviaPct} % de lluvia`,
    // Con «Si vas el sáb 3 oct:» delante, la fecha ya está dicha.
    !supuesto && t.dia && esc(etiquetaDia(t.dia)),
  ].filter(Boolean);
  return `<p class="dato-extra">${iconoTiempo(t.codigo)}<span>${supuesto}${partes.join(' · ')}</span></p>`;
}

/** El tiempo en corto sobre la foto, solo si es el de las fechas de la propia oferta. */
function tiempoFoto(o, ctx = {}) {
  const t = o.tiempo;
  if (!t || !conFechasDeViaje(o) || t.maxC == null || fueraDeBusqueda(t.dia, o, ctx)) return '';
  const cuando = t.dia ? `Previsión para el ${etiquetaDia(t.dia)}` : 'Previsión';
  return `<span class="pastilla-foto" title="${esc(cuando)}">${iconoTiempo(t.codigo)}${grados(t.maxC)}${t.texto ? ` · ${esc(t.texto.toLowerCase())}` : ''}</span>`;
}

/** Los eventos de la oferta que caen en las fechas que se buscan (o todos, si no se busca ninguna). */
const eventosDe = (o, ctx) => (o.eventos ?? []).filter((ev) => !fueraDeBusqueda(ev.fecha, o, ctx));

/** Hasta tres eventos cerca del destino esos días. */
function eventos(o, { conEnlace = false } = {}, ctx = {}) {
  const lista = eventosDe(o, ctx).slice(0, 3);
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

/** Estrella y nota, con el número de opiniones en el título. */
function valoracion(o) {
  const v = o.valoracion;
  if (!(v?.nota >= 0)) return '';
  const opiniones = v.n ? ` (${contar(v.n, 'opinión', 'opiniones')})` : '';
  return `<span class="valoracion" title="Valoración ${nota(v.nota)} sobre 10${opiniones}">${icono('estrella')}${nota(v.nota)}</span>`;
}

/** «Hotel 4★», «Camping», «4★» (con estrellas y sin tipo): la categoría del alojamiento. */
export function textoAlojamiento(o) {
  const tipo = ETIQUETAS_ALOJAMIENTO[o.alojamiento] ?? '';
  const estrellas = o.estrellas >= 1 ? `${o.estrellas}★` : '';
  return [tipo, estrellas].filter(Boolean).join(' ');
}

/** Qué quiere decir la nota: la escala habitual de Booking y compañía. */
export function adjetivoNota(valor) {
  return valor >= 9 ? 'Excelente' : valor >= 8 ? 'Muy bien' : valor >= 7 ? 'Bien' : valor >= 6 ? 'Aceptable' : 'Flojo';
}

/** «8,8 / 10 · Muy bien · 5 opiniones en Weekendesk». */
function textoValoracion(o, ctx) {
  const v = o.valoracion;
  if (!(v?.nota >= 0)) return null;
  const web = ctx.fuentes?.get(o.fuente) ?? o.fuente;
  const opiniones = v.n ? `${contar(v.n, 'opinión', 'opiniones')} en ${web}` : `según ${web}`;
  return `${nota(v.nota)} / 10 · ${adjetivoNota(v.nota)} · ${opiniones}`;
}

/** Qué mide la nota del chollo (sale al pasar por encima y en la ficha). */
export const QUE_MIDE_LA_NOTA = 'Lo bueno que es como chollo: sobre todo el precio frente a ofertas parecidas; también las opiniones de otros clientes, las bajadas, el descuento, si es nueva, si cae en finde o puente y lo cómodo que es llegar.';

/** «Chollazo», «Muy buena», «Buena» o «Normal» según la nota (0–100). */
export const nivelNota = (o) => (o.chollazo ? 'Chollazo' : o.puntuacion >= 60 ? 'Muy buena' : o.puntuacion >= 40 ? 'Buena' : 'Normal');

function puntuacion(o) {
  const nivel = o.chollazo ? 'alta' : o.puntuacion >= 60 ? 'media' : 'baja';
  const texto = `Nota del chollo: ${o.puntuacion} de 100 (${nivelNota(o).toLowerCase()}). ${QUE_MIDE_LA_NOTA}`;
  return `<span class="puntuacion puntuacion--${nivel}" title="${esc(texto)}"><span aria-hidden="true"><span class="puntuacion__etiqueta">Nota</span> ${o.puntuacion}</span><span class="sr">${esc(texto)}</span></span>`;
}

function botonFavorito(o, ctx) {
  const activo = ctx.favoritos.has(o.id);
  return `<button type="button" class="boton-icono boton-fav" data-fav="${esc(o.id)}" aria-pressed="${activo}" aria-label="Guardar en favoritos: ${esc(o.titulo)}">${icono('corazon')}</button>`;
}

/** Para añadirla a la comparación (hasta 3). */
function botonComparar(o, ctx) {
  if (!ctx.comparar) return '';
  const activo = ctx.comparar.has(o.id);
  return `<button type="button" class="boton-icono boton-comparar" data-comparar="${esc(o.id)}" aria-pressed="${activo}" title="${activo ? 'Quitar de «Comparar lado a lado»' : 'Comparar lado a lado (hasta 3)'}" aria-label="${activo ? 'Quitar de «Comparar lado a lado»' : 'Añadir a «Comparar lado a lado»'}: ${esc(o.titulo)}">${icono('comparar')}</button>`;
}

/** «La he reservado» y «Ya no está disponible»: se guardan en este navegador. */
function botonesMiEstado(o, ctx) {
  const actual = ctx.misEstados.get(o.id);
  const boton = (estado, nombre, texto) => `<button type="button" class="boton boton--suave boton--mini" data-mi-estado="${estado}" data-oferta="${esc(o.id)}" aria-pressed="${actual === estado}">${icono(nombre)}${texto}</button>`;
  return `<p class="acciones mi-estado">${boton('reservada', 'check', 'La he reservado')}${boton('no-disponible', 'prohibido', 'Ya no está disponible')}</p>`;
}

/** ✕ para ocultar la oferta en este navegador. */
function botonDescartar(o) {
  return `<button type="button" class="boton-icono boton-icono--mini boton-descartar" data-descartar="${esc(o.id)}" title="Ocultar esta oferta" aria-label="Ocultar esta oferta: ${esc(o.titulo)}">${icono('cerrar')}</button>`;
}

/** Un enlace pagado (afiliado o patrocinado) lleva rel="sponsored", como piden los buscadores. */
const relEnlace = (pagado) => (pagado ? 'sponsored noopener noreferrer' : 'noopener noreferrer');

/** Atributos para contar el clic (proveedor, tipo de enlace y tipo de oferta), sin datos personales. */
const atributosClic = (o, afiliado) => ` data-clic="${esc(o.fuente)}" data-clic-tipo="${afiliado ? 'afiliado' : o.patrocinada ? 'patrocinado' : 'normal'}" data-clic-oferta="${esc(o.tipo)}"`;

function enlaceOferta(o, texto = 'Ver oferta', ctx = {}) {
  const url = urlSegura(urlPropia(o, ctx));
  const pagado = Boolean(o.afiliado || o.patrocinada);
  return url ? `<a class="boton boton--primario" href="${esc(url)}" target="_blank" rel="${relEnlace(pagado)}"${atributosClic(o, o.afiliado)}><span class="boton__texto">${texto}</span>${icono('externo')}<span class="sr"> (se abre en otra pestaña${o.afiliado ? '; enlace de afiliado' : ''})</span></a>` : '';
}

/** «Enlace de afiliado» en la tarjeta; la explicación completa, en la ficha. */
const TEXTO_AFILIADO = 'Si reservas por este enlace, la web puede pagarnos una comisión. No cambia tu precio ni el orden de las ofertas.';

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
export function certeza(o) {
  if (typeof o.precio !== 'number') return 'La web no publica precio: consúltalo al reservar';
  const cuando = o.vistaUltima ? ' cuando se comprobó' : '';
  return esPrecioDesde(o)
    ? `Precio mínimo que publicaba la web${cuando}; el de tus fechas y la disponibilidad se confirman al reservar`
    : `Precio para estas fechas según la web${cuando}; puede cambiar hasta que reserves`;
}

/** Cómo sale el «≈ por persona y noche»: «Cálculo: 90 € en total, para 1 noche y 2 personas». */
function calculoPorNoche(o) {
  const reparto = repartoPorNoche(o).trim().replace(/^\(|\)$/g, '');
  return `Cálculo: ${reparto || `${euros(o.precio)} ${ETIQUETAS_UNIDAD[o.unidad] ?? ''}${o.noches ? `, ${contar(o.noches, 'noche')}` : ''}`.trim()}`;
}

function precio(o) {
  if (typeof o.precio !== 'number') return `<p class="precio"><strong class="precio__consultar">${esc(o.precioTexto || 'Consultar precio')}</strong></p>`;
  if (o.precio === 0) return `<p class="precio"><strong class="precio__gratis">Gratis</strong>${matiz(o.precioTexto)}</p>`;
  // Sin unidad en el modelo, lo que dice la web («por persona y trayecto», «en total para 2»)
  // explica más que nada; si tampoco lo dice, se avisa.
  const unidad = ETIQUETAS_UNIDAD[o.unidad]
    ?? (/\b(?:por|total|ida|trayecto)\b/i.test(o.precioTexto ?? '') ? esc(o.precioTexto) : SIN_UNIDAD);
  const noche = o.precioNoche != null && o.unidad !== 'pp/noche'
    ? ` <span class="precio__noche" title="${esc(calculoPorNoche(o))}">≈ ${euros(Math.round(o.precioNoche))} por persona y noche</span>`
    : '';
  const desde = esPrecioDesde(o) ? '<span class="precio__desde" title="Precio mínimo publicado: depende de las fechas y la disponibilidad">desde </span>' : '';
  return `<p class="precio">${desde}<strong>${euros(o.precio)}</strong>${unidad ? ` <span class="precio__unidad">${unidad}</span>` : ''}${
    o.precioAnterior > o.precio ? ` <s class="precio__anterior">${euros(o.precioAnterior)}</s>` : ''}${
    o.descuento ? ` <span class="precio__descuento">−${o.descuento} %</span>` : ''}${noche}</p>`;
}

/**
 * Hasta cuándo vale, en corto: «Acaba mañana», «Acaba en 3 días» (urgente) o «Hasta el
 * jue 1 oct». Nada si tiene fechas cerradas o la fecha es supuesta (ver textoCaducidad).
 */
export function caducidadCorta(o, ctx = {}) {
  if (!textoCaducidad(o)) return null;
  const dia = fechaLocal(o.caduca);
  const quedan = diasEntre(fechaLocal(ctx.ahora ?? new Date()), dia);
  if (quedan <= 0) return { texto: 'Acaba hoy', urgente: true };
  if (quedan === 1) return { texto: 'Acaba mañana', urgente: true };
  if (quedan <= 3) return { texto: `Acaba en ${quedan} días`, urgente: true };
  return { texto: `Hasta el ${etiquetaDia(dia)}`, urgente: false };
}

/** Fechas del viaje: las concretas o «Fechas flexibles». La caducidad de la promoción va aparte. */
export function textoFechas(o) {
  const { salida, vuelta } = o.fechas ?? {};
  if (salida) return vuelta ? `${etiquetaDia(salida)} – ${etiquetaDia(vuelta)}` : etiquetaDia(salida);
  return 'Fechas flexibles';
}

/**
 * Las fechas que se buscan, si valen para esta oferta: solo las de fechas flexibles (las de
 * fechas cerradas son las que son) y que no hayan caducado antes de esos días.
 */
export function busquedaPara(o, ctx = {}) {
  const b = ctx.busqueda;
  if (!b || o.fechas?.salida || o.tipo === 'vuelo' && o.vuelo) return null;
  if (o.caduca && fechaLocal(o.caduca) < b.entrada) return null;
  return b;
}

/** El enlace con las fechas y viajeros de la búsqueda, si la oferta es de fechas flexibles. */
const enlaceConBusqueda = (url, o, ctx) => {
  const b = busquedaPara(o, ctx);
  return b ? conFechas(url, b, ctx.viajeros) : url;
};

/**
 * La web de la oferta: con tus fechas si es de fechas flexibles y esa web las entiende en la
 * URL (Holidu, Clubrural); si no, tal cual.
 */
function urlPropia(o, ctx = {}) {
  const propia = o.urlReserva ?? o.url;
  const b = busquedaPara(o, ctx);
  return (b && ofertaConFechas(propia, b, ctx.viajeros)) || propia;
}

/** Junto al botón de la ficha: si abre tus fechas o cuáles tienes que elegir en su web. */
function notaFechasOferta(o, ctx) {
  const b = busquedaPara(o, ctx);
  if (!b) return '';
  const web = esc(ctx.fuentes?.get(o.fuente) ?? o.fuente);
  return ofertaConFechas(o.urlReserva ?? o.url, b, ctx.viajeros)
    ? `<p class="dato-extra nota-fechas nota-fechas--ok">${conIcono('calendario', `Se abre con tus fechas: <strong>${esc(b.etiqueta)}</strong>`)}</p>`
    : `<p class="dato-extra nota-fechas">${conIcono('calendario', `${web} no deja abrirla con fechas: al reservar, elige <strong>${esc(b.etiqueta)}</strong>`)}</p>`;
}

/**
 * «Promoción hasta el mié 30 sep»: hasta cuándo se puede reservar, que no es cuándo se viaja.
 * No se enseña si la oferta ya tiene fechas (la caducidad es la propia salida) ni si la
 * fecha la ha supuesto el vigilante (las newsletters no la publican).
 */
export function textoCaducidad(o) {
  if (!o.caduca || o.fechas?.salida || (o.etiquetas ?? []).includes('caduca-estimada')) return '';
  return `Promoción hasta el ${etiquetaDia(fechaLocal(o.caduca))}`;
}

function textoCoche(distancia, desde, o) {
  if (!distancia) return '';
  if (conTransporteIncluido(o)) {
    return `<span class="coche" title="Distancia en línea recta desde ${esc(desde)}">${icono('pin')}${Math.round(distancia.km)} km</span>`;
  }
  if (distancia.minutos != null) {
    // «0 min aprox.» es la propia ciudad de salida: se dice así.
    const tiempo = distancia.minutos < 5 ? 'menos de 5 min' : `${duracion(distancia.minutos)}${distancia.estimado ? ' aprox.' : ''}`;
    return `<span class="coche" title="En coche desde ${esc(desde)}">${icono('coche')}${tiempo}</span>`;
  }
  return `<span class="coche" title="En línea recta desde ${esc(desde)}">${icono('pin')}${Math.round(distancia.km)} km</span>`;
}

/** «Roses, Girona»: el destino y su zona (y el país si no es España). */
export function textoLugar(o) {
  const l = o.lugar;
  if (!l?.nombre) return '';
  const zona = [l.region, l.pais !== 'España' ? l.pais : null].filter((parte) => parte && parte !== l.nombre).join(', ');
  return `${esc(l.nombre)}${zona ? `<span class="suave">, ${esc(zona)}</span>` : ''}`;
}

/** La foto de la oferta, con la ilustración debajo por si no hay foto o no carga. */
function mediaOferta(o) {
  const url = urlSegura(o.imagen);
  return `${escena(tipoEscena(o))}${url ? `<img class="tarjeta__imagen" src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="300">` : ''}`;
}

/** Lo que va sobre la foto: sello, favorito, tiempo en coche y el tiempo que hará. */
function cabeceraFoto(o, ctx) {
  const coche = textoCoche(ctx.distancias?.get(o.id), ctx.desde, o);
  const pastillas = [coche && `<span class="pastilla-foto">${coche}</span>`, tiempoFoto(o, ctx)].filter(Boolean).join('');
  const sello = selloFoto(o);
  return `<div class="tarjeta__media">${mediaOferta(o)}
    ${sello ? `<div class="tarjeta__sellos">${sello}</div>` : ''}
    ${botonFavorito(o, ctx)}
    ${pastillas ? `<div class="tarjeta__pastillas">${pastillas}</div>` : ''}
  </div>`;
}

/**
 * Pocos datos, los que sirven para decidir de un vistazo: cuándo, hasta cuándo vale, qué incluye (noches, alojamiento, régimen o duración) y cómo se llega si no es en
 * coche. El resto (valoración, transporte, eventos…) está en la ficha.
 */
function datosTarjeta(o, ctx = {}) {
  const minutos = duracionActividad(o);
  const salidas = salidasDe(o);
  const dato = (nombre, texto) => (texto ? `<li>${icono(nombre)}<span>${esc(texto)}</span></li>` : '');
  const incluye = [
    o.noches && contar(o.noches, 'noche'),
    textoAlojamiento(o),
    o.regimen !== 'solo-alojamiento' && ETIQUETAS_REGIMEN[o.regimen],
    minutos && duracion(minutos),
  ].filter(Boolean).join(' · ');
  const llegar = salidas.length ? dato('despegue', `Sale de ${enumerar(salidas)}`)
    : conTransporteIncluido(o) ? dato(o.transporte, `En ${(ETIQUETAS_TRANSPORTE[o.transporte] ?? '').toLowerCase()}`) : '';
  const caduca = caducidadCorta(o, ctx);
  return [
    // Casi todas son de fechas flexibles: en la tarjeta solo se dicen las fechas cerradas (la
    // ficha explica las flexibles), o que puede valer para las que buscas.
    o.fechas?.salida ? dato('calendario', textoFechas(o))
      : busquedaPara(o, ctx) ? dato('calendario', `Puede valer para el ${busquedaPara(o, ctx).etiqueta}`) : '',
    // Aparte: «hasta el 30» junto a las fechas se leería como el último día del viaje.
    caduca ? `<li${caduca.urgente ? ' class="dato--urgente"' : ''}>${icono('arena')}<span>${esc(caduca.texto)}</span></li>` : '',
    dato(o.noches || o.alojamiento || o.estrellas ? 'noches' : 'reloj', incluye),
    llegar,
  ].join('');
}

/**
 * En la tarjeta, una sola etiqueta: la más fuerte (el chollazo o «−N %» ya van sobre la
 * foto). Las marcas tuyas y «Patrocinado» se enseñan siempre; el resto, en la ficha.
 */
function insigniasTarjeta(o, ctx) {
  const etiquetas = o.etiquetas ?? [];
  const minimo = textoMinimo(o, ctx);
  const fijas = [
    ctx.misEstados?.get(o.id) === 'reservada' && `<span class="insignia insignia--mio">${icono('check')}Reservada (marcada por ti)</span>`,
    ctx.misEstados?.get(o.id) === 'no-disponible' && `<span class="insignia insignia--alerta">${icono('prohibido')}No disponible (marcada por ti)</span>`,
    o.patrocinada && `<span class="insignia insignia--patrocinado" title="Un anunciante paga por destacarla; no sube en el orden normal">Patrocinado · ${esc(o.patrocinada.anunciante)}</span>`,
    // Niños gratis o con descuento: es lo que decide a una familia, se ve siempre.
    insigniaNinos(o),
  ];
  const [mejor] = [
    etiquetas.includes('error-tarifa') && `<span class="insignia insignia--alerta">${icono('alerta')}Error de tarifa</span>`,
    minimo && `<span class="insignia insignia--minimo" title="${esc(minimo.detalle)}">${esc(minimo.texto)}</span>`,
    o.bajada > 0 && `<span class="insignia insignia--bajada" title="${esc(textoBajada(o))}">${icono('bajada')}Ha bajado ${bajadaCorta(o)}</span>`,
    o.chollazo && insigniaReferencia(o),
    esNovedad(o, ctx.referencia) && `<span class="insignia insignia--nueva">${icono('nuevo')}Nuevo</span>`,
    esDuplicada(o) && `<span class="insignia">${icono('repetir')}${o.equivalentes?.length ? 'Repetida en otra web' : 'Repetida en la misma web'}</span>`,
  ].filter(Boolean);
  return [...fijas.filter(Boolean), mejor].filter(Boolean).join('');
}

/** Tarjeta de escapada, hotel, paquete o chollo de vuelo sin fechas. */
export function tarjetaOferta(o, ctx) {
  const web = ctx.fuentes?.get(o.fuente) ?? o.fuente;
  // Siempre los mismos huecos y del mismo alto (ver estilos): en una fila, el título, las
  // opiniones, los datos, las etiquetas y el precio de todas las tarjetas quedan alineados.
  return `<article class="tarjeta" style="--color-tema:${colorTema(o)}">
  ${cabeceraFoto(o, ctx)}
  <div class="tarjeta__cuerpo">
    <div class="tarjeta__cabeza">
      <span class="tarjeta__lugar">${textoLugar(o) || esc(ETIQUETAS_TIPO[o.tipo] ?? o.tipo)}</span>
      ${puntuacion(o)}
      ${botonDescartar(o)}
    </div>
    <h3 class="tarjeta__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button></h3>
    ${opinionesTarjeta(o, web)}
    <ul class="tarjeta__datos">${datosTarjeta(o, ctx)}</ul>
    <div class="insignias insignias--tarjeta">${equivalentes(o, ctx)}${insigniasTarjeta(o, ctx)}${avisoTarjeta(o, ctx)}</div>
    <div class="tarjeta__pie">
      <div class="tarjeta__precio">${precio(o)}</div>
      <div class="tarjeta__coste">${lineaCoste(o, ctx)}</div>
      <div class="acciones">${botonComparar(o, ctx)}${enlaceOferta(o, `Ver en ${esc(web)}`, ctx)}</div>
    </div>
  </div>
</article>`;
}

/** «★ 8,2 Muy bien · 266 opiniones»: lo que opinan otros clientes, a la vista (vacío si no hay). */
function opinionesTarjeta(o, web) {
  const v = o.valoracion;
  if (!(v?.nota >= 0)) return '<p class="tarjeta__opiniones tarjeta__opiniones--sin" aria-hidden="true"></p>';
  const cuantas = v.n ? ` · ${contar(v.n, 'opinión', 'opiniones')}` : '';
  return `<p class="tarjeta__opiniones" title="Valoración de los clientes en ${esc(web)}">${icono('estrella')}<strong>${nota(v.nota)}</strong> ${adjetivoNota(v.nota)}${cuantas}</p>`;
}

/**
 * Solo lo que importa: si puede haber terminado (sin comprobar en días) y si el enlace es de
 * afiliado. «Comprobada hace 2 h» y la web ya no ocupan la tarjeta (la web va en el botón).
 */
function avisoTarjeta(o, ctx) {
  const f = frescura(o, ctx);
  const web = esc(ctx.fuentes?.get(o.fuente) ?? o.fuente);
  return [
    f?.desactualizada && `<span class="insignia insignia--alerta comprobada--antigua" title="Sin comprobar en ${web} desde ${esc(f.texto)}: puede haber cambiado o terminado. Visto por última vez el ${esc(f.cuando)}">${icono('alerta')}Puede haber terminado</span>`,
    o.afiliado && `<span class="insignia aviso-afiliado" title="${esc(TEXTO_AFILIADO)}">${icono('enlace')}Enlace de afiliado</span>`,
  ].filter(Boolean).join('');
}

/**
 * La tarjeta grande y oscura de la portada para el mejor chollazo: foto, precio, cuánto
 * baja de lo normal y el viaje completo.
 */
export function tarjetaDestacada(o, ctx, etiqueta = 'Chollazo destacado') {
  const c = costeDe(o, ctx);
  const r = o.referencia;
  const minimo = textoMinimo(o, ctx);
  const ahorro = [r?.ahorroPct > 0 && `Un ${r.ahorroPct} % por debajo de lo normal`, minimo?.texto].filter(Boolean).join(' · ');
  const coche = textoCoche(ctx.distancias?.get(o.id), ctx.desde, o);
  const pastillas = [coche && `<span class="pastilla-foto">${coche}</span>`, tiempoFoto(o, ctx)].filter(Boolean).join('');
  const total = c.total != null
    ? `Viaje para ${esc(contar(c.viajeros, 'persona'))}: <strong>${c.estimado ? '≈ ' : ''}${esc(euros(Math.round(c.total)))}</strong>`
    : esc(`${ETIQUETAS_TIPO[o.tipo] ?? o.tipo} · ${ctx.fuentes.get(o.fuente) ?? o.fuente}`);
  return `<article class="destacado" style="--color-tema:${colorTema(o)}">
  <div class="tarjeta__media">${mediaOferta(o)}
    <div class="tarjeta__sellos"><span class="sello sello--chollazo"${o.chollazoMotivo ? ` title="${esc(o.chollazoMotivo)}"` : ''}>${icono('fuego')}${esc(etiqueta)}</span></div>
    ${botonFavorito(o, ctx)}
    ${pastillas ? `<div class="tarjeta__pastillas">${pastillas}</div>` : ''}
  </div>
  <div class="destacado__cuerpo">
    <p class="destacado__lugar">${textoLugar(o) || esc(ctx.fuentes.get(o.fuente) ?? o.fuente)}</p>
    <h2 class="destacado__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(o.titulo)}</button></h2>
    ${precio(o)}
    ${ahorro ? `<p class="destacado__ahorro">${icono('bajada')}<span>${esc(ahorro)}</span></p>` : ''}
    <div class="destacado__pie"><span>${total}</span>${enlaceOferta(o, undefined, ctx)}</div>
  </div>
</article>`;
}

/**
 * Cuándo se vio la oferta en su web por última vez y si ya puede estar desactualizada.
 * @returns {{texto: string, cuando: string, desactualizada: boolean}|null}
 */
export function frescura(o, ctx = {}) {
  const vista = Date.parse(o.vistaUltima);
  if (!Number.isFinite(vista)) return null;
  const ahora = ctx.ahora ?? new Date();
  return {
    texto: haceCuanto(o.vistaUltima, ahora),
    cuando: new Date(vista).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }),
    desactualizada: sinComprobar(o, { ahora, intervalos: ctx.intervalos }),
  };
}

/** «Comprobada en Weekendesk hace 2 h» o el aviso de que puede haber cambiado. */
function textoComprobada(o, ctx) {
  const f = frescura(o, ctx);
  if (!f) return '';
  const web = esc(ctx.fuentes?.get(o.fuente) ?? o.fuente);
  return f.desactualizada
    ? `<p class="dato-extra comprobada comprobada--antigua" title="Visto por última vez el ${esc(f.cuando)}">${conIcono('alerta', `Sin comprobar en ${web} desde ${esc(f.texto)}: puede haber cambiado o terminado`)}</p>`
    : `<p class="dato-extra comprobada" title="${esc(f.cuando)}">Comprobada en ${web} ${esc(f.texto)}</p>`;
}

/** El coste del viaje completo con tu salida, viajeros y noches (coste.js). */
export const costeDe = (o, ctx) => costeViaje(o, {
  viajeros: ctx.viajeros ?? undefined, noches: ctx.noches ?? undefined, distancia: ctx.distancias?.get(o.id), coche: ctx.coche,
});

/** «Alojamiento 240 € + Gasolina ≈ 29 € (estimado)» para el título de la línea del total. */
const desgloseCorto = (c) => c.partes.map((p) => `${p.concepto} ${p.estimado ? '≈ ' : ''}${euros(Math.round(p.eur))}${p.estimado ? ' (estimado)' : ''}`).join(' + ');

/**
 * «≈ 269 € el viaje para 4 personas»; sin total, la gasolina que calculó el
 * escaneo (solo desde su origen), y si tampoco, nada.
 */
function lineaCoste(o, ctx) {
  const c = costeDe(o, ctx);
  if (c.total == null) return envolverDato(textoCosteCoche(o, ctx));
  // En la tarjeta, una línea: el total del viaje (el reparto por persona, en el título y en la ficha).
  const corto = `${c.estimado ? '≈ ' : ''}${euros(Math.round(c.total))} el viaje para ${contar(c.viajeros, 'persona')}`;
  const titulo = `${resumenCoste(c)}. ${desgloseCorto(c)}. Supone: ${c.supuestos.join('; ')}.`;
  return `<p class="dato-extra coste-total" title="${esc(titulo)}">${conIcono('cartera', esc(corto))}</p>`;
}

/** «Coste del viaje» en la ficha: cada parte, qué es estimado, lo supuesto y lo que falta. */
function costeFicha(o, ctx) {
  const c = costeDe(o, ctx);
  if (!c.partes.length && !c.falta.length) return '';
  const filas = c.partes.map((p) => `<tr><th scope="row">${esc(p.concepto)}${p.estimado ? ' <span class="etiqueta-estimado">estimado</span>' : ''}</th><td>${esc(p.detalle)}</td><td class="num">${p.estimado ? '≈ ' : ''}${euros(p.eur)}</td></tr>`).join('');
  const total = c.total != null
    ? `<tr class="coste__total"><th scope="row">Total${c.estimado ? ' (con estimaciones)' : ''}</th><td>${contar(c.viajeros, 'persona')}${c.noches ? ` · ${contar(c.noches, 'noche')}` : ''}${c.viajeros > 1 ? ` · ${euros(Math.round(c.porPersona))} por persona` : ''}</td><td class="num">${c.estimado ? '≈ ' : ''}${euros(c.total)}</td></tr>`
    : '';
  const falta = c.falta.length ? `<p class="coste__falta">Para dar un total falta saber ${esc(enumerar(c.falta))}.</p>` : '';
  const supuestos = c.supuestos.length ? `<p class="suave">Supone: ${esc(c.supuestos.join('; '))}. Desde ${esc(ctx.desde ?? '')}.</p>` : '';
  return `<section class="ficha__coste" aria-labelledby="ficha-coste-titulo">
  <h3 id="ficha-coste-titulo">${icono('cartera')}Coste del viaje</h3>
  ${filas || total ? `<table class="coste"><tbody>${filas}${total}</tbody></table>` : ''}
  ${falta}${supuestos}
  <p><button type="button" class="boton boton--suave boton--mini" data-mi-viaje>Cambiar salida, viajeros o noches</button></p>
</section>`;
}

/** Minigráfica SVG del historial de precios (vacía si hay menos de dos puntos). */
export function minigrafica(serie) {
  const puntos = puntosMinigrafica(serie);
  if (!puntos) return '';
  const [primero, ultimo] = [serie[0][1], serie.at(-1)[1]];
  return `<svg class="minigrafica" viewBox="0 0 96 28" width="96" height="28" role="img" aria-label="Historial de ${serie.length} días: de ${euros(primero)} a ${euros(ultimo)}"><polyline points="${puntos}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** «vie 16 oct · 19:05 → 20:50 · Directo»: la llegada si se sabe; si no, la duración. */
function tramo(nombre, t, conNumero = false) {
  if (!t) return '';
  const numero = conNumero && t.numero ? ` <span class="suave">(${esc(t.numero)})</span>` : '';
  const llegada = t.llegada ? ` → ${esc(horaDe(t.llegada))}` : t.duracionMin ? ` · ${esc(duracion(t.duracionMin))}` : '';
  const escalas = t.escalas == null ? '' : ` · <span class="suave">${t.escalas === 0 ? 'Directo' : t.escalas === 1 ? '1 escala' : `${t.escalas} escalas`}</span>`;
  return `<div><dt>${nombre}</dt><dd>${esc(etiquetaDia(t.salida))} · <strong>${esc(horaDe(t.salida))}</strong>${llegada}${escalas}${numero}</dd></div>`;
}

/** Tarjeta tipo billete de un vuelo con fechas. */
export function tarjetaVuelo(o, ctx) {
  const v = o.vuelo;
  const extras = [
    v.horarioIdeal && `<span class="insignia insignia--ideal">${icono('reloj')}Horario ideal</span>`,
    v.patron === 'puente' && `<span class="insignia insignia--puente">${icono('puentes')}Puente</span>`,
    v.nuevaRuta && `<span class="insignia insignia--nueva">${icono('nuevo')}Nueva ruta</span>`,
  ].filter(Boolean).join('');
  const desglose = v.ida?.precio != null && v.vuelta?.precio != null ? `<p class="billete__desglose">${euros(v.ida.precio)} + ${euros(v.vuelta.precio)}</p>` : '';
  const pais = o.lugar?.pais ? `<span class="suave">, ${esc(o.lugar.pais)}</span>` : '';
  return `<article class="billete">
  <div class="billete__cuerpo">
    <div class="billete__principal">
      <p class="billete__ruta" aria-label="De ${esc(v.origen)} a ${esc(v.destino)}"><span>${esc(v.origen)}</span><span class="billete__avion" aria-hidden="true">${icono('avion')}</span><span>${esc(v.destino)}</span></p>
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
    <div class="acciones">${botonDescartar(o)}${botonComparar(o, ctx)}${botonFavorito(o, ctx)}${enlaceOferta(o, 'Reservar', ctx)}</div>
  </div>
</article>`;
}

export const tarjeta = (o, ctx) => (tieneVuelo(o) ? tarjetaVuelo(o, ctx) : tarjetaOferta(o, ctx));

/** Tarjeta con la frase que explica por qué se recomienda («porque te gustan los planes de spa…»). */
export function tarjetaConMotivo({ oferta, motivos }, ctx) {
  const frase = enumerar(motivos);
  return `<div class="con-motivo">${tarjeta(oferta, ctx)}${frase ? `<p class="motivo">${icono('nuevo')}<span>Porque ${esc(frase)}.</span></p>` : ''}</div>`;
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
  minutos ? `<span class="suave">${icono('reloj')} ${esc(duracion(minutos))}</span>` : ''}${valoracion(o)}</li>`;
}

/** «Qué hacer allí»: hasta tres actividades en el mismo lugar que la oferta de la ficha. */
function queHacerAlli(ctx) {
  const lista = ctx.actividades ?? [];
  if (!lista.length) return '';
  return `<section class="ficha__actividades" aria-labelledby="ficha-actividades-titulo">
  <h3 id="ficha-actividades-titulo">${icono('actividades')}Qué hacer allí</h3>
  <ul class="filas">${lista.map(filaActividad).join('')}</ul>
</section>`;
}

/** Explica desde dónde se miden las distancias en el buscador por ubicación. */
export function textoAyudaUbicacion(punto, origen, salida = null) {
  const desde = punto ?? salida;
  return desde
    ? `Midiendo desde ${desde.nombre} (estimación: línea recta × 1,3 a 80 km/h).`
    : `Midiendo desde ${origen.nombre} con el tiempo real por carretera.`;
}

export function insigniaEstado(estado) {
  const { texto, clase } = ESTADOS_FUENTE[estado] ?? { texto: estado, clase: 'pendiente' };
  return `<span class="estado estado--${clase}"><span class="punto" aria-hidden="true"></span>${esc(texto)}</span>`;
}

/** « (90 € en total, para 1 noche y 2 personas)»: de dónde sale el precio por persona y noche. */
function repartoPorNoche(o) {
  if (!['noche', 'total'].includes(o.unidad) || !o.precio || !o.precioNoche) return '';
  const noches = o.unidad === 'total' ? o.noches || 1 : 1;
  const personas = Math.round(o.precio / o.precioNoche / noches);
  const partes = [o.unidad === 'total' && contar(noches, 'noche'), personas > 1 && `${personas} personas`].filter(Boolean);
  return partes.length ? ` (${euros(o.precio)} ${ETIQUETAS_UNIDAD[o.unidad] ?? ''}, para ${partes.join(' y ')})`.replace(/ ,/, ',') : '';
}

/** Transporte que incluye la oferta; «coche» no es un transporte incluido (es cómo llegas tú). */
const transporteIncluido = (o) => (o.transporte && o.transporte !== 'coche' ? ETIQUETAS_TRANSPORTE[o.transporte] : null);
const esSoloAdultos = (o) => (o.etiquetas ?? []).includes('solo-adultos');

/**
 * Los datos de la ficha en tres bloques: qué es la oferta, qué precio es y cómo se ha
 * seguido. Solo las filas con dato.
 */
function datosFicha(o, ctx) {
  const minutos = duracionActividad(o);
  const alojamiento = [textoAlojamiento(o), esSoloAdultos(o) && 'solo adultos'].filter(Boolean).join(' · ');
  const bloques = [
    ['La oferta', [
      [o.tipo === 'actividad' ? 'Cuándo' : 'Fechas de viaje', o.fechas?.salida ? textoFechas(o)
        : busquedaPara(o, ctx) ? `Flexibles: la web no publica fechas concretas. Los buscadores de abajo ya abren tus fechas (${busquedaPara(o, ctx).etiqueta}); en la web de la oferta elige esos días al reservar para ver si hay sitio`
          : 'Flexibles: la web no publica fechas concretas; la disponibilidad se confirma al reservar'],
      ['Reserva', textoCaducidad(o)],
      ['Duración', minutos && duracion(minutos)],
      ['Noches', o.noches && contar(o.noches, 'noche')],
      ['Alojamiento', alojamiento],
      ['Valoración', textoValoracion(o, ctx)],
      ['Régimen', ETIQUETAS_REGIMEN[o.regimen]],
      ['Transporte incluido', transporteIncluido(o)],
      ['Niños', o.ninos && (o.ninos.detalle ? `${o.ninos.detalle}. Confírmalo en la web antes de reservar: suele haber plazas limitadas o condiciones` : 'Plan para ir con niños')],
    ]],
    ['El precio', [
      ['Precio en la web', o.precioTexto],
      ['Qué precio es', certeza(o)],
      ['Por persona y noche', o.precioNoche != null && `${euros(Math.round(o.precioNoche))}${repartoPorNoche(o)}`],
      ['Precio habitual', o.referencia && `${euros(o.referencia.mediana)}: lo normal en ${o.referencia.descripcion ?? 'ofertas parecidas'}${o.referencia.n ? ` (mediana de ${o.referencia.n} ofertas)` : ''}`],
      ['Por qué es chollazo', o.chollazo && o.chollazoMotivo],
      ['Bajada', textoBajada(o)],
      ['Mínimo', textoMinimo(o, ctx)?.detalle],
      ['Nota del chollo', `${o.puntuacion} / 100 · ${nivelNota(o)}. ${QUE_MIDE_LA_NOTA}`],
    ]],
    ['Seguimiento', [
      ['Publicada', o.publicada && etiquetaDia(o.publicada)],
      ['Vista por primera vez', o.vistaPrimera && haceCuanto(o.vistaPrimera)],
    ]],
  ];
  return bloques.map(([titulo, filas]) => {
    const conDato = filas.filter(([, valor]) => valor);
    return conDato.length ? `<section class="ficha__bloque"><h3>${titulo}</h3><dl class="ficha__datos">${conDato.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`).join('')}</dl></section>` : '';
  }).join('');
}

/**
 * Lo esencial de un vistazo, bajo el título: alojamiento y estrellas, valoración, noches,
 * régimen, transporte incluido, solo adultos y niños.
 */
function resumenFicha(o, ctx) {
  const v = o.valoracion;
  const minutos = duracionActividad(o);
  const datos = [
    textoAlojamiento(o) && ['cama', textoAlojamiento(o)],
    v?.nota >= 0 && ['estrella', `${nota(v.nota)} ${adjetivoNota(v.nota)}${v.n ? ` · ${contar(v.n, 'opinión', 'opiniones')}` : ''}`],
    o.noches && ['noches', contar(o.noches, 'noche')],
    minutos && ['reloj', duracion(minutos)],
    ETIQUETAS_REGIMEN[o.regimen] && ['cubiertos', ETIQUETAS_REGIMEN[o.regimen]],
    transporteIncluido(o) && [o.transporte, `${transporteIncluido(o)} incluido`],
    esSoloAdultos(o) && ['personas', 'Solo adultos'],
    o.ninos && !esSoloAdultos(o) && ['tema-familia', textoNinos(o) ?? 'Para ir con niños'],
  ].filter(Boolean);
  return datos.length ? `<ul class="ficha__resumen">${datos.map(([ic, texto]) => `<li>${icono(ic)}<span>${esc(texto)}</span></li>`).join('')}</ul>` : '';
}

/**
 * La descripción de la web sin repetir el título ni el lugar. Si es una lista de lo que
 * incluye («1 noche · desayuno · acceso al spa»), como lista.
 */
function descripcionFicha(o) {
  if (!o.descripcion) return '';
  const igual = (a, b) => normalizar(a).trim() === normalizar(b).trim();
  const partes = o.descripcion.split(/\s+·\s+/).map((p) => p.trim())
    .filter((p) => p && !igual(p, o.titulo) && !(o.lugar?.nombre && normalizar(p).startsWith(normalizar(o.lugar.nombre))));
  if (!partes.length) return '';
  if (partes.length >= 3) return `<section class="ficha__incluye"><h3>Qué incluye</h3><ul>${partes.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>`;
  return `<p class="ficha__descripcion">${esc(partes.join(' · '))}</p>`;
}

function cocheFicha(o, ctx) {
  const d = ctx.distancias?.get(o.id);
  if (!d) return '';
  const viaje = d.minutos != null ? `${duracion(d.minutos)} en coche${d.estimado ? ' (estimado)' : ''}` : 'No se llega en coche';
  const km = d.kmCoche != null ? `${Math.round(d.kmCoche)} km por carretera` : `${Math.round(d.km)} km en línea recta`;
  if (conTransporteIncluido(o)) {
    // Solo como comparación explícita: la oferta va en tren, bus, avión o ferry.
    const medio = (ETIQUETAS_TRANSPORTE[o.transporte] ?? '').toLowerCase();
    return `<p class="ficha__coche">${conIcono(o.transporte, `Esta oferta va en ${esc(medio)}. <span class="suave">Para comparar: en coche serían ${esc(viaje)} · ${esc(km)} desde ${esc(ctx.desde)}.</span>`)}</p>`;
  }
  // Si la tabla del coste del viaje ya lleva la gasolina, no se repite aquí.
  const coste = costeDe(o, ctx).partes.some((p) => p.concepto.startsWith('Gasolina')) ? '' : textoCosteCoche(o, ctx);
  return `<p class="ficha__coche">${conIcono('coche', `<strong>${viaje}</strong> · ${km} desde ${esc(ctx.desde)}${coste ? `<br>${coste}` : ''}`)}</p>`;
}

function vueloFicha(v) {
  if (!v) return '';
  return `<dl class="billete__tramos ficha__tramos">${tramo('Ida', v.ida, true)}${tramo('Vuelta', v.vuelta, true)}</dl>`;
}

/** Los enlaces de la ficha como <li>: el primero, el de la oferta (botón grande). */
function enlacesFicha(o, ctx = {}) {
  // Los de buscar este mismo alojamiento van en «Comparar precios».
  const enlaces = (o.enlaces ?? []).filter((e) => e.grupo !== 'este-alojamiento');
  const propia = o.urlReserva ?? o.url;
  if (!enlaces.some((e) => e.url === propia || e.url === o.url)) enlaces.unshift({ etiqueta: 'Ver la oferta', url: propia, afiliado: o.afiliado, propia: true });
  return enlaces
    // Los buscadores (Booking, Skyscanner…) abren tus fechas; la web de la oferta, solo si las
    // entiende en la URL (si no, tal cual: cambiarle la URL podría romperla).
    .map((e) => ({ ...e, url: urlSegura(e.propia ? urlPropia(o, ctx) : enlaceConBusqueda(e.url, o, ctx)) }))
    .filter((e) => e.url)
    .map((e, i) => {
      const pagado = Boolean(e.afiliado || (e.propia && o.patrocinada));
      const clic = ` data-clic="${esc(e.afiliado ?? (e.propia ? o.fuente : 'enlace'))}" data-clic-tipo="${e.afiliado ? 'afiliado' : e.propia && o.patrocinada ? 'patrocinado' : 'normal'}" data-clic-oferta="${esc(o.tipo)}"`;
      return `<li><a class="boton ${i ? 'boton--mini' : 'boton--primario'}" href="${esc(e.url)}" target="_blank" rel="${relEnlace(pagado)}"${clic}>${esc(e.etiqueta)}${e.afiliado ? ' <span class="suave">(afiliado)</span>' : ''}${i ? '' : icono('externo')}<span class="sr"> (se abre en otra pestaña)</span></a></li>`;
    });
}

/**
 * «Comparar precios»: la misma oferta en otras webs (la más barata, la diferencia y lo que
 * ahorras en tu viaje) y enlaces para buscar este mismo alojamiento en Booking y Google.
 */
function comparadorFicha(o, ctx) {
  const c = comparativa(o, ctx);
  const buscar = (o.enlaces ?? [])
    .filter((e) => e.grupo === 'este-alojamiento')
    .map((e) => ({ ...e, url: urlSegura(enlaceConBusqueda(e.url, o, ctx)) }))
    .filter((e) => e.url);
  if (!c && !buscar.length) return '';
  const enlace = (url, afiliado, texto, sr) => `<a class="boton boton--mini" href="${esc(url)}" target="_blank" rel="${relEnlace(Boolean(afiliado))}" data-clic="${esc(afiliado ?? 'enlace')}" data-clic-tipo="${afiliado ? 'afiliado' : 'normal'}" data-clic-oferta="${esc(o.tipo)}">${texto}${afiliado ? ' <span class="suave">(afiliado)</span>' : ''}${icono('externo')}<span class="sr">${sr} (se abre en otra pestaña)</span></a>`;
  let tabla = '';
  let resumen = '';
  if (c) {
    const todasIguales = c.comparable && c.filas.every((f) => Math.round(porNoche(f)) === c.minimo);
    const filas = c.filas.map((f) => {
      const mejor = c.comparable && !todasIguales && Math.round(porNoche(f)) === c.minimo;
      const precioFila = c.comparable
        ? `<strong>${euros(Math.round(porNoche(f)))}</strong>${Math.round(porNoche(f)) > c.minimo ? ` <span class="comparador__dif">+${euros(Math.round(porNoche(f)) - c.minimo)}</span>` : ''}`
        : typeof f.precio === 'number' ? `<strong>${euros(f.precio)}</strong><span class="comparador__unidad">${esc(ETIQUETAS_UNIDAD[f.unidad] ?? SIN_UNIDAD)}</span>` : '<span class="suave">Sin precio</span>';
      const url = urlSegura(f.url);
      const accion = f.actual ? '<span class="suave">Esta oferta</span>' : url ? enlace(url, f.afiliado, 'Ver', ` en ${nombreWeb(f.fuente, ctx)}`) : '';
      return `<tr class="${[mejor && 'comparador__fila--mejor', f.actual && 'comparador__fila--actual'].filter(Boolean).join(' ')}">
        <th scope="row">${nombreWeb(f.fuente, ctx)}${mejor ? ' <span class="comparador__mejor">Más barata</span>' : ''}</th>
        <td class="num">${precioFila}</td><td class="comparador__accion">${accion}</td></tr>`;
    }).join('');
    const leyenda = c.comparable ? ', por persona y noche' : ': cada web da el precio a su manera';
    tabla = `<table class="coste comparador__tabla">
      <caption class="comparador__leyenda">${loMismo(o)} en ${c.filas.length} webs${leyenda}</caption>
      <tbody>${filas}</tbody></table>`;
    if (c.comparable) {
      const yo = Math.round(porNoche(o));
      const otras = c.filas.filter((f) => !f.actual);
      const noches = o.noches ?? ctx.noches ?? 1;
      const viajeros = ctx.viajeros ?? 2;
      const total = (eur) => (viajeros > 1 || noches > 1 ? ` (≈ ${euros(eur * viajeros * noches)} para ${contar(viajeros, 'persona')} y ${contar(noches, 'noche')})` : '');
      if (todasIguales) resumen = `Mismo precio en las ${c.filas.length} webs donde la hemos visto.`;
      else if (yo > c.minimo) resumen = `En <strong>${nombreWeb(c.filas[0].fuente, ctx)}</strong> ahorras ≈ ${euros(yo - c.minimo)} por persona y noche${total(yo - c.minimo)}.`;
      else {
        // La más barata (quizá empatada con otra web): la diferencia es con la siguiente más cara.
        const empatadas = otras.filter((f) => Math.round(porNoche(f)) === yo).map((f) => nombreWeb(f.fuente, ctx));
        const siguiente = otras.find((f) => Math.round(porNoche(f)) > yo);
        const diferencia = Math.round(porNoche(siguiente)) - yo;
        resumen = `Aquí es la más barata${empatadas.length ? ` (igual que en ${enumerar(empatadas)})` : ''}: en ${nombreWeb(siguiente.fuente, ctx)} cuesta ≈ ${euros(diferencia)} más por persona y noche${total(diferencia)}.`;
      }
      resumen = `<p class="comparador__ahorro">${conIcono('cartera', resumen)}</p>`;
    }
  }
  const textoBuscar = c ? 'Búscalo también con tus fechas en:' : `Solo lo hemos visto en ${nombreWeb(o.fuente, ctx)}. Compara su precio en:`;
  const busqueda = buscar.length
    ? `<p class="comparador__buscar">${textoBuscar}</p>
    <ul class="comparador__enlaces">${buscar.map((e) => `<li>${enlace(e.url, e.afiliado, esc(e.etiqueta), '')}</li>`).join('')}</ul>`
    : '';
  const aviso = c ? '<p class="suave comparador__nota">Precio publicado por cada web en su última revisión: puede ser para otras fechas o haber cambiado.</p>' : '';
  return `<section class="comparador" aria-labelledby="ficha-comparador-titulo">
  <h3 id="ficha-comparador-titulo">${icono('balanza')}Comparar precios</h3>
  ${tabla}${resumen}${aviso}${busqueda}
</section>`;
}

/** Aviso de la ficha cuando alguno de sus enlaces es de afiliado o la oferta está patrocinada. */
function avisoPagoFicha(o, ctx) {
  const avisos = [
    (o.afiliado || (o.enlaces ?? []).some((e) => e.afiliado) || comparativa(o, ctx)?.filas.some((f) => f.afiliado))
      && `Los enlaces marcados «(afiliado)» son de afiliado. ${TEXTO_AFILIADO}`,
    o.patrocinada && `Oferta patrocinada por ${o.patrocinada.anunciante}: se marca así y no sube en el orden normal.`,
  ].filter(Boolean);
  return avisos.map((a) => `<p class="aviso-afiliado dato-extra">${conIcono('info', esc(a))}</p>`).join('');
}

/**
 * Contenido de la ficha (modal) de una oferta: a la izquierda qué es, dónde y qué hay allí;
 * a la derecha el precio, el enlace, el coste del viaje y el historial (la gráfica se dibuja
 * después en #ficha-grafica).
 */
export function contenidoFicha(o, ctx) {
  const imagen = urlSegura(o.imagen);
  const enlaces = enlacesFicha(o, ctx);
  const serie = ctx.historial?.[o.id] ?? [];
  return `<div class="ficha__cuerpo" style="--color-tema:${colorTema(o)}">
<div class="ficha__principal">
  <header class="ficha__cabeza">
    <p class="tarjeta__origen">${temasIconos(o, ctx)} ${esc(ETIQUETAS_TIPO[o.tipo] ?? o.tipo)} · ${esc(ctx.fuentes.get(o.fuente) ?? o.fuente)}</p>
    <h2 id="ficha-titulo">${esc(o.titulo)}</h2>
    <p class="tarjeta__lugar">${textoLugar(o)}</p>
    ${resumenFicha(o, ctx)}
  </header>
  <div class="ficha__media">${escena(tipoEscena(o))}${imagen ? `<img class="ficha__imagen" src="${esc(imagen)}" alt="" referrerpolicy="no-referrer">` : ''}</div>
  <div class="insignias">${insignias(o, ctx)}</div>
  ${vueloFicha(o.vuelo)}
  ${descripcionFicha(o)}
  ${cocheFicha(o, ctx)}
  ${tiempo(o, ctx)}
  ${eventosDe(o, ctx).length ? `<section class="ficha__eventos"><h3>${icono('puentes')}${busquedaPara(o, ctx) ? `Qué hay por la zona esos días (${esc(busquedaPara(o, ctx).etiqueta)})` : conFechasDeViaje(o) ? 'Qué hay esos días por la zona' : 'Qué hay el próximo finde por la zona (si vas entonces)'}</h3>${eventos(o, { conEnlace: true }, ctx)}</section>` : ''}
  ${queHacerAlli(ctx)}
  ${datosFicha(o, ctx)}
</div>
<aside class="ficha__lateral" aria-label="Precio y reserva">
  <div class="ficha__precio">${precio(o)}<span class="acciones">${botonDescartar(o)}${botonComparar(o, ctx)}${botonFavorito(o, ctx)}</span></div>
  ${textoComprobada(o, ctx)}
  <h3 class="sr">Reservar</h3>
  <ul class="ficha__enlaces">${enlaces[0] ?? ''}</ul>
  ${notaFechasOferta(o, ctx)}
  ${comparadorFicha(o, ctx)}
  ${enlaces.length > 1 ? `<section class="ficha__mas-enlaces" aria-labelledby="ficha-enlaces-titulo">
    <h3 id="ficha-enlaces-titulo">${icono('enlace')}Organiza el viaje${busquedaPara(o, ctx) ? ` <span class="suave">(${esc(busquedaPara(o, ctx).etiqueta)})</span>` : ''}</h3>
    <ul class="ficha__enlaces ficha__enlaces--resto">${enlaces.slice(1).join('')}</ul>
  </section>` : ''}
  ${avisoPagoFicha(o, ctx)}
  ${costeFicha(o, ctx)}
  <section class="ficha__historial" aria-labelledby="ficha-historial-titulo">
    <h3 id="ficha-historial-titulo">${icono('bajada')}Historial de precios${o.historialPorNoche ? ' <span class="suave">(por noche)</span>' : ''}</h3>
    ${serie.length >= 2
    ? `<div class="ficha__grafica"><canvas id="ficha-grafica" role="img" aria-label="Evolución del precio en ${serie.length} días"></canvas></div>
       <p class="suave">Mínimo ${euros(Math.min(...serie.map(([, p]) => p)))} · máximo ${euros(Math.max(...serie.map(([, p]) => p)))}${sufijoSerie(o)} · desde el ${esc(etiquetaDia(serie[0][0]))}${o.historialPorNoche ? '. Por noche porque las fechas y las noches que da la web cambian de un día a otro' : ''}</p>`
    : '<p class="suave">Aún no hay historial suficiente (hacen falta al menos dos días).</p>'}
  </section>
  ${ctx.misEstados ? botonesMiEstado(o, ctx) : ''}
</aside>
${barraReserva(o, ctx)}
</div>`;
}

/**
 * En el móvil el precio y el botón quedan al final de la ficha: esta barra los deja siempre a
 * mano, abajo (solo se ve con una columna; ver estilos).
 */
function barraReserva(o, ctx) {
  const boton = enlaceOferta(o, undefined, ctx);
  if (!boton) return '';
  const cifra = typeof o.precio !== 'number' ? ''
    : o.precio === 0 ? '<strong>Gratis</strong>'
      : `${esPrecioDesde(o) ? '<span class="suave">desde</span> ' : ''}<strong>${euros(o.precio)}</strong>${ETIQUETAS_UNIDAD[o.unidad] ? ` <span class="suave">${ETIQUETAS_UNIDAD[o.unidad]}</span>` : ''}`;
  return `<div class="ficha__reserva"><p class="ficha__reserva-precio">${cifra}</p>${boton}</div>`;
}
