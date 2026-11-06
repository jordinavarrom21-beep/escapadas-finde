/**
 * Foto del destino para las ofertas que no traen una con permiso: la primera foto de la ficha
 * resumen (infotaula) del artículo de Wikipedia del lugar, con su autor y su licencia de
 * Wikimedia Commons. La imagen principal del artículo, la que da la búsqueda, era casi siempre
 * la bandera o un mapa: 171 ofertas enseñaban la bandera de Barcelona (nov. 2026).
 *
 * Por lugar, tres peticiones, todas en rutas que sus robots.txt dejan leer (las API de Wikidata
 * y de Commons están en /w/, que no): la búsqueda del artículo (api.wikimedia.org), el artículo
 * (/wiki/…) y la página del archivo en Commons (autor y licencia). Se guarda 30 días, también
 * cuando no hay foto, y como mucho `MAX_NUEVAS` lugares nuevos por escaneo.
 */
import * as cheerio from 'cheerio';
import { comprobarRobots } from '../util/robots.js';
import { normalizarTexto } from '../util/xml.js';
import { distanciaKm, tieneCoordenadas } from '../../site/js/geo.js';

const buscar = (wiki) => `https://api.wikimedia.org/core/v1/wikipedia/${wiki}/search/page`;
const articulo = (wiki, titulo) => `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, '_'))}`;
const archivo = (nombre) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(nombre.replace(/ /g, '_'))}`;
const CADUCIDAD_MS = 30 * 24 * 60 * 60 * 1000;
// 40 lugares son 80 peticiones a api.wikimedia.org (búsqueda y artículo van a hosts distintos,
// pero cuentan igual) cada 15 min: 320 a la hora, por debajo de las 500 que deja sin clave.
const MAX_NUEVAS = 40;
const PAUSA_MS = 500;
/** Ancho de la miniatura: uno de los tamaños estándar que sirve Wikimedia. */
const ANCHO = 500;
/** Más lejos que esto, el artículo es de otro sitio con el mismo nombre. */
const MAX_KM = 30;
/** Lo que no es una foto del sitio: banderas, escudos, mapas, logos e iconos, y cualquier SVG (son dibujos). */
const NO_FOTO = /\.svg$|bandera|flag|escut|escudo|coat[_ ]of[_ ]arms|wappen|blason|mapa|map|locator|location|situaci|logo|icon|segell|sello|seal|signatura|firma/i;
/** Licencias libres: se puede usar la foto citando autor y licencia. */
const LIBRE = /^(cc0|cc[ -]by|public domain|dominio p[uú]blico|domini p[uú]blic|pd\b)/i;
const CATALANAS = ['Barcelona', 'Girona', 'Lleida', 'Tarragona'];

/** Los pueblos de Cataluña y Andorra, en la Viquipèdia (con su nombre oficial); el resto, en la Wikipedia en español. */
const wikiDe = (lugar) => (lugar.comunidad === 'Cataluña' || CATALANAS.includes(lugar.provincia) || lugar.codigoPais === 'AD' ? 'ca' : 'es');
const clave = (lugar) => `foto2:${normalizarTexto(`${lugar.nombre}|${lugar.pais ?? ''}`)}`;
/** «Palermo (Sicilia)» se busca como «Palermo». */
const nombreBuscado = (nombre) => nombre.replace(/\s*\([^)]*\)\s*$/, '').trim();

/** El título del primer resultado si es el del lugar («Tarragona (província)» también vale), o null. */
export function tituloDeBusqueda(json, nombre) {
  const [pagina] = json?.pages ?? [];
  return pagina?.title && normalizarTexto(pagina.title).startsWith(normalizarTexto(nombre)) ? pagina.title : null;
}

/** «…/thumb/c/cd/Girona.jpg/250px-Girona.jpg» → «Girona.jpg». */
function archivoDe(src = '') {
  const partes = src.split('?')[0].split('/');
  const i = partes.indexOf('thumb');
  try {
    return decodeURIComponent(i >= 0 ? partes[i + 3] ?? '' : partes.at(-1) ?? '');
  } catch {
    return '';
  }
}

/**
 * La primera foto de la ficha resumen del artículo (no una bandera, un escudo ni un mapa), con la
 * miniatura de ANCHO px, y las coordenadas del artículo para comprobar que es el mismo sitio.
 * @returns {{archivo: string, url: string, punto: {lat: number, lon: number}|null}|null}
 */
export function fotoDeArticulo(html) {
  const $ = cheerio.load(html);
  const src = $('table.infobox img').map((_, img) => $(img).attr('src')).get()
    .find((s) => { const nombre = archivoDe(s); return nombre && !NO_FOTO.test(nombre); });
  if (!src) return null;
  const url = new URL(src, 'https://upload.wikimedia.org');
  const partes = url.pathname.split('/');
  if (!partes.includes('thumb') || !/^\d+px-/.test(partes.at(-1))) return null;
  partes[partes.length - 1] = partes.at(-1).replace(/^\d+px-/, `${ANCHO}px-`);
  const [, lat, lon] = html.match(/"wgCoordinates":\{"lat":(-?[\d.]+),"lon":(-?[\d.]+)\}/) ?? [];
  return { archivo: archivoDe(src), url: `https://${url.host}${partes.join('/')}`, punto: lat ? { lat: Number(lat), lon: Number(lon) } : null };
}

/** Autor y licencia de la página del archivo en Commons (sus datos para máquinas), o null si la licencia no es libre. */
export function licenciaDe(html) {
  const $ = cheerio.load(html);
  const licencia = $('.licensetpl_short').first().text().trim();
  if (!LIBRE.test(licencia)) return null;
  const autor = ($('.licensetpl_attr').first().text() || $('#fileinfotpl_aut').next('td').text()).replace(/\s+/g, ' ').trim();
  return { licencia, licenciaUrl: $('.licensetpl_link').first().text().trim() || null, autor: autor.slice(0, 80) || null };
}

