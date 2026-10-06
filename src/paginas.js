/**
 * Páginas estáticas con URL legible (escapadas/spa/, vuelos/…) que el escaneo escribe en
 * site/ para los buscadores y para compartir: el panel vive en #/…, que un buscador no ve
 * como páginas distintas y que sin JavaScript solo dice «Cargando». Cada página se genera
 * solo si tiene ofertas suficientes, con datos propios (coste del viaje completo, tiempo de
 * viaje, fechas, cuándo se comprobó) y sin copiar las descripciones de los proveedores.
 * Las combinaciones de filtros siguen en #/… y no se indexan.
 *
 * También el bloque de la portada sin JavaScript (lo pone scripts/preparar-web.js en
 * index.html): un buscador que no ejecute el panel ve igualmente qué es la web, lo mejor de
 * ahora y todas las guías.
 */
import { costeDesdeOrigen } from './vigilados.js';
import { escaparHtml as esc, euros, normalizar, urlSegura } from '../site/js/formato.js';
import { etiquetaDia, fechaLocal } from './util/fechas.js';
import { textoGuia } from './textos-guias.js';

/** Menos de esto es una página casi vacía: no se publica (ni entra en el sitemap). */
export const MINIMO_OFERTAS = 5;
/** Carpetas de site/ que escribe este módulo (se vacían antes de cada escaneo). */
export const CARPETAS = ['escapadas', 'vuelos', 'actividades'];
const MAXIMO_POR_PAGINA = 24;
/** Guías por zona como mucho, las de más ofertas: más serían páginas casi vacías o repetidas. */
const MAXIMO_ZONAS = 16;
/** Ofertas que enseña la portada sin JavaScript. */
const DESTACADAS_PORTADA = 12;
const VIAJEROS = 2;
const NOMBRE_WEB = 'Escapadas Finde';
/** Cómo se agrupan las guías en los enlaces de la portada y del pie de cada guía. */
export const GRUPOS = [['general', 'Escapadas'], ['tema', 'Por temática y alojamiento'], ['zona', 'Por zona'], ['mas', 'Vuelos y planes']];
const SIN_COCHE = ['tren', 'bus', 'ferry', 'avion'];
const UNIDADES = {
  pp: 'por persona', 'pp/noche': 'por persona y noche', total: 'en total', 'i/v': 'ida y vuelta por persona',
  noche: 'por alojamiento y noche', trayecto: 'por persona y trayecto',
};

// Los billetes sueltos de tren, bus o ferry no son escapadas (lo mismo que esTransporte del panel).
const esTransporte = (o) => ['bus', 'tren', 'ferry'].includes(o.transporte) && !o.alojamiento && !o.noches && (o.unidad == null || o.unidad === 'trayecto');
const esEscapada = (o) => !['vuelo', 'actividad'].includes(o.tipo) && !o.etiquetas.includes('duplicada') && !esTransporte(o);
const conTotal = (o) => costeDesdeOrigen(o, VIAJEROS).total != null;
const porTotal = (a, b) => costeDesdeOrigen(a, VIAJEROS).total - costeDesdeOrigen(b, VIAJEROS).total;
const porPrecio = (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity);
/** Las que tienen coste del viaje completo primero (de menos a más) y después el resto por precio. */
function porTotalYPrecio(a, b) {
  const [ta, tb] = [costeDesdeOrigen(a, VIAJEROS).total, costeDesdeOrigen(b, VIAJEROS).total];
  if (ta != null && tb != null) return ta - tb;
  if (ta != null || tb != null) return ta != null ? -1 : 1;
  return porPrecio(a, b);
}
const saleDe = (o) => o.etiquetas.filter((e) => e.startsWith('sale-de:')).map((e) => e.slice(8));

