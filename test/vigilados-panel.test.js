/**
 * Un aviso por email (src/vigilados.js) tiene que coincidir con lo que enseña el panel para
 * la misma búsqueda: «Copiar como vigilado» guarda los filtros y el escaneo los evalúa. Se
 * comprueba con datos reales del vigilante, filtro a filtro.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buscarActividades, buscarEscapadas, chollosDeVuelos, criterioVigilado, esActividad, esEscapada,
  leerFiltrosActividades, leerFiltrosEscapadas, leerFiltrosVuelos, medirDistancias,
} from '../site/js/filtros.js';
import { proximoPuente } from '../site/js/fechas.js';
import { contextoBusqueda, misAeropuertos } from '../site/js/vistas.js';
import { coincide, contextoVigilados, validarVigilado } from '../src/vigilados.js';

const leidos = JSON.parse(readFileSync(new URL('./fixtures/panel-real/ofertas.json', import.meta.url), 'utf8'));
// La muestra es anterior a que ofertas.json publicara «coche»: se deduce del gasto de coche
// que ya traen las ofertas (el mismo consumo y precio con que lo calculó el escaneo).
const conGasto = leidos.ofertas.find((o) => o.costeCoche?.litros > 0 && o.cocheKm > 0);
const datos = {
  ...leidos,
  coche: leidos.coche ?? {
    consumoL100km: (conGasto.costeCoche.litros * 100) / (2 * conGasto.cocheKm),
    precioLitro: conGasto.costeCoche.eur / conGasto.costeCoche.litros,
  },
};
const AHORA = new Date(datos.generado);
const HOY = datos.generado.slice(0, 10);
const estado = {
  datos, historial: {}, vigilados: [], ahora: AHORA, hoy: HOY, findes: datos.findes.filter((f) => f.domingo >= HOY),
  puente: proximoPuente(datos.puentes, HOY), favoritos: new Set(), descartadas: new Set(), busquedas: [], salto: 0,
  referencia: null, paginas: new Map(), ubicacion: {}, temas: new Map(),
  fuentes: new Map(datos.fuentes.map((f) => [f.id, f.nombre])), porId: new Map(datos.ofertas.map((o) => [o.id, o])),
  distanciasOrigen: medirDistancias(datos.ofertas, null, datos.origen),
};
const ctxPanel = contextoBusqueda(estado);
const ctxAviso = contextoVigilados({ findes: datos.findes, puentes: datos.puentes, origen: datos.origen, ahora: AHORA });

const VISTAS = {
  escapadas: { leer: leerFiltrosEscapadas, buscar: (f) => buscarEscapadas(datos.ofertas, f, ctxPanel).ofertas, base: esEscapada },
  actividades: { leer: leerFiltrosActividades, buscar: (f) => buscarActividades(datos.ofertas, f, ctxPanel), base: esActividad },
  vuelos: { leer: leerFiltrosVuelos, buscar: (f) => chollosDeVuelos(datos.ofertas, f, ctxPanel), base: (o) => o.tipo === 'vuelo' },
};

const CASOS = [
  ['escapadas', {}], ['escapadas', { temas: 'spa,rural' }], ['escapadas', { max: '80' }], ['escapadas', { pnMax: '40' }],
  ['escapadas', { cho: '1' }], ['escapadas', { nota: '8' }], ['escapadas', { regimen: 'media-pension' }], ['escapadas', { aloj: 'casa-rural' }],
  ['escapadas', { noches: '3' }], ['escapadas', { clasica: '1' }], ['escapadas', { region: 'Girona' }], ['escapadas', { cuando: 'finde' }],
  ['escapadas', { cuando: 'puente' }], ['escapadas', { cuando: datos.findes[1].id }], ['escapadas', { desde: '2026-10-16', hasta: '2026-10-18' }],
  ['escapadas', { q: 'costa brava' }], ['escapadas', { q: 'hotel -spa' }], ['escapadas', { h: '2' }], ['escapadas', { km: '100' }],
  ['escapadas', { pres: '150', prespor: 'persona' }], ['escapadas', { ninos: 'ventaja' }], ['escapadas', { sincoche: '1' }],
  ['escapadas', { transporte: 'coche' }], ['escapadas', { est: '4' }], ['escapadas', { cru: '0' }],
  ['actividades', {}], ['actividades', { gratis: '1' }], ['actividades', { q: 'barcelona' }],
  ['vuelos', {}], ['vuelos', { max: '60' }], ['vuelos', { mios: '1' }],
];

describe('los avisos por email encuentran lo mismo que el panel', () => {
  for (const [vista, params] of CASOS) {
    it(`${vista} ${JSON.stringify(params)}`, () => {
      const { leer, buscar, base } = VISTAS[vista];
      // Sin ocultar las descartadas: eso es de cada navegador, no del criterio.
      const panel = buscar(leer({ ...params, sindesc: '0' })).map((o) => o.id).sort();
      const criterio = criterioVigilado('Prueba', leer(params), { vista, viajeros: 2, aeropuertos: misAeropuertos(estado) });
      assert.deepEqual(validarVigilado(criterio), [], JSON.stringify(criterio));
      const aviso = datos.ofertas.filter((o) => base(o) && coincide(o, criterio, ctxAviso)).map((o) => o.id).sort();
      assert.deepEqual(aviso, panel, JSON.stringify(criterio));
    });
  }
});
