/**
 * Páginas estáticas con URL legible (escapadas/spa/, vuelos/…) que el escaneo escribe en
 * site/ para los buscadores y para compartir: el panel vive en #/…, que un buscador no ve
 * como páginas distintas y que sin JavaScript solo dice «Cargando». Cada página se genera
 * solo si tiene ofertas suficientes, con datos propios (coste del viaje completo, tiempo de
 * viaje, fechas, cuándo se comprobó) y sin copiar las descripciones de los proveedores.
 * Las combinaciones de filtros siguen en #/… y no se indexan.
 */
import { costeDesdeOrigen } from './vigilados.js';
import { escaparHtml as esc, euros } from '../site/js/formato.js';
import { etiquetaDia } from './util/fechas.js';

/** Menos de esto es una página casi vacía: no se publica (ni entra en el sitemap). */
export const MINIMO_OFERTAS = 5;
/** Carpetas de site/ que escribe este módulo (se vacían antes de cada escaneo). */
export const CARPETAS = ['escapadas', 'vuelos', 'actividades'];
const MAXIMO_POR_PAGINA = 24;
const VIAJEROS = 2;
const SIN_COCHE = ['tren', 'bus', 'ferry', 'avion'];
const UNIDADES = {
  pp: 'por persona', 'pp/noche': 'por persona y noche', total: 'en total', 'i/v': 'ida y vuelta por persona',
  noche: 'por alojamiento y noche', trayecto: 'por persona y trayecto',
};

const esEscapada = (o) => !['vuelo', 'actividad'].includes(o.tipo) && !o.etiquetas.includes('duplicada');
const conTotal = (o) => costeDesdeOrigen(o, VIAJEROS).total != null;
const porTotal = (a, b) => costeDesdeOrigen(a, VIAJEROS).total - costeDesdeOrigen(b, VIAJEROS).total;
const porPrecio = (a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity);
const saleDe = (o) => o.etiquetas.filter((e) => e.startsWith('sale-de:')).map((e) => e.slice(8));

/**
 * Qué páginas hay: ruta, textos, criterio (en palabras) y cómo se eligen y ordenan las
 * ofertas. `panel` es la misma búsqueda en el panel, con todos sus filtros.
 */
export function definiciones({ origen, findes = [] }) {
  const desde = origen.nombre;
  const finde = findes[0];
  const coste = `el coste del viaje completo para ${VIAJEROS} personas desde ${desde}: la oferta y, si se va en coche, la gasolina estimada (sin peajes)`;
  return [
    {
      ruta: 'escapadas', titulo: `Escapadas de fin de semana desde ${desde}`,
      intro: `Las escapadas más baratas que hemos encontrado, ordenadas por ${coste}.`,
      elegir: (o) => esEscapada(o) && conTotal(o), orden: porTotal, panel: '#/escapadas?orden=total',
    },
    {
      ruta: 'escapadas/menos-de-100-euros', titulo: `Escapadas desde ${desde} por menos de 100 € por persona`,
      intro: `Viajes completos que salen por menos de 100 € por persona según ${coste}.`,
      elegir: (o) => esEscapada(o) && costeDesdeOrigen(o, VIAJEROS).porPersona <= 100, orden: porTotal,
      panel: '#/escapadas?orden=total&pres=100&prespor=persona',
    },
    {
      ruta: 'escapadas/este-finde', titulo: finde ? `Escapadas para este finde (${finde.etiqueta}) desde ${desde}` : '',
      intro: `Para el finde que viene: ofertas con esas fechas o de fechas flexibles que siguen vigentes. Ordenadas por ${coste}.`,
      elegir: (o) => Boolean(finde) && esEscapada(o) && conTotal(o) && (o.fechas.salida ? o.fechas.findeId === finde.id : !o.caduca || o.caduca.slice(0, 10) >= finde.viernes),
      orden: porTotal, panel: '#/escapadas?cuando=finde&orden=total',
    },
    ...[
      ['spa', 'spa', 'Escapadas con spa', 'Hoteles, balnearios y escapadas con spa o circuito de aguas'],
      ['con-ninos', 'familia', 'Escapadas con niños', 'Planes para ir en familia'],
      ['rurales', 'rural', 'Escapadas rurales', 'Casas rurales y planes de naturaleza'],
      ['romanticas', 'romantico', 'Escapadas románticas', 'Planes para dos'],
    ].map(([slug, tema, titulo, que]) => ({
      ruta: `escapadas/${slug}`, titulo: `${titulo} desde ${desde}`,
      intro: `${que}, ordenados por ${coste}.`,
      elegir: (o) => esEscapada(o) && o.temas.includes(tema) && conTotal(o), orden: porTotal,
      panel: `#/escapadas?temas=${tema}&orden=total`,
    })),
    {
      ruta: 'escapadas/sin-coche', titulo: `Escapadas sin coche desde ${desde}`,
      intro: 'En tren, autobús, ferry o avión incluidos. El precio es el que publica cada web; el viaje completo, cuando se puede calcular.',
      elegir: (o) => esEscapada(o) && SIN_COCHE.includes(o.transporte) && o.precio != null, orden: porPrecio,
      panel: '#/escapadas?sincoche=1',
    },
    {
      ruta: 'vuelos', titulo: `Chollos de vuelos desde ${desde}`,
      intro: `Billetes que publican blogs y comunidades y que salen de ${desde} (o de una zona que lo incluye), del más barato al más caro. No tienen fechas concretas: la disponibilidad se confirma en cada web.`,
      elegir: (o) => o.tipo === 'vuelo' && !o.vuelo && o.precio != null && !o.etiquetas.includes('promocion')
        && saleDe(o).some((c) => [desde, 'España', 'varias ciudades europeas'].includes(c)),
      orden: porPrecio, panel: '#/vuelos?mios=1&orden=precio',
    },
    {
      ruta: 'actividades/gratis', titulo: `Actividades gratis cerca de ${desde}`,
      intro: 'Free tours y visitas sin coste de entrada (algunas con propina voluntaria).',
      elegir: (o) => o.tipo === 'actividad' && o.precio === 0, orden: (a, b) => (b.valoracion?.nota ?? 0) - (a.valoracion?.nota ?? 0),
      panel: '#/actividades?gratis=1',
    },
  ].filter((d) => d.titulo);
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
  const url = o.urlReserva ?? o.url;
  const rel = o.afiliado || o.patrocinada ? 'sponsored nofollow noopener' : 'nofollow noopener';
  return `<li class="fila-guia">
  <h3>${esc(o.titulo)}</h3>
  <p>${[lugar && `📍 ${esc(lugar)}`, esc(fechas), llegar && esc(llegar), salidas.length && `Sale de ${esc(salidas.join(', '))}`, o.valoracion?.nota >= 0 && `⭐ ${esc(String(o.valoracion.nota).replace('.', ','))}`].filter(Boolean).join(' · ')}</p>
  <p><strong>${esc(precio)}</strong>${c.total != null ? ` · viaje completo ${c.estimado ? '≈ ' : ''}${esc(euros(Math.round(c.total)))} para ${VIAJEROS} (${esc(euros(Math.round(c.porPersona)))} por persona)` : ''}</p>
  <p class="suave">Publicada en ${esc(nombres.get(o.fuente) ?? o.fuente)}${o.vistaUltima ? ` · comprobada el ${esc(etiquetaDia(o.vistaUltima))}` : ''}${o.patrocinada ? ' · Patrocinado' : ''} · <a href="${esc(url)}" rel="${rel}" target="_blank">Ver la oferta</a></p>
</li>`;
}