/** «Islas Baleares» → «islas-baleares», «Cataluña» → «cataluna». */
export const slug = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Temáticas con guía propia: [carpeta, tema, nombre, qué es]. Las cuatro primeras ya tenían URL y no cambian. */
const TEMAS = [
  ['spa', 'spa', 'Escapadas con spa', 'Hoteles, balnearios y escapadas con spa o circuito de aguas'],
  ['con-ninos', 'familia', 'Escapadas con niños', 'Planes para ir en familia'],
  ['rurales', 'rural', 'Escapadas rurales', 'Casas rurales y planes de naturaleza'],
  ['romanticas', 'romantico', 'Escapadas románticas', 'Planes para dos'],
  ['playa', 'playa', 'Escapadas a la playa', 'Hoteles y apartamentos junto al mar'],
  ['gastronomicas', 'gastronomia', 'Escapadas gastronómicas y de vino', 'Enoturismo, catas y escapadas con la cena incluida'],
  ['con-perro', 'mascotas', 'Escapadas con perro', 'Alojamientos que admiten mascotas'],
  ['aventura-y-nieve', 'aventura', 'Escapadas de aventura y nieve', 'Esquí, deportes y planes de aventura'],
  ['ciudades', 'ciudad', 'Escapadas a ciudades', 'Ciudad, cultura y museos'],
  ['alojamientos-singulares', 'singular', 'Alojamientos singulares', 'Cabañas, glamping y otros alojamientos con algo especial'],
  ['parques-tematicos', 'parques', 'Escapadas a parques temáticos', 'Parques temáticos con el alojamiento'],
];
/** Por tipo de alojamiento: [carpeta, alojamiento, nombre, qué es]. */
const ALOJAMIENTOS = [
  ['casas-rurales', 'casa-rural', 'Casas rurales', 'Casas rurales enteras o por habitaciones'],
  ['campings', 'camping', 'Campings y glamping', 'Campings, bungalós y glamping'],
];

/** El primer puente que aún no ha terminado el día de los datos. */
function proximoPuente(puentes = [], generado) {
  const hoy = fechaLocal(new Date(generado));
  return [...puentes].filter((p) => p.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde))[0] ?? null;
}

/**
 * Guías por zona: las provincias, comunidades y países (fuera de España) con más escapadas.
 * Cada zona sale una vez aunque sea provincia y comunidad a la vez (Cantabria, Asturias…).
 */
function zonas(ofertas, { desde, coste, ocupadas }) {
  const cuentas = new Map();
  for (const o of ofertas.filter(esEscapada)) {
    const { provincia, comunidad, pais } = o.lugar ?? {};
    for (const [nombre, campo] of [[provincia, 'provincia'], [comunidad, 'comunidad'], [pais !== 'España' && pais, 'pais']]) {
      if (!nombre) continue;
      const clave = slug(nombre);
      if (!clave || ocupadas.has(clave)) continue;
      const zona = cuentas.get(clave) ?? { nombre, campo, n: 0 };
      if (zona.campo === campo) zona.n += 1;
      cuentas.set(clave, zona);
    }
  }
  return [...cuentas.entries()]
    .filter(([, z]) => z.n >= MINIMO_OFERTAS)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, MAXIMO_ZONAS)
    .map(([clave, { nombre, campo }]) => ({
      ruta: `escapadas/${clave}`, grupo: 'zona', enlace: `Escapadas en ${nombre}`,
      titulo: nombre === desde ? `Escapadas por la provincia de ${nombre}` : `Escapadas en ${nombre} desde ${desde}`,
      intro: `Hoteles, casas rurales y escapadas en ${nombre}, ordenados por ${coste}. Las que no permiten calcularlo van al final, por precio.`,
      elegir: (o) => esEscapada(o) && o.lugar?.[campo] === nombre && o.precio != null, orden: porTotalYPrecio,
      panel: `#/escapadas?${campo === 'pais' ? 'pais' : 'region'}=${encodeURIComponent(nombre)}&orden=total`,
    }));
}

/**
 * Qué páginas hay: ruta, textos, criterio (en palabras) y cómo se eligen y ordenan las
 * ofertas. `panel` es la misma búsqueda en el panel, con todos sus filtros; `enlace`, el
 * nombre corto para los enlaces y las migas; `grupo`, dónde va en los enlaces (GRUPOS).
 */
