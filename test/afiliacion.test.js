import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { aplicarAfiliacion, conAfiliacion, proveedoresActivos } from '../src/afiliacion.js';
import { puntuar } from '../src/enriquecer/puntuacion.js';
import { contenidoFicha, tarjeta } from '../site/js/plantillas.js';
import { AJUSTES, oferta } from './ayudas.js';

const CONFIG = JSON.parse(readFileSync(new URL('../config/afiliacion.json', import.meta.url), 'utf8'));
const activa = (extra = {}) => ({ proveedores: { civitatis: { activo: true, aprobado: true, dominios: ['civitatis.com'], parametros: { aid: '123' }, ...extra } } });
const ctx = { temas: new Map(), fuentes: new Map(), favoritos: new Set() };

describe('afiliación', () => {
  it('tal como está en el repo, todo desactivado: ningún proveedor y los enlaces quedan igual', () => {
    assert.deepEqual(proveedoresActivos(CONFIG), []);
    const o = aplicarAfiliacion(oferta({ url: 'https://www.civitatis.com/es/barcelona/visita/' }), { activos: [] });
    assert.equal(o.urlReserva, 'https://www.civitatis.com/es/barcelona/visita/');
    assert.equal(o.afiliado, null);
    const html = tarjeta(o, ctx);
    assert.ok(!html.includes('sponsored') && !html.includes('Enlace de afiliado'));
  });

  it('activo pero sin aprobar o sin identificador no marca nada, y lo avisa', () => {
    const avisos = [];
    assert.deepEqual(proveedoresActivos(activa({ aprobado: false }), (m) => avisos.push(m)), []);
    assert.deepEqual(proveedoresActivos(activa({ parametros: { aid: '' } }), (m) => avisos.push(m)), []);
    assert.equal(avisos.length, 2);
    assert.match(avisos[0], /civitatis.*aprobado: true/);
  });

  it('con la cuenta aprobada añade el identificador conservando los parámetros de la URL', () => {
    const activos = proveedoresActivos(activa());
    assert.deepEqual(conAfiliacion('https://www.civitatis.com/es/buscar/?q=Girona', activos), { url: 'https://www.civitatis.com/es/buscar/?q=Girona&aid=123', afiliado: 'civitatis' });
    assert.equal(conAfiliacion('https://www.booking.com/x', activos).afiliado, null, 'otro dominio, igual');
    assert.equal(conAfiliacion('https://civitatis.com.estafa.es/', activos).afiliado, null, 'un dominio que solo lo contiene no cuenta');
    const o = aplicarAfiliacion(oferta({ url: 'https://www.civitatis.com/es/barcelona/visita/', enlaces: [{ etiqueta: 'Actividades en Civitatis', url: 'https://www.civitatis.com/es/buscar/?q=Sitges' }] }), { activos });
    assert.equal(o.url, 'https://www.civitatis.com/es/barcelona/visita/', 'la url limpia se conserva (duplicados, historial)');
    assert.equal(o.urlReserva, 'https://www.civitatis.com/es/barcelona/visita/?aid=123');
    assert.equal(o.enlaces[0].afiliado, 'civitatis');
    const html = tarjeta(o, ctx);
    assert.match(html, /href="https:\/\/www\.civitatis\.com\/es\/barcelona\/visita\/\?aid=123"[^>]*rel="sponsored noopener noreferrer"/);
    assert.match(html, /🔗 Enlace de afiliado/);
    const ficha = contenidoFicha(o, ctx);
    assert.match(ficha, /Actividades en Civitatis <span class="suave">\(afiliado\)<\/span>/);
    assert.match(ficha, /No cambia tu precio ni el orden de las ofertas/);
  });

  it('una patrocinada se marca y no cambia su puntuación', () => {
    const [normal, pagada] = [oferta({ precio: 50, unidad: 'pp' }), oferta({ precio: 50, unidad: 'pp' })];
    aplicarAfiliacion(pagada, { patrocinadas: [{ ofertaId: pagada.id, anunciante: 'Hotel X' }] });
    aplicarAfiliacion(normal, {});
    puntuar([normal, pagada], AJUSTES);
    assert.equal(pagada.puntuacion, normal.puntuacion);
    assert.deepEqual(pagada.patrocinada, { anunciante: 'Hotel X' });
    assert.match(tarjeta(pagada, ctx), /Patrocinado · Hotel X/);
    assert.match(tarjeta(pagada, ctx), /rel="sponsored/);
    const caducada = aplicarAfiliacion(oferta({}), { patrocinadas: [{ ofertaId: 'x', anunciante: 'Y', hasta: '2000-01-01' }] });
    assert.equal(caducada.patrocinada, null);
  });
});
