/**
 * Foto del destino para las ofertas que no traen ninguna (casi todas las de vuelos): la
 * imagen principal del artículo de Wikipedia del lugar, por la API pública de Wikimedia
 * (api.wikimedia.org: gratis, sin clave; su robots.txt no pone límites). Las fotos son de
 * Wikimedia Commons, con licencia libre: el panel enlaza su página, con autor y licencia.
 *
 * Una consulta por lugar, guardada 30 días (también cuando no hay foto), y como mucho
 * `MAX_NUEVAS` lugares nuevos por escaneo para repartir las peticiones.
 */
import { comprobarRobots } from '../util/robots.js';
import { normalizarTexto } from '../util/xml.js';

const URL_BUSCAR = 'https://api.wikimedia.org/core/v1/wikipedia/es/search/page';
const CADUCIDAD_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NUEVAS = 40;
const PAUSA_MS = 300;
/** Ancho de la miniatura: uno de los tamaños estándar que sirve Wikimedia. */
const ANCHO = 500;

const clave = (lugar) => `foto:${normalizarTexto(`${lugar.nombre}|${lugar.pais ?? ''}`)}`;

/**
 * La foto de la primera página de la búsqueda, si es del lugar (su título empieza por el
 * nombre: «Turín», «Besalú»…; «Tarragona (provincia)» también vale), o null.
 * @returns {{url: string, pagina: string, titulo: string}|null}
 */
export function fotoDeBusqueda(json, nombre) {
  const [pagina] = json?.pages ?? [];
  const miniatura = pagina?.thumbnail?.url;
  if (!miniatura || !normalizarTexto(pagina.title).startsWith(normalizarTexto(nombre))) return null;
  const url = new URL(miniatura, 'https://thumb.wikimedia.org');
  // …/thumb/e/ee/Archivo.jpg/60px-Archivo.jpg → la miniatura de ANCHO px y la página del archivo en Commons.
  const partes = url.pathname.split('/');
  const archivo = partes.at(-2);
  if (!/^\d+px-/.test(partes.at(-1)) || !archivo) return null;
  partes[partes.length - 1] = partes.at(-1).replace(/^\d+px-/, `${ANCHO}px-`);
  return {
    url: `https://${url.host}${partes.join('/')}`,
    pagina: `https://commons.wikimedia.org/wiki/File:${archivo}`,
    titulo: pagina.title,
  };
}

/** Añade `imagen` e `imagenCredito` a las ofertas sin foto que tienen lugar. */
export async function anadirFotos(ofertas, ctx) {
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
          await comprobarRobots(ctx, [URL_BUSCAR]);
          robotsOk = true;
        } catch (error) {
          ctx.log(`Sin fotos de Wikimedia: ${error.message}`);
          robotsOk = false;
        }
      }
      if (!robotsOk) break;
      if (nuevas++) await ctx.http.esperar(PAUSA_MS);
      try {
        const json = await ctx.http.json(`${URL_BUSCAR}?q=${encodeURIComponent(lugar.nombre)}&limit=1`);
        foto = fotoDeBusqueda(json, lugar.nombre);
        ctx.cache.guardar(k, foto, ahora);
      } catch (error) {
        ctx.log(`Foto de ${lugar.nombre}: ${error.message}`);
        continue;
      }
    }
    if (!foto) continue;
    for (const oferta of suyas) {
      oferta.imagen = foto.url;
      oferta.imagenCredito = { texto: 'Foto: Wikimedia Commons', url: foto.pagina };
    }
  }
}
