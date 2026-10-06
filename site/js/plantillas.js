/**
 * Plantillas HTML (cadenas) de tarjetas, listas, estados vacíos y la ficha.
 * Todo el texto externo pasa por escaparHtml y los enlaces por urlSegura.
 */

import { costeViaje, resumenCoste } from './coste.js';
import { diasEntre, etiquetaDia, etiquetaRango, fechaLocal, horaDe } from './fechas.js';
import {
  ETIQUETAS_ALOJAMIENTO, ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE, ETIQUETAS_UNIDAD, SIN_UNIDAD, TIPOS_EVENTO,
  contar, duracion, enumerar, escaparHtml as esc, euros, grados, haceCuanto, nota, puntosMinigrafica, tituloLegible, urlSegura,
} from './formato.js';
import {
  SIN_COCHE, duracionActividad, encajeEnRango, esDuplicada, esNovedad, precioDeSerie, salidasDe, sinComprobar, sufijoSerie,
  tieneVuelo,
} from './filtros.js';
import { escena, icono, iconoTema, iconoTiempo, tipoEscena } from './iconos.js';
import { conFechas, ofertaConFechas } from './fechas-enlaces.js';
import { motivoPrincipal } from './nota.js';
import { repartoPorNoche } from './plantillas-ficha.js';

// La ficha va en plantillas-ficha.js; se sigue pudiendo importar desde aquí.
export { contenidoFicha, textoPrecioLitro } from './plantillas-ficha.js';

export const ESTADOS_FUENTE = {
  ok: { texto: 'Funciona', clase: 'ok' },
  error: { texto: 'Con errores', clase: 'error' },
  // Funciona, pero lee mucho menos de lo normal o casi sin precios: puede que la web haya cambiado.
  aviso: { texto: 'Revisar', clase: 'aviso' },
  desactivada: { texto: 'Desactivada', clase: 'inactiva' },
  bloqueada: { texto: 'Bloqueada', clase: 'inactiva' },
  pendiente: { texto: 'Pendiente', clase: 'pendiente' },
};

export const colorTema = (o) => (o.temas?.[0] ? `var(--tema-${o.temas[0]})` : 'var(--acento)');
/** Un dato con su icono delante; el texto va en un <span> para que no se parta en trozos. */
export const conIcono = (nombre, contenido) => `${icono(nombre)}<span>${contenido}</span>`;
const envolverDato = (contenido) => (contenido ? `<p class="dato-extra">${contenido}</p>` : '');

