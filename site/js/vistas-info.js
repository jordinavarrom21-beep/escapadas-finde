/** Vistas de información y de lo tuyo: calendario, puentes, avisos por email, fuentes, ayuda y «Mis cosas». */

import { diasEntre, etiquetaDia, etiquetaRango, nombreFinde } from './fechas.js';
import { contar, enumerar, escaparHtml as esc, euros, haceCuanto, urlSegura } from './formato.js';
import {
  buscarActividades, buscarEscapadas, buscarTexto, chollosDeVuelos, crearHash, describirCriterio, filtrarVuelos,
  filtrosActivos, leerFiltrosActividades, leerFiltrosComunes, leerFiltrosEscapadas, leerFiltrosVuelos,
  resumenCalendario, resumenFuentes, resumenPuentes, tieneVuelo, leerRuta, urlEditarVigilados,
} from './filtros.js';
import { QUE_MIDE_LA_NOTA, estadoVacio, filaOferta, insigniaEstado, rejilla } from './plantillas.js';
import { icono } from './iconos.js';
import {
  conIcono, contextoBusqueda, ctxTarjetas, mostradas, motivoFuente, ocultas, pestanas, seccion,
} from './vistas-comun.js';

// ── Calendario ───────────────────────────────────────────────────────────────

export function vistaCalendario(e) {
  // Los mismos findes que el resto de la web (el domingo, el en curso ya no). Antes eran 12
  // calculados aparte: los dos o tres últimos no los conocía ninguna lista y abrían «0 escapadas».
  const findes = e.findes;
  // Sin ninguna fuente de vuelos con fecha, cada finde lleva a sus escapadas y no dice «sin vuelos» doce veces.
  const hayVuelos = e.datos.ofertas.some(tieneVuelo);
  // Cada cifra, la de la lista que abre su botón.
  const resumen = resumenCalendario(e.datos.ofertas, findes, e.datos.puentes, contextoBusqueda(e));
  // Mapa de calor: con vuelos, más intenso cuanto más barato el mejor vuelo del finde; sin
  // ellos, cuantas más escapadas. El número va siempre escrito (el color solo ayuda a ver).
  const niveles = nivelesCalendario(resumen, hayVuelos);
  const celdas = resumen.map(({ finde, puente, vuelo, vuelos, escapadas, conFecha }, i) => {
    const cuando = i === 0 ? nombreFinde(e.hoy) : i === 1 ? 'El siguiente' : `En ${i} semanas`;
    // Cada finde, dos caminos claros: sus escapadas y (si hay vuelos con fecha) sus vuelos.
    // Antes la celda entera llevaba a uno solo aunque enseñara los datos de los dos.
    const verEscapadas = `<a class="boton boton--suave boton--mini finde-celda__accion" href="${crearHash('escapadas', { cuando: finde.id })}">${icono('escapadas')}${conFecha
      ? `<span>${contar(conFecha, 'escapada')} con fecha <small class="suave">+ ${escapadas - conFecha} flexibles</small></span>`
      : `<span>Ver ${contar(escapadas, 'escapada')} flexibles</span>`}</a>`;
    const verVuelos = !hayVuelos ? ''
      : vuelo
        ? `<a class="boton boton--suave boton--mini finde-celda__accion" href="${crearHash('vuelos', { finde: finde.id })}">${icono('vuelos')}Ver ${contar(vuelos, 'vuelo')} · desde ${euros(vuelo.precio)}</a>`
        : `<span class="finde-celda__dato suave">${icono('vuelos')}Sin vuelos con fecha</span>`;
    return `<li><div class="finde-celda${puente ? ' finde-celda--puente' : ''}${niveles[i] ? ` finde-celda--nivel-${niveles[i]}` : ''}">
  <span class="finde-celda__cuando">${cuando}</span>
  <span class="finde-celda__fecha">${esc(finde.etiqueta)}</span>
  ${puente ? `<span class="insignia insignia--puente">${icono('puentes')}${esc(puente.nombre)}</span>` : ''}
  <span class="finde-celda__acciones">${verEscapadas}${verVuelos}</span>
</div></li>`;
  });
  return `${pestanas('fechas', 'calendario')}<h1 class="titulo-vista" tabindex="-1">Calendario</h1>
<p class="seccion__intro">${hayVuelos
    ? `Los próximos ${findes.length} findes con las escapadas que tienen fecha ese finde (las flexibles valen para todos) y el vuelo más barato. Los puentes van resaltados.`
    : `Los próximos ${findes.length} findes con las escapadas que tienen fecha ese finde (las flexibles valen para todos). Los puentes van resaltados.`}</p>
${leyendaCalendario(hayVuelos)}
<ol class="calendario">${celdas.join('')}</ol>`;
}

