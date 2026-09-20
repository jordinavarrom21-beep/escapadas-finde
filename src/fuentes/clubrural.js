/**
 * Clubrural (de Holidu): las dos páginas de ofertas de fin de semana que enlaza
 * la portada. Cada una trae, renderizadas en el servidor, unas 16 casas
 * agrupadas por provincia.
 *
 * Las tarjetas no llevan enlace: la web abre la casa con un formulario oculto
 * que envía a /redirect/prg (prohibido en su robots.txt, y no se pide) la ruta
 * de destino en base64, del tipo
 * `/s/Provincia-de-Madrid--España?propertyType=AGRITOURISM&includeOfferIds=56956009`.
 * De ahí salen el id estable de la oferta, la provincia y el enlace que se
 * guarda (la búsqueda de la provincia con esa casa, sin pasar por la redirección).
 *
 * El precio es el «desde X € / noche» del alojamiento entero (no por persona),
 * así que la unidad es `noche`; la capacidad va en el título y las etiquetas.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { recortar } from '../util/xml.js';

const WEB = 'https://www.clubrural.com';
const PAGINAS = [
  `${WEB}/ofertas-casas-rurales/fin-de-semana`,
  `${WEB}/ofertas-casas-rurales/escapada-fin-de-semana`,
];
const PAUSA_MS = 2000;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|awswaf|access denied/i;

/**
 * Ofertas de una página de ofertas de Clubrural.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const $ = cheerio.load(html);
  const ofertas = $('form[action="/redirect/prg"] > input[name="to"]').get().flatMap((entrada) => {
    const destino = rutaDestino($(entrada).attr('value'));
    const tarjeta = $(entrada).parent().parent();
    if (!destino?.searchParams.get('includeOfferIds') || tarjeta.find('h3').length !== 1) return [];
    try {
      return [ofertaDe(datosDeTarjeta($, tarjeta, destino))];
    } catch (error) {
      log(`Casa descartada (${destino.searchParams.get('includeOfferIds')}): ${error.message}`);
      return [];
    }
  });
  return deduplicar(ofertas);
}

/** Ruta en base64 del formulario oculto → URL absoluta, o null si no se entiende. */
export function rutaDestino(base64 = '') {
  try {
    const ruta = Buffer.from(base64, 'base64').toString('utf8');
    return ruta.startsWith('/') ? new URL(ruta, WEB) : null;
  } catch {
    return null;
  }
}

function datosDeTarjeta($, tarjeta, destino) {
  const [localidad, ...zona] = limpiar(tarjeta.find('button span').first().text()).split(', ');
  const nota = tarjeta.find('h3').next().find('span');
  return {
    id: destino.searchParams.get('includeOfferIds'),
    destino,
    alojamiento: limpiar(tarjeta.find('h3').text()),
    localidad,
    zona: zona.join(', '),
    descripcion: limpiar(tarjeta.find('.line-clamp-2').first().text()),
    precioTexto: limpiar(tarjeta.find('strong').first().closest('span').text()),
    imagen: tarjeta.find('img').first().attr('src') ?? null,
    alt: tarjeta.find('img').first().attr('alt') ?? '',
    nota: parsearPrecio(nota.eq(0).text()),
    opiniones: Number.parseInt(nota.eq(1).text().replace(/\D/g, ''), 10) || 0,
    distintivos: tarjeta.find('[class*="group/badge"]').get().map((distintivo) => limpiar($(distintivo).find('span').first().text())),
  };
}

function ofertaDe(dato) {
  const precio = parsearPrecio(dato.precioTexto);
  const [, tipoAlojamiento, plazas] = dato.alojamiento.match(/^(.+?) para (\d+) personas?$/) ?? [null, dato.alojamiento, null];
  const url = new URL(dato.destino);
  url.searchParams.delete('fromCategory');
  return crearOferta({
    id: `clubrural:${dato.id}`,
    fuente: 'clubrural',
    tipo: 'hotel',
    titulo: dato.localidad ? `${dato.alojamiento} en ${dato.localidad}` : dato.alojamiento,
    descripcion: recortar(dato.descripcion),
    url: url.href,
    imagen: dato.imagen,
    precio,
    precioTexto: precio == null ? '' : `${dato.precioTexto}${plazas ? ` (alojamiento para ${plazas} personas)` : ''}`,
    unidad: precio == null ? null : 'noche',
    regimen: /desayuno/i.test(tipoAlojamiento) ? 'desayuno' : null,
    // La nota que publica Holidu ya está sobre 10.
    valoracion: dato.nota > 0 && dato.opiniones > 0 ? { nota: dato.nota, n: dato.opiniones } : null,
    temas: ['rural', ...(dato.distintivos.some((d) => /famil/i.test(d)) ? ['familia'] : [])],
    lugar: dato.localidad
      ? { nombre: dato.localidad, region: provinciaDe(dato.destino), pais: 'España', codigoPais: 'ES', lat: null, lon: null, iata: null }
      : null,
    etiquetas: [...new Set([
      tipoAlojamiento,
      plazas ? `Hasta ${plazas} personas` : null,
      /^Provincia de /.test(dato.zona) ? null : dato.zona,
      ...dato.distintivos,
      ...caracteristicas(dato.alt),
      dato.opiniones ? `Valoración ${dato.nota}/10 (${dato.opiniones} ${dato.opiniones === 1 ? 'opinión' : 'opiniones'})` : null,
    ].filter(Boolean))],
  });
}

const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').trim();

/** '/s/Provincia-de-Castellón--España' → 'Castellón'. */
function provinciaDe(destino) {
  const [region] = decodeURIComponent(destino.pathname).replace(/^\/s\//, '').split('--');
  return region ? region.replace(/^Provincia-de-/, '').replace(/-/g, ' ') : null;
}

/** 'Chalet para 10 personas, con Balcón además de Jacuzzi y Jardín en ' → ['Balcón', 'Jacuzzi', 'Jardín']. */
export function caracteristicas(alt) {
  const lista = alt.match(/, con (.+?)(?: en .*)?$/)?.[1] ?? '';
  return lista.split(/,| y | además de /).map((c) => limpiar(c)).filter(Boolean);
}

function deduplicar(ofertas) {
  const vistas = new Set();
  return ofertas.filter((oferta) => !vistas.has(oferta.id) && vistas.add(oferta.id));
}

function leerPagina(html, ctx) {
  const ofertas = parsear(html, ctx);
  if (ofertas.length) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Clubrural ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('no se ha encontrado ninguna casa (¿ha cambiado la página?)');
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function obtener(ctx) {
  const ofertas = [];
  let leidas = 0;
  let ultimoError = null;
  for (const [i, url] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      ofertas.push(...leerPagina(await ctx.http.texto(url), ctx));
      leidas++;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Clubrural ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Clubrural (último error: ${ultimoError.message})`);
  return { ofertas: deduplicar(ofertas), reemplazar: leidas === PAGINAS.length };
}

export default {
  id: 'clubrural',
  nombre: 'Clubrural',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