/** HTML completo de una página. `raiz` es el camino relativo hasta site/ («../» o «../../»). */
export function htmlPagina(d, ofertas, { raiz, canonical, generado, total, otras = [], nombres = new Map() }) {
  const descripcion = `${d.titulo}: ${total} ofertas comparadas por el coste del viaje completo. Actualizado el ${etiquetaDia(generado)}.`;
  const enlacesOtras = otras.map((o) => `<li><a href="${esc(raiz + o.ruta)}/">${esc(o.titulo)}</a></li>`).join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'none'; object-src 'none'; base-uri 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.titulo)} · Escapadas Finde</title>
<meta name="description" content="${esc(descripcion)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:title" content="${esc(d.titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<link rel="icon" href="${raiz}icono.svg" type="image/svg+xml">
<link rel="stylesheet" href="${raiz}css/estilos.css">
</head>
<body>
<header class="cabecera"><div class="contenedor cabecera__fila"><a class="marca" href="${raiz}"><img src="${raiz}icono.svg" alt="" width="28" height="28"><span>Escapadas Finde</span></a></div></header>
<main class="contenedor guia">
<h1>${esc(d.titulo)}</h1>
<p>${esc(d.intro)}</p>
<p class="suave">Criterios: ${esc(total)} ofertas cumplen; aquí van las ${esc(ofertas.length)} primeras. Datos del ${esc(etiquetaDia(generado))}; los precios son los que publica cada web y pueden haber cambiado. Confirma siempre en la web del proveedor.</p>
<p><a class="boton boton--primario" href="${esc(raiz + d.panel)}">Abrir en el panel (con mapa, filtros y comparación)</a></p>
<ol class="lista-guia">${ofertas.map((o) => filaOferta(o, nombres)).join('')}</ol>
${enlacesOtras ? `<nav aria-label="Más guías"><h2>Más guías</h2><ul>${enlacesOtras}</ul></nav>` : ''}
</main>
</body>
</html>
`;
}

/**
 * Páginas que merecen publicarse con las ofertas de ahora, y el sitemap.
 * @param {{ofertas: object[], origen: object, findes?: object[], generado: string}} datos ofertas.json
 * @param {{base?: string|null}} opciones URL pública del panel (para canonical y sitemap)
 * @returns {{archivos: {ruta: string, contenido: string}[], rutas: string[]}}
 */
export function generarPaginas(datos, { base = null } = {}) {
  const candidatas = definiciones(datos).map((d) => {
    const lista = datos.ofertas.filter(d.elegir).sort(d.orden);
    return { d, lista };
  }).filter(({ lista }) => lista.length >= MINIMO_OFERTAS);
  const archivos = candidatas.map(({ d, lista }) => {
    const raiz = '../'.repeat(d.ruta.split('/').length);
    return {
      ruta: `${d.ruta}/index.html`,
      contenido: htmlPagina(d, lista.slice(0, MAXIMO_POR_PAGINA), {
        raiz, canonical: base ? `${base}${d.ruta}/` : null, generado: datos.generado, total: lista.length,
        otras: candidatas.map((c) => c.d).filter((o) => o.ruta !== d.ruta),
        nombres: new Map((datos.fuentes ?? []).map((f) => [f.id, f.nombre])),
      }),
    };
  });
  const rutas = candidatas.map(({ d }) => d.ruta);
  if (base) {
    const dia = datos.generado.slice(0, 10);
    const urls = ['', ...rutas.map((r) => `${r}/`)].map((r) => `  <url><loc>${esc(base + r)}</loc><lastmod>${dia}</lastmod></url>`);
    archivos.push({ ruta: 'sitemap.xml', contenido: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` });
  }
  return { archivos, rutas };
}
