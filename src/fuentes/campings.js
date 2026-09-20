/**
 * Campings.net: la página de campings con ofertas. Suele tener pocas (2–5) y
 * todas están en una sola página, que trae los datos en la variable JS
 * `var ofertas = [...]` (nombre, texto, coordenadas y validez) y, en las
 * tarjetas, la provincia y la comunidad de cada camping.
 *
 * Las ofertas de los campings son descuentos («5 % por reserva anticipada»,
 * «10 % para federados»), sin precio: `precio` es null y el porcentaje va en
 * `descuento`. `caduca` es el último día de validez que publica la web.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { decodificarEntidades, recortar } from '../util/xml.js';

const WEB = 'https://www.campings.net';
const PAGINA = `${WEB}/campingsconofertas.php`;
const VARIABLE_OFERTAS = /var\s+ofertas\s*=\s*(\[[\s\S]*?\]);/;
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha-delivery|datadome|awswaf|access denied/i;

/**
 * Ofertas de la página de campings con ofertas, o null si la página no trae
 * los datos de las ofertas (desafío anti-bot o cambio de la web).
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const json = VARIABLE_OFERTAS.exec(html)?.[1];
  if (!json) return null;
  const tarjetas = tarjetasPorEnlace(cheerio.load(html));
  const vistas = new Set();
  return JSON.parse(json).flatMap((dato) => {
    try {
      const oferta = ofertaDe(dato, tarjetas.get(dato.enlace_ofertas_camping) ?? {});
      if (vistas.has(oferta.id)) return [];
      vistas.add(oferta.id);
      return [oferta];
    } catch (error) {
      log(`Oferta descartada (${dato.camping_nombre}): ${error.message}`);
      return [];
    }
  });
}

/** Datos de las tarjetas HTML indexados por el enlace a las ofertas del camping. */
function tarjetasPorEnlace($) {
  const tarjetas = new Map();
  $('.cada-oferta').each((_, fila) => {
    const tarjeta = $(fila);
    const enlace = tarjeta.find('.oferta a[href]').first().attr('href');
    if (!enlace) return;
    const [provincia, comunidad, pais] = tarjeta.find('.back .descripcion p').first().find('a').get().map((a) => limpiar($(a).text()));
    tarjetas.set(enlace, {
      provincia,
      comunidad,
      pais,
      camping: limpiar(tarjeta.find('.back .descripcion p[style]').first().text()),
      texto: limpiar(tarjeta.find('.descripcion-oferta p').first().text()),
    });
  });
  return tarjetas;
}

function ofertaDe(dato, tarjeta) {
  const url = dato.enlace_ofertas_camping;
  const idOferta = String(dato.urlreserva ?? '').match(/\/(\d+)\/?$/)?.[1];
  if (!idOferta || !url) throw new Error('sin identificador o sin enlace');
  const nombre = limpiar(dato.camping_nombre);
  const camping = /^camping\b/i.test(nombre) ? nombre : `Camping ${nombre}`;
  const mensaje = texto(dato.oferta_mensaje);
  const detalle = tarjeta.texto?.length > mensaje.length ? tarjeta.texto : mensaje;
  const descuento = porcentaje(detalle);
  const tipoOferta = limpiar(dato.tipo_oferta).replace(/\s*!+$/, '');
  return crearOferta({
    id: `campings:${idOferta}`,
    fuente: 'campings',
    tipo: 'hotel',
    titulo: `${camping}: ${texto(dato.oferta_nombre)}`,
    descripcion: recortar(detalle.replace(/(…|\.{3,})+$/, '…')),
    url,
    imagen: dato.foto || null,
    precio: null,
    precioTexto: descuento ? `${descuento} % de descuento` : '',
    descuento,
    temas: ['rural', ...(/famil|niñ|infantil/i.test(`${detalle} ${tarjeta.camping ?? ''}`) ? ['familia'] : [])],
    lugar: {
      nombre: tarjeta.provincia || camping,
      region: tarjeta.comunidad ?? null,
      pais: tarjeta.pais ?? null,
      codigoPais: tarjeta.pais === 'España' ? 'ES' : null,
      lat: coordenada(dato.latitud),
      lon: coordenada(dato.longitud),
      iata: null,
    },
    etiquetas: [
      'Camping',
      tipoOferta && tipoOferta !== 'Oferta' ? tipoOferta : null,
      dato.oferta_destacada === '1' ? 'Oferta destacada' : null,
    ].filter(Boolean),
    caduca: finDelDia(dato.fechafin),
  });
}

const limpiar = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();
const texto = (valor) => limpiar(decodificarEntidades(valor ?? ''));

function coordenada(valor) {
  const numero = Number.parseFloat(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** Primer porcentaje de descuento del texto («Descuento del 5 %…» → 5), o null. */
export function porcentaje(texto) {
  const valor = Number(texto.match(/(\d{1,2})\s?%/)?.[1]);
  return valor > 0 ? valor : null;
}

/** '20-09-2026' → fin de ese día en Madrid (hora de invierno, como mucho una hora tarde en verano), en ISO. */
export function finDelDia(fecha) {
  const partes = String(fecha ?? '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return partes ? new Date(`${partes[3]}-${partes[2]}-${partes[1]}T23:59:59+01:00`).toISOString() : null;
}

async function obtener(ctx) {
  let html;
  try {
    html = await ctx.http.texto(PAGINA);
  } catch (error) {
    if (error.estado === 403 || error.estado === 429) {
      throw new Error(`Campings.net ha bloqueado o limitado la petición (HTTP ${error.estado})`);
    }
    throw error;
  }
  const ofertas = parsear(html, ctx);
  if (ofertas) return { ofertas, reemplazar: true };
  if (DESAFIO.test(html)) throw new Error('Campings.net ha devuelto un desafío anti-bot');
  throw new Error('La página de ofertas de Campings.net no trae la lista de ofertas (¿ha cambiado la web?)');
}

export default {
  id: 'campings',
  nombre: 'Campings.net',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: [PAGINA],
  obtener,
};
