/**
 * Estado persistente entre ejecuciones (data/estado.json): ofertas vistas, estado
 * de cada fuente y control de emails enviados. Formato y campos en docs/CONTRATOS.md.
 */
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fechaLocal } from './util/fechas.js';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Versión del formato de `data/estado.json`: súbela al cambiar la estructura y añade su migración. */
export const VERSION_ESTADO = 1;

const esObjeto = (valor) => typeof valor === 'object' && valor !== null && !Array.isArray(valor);

export function estadoInicial() {
  return {
    version: VERSION_ESTADO,
    ofertas: {},
    fuentes: {},
    emails: {
      inicializado: false,
      resumenEnviado: null,
      alertados: {},
      enviosHoy: { fecha: null, n: 0 },
      vigilados: {},
      fuentesCaidas: {},
    },
  };
}

/**
 * Migraciones del estado, indexadas por la versión a la que llevan: cada una recibe
 * el estado de la versión anterior y devuelve el de la suya. Hoy solo existe la
 * versión 1 (la inicial), así que no hay ninguna. Ejemplo de cómo se añadiría la 2 si
 * `emails.alertados` pasara de guardar una fecha a guardar un objeto:
 *
 * const MIGRACIONES = {
 *   2: (estado) => ({
 *     ...estado,
 *     emails: {
 *       ...estado.emails,
 *       alertados: Object.fromEntries(
 *         Object.entries(estado.emails.alertados).map(([id, cuando]) => [id, { cuando, veces: 1 }]),
 *       ),
 *     },
 *   }),
 * };
 */
const MIGRACIONES = {};

/**
 * Aplica al estado las migraciones que le falten, en orden de versión. Los estados
 * guardados sin `version` se dan por la 1. Devuelve un estado nuevo, sin tocar el
 * recibido. `migraciones` solo se sustituye en los tests.
 */
export function migrarEstado(estado, migraciones = MIGRACIONES) {
  if (!esObjeto(estado)) return estado;
  let version = Number.isInteger(estado.version) ? estado.version : 1;
  let migrado = estado;
  for (const destino of Object.keys(migraciones).map(Number).sort((a, b) => a - b)) {
    if (destino <= version) continue;
    migrado = migraciones[destino](migrado);
    version = destino;
  }
  return { ...migrado, version };
}

function problemasEmails(emails) {
  if (!esObjeto(emails)) return ['emails debe ser un objeto'];
  const problemas = [];
  if (typeof emails.inicializado !== 'boolean') problemas.push('emails.inicializado debe ser true o false');
  if (emails.resumenEnviado !== null && typeof emails.resumenEnviado !== 'string') {
    problemas.push('emails.resumenEnviado debe ser una fecha YYYY-MM-DD o null');
  }
  for (const campo of ['alertados', 'vigilados', 'fuentesCaidas']) {
    if (!esObjeto(emails[campo])) problemas.push(`emails.${campo} debe ser un objeto`);
  }
  if (!esObjeto(emails.enviosHoy) || typeof emails.enviosHoy.n !== 'number') {
    problemas.push('emails.enviosHoy debe ser {fecha, n}');
  }
  return problemas;
}

/** Lista de problemas del estado (vacía si se puede usar tal cual). */
export function validarEstado(estado) {
  if (!esObjeto(estado)) return ['el estado no es un objeto'];
  const problemas = [];
  if (!Number.isInteger(estado.version) || estado.version < 1) {
    problemas.push(`version no válida: ${estado.version}`);
  } else if (estado.version > VERSION_ESTADO) {
    problemas.push(`estado de una versión más nueva (${estado.version} > ${VERSION_ESTADO}): no se sabe leer`);
  }
  if (!esObjeto(estado.ofertas)) problemas.push('ofertas debe ser un objeto {id: oferta}');
  if (!esObjeto(estado.fuentes)) problemas.push('fuentes debe ser un objeto {id: estado de la fuente}');
  problemas.push(...problemasEmails(estado.emails));
  return problemas;
}

