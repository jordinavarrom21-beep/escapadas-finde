/**
 * Ferryhopper: comparador de ferris del Mediterráneo. Se leen las páginas de las
 * seis rutas directas que salen del puerto de Barcelona (Ibiza, Mallorca, Menorca,
 * Formentera, Cerdeña y Civitavecchia). Cada página trae, ya en el HTML que sirve
 * el servidor, una tabla por compañía con la frecuencia, la duración y el precio
 * «desde» del mes en curso. Una misma página puede cubrir dos puertos del mismo
 * destino (Palma y Alcúdia, Mahón y Ciutadella) y las dos direcciones del trayecto:
 * solo interesan las que salen de Barcelona.
 *
 * El precio es el «billete desde» que anuncia Ferryhopper para esa compañía y ese
 * mes: la tarifa más barata de un pasajero sin vehículo, **por persona y trayecto
 * (solo ida)**. El catálogo de `UNIDADES` no tiene un valor para «por persona y
 * trayecto», así que `unidad` se queda en null y la unidad se explica en
 * `precioTexto`, igual que hace OUIGO con sus promociones.
 */
import * as cheerio from 'cheerio';
import { crearOferta } from '../modelo.js';
import { parsearPrecio } from '../util/precio.js';
import { normalizarTexto, recortar } from '../util/xml.js';

const ID = 'ferryhopper';
const WEB = 'https://www.ferryhopper.com';
const RUTAS = `${WEB}/es/ferry-routes/direct`;
/** Código del puerto de Barcelona en Ferryhopper. */
const ORIGEN = 'BRC';
const PAUSA_MS = 2000;

/** Una página por destino: seis peticiones por ejecución. */
const PAGINAS = [
  `${RUTAS}/ferry-barcelona-ibiza`,
  `${RUTAS}/ferry-barcelona-mallorca`,
  `${RUTAS}/ferry-barcelona-menorca`,
  `${RUTAS}/ferry-barcelona-formentera`,
  `${RUTAS}/barcelona-porto-torres`,
  `${RUTAS}/barcelona-civitavecchia`,
];

/** Puertos de destino que sirven estas rutas, con sus coordenadas. */
const DESTINOS = {
  IBZ: { nombre: 'Ibiza', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 38.9067, lon: 1.4206 },
  PAL: { nombre: 'Palma de Mallorca', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 39.5696, lon: 2.6502 },
  ALC: { nombre: 'Alcúdia', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 39.8522, lon: 3.1213 },
  MAH: { nombre: 'Mahón', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 39.8885, lon: 4.2658 },
  CIU: { nombre: 'Ciutadella de Menorca', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 40.0028, lon: 3.8416 },
  FOR: { nombre: 'Formentera', region: 'Islas Baleares', pais: 'España', codigoPais: 'ES', lat: 38.7317, lon: 1.4082 },
  PTO: { nombre: 'Porto Torres', region: 'Cerdeña', pais: 'Italia', codigoPais: 'IT', lat: 40.8375, lon: 8.403 },
  CIV: { nombre: 'Civitavecchia', region: 'Lacio', pais: 'Italia', codigoPais: 'IT', lat: 42.0925, lon: 11.7955 },
};

const DESAFIO = /cf-chl|challenge-platform|just a moment|attention required|captcha|datadome|awswaf|access denied/i;
const EUROS = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const euros = (valor) => `${EUROS.format(valor)} €`;
const limpiar = (texto = '') => texto.replace(/\s+/g, ' ').trim();
/** «Grandi Navi Veloci» → «grandi-navi-veloci»: la parte de compañía del id. */
const slug = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Travesías con origen Barcelona que publica una página de ruta: una por compañía
 * y puerto de destino, con el precio «desde» del mes en curso.
 * Devuelve null si la página no trae la tabla de compañías.
 * @param {string} html
 * @returns {{destino: {codigo: string, nombre: string}, mes: string, anio: string,
 *            compania: string, companiaId: string, frecuencia: string, duracion: string,
 *            precio: number|null, url: string, imagen: string|null}[] | null}
 */
export function travesias(html) {
  const $ = cheerio.load(html);
  const widget = $('.operators-widget').first();
  if (!widget.length) return null;
  const mes = widget.attr('data-month-index');
  const anio = widget.attr('data-current-year');
  const pagina = {
    url: $('link[rel="canonical"]').attr('href') ?? '',
    imagen: $('meta[property="og:image"]').attr('content') ?? null,
    mes: limpiar(widget.find(`[data-dropdown="month"] [data-index="${mes}"]`).first().attr('data-label') ?? ''),
    anio,
  };
  return widget
    .find('[data-dropdown="route"] .operators-widget__dropdown-option')
    .get()
    .filter((opcion) => $(opcion).attr('data-origin-code') === ORIGEN)
    .flatMap((opcion) => {
      const destino = { codigo: $(opcion).attr('data-dest-code') ?? '', nombre: limpiar($(opcion).attr('data-dest-name') ?? '') };
      const tabla = widget.find(`.operators-widget__body[data-route="${$(opcion).attr('data-index')}"][data-month="${mes}"][data-year="${anio}"]`);
      return tabla.find('.operators-widget__table-row').get().map((fila) => ({ ...pagina, destino, ...datosFila($, fila) }));
    });
}

