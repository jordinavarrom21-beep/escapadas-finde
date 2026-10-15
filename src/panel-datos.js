/**
 * Datos del panel en dos archivos para que la primera carga sea ligera:
 *  - ofertas.json: todo lo que usan las tarjetas, los filtros y el mapa;
 *  - detalles.json: lo que solo se ve al abrir una ficha (los enlaces de «Organiza el
 *    viaje» y «Comparar precios», la descripción de la web, los eventos de la zona enteros y
 *    los precios de Google Hoteles), `{id: {enlaces, eventos, descripcion, preciosGoogle}}`.
 *    De los eventos, en ofertas.json se queda lo que usan la tarjeta, la portada y el filtro «¿Algo
 *    que hacer cerca?» (nombre, tipo, km, fecha y municipio): sin eso no salían hasta abrir una ficha.
 *    Cada evento va una sola vez (`eventos`, arriba) y cada oferta lleva dónde está en esa lista y a
 *    cuántos km (`eventosCerca`: [[posición, km], …]): el mismo concierto sale cerca de muchas
 *    ofertas y, repetido en cada una, era la quinta parte del archivo (unos 70 KB de 490
 *    comprimido). El panel los vuelve a juntar al cargar (site/js/filtros.js: juntarEventos).
 * Y version.json, con la fecha del escaneo, para mirar si hay datos nuevos sin bajarlos.
 */
import { deWebDeChollos } from './fuentes/chollos.js';

/**
 * Campos que solo usa la ficha (la descripción, ~200 KB, solo se lee en ella; los precios de
 * Google Hoteles, en «Comparar precios»).
 */
export const CAMPOS_DETALLE = ['enlaces', 'eventos', 'descripcion', 'preciosGoogle'];
/** Con algo que enseñar: una lista o un texto no vacíos, o un objeto. */
const conValor = (valor) => (Array.isArray(valor) || typeof valor === 'string' ? valor.length > 0 : valor != null);
/**
 * Lo de cada evento que se queda en ofertas.json (la ficha recibe el resto al abrirse), sin los
 * km: esos van en cada oferta, que es de lo que dependen.
 */
const EVENTO_LIGERO = ['nombre', 'tipo', 'fecha', 'municipio'];
const eventoLigero = (ev) => Object.fromEntries(EVENTO_LIGERO.filter((campo) => ev[campo] != null).map((campo) => [campo, ev[campo]]));

/**
 * Sin los campos vacíos (null), también dentro de lugar, fechas, vuelo…: eran una cuarta parte del
 * archivo y el panel los trata igual que si no estuvieran (`?.` y `??`). Las listas se dejan como
 * están (vacías incluidas).
 */
export function sinNulos(valor) {
  if (Array.isArray(valor)) return valor.map(sinNulos);
  if (!valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.entries(valor).filter(([, x]) => x != null).map(([clave, x]) => [clave, sinNulos(x)]));
}

/**
 * @param {{generado: string, ofertas: object[]}} datos lo que era ofertas.json
 * @returns {{ofertas: object, detalles: Record<string, object>, version: {generado: string}}}
 */
export function separarDatosPanel(datos) {
  const detalles = {};
  // Cada evento, una vez: su posición en `eventos` (los mismos datos, el mismo evento).
  const eventos = [];
  const posiciones = new Map();
  const posicion = (ev) => {
    const ligero = eventoLigero(ev);
    const clave = JSON.stringify(ligero);
    if (!posiciones.has(clave)) {
      posiciones.set(clave, eventos.length);
      eventos.push(ligero);
    }
    return posiciones.get(clave);
  };
  const ofertas = datos.ofertas.map((oferta) => {
    // Lo que dio su web antes de enriquecer, las marcas del texto que no se guarda (almacen.js) y
    // el título sin limpiar: el panel no los usa.
    const { deLaFuente: _f, textoRetirado: _r, huellaTexto: _h, tituloOriginal: _t, ...ligera } = oferta;
    // De las webs de chollos, solo título, precio y enlace (src/fuentes/chollos.js): su texto no
    // va ni a la ficha.
    if (deWebDeChollos(ligera)) {
      delete ligera.descripcion;
      delete ligera.resumen;
      if (Array.isArray(ligera.etiquetas)) ligera.etiquetas = ligera.etiquetas.filter((e) => e !== 'top-chollo');
    }
    const detalle = {};
    for (const campo of CAMPOS_DETALLE) {
      if (conValor(ligera[campo])) detalle[campo] = ligera[campo];
      delete ligera[campo];
    }
    if (detalle.eventos) ligera.eventosCerca = detalle.eventos.map((ev) => (ev.km == null ? [posicion(ev)] : [posicion(ev), ev.km]));
    // El enlace de reserva solo si no es el mismo de la oferta (el panel usa urlReserva ?? url).
    if (ligera.urlReserva === ligera.url) delete ligera.urlReserva;
    if (Object.keys(detalle).length) detalles[oferta.id] = detalle;
    return sinNulos(ligera);
  });
  return { ofertas: { ...datos, ...(eventos.length ? { eventos } : {}), ofertas }, detalles, version: { generado: datos.generado } };
}