/**
 * Nivel 1–4 de cada finde para el mapa de calor (4 = el mejor: el vuelo más barato o más
 * escapadas), por cuartiles de los findes que tienen dato; 0 si no tiene.
 */
export function nivelesCalendario(resumen, hayVuelos) {
  const valor = (r) => (hayVuelos ? r.vuelo?.precio ?? null : r.conFecha || null);
  const valores = resumen.map(valor).filter((v) => v != null).sort((a, b) => a - b);
  if (valores.length < 2) return resumen.map(() => 0);
  return resumen.map((r) => {
    const v = valor(r);
    if (v == null) return 0;
    const posicion = valores.filter((x) => x < v).length / (valores.length - 1);
    const cuartil = Math.min(3, Math.floor(posicion * 4));
    return hayVuelos ? 4 - cuartil : cuartil + 1;
  });
}

function leyendaCalendario(hayVuelos) {
  const [menos, mas] = hayVuelos ? ['Vuelo más caro', 'Más barato'] : ['Menos escapadas', 'Más'];
  return `<p class="leyenda-calor" aria-hidden="true"><span>${menos}</span>${[1, 2, 3, 4].map((n) => `<i class="leyenda-calor__paso finde-celda--nivel-${n}"></i>`).join('')}<span>${mas}</span></p>`;
}

// ── Puentes ──────────────────────────────────────────────────────────────────

/** «pide el vie 25 sep» o «no hay que pedir ningún día». */
function textoPedir(pedir) {
  if (!pedir.length) return 'No hay que pedir ningún día: caen todos en festivo o fin de semana.';
  return `Pide ${pedir.length === 1 ? 'el día' : 'los días'} ${pedir.map(etiquetaDia).join(' y ')} y tendrás el puente entero.`;
}

/** Nota «Buena» o mejor (plantillas.js → nivelNota). */
const buenaOferta = (o) => o.chollazo || (o.puntuacion ?? 0) >= 40;

export function vistaPuentes(e) {
  const resumen = resumenPuentes(e.datos.ofertas, e.datos.puentes, e.hoy, { descartadas: ocultas(e) });
  if (!resumen.length) {
    return `${pestanas('fechas', 'puentes')}<h1 class="titulo-vista" tabindex="-1">Puentes</h1>
${estadoVacio('No hay ningún puente a la vista', 'Se miran los próximos cuatro meses con los festivos de tu comunidad y los locales que tengas en los ajustes.')}`;
  }
  const ctx = ctxTarjetas(e);
  const bloques = resumen.map(({ puente, dias, pedir, festivos, vuelos, escapadas }) => {
    const faltan = diasEntre(e.hoy, puente.desde);
    const cuando = faltan <= 0 ? 'ya ha empezado' : faltan === 1 ? 'empieza mañana' : `empieza en ${faltan} días`;
    // Solo las que merecen la pena (nota «Buena» o más): un vuelo «normal» no es una idea para el puente.
    const buenos = vuelos.filter(buenaOferta);
    const lista = [...buenos.slice(0, 3), ...escapadas.filter(buenaOferta).slice(0, 6 - Math.min(buenos.length, 3))];
    const dia = (d) => {
      const festivo = festivos.find((f) => f.fecha === d);
      const clase = festivo ? ' dia--festivo' : pedir.includes(d) ? ' dia--pedir' : '';
      const nota = festivo ? festivo.nombre : pedir.includes(d) ? 'Hay que pedirlo' : 'Fin de semana';
      return `<li class="dia${clase}" title="${esc(nota)}"><span class="dia__fecha">${esc(etiquetaDia(d))}</span><span class="dia__nota">${esc(nota)}</span></li>`;
    };
    return `<section class="puente">
  <div class="seccion__cabeza"><h2>${conIcono('puentes', esc(puente.nombre))}</h2><span class="contador">${esc(puente.etiqueta ?? etiquetaRango(puente.desde, puente.hasta))} · ${cuando}</span></div>
  <p class="seccion__intro">${contar(dias.length, 'día')} libres seguidos. ${esc(textoPedir(pedir))}</p>
  <ol class="dias">${dias.map(dia).join('')}</ol>
  <p class="enlaces-linea">${vuelos.length ? `<a class="chip chip--atajo" href="${crearHash('vuelos', { finde: puente.id })}">${icono('vuelos')}${contar(vuelos.length, 'vuelo')}</a> ` : ''}<a class="chip chip--atajo" href="${crearHash('escapadas', { cuando: puente.id })}">${icono('escapadas')}${contar(escapadas.length, 'escapada')}</a></p>
  ${lista.length ? rejilla(lista, ctx, { mostradas: 6, clave: `puente-${puente.id}` }) : estadoVacio(vuelos.length || escapadas.length ? 'Aún no hay ofertas destacables para este puente.' : 'Aún no hay ofertas para este puente.', vuelos.length || escapadas.length ? 'Arriba tienes todas las que hay.' : '')}
</section>`;
  });
  return `${pestanas('fechas', 'puentes')}<h1 class="titulo-vista" tabindex="-1">Puentes</h1>
<p class="seccion__intro">Los próximos puentes con sus días libres, el día que hay que pedir en el trabajo y sus mejores ofertas.</p>
<div class="carruseles">${bloques.join('')}</div>`;
}