/**
 * Lee `data/estado.json`, lo migra y lo valida. Si no existe, el JSON está roto o el
 * estado no cumple el contrato, avisa y empieza de cero: unos datos corruptos no
 * deben parar el vigilante (la copia anterior queda en `<ruta>.bak`).
 */
export function cargarEstado(ruta, { log = console.warn } = {}) {
  const deCero = (motivo) => {
    log(`⚠️  ${ruta}: ${motivo}. Se empieza de cero (la copia anterior está en ${ruta}.bak)`);
    return estadoInicial();
  };
  let estado;
  try {
    estado = migrarEstado(cargarJson(ruta, estadoInicial()));
  } catch (error) {
    return deCero(`no se puede leer (${error.message})`);
  }
  const problemas = validarEstado(estado);
  return problemas.length ? deCero(`estado no válido (${problemas.join('; ')})`) : estado;
}

/** Lee un JSON; si el archivo no existe devuelve una copia de `porDefecto`. */
export function cargarJson(ruta, porDefecto) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && porDefecto !== undefined) return structuredClone(porDefecto);
    throw error;
  }
}

/** Copia de seguridad del archivo que se va a sustituir (solo se guarda la última). */
function respaldar(ruta) {
  try {
    copyFileSync(ruta, `${ruta}.bak`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/**
 * Escribe un JSON de forma atómica (archivo temporal y después renombrar), dejando
 * en `<ruta>.bak` el contenido anterior por si el nuevo saliera corrupto.
 */
export function guardarJson(ruta, datos, { legible = false } = {}) {
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(datos, null, legible ? 2 : 0)}\n`);
  respaldar(ruta);
  renameSync(temporal, ruta);
}

/**
 * Incorpora el resultado de una fuente: conserva `vistaPrimera`, actualiza
 * `vistaUltima` y, con `reemplazar`, borra las ofertas de la fuente que ya no aparecen.
 * @returns {{nuevas: number, total: number, borradas: number}}
 */
export function fusionar(estado, fuenteId, { ofertas, reemplazar = false }, ahora) {
  const iso = ahora.toISOString();
  const recibidas = new Set(ofertas.map((o) => o.id));
  let borradas = 0;
  if (reemplazar) {
    const debeBorrarse = typeof reemplazar === 'function' ? reemplazar : () => true;
    for (const [id, oferta] of Object.entries(estado.ofertas)) {
      if (oferta.fuente === fuenteId && !recibidas.has(id) && debeBorrarse(oferta)) {
        delete estado.ofertas[id];
        borradas++;
      }
    }
  }
  let nuevas = 0;
  for (const oferta of ofertas) {
    const previa = estado.ofertas[oferta.id];
    if (!previa) nuevas++;
    estado.ofertas[oferta.id] = { ...oferta, vistaPrimera: previa?.vistaPrimera ?? iso, vistaUltima: iso };
  }
  return { nuevas, total: ofertas.length, borradas };
}

/**
 * Quita las ofertas caducadas, las que salen en una fecha ya pasada y las que no
 * se ven desde hace más de `retencionDias`. Devuelve cuántas ha quitado.
 */
export function podar(estado, ahora, { retencionDias }) {
  const hoy = fechaLocal(ahora);
  const limiteVista = ahora.getTime() - retencionDias * DIA_MS;
  let quitadas = 0;
  for (const [id, oferta] of Object.entries(estado.ofertas)) {
    const caducada = oferta.caduca && Date.parse(oferta.caduca) < ahora.getTime();
    const yaSalio = oferta.fechas?.salida && oferta.fechas.salida.slice(0, 10) < hoy;
    const olvidada = Date.parse(oferta.vistaUltima) < limiteVista;
    if (caducada || yaSalio || olvidada) {
      delete estado.ofertas[id];
      quitadas++;
    }
  }
  return quitadas;
}
