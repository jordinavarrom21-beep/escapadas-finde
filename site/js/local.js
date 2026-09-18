/**
 * Preferencias de este navegador (favoritos, última visita y modo de color).
 * El almacenamiento puede no estar disponible (modo privado, bloqueos): se ignora.
 */

const CLAVE_FAVORITOS = 'escapadas:favoritos';
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

export function cargarFavoritos() {
  try {
    const ids = JSON.parse(leer(local, CLAVE_FAVORITOS) ?? '[]');
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function guardarFavoritos(favoritos) {
  escribir(local, CLAVE_FAVORITOS, JSON.stringify([...favoritos]));
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
