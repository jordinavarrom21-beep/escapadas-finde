/**
 * Enlaces de afiliado y ofertas patrocinadas (config/afiliacion.json). Solo se añade un
 * identificador de un proveedor activo, aprobado y con todos sus parámetros; si no, los
 * enlaces quedan como estaban. Nada de esto cambia la puntuación ni el orden.
 */
import { cargarJson } from './almacen.js';

const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';
/**
 * Redes de afiliación (Awin, TradeTracker…) que no añaden un parámetro sino que envuelven el
 * enlace en el suyo: «https://www.awin1.com/cread.php?awinmid=…&awinaffid=…&ued={url}».
 */
const esEnvoltura = (valor) => esTexto(valor) && /^https:\/\/[^\s]+\{url\}/.test(valor.trim());

const esNumero = (valor) => /^\d+$/.test(String(valor ?? '').trim());

/**
 * Con Awin basta con el número de cada anunciante («awinmid»): el enlace profundo se arma
 * con tu número de afiliado de «redes.awin.afiliado». Si falta alguno, null.
 */
export function envolturaAwin(config, p) {
  const afiliado = config.redes?.awin?.afiliado;
  if (!esNumero(p?.awinmid) || !esNumero(afiliado)) return null;
  return `https://www.awin1.com/cread.php?awinmid=${String(p.awinmid).trim()}&awinaffid=${String(afiliado).trim()}&ued={url}`;
}

/**
 * Proveedores que de verdad pueden marcar enlaces: activos, aprobados y con todos sus
 * parámetros. Avisa (log) de los que están a medias, para no creer que funcionan.
 */
export function proveedoresActivos(config = {}, log = () => {}) {
  const activos = [];
  for (const [id, original] of Object.entries(config.proveedores ?? {})) {
    if (!original?.activo) continue;
    // Un anunciante de Awin con su «awinmid» (y sin envoltura escrita a mano): la de Awin.
    const awin = !esTexto(original.envoltura) && original.awinmid != null && original.awinmid !== '';
    const p = awin ? { ...original, envoltura: envolturaAwin(config, original) ?? 'falta-awin' } : original;
    const parametros = Object.entries(p.parametros ?? {});
    const envoltura = p.envoltura != null && p.envoltura !== '';
    const falta = [
      !p.aprobado && 'aprobado: true (la cuenta de afiliado aprobada)',
      !(p.dominios ?? []).length && 'dominios',
      envoltura
        ? !esEnvoltura(p.envoltura) && (awin ? 'el número de anunciante (awinmid) y tu número de afiliado (redes.awin.afiliado)' : 'una envoltura https con {url}')
        : (!parametros.length || parametros.some(([, v]) => !esTexto(v))) && 'los valores de parametros',
    ].filter(Boolean);
    if (falta.length) log(`Afiliación de ${id} activa pero sin ${falta.join(', ')}: sus enlaces quedan normales`);
    else if (envoltura) activos.push({ id, dominios: p.dominios, envoltura: p.envoltura.trim() });
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
  if (proveedor.envoltura) return { url: proveedor.envoltura.replace('{url}', encodeURIComponent(url)), afiliado: proveedor.id };
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