export function definiciones({ origen, findes = [], puentes = [], ofertas = [], generado = new Date().toISOString() }) {
  const desde = origen.nombre;
  const finde = findes[0];
  const puente = proximoPuente(puentes, generado);
  const coste = `el coste del viaje completo para ${VIAJEROS} personas desde ${desde}: la oferta y, si se va en coche, la gasolina estimada (sin peajes)`;
  const fijas = [
    {
      ruta: 'escapadas', grupo: 'general', enlace: 'Todas las escapadas',
      // Distinto del de la portada («Escapadas de fin de semana desde…»): si no, compiten por la misma búsqueda.
      titulo: `Todas las escapadas desde ${desde}, por precio`,
      intro: `Las escapadas más baratas que hemos encontrado, ordenadas por ${coste}.`,
      elegir: (o) => esEscapada(o) && conTotal(o), orden: porTotal, panel: '#/escapadas?orden=total',
    },
    {
      ruta: 'escapadas/menos-de-100-euros', grupo: 'general', enlace: 'Por menos de 100 € por persona',
      titulo: `Escapadas desde ${desde} por menos de 100 € por persona`,
      intro: `Viajes completos que salen por menos de 100 € por persona según ${coste}.`,
      elegir: (o) => esEscapada(o) && costeDesdeOrigen(o, VIAJEROS).porPersona <= 100, orden: porTotal,
      panel: '#/escapadas?orden=total&pres=100&prespor=persona',
    },
    {
      ruta: 'escapadas/este-finde', grupo: 'general', enlace: 'Para este finde',
      titulo: finde ? `Escapadas para este finde (${finde.etiqueta}) desde ${desde}` : '',
      intro: `Para el finde que viene: ofertas con esas fechas o de fechas flexibles que siguen vigentes. Ordenadas por ${coste}.`,
      elegir: (o) => Boolean(finde) && esEscapada(o) && conTotal(o) && (o.fechas.salida ? o.fechas.findeId === finde.id : !o.caduca || o.caduca.slice(0, 10) >= finde.viernes),
      orden: porTotal, panel: '#/escapadas?cuando=finde&orden=total',
    },
    {
      ruta: 'escapadas/puente', grupo: 'general', enlace: puente ? `Para el puente del ${puente.etiqueta}` : '',
      titulo: puente ? `Escapadas para el puente del ${puente.etiqueta} desde ${desde}` : '',
      intro: puente ? `Para el puente de ${puente.nombre} (${puente.etiqueta}): ofertas con esas fechas o de fechas flexibles que siguen vigentes. Ordenadas por ${coste}.` : '',
      elegir: (o) => Boolean(puente) && esEscapada(o) && conTotal(o) && (o.fechas.salida ? o.fechas.puenteId === puente.id : !o.caduca || o.caduca.slice(0, 10) >= puente.desde),
      orden: porTotal, panel: '#/escapadas?cuando=puente&orden=total',
    },
    ...[[1, 'a-menos-de-1-hora'], [2, 'a-menos-de-2-horas']].map(([horas, carpeta]) => ({
      ruta: `escapadas/${carpeta}`, grupo: 'general', enlace: `A menos de ${horas} ${horas === 1 ? 'hora' : 'horas'} en coche`,
      titulo: `Escapadas a menos de ${horas} ${horas === 1 ? 'hora' : 'horas'} de ${desde} en coche`,
      intro: `Planes a menos de ${horas} ${horas === 1 ? 'hora' : 'horas'} en coche desde ${desde} (tiempo real por carretera), ordenados por ${coste}.`,
      elegir: (o) => esEscapada(o) && !SIN_COCHE.includes(o.transporte) && o.cocheMin != null && o.cocheMin <= horas * 60 && conTotal(o),
      orden: porTotal, panel: `#/escapadas?h=${horas}&orden=total`,
    })),
    {
      ruta: 'escapadas/sin-coche', grupo: 'general', enlace: 'Sin coche', titulo: `Escapadas sin coche desde ${desde}`,
      intro: 'En tren, autobús, ferry o avión incluidos. El precio es el que publica cada web; el viaje completo, cuando se puede calcular.',
      elegir: (o) => esEscapada(o) && SIN_COCHE.includes(o.transporte) && o.precio != null, orden: porPrecio,
      panel: '#/escapadas?sincoche=1',
    },
    ...TEMAS.map(([carpeta, tema, nombre, que]) => ({
      ruta: `escapadas/${carpeta}`, grupo: 'tema', enlace: nombre, titulo: `${nombre} desde ${desde}`,
      intro: `${que}, ordenados por ${coste}.`,
      elegir: (o) => esEscapada(o) && o.temas.includes(tema) && conTotal(o), orden: porTotal,
      panel: `#/escapadas?temas=${tema}&orden=total`,
    })),
    ...ALOJAMIENTOS.map(([carpeta, alojamiento, nombre, que]) => ({
      ruta: `escapadas/${carpeta}`, grupo: 'tema', enlace: nombre, titulo: `${nombre} cerca de ${desde}`,
      intro: `${que}, ordenados por ${coste}. Las que no permiten calcularlo van al final, por precio.`,
      elegir: (o) => esEscapada(o) && o.alojamiento === alojamiento && o.precio != null, orden: porTotalYPrecio,
      panel: `#/escapadas?aloj=${alojamiento}&orden=total`,
    })),
    {
      ruta: 'vuelos', grupo: 'mas', enlace: 'Chollos de vuelos', titulo: `Chollos de vuelos desde ${desde}`,
      intro: `Billetes que publican blogs y comunidades y que salen de ${desde} (o de una zona que lo incluye), del más barato al más caro. No tienen fechas concretas: la disponibilidad se confirma en cada web.`,
      elegir: (o) => o.tipo === 'vuelo' && !o.vuelo && o.precio != null && !o.etiquetas.includes('promocion')
        && saleDe(o).some((c) => [desde, 'España', 'varias ciudades europeas'].includes(c)),
      orden: porPrecio, panel: '#/vuelos?mios=1&orden=precio',
    },
    {
      ruta: 'actividades/gratis', grupo: 'mas', enlace: 'Actividades gratis', titulo: `Actividades gratis cerca de ${desde}`,
      intro: 'Free tours y visitas sin coste de entrada (algunas con propina voluntaria).',
      elegir: (o) => o.tipo === 'actividad' && o.precio === 0, orden: (a, b) => (b.valoracion?.nota ?? 0) - (a.valoracion?.nota ?? 0),
      panel: '#/actividades?gratis=1',
    },
  ].filter((d) => d.titulo);
  // Las zonas no pueden quitarle la carpeta a una guía fija («escapadas/playa» es la temática).
  const ocupadas = new Set(fijas.map((d) => d.ruta.split('/').pop()));
  return [...fijas, ...zonas(ofertas, { desde, coste, ocupadas })];
}

