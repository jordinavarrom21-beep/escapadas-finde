/**
 * Enlaces de afiliado y ofertas patrocinadas (config/afiliacion.json). Solo se añade un
 * identificador de un proveedor activo, aprobado y con todos sus parámetros; si no, los
 * enlaces quedan como estaban. Nada de esto cambia la puntuación ni el orden.
 */
import { cargarJson } from './almacen.js';

const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';

/**
 * Proveedores que de verdad pueden marcar enlaces: activos, aprobados y con todos sus
 * parámetros. Avisa (log) de los que están a medias, para no creer que funcionan.
 */
export function proveedoresActivos(config = {}, log = () => {}) {
  const activos = [];
  for (const [id, p] of Object.entries(config.proveedores ?? {})) {
    if (!p?.activo) continue;
    const parametros = Object.entries(p.parametros ?? {});
    const falta = [
      !p.aprobado && 'aprobado: true (la cuenta de afiliado aprobada)',
      !(p.dominios ?? []).length && 'dominios',
      (!parametros.length || parametros.some(([, v]) => !esTexto(v))) && 'los valores de parametros',
    ].filter(Boolean);
    if (falta.length) log(`Afiliación de ${id} activa pero sin ${falta.join(', ')}: sus enlaces quedan normales`);
    else activos.push({ id, dominios: p.dominios, parametros: Object.fromEntries(parametros) });
  }
  return activos;
}

/** Carga config/afiliacion.json; si no existe o está roto, sin afiliación (y se avisa). */
export function cargarAfiliacion(ruta, log = console.warn) {
  try {
    return cargarJson(ruta, {});
  } catch (error) {
    log(`⚠️  ${ruta} no se puede leer (${error.message}): sin enlaces de afiliado`);
    return {};
  }
}

const deDominio = (url, dominios) => {
  try {
    const host = new URL(url).hostname;
    return dominios.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

/**
 * La URL con los parámetros del proveedor (se conservan los que ya tuviera) y a quién
 * corresponde, o la misma URL y null si no es de ningún proveedor activo.
 */
export function conAfiliacion(url, activos) {
  const proveedor = activos.find((p) => deDominio(url, p.dominios));
  if (!proveedor) return { url, afiliado: null };
  const nueva = new URL(url);
  for (const [clave, valor] of Object.entries(proveedor.parametros)) nueva.searchParams.set(clave, valor);
  return { url: nueva.href, afiliado: proveedor.id };
}

/**
 * Rellena `urlReserva` (la de `url` con el identificador, si toca), `afiliado` (proveedor o
 * null) y `patrocinada` ({anunciante} o null), y marca los enlaces extra. `url` se queda
 * limpia: con ella se reconocen las ofertas, los duplicados y el historial.
 */
export function aplicarAfiliacion(oferta, { activos = [], patrocinadas = [], ahora = new Date() } = {}) {
  const { url, afiliado } = conAfiliacion(oferta.url, activos);
  oferta.urlReserva = url;
  oferta.afiliado = afiliado;
  oferta.enlaces = oferta.enlaces.map((enlace) => {
    const marcado = conAfiliacion(enlace.url, activos);
    return { ...enlace, url: marcado.url, afiliado: marcado.afiliado };
  });
  const pago = patrocinadas.find((p) => p?.ofertaId === oferta.id && (!p.hasta || p.hasta >= ahora.toISOString().slice(0, 10)));
  oferta.patrocinada = pago && esTexto(pago.anunciante) ? { anunciante: pago.anunciante.trim() } : null;
  return oferta;
}