/** El crédito que enseña el panel: de qué sitio es la foto, autor, licencia y su página en Commons. */
export const creditoFoto = (foto, lugar) => ({
  texto: `Foto de ${lugar}: ${foto.autor ?? 'autor en Wikimedia Commons'} · ${foto.licencia}`,
  url: foto.pagina, autor: foto.autor, licencia: foto.licencia, licenciaUrl: foto.licenciaUrl, lugar,
});

/** Las fotos de Wikimedia puestas antes, sin licencia ni comprobar que no son una bandera: se vuelven a buscar. */
const deAntes = (oferta) => /^https:\/\/commons\.wikimedia\.org\//.test(oferta.imagenCredito?.url ?? '') && !oferta.imagenCredito.licencia;

/** ¿Es una foto de Wikimedia Commons puesta aquí (con autor y licencia)? */
const deWikimedia = (oferta) => /^https:\/\/commons\.wikimedia\.org\//.test(oferta.imagenCredito?.url ?? '');

/**
 * Las fotos de una web solo se enseñan si sus condiciones lo permiten (config/ajustes.json →
 * fotos.fuentesConPermiso): que la web la publique no da permiso para usarla. Sin permiso, la
 * oferta se queda sin foto y `anadirFotos` busca la del lugar en Wikimedia Commons; si tampoco
 * hay, el panel enseña la foto de su temática (site/js/fotos-tema.js).
 * @param {Set<string>} conPermiso ids de las webs
 */
export function quitarFotoSinPermiso(oferta, conPermiso) {
  if ((oferta.imagen && !conPermiso.has(oferta.fuente) && !deWikimedia(oferta)) || deAntes(oferta)) {
    oferta.imagen = null;
    oferta.imagenCredito = null;
  }
  return oferta;
}

async function fotoDelLugar(lugar, ctx, { vuelo }) {
  const wiki = wikiDe(lugar);
  const nombre = nombreBuscado(lugar.nombre);
  // De un vuelo se busca la ciudad: «Milán Malpensa» no tiene artículo con ese título, «Milán» sí.
  const nombres = vuelo && nombre.includes(' ') ? [nombre, nombre.split(' ')[0]] : [nombre];
  let titulo = null;
  for (const n of nombres) {
    titulo = tituloDeBusqueda(await ctx.http.json(`${buscar(wiki)}?q=${encodeURIComponent(n)}&limit=1`), n);
    if (titulo) break;
    await ctx.http.esperar(PAUSA_MS);
  }
  if (!titulo) return null;
  await ctx.http.esperar(PAUSA_MS);
  const foto = fotoDeArticulo(await ctx.http.texto(articulo(wiki, titulo)));
  // Otro sitio con el mismo nombre: mejor sin foto que con la de otro pueblo. El de un vuelo es el
  // aeropuerto, que queda lejos del centro (Malpensa, a 40 km de Milán).
  if (!foto || (foto.punto && tieneCoordenadas(lugar) && distanciaKm(foto.punto, lugar) > MAX_KM * (vuelo ? 3 : 1))) return null;
  await ctx.http.esperar(PAUSA_MS);
  const licencia = licenciaDe(await ctx.http.texto(archivo(foto.archivo)));
  return licencia && { url: foto.url, pagina: archivo(foto.archivo), ...licencia };
}

/** Añade `imagen` e `imagenCredito` a las ofertas sin foto que tienen lugar. */
export async function anadirFotos(ofertas, ctx) {
  for (const oferta of ofertas) if (deAntes(oferta)) Object.assign(oferta, { imagen: null, imagenCredito: null });
  const sinFoto = ofertas.filter((o) => !o.imagen && o.lugar?.nombre);
  if (!sinFoto.length) return;
  const ahora = ctx.ahora.getTime();
  const porLugar = new Map();
  for (const oferta of sinFoto) {
    const k = clave(oferta.lugar);
    if (!porLugar.has(k)) porLugar.set(k, { lugar: oferta.lugar, ofertas: [] });
    porLugar.get(k).ofertas.push(oferta);
  }
  let nuevas = 0;
  let robotsOk = null;
  for (const [k, { lugar, ofertas: suyas }] of porLugar) {
    let foto = ctx.cache.obtener(k, CADUCIDAD_MS, ahora);
    if (foto === undefined) {
      if (nuevas >= MAX_NUEVAS) continue;
      if (robotsOk === null) {
        try {
          await comprobarRobots(ctx, [buscar('es'), articulo('ca', 'Girona'), articulo('es', 'Girona'), archivo('Girona.jpg')]);
          robotsOk = true;
        } catch (error) {
          ctx.log(`Sin fotos de Wikimedia: ${error.message}`);
          robotsOk = false;
        }
      }
      if (!robotsOk) break;
      if (nuevas++) await ctx.http.esperar(PAUSA_MS);
      try {
        foto = await fotoDelLugar(lugar, ctx, { vuelo: suyas.every((o) => o.tipo === 'vuelo') });
        ctx.cache.guardar(k, foto, ahora);
      } catch (error) {
        // Bloqueado o limitado (403/429): no se insiste más en este escaneo.
        if (error.estado === 403 || error.estado === 429) {
          ctx.log(`Sin fotos de Wikimedia en este escaneo: ${error.message}`);
          break;
        }
        ctx.log(`Foto de ${lugar.nombre}: ${error.message}`);
        continue;
      }
    }
    if (!foto) continue;
    for (const oferta of suyas) {
      oferta.imagen = foto.url;
      oferta.imagenCredito = creditoFoto(foto, lugar.nombre);
    }
  }
}
