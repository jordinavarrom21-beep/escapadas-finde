/**
 * La política de vigencia del panel y las guías (site/js/vigencia.js): qué oferta está vigente, cuál «sin confirmar»
 * y cuál caducada, la misma en el panel y en las guías.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { caducada, claseVigencia, horasLimite, repartir, vigencia } from '../site/js/vigencia.js';
import { resultadosEscapadas } from '../site/js/vistas.js';
import { estadoPanel } from './ayudas-panel.js';

const REVISION = new Date('2026-10-08T12:00:00Z');
const hace = (h) => new Date(REVISION.getTime() - h * 3_600_000).toISOString();
const ctx = { ahora: REVISION, revision: REVISION, intervalos: new Map([['rapida', 30], ['diaria', 1440]]) };
const oferta = (extra = {}) => ({ id: 'x', fuente: 'rapida', tipo: 'hotel', fechas: { salida: null }, vistaUltima: hace(1), ...extra });

describe('vigencia de las ofertas', () => {
  it('el límite depende del tipo: vuelos y billetes 24 h, alojamientos 48 h, actividades 72 h', () => {
    assert.equal(claseVigencia(oferta({ tipo: 'vuelo' })), 'vuelo');
    assert.equal(claseVigencia(oferta({ tipo: 'escapada', transporte: 'tren', unidad: 'trayecto' })), 'transporte');
    assert.equal(claseVigencia(oferta({ tipo: 'actividad' })), 'actividad');
    assert.equal(claseVigencia(oferta({ tipo: 'paquete' })), 'alojamiento');
    assert.equal(vigencia(oferta({ tipo: 'vuelo', vistaUltima: hace(23) }), ctx), 'vigente');
    assert.equal(vigencia(oferta({ tipo: 'vuelo', vistaUltima: hace(25) }), ctx), 'sin-confirmar');
    assert.equal(vigencia(oferta({ vistaUltima: hace(47) }), ctx), 'vigente');
    assert.equal(vigencia(oferta({ vistaUltima: hace(49) }), ctx), 'sin-confirmar');
    assert.equal(vigencia(oferta({ tipo: 'actividad', vistaUltima: hace(70) }), ctx), 'vigente');
    assert.equal(vigencia(oferta({ tipo: 'actividad', vistaUltima: hace(73) }), ctx), 'sin-confirmar');
  });

  it('con el viaje en los próximos 3 días, como mucho 12 h; y nunca menos de 2 revisiones de su web + 1 h', () => {
    const pronto = oferta({ fechas: { salida: '2026-10-10' } });
    assert.equal(horasLimite(pronto, ctx), 12);
    assert.equal(vigencia({ ...pronto, vistaUltima: hace(13) }, ctx), 'sin-confirmar');
    assert.equal(horasLimite(oferta({ fechas: { salida: '2026-10-30' } }), ctx), 48);
    // Una web que se lee una vez al día: 49 h aunque el viaje sea pronto.
    assert.equal(horasLimite({ ...pronto, fuente: 'diaria' }, ctx), 49);
  });

  it('caducada: fecha de fin o de salida ya pasada (no se enseña en ningún sitio)', () => {
    assert.equal(caducada(oferta({ caduca: '2026-10-08T10:00:00Z' }), REVISION), true);
    assert.equal(caducada(oferta({ fechas: { salida: '2026-10-07' } }), REVISION), true);
    assert.equal(caducada(oferta({ tipo: 'vuelo', vuelo: { ida: { salida: '2026-10-07T20:00:00' } } }), REVISION), true);
    assert.equal(caducada(oferta({ fechas: { salida: '2026-10-08' } }), REVISION), false, 'hoy aún vale');
    assert.equal(vigencia(oferta({ caduca: '2026-10-01T00:00:00Z', vistaUltima: hace(1) }), ctx), 'caducada');
  });

  it('se mide hasta la hora del escaneo: si el escaneo se retrasa, no caduca todo a la vez', () => {
    const tarde = { ...ctx, ahora: new Date(REVISION.getTime() + 72 * 3_600_000) };
    assert.equal(vigencia(oferta({ vistaUltima: hace(2) }), tarde), 'vigente');
  });

  it('repartir: cada una en su grupo, en el mismo orden', () => {
    const r = repartir([oferta({ id: 'a' }), oferta({ id: 'b', vistaUltima: hace(60) }), oferta({ id: 'c', caduca: '2026-10-01T00:00:00Z' }), oferta({ id: 'd' })], ctx);
    assert.deepEqual(r.vigentes.map((o) => o.id), ['a', 'd']);
    assert.deepEqual(r.sinConfirmar.map((o) => o.id), ['b']);
    assert.deepEqual(r.caducadas.map((o) => o.id), ['c']);
  });
});

describe('las «sin confirmar» en el panel', () => {
  it('no cuentan; el aviso dice cuántas cumplirían los filtros y deja verlas al final', () => {
    const e = estadoPanel();
    const [vieja, ...resto] = e.datos.ofertas.filter((o) => o.tipo !== 'vuelo' && o.tipo !== 'actividad');
    const estado = { ...e, datos: { ...e.datos, ofertas: resto, sinConfirmar: [vieja], todas: [...resto, vieja] } };
    const sin = resultadosEscapadas(estado, {});
    assert.match(sin, /1 oferta más está sin confirmar: su web no la ha vuelto a mostrar en el tiempo previsto, así que no se cuenta\. <a href="#\/escapadas\?sinconf=1">Verla al final/);
    assert.ok(!sin.includes(`data-ficha="${vieja.id}"`), 'no sale en la lista');
    const con = resultadosEscapadas(estado, { sinconf: '1' });
    assert.ok(con.includes(`data-ficha="${vieja.id}"`), 'pedidas, salen');
    assert.match(con, /Incluidas al final las que su web no ha vuelto a mostrar/);
  });
});