// ── Vigilados ────────────────────────────────────────────────────────────────

const EJEMPLO_VIGILADOS = `{
  "vigilados": [
    { "nombre": "Oporto en avión", "texto": "oporto", "tipo": "vuelo", "precioMax": 60 },
    { "nombre": "Spa a menos de 2 h", "tema": "spa", "cocheMaxMin": 120, "precioMax": 70 },
    { "nombre": "Puentes cerca de casa", "cerca": { "lat": 41.39, "lon": 2.17, "radioKm": 300 }, "puente": true }
  ]
}`;

/**
 * Si los vigilados avisan de verdad: lo publica el escaneo (ofertas.json → avisos). Sin
 * email configurado se dice, en vez de dar a entender que llegará algo.
 */
function estadoAvisos(e) {
  const email = e.datos.avisos?.email;
  if (email === true) {
    return `<p class="seccion__intro estado-avisos">${icono('check')}<span><strong>Avisos por email activos.</strong> Cuando una oferta cumple un criterio y su precio baja respecto al último aviso, llega un email en la siguiente revisión (varias veces al día), y los viernes, un resumen con todos.</span></p>`;
  }
  if (email === false) {
    return `<p class="aviso-memoria" role="status">${icono('alerta')}<strong>Los avisos por email no están configurados</strong>: faltan los secretos del correo en el repositorio (LEEME, «Emails»). Los criterios se comprueban igual y aquí ves lo que cumplen, pero no te llegará ningún aviso.</p>`;
  }
  return '<p class="seccion__intro">Se sabrá si los avisos por email están activos tras la próxima revisión.</p>';
}

export function vistaVigilados(e) {
  // Los avisos por email son de quien administra la web (se configuran en GitHub): a cualquier
  // otro visitante no se le enseñan sus criterios ni cómo está montado el correo.
  if (!e.propietario) {
    return `${pestanas('mis', 'vigilados', e)}<h1 class="titulo-vista" tabindex="-1">Avisos</h1>
${estadoVacio('Esta web no envía emails', 'Para enterarte de lo nuevo, guarda una búsqueda: al volver, Guardados te dice cuántas ofertas nuevas la cumplen.', `<p><a class="boton boton--primario" href="#/mis?ver=busquedas">Ver mis búsquedas guardadas${icono('flecha')}</a></p>`)}`;
  }
  const criterios = e.vigilados.map((c) => {
    const coincidencias = (c.coincidencias ?? []).map((id) => e.porId.get(id)).filter(Boolean);
    const condiciones = describirCriterio(c, { temas: e.datos.temas, origen: e.datos.origen });
    return `<section class="vigilado">
  <div class="seccion__cabeza"><h2>${esc(c.nombre)}</h2><span class="contador">${contar(coincidencias.length, 'coincidencia')}</span></div>
  <ul class="condiciones">${condiciones.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>Sin condiciones</li>'}</ul>
  ${coincidencias.length ? `<ul class="filas">${coincidencias.map(filaOferta).join('')}</ul>` : '<p class="suave">Ahora mismo ninguna oferta cumple este criterio.</p>'}
</section>`;
  });
  const url = urlEditarVigilados(e.ubicacion);
  const enlace = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">config/vigilados.json en GitHub</a>`
    : '<code>config/vigilados.json</code> en tu repositorio de GitHub';
  return `${pestanas('mis', 'vigilados', e)}<h1 class="titulo-vista" tabindex="-1">Avisos por email</h1>
${estadoAvisos(e)}
${criterios.join('') || (e.vigiladosPrivados
    ? estadoVacio('Tus criterios no se publican', `Por privacidad, la web pública no lleva tu lista de avisos: está en ${enlace}, y los emails te llegan igual.`)
    : estadoVacio('Aún no vigilas nada', 'Añade criterios como se explica abajo.'))}
<section class="ayuda-caja">
  <h2>Cómo añadir o cambiar vigilados</h2>
  <ol>
    <li>Monta la búsqueda en <a href="#/escapadas">Escapadas</a> o <a href="#/vuelos">Vuelos</a> y pulsa «Copiar como vigilado».</li>
    <li>Abre ${enlace} y pulsa el lápiz para editarlo.</li>
    <li>Pega el criterio dentro de la lista <code>"vigilados"</code>. Solo <code>nombre</code> es obligatorio; una oferta coincide si cumple <strong>todos</strong> los demás campos que pongas.</li>
    <li>Guarda con «Commit changes». Se aplicará en la próxima revisión.</li>
  </ol>
  <p>Para <strong>pausar</strong> un vigilado sin borrarlo, ponle <code>"activo": false</code>; para dejar de recibir cualquier email, borra el secreto <code>EMAIL_TO</code> del repositorio.</p>
  <p>Campos: <code>texto</code>, <code>tipo</code> (vuelo, escapada, hotel, paquete), <code>desde</code> y <code>hasta</code> (fechas), <code>presupuestoMax</code> con <code>presupuestoPor</code> («total» o «persona») y <code>viajeros</code>, <code>tema</code> (${e.datos.temas.map((t) => `<code>${esc(t.id)}</code>`).join(', ')}), <code>fuente</code>, <code>aeropuerto</code>, <code>precioMax</code>, <code>cocheMaxMin</code>, <code>cerca</code> (<code>lat</code>, <code>lon</code>, <code>radioKm</code>) y <code>puente</code>.</p>
  <pre><code>${esc(EJEMPLO_VIGILADOS)}</code></pre>
</section>`;
}

