/** La ficha de una oferta (el diálogo que se abre al pulsar su título). */

import { etiquetaDia } from './fechas.js';
import {
  ETIQUETAS_REGIMEN, ETIQUETAS_TIPO, ETIQUETAS_TRANSPORTE, ETIQUETAS_UNIDAD, SIN_UNIDAD, contar, duracion, enumerar,
  escaparHtml as esc, euros, haceCuanto, normalizar, nota, tituloLegible, urlSegura,
} from './formato.js';
import { duracionActividad, sufijoSerie } from './filtros.js';
import { escena, icono, tipoEscena } from './iconos.js';
import { motivosNota } from './nota.js';
import {
  QUE_MIDE_LA_NOTA, TEXTO_AFILIADO, adjetivoNota, barraCoste, botonComparar, botonDescartar, botonFavorito,
  botonesMiEstado, busquedaPara, certeza, claseParte, colorTema, comparativa, conFechasDeViaje, conIcono,
  conTransporteIncluido, costeDe, enlaceConBusqueda, enlaceOferta, esPrecioDesde, eventos, eventosDe,
  fiabilidadOpiniones, filaActividad, insignias, loMismo, nivelNota, nombreWeb, notaFechasOferta, porNoche, precio,
  relEnlace, temasIconos, textoAlojamiento, textoBajada, textoCaducidad, textoComprobada, textoCosteCoche,
  textoFechas, textoLugar, textoMinimo, textoNinos, tiempo, tramo, urlPropia,
} from './plantillas.js';

/** «Foto: Wikimedia Commons» con el enlace a su página (autor y licencia), si la foto es de allí. */
function creditoFoto(o) {
  const url = urlSegura(o.imagenCredito?.url);
  return url && o.imagen ? `<a class="ficha__credito" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(o.imagenCredito.texto ?? 'Foto')}</a>` : '';
}

/** «Coste del viaje» en la ficha: cada parte, qué es estimado, lo supuesto y lo que falta. */
function costeFicha(o, ctx) {
  const c = costeDe(o, ctx);
  if (!c.partes.length && !c.falta.length) return '';
  // Cada parte: qué es y cuánto en una línea; debajo, la cuenta con la que sale.
  const filas = c.partes.map((p, i) => `<li class="coste__parte"><span class="coste__concepto"><i class="coste__muestra coste__muestra--${claseParte(p, i)}" aria-hidden="true"></i>${esc(p.concepto)}${p.estimado ? ' <span class="etiqueta-estimado">estimado</span>' : ''}</span><span class="coste__importe">${p.estimado ? '≈ ' : ''}${euros(p.eur)}</span><span class="coste__calculo">${esc(p.calculo ?? p.detalle)}</span></li>`).join('');
  const falta = c.falta.length ? `<p class="coste__falta">Para dar un total falta saber ${esc(enumerar(c.falta))}.</p>` : '';
  // «+ peaje del Túnel del Cadí si vas por él (no incluido)»: junto a la gasolina, sin sumarlo.
  const aviso = c.aviso?.length ? `<p class="coste__falta">${esc(c.aviso.join(' · '))}</p>` : '';
  const supuestos = c.supuestos.length ? `<p class="suave">Supone: ${esc(c.supuestos.join('; '))}. Desde ${esc(ctx.desde ?? '')}.</p>` : '';
  const gasolina = c.partes.some((p) => p.concepto.startsWith('Gasolina')) ? `<p class="suave">${esc(textoPrecioLitro(ctx.coche))}</p>` : '';
  const detalle = [contar(c.viajeros, 'persona'), c.noches && contar(c.noches, 'noche'), c.viajeros > 1 && `${euros(Math.round(c.porPersona))} por persona`].filter(Boolean).join(' · ');
  const grande = c.total != null
    ? `<p class="coste__grande"><strong>${c.estimado ? '≈ ' : ''}${euros(Math.round(c.total))}</strong><span class="suave">${esc(detalle)}${c.estimado ? ' · con estimaciones' : ''}</span></p>${c.partes.length > 1 ? barraCoste(c) : ''}`
    : '';
  return `<section class="ficha__coste" aria-labelledby="ficha-coste-titulo">
  <h3 id="ficha-coste-titulo">${icono('cartera')}Coste del viaje</h3>
  ${grande}
  ${filas ? `<ul class="coste">${filas}</ul>` : ''}${gasolina}${aviso}
  ${falta}${supuestos}
  <p><button type="button" class="boton boton--suave boton--mini" data-mi-viaje>Cambiar salida, viajeros o noches</button></p>
</section>`;
}

