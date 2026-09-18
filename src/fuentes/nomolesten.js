/**
 * Nomolesten: hoteles con encanto y escapadas en oferta. Cada página de listado
 * trae del servidor sus primeras tarjetas (`.preloaded-hotel`) con el precio de
 * una noche para dos adultos en la fecha de hoy (el resto se cargan desde el
 * navegador y no se piden). Además de /ofertas/ se leen algunas páginas temáticas
 * del menú: cada hotel se queda con los temas de todas las páginas en que aparece.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { diasEntre } from '../util/fechas.js';
import { parsearPrecio } from '../util/precio.js';
import { recortar } from '../util/xml.js';

const WEB = 'https://nomolesten.com';
const PAUSA_MS = 2000;

/** Páginas que se leen, en orden. `tema` es la clave que recibe `parsear`. */
const PAGINAS = [
  { tema: 'ofertas', ruta: '/hoteles-con-encanto/ofertas/', etiqueta: 'Oferta Club Nomolesten', temas: [] },
  { tema: 'spa', ruta: '/hoteles-con-encanto/hoteles-con-spa/', etiqueta: 'Spa', temas: ['spa'] },
  { tema: 'romantico', ruta: '/hoteles-con-encanto/hoteles-romanticos/', etiqueta: 'Romántico', temas: ['romantico'] },
  {
    tema: 'jacuzzi',
    ruta: '/hoteles-con-encanto/hoteles-con-jacuzzi-en-la-habitacion/',
    etiqueta: 'Jacuzzi en la habitación',
    temas: ['romantico', 'spa'],
  },
  { tema: 'adultos', ruta: '/hoteles-con-encanto/hoteles-solo-para-adultos/', etiqueta: 'Solo adultos', temas: ['romantico'] },
  { tema: 'montana', ruta: '/hoteles-con-encanto/hoteles-de-montana/', etiqueta: 'Montaña', temas: ['rural'] },
  { tema: 'enoturismo', ruta: '/escapadas/enoturismo/', etiqueta: 'Enoturismo', temas: ['gastronomia'] },
];

const PAISES_EXTRANJEROS = new Set(['Andorra', 'Portugal', 'Francia']);
const IMPORTE = String.raw`(\d[\d.,]*)\s?€`;
const PRECIO = new RegExp(String.raw`Precio\s+(?:\d+\s+)?noches?\s+(?:${IMPORTE}\s+)?${IMPORTE}`, 'i');
const PRECIO_CLUB = new RegExp(String.raw`Club Nomolesten\s+${IMPORTE}`, 'i');
const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required/i;
const NUMERO = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

/**
 * Hoteles y escapadas con precio de una página de listado de Nomolesten. Las
 * tarjetas «No disponible en las fechas seleccionadas» no tienen precio y se ignoran.
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @param {{tema?: string}} [opciones] clave de la página temática (`spa`, `romantico`, `enoturismo`…)
 */
export function parsear(html, ctx = {}, { tema } = {}) {
  const log = ctx.log ?? (() => {});
  const pagina = PAGINAS.find((p) => p.tema === tema);
  const $ = cheerio.load(html);
  return $('.preloaded-hotel').get()
    .map((elemento) => datosDeTarjeta($, $(elemento)))
    .filter((dato) => dato.precio != null)
    .flatMap((dato) => {
      try {
        return [ofertaDe(dato, pagina)];
      } catch (error) {
        log(`Tarjeta descartada (${dato.nombre || dato.href}): ${error.message}`);
        return [];
      }
    });
}

