/**
 * El finde o el puente elegido es el mismo en todas las pestañas de Explorar, y lo que tiene
 * fechas cerradas dice si cabe en él o se sale (sale antes, vuelve después).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { conPeriodo, encajeEnRango, leerFiltrosEscapadas, periodoDeParams, rangoDe } from '../site/js/filtros.js';
import { etiquetaFinde, etiquetaPuente } from '../site/js/vistas-comun.js';

const FINDE = { id: '2026-10-09', viernes: '2026-10-09', sabado: '2026-10-10', domingo: '2026-10-11', etiqueta: '9–11 oct', puenteId: '2026-10-10' };
const PUENTE = { id: '2026-10-10', nombre: 'Fiesta Nacional', desde: '2026-10-10', hasta: '2026-10-12', etiqueta: '10–12 oct' };
const ctx = { finde: { id: '2026-10-02', viernes: '2026-10-02', domingo: '2026-10-04' }, findes: [FINDE], puente: PUENTE, puentes: [PUENTE] };
const viaje = (salida, vuelta) => ({ fechas: { salida: `${salida}T13:10:00`, vuelta: `${vuelta}T10:45:00` } });

describe('periodo elegido', () => {
  it('un finde va de viernes a domingo y un puente de su primer a su último día', () => {
    assert.deepEqual(rangoDe('2026-10-09', ctx), { id: '2026-10-09', tipo: 'finde', inicio: '2026-10-09', fin: '2026-10-11' });
    assert.deepEqual(rangoDe('puente', ctx), { id: '2026-10-10', tipo: 'puente', inicio: '2026-10-10', fin: '2026-10-12' });
    assert.equal(rangoDe('', ctx), null);
  });

  it('el puente 10–12 y el finde 9–11 ya no son lo mismo: cada vuelo dice si cabe o en qué se sale', () => {
    const puente = rangoDe('2026-10-10', ctx);
    const finde = rangoDe('2026-10-09', ctx);
    assert.deepEqual(encajeEnRango(viaje('2026-10-10', '2026-10-12'), puente), { cabe: true, motivos: [] });
    assert.deepEqual(encajeEnRango(viaje('2026-10-09', '2026-10-11'), puente), { cabe: false, motivos: ['sale un día antes'] });
    assert.deepEqual(encajeEnRango(viaje('2026-10-09', '2026-10-11'), finde), { cabe: true, motivos: [] });
    assert.deepEqual(encajeEnRango(viaje('2026-10-10', '2026-10-12'), finde), { cabe: false, motivos: ['vuelve un día después'] });
    assert.equal(encajeEnRango({ fechas: {} }, finde), null, 'las flexibles no se juzgan');
  });

  it('«solo si caben enteras» quita las de fechas cerradas que se salen y deja las flexibles', async () => {
    const { buscarEscapadas } = await import('../site/js/filtros.js');
    const base = { tipo: 'hotel', temas: [], puntuacion: 50, precio: 100, etiquetas: [], lugar: { nombre: 'X' } };
    const ofertas = [
      { ...base, id: 'cabe', fechas: { salida: '2026-10-10', vuelta: '2026-10-12', puenteId: '2026-10-10' } },
      { ...base, id: 'antes', fechas: { salida: '2026-10-09', vuelta: '2026-10-11', puenteId: '2026-10-10' } },
      { ...base, id: 'flexible', fechas: {} },
    ];
    const ids = (p) => buscarEscapadas(ofertas, leerFiltrosEscapadas(p), { ...ctx, origen: { lat: 41.39, lon: 2.17 } }).ofertas.map((o) => o.id).sort();
    assert.deepEqual(ids({ cuando: '2026-10-10' }), ['antes', 'cabe', 'flexible']);
    assert.deepEqual(ids({ cuando: '2026-10-10', encaje: '1' }), ['cabe', 'flexible']);
  });
});

describe('el mismo periodo en todas las pestañas', () => {
  it('el puente de Escapadas abre ese puente en Vuelos (no el finde 9–11) y vuelve igual', () => {
    const periodo = periodoDeParams('escapadas', { cuando: '2026-10-10', temas: 'spa' });
    assert.deepEqual(conPeriodo('vuelos', { finde: '2026-10-09', aero: 'BCN' }, periodo, ctx), { aero: 'BCN', finde: '2026-10-10' });
    const desdeVuelos = periodoDeParams('vuelos', { finde: '2026-10-10' });
    assert.deepEqual(conPeriodo('escapadas', { cuando: 'finde', temas: 'spa' }, desdeVuelos, ctx), { temas: 'spa', cuando: '2026-10-10' });
  });

  it('«este finde» y «el puente» se traducen al id para Vuelos; Planes y Mapa usan «cuando»', () => {
    assert.deepEqual(conPeriodo('vuelos', {}, { cuando: 'puente', desde: '', hasta: '' }, ctx), { finde: '2026-10-10' });
    assert.deepEqual(conPeriodo('vuelos', {}, { cuando: 'finde', desde: '', hasta: '' }, ctx), { finde: '2026-10-02' });
    assert.deepEqual(conPeriodo('actividades', { gratis: '1' }, { cuando: 'puente', desde: '', hasta: '' }, ctx), { gratis: '1', cuando: 'puente' });
    assert.deepEqual(conPeriodo('mapa', { cuando: 'finde' }, { cuando: '', desde: '2026-10-16', hasta: '2026-10-18' }, ctx), { desde: '2026-10-16', hasta: '2026-10-18' });
    assert.equal(periodoDeParams('calendario', {}), null);
  });
});

describe('etiquetas que no confunden un finde con un puente', () => {
  it('días con nombre y qué parte del puente coge', () => {
    assert.equal(etiquetaFinde(FINDE, [PUENTE]), 'vie 9 – dom 11 oct · vuelve antes del festivo');
    assert.equal(etiquetaFinde({ ...FINDE, puenteId: null }, [PUENTE]), 'vie 9 – dom 11 oct');
    assert.match(etiquetaPuente(PUENTE), /Fiesta Nacional · sáb 10 – lun 12 oct · todo el puente$/);
  });
});
