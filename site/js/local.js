/**
 * Preferencias de este navegador (favoritos, descartadas, búsquedas guardadas,
 * última visita, modo de color, salida, viajeros y noches).
 * El almacenamiento puede no estar disponible (modo privado, bloqueos): se ignora.
 */

const CLAVE_FAVORITOS = 'escapadas:favoritos';
const CLAVE_DESCARTADAS = 'escapadas:descartadas';
const CLAVE_BUSQUEDAS = 'escapadas:busquedas';
const MAX_BUSQUEDAS = 12;
const CLAVE_VISITA = 'escapadas:ultimaVisita';
const CLAVE_REFERENCIA = 'escapadas:referenciaSesion';
const CLAVE_TEMA = 'escapadas:tema';
const CLAVE_FILTROS = 'escapadas:filtros';
const CLAVE_SALIDA = 'escapadas:salida';
const CLAVE_VIAJE = 'escapadas:viaje';
const CLAVE_COMPARAR = 'escapadas:comparar';
const CLAVE_MIS_ESTADOS = 'escapadas:misEstados';
const CLAVE_MODO_LISTA = 'escapadas:modoLista';

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

/**
 * Búsquedas guardadas: [{nombre, vista, hash, visto}], la última primero. `visto` (ISO) es
 * cuándo se miró por última vez: lo que aparece después cuenta como nuevo en «Mis cosas».
 */
export function cargarBusquedas() {
  const lista = leerJson(CLAVE_BUSQUEDAS, []);
  return Array.isArray(lista)
    // Solo enlaces del propio panel («#/…»): una copia importada podría traer cualquier cosa.
    ? lista.filter((b) => typeof b?.nombre === 'string' && b.nombre && typeof b?.hash === 'string' && b.hash.startsWith('#/')).map((b) => ({ ...b, visto: typeof b.visto === 'string' ? b.visto : null }))
    : [];
}

/** Guarda (o reemplaza si se repite el nombre) y devuelve la lista actualizada. */
export function guardarBusqueda({ nombre, vista, hash }, ahora = new Date()) {
  const lista = [{ nombre, vista, hash, visto: ahora.toISOString() }, ...cargarBusquedas().filter((b) => b.nombre !== nombre)].slice(0, MAX_BUSQUEDAS);
  escribir(local, CLAVE_BUSQUEDAS, JSON.stringify(lista));
  return lista;
}