function datosFila($, fila) {
  const $fila = $(fila);
  const compania = limpiar($fila.find('.operators-widget__col-operator span').first().text());
  return {
    compania,
    companiaId: slug(compania),
    frecuencia: limpiar($fila.find('.operators-widget__col-freq').text()),
    duracion: limpiar($fila.find('.operators-widget__col-dur').text()),
    precio: parsearPrecio(limpiar($fila.find('.operators-widget__price-text--tablet').first().text()).replace(/^desde/i, '')),
  };
}

/**
 * Ofertas de una página de ruta de Ferryhopper, o null si no trae la tabla de
 * compañías (desafío anti-bot o cambio de la web).
 * @param {string} html
 * @param {{log?: (mensaje: string) => void}} [ctx]
 * @returns {import('../modelo.js').Oferta[] | null}
 */
export function parsear(html, ctx = {}) {
  const log = ctx.log ?? (() => {});
  const lista = travesias(html);
  if (!lista) return null;
  return lista.flatMap((travesia) => {
    try {
      return [ofertaDe(travesia)];
    } catch (error) {
      log(`Travesía descartada (${travesia.destino.nombre} / ${travesia.compania}): ${error.message}`);
      return [];
    }
  });
}

function ofertaDe(t) {
  if (!t.destino.codigo || !t.companiaId || t.precio == null) throw new Error('faltan el destino, la compañía o el precio');
  const lugar = DESTINOS[t.destino.codigo];
  const cuando = t.mes ? `, precio orientativo de ${t.mes.toLowerCase()} de ${t.anio}` : '';
  return crearOferta({
    id: `${ID}:${ORIGEN}-${t.destino.codigo}:${t.companiaId}`.toLowerCase(),
    fuente: ID,
    tipo: 'escapada',
    titulo: `Ferry Barcelona – ${lugar?.nombre ?? t.destino.nombre} con ${t.compania} desde ${euros(t.precio)}`,
    descripcion: recortar(
      `Travesía directa de Barcelona a ${t.destino.nombre} con ${t.compania}: ${t.duracion}, ${t.frecuencia.toLowerCase()}. `
      + `Billete desde ${euros(t.precio)} por persona y trayecto (solo ida)${cuando}.`,
    ),
    url: t.url,
    imagen: t.imagen,
    precio: t.precio,
    precioTexto: `desde ${euros(t.precio)} por persona y trayecto (solo ida)`,
    unidad: null,
    transporte: 'ferry',
    lugar: { ...(lugar ?? { nombre: t.destino.nombre, region: null, pais: null, codigoPais: null, lat: null, lon: null }), iata: null },
    etiquetas: [t.compania, 'Travesía directa', t.frecuencia, `Duración ${t.duracion}`].filter(Boolean),
  });
}

const esBloqueo = (error) => error.bloqueo || error.estado === 403 || error.estado === 429;

function leerPagina(html) {
  const ofertas = parsear(html);
  if (ofertas) return ofertas;
  if (DESAFIO.test(html)) throw Object.assign(new Error('Ferryhopper ha devuelto un desafío anti-bot'), { bloqueo: true });
  throw new Error('la página no trae la tabla de compañías (¿ha cambiado la web?)');
}

/**
 * Pide las seis páginas de ruta con 2 s de pausa. Solo se da por caducado lo de
 * las páginas que se han leído bien: si una falla, sus ofertas anteriores siguen.
 */
async function obtener(ctx) {
  const ofertas = [];
  const leidas = new Set();
  let ultimoError = null;
  for (const [i, url] of PAGINAS.entries()) {
    if (i) await ctx.http.esperar(PAUSA_MS);
    try {
      const html = await ctx.http.texto(url, { reintentos: 0 });
      for (const oferta of leerPagina(html)) {
        ofertas.push(oferta);
        leidas.add(oferta.url);
      }
    } catch (error) {
      ultimoError = error;
      ctx.log(`${url}: ${error.message}`);
      if (esBloqueo(error)) {
        ctx.log('Ferryhopper ha bloqueado o limitado las peticiones: no se piden más páginas en esta ejecución');
        break;
      }
    }
  }
  if (!ofertas.length) throw new Error(`No se ha podido leer ninguna ruta de Ferryhopper (último error: ${ultimoError?.message ?? 'sin travesías'})`);
  return { ofertas, reemplazar: (oferta) => leidas.has(oferta.url) };
}

export default {
  id: ID,
  nombre: 'Ferryhopper',
  web: `${WEB}/es/`,
  modo: 'html',
  requiere: [],
  urls: PAGINAS,
  obtener,
};