function filaOferta(o, nombres) {
  const c = costeDesdeOrigen(o, VIAJEROS);
  const fechas = o.fechas.salida
    ? `${etiquetaDia(o.fechas.salida)}${o.fechas.vuelta ? ` – ${etiquetaDia(o.fechas.vuelta)}` : ''}`
    : 'Fechas flexibles';
  const lugar = [o.lugar?.nombre, o.lugar?.provincia ?? o.lugar?.region].filter(Boolean).join(', ');
  const llegar = SIN_COCHE.includes(o.transporte)
    ? `En ${{ tren: 'tren', bus: 'autobús', ferry: 'ferry', avion: 'avión' }[o.transporte]}`
    : o.cocheMin != null ? `${Math.floor(o.cocheMin / 60) ? `${Math.floor(o.cocheMin / 60)} h ` : ''}${o.cocheMin % 60} min en coche` : '';
  const salidas = saleDe(o);
  const precio = o.precio === 0 ? 'Gratis' : `${o.fechas.salida ? '' : 'desde '}${euros(o.precio)} ${UNIDADES[o.unidad] ?? ''}`.trim();
  // Solo http(s): un «javascript:» de una web de ofertas no llega nunca a un enlace (como en el panel).
  const url = urlSegura(o.urlReserva) ?? urlSegura(o.url);
  const rel = o.afiliado || o.patrocinada ? 'sponsored nofollow noopener' : 'nofollow noopener';
  return `<li class="fila-guia">
  <h3>${esc(o.titulo)}</h3>
  <p>${[lugar && `📍 ${esc(lugar)}`, esc(fechas), llegar && esc(llegar), salidas.length && `Sale de ${esc(salidas.join(', '))}`, o.valoracion?.nota >= 0 && `⭐ ${esc(String(o.valoracion.nota).replace('.', ','))}`].filter(Boolean).join(' · ')}</p>
  <p><strong>${esc(precio)}</strong>${c.total != null ? ` · viaje completo ${c.estimado ? '≈ ' : ''}${esc(euros(Math.round(c.total)))} para ${VIAJEROS} (${esc(euros(Math.round(c.porPersona)))} por persona)` : ''}</p>
  <p class="suave">Publicada en ${esc(nombres.get(o.fuente) ?? o.fuente)}${o.vistaUltima ? ` · comprobada el ${esc(etiquetaDia(o.vistaUltima))}` : ''}${o.patrocinada ? ' · Patrocinado' : ''}${url ? ` · <a href="${esc(url)}" rel="${rel}" target="_blank">Ver la oferta</a>` : ''}</p>
</li>`;
}