/** Al abrirla desde «Mis cosas»: lo que cumple a partir de ahora es lo nuevo. */
export function marcarBusquedaVista(nombre, ahora = new Date()) {
  const lista = cargarBusquedas().map((b) => (b.nombre === nombre ? { ...b, visto: ahora.toISOString() } : b));
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

/**
 * Últimos filtros usados en cada vista ({escapadas: {temas: 'spa'}, …}), para
 * recuperarlos al volver. Solo se aceptan textos: lo guardado lo pudo tocar cualquiera.
 */
export function cargarFiltros(vista) {
  const todos = leerJson(CLAVE_FILTROS, {});
  const params = todos && typeof todos === 'object' ? todos[vista] : null;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const limpios = Object.fromEntries(Object.entries(params).filter(([clave, valor]) => typeof valor === 'string' && valor && clave));
  return Object.keys(limpios).length ? limpios : null;
}

/** Guarda los filtros de `vista`; sin filtros, olvida los que hubiera. */
export function guardarFiltros(vista, params = {}) {
  const todos = leerJson(CLAVE_FILTROS, {});
  const actuales = todos && typeof todos === 'object' && !Array.isArray(todos) ? todos : {};
  if (Object.keys(params).length) actuales[vista] = params;
  else delete actuales[vista];
  escribir(local, CLAVE_FILTROS, JSON.stringify(actuales));
}

/** Desde dónde sales ({nombre, lat, lon}) o null: sin validar (lo hace viaje.js). */
export const cargarSalida = () => leerJson(CLAVE_SALIDA, null);
export const guardarSalida = (salida) => escribir(local, CLAVE_SALIDA, JSON.stringify(salida));

/** Viajeros y noches ({viajeros, noches}) o null: sin validar (lo hace viaje.js). */
export const cargarViaje = () => leerJson(CLAVE_VIAJE, null);
export const guardarViaje = (viaje) => escribir(local, CLAVE_VIAJE, JSON.stringify(viaje));

/** Lo que has marcado en cada oferta: 'reservada' o 'no-disponible' ({id: estado}). */
export const ESTADOS_MIOS = ['reservada', 'no-disponible'];
export function cargarMisEstados() {
  const mapa = leerJson(CLAVE_MIS_ESTADOS, {});
  const entradas = mapa && typeof mapa === 'object' && !Array.isArray(mapa) ? Object.entries(mapa) : [];
  return new Map(entradas.filter(([id, estado]) => typeof id === 'string' && ESTADOS_MIOS.includes(estado)));
}
export const guardarMisEstados = (mapa) => escribir(local, CLAVE_MIS_ESTADOS, JSON.stringify(Object.fromEntries(mapa)));

/** Ofertas elegidas para comparar (como mucho MAX_COMPARAR). */
export const MAX_COMPARAR = 3;
export function cargarComparar() {
  const ids = leerJson(CLAVE_COMPARAR, []);
  return new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string').slice(0, MAX_COMPARAR));
}
export const guardarComparar = (ids) => guardarIds(CLAVE_COMPARAR, ids);

/** 'claro', 'oscuro' o null (seguir al sistema). */
export const temaGuardado = () => leer(local, CLAVE_TEMA);
export const guardarTema = (tema) => escribir(local, CLAVE_TEMA, tema);

/** «lista» o «tarjetas»: cómo se ven los resultados (tema.js lo aplica antes de pintar). */
export const guardarModoLista = (modo) => escribir(local, CLAVE_MODO_LISTA, modo);

// Modo propietario: las herramientas de quien administra la web (avisos por email en
// config/vigilados.json de GitHub). Se activa una vez con «?propietario=1» y se recuerda aquí.
const CLAVE_PROPIETARIO = 'escapadas:propietario';
export const esPropietarioGuardado = () => leer(local, CLAVE_PROPIETARIO) === '1';
export const guardarPropietario = (si) => escribir(local, CLAVE_PROPIETARIO, si ? '1' : '0');

// La bienvenida de la primera visita: una vez cerrada, no vuelve a salir.
const CLAVE_BIENVENIDA = 'escapadas:bienvenida';
export const bienvenidaVista = () => leer(local, CLAVE_BIENVENIDA) === '1';
export const marcarBienvenidaVista = () => escribir(local, CLAVE_BIENVENIDA, '1');

// Copia de seguridad sin cuenta: lo guardado se descarga en un archivo y se carga en otro
// navegador o dispositivo. Solo estas claves (ni la última visita ni el modo propietario).
const CLAVES_COPIA = [CLAVE_FAVORITOS, CLAVE_DESCARTADAS, CLAVE_BUSQUEDAS, CLAVE_FILTROS, CLAVE_SALIDA, CLAVE_VIAJE, CLAVE_COMPARAR, CLAVE_MIS_ESTADOS, CLAVE_TEMA, CLAVE_MODO_LISTA];
const FORMATO_COPIA = 'escapadas-finde/guardados';

/** Todo lo guardado en este navegador, listo para descargar como JSON. */
export function exportarGuardados(ahora = new Date()) {
  const datos = {};
  for (const clave of CLAVES_COPIA) {
    const valor = leer(local, clave);
    if (valor !== null) datos[clave] = valor;
  }
  return { formato: FORMATO_COPIA, version: 1, exportado: ahora.toISOString(), datos };
}

/**
 * Carga una copia (lo que devuelve exportarGuardados) y sustituye lo de este navegador.
 * Solo acepta las claves conocidas y textos: un archivo cualquiera no puede escribir otra
 * cosa. Devuelve cuántas claves ha cargado; lanza un error si el archivo no es una copia.
 */
export function importarGuardados(copia) {
  if (copia?.formato !== FORMATO_COPIA || !copia.datos || typeof copia.datos !== 'object') {
    throw new Error('El archivo no es una copia de «Guardados» de Escapadas Finde');
  }
  let cargadas = 0;
  for (const clave of CLAVES_COPIA) {
    const valor = copia.datos[clave];
    if (typeof valor !== 'string') continue;
    escribir(local, clave, valor);
    cargadas += 1;
  }
  return cargadas;
}

// ── Rutas por carretera desde tu salida (rutas.js) ───────────────────────────

const CLAVE_RUTAS = 'escapadas:rutas';
/** Las rutas no cambian, pero las carreteras sí, de vez en cuando: se renuevan al mes. */
const CADUCIDAD_RUTAS_MS = 30 * 86_400_000;

/** Rutas guardadas desde la salida de clave `desde` (Map destino → {min, km}); vacío si son de otra salida o viejas. */
export function cargarRutas(desde, ahora = new Date()) {
  const guardado = leerJson(CLAVE_RUTAS, null);
  if (!guardado || guardado.desde !== desde || !(ahora.getTime() - Date.parse(guardado.fecha) < CADUCIDAD_RUTAS_MS)) return new Map();
  const valida = ([, r]) => Number.isFinite(r?.min) && Number.isFinite(r?.km);
  return new Map(Object.entries(guardado.rutas ?? {}).filter(valida));
}

/** Guarda las rutas de una sola salida (la tuya): al cambiarla se sustituyen. */
export function guardarRutas(desde, rutas, ahora = new Date()) {
  escribir(local, CLAVE_RUTAS, JSON.stringify({ desde, fecha: ahora.toISOString(), rutas: Object.fromEntries(rutas) }));
}