function datosDeTarjeta($, tarjeta) {
  const texto = limpiar(tarjeta.text());
  const precio = texto.match(PRECIO);
  const club = texto.match(PRECIO_CLUB);
  const imagen = tarjeta.find('.swiper-wrapper img').first();
  const valoracion = tarjeta.find('b').first();
  return {
    nombre: limpiar(tarjeta.find('h2').first().text()),
    alojamiento: limpiar(tarjeta.find('h3').first().text()),
    href: tarjeta.find('h2').closest('a').attr('href') ?? tarjeta.find('a[href]').first().attr('href'),
    imagen: imagen.attr('src') || imagen.attr('data-src') || null,
    ubicacion: limpiar(tarjeta.find('svg + div.nm-text-sm').first().text()),
    valoracion: limpiar(valoracion.text()),
    opiniones: limpiar(valoracion.next('span').text()).replace(/[()]/g, ''),
    precio: parsearPrecio(club?.[1] ?? precio?.[2]),
    precioPublico: parsearPrecio(precio?.[2]),
    precioTachado: parsearPrecio(precio?.[1]),
    esClub: Boolean(club),
    ventajasClub: /Con ventajas Club Nomolesten/i.test(texto),
    desayuno: /Desayuno incluido/i.test(texto),
    incluye: tarjeta.find('div.nm-inline-block').get().map((item) => limpiar($(item).text())).filter(Boolean),
  };
}

function ofertaDe(dato, pagina) {
  if (!dato.href) throw new Error('sin enlace');
  const enlace = new URL(dato.href, WEB);
  const escapada = enlace.pathname.startsWith('/escapadas/');
  const lugar = lugarDe(dato.ubicacion);
  const fechas = fechasDe(enlace.searchParams);
  const incluye = dato.incluye.filter((item) => item !== 'Habitación');
  return crearOferta({
    id: `nomolesten:${enlace.pathname.replace(/^\/|\/$/g, '')}`,
    fuente: 'nomolesten',
    tipo: escapada ? 'escapada' : 'hotel',
    titulo: escapada && dato.alojamiento ? `${sinPuntoFinal(dato.nombre)} · ${dato.alojamiento}` : dato.nombre,
    descripcion: recortar(descripcionDe(dato, incluye)),
    url: `${enlace.origin}${enlace.pathname}`,
    imagen: dato.imagen ? new URL(dato.imagen, WEB).href : null,
    ...precioDe(dato, enlace.searchParams.get('adults')),
    unidad: 'noche',
    noches: fechas.salida && fechas.vuelta ? diasEntre(fechas.salida, fechas.vuelta) : null,
    regimen: regimenDe(dato.desayuno, incluye),
    temas: pagina?.temas ?? [],
    transporte: lugar?.pais === 'España' ? 'coche' : null,
    lugar,
    fechas,
    etiquetas: [
      pagina?.etiqueta,
      dato.desayuno && 'Desayuno incluido',
      dato.esClub && 'Club Nomolesten',
      dato.ventajasClub && 'Ventajas Club Nomolesten',
      ...incluye,
    ].filter(Boolean),
  });
}

const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
const sinPuntoFinal = (texto) => texto.replace(/\.$/, '');
const euros = (valor) => `${NUMERO.format(valor)} €`;

/** «Castelló d'Empúries, Girona, Cataluña» → población, provincia y país. */
function lugarDe(ubicacion) {
  const [nombre, provincia, ultima] = ubicacion.split(',').map((parte) => parte.trim());
  if (!nombre) return null;
  const pais = PAISES_EXTRANJEROS.has(ultima) ? ultima : 'España';
  return {
    nombre,
    region: provincia || ultima || null,
    pais,
    codigoPais: pais === 'España' ? 'ES' : null,
    lat: null,
    lon: null,
    iata: null,
  };
}

/** Las tarjetas enlazan a la ficha con las fechas del precio: `?from=2026-09-18&to=2026-09-19`. */
function fechasDe(parametros) {
  const fecha = (clave) => (/^\d{4}-\d{2}-\d{2}$/.test(parametros.get(clave)) ? parametros.get(clave) : null);
  return { salida: fecha('from'), vuelta: fecha('to') };
}