/** Iconos de las temáticas; en la tarjeta, como mucho 3 (la ficha las enseña todas). */
export function temasIconos(o, ctx, max = Infinity) {
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
export function textoMinimo(o, ctx) {
  const serie = ctx.historial?.[o.id];
  if (!o.minimoHistorico) return null;
  if (!serie?.length) return { texto: 'Mínimo histórico', detalle: 'El precio más bajo registrado por el vigilante' };
  const dias = diasEntre(serie[0][0], serie.at(-1)[0]);
  return {
    texto: `Precio más bajo en ${dias} días`,
    detalle: `El más bajo${sufijoSerie(o)} desde el ${etiquetaDia(serie[0][0])} (${serie.length} días con precio; máximo ${euros(Math.max(...serie.map(([, p]) => p)))}${sufijoSerie(o)})`,
  };
}

export const textoBajada = (o) => (o.bajada > 0 && typeof o.precio === 'number'
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
export function insignias(o, ctx, { enFoto = false } = {}) {
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
export const porNoche = (x) => (Number.isFinite(x?.precioNoche) && x.precioNoche > 0 ? x.precioNoche : null);
export const nombreWeb = (fuente, ctx) => esc(ctx.fuentes?.get(fuente) ?? fuente);
/** El nombre de la otra web enlazando a la oferta en ella. */
function webEnlazada(f, ctx) {
  const url = urlSegura(f.url);
  return url ? `<a href="${esc(url)}" target="_blank" rel="${relEnlace(Boolean(f.afiliado))}">${nombreWeb(f.fuente, ctx)}</a>` : nombreWeb(f.fuente, ctx);
}
/** «El mismo alojamiento» en casas y hoteles; en un paquete o una actividad, «la misma oferta». */
export const loMismo = (o) => (o.tipo === 'hotel' ? 'El mismo alojamiento' : 'La misma oferta');

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
export const conTransporteIncluido = (o) => SIN_COCHE.includes(o.transporte);

/** «≈ 34 € de gasolina ida y vuelta · estimado, un coche para 2 personas» (sin etiqueta: se envuelve fuera). */
export function textoCosteCoche(o, ctx) {
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
export const conFechasDeViaje = (o) => Boolean(o.fechas?.salida || o.fechas?.findeId || o.fechas?.puenteId);

/** «24° · 10 % de lluvia» del finde o puente de la oferta, con su icono. */
/**
 * ¿Es de otro día del que se busca? La previsión y los eventos se calculan para el próximo
 * finde: si buscas otras fechas, no son los tuyos y no se enseñan.
 */
const fueraDeBusqueda = (dia, o, ctx) => {
  const b = busquedaPara(o, ctx);
  return Boolean(b && dia && (dia < b.entrada || dia > b.salida));
};

export function tiempo(o, ctx = {}) {
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
export const eventosDe = (o, ctx) => (o.eventos ?? []).filter((ev) => !fueraDeBusqueda(ev.fecha, o, ctx));

/** «a 3 km», «aquí mismo» (menos de 1 km). */
const distanciaEvento = (km) => (km == null ? '' : km < 1 ? 'aquí mismo' : `a ${Math.round(km)} km`);

/**
 * Lo que pasa cerca esos días (hasta 6), con su tipo, cuándo, a qué distancia y, si se sabe,
 * cuánto cuesta. Del más cercano al más lejano, como llegan del escaneo.
 */
export function eventos(o, { conEnlace = false } = {}, ctx = {}) {
  const lista = eventosDe(o, ctx).slice(0, 6);
  if (!lista.length) return '';
  const filas = lista.map((ev) => {
    const [tipo, , ic] = TIPOS_EVENTO[ev.tipo] ?? TIPOS_EVENTO.otros;
    const url = conEnlace ? urlSegura(ev.url) : null;
    const nombre = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(ev.nombre)}</a>`
      : esc(ev.nombre);
    const detalle = [tipo, ev.fecha && etiquetaDia(ev.fecha), [distanciaEvento(ev.km), ev.municipio && ev.km >= 1 ? `(${ev.municipio})` : ''].filter(Boolean).join(' '), ev.precio].filter(Boolean).join(' · ');
    return `<li class="evento evento--${esc(ev.tipo ?? 'otros')}">${icono(ic)}<span>${nombre} <span class="suave">${esc(detalle)}</span></span></li>`;
  });
  return `<ul class="eventos" aria-label="Eventos cerca esos días">${filas.join('')}</ul>`;
}

/**
 * Para la tarjeta, lo más llamativo que pasa cerca: un concierto o unas fiestas antes que
 * una exposición. «Concierto a 1 km»; el nombre, al pasar por encima y en la ficha.
 */
export function insigniaEvento(o, ctx = {}) {
  // Con fechas flexibles los eventos son los del próximo finde, una suposición: a la tarjeta
  // solo si son los de sus fechas o los de las que buscas (la ficha los enseña avisando)…
  // salvo si filtras por eventos: entonces se ven, con su día («si vas el sáb 10»).
  const supuesto = !conFechasDeViaje(o) && !busquedaPara(o, ctx);
  if (supuesto && !ctx.conEventos) return '';
  const lista = eventosDe(o, ctx);
  const preferido = (e) => (ctx.tipoEvento && ctx.tipoEvento !== 'todos' ? e.tipo === ctx.tipoEvento : !['exposiciones', 'otros'].includes(e.tipo));
  const ev = lista.find(preferido) ?? lista[0];
  if (!ev) return '';
  const [tipo, , ic] = TIPOS_EVENTO[ev.tipo] ?? TIPOS_EVENTO.otros;
  const mas = lista.length > 1 ? ` y ${lista.length - 1} más` : '';
  const dia = supuesto && ev.fecha ? ` · si vas el ${etiquetaDia(ev.fecha)}` : '';
  return `<span class="insignia insignia--evento" title="${esc(`${ev.nombre}${ev.fecha ? ` · ${etiquetaDia(ev.fecha)}` : ''}${mas ? ` · ${lista.length} eventos cerca esos días` : ''}`)}">${icono(ic)}${esc(`${tipo} ${distanciaEvento(ev.km)}`.trim())}${esc(mas)}${esc(dia)}</span>`;
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

/** Qué mide la nota del chollo (sale al pasar por encima y en la ficha). */
export const QUE_MIDE_LA_NOTA = 'Lo bueno que es como chollo: sobre todo el precio frente a ofertas parecidas; también las opiniones de otros clientes, las bajadas, el descuento, si es nueva, si cae en finde o puente y lo cómodo que es llegar.';

/** «Chollazo», «Muy buena», «Buena» o «Normal» según la nota (0–100). */
export const nivelNota = (o) => (o.chollazo ? 'Chollazo' : o.puntuacion >= 60 ? 'Muy buena' : o.puntuacion >= 40 ? 'Buena' : 'Normal');

function puntuacion(o, ctx = {}) {
  const nivel = o.chollazo ? 'alta' : o.puntuacion >= 60 ? 'media' : 'baja';
  const motivo = motivoPrincipal(o, ctx.ahora);
  const texto = `Valor de la oferta: ${o.puntuacion} de 100 (${nivelNota(o).toLowerCase()}). ${motivo ? `${motivo}.` : QUE_MIDE_LA_NOTA}`;
  return `<span class="puntuacion puntuacion--${nivel}" title="${esc(texto)}"><span aria-hidden="true"><span class="puntuacion__etiqueta">Valor</span> ${o.puntuacion}</span><span class="sr">${esc(texto)}</span></span>`;
}

export function botonFavorito(o, ctx) {
  const activo = ctx.favoritos.has(o.id);
  return `<button type="button" class="boton-icono boton-fav" data-fav="${esc(o.id)}" aria-pressed="${activo}" aria-label="Guardar en favoritos: ${esc(o.titulo)}">${icono('corazon')}</button>`;
}

/** Para añadirla a la comparación (hasta 3). */
export function botonComparar(o, ctx) {
  if (!ctx.comparar) return '';
  const activo = ctx.comparar.has(o.id);
  // Con la palabra «Comparar» mientras no se compara nada: solo el icono no se entendía.
  const conTexto = ctx.comparar.size === 0;
  return `<button type="button" class="boton-icono boton-comparar${conTexto ? ' boton-comparar--texto' : ''}" data-comparar="${esc(o.id)}" aria-pressed="${activo}" title="${activo ? 'Quitar de «Comparar lado a lado»' : 'Comparar lado a lado (hasta 3)'}" aria-label="${activo ? 'Quitar de «Comparar lado a lado»' : 'Añadir a «Comparar lado a lado»'}: ${esc(o.titulo)}">${icono('comparar')}${conTexto ? '<span class="boton-comparar__texto" aria-hidden="true">Comparar</span>' : ''}</button>`;
}

/** «La he reservado» y «Ya no está disponible»: se guardan en este navegador. */
export function botonesMiEstado(o, ctx) {
  const actual = ctx.misEstados.get(o.id);
  const boton = (estado, nombre, texto) => `<button type="button" class="boton boton--suave boton--mini" data-mi-estado="${estado}" data-oferta="${esc(o.id)}" aria-pressed="${actual === estado}">${icono(nombre)}${texto}</button>`;
  return `<p class="acciones mi-estado">${boton('reservada', 'check', 'La he reservado')}${boton('no-disponible', 'prohibido', 'Ya no está disponible')}</p>`;
}

/** ✕ para ocultar la oferta en este navegador. */
export function botonDescartar(o) {
  return `<button type="button" class="boton-icono boton-icono--mini boton-descartar" data-descartar="${esc(o.id)}" title="Ocultar esta oferta" aria-label="Ocultar esta oferta: ${esc(o.titulo)}">${icono('cerrar')}</button>`;
}

/** Un enlace pagado (afiliado o patrocinado) lleva rel="sponsored", como piden los buscadores. */
export const relEnlace = (pagado) => (pagado ? 'sponsored noopener noreferrer' : 'noopener noreferrer');

/** Atributos para contar el clic (proveedor, tipo de enlace y tipo de oferta), sin datos personales. */
const atributosClic = (o, afiliado) => ` data-clic="${esc(o.fuente)}" data-clic-tipo="${afiliado ? 'afiliado' : o.patrocinada ? 'patrocinado' : 'normal'}" data-clic-oferta="${esc(o.tipo)}"`;

export function enlaceOferta(o, texto = 'Ver oferta', ctx = {}) {
  const url = urlSegura(urlPropia(o, ctx));
  const pagado = Boolean(o.afiliado || o.patrocinada);
  return url ? `<a class="boton boton--primario" href="${esc(url)}" target="_blank" rel="${relEnlace(pagado)}"${atributosClic(o, o.afiliado)}><span class="boton__texto">${texto}</span>${icono('externo')}<span class="sr"> (se abre en otra pestaña${o.afiliado ? '; enlace de afiliado' : ''})</span></a>` : '';
}

/** «Enlace de afiliado» en la tarjeta; la explicación completa, en la ficha. */
export const TEXTO_AFILIADO = 'Si reservas por este enlace, la web puede pagarnos una comisión. No cambia tu precio ni el orden de las ofertas.';

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

/**
 * El precio que publica la web. Con `etiqueta` («Precio en Atrápalo») va rotulado: en grande
 * con `principal` (tarjetas) o en pequeño si al lado hay otra cifra mayor.
 */
export function precio(o, { etiqueta = null, principal = false } = {}) {
  const rotulo = etiqueta ? `<span class="precio__etiqueta">${esc(etiqueta)}</span>` : '';
  // `principal`: rotulado pero en grande, que es lo primero que se mira.
  const clase = etiqueta ? `precio ${principal ? 'precio--oferta' : 'precio--publicado'}` : 'precio';
  return rotulo ? precioBase(o).replace('<p class="precio">', `<p class="${clase}">${rotulo}`) : precioBase(o);
}

function precioBase(o) {
  if (typeof o.precio !== 'number') return `<p class="precio"><strong class="precio__consultar">${esc(o.precioTexto || 'Consultar precio')}</strong></p>`;
  if (o.precio === 0) return `<p class="precio"><strong class="precio__gratis">Gratis</strong>${matiz(o.precioTexto)}</p>`;
  // Sin unidad en el modelo, lo que dice la web («por persona y trayecto», «en total para 2»)
  // explica más que nada; si tampoco lo dice, se avisa.
  const unidad = ETIQUETAS_UNIDAD[o.unidad]
    ?? (/\b(?:por|total|ida|trayecto)\b/i.test(o.precioTexto ?? '') ? esc(o.precioTexto) : SIN_UNIDAD);
  const noche = o.precioNoche != null && o.unidad !== 'pp/noche' && Math.round(o.precioNoche) !== Math.round(o.precio)
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
export const enlaceConBusqueda = (url, o, ctx) => {
  const b = busquedaPara(o, ctx);
  return b ? conFechas(url, b, ctx.viajeros) : url;
};

/**
 * La web de la oferta: con tus fechas si es de fechas flexibles y esa web las entiende en la
 * URL (Holidu, Clubrural); si no, tal cual.
 */
export function urlPropia(o, ctx = {}) {
  const propia = o.urlReserva ?? o.url;
  const b = busquedaPara(o, ctx);
  return (b && ofertaConFechas(propia, b, ctx.viajeros)) || propia;
}

/** Junto al botón de la ficha: si abre tus fechas o cuáles tienes que elegir en su web. */
export function notaFechasOferta(o, ctx) {
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
  const credito = o.imagenCredito?.texto ? ` title="${esc(o.imagenCredito.texto)}"` : '';
  return `${escena(tipoEscena(o))}${url ? `<img class="tarjeta__imagen" src="${esc(url)}" alt=""${credito} loading="lazy" decoding="async" referrerpolicy="no-referrer" width="480" height="300">` : ''}`;
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
 * Con un finde o un puente elegido (`ctx.rango`), si una oferta de fechas cerradas cabe en
 * él o en qué se sale: «Cabe en el 10–12 oct» o «Sale un día antes». '' si no aplica.
 */
export function textoEncaje(o, ctx = {}) {
  const encaje = encajeEnRango(o, ctx.rango);
  if (!encaje) return '';
  if (encaje.cabe) return `Cabe en el ${etiquetaRango(ctx.rango.inicio, ctx.rango.fin)}`;
  const texto = encaje.motivos.join(' y ');
  return `${texto[0].toUpperCase()}${texto.slice(1)} del ${etiquetaRango(ctx.rango.inicio, ctx.rango.fin)}`;
}

function insigniaEncaje(o, ctx) {
  const texto = textoEncaje(o, ctx);
  if (!texto) return '';
  const cabe = encajeEnRango(o, ctx.rango).cabe;
  return `<span class="insignia insignia--encaje${cabe ? '' : ' insignia--fuera'}">${icono(cabe ? 'check' : 'calendario')}${esc(texto)}</span>`;
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
    o.fechas?.salida ? dato('calendario', [textoFechas(o), textoEncaje(o, ctx)].filter(Boolean).join(' · '))
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

/** La acción principal de la tarjeta dice qué abre: «Ver escapada», «Ver plan» o «Ver vuelo». */
const textoAccion = (o) => ({ actividad: 'Ver plan', vuelo: 'Ver vuelo' }[o.tipo] ?? 'Ver escapada');

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
      ${puntuacion(o, ctx)}
      ${botonDescartar(o)}
    </div>
    <h3 class="tarjeta__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(tituloLegible(o.titulo))}</button></h3>
    ${opinionesTarjeta(o, web)}
    ${motivoTarjeta(o, ctx)}
    <ul class="tarjeta__datos">${datosTarjeta(o, ctx)}</ul>
    <div class="insignias insignias--tarjeta">${insigniaEvento(o, ctx)}${equivalentes(o, ctx)}${insigniasTarjeta(o, ctx)}${avisoTarjeta(o, ctx)}</div>
    <div class="tarjeta__pie">
      <div class="tarjeta__precio">${bloquePrecio(o, ctx)}</div>
      <div class="acciones">${botonComparar(o, ctx)}${enlaceOferta(o, typeof o.precio === 'number' && o.precio > 0 ? textoAccion(o) : `Ver en ${esc(web)}`, ctx)}</div>
    </div>
  </div>
</article>`;
}

/** Cuánto fiarse de una nota según cuántas opiniones la respaldan. */
export function fiabilidadOpiniones(n) {
  if (!n) return { corta: 'sin nº de opiniones', larga: 'La web no dice cuántas opiniones hay detrás de la nota: tómala con cautela.' };
  if (n < 10) return { corta: 'pocas opiniones', larga: `Solo ${contar(n, 'opinión', 'opiniones')}: una nota con tan pocas cambia mucho con la siguiente. Tómala con cautela.` };
  if (n < 50) return { corta: null, larga: `${contar(n, 'opinión', 'opiniones')}: una nota bastante fiable.` };
  return { corta: null, larga: `${contar(n, 'opinión', 'opiniones')}: una nota muy fiable.` };
}

/**
 * «★ 8,2 Muy bien · 266 opiniones en Holidu»: lo que opinan otros clientes, a la vista.
 * Sin nota, la línea queda en blanco (solo los lectores de pantalla oyen que la web no las
 * publica): «X no publica opiniones» en cada tarjeta era ruido.
 */
function opinionesTarjeta(o, web) {
  const v = o.valoracion;
  if (!(v?.nota >= 0)) {
    return o.tipo === 'vuelo' ? '<p class="tarjeta__opiniones tarjeta__opiniones--sin" aria-hidden="true"></p>'
      : `<p class="tarjeta__opiniones tarjeta__opiniones--sin"><span class="sr">${esc(web)} no publica opiniones</span></p>`;
  }
  const f = fiabilidadOpiniones(v.n);
  const cuantas = v.n ? ` · ${contar(v.n, 'opinión', 'opiniones')}` : '';
  return `<p class="tarjeta__opiniones" title="Valoración de los clientes en ${esc(web)}. ${esc(f.larga)}">${icono('estrella')}<strong>${nota(v.nota)}<span class="tarjeta__opiniones-max">/10</span></strong><span class="tarjeta__opiniones-texto">${adjetivoNota(v.nota)}${cuantas}${f.corta ? ` · <span class="aviso-suave">${f.corta}</span>` : ''}</span></p>`;
}

/**
 * El motivo principal de la nota, entero y en dos líneas como mucho («Más barata que 180 de
 * 206 escapadas parecidas»): antes iban dos motivos en una línea y se cortaba a media frase.
 * El desglose completo, en la ficha.
 */
function motivoTarjeta(o, ctx) {
  const motivo = motivoPrincipal(o, ctx.ahora, { corto: true });
  if (!motivo) return '<p class="tarjeta__motivo" aria-hidden="true"></p>';
  return `<p class="tarjeta__motivo" title="${esc(`Por qué tiene un ${o.puntuacion}: ${motivoPrincipal(o, ctx.ahora)}`)}">${esc(motivo)}</p>`;
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
 * La sugerencia de hoy en la portada, en corto y por debajo del buscador: foto, qué es, el
 * precio de la oferta y el viaje completo en una línea. El desglose, en su ficha.
 */
export function tarjetaSugerencia(o, ctx) {
  const c = costeDe(o, ctx);
  const total = c.total != null
    ? `${c.estimado ? '≈ ' : ''}${euros(Math.round(c.total))} el viaje completo para ${contar(c.viajeros, 'persona')}${ctx.desde ? ` desde ${ctx.desde}` : ''}`
    : '';
  const lugar = textoLugar(o);
  return `<article class="sugerencia" style="--color-tema:${colorTema(o)}">
  <div class="sugerencia__media">${mediaOferta(o)}</div>
  <div class="sugerencia__cuerpo">
    <p class="sugerencia__ceja">${icono('fuego')}Sugerencia de hoy</p>
    <h2 class="sugerencia__titulo"><button type="button" class="enlace-ficha" data-ficha="${esc(o.id)}">${esc(tituloLegible(o.titulo))}</button></h2>
    ${lugar ? `<p class="sugerencia__lugar">${lugar}</p>` : ''}
    ${precio(o)}
    ${total ? `<p class="sugerencia__total">${esc(total)}</p>` : ''}
  </div>
  <button type="button" class="boton boton--suave sugerencia__accion" data-ficha="${esc(o.id)}">Ver desglose y oferta${icono('flecha')}</button>
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
export function textoComprobada(o, ctx) {
  const f = frescura(o, ctx);
  if (!f) return '';
  const web = esc(ctx.fuentes?.get(o.fuente) ?? o.fuente);
  return f.desactualizada
    ? `<p class="dato-extra comprobada comprobada--antigua" title="Visto por última vez el ${esc(f.cuando)}">${conIcono('alerta', `Sin comprobar en ${web} desde ${esc(f.texto)}: puede haber cambiado o terminado`)}</p>`
    : `<p class="dato-extra comprobada" title="${esc(f.cuando)}">Comprobada en ${web} ${esc(f.texto)}</p>`;
}

/** El coste del viaje completo con tu salida, viajeros y noches (coste.js). */
export const costeDe = (o, ctx) => costeViaje(o, {
  viajeros: ctx.viajeros ?? undefined, noches: ctx.noches ?? undefined, distancia: (ctx.distanciasCoste ?? ctx.distancias)?.get(o.id), coche: ctx.coche,
});

/** «Alojamiento 240 € + Gasolina ≈ 29 € (estimado)» para el título de la línea del total. */
const desgloseCorto = (c) => c.partes.map((p) => `${p.concepto} ${p.estimado ? '≈ ' : ''}${euros(Math.round(p.eur))}${p.estimado ? ' (estimado)' : ''}`).join(' + ');

/**
 * «≈ 269 € el viaje para 4 personas»; sin total, la gasolina que calculó el
 * escaneo (solo desde su origen), y si tampoco, nada.
 */
/**
 * Lo que se ha supuesto, en corto, para la tarjeta: «Desde Barcelona, en coche · 2 noches».
 * Las noches solo si las pone tu viaje (la oferta no las fija).
 */
function supuestosCortos(o, c, ctx) {
  const enCoche = c.partes.some((p) => p.concepto.startsWith('Gasolina'));
  const desde = ctx.desde ? `Desde ${ctx.desde}${enCoche ? ', en coche' : ''}` : enCoche ? 'En coche' : '';
  const noches = !o.noches && c.noches ? contar(c.noches, 'noche') : '';
  return [desde, noches].filter(Boolean).join(' · ');
}

/**
 * El coste del viaje completo, debajo del precio y en pequeño: «Viaje para 2 personas, con
 * gasolina ≈ 164 €», de dónde sale (oferta + gasolina) y lo que se supone. Sin total, la
 * gasolina que calculó el escaneo (solo desde su origen) y, si tampoco, nada.
 */
function lineaCoste(o, ctx) {
  const c = costeDe(o, ctx);
  if (c.total == null) return envolverDato(textoCosteCoche(o, ctx));
  const titulo = `${resumenCoste(c)}. ${desgloseCorto(c)}. La oferta la cobra la web que la publica; el resto es una estimación. Supone: ${c.supuestos.join('; ')}.`;
  // Con más de una parte (la oferta y la gasolina), de dónde sale el total, a la vista.
  const partes = c.partes.length > 1
    ? `${barraCoste(c)}<span class="coste__leyenda">${c.partes.map((p, i) => `<span><i class="coste__muestra coste__muestra--${claseParte(p, i)}" aria-hidden="true"></i>${p.estimado ? '≈ ' : ''}${euros(Math.round(p.eur))} ${esc(nombreCorto(p))}</span>`).join('<span aria-hidden="true">+</span>')}</span>`
    : '';
  const supuestos = supuestosCortos(o, c, ctx);
  return `<div class="dato-extra coste-total" title="${esc(titulo)}">
    <p class="coste-total__cifra"><span class="coste-total__etiqueta">${c.estimado ? 'Viaje completo estimado' : 'Viaje completo'} para ${esc(contar(c.viajeros, 'persona'))}</span> <strong>${c.estimado ? '≈ ' : ''}${esc(euros(Math.round(c.total)))}</strong></p>
    ${partes}${supuestos ? `<span class="coste-total__supuestos">${esc(supuestos)}</span>` : ''}
  </div>`;
}

/**
 * Pie de precio de las tarjetas y del destacado: primero y en grande el precio de la oferta
 * (lo que cobra la web), rotulado con la web; debajo, en pequeño, el viaje completo con la
 * gasolina para comparar.
 */
export function bloquePrecio(o, ctx) {
  const web = ctx.fuentes?.get(o.fuente) ?? o.fuente;
  const etiqueta = typeof o.precio === 'number' && o.precio > 0 ? (web ? `Precio en ${web}` : 'Precio publicado') : null;
  return `${precio(o, { etiqueta, principal: true })}${lineaCoste(o, ctx)}`;
}

/** Nombre corto de cada parte del coste para la leyenda de la tarjeta. */
const nombreCorto = (p) => (p.concepto.startsWith('Gasolina') ? 'gasolina' : p.concepto.startsWith('Billetes de vuelta') ? 'vuelta' : p.concepto.startsWith('Billetes') ? 'billetes' : 'oferta');
/** Color de cada parte: la oferta (lo que publica la web) y lo estimado (gasolina, la vuelta). */
export const claseParte = (p) => (p.estimado ? 'estimado' : 'oferta');

/** Barra apilada del coste: cada parte a su proporción del total. */
export function barraCoste(c) {
  const total = c.partes.reduce((suma, p) => suma + p.eur, 0) || 1;
  return `<span class="coste__barra" aria-hidden="true">${c.partes.map((p, i) => `<span class="coste__segmento coste__segmento--${claseParte(p, i)}" style="flex-grow:${Math.max(p.eur / total, 0.04).toFixed(3)}"></span>`).join('')}</span>`;
}

/** Minigráfica SVG del historial de precios (vacía si hay menos de dos puntos). */
export function minigrafica(serie) {
  const puntos = puntosMinigrafica(serie);
  if (!puntos) return '';
  const [primero, ultimo] = [serie[0][1], serie.at(-1)[1]];
  // El color dice hacia dónde va el precio (verde, baja; rojo, sube; gris, igual) y lo repite en palabras.
  const tendencia = ultimo < primero ? 'baja' : ultimo > primero ? 'sube' : 'igual';
  const texto = { baja: '↘ Ha bajado', sube: '↗ Ha subido', igual: '→ Sin cambios' }[tendencia];
  return `<span class="tendencia tendencia--${tendencia}" title="Precio de los últimos ${serie.length} días: de ${euros(primero)} a ${euros(ultimo)}"><svg class="minigrafica" viewBox="0 0 96 28" width="96" height="28" role="img" aria-label="Historial de ${serie.length} días: de ${euros(primero)} a ${euros(ultimo)}"><polyline points="${puntos}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg><span class="tendencia__texto">${texto}</span></span>`;
}

/** «vie 16 oct · 19:05 → 20:50 · Directo»: la llegada si se sabe; si no, la duración. */
export function tramo(nombre, t, conNumero = false) {
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
      ${puntuacion(o, ctx)}
      ${precio(o)}
      ${desglose}
      ${minigrafica(ctx.historial?.[o.id])}
    </div>
  </div>
  <div class="billete__pie">
    <div class="insignias">${insigniaEncaje(o, ctx)}${extras}${insignias(o, ctx)}</div>
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

/** Explica desde dónde se miden las distancias en el buscador por ubicación. */
export function textoAyudaUbicacion(punto, origen, salida = null) {
  const desde = punto ?? salida;
  if (!desde) return `Midiendo desde ${origen.nombre} con el tiempo real por carretera.`;
  // «Cerca de…» es un radio alrededor del punto; tu salida, rutas reales (rutas.js).
  return punto
    ? `Midiendo desde ${desde.nombre}: el radio y los tiempos son aproximados (línea recta × 1,3 a 80 km/h).`
    : `Midiendo desde ${desde.nombre} con los km y el tiempo reales por carretera (mientras llegan, aproximados).`;
}

export function insigniaEstado(estado) {
  const { texto, clase } = ESTADOS_FUENTE[estado] ?? { texto: estado, clase: 'pendiente' };
  return `<span class="estado estado--${clase}"><span class="punto" aria-hidden="true"></span>${esc(texto)}</span>`;
}
