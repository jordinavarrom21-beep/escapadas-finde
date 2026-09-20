/**
 * Preferencias de este navegador (favoritos, descartadas, búsquedas guardadas,
 * última visita y modo de color).
 * El almacenamiento puede no estar disponible (modo privado, bloqueos): se ignora.
 */

const CLAVE_FAVORITOS = 'escapadas:favoritos';
const CLAVE_DESCARTADAS = 'escapadas:descartadas';
const CLAVE_BUSQUEDAS = 'escapadas:busquedas';
const MAX_BUSQUEDAS = 12;
const CLAVE_VISITA = 'escapadas:ultimaVisita';
const CLAVE_REFERENCIA = 'escapadas:referenciaSesion';
const CLAVE_TEMA = 'escapadas:tema';

function leer(almacen, clave) {
  try {
    return almacen().getItem(clave);
  } catch {
    return null;
  }
}

function escribir(almacen, clave, valor) {
  try {
    almacen().setItem(clave, valor);
  } catch {
    // Sin almacenamiento: la preferencia solo dura esta sesión.
  }
}

const local = () => localStorage;
const sesion = () => sessionStorage;

function leerJson(clave, porDefecto) {
  try {
    const valor = JSON.parse(leer(local, clave) ?? 'null');
    return valor ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function cargarIds(clave) {
  const ids = leerJson(clave, []);
  return new Set(Array.isArray(ids) ? ids : []);
}
const guardarIds = (clave, ids) => escribir(local, clave, JSON.stringify([...ids]));

export const cargarFavoritos = () => cargarIds(CLAVE_FAVORITOS);
export const guardarFavoritos = (favoritos) => guardarIds(CLAVE_FAVORITOS, favoritos);

/** Ofertas que se han ocultado con el botón ✕. */
export const cargarDescartadas = () => cargarIds(CLAVE_DESCARTADAS);
export const guardarDescartadas = (descartadas) => guardarIds(CLAVE_DESCARTADAS, descartadas);

/** Búsquedas guardadas: [{nombre, vista, hash}], la última primero. */
export function cargarBusquedas() {
  const lista = leerJson(CLAVE_BUSQUEDAS, []);
  return Array.isArray(lista) ? lista.filter((b) => b?.nombre && b?.hash) : [];
}

/** Guarda (o reemplaza si se repite el nombre) y devuelve la lista actualizada. */
export function guardarBusqueda({ nombre, vista, hash }) {
  const lista = [{ nombre, vista, hash }, ...cargarBusquedas().filter((b) => b.nombre !== nombre)].slice(0, MAX_BUSQUEDAS);
  escribir(local, CLAVE_BUSQUEDAS, JSON.stringify(lista));
  return lista;
}

export function borrarBusqueda(nombre) {
  const lista = cargarBusquedas().filter((b) => b.nombre !== nombre);
  escribir(local, CLAVE_BUSQUEDAS, JSON.stringify(lista));
  return lista;
}

/**
 * Fecha de la visita anterior (ISO o null) y registra la actual. Dentro de la misma
 * sesión devuelve siempre la misma, para que recargar no borre las novedades.
 */
export function tomarVisitaAnterior(ahora = new Date()) {
  const deSesion = leer(sesion, CLAVE_REFERENCIA);
  if (deSesion !== null) return deSesion || null;
  const anterior = leer(local, CLAVE_VISITA);
  escribir(sesion, CLAVE_REFERENCIA, anterior ?? '');
  escribir(local, CLAVE_VISITA, ahora.toISOString());
  return anterior;
}

/** 'claro', 'oscuro' o null (seguir al sistema). */
export const temaGuardado = () => leer(local, CLAVE_TEMA);
export const guardarTema = (tema) => escribir(local, CLAVE_TEMA, tema);