/**
 * Datos estructurados (schema.org) en JSON-LD. Un «<» dentro de un texto cerraría el
 * <script>: se escribe como \u003c, que en JSON es lo mismo.
 */
const jsonLd = (datos) => `<script type="application/ld+json">${JSON.stringify(datos).replace(/</g, '\\u003c')}</script>`;

/** La web y quien la hace, con su @id: las guías se enlazan a ellos. */
export function datosWeb(base) {
  return [
    { '@type': 'WebSite', '@id': `${base}#web`, url: base, name: NOMBRE_WEB, inLanguage: 'es-ES', publisher: { '@id': `${base}#organizacion` } },
    { '@type': 'Organization', '@id': `${base}#organizacion`, name: NOMBRE_WEB, url: base, logo: `${base}icono-512.png` },
  ];
}

/** Las migas de una guía: Inicio › Escapadas › Con spa (la de «escapadas» no se repite). */
function migas(d, todas) {
  const padre = d.ruta.includes('/') ? todas.find((o) => o.ruta === d.ruta.split('/')[0]) : null;
  return [{ nombre: 'Inicio', ruta: '' }, padre && { nombre: 'Escapadas', ruta: `${padre.ruta}/` }, { nombre: d.enlace ?? d.titulo, ruta: `${d.ruta}/` }].filter(Boolean);
}

/** Enlaces a las guías por grupo (GRUPOS), con `raiz` delante; la guía en la que se está, sin enlace. */
export function enlacesGuias(guias, raiz, actual = null) {
  return GRUPOS.map(([grupo, titulo]) => {
    const lista = guias.filter((g) => g.grupo === grupo);
    if (!lista.length) return '';
    const items = lista.map((g) => (g.ruta === actual
      ? `<li aria-current="page">${esc(g.enlace ?? g.titulo)}</li>`
      : `<li><a href="${esc(raiz + g.ruta)}/">${esc(g.enlace ?? g.titulo)}</a></li>`)).join('');
    return `<div class="guias__grupo"><h2>${esc(titulo)}</h2><ul>${items}</ul></div>`;
  }).join('');
}

/**
 * HTML completo de una página. `raiz` es el camino relativo hasta site/ («../» o «../../»);
 * `base`, la dirección pública (sin ella no hay canónica, imagen para compartir ni JSON-LD,
 * que necesitan direcciones absolutas); `todas`, las guías que se publican.
 */