/** Con su artículo, contraído con «de»: «de la gasolina 95», «del diésel». */
const DE_CARBURANTE = { gasolina95: 'de la gasolina 95', gasolina98: 'de la gasolina 98', gasoleo: 'del diésel', gasoleoPremium: 'del diésel premium', glp: 'del autogás (GLP)' };

/** De dónde sale el precio del litro con el que se calcula la gasolina. */
export function textoPrecioLitro(coche) {
  if (!coche?.precioLitro) return '';
  const de = DE_CARBURANTE[coche.carburante] ?? 'del carburante';
  return coche.precioMedio?.provincia
    ? `${euros(coche.precioLitro)}/l es el precio medio de hoy ${de} en las gasolineras de ${coche.precioMedio.provincia} (datos del Ministerio).`
    : `${euros(coche.precioLitro)}/l es un precio de referencia ${de}: hoy no se ha podido consultar la media de las gasolineras.`;
}

/** «Por qué tiene un 66»: cada motivo con su barra sobre lo máximo que puede dar. */
function notaFicha(o, ctx) {
  const motivos = motivosNota(o, ctx.ahora);
  if (!motivos.length) return '';
  const filas = motivos.map((m) => `<li class="motivo"><span class="motivo__texto">${esc(m.texto)}</span><span class="motivo__barra" aria-hidden="true"><span style="width:${Math.round((Math.min(m.puntos, m.maximo) / m.maximo) * 100)}%"></span></span><span class="motivo__puntos">${m.puntos > 0 ? `+${Math.round(m.puntos)}` : '0'}<span class="sr"> de ${m.maximo} puntos</span></span></li>`).join('');
  const tope = o.notaDetalle?.topeSinPrecio ? ' Sin precio con el que compararla, la nota se queda en 50 como mucho.' : '';
  return `<section class="ficha__nota" aria-labelledby="ficha-nota-titulo">
  <h3 id="ficha-nota-titulo">${icono('fuego')}Por qué tiene un ${o.puntuacion} de 100</h3>
  <ul class="motivos">${filas}</ul>
  <p class="suave">Cada barra es lo que suma ese motivo sobre lo máximo que puede dar. Lo que más pesa es el precio frente a ofertas parecidas (hasta 45 puntos).${tope}</p>
</section>`;
}

/**
 * Opiniones en la ficha: la nota en grande con su barra, cuánto fiarse según cuántas hay y
 * dónde leerlas. Los vuelos no tienen (son de una aerolínea, no de un sitio).
 */
