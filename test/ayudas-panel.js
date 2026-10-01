/**
 * El estado del panel que construye app.js, sin navegador, con la fixture real y el reloj
 * congelado (viernes 18/09/2026 a las 10:00 de Madrid). Para pruebas de vistas y filtros.
 */
import { readFileSync } from 'node:fs';

import { medirDistancias } from '../site/js/filtros.js';
import { contextoBusqueda } from '../site/js/vistas-comun.js';

const leer = (nombre) => JSON.parse(readFileSync(new URL(`./fixtures/panel/${nombre}`, import.meta.url), 'utf8'));
export const DATOS_PANEL = leer('ofertas.json');
const historial = leer('historial.json');
export const AHORA_PANEL = new Date('2026-09-18T08:00:00Z');
export const HOY_PANEL = '2026-09-18';

export function estadoPanel(d = DATOS_PANEL, extra = {}) {
  return {
    datos: d, historial, vigilados: [], ahora: AHORA_PANEL, hoy: HOY_PANEL, findes: d.findes, puente: d.puentes[0],
    favoritos: new Set(), descartadas: new Set(), busquedas: [], salto: 0,
    referencia: null, paginas: new Map(), ubicacion: {}, temas: new Map(d.temas.map((t) => [t.id, t])),
    fuentes: new Map(d.fuentes.map((f) => [f.id, f.nombre])),
    porId: new Map(d.ofertas.map((o) => [o.id, o])),
    distanciasOrigen: medirDistancias(d.ofertas, null, d.origen),
    viaje: { viajeros: 2, noches: 2 },
    ...extra,
  };
}

export const ctxPanel = (e) => contextoBusqueda(e);