export function htmlPagina(d, ofertas, { raiz, base = null, generado, total, todas = [d], nombres = new Map(), texto = null }) {
  const canonical = base ? `${base}${d.ruta}/` : null;
  const descripcion = `${d.titulo}: ${total} ofertas comparadas por el coste del viaje completo. Actualizado el ${etiquetaDia(generado)}.`;
  const lasMigas = migas(d, todas);
  const estructurados = base && jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      ...datosWeb(base),
      {
        '@type': 'CollectionPage', '@id': canonical, url: canonical, name: d.titulo, description: descripcion, inLanguage: 'es-ES',
        dateModified: generado, isPartOf: { '@id': `${base}#web` }, breadcrumb: { '@id': `${canonical}#migas` },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: ofertas.length,
          itemListElement: ofertas.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.titulo })),
        },
      },
      {
        '@type': 'BreadcrumbList', '@id': `${canonical}#migas`,
        itemListElement: lasMigas.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.nombre, item: `${base}${m.ruta}` })),
      },
      ...(texto?.preguntas.length ? [{
        '@type': 'FAQPage', '@id': `${canonical}#preguntas`,
        mainEntity: texto.preguntas.map(([pregunta, respuesta]) => ({ '@type': 'Question', name: pregunta, acceptedAnswer: { '@type': 'Answer', text: respuesta } })),
      }] : []),
    ],
  });
  const cabeza = [
    `<title>${esc(d.titulo)} · ${NOMBRE_WEB}</title>`,
    `<meta name="description" content="${esc(descripcion)}">`,
    '<meta name="robots" content="max-image-preview:large">',
    canonical && `<link rel="canonical" href="${esc(canonical)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${NOMBRE_WEB}">`,
    '<meta property="og:locale" content="es_ES">',
    canonical && `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:title" content="${esc(d.titulo)}">`,
    `<meta property="og:description" content="${esc(descripcion)}">`,
    base && `<meta property="og:image" content="${esc(base)}og.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#f4efe6">',
    `<link rel="icon" href="${raiz}icono.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="${raiz}apple-touch-icon.png">`,
    `<link rel="stylesheet" href="${raiz}css/estilos.css">`,
    estructurados,
  ].filter(Boolean).join('\n');
  const listaMigas = lasMigas.map((m, i) => (i === lasMigas.length - 1
    ? `<li aria-current="page">${esc(m.nombre)}</li>`
    : `<li><a href="${esc(raiz + m.ruta)}">${esc(m.nombre)}</a></li>`)).join('');
  const cuantas = ofertas.length === total ? `Las ${total} ofertas` : `Las ${ofertas.length} primeras de ${total}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'none'; object-src 'none'; base-uri 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
${cabeza}
</head>
<body>
<header class="cabecera"><div class="contenedor cabecera__fila"><a class="marca" href="${raiz}"><img src="${raiz}icono.svg" alt="" width="28" height="28"><span>${NOMBRE_WEB}</span></a></div></header>
<main class="contenedor guia">
<nav class="migas" aria-label="Estás en"><ol>${listaMigas}</ol></nav>
<h1>${esc(d.titulo)}</h1>
<p>${esc(d.intro)}</p>
<p class="suave">Criterios: ${esc(total)} ofertas cumplen; aquí van las ${esc(ofertas.length)} primeras. Datos del ${esc(etiquetaDia(generado))}; los precios son los que publica cada web y pueden haber cambiado. Confirma siempre en la web del proveedor.</p>
<p><a class="boton boton--primario" href="${esc(raiz + d.panel)}">Abrir en el panel (con mapa, filtros y comparación)</a></p>
<h2>${esc(cuantas)}</h2>
<ol class="lista-guia">${ofertas.map((o) => filaOferta(o, nombres)).join('')}</ol>
${bloqueTexto(d, texto)}</main>
<footer class="pie contenedor">
<nav class="guias" aria-label="Más guías">${enlacesGuias(todas, raiz, d.ruta)}</nav>
<p><a href="${raiz}">${NOMBRE_WEB}</a> reúne ofertas de más de 20 webs de viajes y las revisa cada 15 minutos. No vendemos nada: el precio y las condiciones los confirma la web de cada oferta. · <a href="${raiz}#/ayuda">Cómo funciona</a></p>
</footer>
</body>
</html>
`;
}

/**
 * El texto propio de la guía (src/textos-guias.js), debajo de la lista: título, párrafos,
 * consejos y preguntas frecuentes (las mismas que van como FAQPage en el JSON-LD).
 */
