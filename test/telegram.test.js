/**
 * Canales públicos de Telegram (src/fuentes/telegram.js) con sus páginas reales del
 * 5 de octubre de 2026 (t.me/s/<canal>, sin scripts ni estilos).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FUENTES } from '../src/fuentes/index.js';
import { escapadabarata, exprimeviajes, fechasDe, parsearCanal } from '../src/fuentes/telegram.js';
import { validarOferta } from '../src/modelo.js';
import { crearCtx } from './ayudas.js';

const leer = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');
const EXPRIME = leer('telegram-exprimeviajes.html');
const ESCAPADA = leer('telegram-escapadabarata.html');
const AHORA = new Date('2026-10-05T15:00:00Z');
const contexto = () => ({ logs: [], log(m) { this.logs.push(m); }, ahora: AHORA });

describe('Telegram: Exprime Viajes', () => {
  const ofertas = parsearCanal(EXPRIME, { id: 'exprimeviajes', hosts: ['exprimeviajes.com'], tipo: 'paquete' }, contexto());
  it('una oferta por mensaje con precio, todas válidas y con el enlace del botón «IR A OFERTA» sin utm', () => {
    assert.equal(ofertas.length, 19);
    for (const o of ofertas) {
      assert.deepEqual(validarOferta(o), [], o.id);
      assert.match(o.url, /^https:\/\/exprimeviajes\.com\//);
      assert.doesNotMatch(o.url, /utm_/);
      assert.match(o.id, /^exprimeviajes:\d+$/);
    }
  });
  it('tipo, precio y lugar del titular', () => {
    const malé = ofertas.find((o) => /Malé/.test(o.titulo));
    assert.deepEqual([malé.tipo, malé.precio, malé.unidad, malé.lugar?.nombre, malé.transporte], ['vuelo', 576, 'i/v', 'Malé', 'avion']);
    const berlin = ofertas.find((o) => /Berlín/.test(o.titulo));
    assert.deepEqual([berlin.tipo, berlin.precio, berlin.noches], ['paquete', 150, 2]);
    const alicante = ofertas.find((o) => /Alicante/.test(o.titulo));
    assert.deepEqual([alicante.tipo, alicante.precio, alicante.unidad], ['hotel', 112, 'noche']);
    const corea = ofertas.find((o) => /Corea/.test(o.titulo));
    assert.equal(corea.tipo, 'paquete', 'un circuito de 11 días con vuelos no es solo un vuelo');
  });
});

describe('Telegram: Escapada Barata', () => {
  const ctx = contexto();
  const ofertas = parsearCanal(ESCAPADA, { id: 'escapadabarata', hosts: ['t.eeny.it', 'ebarata.com'], tipo: 'hotel' }, ctx);
  it('solo los chollos: fuera los «#clip» de destinos y la publicidad de otros canales', () => {
    assert.equal(ofertas.length, 10);
    assert.ok(ofertas.every((o) => !/Descubre|CHOLLOS ÉPICOS/i.test(o.titulo)));
    for (const o of ofertas) assert.deepEqual(validarOferta(o), [], o.id);
  });
  it('fechas cerradas «del 10/12 al 13/12» con su precio de toda la estancia y el enlace tras «Enlace:»', () => {
    const navarra = ofertas.find((o) => /Navarra/.test(o.titulo));
    assert.deepEqual(navarra.fechas.salida, '2026-12-10');
    assert.deepEqual(navarra.fechas.vuelta, '2026-12-13');
    assert.deepEqual([navarra.tipo, navarra.precio, navarra.unidad, navarra.noches, navarra.lugar?.nombre], ['hotel', 158, 'total', 3, 'Longida']);
    assert.match(navarra.url, /^https:\/\/t\.eeny\.it\//);
    assert.match(navarra.titulo, /^¡Navarra en diciembre/);
    assert.doesNotMatch(navarra.titulo, /#/);
    const ferrol = ofertas.find((o) => /Ferrol/.test(o.titulo));
    assert.match(ferrol.url, /t\.eeny\.it/, 'el de la oferta, no el de la visita de Civitatis que va antes');
  });
  it('con vuelo incluido es un paquete', () => {
    const lisboa = ofertas.find((o) => /Lisboa/.test(o.titulo));
    assert.equal(lisboa.tipo, 'paquete');
  });
});

describe('Telegram: fechas y fuente', () => {
  it('fechasDe: el año de la próxima vez que caen así, y el cambio de año', () => {
    assert.deepEqual(fechasDe('3 noches del 10/12 al 13/12 por 158 €', '2026-10-05'), { salida: '2026-12-10', vuelta: '2026-12-13' });
    assert.deepEqual(fechasDe('del 28/12 al 02/01', '2026-10-05'), { salida: '2026-12-28', vuelta: '2027-01-02' });
    assert.deepEqual(fechasDe('del 14/03 al 16/03', '2026-10-05'), { salida: '2027-03-14', vuelta: '2027-03-16' });
    assert.equal(fechasDe('hasta diciembre', '2026-10-05'), null);
    assert.equal(fechasDe('del 40/13 al 2/1', '2026-10-05'), null);
  });
  it('pide la vista pública del canal y falla claro si la página no es de un canal', async () => {
    const { ctx, peticiones } = crearCtx({ respuestas: () => EXPRIME, ahora: AHORA });
    const { ofertas } = await exprimeviajes.obtener(ctx);
    assert.deepEqual(peticiones, ['https://t.me/s/exprimeviajes_ofertas']);
    assert.ok(ofertas.length > 10);
    const { ctx: otro } = crearCtx({ respuestas: () => '<html><body>Not found</body></html>' });
    await assert.rejects(escapadabarata.obtener(otro), /vista pública de un canal/);
  });
  it('están en la lista de fuentes con su web de Telegram', () => {
    for (const id of ['exprimeviajes', 'escapadabarata']) {
      const fuente = FUENTES.find((f) => f.id === id);
      assert.ok(fuente, id);
      assert.match(fuente.web, /^https:\/\/t\.me\//);
      assert.equal(fuente.modo, 'feed');
    }
  });
});