// ── Fuentes ──────────────────────────────────────────────────────────────────

/**
 * «Cómo funciona»: qué es la web, de dónde salen las ofertas, qué significa cada número y
 * qué se guarda de ti. Para cualquier visitante, sin tecnicismos.
 */
export function vistaAyuda(e) {
  const legal = e.datos.legal;
  const webs = (e.datos.fuentes ?? []).filter((f) => f.estado === 'ok').map((f) => f.nombre);
  const pregunta = (titulo, cuerpo) => `<details class="ayuda-pregunta"><summary>${titulo}</summary><div>${cuerpo}</div></details>`;
  const nota = QUE_MIDE_LA_NOTA.replace(/^Lo bueno que es como chollo: /, 'Cuenta ').replace(/\.$/, '');
  return `<h1 class="titulo-vista" tabindex="-1">Cómo funciona</h1>
<div class="ayuda-pagina">
<section class="seccion">
  <p class="ayuda-intro">Escapadas Finde busca por ti <strong>escapadas de fin de semana, hoteles, casas rurales, planes y chollos de vuelos</strong> en ${contar(webs.length, 'web', 'webs')} de viajes y te los enseña juntos, con lo que cuesta el viaje completo desde tu casa. Se revisa cada 15 minutos.</p>
  <ol class="ayuda-pasos">
    <li><strong>Elige cuándo</strong>: este finde, un puente o tus fechas.</li>
    <li><strong>Filtra lo que te apetece</strong>: spa, playa, con niños, sin coche, cerca de casa…</li>
    <li><strong>Reserva en la web de la oferta</strong> con el botón «Ver en…». Aquí no se vende nada: el precio y las condiciones los confirma esa web.</li>
  </ol>
  <p><a class="boton boton--primario" href="#/escapadas?cuando=finde">Ver las escapadas de este finde${icono('flecha')}</a></p>
</section>
<section class="seccion">
  <h2 class="subtitulo">Preguntas frecuentes</h2>
  ${pregunta('¿De dónde salen las ofertas?', `<p>De webs de viajes y comunidades de chollos públicas. Solo se leen las páginas que esas webs permiten leer. Cada oferta dice en qué web está publicada; si lleva días sin aparecer en ella, se avisa con «Puede haber terminado».</p>${e.propietario ? `<p>${esc(enumerar(webs))}. <a href="#/fuentes">Estado de cada web</a></p>` : ''}`)}
  ${pregunta('¿Qué es el «Valor» de cada oferta?', `<p>Un valor de 0 a 100 de lo buena que es la oferta como chollo (no es la opinión de los clientes, que va de 0 a 10). ${esc(nota)}. Un <strong>Chollazo</strong> está muy por debajo de lo normal para ofertas parecidas.</p>`)}
  ${pregunta('¿Qué significan las estrellas y las opiniones?', '<p>«★ 8,2 Muy bien · 266 opiniones» es la valoración de otros clientes en la web de la oferta, de 0 a 10. Las estrellas (4★) son la categoría del hotel.</p>')}
  ${pregunta('¿Por qué hay precios «por persona», «por noche» o «en total»?', '<p>Cada web publica el precio a su manera. Por eso cada oferta dice a qué corresponde y, cuando se puede, se pasa a <strong>por persona y noche</strong> para compararlas, y se calcula <strong>el viaje completo</strong> para tus viajeros, con la gasolina estimada si vas en coche.</p>')}
  ${pregunta('¿Las fechas son exactas?', '<p>Muchas ofertas son de <strong>fechas flexibles</strong>: valen cualquier día hasta que caducan, según disponibilidad. Las de <strong>fechas cerradas</strong> dicen el día exacto. Si buscas unas fechas, los buscadores (y algunas webs) se abren ya con ellas.</p>')}
  ${pregunta('¿Me avisa cuando salga algo que me interese?', '<p>En la web, sin email: monta tu búsqueda y pulsa «Guardar búsqueda». Cuando vuelvas, <a href="#/mis">Guardados</a> te dirá cuántas ofertas nuevas la cumplen (y el número del menú también).</p>')}
</section>
<section class="seccion" id="privacidad">
  <h2 class="subtitulo">Privacidad</h2>
  <ul class="ayuda-lista">
    ${privacidadCookies(e)}
    <li>Tus favoritos, búsquedas guardadas, ciudad de salida y preferencias se guardan <strong>solo en este navegador</strong>. No se envían a ningún sitio; se borran borrando los datos del sitio en tu navegador.</li>
    <li>«Mi ubicación» solo se usa si lo pulsas, para medir distancias en tu dispositivo.</li>
    <li>Al buscar un pueblo o ciudad, lo que escribes se consulta en <a href="https://photon.komoot.io" target="_blank" rel="noopener noreferrer">Photon</a>; el mapa carga sus imágenes de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>.</li>
    <li>Si eliges una salida distinta de la de serie, los kilómetros por carretera se calculan con <a href="https://project-osrm.org" target="_blank" rel="noopener noreferrer">OSRM</a>: se le envían las coordenadas de tu salida y de los destinos (nada más). El mapa y la gráfica de precios cargan sus librerías desde <a href="https://cdnjs.com" target="_blank" rel="noopener noreferrer">cdnjs</a>.</li>
    <li>Al pulsar «Ver en…» vas a la web de la oferta, con su propia política de privacidad.</li>
    ${legal ? `<li>Responsable: ${esc(legal.titular)}. Para cualquier duda o para ejercer tus derechos (acceso, rectificación, supresión…): <a href="mailto:${esc(legal.email)}">${esc(legal.email)}</a>. También puedes reclamar ante la <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">AEPD</a>.</li>` : ''}
  </ul>
</section>
${seccionAvisoLegal(e)}
</div>`;
}

/**
 * Las cookies, según lo que haya configurado (ver site/js/anuncios.js): sin Google Analytics,
 * Google Ads ni Drive, ninguna; con ellos, qué hace cada uno, que solo van si se aceptan (cada
 * uno por separado) y cómo cambiarlo.
 */
function privacidadCookies(e) {
  if (!e.googleAnalytics && !e.googleAds && !e.drive) return '<li><strong>Sin cuentas, sin cookies, sin publicidad y sin seguimiento.</strong></li>';
  const items = [];
  if (e.googleAnalytics) items.push(`<strong>Cookies de medición de Google Analytics, solo si las aceptas</strong> en el aviso: cuentan las visitas a cada sección de la web, a qué web vas desde una oferta y datos generales del navegador, el dispositivo y la zona (no la dirección IP), para saber qué se usa y mejorarlo. No se envía lo que buscas ni los filtros que eliges. Los trata Google por cuenta nuestra y pueden llegar a EE. UU. (Marco de Privacidad de Datos UE-EE. UU.). Si las rechazas no se carga Google Analytics y la web funciona igual.`);
  if (e.googleAds) items.push(`<strong>Cookies de Google Ads, solo si las aceptas</strong> en el aviso: sirven para saber si quien llega por un anuncio nuestro entra en alguna oferta. Si las rechazas no se carga Google Ads y la web funciona igual.`);
  if (e.drive) items.push(`<strong>Cookies de afiliación de Travelpayouts, solo si las aceptas</strong> en el aviso: si reservas en una web de su red (Booking.com, Trip.com, Omio…) después de pasar por aquí, esa web nos paga una comisión; tu precio no cambia. Para eso su código, que se carga desde sus servidores, convierte los enlaces a esas webs en enlaces de afiliado, guarda una cookie de sesión y recibe la dirección y el texto de la página que ves. Si las rechazas no se carga nada de Travelpayouts y la web funciona igual.`);
  // Con más de una, «Configurar» en el aviso deja aceptar cada una por separado.
  const cambiar = items.length > 1 ? ' <a href="#" data-abrir-cookies>Cambiar tu elección o elegir cuáles</a>' : ' <a href="#" data-abrir-cookies>Cambiar tu elección</a>';
  return ['<li><strong>Sin cuentas y sin publicidad en la web.</strong></li>', ...items.map((texto, i) => `<li>${texto}${i === items.length - 1 ? cambiar : ''}</li>`)].join('\n    ');
}

/**
 * Aviso legal (LSSI, art. 10): quién está detrás, a qué se dedica la web y de qué responde.
 * Los datos salen de config/ajustes.json → «legal»; sin ellos no se enseña la identidad de
 * nadie (y quien administra la web ve qué falta).
 */
function seccionAvisoLegal(e) {
  const legal = e.datos.legal;
  const datos = legal
    ? `<ul class="ayuda-lista">
    <li>Titular: <strong>${esc(legal.titular)}</strong>${legal.nif ? ` · NIF ${esc(legal.nif)}` : ''}</li>
    ${legal.domicilio ? `<li>Domicilio: ${esc(legal.domicilio)}</li>` : ''}
    <li>Contacto: <a href="mailto:${esc(legal.email)}">${esc(legal.email)}</a></li>
  </ul>`
    : e.propietario ? '<p class="aviso-suave">Faltan tus datos: rellena «legal» (titular, NIF, domicilio y email) en <code>config/ajustes.json</code>. Una web con enlaces de afiliado o anuncios tiene que decir quién está detrás.</p>' : '';
  return `<section class="seccion" id="aviso-legal">
  <h2 class="subtitulo">Aviso legal</h2>
  ${datos}
  <p>Escapadas Finde es un buscador de ofertas de viaje publicadas por otras webs. No vende viajes ni hace reservas: el precio, la disponibilidad y las condiciones los fija y los confirma siempre la web de cada oferta. Algunos enlaces son de afiliado y, si reservas por ellos, esa web puede pagarnos una comisión; no cambia tu precio ni el orden de las ofertas.</p>
  <p>Las ofertas, fotos y marcas son de sus webs y dueños. Se revisan cada 15 minutos, pero pueden cambiar o terminar antes: comprueba siempre la oferta antes de reservar.</p>
</section>`;
}

export function vistaFuentes(e) {
  // Qué webs se leen y cómo están es cosa de quien administra la web.
  if (!e.propietario) {
    return `<h1 class="titulo-vista" tabindex="-1">Ofertas</h1>
${estadoVacio('Esta página no está disponible', 'Las ofertas se revisan cada 15 minutos.', `<p><a class="boton boton--primario" href="#/escapadas">Ver las escapadas${icono('flecha')}</a></p>`)}`;
  }
  const r = resumenFuentes(e.datos.fuentes);
  const filas = e.datos.fuentes.map((f) => {
    const web = urlSegura(f.web);
    const detalle = motivoFuente(f);
    return `<tr>
  <th scope="row">${esc(f.nombre)}<span class="suave tabla__modo">${esc(f.modo ?? '')}</span></th>
  <td data-etiqueta="Estado">${insigniaEstado(f.aviso ? 'aviso' : f.estado)}</td>
  <td data-etiqueta="Detalle"${detalle ? '' : ' class="tabla__vacia"'}>${detalle ? esc(detalle) : '<span class="suave">—</span>'}</td>
  <td data-etiqueta="Actualizada">${f.ultimoOk ? `<time datetime="${esc(f.ultimoOk)}" title="${esc(new Date(f.ultimoOk).toLocaleString('es-ES'))}">${esc(haceCuanto(f.ultimoOk, e.ahora))}</time>` : '<span class="suave">Nunca</span>'}</td>
  <td data-etiqueta="Ofertas" class="num">${(f.total ?? 0).toLocaleString('es-ES')}</td>
  <td data-etiqueta="Web">${web ? `<a href="${esc(web)}" target="_blank" rel="noopener noreferrer">${esc(new URL(web).hostname.replace(/^www\./, ''))}</a>` : ''}</td>
</tr>`;
  });
  return `<h1 class="titulo-vista" tabindex="-1">Fuentes</h1>
<p class="seccion__intro">${r.ok} de ${contar(r.activas, 'fuente activa', 'fuentes activas')} funcionan${r.conError ? ` y ${r.conError} con errores` : ''}${r.conAviso ? ` (${r.conAviso} para revisar: leen mucho menos de lo normal)` : ''}. ${r.inactivas ? `${contar(r.inactivas, 'fuente')} ${r.inactivas === 1 ? 'está desactivada o bloqueada' : 'están desactivadas o bloqueadas'} a propósito.` : ''} Datos generados ${esc(haceCuanto(e.datos.generado, e.ahora))}.</p>
<div class="tabla-envoltorio"><table class="tabla-fuentes">
  <caption class="sr">Estado de cada fuente de ofertas</caption>
  <thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Detalle</th><th scope="col">Actualizada</th><th scope="col" class="num">Ofertas</th><th scope="col">Web</th></tr></thead>
  <tbody>${filas.join('')}</tbody>
</table></div>`;
}

// ── Mis cosas ────────────────────────────────────────────────────────────────

/** Las ofertas que cumple ahora una búsqueda guardada (su hash), con los filtros de su vista. */
export function resultadosDeBusqueda(e, busqueda) {
  const { vista, params } = leerRuta(busqueda.hash);
  const ctx = contextoBusqueda(e);
  if (vista === 'actividades') return buscarActividades(e.datos.ofertas, leerFiltrosActividades(params), ctx);
  if (vista === 'vuelos') {
    const f = leerFiltrosVuelos(params);
    return [...filtrarVuelos(e.datos.ofertas, f, ctx), ...chollosDeVuelos(e.datos.ofertas, f, ctx)];
  }
  if (vista === 'buscar') return buscarTexto(e.datos.ofertas, leerFiltrosComunes(params), ctx);
  return buscarEscapadas(e.datos.ofertas, leerFiltrosEscapadas(params), ctx).ofertas;
}

/**
 * Cada búsqueda guardada con lo que cumple ahora y las que han aparecido desde que la
 * miraste por última vez (`visto`). Es el aviso de la web: sin email ni GitHub.
 */
export function avisosDeBusquedas(e) {
  return (e.busquedas ?? []).map((busqueda) => {
    const lista = resultadosDeBusqueda(e, busqueda);
    const desde = Date.parse(busqueda.visto ?? '');
    const nuevas = Number.isFinite(desde) ? lista.filter((o) => Date.parse(o.vistaPrimera) > desde) : [];
    return { busqueda, lista, nuevas };
  });
}

/** Cuántas ofertas nuevas cumplen tus búsquedas guardadas (el número del menú «Mis cosas»). */
export const totalNovedadesGuardadas = (e) => avisosDeBusquedas(e).reduce((suma, a) => suma + a.nuevas.length, 0);

function bloqueAvisos(e) {
  const avisos = avisosDeBusquedas(e);
  if (!avisos.length) {
    return estadoVacio('Aún no has guardado ninguna búsqueda',
      'En Explorar, pon los filtros que quieras y pulsa «Guardar búsqueda». Cuando vuelvas, aquí verás cuántas ofertas nuevas la cumplen.',
      '<a class="boton boton--primario" href="#/escapadas">Ir a Explorar</a>');
  }
  const contexto = { temas: e.temas, fuentes: e.fuentes, findes: e.findes, puentes: e.datos.puentes, hoy: e.hoy };
  return `<div class="avisos">${avisos.map(({ busqueda, lista, nuevas }) => {
    const { vista, params } = leerRuta(busqueda.hash);
    const filtros = filtrosActivos(vista, params, contexto).map((c) => c.texto);
    const visto = busqueda.visto ? `desde que la miraste ${haceCuanto(busqueda.visto, e.ahora)}` : '';
    return `<article class="aviso-busqueda${nuevas.length ? ' aviso-busqueda--nuevas' : ''}">
  <div class="aviso-busqueda__cabeza">
    <h3>${esc(busqueda.nombre)}</h3>
    ${nuevas.length ? `<span class="insignia insignia--nueva">${icono('nuevo')}${contar(nuevas.length, 'nueva')}</span>` : ''}
  </div>
  <p class="suave">${esc(TITULOS_VISTA[vista] ?? vista)}${filtros.length ? ` · ${esc(filtros.join(' · '))}` : ''}</p>
  <p>${contar(lista.length, 'oferta')} la cumplen ahora${nuevas.length ? `; <strong>${contar(nuevas.length, 'es nueva', 'son nuevas')}</strong> ${esc(visto)}` : visto ? ` · nada nuevo ${esc(visto)}` : ''}.</p>
  ${nuevas.length ? `<ul class="filas">${nuevas.slice(0, 3).map(filaOferta).join('')}</ul>` : ''}
  <p class="acciones"><a class="boton boton--primario boton--mini" href="${esc(busqueda.hash)}" data-abrir-busqueda="${esc(busqueda.nombre)}">Ver ${nuevas.length ? 'las ofertas' : 'la búsqueda'}${icono('flecha')}</a>
    <button type="button" class="boton boton--suave boton--mini" data-borrar-busqueda="${esc(busqueda.nombre)}">${icono('cerrar')}Borrar</button></p>
</article>`;
  }).join('')}</div>`;
}

const TITULOS_VISTA = { escapadas: 'Escapadas', actividades: 'Planes', vuelos: 'Vuelos', mapa: 'Escapadas en el mapa', buscar: 'Búsqueda' };

export function vistaMis(e, params = {}) {
  const ctx = ctxTarjetas(e);
  const favoritos = e.datos.ofertas.filter((o) => e.favoritos.has(o.id));
  // Los que ya no se publican (terminaron o su web los quitó) no se pueden enseñar: se dice cuántos.
  const terminados = [...(e.favoritos ?? [])].filter((id) => !e.porId.has(id)).length;
  const marcadas = (estadoMio) => [...(e.misEstados ?? new Map())].filter(([, v]) => v === estadoMio).map(([id]) => e.porId.get(id)).filter(Boolean);
  const reservadas = marcadas('reservada');
  const noDisponibles = marcadas('no-disponible');
  const comparar = [...(e.comparar ?? [])].filter((id) => e.porId.has(id)).length;
  const email = e.datos.avisos?.email;
  const copia = seccion(conIcono('guardar', 'Copia de seguridad'), `<p>Todo esto se guarda solo en este navegador. Sin cuenta: descarga un archivo con tus favoritos, búsquedas, comparación y preferencias, y cárgalo en otro navegador o dispositivo (sustituye lo que haya allí).</p>
<p class="acciones"><button type="button" class="boton boton--suave boton--mini" data-exportar-guardados>${icono('externo')}Descargar mis guardados</button>
<label class="boton boton--suave boton--mini">${icono('deshacer')}Cargar una copia<input type="file" accept="application/json,.json" data-importar-guardados class="sr"></label></p>`);
  if (params.ver === 'busquedas') {
    return `${pestanas('mis', 'mis?ver=busquedas', e)}<h1 class="titulo-vista" tabindex="-1">Búsquedas guardadas</h1>
<p class="seccion__intro">Una búsqueda guardada son unos filtros con nombre. <strong>No te llega ningún aviso:</strong> cuando vuelvas, aquí verás cuántas ofertas nuevas la cumplen desde la última vez que la miraste.</p>
${bloqueAvisos(e)}
${e.propietario ? seccion(conIcono('vigilados', 'Avisos por email'), `<p>${email === true ? 'Activos: te llega un email cuando una oferta cumple uno de tus criterios y baja de precio.' : 'Para recibirlos por email hay que configurar el correo y los criterios en GitHub.'} <a class="boton boton--suave boton--mini" href="#/vigilados">Ver los avisos por email${icono('flecha')}</a></p>`) : ''}
${copia}`;
  }
  // Sin nada guardado todavía: qué se puede hacer, en tres pasos, antes que una lista vacía.
  const vacio = !favoritos.length && !e.busquedas?.length && !comparar;
  const pasos = vacio ? `<ol class="pasos-guardados">
  <li>${icono('corazon')}<span><strong>Guarda una oferta</strong> con el corazón de cualquier tarjeta.</span></li>
  <li>${icono('comparar')}<span><strong>Compara hasta tres</strong> con «Comparar» y míralas lado a lado.</span></li>
  <li>${icono('guardar')}<span><strong>Guarda una búsqueda</strong> en Explorar: al volver verás las ofertas nuevas que la cumplen.</span></li>
</ol><p><a class="boton boton--primario" href="#/escapadas">Ir a Explorar${icono('flecha')}</a></p>` : '';
  const busquedas = e.busquedas?.length ?? 0;
  return `${pestanas('mis', 'mis', e)}<h1 class="titulo-vista" tabindex="-1">Favoritos</h1>
<p class="seccion__intro">Las ofertas que has guardado con el corazón y las que has marcado.${busquedas ? ` Tus ${contar(busquedas, 'búsqueda guardada', 'búsquedas guardadas')} están en <a href="#/mis?ver=busquedas">Búsquedas guardadas</a>.` : ''}${comparar ? ` Tienes ${contar(comparar, 'oferta')} en <a href="#/comparar">Comparar</a>.` : ''}</p>
${pasos}
${terminados ? `<p class="aviso-suave">${icono('alerta')}${esc(contar(terminados, 'favorito'))} ya no ${terminados === 1 ? 'se publica' : 'se publican'}: la oferta terminó o su web la quitó.</p>` : ''}
${favoritos.length
    ? rejilla(favoritos, ctx, { mostradas: mostradas(e, 'favoritos'), clave: 'favoritos' })
    : vacio ? '' : estadoVacio('Aún no tienes favoritos', 'Pulsa el corazón de cualquier oferta para guardarla aquí.')}
${reservadas.length || noDisponibles.length ? seccion(conIcono('check', 'Marcadas por ti'), `${reservadas.length ? `<h3 class="subtitulo">Reservadas</h3><ul class="filas">${reservadas.map(filaOferta).join('')}</ul>` : ''}${noDisponibles.length ? `<h3 class="subtitulo">Ya no disponibles <span class="suave">(no salen en las listas)</span></h3><ul class="filas">${noDisponibles.map(filaOferta).join('')}</ul>` : ''}`) : ''}
${copia}`;
}