/**
 * El precio es el de la habitación una noche para los adultos del enlace. Si hay
 * precio del Club Nomolesten (basta con registrarse), ese es el precio y el
 * público pasa a ser el anterior; si no, el anterior es el tachado, si lo hay.
 */
function precioDe(dato, adultos) {
  const para = adultos ? ` para ${adultos} adultos` : '';
  const anterior = dato.esClub ? dato.precioPublico : dato.precioTachado;
  const precioAnterior = anterior > dato.precio ? anterior : null;
  const detalle = dato.esClub && precioAnterior ? ` con el Club Nomolesten (${euros(precioAnterior)} sin él)` : '';
  return {
    precio: dato.precio,
    precioTexto: `${euros(dato.precio)} la noche${para}${detalle}`,
    precioAnterior,
    descuento: precioAnterior ? Math.round((1 - dato.precio / precioAnterior) * 100) : null,
  };
}

function regimenDe(desayuno, incluye) {
  if (!desayuno) return null;
  return incluye.some((item) => /\b(cena|comida)\b/i.test(item)) ? 'media-pension' : 'desayuno';
}

function descripcionDe(dato, incluye) {
  const partes = [];
  if (dato.ubicacion) {
    partes.push(dato.alojamiento ? `En ${dato.alojamiento}, ${dato.ubicacion}.` : `Hotel con encanto en ${dato.ubicacion}.`);
  }
  if (incluye.length) partes.push(`Incluye: ${incluye.join(', ')}.`);
  if (dato.desayuno) partes.push('Desayuno incluido.');
  if (/^\d+(\.\d+)?$/.test(dato.valoracion)) {
    const opiniones = /^\d+$/.test(dato.opiniones) ? ` (${dato.opiniones} opiniones)` : '';
    partes.push(`Valoración ${dato.valoracion.replace('.', ',')}/10${opiniones}.`);
  }
  return partes.join(' ');
}

/** Une las ofertas con la misma URL: se queda la primera con los temas y etiquetas de todas. */
function unirRepetidas(ofertas) {
  const porUrl = new Map();
  for (const oferta of ofertas) {
    const previa = porUrl.get(oferta.url);
    porUrl.set(oferta.url, previa
      ? {
        ...previa,
        temas: [...new Set([...previa.temas, ...oferta.temas])],
        etiquetas: [...new Set([...previa.etiquetas, ...oferta.etiquetas])],
      }
      : oferta);
  }
  return [...porUrl.values()];
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

async function leerPagina(pagina, ctx) {
  const url = `${WEB}${pagina.ruta}`;
  const html = await ctx.http.texto(url);
  const ofertas = parsear(html, ctx, { tema: pagina.tema });
  if (!ofertas.length) {
    if (DESAFIO.test(html)) throw Object.assign(new Error('Nomolesten ha devuelto un desafío anti-bot'), { bloqueo: true });
    ctx.log(`${url}: ninguna tarjeta con precio`);
  }
  return ofertas;
}

async function obtener(ctx) {
  const ofertas = [];
  let leidas = 0;
  let ultimoError = null;
  for (const [i, pagina] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      ofertas.push(...await leerPagina(pagina, ctx));
      leidas++;
    } catch (error) {
      ultimoError = error;
      ctx.log(`${WEB}${pagina.ruta}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Nomolesten ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!leidas) throw new Error(`No se ha podido leer ninguna página de Nomolesten (último error: ${ultimoError.message})`);
  if (!ofertas.length) throw new Error('Nomolesten no muestra ningún hotel con precio (¿ha cambiado la página?)');
  return { ofertas: unirRepetidas(ofertas), reemplazar: leidas === PAGINAS.length };
}

export default {
  id: 'nomolesten',
  nombre: 'Nomolesten',
  web: WEB,
  modo: 'html',
  requiere: [],
  urls: PAGINAS.map((pagina) => `${WEB}${pagina.ruta}`),
  obtener,
};
