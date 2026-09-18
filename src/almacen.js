/**
 * Estado persistente entre ejecuciones (data/estado.json): ofertas vistas, estado
 * de cada fuente y control de emails enviados.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fechaLocal } from './util/fechas.js';

const DIA_MS = 24 * 60 * 60 * 1000;

export function estadoInicial() {
  return {
    version: 1,
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

/** Lee un JSON; si el archivo no existe devuelve una copia de `porDefecto`. */
export function cargarJson(ruta, porDefecto) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && porDefecto !== undefined) return structuredClone(porDefecto);
    throw error;
  }
}

/** Escribe un JSON de forma atómica (archivo temporal y después renombrar). */
export function guardarJson(ruta, datos, { legible = false } = {}) {
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(datos, null, legible ? 2 : 0)}\n`);
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