function opinionesFicha(o, ctx) {
  if (o.tipo === 'vuelo') return '';
  const v = o.valoracion;
  const web = ctx.fuentes?.get(o.fuente) ?? o.fuente;
  const sitio = o.establecimiento ?? (o.tipo === 'actividad' ? o.titulo : null);
  const lugar = o.lugar?.nombre ?? '';
  const buscar = sitio ? [
    ['Leer opiniones en Google', `https://www.google.com/search?q=${encodeURIComponent(`${sitio} ${lugar} opiniones`.trim())}`],
    ['Buscar en Tripadvisor', `https://www.tripadvisor.es/Search?q=${encodeURIComponent(`${sitio} ${lugar}`.trim())}`],
  ] : [];
  const enlaces = [v?.nota >= 0 && [`Ver opiniones en ${web}`, urlSegura(o.url)], ...buscar].filter((e) => e && e[1])
    .map(([texto, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(texto)}${icono('externo')}</a></li>`).join('');
  const cuerpo = v?.nota >= 0
    ? `<div class="opiniones__nota"><strong>${nota(v.nota)}</strong><span class="suave">/10</span><span class="opiniones__adjetivo">${adjetivoNota(v.nota)}</span></div>
  <span class="opiniones__barra" role="img" aria-label="${esc(`${nota(v.nota)} sobre 10`)}"><span style="width:${Math.round(Math.min(10, v.nota) * 10)}%"></span></span>
  <p>${v.n ? `${esc(contar(v.n, 'opinión', 'opiniones'))} de clientes en ${esc(web)}.` : `Según ${esc(web)}.`} ${esc(fiabilidadOpiniones(v.n).larga)}</p>`
    : `<p>${esc(web)} no publica opiniones de esta oferta.${buscar.length ? ' Puedes leer lo que dicen otros viajeros aquí:' : ''}</p>`;
  return `<section class="ficha__opiniones" aria-labelledby="ficha-opiniones-titulo">
  <h3 id="ficha-opiniones-titulo">${icono('estrella')}Opiniones de otros clientes</h3>
  ${cuerpo}
  ${enlaces ? `<ul class="opiniones__enlaces">${enlaces}</ul>` : ''}
</section>`;
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

/** « (90 € en total, para 1 noche y 2 personas)»: de dónde sale el precio por persona y noche. */
export function repartoPorNoche(o) {
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
      ['Régimen', ETIQUETAS_REGIMEN[o.regimen]],
      ['Transporte incluido', transporteIncluido(o)],
      ['Niños', o.ninos && (o.ninos.detalle ? `${o.ninos.detalle}. Confírmalo en la web antes de reservar: suele haber plazas limitadas o condiciones` : 'Plan para ir con niños')],
    ]],
    ['El precio', [
      ['Precio en la web', o.precioTexto],
      ['Qué precio es', certeza(o)],
      ['Por persona y noche', o.precioNoche != null && `${euros(Math.round(o.precioNoche))}${repartoPorNoche(o)}`],
      // Solo con ofertas de verdad parecidas (mismo tema y zona, o la misma ruta): ver referenciaPrecisa.
      ['Media de las parecidas', /^(?:escapada|vuelo):/.test(o.referencia?.grupo ?? '') && `${euros(o.referencia.mediana)} en ${o.referencia.descripcion ?? 'ofertas parecidas'}${o.referencia.n ? ` (con ${o.referencia.n} ofertas)` : ''}`],
      ['Por qué es chollazo', o.chollazo && o.chollazoMotivo],
      ['Bajada', textoBajada(o)],
      ['Mínimo', textoMinimo(o, ctx)?.detalle],
      // Sin desglose (datos antiguos), la nota con lo que mide; con él, va en «Por qué tiene un N».
      ['Valor de la oferta', !motivosNota(o).length && `${o.puntuacion} / 100 · ${nivelNota(o)}. ${QUE_MIDE_LA_NOTA}`],
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
function resumenFicha(o) {
  const v = o.valoracion;
  const minutos = duracionActividad(o);
  const datos = [
    textoAlojamiento(o) && ['cama', textoAlojamiento(o)],
    v?.nota >= 0 && ['estrella', `${nota(v.nota)}/10 ${adjetivoNota(v.nota)}${v.n ? ` · ${contar(v.n, 'opinión', 'opiniones')}` : ''}`],
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
    <h2 id="ficha-titulo">${esc(tituloLegible(o.titulo))}</h2>
    <p class="tarjeta__lugar">${textoLugar(o)}</p>
    ${resumenFicha(o)}
  </header>
  <div class="ficha__media">${escena(tipoEscena(o))}${imagen ? `<img class="ficha__imagen" src="${esc(imagen)}" alt="" referrerpolicy="no-referrer">` : ''}${creditoFoto(o)}</div>
  <div class="insignias">${insignias(o, ctx)}</div>
  ${vueloFicha(o.vuelo)}
  ${o.resumen ? `<p class="ficha__resumen-ia"><strong>En una frase:</strong> ${esc(o.resumen)} <span class="suave">(resumen automático del texto de la web)</span></p>` : ''}
  ${descripcionFicha(o)}
  ${notaFicha(o, ctx)}
  ${opinionesFicha(o, ctx)}
  ${cocheFicha(o, ctx)}
  ${tiempo(o, ctx)}
  ${eventosDe(o, ctx).length ? `<section class="ficha__eventos"><h3>${icono('tema-eventos')}${busquedaPara(o, ctx) ? `Qué hay por la zona esos días (${esc(busquedaPara(o, ctx).etiqueta)})` : conFechasDeViaje(o) ? 'Qué hay esos días por la zona' : 'Qué hay el próximo finde por la zona (si vas entonces)'}</h3>${eventos(o, { conEnlace: true }, ctx)}</section>` : ''}
  ${queHacerAlli(ctx)}
  ${datosFicha(o, ctx)}
</div>
<aside class="ficha__lateral" aria-label="Precio y reserva">
  <div class="ficha__precio">${precio(o, { etiqueta: typeof o.precio === 'number' && o.precio > 0 ? `Precio en ${ctx.fuentes?.get(o.fuente) ?? o.fuente}` : null })}<span class="acciones">${botonDescartar(o)}${botonComparar(o, ctx)}${botonFavorito(o, ctx)}</span></div>
  ${textoComprobada(o, ctx)}
  <h3 class="sr">Reservar</h3>
  <ul class="ficha__enlaces">${enlaces[0] ?? ''}</ul>
  ${notaFechasOferta(o, ctx)}
  ${comparadorFicha(o, ctx)}
  ${enlaces.length > 1 ? `<details class="ficha__mas-enlaces">
    <summary><h3 id="ficha-enlaces-titulo">${icono('enlace')}Organiza el viaje <span class="suave">(hotel, actividades, cómo llegar${busquedaPara(o, ctx) ? ` · ${esc(busquedaPara(o, ctx).etiqueta)}` : ''})</span></h3></summary>
    <ul class="ficha__enlaces ficha__enlaces--resto">${enlaces.slice(1).join('')}</ul>
  </details>` : ''}
  ${avisoPagoFicha(o, ctx)}
  ${costeFicha(o, ctx)}
  <section class="ficha__historial" aria-labelledby="ficha-historial-titulo">
    <h3 id="ficha-historial-titulo">${icono('bajada')}Historial de precios${o.historialPorNoche ? ' <span class="suave">(por noche)</span>' : ''}</h3>
    ${serie.length >= 2
    ? `<div class="ficha__grafica"><canvas id="ficha-grafica" role="img" aria-label="Evolución del precio en ${serie.length} días"></canvas></div>
       <p class="leyenda-grafica" aria-hidden="true"><span class="leyenda-grafica__linea"></span>Precio <span class="leyenda-grafica__punto"></span>El más bajo <span class="leyenda-grafica__discontinua"></span>Típico (mediana)</p>
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
  // Como en las tarjetas: primero el precio de la oferta; el viaje completo, debajo y en pequeño.
  const c = costeDe(o, ctx);
  const oferta = typeof o.precio !== 'number' ? ''
    : o.precio === 0 ? '<strong>Gratis</strong>'
      : `${esPrecioDesde(o) ? '<span class="suave">desde</span> ' : ''}<strong>${euros(o.precio)}</strong>${ETIQUETAS_UNIDAD[o.unidad] ? ` <span class="suave">${ETIQUETAS_UNIDAD[o.unidad]}</span>` : ''}`;
  const viaje = c.total != null && o.precio > 0
    ? `<span class="ficha__reserva-viaje suave">Viaje completo ${c.estimado ? '≈ ' : ''}${euros(Math.round(c.total))} (${contar(c.viajeros, 'persona')})</span>`
    : '';
  const cifra = `${oferta}${viaje}`;
  return `<div class="ficha__reserva"><p class="ficha__reserva-precio">${cifra}</p>${boton}</div>`;
}