function bloqueTexto(d, texto) {
  if (!texto) return '';
  const consejos = texto.consejos.length ? `\n<h3>Consejos</h3>\n<ul>${texto.consejos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
  const preguntas = texto.preguntas.length
    ? `\n<h2>Preguntas frecuentes</h2>\n${texto.preguntas.map(([p, r]) => `<h3>${esc(p)}</h3>\n<p>${esc(r)}</p>`).join('\n')}`
    : '';
  return `<section class="guia-texto" aria-label="Sobre esta guía">
<h2>${esc(texto.titulo ?? `${d.enlace ?? d.titulo}: qué tener en cuenta`)}</h2>
${texto.parrafos.map((p) => `<p>${esc(p)}</p>`).join('\n')}${consejos}${preguntas}
</section>
`;
}

/**
 * Bloque de la portada para quien no ejecuta el panel (buscadores, vistas previas): qué es
 * la web, lo mejor de ahora y todas las guías. El panel lo sustituye al pintar; con
 * JavaScript ni se llega a ver (estilos: .js .portada-estatica).
 */
export function bloquePortada(datos, guias) {
  const desde = datos.origen.nombre;
  const destacadas = datos.ofertas.filter((o) => esEscapada(o) && conTotal(o)).sort((a, b) => (b.puntuacion ?? 0) - (a.puntuacion ?? 0) || porTotal(a, b)).slice(0, DESTACADAS_PORTADA);
  const nombres = new Map((datos.fuentes ?? []).map((f) => [f.id, f.nombre]));
  return `<div class="portada-estatica">
<h1>Escapadas de fin de semana desde ${esc(desde)}</h1>
<p>Escapadas, casas rurales, hoteles con spa, planes y chollos de vuelos de más de 20 webs de viajes, juntos y revisados cada 15 minutos. Cada oferta con el coste del viaje completo para ${VIAJEROS} personas desde ${esc(desde)} (la oferta y la gasolina), el tiempo en coche y cuándo se comprobó. Datos del ${esc(etiquetaDia(datos.generado))}.</p>
${destacadas.length ? `<h2>Lo mejor de ahora</h2>\n<ol class="lista-guia">${destacadas.map((o) => filaOferta(o, nombres)).join('')}</ol>` : ''}
${guias.length ? `<nav class="guias" aria-label="Guías">${enlacesGuias(guias, '')}</nav>` : ''}
</div>`;
}

/** JSON-LD de la portada (la web y quien la hace). Va en el <head>: el panel repinta el <main>. */
export const estructuradosPortada = (base) => jsonLd({ '@context': 'https://schema.org', '@graph': datosWeb(base) });

/**
 * Páginas que merecen publicarse con las ofertas de ahora, y el sitemap.
 * @param {{ofertas: object[], origen: object, findes?: object[], generado: string}} datos ofertas.json
 * @param {{base?: string|null}} opciones URL pública del panel (para canonical y sitemap)
 * @returns {{archivos: {ruta: string, contenido: string}[], rutas: string[], portada: string}}
 */
export function generarPaginas(datos, { base = null } = {}) {
  const candidatas = definiciones(datos).map((d) => {
    const lista = datos.ofertas.filter(d.elegir).sort(d.orden);
    return { d, lista };
  }).filter(({ lista }) => lista.length >= MINIMO_OFERTAS);
  const todas = candidatas.map((c) => c.d);
  const nombres = new Map((datos.fuentes ?? []).map((f) => [f.id, f.nombre]));
  const archivos = candidatas.map(({ d, lista }) => {
    const raiz = '../'.repeat(d.ruta.split('/').length);
    return {
      ruta: `${d.ruta}/index.html`,
      contenido: htmlPagina(d, lista.slice(0, MAXIMO_POR_PAGINA), {
        raiz, base, generado: datos.generado, total: lista.length, todas, nombres, texto: textoGuia(d.ruta, datos.origen.nombre),
      }),
    };
  });
  const rutas = candidatas.map(({ d }) => d.ruta);
  if (base) {
    // lastmod: el día en que entró la oferta más reciente de la guía (cuando su contenido
    // cambió de verdad), no el del escaneo, que es siempre hoy y Google acaba ignorando.
    const hoy = datos.generado.slice(0, 10);
    const diaDe = (lista) => lista.map((o) => o.vistaPrimera?.slice(0, 10)).filter(Boolean).sort().pop() ?? hoy;
    const dias = new Map(candidatas.map(({ d, lista }) => [`${d.ruta}/`, diaDe(lista.slice(0, MAXIMO_POR_PAGINA))]));
    dias.set('', [...dias.values()].sort().pop() ?? hoy);
    const urls = ['', ...rutas.map((r) => `${r}/`)].map((r) => `  <url><loc>${esc(base + r)}</loc><lastmod>${dias.get(r)}</lastmod></url>`);
    archivos.push({ ruta: 'sitemap.xml', contenido: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` });
  }
  // Los buscadores pueden leerlo todo, también data/: el panel la necesita para pintarse y un
  // buscador que ejecuta JavaScript tiene que poder bajarla (bloquearla dejaba la portada en
  // «Cargando»). Que los datos en bruto no salgan en resultados lo dice su cabecera
  // X-Robots-Tag (el .htaccess). El sitemap, si se sabe la URL. (robots.txt solo cuenta en la
  // raíz de un dominio propio; en usuario.github.io/repo/ manda el de usuario.github.io.)
  archivos.push({ ruta: 'robots.txt', contenido: `User-agent: *\nAllow: /\n${base ? `\nSitemap: ${base}sitemap.xml\n` : ''}` });
  return { archivos, rutas, portada: bloquePortada(datos, todas) };
}
